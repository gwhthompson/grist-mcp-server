import { GristError } from '../errors/GristError.js'
import type { CellValue } from '../schemas/api-responses.js'
import type { ColumnMetadata } from '../services/schema-cache.js'
import { log } from '../utils/shared-logger.js'

// Track unknown column types we've warned about (avoid log spam)
const warnedColumnTypes = new Set<string>()

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
    return this.message
  }

  isRetryable(): boolean {
    return false
  }
}

/**
 * Validates a cell value matches the expected column type.
 * @throws {ColumnValidationError} if value type doesn't match column type
 */
export function validateCellValueForColumnType(
  value: CellValue,
  column: ColumnMetadata,
  colId: string
): void {
  if (value === null) return

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

    default:
      // Graceful degradation: accept any value for unknown column types
      // but warn once per type so we can track new Grist column types
      if (!warnedColumnTypes.has(columnType)) {
        warnedColumnTypes.add(columnType)
        log.warn('Unknown column type encountered, skipping validation', {
          columnType,
          colId,
          hint: 'This may indicate a new Grist column type. The MCP will accept any value for this type.'
        })
      }
      break
  }
}

function validateBooleanColumn(value: CellValue, colId: string): void {
  if (typeof value !== 'boolean') {
    const providedType = Array.isArray(value) ? 'array' : typeof value
    throw new ColumnValidationError(
      colId,
      'Bool',
      value,
      providedType,
      `Boolean column "${colId}" expects true/false/null, got ${providedType}. Example: {"${colId}": true}`
    )
  }
}

function validateNumericColumn(value: CellValue, colId: string, columnType: string): void {
  if (typeof value !== 'number') {
    const providedType = Array.isArray(value) ? 'array' : typeof value
    throw new ColumnValidationError(
      colId,
      columnType,
      value,
      providedType,
      `${columnType} column "${colId}" expects number or null, got ${providedType}. Example: {"${colId}": 42}`
    )
  }
}

function validateTextColumn(value: CellValue, colId: string): void {
  if (typeof value !== 'string') {
    const providedType = Array.isArray(value) ? 'array' : typeof value
    throw new ColumnValidationError(
      colId,
      'Text',
      value,
      providedType,
      `Text column "${colId}" expects string or null, got ${providedType}. Example: {"${colId}": "Hello World"}`
    )
  }
}

function validateDateColumn(value: CellValue, colId: string, columnType: string): void {
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
      `${columnType} column "${colId}" expects date like "2024-01-15" or timestamp, got ${providedType}`
    )
  }
}

function validateChoiceColumn(value: CellValue, colId: string): void {
  if (typeof value !== 'string') {
    const providedType = Array.isArray(value) ? 'array' : typeof value
    throw new ColumnValidationError(
      colId,
      'Choice',
      value,
      providedType,
      `Choice column "${colId}" expects single string, got ${providedType}. Example: {"${colId}": "Option A"}`
    )
  }
}

function validateChoiceListColumn(value: CellValue, colId: string): void {
  if (Array.isArray(value)) {
    const isValidEncoding = value[0] === 'L' && value.slice(1).every((v) => typeof v === 'string')

    if (!isValidEncoding) {
      const looksLikeNaturalFormat = value.every((v) => typeof v === 'string')

      if (looksLikeNaturalFormat) {
        throw new ColumnValidationError(
          colId,
          'ChoiceList',
          value,
          'preprocessing_failed',
          `ChoiceList column "${colId}" received unencoded array: ${JSON.stringify(value)}. ` +
            `This suggests Zod preprocessing did not run. Internal error - please report this issue.`
        )
      }

      throw new ColumnValidationError(
        colId,
        'ChoiceList',
        value,
        'invalid_encoding',
        `ChoiceList column "${colId}" has invalid encoding. ` +
          `Expected: ['L', 'item1', 'item2', ...] ` +
          `Got: ${JSON.stringify(value)}`
      )
    }
  } else if (value !== null) {
    const providedType = typeof value
    throw new ColumnValidationError(
      colId,
      'ChoiceList',
      value,
      providedType,
      `ChoiceList column "${colId}" expects array, got ${providedType}. Example: {"${colId}": ["option1", "option2"]}`
    )
  }
}

function validateRefColumn(value: CellValue, colId: string): void {
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
      `Ref column "${colId}" expects row ID number, got ${providedType}. Example: {"${colId}": 123}`
    )
  }
}

function validateRefListColumn(value: CellValue, colId: string): void {
  if (Array.isArray(value)) {
    const isValidEncoding = value[0] === 'L' && value.slice(1).every((v) => typeof v === 'number')

    if (!isValidEncoding) {
      const looksLikeNaturalFormat = value.every((v) => typeof v === 'number')

      if (looksLikeNaturalFormat) {
        throw new ColumnValidationError(
          colId,
          'RefList',
          value,
          'preprocessing_failed',
          `RefList column "${colId}" received unencoded array: ${JSON.stringify(value)}. ` +
            `This suggests Zod preprocessing did not run. Internal error - please report this issue.`
        )
      }

      throw new ColumnValidationError(
        colId,
        'RefList',
        value,
        'invalid_encoding',
        `RefList column "${colId}" has invalid encoding. ` +
          `Expected: ['L', 1, 2, 3, ...] ` +
          `Got: ${JSON.stringify(value)}`
      )
    }
  } else if (value !== null) {
    const providedType = typeof value
    throw new ColumnValidationError(
      colId,
      'RefList',
      value,
      providedType,
      `RefList column "${colId}" expects array of row IDs, got ${providedType}. Example: {"${colId}": [1, 2, 3]}`
    )
  }
}

export function validateRecordValues(
  record: Record<string, CellValue>,
  columns: ColumnMetadata[]
): ColumnValidationError[] {
  const errors: ColumnValidationError[] = []

  for (const [colId, value] of Object.entries(record)) {
    const column = columns.find((c) => c.id === colId)
    if (!column) continue

    try {
      validateCellValueForColumnType(value, column, colId)
    } catch (error) {
      if (error instanceof ColumnValidationError) errors.push(error)
      else throw error
    }
  }

  return errors
}
