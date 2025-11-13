import { GristError } from '../errors/GristError.js'
import type { CellValue } from '../schemas/api-responses.js'
import type { ColumnMetadata } from '../services/schema-cache.js'

/**
 * Validation Error for column type mismatches
 *
 * Provides actionable, LLM-friendly error messages following MCP best practices
 * Extends GristError for proper MCP error response formatting
 */
export class ColumnValidationError extends GristError {
  constructor(
    public readonly columnId: string,
    public readonly columnType: string,
    public readonly providedValue: CellValue,
    public readonly providedType: string,
    message: string
  ) {
    super(message, 'COLUMN_TYPE_MISMATCH', {
      columnId,
      columnType,
      providedValue,
      providedType
    })
  }

  toUserMessage(): string {
    return this.message // Already contains actionable, LLM-friendly message
  }

  isRetryable(): boolean {
    return false // User must fix data - not a transient error
  }
}

/**
 * Validates a cell value against its column type
 *
 * @param value - Cell value to validate
 * @param column - Column metadata
 * @param colId - Column ID (for error messages)
 * @throws {ColumnValidationError} If validation fails
 */
export function validateCellValueForColumnType(
  value: CellValue,
  column: ColumnMetadata,
  colId: string
): void {
  // Null is valid for all column types (represents empty cell)
  if (value === null) {
    return
  }

  const columnType = column.fields.type

  switch (columnType) {
    case 'Bool':
      validateBooleanColumn(value, colId)
      break

    case 'Numeric':
    case 'Int':
      validateNumericColumn(value, colId, columnType)
      break

    case 'Text':
      validateTextColumn(value, colId)
      break

    case 'Date':
    case 'DateTime':
      validateDateColumn(value, colId, columnType)
      break

    case 'Choice':
      validateChoiceColumn(value, colId)
      break

    case 'ChoiceList':
      validateChoiceListColumn(value, colId)
      break

    case 'Ref':
      validateRefColumn(value, colId)
      break

    case 'RefList':
      validateRefListColumn(value, colId)
      break

    case 'Attachments':
      // Attachments accept arrays or encoded arrays
      // Let Grist handle validation
      break

    default:
      // Unknown column type - let Grist handle validation
      break
  }
}

/**
 * Validates Boolean column value
 */
function validateBooleanColumn(value: CellValue, colId: string): void {
  if (typeof value !== 'boolean') {
    const providedType = Array.isArray(value) ? 'array' : typeof value
    throw new ColumnValidationError(
      colId,
      'Bool',
      value,
      providedType,
      `Invalid value for Boolean column "${colId}": ${JSON.stringify(value)}\n\n` +
        `Boolean column expects: true, false, or null\n\n` +
        `You provided: ${providedType} ${JSON.stringify(value)}\n\n` +
        `Examples:\n` +
        `  ✅ {"${colId}": true}\n` +
        `  ✅ {"${colId}": false}\n` +
        `  ✅ {"${colId}": null}\n` +
        `  ❌ {"${colId}": "__YES__"}\n` +
        `  ❌ {"${colId}": "true"}\n` +
        `  ❌ {"${colId}": 1}`
    )
  }
}

/**
 * Validates Numeric/Int column value
 */
function validateNumericColumn(value: CellValue, colId: string, columnType: string): void {
  if (typeof value !== 'number') {
    const providedType = Array.isArray(value) ? 'array' : typeof value
    throw new ColumnValidationError(
      colId,
      columnType,
      value,
      providedType,
      `Invalid value for ${columnType} column "${colId}": ${JSON.stringify(value)}\n\n` +
        `${columnType} column expects: number or null\n\n` +
        `You provided: ${providedType} ${JSON.stringify(value)}\n\n` +
        `Examples:\n` +
        `  ✅ {"${colId}": 42}\n` +
        `  ✅ {"${colId}": 3.14}\n` +
        `  ✅ {"${colId}": null}\n` +
        `  ❌ {"${colId}": "42"}\n` +
        `  ❌ {"${colId}": "3.14"}`
    )
  }
}

/**
 * Validates Text column value
 */
function validateTextColumn(value: CellValue, colId: string): void {
  // Text columns accept only strings or null (primitives only for safety)
  // Arrays are rejected - let Grist handle special encoding cases if needed
  if (typeof value !== 'string') {
    const providedType = Array.isArray(value) ? 'array' : typeof value
    throw new ColumnValidationError(
      colId,
      'Text',
      value,
      providedType,
      `Invalid value for Text column "${colId}": ${JSON.stringify(value)}\n\n` +
        `Text column expects: string or null\n\n` +
        `You provided: ${providedType} ${JSON.stringify(value)}\n\n` +
        `Examples:\n` +
        `  ✅ {"${colId}": "Hello World"}\n` +
        `  ✅ {"${colId}": ""}\n` +
        `  ✅ {"${colId}": null}\n` +
        `  ❌ {"${colId}": 42}\n` +
        `  ❌ {"${colId}": true}\n` +
        `  ❌ {"${colId}": ["array", "values"]}`
    )
  }
}

/**
 * Validates Date/DateTime column value
 */
function validateDateColumn(value: CellValue, colId: string, columnType: string): void {
  // Date/DateTime columns accept:
  // - Numbers (Unix timestamps)
  // - Date encoding: ["d", timestamp] (exactly 2 elements)
  // - DateTime encoding: ["D", timestamp, timezone] (exactly 3 elements)
  // - null

  const isUnixTimestamp = typeof value === 'number'

  const isDateEncoded =
    Array.isArray(value) && value.length === 2 && value[0] === 'd' && typeof value[1] === 'number'

  const isDateTimeEncoded =
    Array.isArray(value) &&
    value.length === 3 &&
    value[0] === 'D' &&
    typeof value[1] === 'number' &&
    typeof value[2] === 'string'

  const isValidDateFormat =
    isUnixTimestamp || (columnType === 'Date' ? isDateEncoded : isDateEncoded || isDateTimeEncoded)

  if (!isValidDateFormat) {
    const providedType = Array.isArray(value) ? 'array' : typeof value
    throw new ColumnValidationError(
      colId,
      columnType,
      value,
      providedType,
      `Invalid value for ${columnType} column "${colId}": ${JSON.stringify(value)}\n\n` +
        `${columnType} column expects:\n` +
        `  • Unix timestamp (number)\n` +
        `  • Encoded format: ${columnType === 'Date' ? '["d", timestamp]' : '["D", timestamp, "timezone"]'}\n` +
        `  • null (empty cell)\n\n` +
        `You provided: ${providedType} ${JSON.stringify(value)}\n\n` +
        `Examples:\n` +
        `  ✅ {"${colId}": ${Date.now()}}\n` +
        `  ✅ {"${colId}": ${JSON.stringify(columnType === 'Date' ? ['d', Date.now()] : ['D', Date.now(), 'UTC'])}}\n` +
        `  ✅ {"${colId}": null}\n` +
        `  ❌ {"${colId}": "2024-01-15"}\n` +
        `  ❌ {"${colId}": ["d", "2024-01-15"]}  // timestamp must be number\n` +
        `  ❌ {"${colId}": ["D", ${Date.now()}]}  // missing timezone`
    )
  }
}

/**
 * Validates Choice column value
 */
function validateChoiceColumn(value: CellValue, colId: string): void {
  // Choice columns accept strings or null
  if (typeof value !== 'string') {
    const providedType = Array.isArray(value) ? 'array' : typeof value
    throw new ColumnValidationError(
      colId,
      'Choice',
      value,
      providedType,
      `Invalid value for Choice column "${colId}": ${JSON.stringify(value)}\n\n` +
        `Choice column expects: string or null\n\n` +
        `You provided: ${providedType} ${JSON.stringify(value)}\n\n` +
        `Examples:\n` +
        `  ✅ {"${colId}": "Option A"}\n` +
        `  ✅ {"${colId}": null}\n` +
        `  ❌ {"${colId}": ["Option A"]}  // Use string for Choice, ["L", ...] for ChoiceList`
    )
  }
}

/**
 * Validates ChoiceList column value
 */
function validateChoiceListColumn(value: CellValue, colId: string): void {
  // ChoiceList columns require encoded format: ["L", choice1, choice2, ...]
  // This is the #1 user error per CLAUDE.md - forgetting the "L" prefix
  if (Array.isArray(value)) {
    if (value.length === 0 || value[0] !== 'L') {
      throw new ColumnValidationError(
        colId,
        'ChoiceList',
        value,
        'invalid_encoding',
        `Invalid encoding for ChoiceList column "${colId}": ${JSON.stringify(value)}\n\n` +
          `ChoiceList values MUST use ["L", ...] encoding.\n` +
          `This is the #1 most common mistake - missing "L" prefix causes 500 errors!\n\n` +
          `You provided: ${JSON.stringify(value)}\n\n` +
          `Examples:\n` +
          `  ✅ {"${colId}": ["L", "VIP", "Active"]}\n` +
          `  ✅ {"${colId}": ["L", "Single Option"]}\n` +
          `  ✅ {"${colId}": ["L"]}  // empty list\n` +
          `  ✅ {"${colId}": null}\n` +
          `  ❌ {"${colId}": ["VIP", "Active"]}  // Missing "L" prefix!\n` +
          `  ❌ {"${colId}": "VIP"}  // Use Choice column for single values`
      )
    }
  } else if (value !== null) {
    const providedType = typeof value
    throw new ColumnValidationError(
      colId,
      'ChoiceList',
      value,
      providedType,
      `Invalid value for ChoiceList column "${colId}": ${JSON.stringify(value)}\n\n` +
        `ChoiceList column expects: ["L", ...choices] or null\n\n` +
        `You provided: ${providedType} ${JSON.stringify(value)}`
    )
  }
}

/**
 * Validates Ref column value
 */
function validateRefColumn(value: CellValue, colId: string): void {
  // Ref columns accept:
  // - Number (row ID)
  // - Encoded format: ["R", tableId, rowId]
  // - null
  const isRowId = typeof value === 'number'
  const isRefEncoded =
    Array.isArray(value) && value.length >= 2 && value[0] === 'R' && typeof value[1] === 'number'

  if (!isRowId && !isRefEncoded) {
    const providedType = Array.isArray(value) ? 'invalid_array' : typeof value
    throw new ColumnValidationError(
      colId,
      'Ref',
      value,
      providedType,
      `Invalid value for Ref column "${colId}": ${JSON.stringify(value)}\n\n` +
        `Ref column expects:\n` +
        `  • Row ID (number)\n` +
        `  • Encoded format: ["R", rowId]\n` +
        `  • null (empty reference)\n\n` +
        `You provided: ${providedType} ${JSON.stringify(value)}\n\n` +
        `Examples:\n` +
        `  ✅ {"${colId}": 123}  // Row ID\n` +
        `  ✅ {"${colId}": ["R", 456]}\n` +
        `  ✅ {"${colId}": null}\n` +
        `  ❌ {"${colId}": "123"}  // String not allowed\n` +
        `  ❌ {"${colId}": [123]}  // Missing "R" prefix`
    )
  }
}

/**
 * Validates RefList column value
 */
function validateRefListColumn(value: CellValue, colId: string): void {
  // RefList columns accept:
  // - Encoded format: ["r", [rowIds]]
  // - null
  if (Array.isArray(value)) {
    if (value.length < 2 || value[0] !== 'r') {
      throw new ColumnValidationError(
        colId,
        'RefList',
        value,
        'invalid_encoding',
        `Invalid encoding for RefList column "${colId}": ${JSON.stringify(value)}\n\n` +
          `RefList values MUST use ["r", [rowIds]] encoding.\n\n` +
          `You provided: ${JSON.stringify(value)}\n\n` +
          `Examples:\n` +
          `  ✅ {"${colId}": ["r", [10, 11, 12]]}\n` +
          `  ✅ {"${colId}": ["r", []]}  // empty list\n` +
          `  ✅ {"${colId}": null}\n` +
          `  ❌ {"${colId}": [10, 11, 12]}  // Missing "r" prefix!\n` +
          `  ❌ {"${colId}": 123}  // Use Ref column for single reference`
      )
    }
  } else if (value !== null) {
    const providedType = typeof value
    throw new ColumnValidationError(
      colId,
      'RefList',
      value,
      providedType,
      `Invalid value for RefList column "${colId}": ${JSON.stringify(value)}\n\n` +
        `RefList column expects: ["r", [rowIds]] or null\n\n` +
        `You provided: ${providedType} ${JSON.stringify(value)}`
    )
  }
}

/**
 * Validates multiple cell values for a record
 *
 * @param record - Record data with column values
 * @param columns - Column metadata array
 * @returns Array of validation errors (empty if all valid)
 */
export function validateRecordValues(
  record: Record<string, CellValue>,
  columns: ColumnMetadata[]
): ColumnValidationError[] {
  const errors: ColumnValidationError[] = []

  for (const [colId, value] of Object.entries(record)) {
    const column = columns.find((c) => c.id === colId)
    if (!column) {
      // Column doesn't exist - let Grist handle this error
      continue
    }

    try {
      validateCellValueForColumnType(value, column, colId)
    } catch (error) {
      if (error instanceof ColumnValidationError) {
        errors.push(error)
      } else {
        throw error // Re-throw unexpected errors
      }
    }
  }

  return errors
}
