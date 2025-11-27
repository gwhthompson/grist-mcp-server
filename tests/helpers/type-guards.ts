/**
 * Type guards for Grist encoded values
 *
 * Used in tests to safely narrow types on encoded cell values.
 * These guards validate that runtime values match Grist's encoding format.
 *
 * @see src/schemas/cell-values.ts for encoding/decoding logic
 */

/**
 * Type guard for Date encoding: ['d', timestamp]
 *
 * @param value - Value to check
 * @returns True if value is a valid Date encoding
 *
 * @example
 * ```typescript
 * const result = CellValueSchema.parse('2024-01-15')
 * if (isDateEncoding(result)) {
 *   const timestamp = result[1]  // Type: number
 * }
 * ```
 */
export function isDateEncoding(value: unknown): value is ['d', number] {
  return (
    Array.isArray(value) && value.length === 2 && value[0] === 'd' && typeof value[1] === 'number'
  )
}

/**
 * Type guard for DateTime encoding: ['D', timestamp, timezone]
 *
 * @param value - Value to check
 * @returns True if value is a valid DateTime encoding
 *
 * @example
 * ```typescript
 * const result = CellValueSchema.parse('2024-01-15T10:30:00Z')
 * if (isDateTimeEncoding(result)) {
 *   const timestamp = result[1]  // Type: number
 *   const timezone = result[2]   // Type: string
 * }
 * ```
 */
export function isDateTimeEncoding(value: unknown): value is ['D', number, string] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value[0] === 'D' &&
    typeof value[1] === 'number' &&
    typeof value[2] === 'string'
  )
}

/**
 * Type guard for ChoiceList encoding: ['L', ...items]
 *
 * @param value - Value to check
 * @returns True if value is a valid ChoiceList encoding
 *
 * @example
 * ```typescript
 * const result = CellValueSchema.parse(['Python', 'SQL'])
 * if (isChoiceListEncoding(result)) {
 *   const items = result.slice(1)  // Type: (string | number | boolean)[]
 * }
 * ```
 */
export function isChoiceListEncoding(
  value: unknown
): value is ['L', ...(string | number | boolean)[]] {
  return Array.isArray(value) && value.length > 0 && value[0] === 'L'
}

/**
 * Type guard for RefList encoding: ['L', ...rowIds]
 *
 * More specific than isChoiceListEncoding - validates all items are numbers (row IDs).
 *
 * @param value - Value to check
 * @returns True if value is a valid RefList encoding with numeric row IDs
 *
 * @example
 * ```typescript
 * const result = CellValueSchema.parse([10, 11, 12])
 * if (isRefListEncoding(result)) {
 *   const rowIds = result.slice(1)  // Type: number[]
 * }
 * ```
 */
export function isRefListEncoding(value: unknown): value is ['L', ...number[]] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value[0] === 'L' &&
    value.slice(1).every((v) => typeof v === 'number')
  )
}

/**
 * Type guard for Reference encoding: ['R', tableId, rowId]
 *
 * @param value - Value to check
 * @returns True if value is a valid Reference encoding
 *
 * @example
 * ```typescript
 * const result = parseReferenceValue(456, 'People')
 * if (isReferenceEncoding(result)) {
 *   const tableId = result[1]  // Type: string
 *   const rowId = result[2]    // Type: number
 * }
 * ```
 */
export function isReferenceEncoding(value: unknown): value is ['R', string, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value[0] === 'R' &&
    typeof value[1] === 'string' &&
    typeof value[2] === 'number'
  )
}
