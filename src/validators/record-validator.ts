/**
 * Consolidated record validation utilities.
 * Combines writable column checks and type validation into reusable functions.
 */

import type { CellValue } from '../schemas/api-responses.js'
import type { ColumnMetadata } from '../services/schema-cache.js'
import { validateRecordValues } from './column-type-validators.js'
import { validateWritableColumns } from './writable-columns.js'

/**
 * Validates a single record against column metadata.
 * Checks for formula columns and type mismatches.
 * @throws {FormulaColumnWriteError} If record contains formula columns
 * @throws {ColumnValidationError} If record contains type mismatches
 */
export function validateRecord(record: Record<string, CellValue>, columns: ColumnMetadata[]): void {
  validateWritableColumns(record, columns)
  const validationErrors = validateRecordValues(record, columns)
  if (validationErrors.length > 0) {
    throw validationErrors[0]
  }
}

/**
 * Validates multiple records against column metadata.
 * Stops at first error for fail-fast behavior.
 * @throws {FormulaColumnWriteError} If any record contains formula columns
 * @throws {ColumnValidationError} If any record contains type mismatches
 */
export function validateRecords(
  records: Record<string, CellValue>[],
  columns: ColumnMetadata[]
): void {
  for (const record of records) {
    validateRecord(record, columns)
  }
}

/**
 * Validates upsert records where fields are optional.
 * Only validates the fields property if present.
 * @throws {FormulaColumnWriteError} If any record.fields contains formula columns
 * @throws {ColumnValidationError} If any record.fields contains type mismatches
 */
export function validateUpsertRecords(
  records: Array<{ require?: Record<string, CellValue>; fields?: Record<string, CellValue> }>,
  columns: ColumnMetadata[]
): void {
  for (const record of records) {
    if (record.fields) {
      validateRecord(record.fields, columns)
    }
  }
}
