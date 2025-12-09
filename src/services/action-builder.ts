import { ValidationError } from '../errors/ValidationError.js'
import type { ColId, RowId, TableId } from '../types/advanced.js'
import type {
  AddColumnAction,
  AddHiddenColumnAction,
  AddTableAction,
  BulkAddRecordAction,
  BulkColValues,
  BulkRemoveRecordAction,
  BulkUpdateRecordAction,
  CellValue,
  ColumnDefinition,
  ColumnInfo,
  ModifyColumnAction,
  RemoveColumnAction,
  RemoveTableAction,
  RenameColumnAction,
  RenameTableAction,
  SetDisplayFormulaAction,
  UpdateMetadataAction
} from '../types.js'
import { isNonEmpty } from '../utils/array-helpers.js'
import { isReferenceType } from './column-resolver.js'
import { validateAndSerializeWidgetOptions } from './widget-options-validator.js'

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type GristRecordData = Record<string, CellValue>

/** Builds a BulkAddRecord action for inserting multiple records. */
export function buildBulkAddRecordAction(
  tableId: TableId,
  records: GristRecordData[]
): BulkAddRecordAction {
  const rowIds = records.map(() => null)
  const columns: BulkColValues = {}

  if (isNonEmpty(records)) {
    const colNames = Object.keys(records[0])
    colNames.forEach((colId) => {
      columns[colId] = records.map((r) => r[colId] ?? null)
    })
  }

  return {
    action: 'BulkAddRecord',
    tableId,
    rowIds,
    columns
  }
}

/** Builds a BulkUpdateRecord action for updating multiple records. */
export function buildBulkUpdateRecordAction(
  tableId: TableId,
  rowIds: RowId[],
  updates: Partial<GristRecordData>
): BulkUpdateRecordAction {
  const columns: BulkColValues = {}

  Object.keys(updates).forEach((colId) => {
    const value = updates[colId]
    columns[colId] = rowIds.map(() => value ?? null)
  })

  return {
    action: 'BulkUpdateRecord',
    tableId,
    rowIds,
    columns
  }
}

/** Builds a BulkRemoveRecord action for deleting multiple records. */
export function buildBulkRemoveRecordAction(
  tableId: TableId,
  rowIds: RowId[]
): BulkRemoveRecordAction {
  return {
    action: 'BulkRemoveRecord',
    tableId,
    rowIds
  }
}

/** Validates that visibleCol is not incorrectly nested inside widgetOptions */
function extractAndValidateVisibleCol(
  colInfo: Record<string, unknown> & {
    widgetOptions?: string | Record<string, unknown>
    visibleCol?: string | number
  }
): {
  visibleCol?: string | number
  cleanedWidgetOptions?: string | Record<string, unknown>
} {
  let optionsObj: Record<string, unknown> | undefined
  if (typeof colInfo.widgetOptions === 'string') {
    try {
      optionsObj = JSON.parse(colInfo.widgetOptions)
    } catch {
      return { cleanedWidgetOptions: colInfo.widgetOptions }
    }
  } else if (
    typeof colInfo.widgetOptions === 'object' &&
    colInfo.widgetOptions !== null &&
    !Array.isArray(colInfo.widgetOptions)
  ) {
    optionsObj = colInfo.widgetOptions
  }

  if (optionsObj && 'visibleCol' in optionsObj) {
    throw new ValidationError(
      'widgetOptions',
      optionsObj,
      'visibleCol must be set at the operation level, not inside widgetOptions. ' +
        'Move visibleCol to the top-level column definition. ' +
        'Example: {action: "add", colId: "Manager", type: "Ref:People", visibleCol: "Email", widgetOptions: {...}}',
      { field: 'widgetOptions.visibleCol' }
    )
  }

  return {
    visibleCol: colInfo.visibleCol,
    cleanedWidgetOptions: colInfo.widgetOptions
  }
}

/** Builds an AddColumn action for adding a new column. */
export function buildAddColumnAction(
  tableId: TableId,
  colId: ColId,
  colInfo: ColumnInfo
): AddColumnAction {
  if (!isRecordLike(colInfo)) {
    throw new TypeError(`Column info must be an object for column "${colId}"`)
  }

  const { cleanedWidgetOptions } = extractAndValidateVisibleCol(colInfo)
  const colInfoToProcess = { ...colInfo, widgetOptions: cleanedWidgetOptions }

  if (colInfoToProcess.visibleCol !== undefined) {
    if (!colInfoToProcess.type) {
      throw new Error(
        `Column "${colId}" has visibleCol but no type specified. ` +
          `When setting visibleCol, you must provide the column type (e.g., "Ref:People" or "RefList:Tags").`
      )
    }

    if (!isReferenceType(colInfoToProcess.type)) {
      throw new Error(
        `Column "${colId}" has visibleCol but type "${colInfoToProcess.type}" is not a Ref or RefList type. ` +
          `visibleCol can only be used with Ref:TableName or RefList:TableName types.`
      )
    }

    if (typeof colInfoToProcess.visibleCol !== 'number') {
      throw new Error(
        `visibleCol for column "${colId}" must be a numeric column reference (colRef). ` +
          `Use resolveVisibleCol() to convert string column names to numeric IDs. ` +
          `Received: ${typeof colInfoToProcess.visibleCol}`
      )
    }
  }

  const columnType = colInfoToProcess.type || 'Text'
  const serializedWidgetOptions = colInfoToProcess.widgetOptions
    ? validateAndSerializeWidgetOptions(colInfoToProcess.widgetOptions, columnType)
    : undefined

  const processedColInfo = {
    ...colInfoToProcess,
    widgetOptions: serializedWidgetOptions
  }

  return {
    action: 'AddColumn',
    tableId,
    colId,
    colInfo: processedColInfo
  }
}

function validateVisibleColForModify(colId: ColId, updates: Partial<ColumnInfo>): void {
  if (updates.visibleCol === undefined) {
    return
  }

  if (updates.type && !isReferenceType(updates.type)) {
    throw new Error(
      `Column "${colId}" is being updated with visibleCol but type "${updates.type}" is not a Ref or RefList type. ` +
        `visibleCol can only be used with Ref:TableName or RefList:TableName types.`
    )
  }

  if (typeof updates.visibleCol !== 'number') {
    throw new Error(
      `visibleCol for column "${colId}" must be a numeric column reference (colRef). ` +
        `Use resolveVisibleCol() to convert string column names to numeric IDs. ` +
        `Received: ${typeof updates.visibleCol}`
    )
  }
}

function validateAndSerializeWidgetOptionsForModify(
  colId: ColId,
  updates: Partial<ColumnInfo>
): string | undefined {
  if (updates.widgetOptions === undefined) {
    return undefined
  }

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

  return validateAndSerializeWidgetOptions(updates.widgetOptions, updates.type)
}

/** Builds a ModifyColumn action for updating an existing column. */
export function buildModifyColumnAction(
  tableId: TableId,
  colId: ColId,
  updates: Partial<ColumnInfo>
): ModifyColumnAction {
  if (!isRecordLike(updates)) {
    throw new TypeError(`Column updates must be an object for column "${colId}"`)
  }

  const { cleanedWidgetOptions } = extractAndValidateVisibleCol(updates)
  const updatesToProcess = { ...updates, widgetOptions: cleanedWidgetOptions }

  validateVisibleColForModify(colId, updatesToProcess)
  const serializedWidgetOptions = validateAndSerializeWidgetOptionsForModify(
    colId,
    updatesToProcess
  )

  const processedUpdates = {
    ...updatesToProcess,
    ...(updatesToProcess.widgetOptions !== undefined && { widgetOptions: serializedWidgetOptions })
  }

  return {
    action: 'ModifyColumn',
    tableId,
    colId,
    updates: processedUpdates
  }
}

/** Builds a RemoveColumn action for deleting a column. */
export function buildRemoveColumnAction(tableId: TableId, colId: ColId): RemoveColumnAction {
  return {
    action: 'RemoveColumn',
    tableId,
    colId
  }
}

/** Builds a RenameColumn action for renaming a column. */
export function buildRenameColumnAction(
  tableId: TableId,
  oldColId: ColId,
  newColId: ColId
): RenameColumnAction {
  return {
    action: 'RenameColumn',
    tableId,
    oldColId,
    newColId
  }
}

/** Builds an AddTable action for creating a new table. */
export function buildAddTableAction(
  tableName: TableId,
  columns: ColumnDefinition[]
): AddTableAction {
  const processedColumns = columns.map((col) => {
    const { colId, widgetOptions, type, ...rest } = col

    if (!isRecordLike(col)) {
      throw new TypeError(`Column definition must be an object for column "${colId}"`)
    }

    const { cleanedWidgetOptions } = extractAndValidateVisibleCol(col)
    const columnType = type || 'Text'
    const serializedWidgetOptions = cleanedWidgetOptions
      ? validateAndSerializeWidgetOptions(cleanedWidgetOptions, columnType)
      : undefined

    return {
      id: colId, // Grist API expects 'id' not 'colId'
      ...rest,
      type: columnType,
      ...(serializedWidgetOptions !== undefined && { widgetOptions: serializedWidgetOptions })
    }
  })

  return {
    action: 'AddTable',
    tableName,
    columns: processedColumns as unknown as ColumnDefinition[]
  }
}

/** Builds a RenameTable action for renaming a table. */
export function buildRenameTableAction(tableId: TableId, newTableId: TableId): RenameTableAction {
  return {
    action: 'RenameTable',
    tableId,
    newTableId
  }
}

/** Builds a RemoveTable action for deleting a table. */
export function buildRemoveTableAction(tableId: TableId): RemoveTableAction {
  return {
    action: 'RemoveTable',
    tableId
  }
}

/** Builds an AddHiddenColumn action for creating a hidden formula column. */
export function buildAddHiddenColumnAction(
  tableId: TableId,
  colId: string,
  formula: string
): AddHiddenColumnAction {
  return {
    action: 'AddHiddenColumn',
    tableId,
    colId,
    colInfo: {
      type: 'Any',
      isFormula: true,
      formula
    }
  }
}

/** Builds an UpdateMetadata action for updating Grist internal metadata tables. */
export function buildUpdateColumnMetadataAction(
  colRef: number,
  updates: Record<string, unknown>
): UpdateMetadataAction {
  return {
    action: 'UpdateMetadata',
    metaTableId: '_grist_Tables_column',
    rowId: colRef,
    updates
  }
}

/** Builds a SetDisplayFormula action for setting a display formula on a column. */
export function buildSetDisplayFormulaAction(
  tableId: TableId,
  colId: string | null,
  fieldRef: number | null,
  formula: string
): SetDisplayFormulaAction {
  return {
    action: 'SetDisplayFormula',
    tableId,
    colId,
    fieldRef,
    formula
  }
}
