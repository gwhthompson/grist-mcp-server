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
import { isReferenceType } from './column-resolver.js'
import { validateAndSerializeWidgetOptions } from './widget-options-validator.js'
import { ValidationError } from '../errors/ValidationError.js'

/**
 * Type for Grist record data (column ID to cell value mapping)
 */
export type GristRecordData = Record<string, CellValue>

/**
 * Serialize widgetOptions from object to JSON string
 *
 * @deprecated Use validateAndSerializeWidgetOptions() instead for secure validation
 * @internal This function is kept for backward compatibility but should not be used
 */
export function serializeWidgetOptions(widgetOptions: unknown): string | undefined {
  if (!widgetOptions) return undefined
  if (typeof widgetOptions === 'object') {
    return JSON.stringify(widgetOptions)
  }
  return widgetOptions as string
}

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
  // Type system now properly supports null values for new records
  const rowIds = records.map(() => null)

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
 * @throws {Error} if visibleCol is used incorrectly
 * @throws {ValidationError} if widgetOptions are invalid for the column type
 */
export function buildAddColumnAction(
  tableId: TableId,
  colId: ColId,
  colInfo: ColumnInfo
): UserAction {
  // Validate visibleCol usage
  if (colInfo.visibleCol !== undefined) {
    // Ensure column type is provided
    if (!colInfo.type) {
      throw new Error(
        `Column "${colId}" has visibleCol but no type specified. ` +
          `When setting visibleCol, you must provide the column type (e.g., "Ref:People" or "RefList:Tags").`
      )
    }

    // Ensure it's a reference type
    if (!isReferenceType(colInfo.type)) {
      throw new Error(
        `Column "${colId}" has visibleCol but type "${colInfo.type}" is not a Ref or RefList type. ` +
          `visibleCol can only be used with Ref:TableName or RefList:TableName types.`
      )
    }

    // Ensure visibleCol is a number
    if (typeof colInfo.visibleCol !== 'number') {
      throw new Error(
        `visibleCol for column "${colId}" must be a numeric column reference (colRef). ` +
          `Use resolveVisibleCol() to convert string column names to numeric IDs. ` +
          `Received: ${typeof colInfo.visibleCol}`
      )
    }
  }

  // Validate and serialize widgetOptions if present
  // Column type is required for validation - use 'Text' as default if not specified
  const columnType = colInfo.type || 'Text'
  const serializedWidgetOptions = colInfo.widgetOptions
    ? validateAndSerializeWidgetOptions(colInfo.widgetOptions, columnType)
    : undefined

  const processedColInfo = {
    ...colInfo,
    widgetOptions: serializedWidgetOptions
  }

  return ['AddColumn', tableId as string, colId as string, processedColInfo]
}

/**
 * Build ModifyColumn action
 *
 * @param tableId - Table identifier (branded type)
 * @param colId - Column identifier (branded type)
 * @param updates - Partial column info with fields to update
 * @returns UserAction for modifying a column
 * @throws {Error} if visibleCol is used incorrectly
 * @throws {ValidationError} if widgetOptions are provided without column type
 * @throws {ValidationError} if widgetOptions are invalid for the column type
 */
export function buildModifyColumnAction(
  tableId: TableId,
  colId: ColId,
  updates: Partial<ColumnInfo>
): UserAction {
  // Validate visibleCol usage if being modified
  if (updates.visibleCol !== undefined) {
    // If updating visibleCol, the type should also be provided (or already be a Ref type)
    if (updates.type && !isReferenceType(updates.type)) {
      throw new Error(
        `Column "${colId}" is being updated with visibleCol but type "${updates.type}" is not a Ref or RefList type. ` +
          `visibleCol can only be used with Ref:TableName or RefList:TableName types.`
      )
    }

    // Ensure visibleCol is a number
    if (typeof updates.visibleCol !== 'number') {
      throw new Error(
        `visibleCol for column "${colId}" must be a numeric column reference (colRef). ` +
          `Use resolveVisibleCol() to convert string column names to numeric IDs. ` +
          `Received: ${typeof updates.visibleCol}`
      )
    }
  }

  // Validate and serialize widgetOptions if being modified
  let serializedWidgetOptions: string | undefined = undefined
  if (updates.widgetOptions !== undefined) {
    // Type is required for proper validation
    if (!updates.type) {
      throw new ValidationError(
        'widgetOptions',
        updates.widgetOptions,
        'Column type must be provided when updating widgetOptions. ' +
        'The type is required to validate widgetOptions against the correct schema. ' +
        'Either include the type in your modify operation, or the tool layer will fetch it automatically.',
        { operation: 'ModifyColumn', columnId: colId as string }
      )
    }

    // Validate string inputs are valid JSON
    if (typeof updates.widgetOptions === 'string') {
      try {
        JSON.parse(updates.widgetOptions)
      } catch (error) {
        throw new ValidationError(
          'widgetOptions',
          updates.widgetOptions,
          `Invalid JSON string: ${error instanceof Error ? error.message : 'Unable to parse'}`,
          { operation: 'ModifyColumn', columnId: colId as string }
        )
      }
    }

    // Perform type-specific validation
    serializedWidgetOptions = validateAndSerializeWidgetOptions(
      updates.widgetOptions,
      updates.type
    )
  }

  const processedUpdates = {
    ...updates,
    ...(updates.widgetOptions !== undefined && { widgetOptions: serializedWidgetOptions })
  }

  return ['ModifyColumn', tableId as string, colId as string, processedUpdates]
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
 * @throws {ValidationError} if any column has invalid widgetOptions
 */
export function buildAddTableAction(tableName: TableId, columns: ColumnDefinition[]): UserAction {
  // Transform columns to Grist API format (uses 'id' not 'colId')
  // and validate & serialize widgetOptions to JSON strings
  const gristColumns: GristApiColumn[] = columns.map((col) => {
    const { colId, widgetOptions, type, ...rest } = col

    // Validate and serialize widgetOptions if present
    const columnType = type || 'Text'
    const serializedWidgetOptions = widgetOptions
      ? validateAndSerializeWidgetOptions(widgetOptions, columnType)
      : undefined

    return {
      id: colId,
      type, // Preserve the type field
      ...rest,
      ...(serializedWidgetOptions !== undefined && { widgetOptions: serializedWidgetOptions })
    }
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
