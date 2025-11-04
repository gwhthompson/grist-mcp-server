/**
 * Action Builder - Helper functions for constructing Grist UserAction arrays
 *
 * Provides type-safe construction of Grist actions for the /apply endpoint.
 * Abstracts the internal UserAction format for cleaner tool implementations.
 */

import type { BulkColValues, ColumnDefinition, ColumnInfo, UserAction } from '../types.js'

/**
 * Build BulkAddRecord action
 * Converts array of record objects to Grist's columnar format
 *
 * @param tableId - Table identifier
 * @param records - Array of records (row-oriented format)
 * @returns UserAction for bulk adding records
 */
export function buildBulkAddRecordAction(
  tableId: string,
  records: Record<string, any>[]
): UserAction {
  // Grist assigns row IDs automatically
  const rowIds = records.map(() => null) as any as number[]

  // Convert row-oriented to column-oriented format
  const colValues: BulkColValues = {}

  if (records.length > 0) {
    // Get all columns from first record
    const columns = Object.keys(records[0])

    // Build columnar structure
    columns.forEach((colId) => {
      colValues[colId] = records.map((r) => r[colId] ?? null)
    })
  }

  return ['BulkAddRecord', tableId, rowIds, colValues]
}

/**
 * Build BulkUpdateRecord action
 *
 * @param tableId - Table identifier
 * @param rowIds - Array of row IDs to update
 * @param updates - Object with column values to update
 * @returns UserAction for bulk updating records
 */
export function buildBulkUpdateRecordAction(
  tableId: string,
  rowIds: number[],
  updates: Record<string, any>
): UserAction {
  // Convert updates to column format (same value for all rows)
  const colValues: BulkColValues = {}

  Object.keys(updates).forEach((colId) => {
    // Repeat the same value for each row
    colValues[colId] = rowIds.map(() => updates[colId])
  })

  return ['BulkUpdateRecord', tableId, rowIds, colValues]
}

/**
 * Build BulkRemoveRecord action
 *
 * @param tableId - Table identifier
 * @param rowIds - Array of row IDs to remove
 * @returns UserAction for bulk removing records
 */
export function buildBulkRemoveRecordAction(tableId: string, rowIds: number[]): UserAction {
  return ['BulkRemoveRecord', tableId, rowIds]
}

/**
 * Build AddColumn action
 *
 * @param tableId - Table identifier
 * @param colId - Column identifier
 * @param colInfo - Column information (type, label, formula, etc.)
 * @returns UserAction for adding a column
 */
export function buildAddColumnAction(
  tableId: string,
  colId: string,
  colInfo: ColumnInfo
): UserAction {
  return ['AddColumn', tableId, colId, colInfo]
}

/**
 * Build ModifyColumn action
 *
 * @param tableId - Table identifier
 * @param colId - Column identifier
 * @param updates - Partial column info with fields to update
 * @returns UserAction for modifying a column
 */
export function buildModifyColumnAction(
  tableId: string,
  colId: string,
  updates: Partial<ColumnInfo>
): UserAction {
  return ['ModifyColumn', tableId, colId, updates]
}

/**
 * Build RemoveColumn action
 *
 * @param tableId - Table identifier
 * @param colId - Column identifier to remove
 * @returns UserAction for removing a column
 */
export function buildRemoveColumnAction(tableId: string, colId: string): UserAction {
  return ['RemoveColumn', tableId, colId]
}

/**
 * Build RenameColumn action
 *
 * @param tableId - Table identifier
 * @param oldColId - Current column identifier
 * @param newColId - New column identifier
 * @returns UserAction for renaming a column
 */
export function buildRenameColumnAction(
  tableId: string,
  oldColId: string,
  newColId: string
): UserAction {
  return ['RenameColumn', tableId, oldColId, newColId]
}

/**
 * Build AddTable action
 *
 * @param tableName - Name for the new table
 * @param columns - Array of column definitions
 * @returns UserAction for creating a table
 */
export function buildAddTableAction(tableName: string, columns: ColumnDefinition[]): UserAction {
  // Transform columns to Grist API format (uses 'id' not 'colId')
  const gristColumns = columns.map((col) => {
    const { colId, ...rest } = col
    return { id: colId, ...rest }
  })

  return ['AddTable', tableName, gristColumns as any]
}

/**
 * Build RenameTable action
 *
 * @param tableId - Current table identifier
 * @param newTableId - New table identifier
 * @returns UserAction for renaming a table
 */
export function buildRenameTableAction(tableId: string, newTableId: string): UserAction {
  return ['RenameTable', tableId, newTableId]
}

/**
 * Build RemoveTable action
 *
 * @param tableId - Table identifier to remove
 * @returns UserAction for removing a table
 */
export function buildRemoveTableAction(tableId: string): UserAction {
  return ['RemoveTable', tableId]
}
