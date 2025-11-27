/**
 * RowRuleOwner - handles row-scoped conditional formatting
 *
 * Row rules apply to entire rows in the Raw Data view.
 * Rules are stored in _grist_Views_section.rules (RefList) via rawViewSectionRef
 * Styles are stored in _grist_Views_section.options (JSON object, not widgetOptions)
 *
 * Note: Row rules use a different helper column prefix: gristHelper_RowConditionalRule
 */

import { ApplyResponseSchema } from '../../schemas/api-responses.js'
import type { ApplyResponse, SQLQueryResponse } from '../../types.js'
import { extractFields } from '../../utils/grist-field-extractor.js'
import { validateRetValues } from '../../validators/apply-response.js'
import type { GristClient } from '../grist-client.js'
import {
  encodeGristList,
  parseGristJson,
  parseGristList
} from '../rule-utilities.js'
import { RuleOwner } from './rule-owner.js'
import type {
  OwnerLookupParams,
  RuleContext,
  RuleOwnerConfig,
  RulesAndStyles,
  RulesAndStylesUpdate
} from './types.js'

export class RowRuleOwner extends RuleOwner {
  readonly config: RuleOwnerConfig = {
    metadataTable: '_grist_Views_section',
    rulesProperty: 'rules',
    styleProperty: 'options',
    stylesInWidgetOptions: false, // Row rules store styles in options, not widgetOptions
    helperColumnPrefix: 'gristHelper_RowConditionalRule'
  }

  /**
   * Row rules: AddEmptyRule with [tableId, 0, 0]
   * Both fieldRef and colRef are 0 for section-level (row) rules
   */
  getAddEmptyRuleParams(_context: RuleContext): [number, number] {
    return [0, 0]
  }

  /**
   * Get rawViewSectionRef for the table.
   *
   * Row rules are stored on the Raw Data view section for the table.
   * This is accessed via _grist_Tables.rawViewSectionRef.
   */
  async getOwnerRef(
    client: GristClient,
    docId: string,
    params: OwnerLookupParams
  ): Promise<number> {
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT rawViewSectionRef
            FROM _grist_Tables
            WHERE tableId = ?`,
      args: [params.tableId]
    })

    if (response.records.length === 0) {
      throw new Error(
        `Table "${params.tableId}" not found. ` +
          `Use grist_get_tables to list available tables.`
      )
    }

    const fields = extractFields(response.records[0])
    const rawViewSectionRef = fields.rawViewSectionRef

    if (typeof rawViewSectionRef !== 'number' || rawViewSectionRef <= 0) {
      throw new Error(
        `Table "${params.tableId}" has no rawViewSectionRef. ` +
          `This may indicate a corrupt table metadata state.`
      )
    }

    return rawViewSectionRef
  }

  /**
   * Get rules and styles from view section metadata
   */
  async getRulesAndStyles(
    client: GristClient,
    docId: string,
    ownerRef: number
  ): Promise<RulesAndStyles> {
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT rules, options
            FROM _grist_Views_section
            WHERE id = ?`,
      args: [ownerRef]
    })

    if (response.records.length === 0) {
      return { helperColRefs: [], styles: [] }
    }

    const fields = extractFields(response.records[0])

    // Parse rules RefList (handles SQL string or REST array)
    const helperColRefs = parseGristList(fields.rules)

    // Parse options.rulesOptions (handles SQL string or REST object)
    // Note: Row rules use 'options', not 'widgetOptions'
    const options = parseGristJson<{ rulesOptions?: Array<Record<string, unknown>> }>(
      fields.options,
      {}
    )
    const styles = options.rulesOptions ?? []

    return { helperColRefs, styles }
  }

  /**
   * Update rules and styles on view section metadata
   */
  async updateRulesAndStyles(
    client: GristClient,
    docId: string,
    ownerRef: number,
    update: RulesAndStylesUpdate
  ): Promise<void> {
    // Get current options to preserve other settings
    const fullOptionsResp = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT options FROM _grist_Views_section WHERE id = ?`,
      args: [ownerRef]
    })

    const currentOptions =
      fullOptionsResp.records.length > 0
        ? parseGristJson<Record<string, unknown>>(
            extractFields(fullOptionsResp.records[0]).options,
            {}
          )
        : {}

    // Merge updated rulesOptions
    const updatedOptions = {
      ...currentOptions,
      rulesOptions: update.styles
    }

    // Update section metadata
    const response = await client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [
        [
          'UpdateRecord',
          '_grist_Views_section',
          ownerRef,
          {
            rules: encodeGristList(update.helperColRefs),
            options: JSON.stringify(updatedOptions)
          }
        ]
      ],
      {
        schema: ApplyResponseSchema,
        context: 'Updating row conditional rules'
      }
    )

    validateRetValues(response, { context: 'Updating row conditional rules' })
  }

  /**
   * Get fresh options via SQL query (avoids REST API caching issues)
   */
  async getOptionsFresh(
    client: GristClient,
    docId: string,
    sectionRef: number
  ): Promise<Record<string, unknown>> {
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT options FROM _grist_Views_section WHERE id = ?`,
      args: [sectionRef]
    })

    if (response.records.length === 0) {
      return {}
    }

    return parseGristJson<Record<string, unknown>>(
      extractFields(response.records[0]).options,
      {}
    )
  }
}
