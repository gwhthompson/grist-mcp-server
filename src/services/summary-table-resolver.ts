/**
 * Summary Table Resolver Service
 *
 * Utilities for detecting and working with summary tables in Grist.
 * Summary tables are identified by:
 * - _grist_Tables.summarySourceTable > 0 (points to source table)
 * - _grist_Tables_column.summarySourceCol > 0 (points to source column for group-by cols)
 */

import type { SQLQueryResponse } from '../types.js'
import { extractFields } from '../utils/grist-field-extractor.js'
import type { GristClient } from './grist-client.js'

/**
 * Summary table information
 */
export interface SummaryTableInfo {
  tableId: string
  tableRef: number
  isSummary: true
  sourceTableRef: number
  sourceTableId: string
  groupByColumns: string[]
  groupByColRefs: number[]
}

/**
 * Regular table information
 */
export interface RegularTableInfo {
  tableId: string
  tableRef: number
  isSummary: false
}

export type TableInfo = SummaryTableInfo | RegularTableInfo

/**
 * Check if a table is a summary table
 */
export async function isSummaryTable(
  client: GristClient,
  docId: string,
  tableRef: number
): Promise<boolean> {
  const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
    sql: 'SELECT summarySourceTable FROM _grist_Tables WHERE id = ?',
    args: [tableRef]
  })

  if (response.records.length === 0) {
    return false
  }

  const fields = extractFields(response.records[0])
  const sourceTable = fields.summarySourceTable as number | null
  return sourceTable != null && sourceTable !== 0
}

/**
 * Get full table info including summary table detection
 */
export async function getTableInfo(
  client: GristClient,
  docId: string,
  tableRef: number
): Promise<TableInfo> {
  // Query table with summary source info
  const tableResponse = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
    sql: `
      SELECT t.id, t.tableId, t.summarySourceTable, st.tableId as sourceTableId
      FROM _grist_Tables t
      LEFT JOIN _grist_Tables st ON t.summarySourceTable = st.id
      WHERE t.id = ?
    `,
    args: [tableRef]
  })

  if (tableResponse.records.length === 0) {
    throw new Error(`Table with ref ${tableRef} not found`)
  }

  const fields = extractFields(tableResponse.records[0])
  const tableId = fields.tableId as string
  const summarySourceTable = fields.summarySourceTable as number | null
  const sourceTableId = fields.sourceTableId as string | null

  if (summarySourceTable == null || summarySourceTable === 0) {
    return {
      tableId,
      tableRef,
      isSummary: false
    }
  }

  // Get group-by columns for summary table
  const groupByResponse = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
    sql: `
      SELECT c.id, c.colId, c.summarySourceCol
      FROM _grist_Tables_column c
      WHERE c.parentId = ? AND c.summarySourceCol != 0
      ORDER BY c.colId
    `,
    args: [tableRef]
  })

  const groupByColumns: string[] = []
  const groupByColRefs: number[] = []

  for (const record of groupByResponse.records) {
    const colFields = extractFields(record)
    groupByColumns.push(colFields.colId as string)
    groupByColRefs.push(colFields.summarySourceCol as number)
  }

  return {
    tableId,
    tableRef,
    isSummary: true,
    sourceTableRef: summarySourceTable,
    sourceTableId: sourceTableId || '',
    groupByColumns,
    groupByColRefs
  }
}

/**
 * Get shared group-by columns between two summary tables
 *
 * Returns the column names that both tables group by (based on summarySourceCol).
 * This is used to validate that summary table linking is valid.
 */
export async function getSharedGroupByColumns(
  client: GristClient,
  docId: string,
  sourceTableRef: number,
  targetTableRef: number
): Promise<string[]> {
  // Query both tables' group-by columns and find intersection based on summarySourceCol
  const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
    sql: `
      SELECT c1.colId as sharedColumn
      FROM _grist_Tables_column c1
      JOIN _grist_Tables_column c2 ON c1.summarySourceCol = c2.summarySourceCol
      WHERE c1.parentId = ?
        AND c2.parentId = ?
        AND c1.summarySourceCol != 0
        AND c2.summarySourceCol != 0
      ORDER BY c1.colId
    `,
    args: [sourceTableRef, targetTableRef]
  })

  return response.records.map((r) => {
    const fields = extractFields(r)
    return fields.sharedColumn as string
  })
}

/**
 * Check if two summary tables can be linked
 *
 * Summary tables can be linked if they share at least one group-by column.
 * The source table must have a subset of the target table's group-by columns
 * (source is less detailed, target is more detailed).
 */
export async function canLinkSummaryTables(
  client: GristClient,
  docId: string,
  sourceTableRef: number,
  targetTableRef: number
): Promise<{
  canLink: boolean
  sharedColumns: string[]
  sourceColumns: string[]
  targetColumns: string[]
  reason?: string
}> {
  const [sourceInfo, targetInfo] = await Promise.all([
    getTableInfo(client, docId, sourceTableRef),
    getTableInfo(client, docId, targetTableRef)
  ])

  // Both must be summary tables from same source
  if (!sourceInfo.isSummary || !targetInfo.isSummary) {
    return {
      canLink: false,
      sharedColumns: [],
      sourceColumns: sourceInfo.isSummary ? sourceInfo.groupByColumns : [],
      targetColumns: targetInfo.isSummary ? targetInfo.groupByColumns : [],
      reason: 'Both widgets must be on summary tables for summary-to-summary linking'
    }
  }

  if (sourceInfo.sourceTableRef !== targetInfo.sourceTableRef) {
    return {
      canLink: false,
      sharedColumns: [],
      sourceColumns: sourceInfo.groupByColumns,
      targetColumns: targetInfo.groupByColumns,
      reason: `Summary tables have different source tables: "${sourceInfo.sourceTableId}" vs "${targetInfo.sourceTableId}"`
    }
  }

  const sharedColumns = await getSharedGroupByColumns(
    client,
    docId,
    sourceTableRef,
    targetTableRef
  )

  if (sharedColumns.length === 0) {
    return {
      canLink: false,
      sharedColumns: [],
      sourceColumns: sourceInfo.groupByColumns,
      targetColumns: targetInfo.groupByColumns,
      reason:
        `Summary tables have no shared group-by columns. ` +
        `Source groups by: ${sourceInfo.groupByColumns.join(', ')}. ` +
        `Target groups by: ${targetInfo.groupByColumns.join(', ')}.`
    }
  }

  // Source must be less detailed (fewer group-by columns) or equal
  if (sourceInfo.groupByColumns.length > targetInfo.groupByColumns.length) {
    return {
      canLink: false,
      sharedColumns,
      sourceColumns: sourceInfo.groupByColumns,
      targetColumns: targetInfo.groupByColumns,
      reason:
        `Source summary table is more detailed than target. ` +
        `Link should go from less detailed (${targetInfo.groupByColumns.length} cols) ` +
        `to more detailed (${sourceInfo.groupByColumns.length} cols), not the other way.`
    }
  }

  return {
    canLink: true,
    sharedColumns,
    sourceColumns: sourceInfo.groupByColumns,
    targetColumns: targetInfo.groupByColumns
  }
}
