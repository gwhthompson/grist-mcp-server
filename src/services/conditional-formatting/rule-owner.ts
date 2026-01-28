/**
 * Abstract RuleOwner base class
 *
 * Implements the strategy pattern to encapsulate differences between
 * row, column, and field conditional formatting scopes.
 */

import { ApplyResponseSchema } from '../../schemas/api-responses.js'
import type { ApplyResponse, SQLQueryResponse } from '../../types.js'
import { first } from '../../utils/array-helpers.js'
import { extractFields } from '../../utils/grist-field-extractor.js'
import { validateRetValues } from '../../validators/apply-response.js'
import type { GristClient } from '../grist-client.js'
import { encodeGristList, parseGristJson, parseGristList } from '../rule-utilities.js'
import type {
  OwnerLookupParams,
  RuleContext,
  RuleOwnerConfig,
  RulesAndStyles,
  RulesAndStylesUpdate
} from './types.js'

// Polling configuration for fetchFormulasFromHelperCols
// Grist creates helper columns asynchronously; we poll with exponential backoff
const POLLING_MAX_ATTEMPTS = 20
const POLLING_FAST_THRESHOLD = 5 // Use fast delay for first N attempts
const POLLING_MEDIUM_THRESHOLD = 10 // Use medium delay for next N attempts
const POLLING_DELAY_FAST_MS = 10
const POLLING_DELAY_MEDIUM_MS = 50
const POLLING_DELAY_SLOW_MS = 100

/**
 * Abstract base class for rule owners.
 *
 * Each scope (row, column, field) has a concrete implementation
 * that handles its specific storage location and query patterns.
 */
export abstract class RuleOwner {
  /**
   * Configuration for this rule owner type
   */
  abstract readonly config: RuleOwnerConfig

  /**
   * Get AddEmptyRule action parameters for this scope.
   *
   * AddEmptyRule signature: [tableId, fieldRef, colRef]
   * - Column scope: [tableId, 0, colRef] - creates helper for column
   * - Row scope: [tableId, 0, 0] - creates helper for row (section-level)
   * - Field scope: [tableId, fieldRef, 0] - creates helper for field
   *
   * @param context Rule context with owner reference
   * @returns Tuple of [fieldRef, colRef] for AddEmptyRule action
   */
  abstract getAddEmptyRuleParams(context: RuleContext): [number, number]

  /**
   * Get the owner's reference ID (colRef, sectionRef, or fieldRef).
   *
   * @param client Grist API client
   * @param docId Document ID
   * @param params Lookup parameters specific to the scope
   * @returns Numeric owner reference ID
   */
  abstract getOwnerRef(
    client: GristClient,
    docId: string,
    params: OwnerLookupParams
  ): Promise<number>

  /**
   * Get current rules and styles from the owner record.
   *
   * Uses config.metadataTable and config.styleProperty for the query.
   *
   * @param client Grist API client
   * @param docId Document ID
   * @param ownerRef Owner reference ID
   * @returns Object with helperColRefs array and styles array
   */
  async getRulesAndStyles(
    client: GristClient,
    docId: string,
    ownerRef: number
  ): Promise<RulesAndStyles> {
    const { metadataTable, styleProperty } = this.config

    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT rules, ${styleProperty} FROM ${metadataTable} WHERE id = ?`,
      args: [ownerRef]
    })

    if (response.records.length === 0) {
      return { helperColRefs: [], styles: [] }
    }

    const fields = extractFields(first(response.records, `${metadataTable} rules query`))

    // Parse rules RefList (handles SQL string or REST array)
    const helperColRefs = parseGristList(fields.rules)

    // Parse styleProperty.rulesOptions (handles SQL string or REST object)
    const options = parseGristJson<{ rulesOptions?: Array<Record<string, unknown>> }>(
      fields[styleProperty],
      {}
    )
    const styles = options.rulesOptions ?? []

    return { helperColRefs, styles }
  }

  /**
   * Update the owner's rules and styles.
   *
   * Uses config.metadataTable and config.styleProperty for the update.
   *
   * @param client Grist API client
   * @param docId Document ID
   * @param ownerRef Owner reference ID
   * @param update New rules and styles to set
   */
  async updateRulesAndStyles(
    client: GristClient,
    docId: string,
    ownerRef: number,
    update: RulesAndStylesUpdate
  ): Promise<void> {
    const { metadataTable, styleProperty, scopeName } = this.config

    // Get current options to preserve other settings
    const fullOptionsResp = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT ${styleProperty} FROM ${metadataTable} WHERE id = ?`,
      args: [ownerRef]
    })

    const currentOptions =
      fullOptionsResp.records.length > 0
        ? parseGristJson<Record<string, unknown>>(
            extractFields(first(fullOptionsResp.records, `${scopeName} options query`))[
              styleProperty
            ],
            {}
          )
        : {}

    // Merge updated rulesOptions
    const updatedOptions = {
      ...currentOptions,
      rulesOptions: update.styles
    }

    // Update metadata
    const response = await client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [
        [
          'UpdateRecord',
          metadataTable,
          ownerRef,
          {
            rules: encodeGristList(update.helperColRefs),
            [styleProperty]: JSON.stringify(updatedOptions)
          }
        ]
      ],
      {
        schema: ApplyResponseSchema,
        context: `Updating ${scopeName} conditional rules`
      }
    )

    validateRetValues(response, { context: `Updating ${scopeName} conditional rules` })
  }

  /**
   * Predict the next helper column name using Grist's naming logic.
   *
   * Mirrors `_maybe_add_suffix` from sandbox/grist/identifiers.py:
   * - Try base name first (e.g., `gristHelper_ConditionalRule`)
   * - If taken, try numbered variants: `...Rule2`, `...Rule3`, etc.
   *
   * This handles deletion gaps correctly - if rule 1 is deleted,
   * the base name becomes available again.
   *
   * @param client Grist API client
   * @param docId Document ID
   * @param tableId Table ID
   * @returns Predicted helper column name
   */
  async predictNextHelperColId(
    client: GristClient,
    docId: string,
    tableId: string
  ): Promise<string> {
    const baseName = this.config.helperColumnPrefix

    // Query existing helper columns for this scope
    const response = await client.post<{
      records: Array<{ id: number; fields?: { colId?: string }; colId?: string }>
    }>(`/docs/${docId}/sql`, {
      sql: `SELECT c.colId
            FROM _grist_Tables_column c
            JOIN _grist_Tables t ON c.parentId = t.id
            WHERE t.tableId = ?
            AND c.colId LIKE ?`,
      args: [tableId, `${baseName}%`]
    })

    const existingNames = new Set(
      response.records.map((r) => {
        const colId = r.fields?.colId ?? r.colId
        return typeof colId === 'string' ? colId.toUpperCase() : ''
      })
    )

    // Try base name first
    if (!existingNames.has(baseName.toUpperCase())) {
      return baseName
    }

    // Try numbered variants
    let num = 2
    while (existingNames.has(`${baseName}${num}`.toUpperCase())) {
      num++
    }
    return `${baseName}${num}`
  }

  /**
   * Get formulas from helper columns.
   *
   * @param client Grist API client
   * @param docId Document ID
   * @param helperColRefs Array of helper column references
   * @returns Array of formulas (parallel to helperColRefs)
   */
  async getHelperColumnFormulas(
    client: GristClient,
    docId: string,
    helperColRefs: readonly number[]
  ): Promise<string[]> {
    if (helperColRefs.length === 0) {
      return []
    }

    // Retry metadata query until all helper columns are visible
    let response: {
      records: Array<{ id: number; fields?: { formula?: string | null }; formula?: string | null }>
    }

    for (let attempt = 0; attempt < POLLING_MAX_ATTEMPTS; attempt++) {
      // Add cache-busting parameter
      response = await client.get<{
        records: Array<{
          id: number
          fields?: { formula?: string | null }
          formula?: string | null
        }>
      }>(`/docs/${docId}/tables/_grist_Tables_column/records`, {
        params: { _: Date.now().toString() }
      })

      // Check if all colRefs have formulas
      const foundWithFormulas = helperColRefs.filter((colRef) => {
        const rec = response.records.find((r) => r.id === colRef)
        const formula = rec?.fields?.formula ?? rec?.formula
        return formula !== null && formula !== undefined && formula !== ''
      }).length

      if (foundWithFormulas === helperColRefs.length) {
        break
      }

      // Exponential backoff
      const delay =
        attempt < POLLING_FAST_THRESHOLD
          ? POLLING_DELAY_FAST_MS
          : attempt < POLLING_MEDIUM_THRESHOLD
            ? POLLING_DELAY_MEDIUM_MS
            : POLLING_DELAY_SLOW_MS
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    // Map formulas in order of helperColRefs
    return helperColRefs.map((colRef) => {
      const rec = response.records.find((r) => r.id === colRef)
      const formula = rec?.fields?.formula ?? rec?.formula
      return formula ?? ''
    })
  }
}
