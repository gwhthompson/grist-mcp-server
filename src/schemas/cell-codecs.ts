/**
 * Cell value codecs for bidirectional transformation using Zod 4 codecs.
 *
 * - .parse() / decode: User format → Grist API format (forward)
 * - z.encode() / encode: Grist API format → User format (reverse)
 */

import { z } from 'zod'
import type { GristRecordData } from '../services/action-builder.js'
import type { CellValue } from './api-responses.js'

// =============================================================================
// Zod 4 Codecs
// =============================================================================

/**
 * Date codec: ISO date string ↔ Unix timestamp (seconds)
 */
export const DateCodec = z.codec(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.number(), {
  decode: (iso: string) => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000),
  encode: (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10)
})

/**
 * DateTime codec: ISO datetime string ↔ Unix timestamp (seconds)
 * Accepts both date-only (YYYY-MM-DD) and full datetime (YYYY-MM-DDTHH:MM:SSZ)
 */
export const DateTimeCodec = z.codec(z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/), z.number(), {
  decode: (iso: string) => {
    const dateStr = iso.includes('T') ? iso : `${iso}T00:00:00Z`
    return Math.floor(new Date(dateStr).getTime() / 1000)
  },
  encode: (ts: number) => new Date(ts * 1000).toISOString()
})

/**
 * String list codec: string[] ↔ ["L", ...strings]
 */
export const StringListCodec = z.codec(
  z.array(z.string()),
  z.tuple([z.literal('L')]).rest(z.string()),
  {
    decode: (arr: string[]): ['L', ...string[]] => ['L', ...arr],
    encode: (lArr) => lArr.slice(1) as string[]
  }
)

/**
 * Number list codec: number[] ↔ ["L", ...numbers]
 */
export const NumberListCodec = z.codec(
  z.array(z.number()),
  z.tuple([z.literal('L')]).rest(z.number()),
  {
    decode: (arr: number[]): ['L', ...number[]] => ['L', ...arr],
    encode: (lArr) => lArr.slice(1) as number[]
  }
)

// =============================================================================
// High-level Functions
// =============================================================================

/**
 * Encode a single value for Grist API (user → API).
 * Uses .parse() for forward transformation.
 */
export function encodeForApi(value: unknown, columnType: string): unknown {
  if (value === null || value === undefined) return value

  if (columnType === 'Date') {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return DateCodec.parse(value)
    }
    return value
  }

  if (columnType.startsWith('DateTime')) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) {
      return DateTimeCodec.parse(value)
    }
    return value
  }

  if (columnType === 'ChoiceList') {
    if (Array.isArray(value) && (value.length === 0 || typeof value[0] === 'string')) {
      if (value[0] === 'L') return value // Already encoded
      return StringListCodec.parse(value as string[])
    }
    return value
  }

  if (columnType.startsWith('RefList') || columnType === 'Attachments') {
    if (Array.isArray(value) && (value.length === 0 || typeof value[0] === 'number')) {
      return NumberListCodec.parse(value as number[])
    }
    return value
  }

  return value
}

/**
 * Decode a single value from Grist API (API → user).
 * Uses z.encode() for reverse transformation.
 */
export function decodeFromApi(value: unknown, columnType: string): unknown {
  if (value === null || value === undefined) return value

  if (columnType === 'Date') {
    if (typeof value === 'number') {
      return z.encode(DateCodec, value)
    }
    return value
  }

  if (columnType.startsWith('DateTime')) {
    if (typeof value === 'number') {
      return z.encode(DateTimeCodec, value)
    }
    return value
  }

  if (columnType === 'ChoiceList') {
    if (Array.isArray(value) && value[0] === 'L') {
      return z.encode(StringListCodec, value as ['L', ...string[]])
    }
    return value
  }

  if (columnType.startsWith('RefList') || columnType === 'Attachments') {
    if (Array.isArray(value) && value[0] === 'L') {
      return z.encode(NumberListCodec, value as ['L', ...number[]])
    }
    return value
  }

  // Strip L-marker from unknown list types
  if (Array.isArray(value) && value[0] === 'L') {
    return value.slice(1)
  }

  return value
}

/**
 * Encode a record for Grist API.
 */
export function encodeRecordForApi(
  record: Record<string, unknown>,
  columnTypes: Map<string, string>
): GristRecordData {
  const result: GristRecordData = {}

  for (const [key, value] of Object.entries(record)) {
    const colType = columnTypes.get(key) || 'Text'
    result[key] = encodeForApi(value, colType) as CellValue
  }

  return result
}

/**
 * Decode a record from Grist API.
 */
export function decodeRecordFromApi(
  record: Record<string, unknown>,
  columnTypes: Map<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(record)) {
    const colType = columnTypes.get(key) || 'Text'
    result[key] = decodeFromApi(value, colType)
  }

  return result
}
