/**
 * RowRuleOwner - handles row-scoped conditional formatting
 *
 * Row rules apply to entire rows in the Raw Data view.
 * Rules are stored in _grist_Views_section.rules (RefList) via rawViewSectionRef
 * Styles are stored in _grist_Views_section.options (JSON object, not widgetOptions)
 *
 * Note: Row rules use a different helper column prefix: gristHelper_RowConditionalRule
 */

import type { SQLQueryResponse } from '../../types.js'
import { first } from '../../utils/array-helpers.js'
import { extractFields } from '../../utils/grist-field-extractor.js'
import type { GristClient } from '../grist-client.js'
import { parseGristJson } from '../rule-utilities.js'
import { RuleOwner } from './rule-owner.js'
import type { OwnerLookupParams, RuleContext, RuleOwnerConfig } from './types.js'

export class RowRuleOwner extends RuleOwner {
  readonly config: RuleOwnerConfig = {
    metadataTable: '_grist_Views_section',
    rulesProperty: 'rules',
    styleProperty: 'options',
    stylesInWidgetOptions: false, // Row rules store styles in options, not widgetOptions
    helperColumnPrefix: 'gristHelper_RowConditionalRule',
    scopeName: 'row'
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
        `Table "${params.tableId}" not found. Use grist_get_tables to list available tables.`
      )
    }

    const fields = extractFields(first(response.records, `Table "${params.tableId}"`))
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
      extractFields(first(response.records, 'Row section options for styles')).options,
      {}
    )
  }
}
