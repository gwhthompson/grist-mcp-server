/**
 * Data integrity validators for Ref and Choice column values.
 * These validators ensure values actually exist in referenced tables/choices.
 *
 * Unlike column-type-validators.ts which checks TYPE compatibility,
 * this module validates VALUE validity against live Grist data.
 */

import { DataIntegrityError } from '../errors/DataIntegrityError.js'
import type { CellValue } from '../schemas/api-responses.js'
import type { ColumnMetadata, SchemaCache } from '../services/schema-cache.js'
import { parseChoiceOptions } from '../services/schema-cache.js'
import { type DocId, type TableId, toTableId } from '../types/advanced.js'

// Module-level regex for extracting table name from Ref/RefList type
const REF_TYPE_REGEX = /^Ref(?:List)?:(.+)$/

/**
 * Extracts the referenced table name from a Ref or RefList column type.
 * @example getRefTableName('Ref:Customers') => 'Customers'
 * @example getRefTableName('RefList:Orders') => 'Orders'
 */
export function getRefTableName(columnType: string): string | null {
  const match = columnType.match(REF_TYPE_REGEX)
  return match?.[1] ?? null
}

/**
 * Validates that a Ref column value references an existing row.
 * @throws {DataIntegrityError} with kind 'invalid_reference' if the row ID doesn't exist
 */
export async function validateRefValue(
  value: number,
  columnId: string,
  refTableName: string,
  tableId: TableId,
  docId: DocId,
  schemaCache: SchemaCache
): Promise<void> {
  // 0 means empty/no reference - always valid
  if (value === 0) return

  const refTableId = toTableId(refTableName)
  const validRowIds = await schemaCache.getRowIds(docId, refTableId)

  if (!validRowIds.has(value)) {
    throw new DataIntegrityError('invalid_reference', tableId as string, {
      columnId,
      value,
      refTableId: refTableName,
      validRowIds:
        validRowIds.size <= 100 ? Array.from(validRowIds).sort((a, b) => a - b) : undefined
    })
  }
}

/**
 * Validates that all RefList values reference existing rows.
 * @throws {DataIntegrityError} with kind 'invalid_reflist' if any row IDs don't exist
 */
export async function validateRefListValue(
  values: number[],
  columnId: string,
  refTableName: string,
  tableId: TableId,
  docId: DocId,
  schemaCache: SchemaCache
): Promise<void> {
  // Filter out 0 values (empty references)
  const nonZeroValues = values.filter((v) => v !== 0)
  if (nonZeroValues.length === 0) return

  const refTableId = toTableId(refTableName)
  const validRowIds = await schemaCache.getRowIds(docId, refTableId)
  const invalidValues = nonZeroValues.filter((id) => !validRowIds.has(id))

  if (invalidValues.length > 0) {
    throw new DataIntegrityError('invalid_reflist', tableId as string, {
      columnId,
      invalidValues,
      refTableId: refTableName,
      validRowIds:
        validRowIds.size <= 100 ? Array.from(validRowIds).sort((a, b) => a - b) : undefined
    })
  }
}

/**
 * Validates that a Choice column value is in the allowed choices.
 * @throws {DataIntegrityError} with kind 'invalid_choice' if the value is not in allowed choices
 */
export function validateChoiceValue(
  value: string,
  columnId: string,
  allowedChoices: string[],
  tableId: TableId
): void {
  // Empty string is always valid for Choice columns
  if (value === '') return

  if (!allowedChoices.includes(value)) {
    throw new DataIntegrityError('invalid_choice', tableId as string, {
      columnId,
      value,
      allowedChoices
    })
  }
}

/**
 * Validates that all ChoiceList values are in the allowed choices.
 * @throws {DataIntegrityError} with kind 'invalid_choicelist' if any values are not in allowed choices
 */
export function validateChoiceListValue(
  values: string[],
  columnId: string,
  allowedChoices: string[],
  tableId: TableId
): void {
  // Filter out empty strings
  const nonEmptyValues = values.filter((v) => v !== '')
  if (nonEmptyValues.length === 0) return

  const allowedSet = new Set(allowedChoices)
  const invalidValues = nonEmptyValues.filter((v) => !allowedSet.has(v))

  if (invalidValues.length > 0) {
    throw new DataIntegrityError('invalid_choicelist', tableId as string, {
      columnId,
      invalidValues,
      allowedChoices
    })
  }
}

/**
 * Validates that all provided row IDs exist in the table.
 * Used for update/delete operations.
 * @throws {DataIntegrityError} with kind 'row_not_found' if any row IDs don't exist
 */
export async function validateRowIdsExist(
  rowIds: number[],
  tableId: TableId,
  docId: DocId,
  schemaCache: SchemaCache
): Promise<void> {
  const validRowIds = await schemaCache.getRowIds(docId, tableId)
  const invalidRowIds = rowIds.filter((id) => !validRowIds.has(id))

  if (invalidRowIds.length > 0) {
    throw new DataIntegrityError('row_not_found', tableId as string, {
      rowIds: invalidRowIds
    })
  }
}

/**
 * Result of validating a record's data integrity.
 */
export interface DataIntegrityValidationResult {
  valid: boolean
  errors: DataIntegrityError[]
}

/**
 * Collects all unique Ref table names from column metadata.
 * Used to pre-fetch row IDs for batch validation.
 */
function collectRefTables(columns: ColumnMetadata[]): Set<string> {
  const refTables = new Set<string>()
  for (const col of columns) {
    const refTable = getRefTableName(col.fields.type)
    if (refTable) refTables.add(refTable)
  }
  return refTables
}

/**
 * Pre-fetches row IDs for all Ref tables in parallel.
 * Returns a map from table name to valid row IDs.
 */
async function prefetchRowIds(
  refTables: Set<string>,
  docId: DocId,
  schemaCache: SchemaCache
): Promise<Map<string, Set<number>>> {
  const rowIdsByTable = new Map<string, Set<number>>()

  await Promise.all(
    Array.from(refTables).map(async (tableName) => {
      const rowIds = await schemaCache.getRowIds(docId, toTableId(tableName))
      rowIdsByTable.set(tableName, rowIds)
    })
  )

  return rowIdsByTable
}

/**
 * Validates a Ref value against pre-fetched row IDs.
 * @throws {DataIntegrityError} with kind 'invalid_reference' if the row ID doesn't exist
 */
function validateRefValueWithPrefetch(
  value: number,
  columnId: string,
  refTableName: string,
  tableId: TableId,
  validRowIds: Set<number>
): void {
  // 0 means empty/no reference - always valid
  if (value === 0) return

  if (!validRowIds.has(value)) {
    throw new DataIntegrityError('invalid_reference', tableId as string, {
      columnId,
      value,
      refTableId: refTableName,
      validRowIds:
        validRowIds.size <= 100 ? Array.from(validRowIds).sort((a, b) => a - b) : undefined
    })
  }
}

/**
 * Validates RefList values against pre-fetched row IDs.
 * @throws {DataIntegrityError} with kind 'invalid_reflist' if any row IDs don't exist
 */
function validateRefListValueWithPrefetch(
  values: number[],
  columnId: string,
  refTableName: string,
  tableId: TableId,
  validRowIds: Set<number>
): void {
  // Filter out 0 values (empty references)
  const nonZeroValues = values.filter((v) => v !== 0)
  if (nonZeroValues.length === 0) return

  const invalidValues = nonZeroValues.filter((id) => !validRowIds.has(id))

  if (invalidValues.length > 0) {
    throw new DataIntegrityError('invalid_reflist', tableId as string, {
      columnId,
      invalidValues,
      refTableId: refTableName,
      validRowIds:
        validRowIds.size <= 100 ? Array.from(validRowIds).sort((a, b) => a - b) : undefined
    })
  }
}

/**
 * Validates a single record using pre-fetched row IDs.
 * This is the internal implementation used by batch validation.
 */
function validateRecordWithPrefetch(
  record: Record<string, CellValue>,
  columns: ColumnMetadata[],
  tableId: TableId,
  rowIdsByTable: Map<string, Set<number>>
): DataIntegrityValidationResult {
  const errors: DataIntegrityValidationResult['errors'] = []

  for (const [colId, value] of Object.entries(record)) {
    // Skip null values - they're always valid
    if (value === null) continue

    const column = columns.find((c) => c.id === colId)
    if (!column) continue

    const columnType = column.fields.type

    try {
      // Ref validation using pre-fetched row IDs
      if (columnType.startsWith('Ref:') && typeof value === 'number') {
        const refTableName = getRefTableName(columnType)
        if (refTableName) {
          const validRowIds = rowIdsByTable.get(refTableName)
          if (validRowIds) {
            validateRefValueWithPrefetch(value, colId, refTableName, tableId, validRowIds)
          }
        }
      }

      // RefList validation using pre-fetched row IDs
      if (columnType.startsWith('RefList:') && Array.isArray(value)) {
        const refTableName = getRefTableName(columnType)
        if (refTableName) {
          const validRowIds = rowIdsByTable.get(refTableName)
          if (validRowIds) {
            const rowIds = value[0] === 'L' ? (value.slice(1) as number[]) : (value as number[])
            validateRefListValueWithPrefetch(rowIds, colId, refTableName, tableId, validRowIds)
          }
        }
      }

      // Choice validation (sync - no API call needed)
      if (columnType === 'Choice' && typeof value === 'string') {
        const choiceOptions = parseChoiceOptions(column.fields.widgetOptions)
        if (choiceOptions?.choices && choiceOptions.choices.length > 0) {
          validateChoiceValue(value, colId, choiceOptions.choices, tableId)
        }
      }

      // ChoiceList validation (sync - no API call needed)
      if (columnType === 'ChoiceList' && Array.isArray(value)) {
        const choiceOptions = parseChoiceOptions(column.fields.widgetOptions)
        if (choiceOptions?.choices && choiceOptions.choices.length > 0) {
          const choices = value[0] === 'L' ? (value.slice(1) as string[]) : (value as string[])
          validateChoiceListValue(choices, colId, choiceOptions.choices, tableId)
        }
      }
    } catch (error) {
      if (error instanceof DataIntegrityError) {
        errors.push(error)
      } else {
        throw error
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validates all Ref and Choice values in a record against live Grist data.
 *
 * This performs async validation for Ref columns (fetches valid row IDs)
 * and sync validation for Choice columns (uses cached column metadata).
 *
 * @param record - The record to validate
 * @param columns - Column metadata (must include widgetOptions for Choice validation)
 * @param tableId - The table containing the record
 * @param docId - The document ID
 * @param schemaCache - Schema cache for fetching row IDs
 * @returns Validation result with any errors found
 */
export async function validateRecordDataIntegrity(
  record: Record<string, CellValue>,
  columns: ColumnMetadata[],
  tableId: TableId,
  docId: DocId,
  schemaCache: SchemaCache
): Promise<DataIntegrityValidationResult> {
  // For single record, collect Ref tables and pre-fetch
  const refTables = collectRefTables(columns)
  const rowIdsByTable = await prefetchRowIds(refTables, docId, schemaCache)

  return validateRecordWithPrefetch(record, columns, tableId, rowIdsByTable)
}

/**
 * Validates multiple records for data integrity.
 * Pre-fetches row IDs once for all Ref tables, then validates each record.
 * Stops at first error for fail-fast behavior.
 *
 * @throws First DataIntegrityError encountered
 */
export async function validateRecordsDataIntegrity(
  records: Record<string, CellValue>[],
  columns: ColumnMetadata[],
  tableId: TableId,
  docId: DocId,
  schemaCache: SchemaCache
): Promise<void> {
  // Pre-fetch row IDs for all Ref tables ONCE (not per-record)
  const refTables = collectRefTables(columns)
  const rowIdsByTable = await prefetchRowIds(refTables, docId, schemaCache)

  // Validate each record using pre-fetched data (no additional API calls)
  for (const record of records) {
    const result = validateRecordWithPrefetch(record, columns, tableId, rowIdsByTable)
    if (!result.valid && result.errors.length > 0) {
      throw result.errors[0]
    }
  }
}

/**
 * Validates upsert records for data integrity.
 * Pre-fetches row IDs once for all Ref tables, then validates each record.
 * Only validates the fields property if present.
 *
 * @throws First DataIntegrityError encountered
 */
export async function validateUpsertRecordsDataIntegrity(
  records: Array<{ require?: Record<string, CellValue>; fields?: Record<string, CellValue> }>,
  columns: ColumnMetadata[],
  tableId: TableId,
  docId: DocId,
  schemaCache: SchemaCache
): Promise<void> {
  // Pre-fetch row IDs for all Ref tables ONCE (not per-record)
  const refTables = collectRefTables(columns)
  const rowIdsByTable = await prefetchRowIds(refTables, docId, schemaCache)

  // Validate each record using pre-fetched data (no additional API calls)
  for (const record of records) {
    // Validate fields if present
    if (record.fields) {
      const result = validateRecordWithPrefetch(record.fields, columns, tableId, rowIdsByTable)
      if (!result.valid && result.errors.length > 0) {
        throw result.errors[0]
      }
    }

    // Also validate require fields for Choice/Ref values
    if (record.require) {
      const result = validateRecordWithPrefetch(record.require, columns, tableId, rowIdsByTable)
      if (!result.valid && result.errors.length > 0) {
        throw result.errors[0]
      }
    }
  }
}
