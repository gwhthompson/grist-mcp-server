/**
 * ColumnRuleOwner - handles column-scoped conditional formatting
 *
 * Column rules apply to all cells in a column across ALL views.
 * Rules are stored in _grist_Tables_column.rules (RefList)
 * Styles are stored in _grist_Tables_column.widgetOptions.rulesOptions
 */

import type { SQLQueryResponse } from '../../types.js'
import { first } from '../../utils/array-helpers.js'
import { extractFields } from '../../utils/grist-field-extractor.js'
import type { GristClient } from '../grist-client.js'
import { parseGristJson } from '../rule-utilities.js'
import { RuleOwner } from './rule-owner.js'
import type { OwnerLookupParams, RuleContext, RuleOwnerConfig } from './types.js'

export class ColumnRuleOwner extends RuleOwner {
  readonly config: RuleOwnerConfig = {
    metadataTable: '_grist_Tables_column',
    rulesProperty: 'rules',
    styleProperty: 'widgetOptions',
    stylesInWidgetOptions: true,
    helperColumnPrefix: 'gristHelper_ConditionalRule',
    scopeName: 'column'
  }

  /**
   * Column rules: AddEmptyRule with [tableId, 0, colRef]
   * fieldRef=0, colRef=target column
   */
  getAddEmptyRuleParams(context: RuleContext): [number, number] {
    return [0, context.ownerRef]
  }

  /**
   * Get column reference by colId
   */
  async getOwnerRef(
    client: GristClient,
    docId: string,
    params: OwnerLookupParams
  ): Promise<number> {
    if (!params.colId) {
      throw new Error('colId is required for column scope')
    }

    const response = await client.get<{
      columns: Array<{ id: string; fields: { colRef: number } }>
    }>(`/docs/${docId}/tables/${params.tableId}/columns`)

    const column = response.columns.find((c) => c.id === params.colId)
    if (!column) {
      throw new Error(
        `Column "${params.colId}" not found in table "${params.tableId}". ` +
          `Verify colId is correct. Use grist_get_tables with detail_level="full_schema" to list columns.`
      )
    }

    return column.fields.colRef
  }

  /**
   * Get fresh widgetOptions via SQL query (avoids REST API caching issues)
   */
  async getWidgetOptionsFresh(
    client: GristClient,
    docId: string,
    tableId: string,
    colId: string
  ): Promise<Record<string, unknown>> {
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT c.widgetOptions
            FROM _grist_Tables_column c
            JOIN _grist_Tables t ON c.parentId = t.id
            WHERE t.tableId = ? AND c.colId = ?`,
      args: [tableId, colId]
    })

    if (response.records.length === 0) {
      return {}
    }

    return parseGristJson<Record<string, unknown>>(
      extractFields(first(response.records, 'Column widgetOptions for styles')).widgetOptions,
      {}
    )
  }
}
