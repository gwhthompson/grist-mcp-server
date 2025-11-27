/**
 * ColumnRuleOwner - handles column-scoped conditional formatting
 *
 * Column rules apply to all cells in a column across ALL views.
 * Rules are stored in _grist_Tables_column.rules (RefList)
 * Styles are stored in _grist_Tables_column.widgetOptions.rulesOptions
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

export class ColumnRuleOwner extends RuleOwner {
  readonly config: RuleOwnerConfig = {
    metadataTable: '_grist_Tables_column',
    rulesProperty: 'rules',
    styleProperty: 'widgetOptions',
    stylesInWidgetOptions: true,
    helperColumnPrefix: 'gristHelper_ConditionalRule'
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
   * Get rules and styles from column metadata
   */
  async getRulesAndStyles(
    client: GristClient,
    docId: string,
    ownerRef: number
  ): Promise<RulesAndStyles> {
    // Query column metadata directly
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT rules, widgetOptions
            FROM _grist_Tables_column
            WHERE id = ?`,
      args: [ownerRef]
    })

    if (response.records.length === 0) {
      return { helperColRefs: [], styles: [] }
    }

    const fields = extractFields(response.records[0])

    // Parse rules RefList (handles SQL string or REST array)
    const helperColRefs = parseGristList(fields.rules)

    // Parse widgetOptions.rulesOptions (handles SQL string or REST object)
    const widgetOptions = parseGristJson<{ rulesOptions?: Array<Record<string, unknown>> }>(
      fields.widgetOptions,
      {}
    )
    const styles = widgetOptions.rulesOptions ?? []

    return { helperColRefs, styles }
  }

  /**
   * Update rules and styles on column metadata
   */
  async updateRulesAndStyles(
    client: GristClient,
    docId: string,
    ownerRef: number,
    update: RulesAndStylesUpdate
  ): Promise<void> {
    // Get full widgetOptions
    const fullOptionsResp = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT widgetOptions FROM _grist_Tables_column WHERE id = ?`,
      args: [ownerRef]
    })

    const currentWidgetOptions =
      fullOptionsResp.records.length > 0
        ? parseGristJson<Record<string, unknown>>(
            extractFields(fullOptionsResp.records[0]).widgetOptions,
            {}
          )
        : {}

    // Merge updated rulesOptions
    const updatedWidgetOptions = {
      ...currentWidgetOptions,
      rulesOptions: update.styles
    }

    // Update column metadata
    const response = await client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [
        [
          'UpdateRecord',
          '_grist_Tables_column',
          ownerRef,
          {
            rules: encodeGristList(update.helperColRefs),
            widgetOptions: JSON.stringify(updatedWidgetOptions)
          }
        ]
      ],
      {
        schema: ApplyResponseSchema,
        context: 'Updating column conditional rules'
      }
    )

    validateRetValues(response, { context: 'Updating column conditional rules' })
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
      extractFields(response.records[0]).widgetOptions,
      {}
    )
  }
}
