/**
 * Domain Codecs
 *
 * Unified interface for all Zod 4 codecs in the domain layer:
 *
 * 1. Cell Value Codecs (from cell-codecs.ts)
 *    - DateCodec, DateTimeCodec: ISO strings ↔ Unix timestamps
 *    - StringListCodec, NumberListCodec: arrays ↔ ["L", ...] format
 *
 * 2. Widget Options Codecs (from widget-options.ts)
 *    - ChoicesCodec: choice arrays ↔ ["L", ...] format
 *    - CurrencyCodec: currency code normalization
 *    - WidgetOptionsCodec: full widgetOptions bidirectional transform
 *
 * Direction semantics (Zod 4 convention):
 * - decode(): User → Grist (natural format → storage format) - used for WRITING
 * - encode(): Grist → User (storage format → natural format) - used for READING/VERIFY
 */

// Re-export cell value decoding utilities
export {
  decodeCellValue,
  decodeRecord,
  decodeRecords
} from '../../schemas/api-responses.js'
// Re-export cell value codecs
export {
  COLUMN_CODECS,
  DateCodec,
  DateTimeCodec,
  decodeFromApi,
  decodeRecordFromApi,
  encodeForApi,
  encodeRecordForApi,
  NumberListCodec,
  StringListCodec
} from '../../schemas/cell-codecs.js'
// Re-export widget options codecs
export {
  ChoiceOptionsSchema,
  ChoicesCodec,
  CurrencyCodec,
  decodeWidgetOptions,
  decodeWidgetOptionsSafe,
  encodeWidgetOptions,
  encodeWidgetOptionsSafe,
  type GristWidgetOptions,
  GristWidgetOptionsSchema,
  type NaturalWidgetOptions,
  NaturalWidgetOptionsSchema,
  WidgetOptionsCodec
} from './widget-options.js'

import type { CellValue } from '../../schemas/api-responses.js'
import { decodeFromApi, encodeForApi } from '../../schemas/cell-codecs.js'

/**
 * Encode all fields in a record for Grist API submission.
 * Uses column type information for proper encoding.
 *
 * @param fields - Record fields as key-value pairs
 * @param columnTypes - Map of column ID to column type (e.g., 'Date', 'ChoiceList')
 * @returns Encoded fields ready for API submission
 */
export function encodeFields(
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
 * Decode all fields in a record from Grist API response.
 * Uses column type information for proper decoding.
 *
 * @param fields - Raw fields from API response
 * @param columnTypes - Map of column ID to column type
 * @returns Decoded fields in user-friendly format
 */
export function decodeFields(
  fields: Record<string, unknown>,
  columnTypes: Map<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [colId, value] of Object.entries(fields)) {
    result[colId] = decodeFromApi(value, columnTypes.get(colId) || 'Text')
  }
  return result
}

/**
 * Strip 'L' prefix from list values without column type information.
 * Used when column types aren't available but we need basic list decoding.
 */
export function decodeListValue(value: unknown): unknown {
  if (Array.isArray(value) && value.length > 0 && value[0] === 'L') {
    return value.slice(1)
  }
  return value
}

/**
 * Add 'L' prefix to array values for Grist API.
 * Used when column types aren't available but we need list encoding.
 */
export function encodeListValue(value: unknown): unknown {
  if (Array.isArray(value) && (value.length === 0 || value[0] !== 'L')) {
    return ['L', ...value]
  }
  return value
}
