/**
 * Contract schemas for Grist CellValue encoding
 * Based on: docs/reference/grist-types.d.ts
 *
 * These schemas validate that Grist's CellValue encoding format matches our expectations.
 * Critical for ensuring correct data handling with Grist's special encoding.
 */

import { z } from 'zod'

/**
 * GristObjCode enum values
 * These single-character codes prefix encoded cell values
 */
export const GristObjCodeSchema = z.enum([
  'L', // List (ChoiceList, RefList data)
  'd', // Date
  'D', // DateTime
  'R', // Reference
  'r', // ReferenceList
  'O', // Dict/Object
  'C', // Censored
  'E', // Exception
  'P', // Pending
  'U', // Unmarshallable
  'V' // Versions
])

export type GristObjCode = z.infer<typeof GristObjCodeSchema>

/**
 * List value contract
 * Format: ["L", item1, item2, ...]
 * Used for: ChoiceList columns
 */
export const ListValueContractSchema = z.tuple([
  z.literal('L'),
  ...z.array(z.union([z.string(), z.number(), z.boolean()])) as never[]
])

export type ListValueContract = readonly [
  'L',
  ...(string | number | boolean)[]
]

/**
 * Date value contract
 * Format: ["d", unixTimestamp]
 * Used for: Date columns
 */
export const DateValueContractSchema = z.tuple([z.literal('d'), z.number()])

export type DateValueContract = readonly ['d', number]

/**
 * DateTime value contract
 * Format: ["D", unixTimestamp, timezone]
 * Used for: DateTime columns
 */
export const DateTimeValueContractSchema = z.tuple([
  z.literal('D'),
  z.number(),
  z.string()
])

export type DateTimeValueContract = readonly ['D', number, string]

/**
 * Reference value contract
 * Format: ["R", tableId, rowId]
 * Used for: Ref columns
 */
export const ReferenceValueContractSchema = z.tuple([
  z.literal('R'),
  z.string(),
  z.number()
])

export type ReferenceValueContract = readonly ['R', string, number]

/**
 * ReferenceList value contract
 * Format: ["r", tableId, [rowId1, rowId2, ...]]
 * Used for: RefList columns
 */
export const ReferenceListValueContractSchema = z.tuple([
  z.literal('r'),
  z.string(),
  z.array(z.number())
])

export type ReferenceListValueContract = readonly ['r', string, number[]]

/**
 * Dict/Object value contract
 * Format: ["O", {key: value, ...}]
 * Used for: Complex object storage
 */
export const DictValueContractSchema = z.tuple([
  z.literal('O'),
  z.record(z.unknown())
])

export type DictValueContract = readonly ['O', Record<string, unknown>]

/**
 * Exception value contract
 * Format: ["E", errorName, errorMessage, ...]
 * Used for: Formula errors
 */
export const ExceptionValueContractSchema = z.tuple([
  z.literal('E'),
  z.string(),
  z.string()
]).rest(z.unknown())

export type ExceptionValueContract = readonly ['E', string, string, ...unknown[]]

/**
 * Censored value contract
 * Format: ["C"]
 * Used for: Hidden/censored values
 */
export const CensoredValueContractSchema = z.tuple([z.literal('C')])

export type CensoredValueContract = readonly ['C']

/**
 * Primitive CellValue types
 * Direct values without encoding
 */
export const PrimitiveCellValueContractSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null()
])

export type PrimitiveCellValueContract = string | number | boolean | null

/**
 * Complete CellValue contract schema
 * Validates all possible CellValue formats
 */
export const CellValueContractSchema = z.union([
  PrimitiveCellValueContractSchema,
  ListValueContractSchema,
  DateValueContractSchema,
  DateTimeValueContractSchema,
  ReferenceValueContractSchema,
  ReferenceListValueContractSchema,
  DictValueContractSchema,
  ExceptionValueContractSchema,
  CensoredValueContractSchema
])

export type CellValueContract = z.infer<typeof CellValueContractSchema>

/**
 * Helper: Validate List encoding
 * Ensures ["L", ...items] format
 */
export function isListValue(value: unknown): value is ListValueContract {
  return Array.isArray(value) && value.length > 0 && value[0] === 'L'
}

/**
 * Helper: Validate Date encoding
 * Ensures ["d", timestamp] format
 */
export function isDateValue(value: unknown): value is DateValueContract {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value[0] === 'd' &&
    typeof value[1] === 'number'
  )
}

/**
 * Helper: Validate DateTime encoding
 * Ensures ["D", timestamp, timezone] format
 */
export function isDateTimeValue(value: unknown): value is DateTimeValueContract {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value[0] === 'D' &&
    typeof value[1] === 'number' &&
    typeof value[2] === 'string'
  )
}

/**
 * Helper: Validate Reference encoding
 * Ensures ["R", tableId, rowId] format
 */
export function isReferenceValue(value: unknown): value is ReferenceValueContract {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value[0] === 'R' &&
    typeof value[1] === 'string' &&
    typeof value[2] === 'number'
  )
}

/**
 * Helper: Validate ReferenceList encoding
 * Ensures ["r", tableId, [rowIds]] format
 */
export function isReferenceListValue(value: unknown): value is ReferenceListValueContract {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value[0] === 'r' &&
    typeof value[1] === 'string' &&
    Array.isArray(value[2])
  )
}

/**
 * Helper: Get CellValue type name
 * Returns human-readable type name for debugging
 */
export function getCellValueTypeName(value: CellValueContract): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'

  if (Array.isArray(value) && value.length > 0) {
    const code = value[0]
    switch (code) {
      case 'L':
        return 'List'
      case 'd':
        return 'Date'
      case 'D':
        return 'DateTime'
      case 'R':
        return 'Reference'
      case 'r':
        return 'ReferenceList'
      case 'O':
        return 'Dict'
      case 'E':
        return 'Exception'
      case 'C':
        return 'Censored'
      default:
        return `Unknown (${code})`
    }
  }

  return 'unknown'
}
