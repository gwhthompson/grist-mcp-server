/**
 * FieldRuleOwner - handles field-scoped conditional formatting
 *
 * Field rules apply to a specific column within a specific widget only.
 * Rules are stored in _grist_Views_section_field.rules (RefList)
 * Styles are stored in _grist_Views_section_field.widgetOptions.rulesOptions
 *
 * This is the most granular scope - different widgets showing the same
 * column can have different conditional formatting rules.
 */

import { ApplyResponseSchema } from '../../schemas/api-responses.js'
import type { ApplyResponse, SQLQueryResponse } from '../../types.js'
import { first } from '../../utils/array-helpers.js'
import { extractFields } from '../../utils/grist-field-extractor.js'
import { validateRetValues } from '../../validators/apply-response.js'
import type { GristClient } from '../grist-client.js'
import { encodeGristList, parseGristJson, parseGristList } from '../rule-utilities.js'
import { RuleOwner } from './rule-owner.js'
import type {
  OwnerLookupParams,
  RuleContext,
  RuleOwnerConfig,
  RulesAndStyles,
  RulesAndStylesUpdate
} from './types.js'

export class FieldRuleOwner extends RuleOwner {
  readonly config: RuleOwnerConfig = {
    metadataTable: '_grist_Views_section_field',
    rulesProperty: 'rules',
    styleProperty: 'widgetOptions',
    stylesInWidgetOptions: true,
    helperColumnPrefix: 'gristHelper_ConditionalRule' // Same prefix as column rules
  }

  /**
   * Field rules: AddEmptyRule with [tableId, fieldRef, 0]
   * fieldRef=target field, colRef=0
   */
  getAddEmptyRuleParams(context: RuleContext): [number, number] {
    return [context.ownerRef, 0]
  }

  /**
   * Get fieldRef for a column within a specific widget.
   *
   * Field rules target _grist_Views_section_field records, which represent
   * a column as displayed in a specific widget (view section).
   *
   * @param params Must include sectionId and fieldColId
   */
  async getOwnerRef(
    client: GristClient,
    docId: string,
    params: OwnerLookupParams
  ): Promise<number> {
    if (!params.sectionId) {
      throw new Error('sectionId is required for field scope')
    }
    if (!params.fieldColId) {
      throw new Error('colId (fieldColId) is required for field scope')
    }

    // Query for field with matching sectionId and colId
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT f.id as fieldId
            FROM _grist_Views_section_field f
            JOIN _grist_Tables_column c ON f.colRef = c.id
            WHERE f.parentId = ? AND c.colId = ?`,
      args: [params.sectionId, params.fieldColId]
    })

    if (response.records.length === 0) {
      // Field not found - get available fields for helpful error
      const availableFieldsResp = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
        sql: `SELECT c.colId
              FROM _grist_Views_section_field f
              JOIN _grist_Tables_column c ON f.colRef = c.id
              WHERE f.parentId = ?
              ORDER BY c.colId`,
        args: [params.sectionId]
      })

      const availableFields = availableFieldsResp.records
        .map((r) => extractFields(r).colId)
        .filter((id) => typeof id === 'string')
        .join(', ')

      throw new Error(
        `Field "${params.fieldColId}" not found in widget (sectionId=${params.sectionId}). ` +
          `Available fields: ${availableFields || 'none'}. ` +
          `Column names are case-sensitive. ` +
          `Use grist_get_pages to find widget details.`
      )
    }

    const fields = extractFields(first(response.records, `Field "${params.fieldColId}"`))
    const fieldId = fields.fieldId

    if (typeof fieldId !== 'number' || fieldId <= 0) {
      throw new Error(
        `Invalid field ID returned for "${params.fieldColId}" in widget ${params.sectionId}`
      )
    }

    return fieldId
  }

  /**
   * Get rules and styles from field metadata
   */
  async getRulesAndStyles(
    client: GristClient,
    docId: string,
    ownerRef: number
  ): Promise<RulesAndStyles> {
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT rules, widgetOptions
            FROM _grist_Views_section_field
            WHERE id = ?`,
      args: [ownerRef]
    })

    if (response.records.length === 0) {
      return { helperColRefs: [], styles: [] }
    }

    const fields = extractFields(first(response.records, 'Field rules query'))

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
   * Update rules and styles on field metadata
   */
  async updateRulesAndStyles(
    client: GristClient,
    docId: string,
    ownerRef: number,
    update: RulesAndStylesUpdate
  ): Promise<void> {
    // Get current widgetOptions to preserve other settings
    const fullOptionsResp = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT widgetOptions FROM _grist_Views_section_field WHERE id = ?`,
      args: [ownerRef]
    })

    const currentWidgetOptions =
      fullOptionsResp.records.length > 0
        ? parseGristJson<Record<string, unknown>>(
            extractFields(first(fullOptionsResp.records, 'Field widgetOptions query'))
              .widgetOptions,
            {}
          )
        : {}

    // Merge updated rulesOptions
    const updatedWidgetOptions = {
      ...currentWidgetOptions,
      rulesOptions: update.styles
    }

    // Update field metadata
    const response = await client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [
        [
          'UpdateRecord',
          '_grist_Views_section_field',
          ownerRef,
          {
            rules: encodeGristList(update.helperColRefs),
            widgetOptions: JSON.stringify(updatedWidgetOptions)
          }
        ]
      ],
      {
        schema: ApplyResponseSchema,
        context: 'Updating field conditional rules'
      }
    )

    validateRetValues(response, { context: 'Updating field conditional rules' })
  }

  /**
   * Get fresh widgetOptions via SQL query (avoids REST API caching issues)
   */
  async getWidgetOptionsFresh(
    client: GristClient,
    docId: string,
    fieldRef: number
  ): Promise<Record<string, unknown>> {
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT widgetOptions FROM _grist_Views_section_field WHERE id = ?`,
      args: [fieldRef]
    })

    if (response.records.length === 0) {
      return {}
    }

    return parseGristJson<Record<string, unknown>>(
      extractFields(first(response.records, 'Field widgetOptions for styles')).widgetOptions,
      {}
    )
  }
}
