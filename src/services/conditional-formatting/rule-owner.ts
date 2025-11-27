/**
 * Abstract RuleOwner base class
 *
 * Implements the strategy pattern to encapsulate differences between
 * row, column, and field conditional formatting scopes.
 */

import type { GristClient } from '../grist-client.js'
import type {
  OwnerLookupParams,
  RuleContext,
  RuleOwnerConfig,
  RulesAndStyles,
  RulesAndStylesUpdate
} from './types.js'

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
   * @param client Grist API client
   * @param docId Document ID
   * @param ownerRef Owner reference ID
   * @returns Object with helperColRefs array and styles array
   */
  abstract getRulesAndStyles(
    client: GristClient,
    docId: string,
    ownerRef: number
  ): Promise<RulesAndStyles>

  /**
   * Update the owner's rules and styles.
   *
   * @param client Grist API client
   * @param docId Document ID
   * @param ownerRef Owner reference ID
   * @param update New rules and styles to set
   */
  abstract updateRulesAndStyles(
    client: GristClient,
    docId: string,
    ownerRef: number,
    update: RulesAndStylesUpdate
  ): Promise<void>

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

    for (let attempt = 0; attempt < 20; attempt++) {
      // Add cache-busting parameter
      response = await client.get<{
        records: Array<{ id: number; fields?: { formula?: string | null }; formula?: string | null }>
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
      const delay = attempt < 5 ? 10 : attempt < 10 ? 50 : 100
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
