/**
 * Action Builder - Helper functions for constructing Grist UserAction arrays
 *
 * Provides type-safe construction of Grist actions for the /apply endpoint.
 * Abstracts the internal UserAction format for cleaner tool implementations.
 *
 * Refactored with branded types and advanced TypeScript patterns
 */

import type { BulkColValues, ColumnDefinition, ColumnInfo, UserAction, CellValue } from '../types.js'
import type { TableId, RowId, ColId } from '../types/advanced.js'

/**
 * Type for Grist record data (column ID to cell value mapping)
 */
export type GristRecordData = Record<string, CellValue>

/**
 * Build BulkAddRecord action
 * Converts array of record objects to Grist's columnar format
 *
 * @param tableId - Table identifier (branded type)
 * @param records - Array of records (row-oriented format)
 * @returns UserAction for bulk adding records
 */
export function buildBulkAddRecordAction(
  tableId: TableId,
  records: GristRecordData[]
): UserAction {
  // Grist assigns row IDs automatically - null placeholders for new records
  // Type assertion needed as Grist API expects number[] but accepts null for new records
  const rowIds = records.map(() => null as unknown as number)

  // Convert row-oriented to column-oriented format
  const colValues: BulkColValues = {}

  if (records.length > 0) {
    // Get all columns from first record
    const columns = Object.keys(records[0])

    // Build columnar structure with type-safe cell values
    columns.forEach((colId) => {
      colValues[colId] = records.map((r) => r[colId] ?? null)
    })
  }

  return ['BulkAddRecord', tableId as string, rowIds, colValues]
}

/**
 * Build BulkUpdateRecord action
 *
 * @param tableId - Table identifier (branded type)
 * @param rowIds - Array of row IDs to update (branded type)
 * @param updates - Object with column values to update (type-safe cell values)
 * @returns UserAction for bulk updating records
 */
export function buildBulkUpdateRecordAction(
  tableId: TableId,
  rowIds: RowId[],
  updates: Partial<GristRecordData>
): UserAction {
  // Convert updates to column format (same value for all rows)
  const colValues: BulkColValues = {}

  Object.keys(updates).forEach((colId) => {
    const value = updates[colId]
    // Repeat the same value for each row
    colValues[colId] = rowIds.map(() => value ?? null)
  })

  return ['BulkUpdateRecord', tableId as string, rowIds as number[], colValues]
}

/**
 * Build BulkRemoveRecord action
 *
 * @param tableId - Table identifier (branded type)
 * @param rowIds - Array of row IDs to remove (branded type)
 * @returns UserAction for bulk removing records
 */
export function buildBulkRemoveRecordAction(tableId: TableId, rowIds: RowId[]): UserAction {
  return ['BulkRemoveRecord', tableId as string, rowIds as number[]]
}

/**
 * Build AddColumn action
 *
 * @param tableId - Table identifier (branded type)
 * @param colId - Column identifier (branded type)
 * @param colInfo - Column information (type, label, formula, etc.)
 * @returns UserAction for adding a column
 */
export function buildAddColumnAction(
  tableId: TableId,
  colId: ColId,
  colInfo: ColumnInfo
): UserAction {
  return ['AddColumn', tableId as string, colId as string, colInfo]
}

/**
 * Build ModifyColumn action
 *
 * @param tableId - Table identifier (branded type)
 * @param colId - Column identifier (branded type)
 * @param updates - Partial column info with fields to update
 * @returns UserAction for modifying a column
 */
export function buildModifyColumnAction(
  tableId: TableId,
  colId: ColId,
  updates: Partial<ColumnInfo>
): UserAction {
  return ['ModifyColumn', tableId as string, colId as string, updates]
}

/**
 * Build RemoveColumn action
 *
 * @param tableId - Table identifier (branded type)
 * @param colId - Column identifier to remove (branded type)
 * @returns UserAction for removing a column
 */
export function buildRemoveColumnAction(tableId: TableId, colId: ColId): UserAction {
  return ['RemoveColumn', tableId as string, colId as string]
}

/**
 * Build RenameColumn action
 *
 * @param tableId - Table identifier (branded type)
 * @param oldColId - Current column identifier (branded type)
 * @param newColId - New column identifier (branded type)
 * @returns UserAction for renaming a column
 */
export function buildRenameColumnAction(
  tableId: TableId,
  oldColId: ColId,
  newColId: ColId
): UserAction {
  return ['RenameColumn', tableId as string, oldColId as string, newColId as string]
}

/**
 * Grist API column format (uses 'id' instead of 'colId')
 */
type GristApiColumn = Omit<ColumnDefinition, 'colId'> & { id: string }

/**
 * Build AddTable action
 *
 * @param tableName - Name for the new table (becomes TableId)
 * @param columns - Array of column definitions
 * @returns UserAction for creating a table
 */
export function buildAddTableAction(tableName: TableId, columns: ColumnDefinition[]): UserAction {
  // Transform columns to Grist API format (uses 'id' not 'colId')
  const gristColumns: GristApiColumn[] = columns.map((col) => {
    const { colId, ...rest } = col
    return { id: colId, ...rest }
  })

  // Type assertion needed for Grist API format compatibility
  return ['AddTable', tableName as string, gristColumns as unknown as ColumnDefinition[]]
}

/**
 * Build RenameTable action
 *
 * @param tableId - Current table identifier (branded type)
 * @param newTableId - New table identifier (branded type)
 * @returns UserAction for renaming a table
 */
export function buildRenameTableAction(tableId: TableId, newTableId: TableId): UserAction {
  return ['RenameTable', tableId as string, newTableId as string]
}

/**
 * Build RemoveTable action
 *
 * @param tableId - Table identifier to remove (branded type)
 * @returns UserAction for removing a table
 */
export function buildRemoveTableAction(tableId: TableId): UserAction {
  return ['RemoveTable', tableId as string]
}
