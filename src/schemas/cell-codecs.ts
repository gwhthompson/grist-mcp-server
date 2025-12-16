import { z } from 'zod'
import type { CellValue } from '../types.js'

/**
 * DateCodec: ISO date string ↔ Unix timestamp
 * - decode (parse): "2024-01-15" → 1705276800 (user → API)
 * - encode: 1705276800 → "2024-01-15" (API → user)
 */
export const DateCodec = z.codec(z.iso.date(), z.number(), {
  decode: (iso) => Math.floor(Date.parse(iso) / 1000),
  encode: (ts) => {
    const isoStr = new Date(ts * 1000).toISOString()
    return isoStr.substring(0, 10) // "YYYY-MM-DD"
  }
})

/**
 * DateTimeCodec: ISO datetime string ↔ Unix timestamp
 * - decode (parse): "2024-01-15T10:30:00Z" → 1705318200 (user → API)
 * - encode: 1705318200 → "2024-01-15T10:30:00.000Z" (API → user)
 */
export const DateTimeCodec = z.codec(z.iso.datetime({ offset: true, local: true }), z.number(), {
  decode: (iso) => Math.floor(Date.parse(iso) / 1000),
  encode: (ts) => new Date(ts * 1000).toISOString()
})

/**
 * StringListCodec: string array ↔ ["L", ...strings]
 * - decode (parse): ["A", "B"] → ["L", "A", "B"] (user → API)
 * - encode: ["L", "A", "B"] → ["A", "B"] (API → user)
 */
export const StringListCodec = z.codec(
  z.array(z.string()),
  z.tuple([z.literal('L')]).rest(z.string()),
  {
    decode: (arr) => ['L', ...arr] as ['L', ...string[]],
    encode: ([, ...items]) => items
  }
)

/**
 * NumberListCodec: number array ↔ ["L", ...numbers]
 * - decode (parse): [1, 2, 3] → ["L", 1, 2, 3] (user → API)
 * - encode: ["L", 1, 2, 3] → [1, 2, 3] (API → user)
 */
export const NumberListCodec = z.codec(
  z.array(z.number()),
  z.tuple([z.literal('L')]).rest(z.number()),
  {
    decode: (arr) => ['L', ...arr] as ['L', ...number[]],
    encode: ([, ...items]) => items
  }
)

/** Map column base type → codec for types that need transformation */
export const COLUMN_CODECS = {
  Date: DateCodec,
  DateTime: DateTimeCodec,
  ChoiceList: StringListCodec,
  RefList: NumberListCodec,
  Attachments: NumberListCodec
} as const

/**
 * Transform user value → API format using codec for column type.
 * Uses codec.parse() which validates input then transforms via decode.
 */
export function encodeForApi(value: unknown, columnType: string): CellValue {
  if (value === null || value === undefined) return null

  const baseType = columnType.split(':')[0]
  const codec = COLUMN_CODECS[baseType as keyof typeof COLUMN_CODECS]

  if (codec) {
    const result = codec.safeParse(value)
    if (result.success) return result.data as CellValue
    // Fall through if value doesn't match codec input (e.g., already a timestamp)
  }

  // DateTime also accepts date-only strings
  if (baseType === 'DateTime' && typeof value === 'string') {
    const dateResult = DateCodec.safeParse(value)
    if (dateResult.success) return dateResult.data
  }

  return value as CellValue // Pass through Text, Numeric, Int, Bool, Ref, Choice
}

/**
 * Transform API value → user format using z.encode().
 * Uses codec's encode function to reverse the transformation.
 */
export function decodeFromApi(value: unknown, columnType: string): unknown {
  if (value === null || value === undefined) return value

  const baseType = columnType.split(':')[0]

  // Timestamps for Date/DateTime → ISO strings
  if (typeof value === 'number') {
    if (baseType === 'Date') return z.encode(DateCodec, value)
    if (baseType === 'DateTime') return z.encode(DateTimeCodec, value)
  }

  // Lists: ["L", ...] → plain array
  if (Array.isArray(value) && value[0] === 'L') {
    if (baseType === 'ChoiceList') {
      return z.encode(StringListCodec, value as ['L', ...string[]])
    }
    if (baseType === 'RefList' || baseType === 'Attachments') {
      return z.encode(NumberListCodec, value as ['L', ...number[]])
    }
    // Generic list: just strip the "L"
    return value.slice(1)
  }

  return value
}

/**
 * Transform all record fields for API submission.
 */
export function encodeRecordForApi(
  fields: Record<string, unknown>,
  columnTypes: Map<string, string>
): Record<string, CellValue> {
  const result: Record<string, CellValue> = {}
  for (const [colId, value] of Object.entries(fields)) {
    result[colId] = encodeForApi(value, columnTypes.get(colId) || 'Text')
  }
  return result
}

/**
 * Decode all record fields from API response.
 */
export function decodeRecordFromApi(
  fields: Record<string, unknown>,
  columnTypes: Map<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [colId, value] of Object.entries(fields)) {
    result[colId] = decodeFromApi(value, columnTypes.get(colId) || 'Text')
  }
  return result
}
