/**
 * Type-safe CellValue factory functions
 * Provides compile-time safety for Grist's CellValue encoding format
 *
 * Based on test-architecture-review.md and CellValue encoding patterns
 * Uses branded types to prevent incorrect encoding at compile-time
 */

/**
 * GristObjCode enum - encoding prefixes
 * These single-character codes prefix encoded cell values
 */
export enum GristObjCode {
  List = 'L', // ChoiceList, RefList data
  Date = 'd', // Date columns
  DateTime = 'D', // DateTime columns
  Reference = 'R', // Ref columns
  ReferenceList = 'r', // RefList columns
  Dict = 'O', // Object/Dict
  Censored = 'C', // Censored values
  Exception = 'E', // Formula errors
  Pending = 'P', // Pending values
  Unmarshallable = 'U', // Unmarshallable data
  Versions = 'V' // Version history
}

/**
 * Branded CellValue types for compile-time safety
 * TypeScript ensures you can't pass a ListValue where DateValue is expected
 */
export type ListValue = readonly [GristObjCode.List, ...(string | number | boolean)[]]
export type DateValue = readonly [GristObjCode.Date, number]
export type DateTimeValue = readonly [GristObjCode.DateTime, number, string]
export type ReferenceValue = readonly [GristObjCode.Reference, string, number]
export type ReferenceListValue = readonly [GristObjCode.ReferenceList, string, number[]]
export type DictValue = readonly [GristObjCode.Dict, Record<string, unknown>]
export type ExceptionValue = readonly [GristObjCode.Exception, string, ...unknown[]]
export type CensoredValue = readonly [GristObjCode.Censored]

/**
 * Type-safe CellValue factory object
 * All methods return branded types with compile-time guarantees
 */
export const CellValueFactory = {
  /**
   * Create List CellValue (for ChoiceList columns)
   * Returns branded ListValue type
   *
   * @param items - List items (strings, numbers, or booleans)
   * @returns Branded ListValue
   *
   * @example
   * const tags = CellValueFactory.list('Popular', 'New', 'Sale')
   * // Returns: ["L", "Popular", "New", "Sale"] as ListValue
   */
  list(...items: (string | number | boolean)[]): ListValue {
    return [GristObjCode.List, ...items] as const
  },

  /**
   * Create Date CellValue (Unix timestamp)
   * Returns branded DateValue type
   *
   * @param timestamp - Unix timestamp in milliseconds
   * @returns Branded DateValue
   *
   * @example
   * const date = CellValueFactory.date(Date.parse('2024-01-15'))
   * // Returns: ["d", 1705276800000] as DateValue
   */
  date(timestamp: number): DateValue {
    return [GristObjCode.Date, timestamp] as const
  },

  /**
   * Create DateTime CellValue
   * Returns branded DateTimeValue type
   *
   * @param timestamp - Unix timestamp in milliseconds
   * @param timezone - Timezone string (default: 'UTC')
   * @returns Branded DateTimeValue
   *
   * @example
   * const dateTime = CellValueFactory.dateTime(Date.now(), 'America/New_York')
   * // Returns: ["D", 1705276800000, "America/New_York"] as DateTimeValue
   */
  dateTime(timestamp: number, timezone: string = 'UTC'): DateTimeValue {
    return [GristObjCode.DateTime, timestamp, timezone] as const
  },

  /**
   * Create Reference CellValue (for Ref columns)
   * Returns branded ReferenceValue type
   *
   * @param tableId - Referenced table ID
   * @param rowId - Referenced row ID
   * @returns Branded ReferenceValue
   *
   * @example
   * const ref = CellValueFactory.reference('People', 123)
   * // Returns: ["R", "People", 123] as ReferenceValue
   */
  reference(tableId: string, rowId: number): ReferenceValue {
    return [GristObjCode.Reference, tableId, rowId] as const
  },

  /**
   * Create ReferenceList CellValue (for RefList columns)
   * Returns branded ReferenceListValue type
   *
   * @param tableId - Referenced table ID
   * @param rowIds - Array of referenced row IDs
   * @returns Branded ReferenceListValue
   *
   * @example
   * const refList = CellValueFactory.referenceList('Tags', [1, 2, 3])
   * // Returns: ["r", "Tags", [1, 2, 3]] as ReferenceListValue
   */
  referenceList(tableId: string, rowIds: number[]): ReferenceListValue {
    return [GristObjCode.ReferenceList, tableId, rowIds] as const
  },

  /**
   * Create Dict CellValue (for complex objects)
   * Returns branded DictValue type
   *
   * @param obj - Object to encode
   * @returns Branded DictValue
   *
   * @example
   * const dict = CellValueFactory.dict({ key: 'value', count: 42 })
   * // Returns: ["O", { key: 'value', count: 42 }] as DictValue
   */
  dict(obj: Record<string, unknown>): DictValue {
    return [GristObjCode.Dict, obj] as const
  },

  /**
   * Create Exception CellValue (for formula errors)
   * Returns branded ExceptionValue type
   *
   * @param errorType - Error type name
   * @param message - Error message
   * @param details - Additional error details
   * @returns Branded ExceptionValue
   *
   * @example
   * const error = CellValueFactory.exception('ValueError', 'Invalid input', stackTrace)
   * // Returns: ["E", "ValueError", "Invalid input", ...] as ExceptionValue
   */
  exception(errorType: string, message: string, ...details: unknown[]): ExceptionValue {
    return [GristObjCode.Exception, errorType, message, ...details] as const
  },

  /**
   * Create Censored CellValue (for hidden values)
   * Returns branded CensoredValue type
   *
   * @returns Branded CensoredValue
   *
   * @example
   * const censored = CellValueFactory.censored()
   * // Returns: ["C"] as CensoredValue
   */
  censored(): CensoredValue {
    return [GristObjCode.Censored] as const
  },

  /**
   * Type guard for List values
   *
   * @param value - Value to check
   * @returns True if value is ListValue
   *
   * @example
   * if (CellValueFactory.isList(value)) {
   *   const items = value.slice(1) // TypeScript knows this is safe
   * }
   */
  isList(value: unknown): value is ListValue {
    return Array.isArray(value) && value.length > 0 && value[0] === GristObjCode.List
  },

  /**
   * Type guard for Date values
   *
   * @param value - Value to check
   * @returns True if value is DateValue
   */
  isDate(value: unknown): value is DateValue {
    return (
      Array.isArray(value) &&
      value.length === 2 &&
      value[0] === GristObjCode.Date &&
      typeof value[1] === 'number'
    )
  },

  /**
   * Type guard for DateTime values
   *
   * @param value - Value to check
   * @returns True if value is DateTimeValue
   */
  isDateTime(value: unknown): value is DateTimeValue {
    return (
      Array.isArray(value) &&
      value.length === 3 &&
      value[0] === GristObjCode.DateTime &&
      typeof value[1] === 'number' &&
      typeof value[2] === 'string'
    )
  },

  /**
   * Type guard for Reference values
   *
   * @param value - Value to check
   * @returns True if value is ReferenceValue
   */
  isReference(value: unknown): value is ReferenceValue {
    return (
      Array.isArray(value) &&
      value.length === 3 &&
      value[0] === GristObjCode.Reference &&
      typeof value[1] === 'string' &&
      typeof value[2] === 'number'
    )
  },

  /**
   * Type guard for ReferenceList values
   *
   * @param value - Value to check
   * @returns True if value is ReferenceListValue
   */
  isReferenceList(value: unknown): value is ReferenceListValue {
    return (
      Array.isArray(value) &&
      value.length === 3 &&
      value[0] === GristObjCode.ReferenceList &&
      typeof value[1] === 'string' &&
      Array.isArray(value[2])
    )
  }
} as const

/**
 * Helper: Create date from ISO string
 *
 * @param isoString - ISO date string
 * @returns DateValue
 *
 * @example
 * const date = createDateFromISO('2024-01-15')
 * // Returns: ["d", 1705276800000]
 */
export function createDateFromISO(isoString: string): DateValue {
  return CellValueFactory.date(Date.parse(isoString))
}

/**
 * Helper: Create datetime from ISO string
 *
 * @param isoString - ISO datetime string
 * @param timezone - Timezone (default: 'UTC')
 * @returns DateTimeValue
 *
 * @example
 * const dateTime = createDateTimeFromISO('2024-01-15T10:30:00Z', 'UTC')
 * // Returns: ["D", 1705313400000, "UTC"]
 */
export function createDateTimeFromISO(isoString: string, timezone: string = 'UTC'): DateTimeValue {
  return CellValueFactory.dateTime(Date.parse(isoString), timezone)
}

/**
 * Helper: Create list of choices
 *
 * @param choices - Array of choice strings
 * @returns ListValue
 *
 * @example
 * const statuses = createChoiceList(['New', 'In Progress', 'Done'])
 * // Returns: ["L", "New", "In Progress", "Done"]
 */
export function createChoiceList(...choices: string[]): ListValue {
  return CellValueFactory.list(...choices)
}

/**
 * Helper: Extract items from List value
 *
 * @param value - ListValue to extract from
 * @returns Array of items (without "L" prefix)
 *
 * @example
 * const items = extractListItems(["L", "A", "B", "C"])
 * // Returns: ["A", "B", "C"]
 */
export function extractListItems(value: ListValue): (string | number | boolean)[] {
  return value.slice(1) as (string | number | boolean)[]
}

/**
 * Helper: Extract timestamp from Date value
 *
 * @param value - DateValue to extract from
 * @returns Unix timestamp
 *
 * @example
 * const timestamp = extractDateTimestamp(["d", 1705276800000])
 * // Returns: 1705276800000
 */
export function extractDateTimestamp(value: DateValue): number {
  return value[1]
}

/**
 * Helper: Extract timestamp and timezone from DateTime value
 *
 * @param value - DateTimeValue to extract from
 * @returns Object with timestamp and timezone
 *
 * @example
 * const { timestamp, timezone } = extractDateTime(["D", 1705276800000, "UTC"])
 * // Returns: { timestamp: 1705276800000, timezone: "UTC" }
 */
export function extractDateTime(value: DateTimeValue): { timestamp: number; timezone: string } {
  return {
    timestamp: value[1],
    timezone: value[2]
  }
}
