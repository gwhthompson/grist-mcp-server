/**
 * Grist Cell Format Utilities
 *
 * Handles bidirectional conversion between:
 * - SQL endpoint: Returns RefLists as strings "[1,2]", JSON as strings
 * - REST API: Returns RefLists as ['L',1,2], JSON as objects
 *
 * @see grist-api-behavior.md for format documentation
 */

/**
 * Natural format: Plain array of IDs (from SQL endpoint or user input)
 */
export type NaturalRefList = readonly number[]

/**
 * Wire format: Grist REST API encoding with 'L' prefix
 */
export type WireRefList = readonly ['L', ...number[]]

/**
 * Type guard: Check if value is wire format RefList
 */
export function isWireRefList(value: unknown): value is WireRefList {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value[0] === 'L' &&
    value.slice(1).every((v) => typeof v === 'number')
  )
}

/**
 * Type guard: Check if value is natural format RefList
 */
export function isNaturalRefList(value: unknown): value is NaturalRefList {
  return Array.isArray(value) && value.every((v) => typeof v === 'number')
}

/**
 * Parse any RefList format to natural format (plain number array)
 *
 * Handles:
 * - SQL string: "[1,2,3]"
 * - Wire format: ['L', 1, 2, 3]
 * - Natural format: [1, 2, 3]
 * - Null/empty: []
 *
 * @returns Natural format (plain number array) or empty array
 */
export function parseRefList(value: unknown): NaturalRefList {
  // Handle string input from SQL endpoint
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return []
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return []
  }

  // Handle wire format ['L', id1, id2, ...]
  if (isWireRefList(parsed)) {
    return parsed.slice(1) as NaturalRefList
  }

  // Handle natural format [id1, id2, ...] (validate all numbers)
  if (isNaturalRefList(parsed)) {
    return parsed
  }

  return []
}

/**
 * Encode natural format to wire format for REST API / UserActions
 *
 * @returns Wire format ['L', ...ids] or null for empty list
 */
export function encodeRefList(items: NaturalRefList): WireRefList | null {
  return items.length === 0 ? null : (['L', ...items] as WireRefList)
}

/**
 * Parse JSON column from SQL (string) or REST (object)
 *
 * @param value - Raw value from SQL or REST API
 * @param fallback - Default value if parsing fails
 * @returns Parsed object or fallback
 */
export function parseGristJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'object') return value as T
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return fallback
}

/**
 * Encode value to JSON string for Grist storage
 */
export function encodeGristJson(value: unknown): string {
  return JSON.stringify(value)
}
