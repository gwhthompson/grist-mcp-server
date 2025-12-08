// Reference: grist-core/app/common/LinkNode.ts:186-313 (isValidLink function)

import { ValidationError } from '../errors/ValidationError.js'
import type { SQLQueryResponse } from '../types.js'
import { firstOrUndefined } from '../utils/array-helpers.js'
import { extractFields } from '../utils/grist-field-extractor.js'
import type { GristClient } from './grist-client.js'
import { canLinkSummaryTables, isSummaryTable } from './summary-table-resolver.js'

export interface WidgetSectionInfo {
  sectionId: number
  tableId: string
  tableRef: number
  widgetType: string
  isSummaryTable?: boolean
}

export async function validateWidgetLink(
  client: GristClient,
  docId: string,
  sourceSectionId: number,
  targetSectionId: number,
  sourceColRef: number,
  targetColRef: number
): Promise<void> {
  if (sourceSectionId === targetSectionId) {
    throw new ValidationError(
      'link_config',
      { sourceSectionId, targetSectionId },
      `Cannot link a widget to itself (section ID: ${sourceSectionId}). ` +
        `Source and target widgets must be different. ` +
        `This would cause infinite recursion in Grist's linking system.`
    )
  }

  const [sourceInfo, targetInfo] = await Promise.all([
    getWidgetInfo(client, docId, sourceSectionId),
    getWidgetInfo(client, docId, targetSectionId)
  ])

  if (sourceInfo.widgetType === 'chart') {
    throw new ValidationError(
      'source_widget',
      sourceInfo.widgetType,
      `Cannot use chart widget as link source (section ID: ${sourceSectionId}). ` +
        `Chart widgets do not support row selection and cannot drive widget linking. ` +
        `Only table, card list, card, and form widgets can be link sources.`
    )
  }

  if (targetColRef !== 0) {
    const targetColType = await getColumnType(client, docId, targetInfo.tableRef, targetColRef)
    if (targetColType === 'Attachments') {
      throw new ValidationError(
        'target_col',
        targetColRef,
        `Cannot link to Attachments column (colRef: ${targetColRef}). ` +
          `Attachments columns cannot be used as link targets because they store ` +
          `file metadata rather than linkable row references. ` +
          `Use a Reference column instead.`
      )
    }
  }

  // Same-table linking only allowed for cursor links (both colRefs === 0)
  if (sourceInfo.tableId === targetInfo.tableId) {
    if (sourceColRef !== 0 || targetColRef !== 0) {
      throw new ValidationError(
        'link_config',
        { sourceColRef, targetColRef },
        `Cannot create field-level link between widgets on the same table (${sourceInfo.tableId}). ` +
          `Same-table linking is only supported at the cursor level (both source_col and target_col must be 0 or omitted). ` +
          `Field-level same-table links can cause infinite update cycles. ` +
          `To link widgets on the same table, omit both source_col and target_col parameters.`
      )
    }
  }

  // Validate summary table linking (both colRefs must be 0)
  const [sourceIsSummary, targetIsSummary] = await Promise.all([
    isSummaryTable(client, docId, sourceInfo.tableRef),
    isSummaryTable(client, docId, targetInfo.tableRef)
  ])

  if (sourceIsSummary && targetIsSummary) {
    // Summary-to-summary linking requires table-level links (both colRefs = 0)
    if (sourceColRef !== 0 || targetColRef !== 0) {
      throw new ValidationError(
        'link_config',
        { sourceColRef, targetColRef },
        `Summary table linking requires table-level links (both source_col and target_col must be 0 or omitted). ` +
          `Grist automatically infers the join via shared group-by columns. ` +
          `Remove source_col and target_col parameters for summary table linking.`
      )
    }

    // Validate that the summary tables can actually be linked
    const linkability = await canLinkSummaryTables(
      client,
      docId,
      sourceInfo.tableRef,
      targetInfo.tableRef
    )

    if (!linkability.canLink) {
      throw new ValidationError(
        'link_config',
        { source: sourceInfo.tableId, target: targetInfo.tableId },
        `Cannot link summary tables: ${linkability.reason}`
      )
    }
  }
}

async function getWidgetInfo(
  client: GristClient,
  docId: string,
  sectionId: number
): Promise<WidgetSectionInfo> {
  const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
    sql: `
      SELECT
        vs.id as sectionId,
        t.tableId,
        vs.tableRef,
        vs.parentKey as widgetType
      FROM _grist_Views_section vs
      JOIN _grist_Tables t ON vs.tableRef = t.id
      WHERE vs.id = ?
    `,
    args: [sectionId]
  })

  const record = firstOrUndefined(response.records)
  if (!record) {
    throw new ValidationError(
      'sectionId',
      sectionId,
      `Widget section ${sectionId} not found in _grist_Views_section. ` +
        `This usually means the widget ID is invalid or the widget was deleted.`
    )
  }

  const fields = extractFields(record)

  return {
    sectionId: fields.sectionId as number,
    tableId: fields.tableId as string,
    tableRef: fields.tableRef as number,
    widgetType: fields.widgetType as string
  }
}

async function getColumnType(
  client: GristClient,
  docId: string,
  tableRef: number,
  colRef: number
): Promise<string> {
  const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
    sql: `
      SELECT type
      FROM _grist_Tables_column
      WHERE parentId = ? AND id = ?
    `,
    args: [tableRef, colRef]
  })

  const record = firstOrUndefined(response.records)
  if (!record) {
    throw new ValidationError(
      'colRef',
      colRef,
      `Column ${colRef} not found in table ${tableRef}. ` +
        `This usually means the column ID is invalid or the column was deleted.`
    )
  }

  const fields = extractFields(record)
  const type = fields.type as string | undefined

  if (!type) {
    throw new ValidationError(
      'colRef',
      colRef,
      `Column ${colRef} found in table ${tableRef} but type field is missing. ` +
        `This usually means the column metadata is corrupted.`
    )
  }

  return type
}
