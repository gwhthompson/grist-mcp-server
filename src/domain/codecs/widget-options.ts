/**
 * Widget Options Codecs
 *
 * Zod 4 codecs for bidirectional transformation of column widgetOptions.
 * These are used for column metadata (not cell values - see cell-codecs.ts for those).
 *
 * Direction semantics (Zod 4 convention):
 * - decode(): User → Grist (natural format → storage format) - used for WRITING
 * - encode(): Grist → User (storage format → natural format) - used for READING/VERIFY
 *
 * @example
 * ```typescript
 * // Writing to Grist
 * const gristChoices = ChoicesCodec.parse(["A", "B"])  // ["L", "A", "B"]
 *
 * // Reading from Grist
 * const userChoices = z.encode(ChoicesCodec, ["L", "A", "B"])  // ["A", "B"]
 *
 * // Round-trip verification
 * const original = ["A", "B"]
 * const roundTripped = z.encode(ChoicesCodec, ChoicesCodec.parse(original))
 * assert.deepEqual(roundTripped, original)  // ✓
 * ```
 */

import { z } from 'zod'

// =============================================================================
// Individual Field Codecs
// =============================================================================

/**
 * Choices Codec for Choice/ChoiceList columns
 *
 * User provides natural array: ["Red", "Green", "Blue"]
 * Grist stores with "L" prefix: ["L", "Red", "Green", "Blue"]
 *
 * This codec handles the transformation bidirectionally.
 */
export const ChoicesCodec = z.codec(
  z.array(z.string()), // Input: natural format from user
  z
    .tuple([z.literal('L')])
    .rest(z.string()), // Output: Grist storage format
  {
    decode: (natural) => ['L', ...natural] as ['L', ...string[]], // WRITE: User → Grist
    encode: ([, ...items]) => items // READ: Grist → User
  }
)

/**
 * Currency Codec for Numeric columns with currency display
 *
 * Validates and normalizes ISO 4217 currency codes (3 uppercase letters).
 * User can provide lowercase; we normalize to uppercase.
 *
 * @example
 * CurrencyCodec.parse("usd")  // "USD"
 * CurrencyCodec.parse("EUR")  // "EUR"
 */
export const CurrencyCodec = z.codec(
  z
    .string()
    .min(3)
    .max(3), // Input: 3-char string (case-insensitive)
  z
    .string()
    .length(3), // Output: 3-char uppercase
  {
    decode: (s) => s.toUpperCase(), // WRITE: normalize to uppercase
    encode: (s) => s // READ: passthrough (already uppercase)
  }
)

/**
 * Choice Options Codec for conditional styling on choice columns
 *
 * Maps choice values to display options (colors, icons).
 * Grist uses fillColor/textColor; we support both expanded and natural formats.
 *
 * @example
 * // User input
 * { "Red": { fillColor: "#ff0000" }, "Green": { fillColor: "#00ff00" } }
 *
 * // Stored as-is (no transformation needed, but validated)
 */
export const ChoiceOptionsSchema = z.record(
  z.string(),
  z.looseObject({
    fillColor: z.string().optional(),
    textColor: z.string().optional()
  })
)

// =============================================================================
// Full Widget Options Codec
// =============================================================================

/**
 * Natural widget options format (what users provide)
 */
export const NaturalWidgetOptionsSchema = z.looseObject({
  // Choice/ChoiceList fields
  choices: z.array(z.string()).optional(),
  choiceOptions: ChoiceOptionsSchema.optional(),

  // Numeric fields
  currency: z.string().min(3).max(3).optional(),
  decimals: z.number().int().min(0).max(10).optional(),
  numMode: z.enum(['currency', 'percent', 'decimal', 'scientific']).optional(),

  // Date/DateTime fields
  dateFormat: z.string().optional(),
  timeFormat: z.string().optional(),

  // Attachment fields
  height: z.number().int().positive().optional(),

  // Text fields
  wrap: z.boolean().optional()
})

export type NaturalWidgetOptions = z.infer<typeof NaturalWidgetOptionsSchema>

/**
 * Grist widget options format (storage format)
 *
 * Same structure but choices has "L" prefix.
 */
export const GristWidgetOptionsSchema = z.looseObject({
  // Choice/ChoiceList fields - stored with "L" prefix
  choices: z
    .tuple([z.literal('L')])
    .rest(z.string())
    .optional(),
  choiceOptions: ChoiceOptionsSchema.optional(),

  // Numeric fields - same as natural
  currency: z.string().length(3).optional(),
  decimals: z.number().int().optional(),
  numMode: z.string().optional(),

  // Date/DateTime fields - same as natural
  dateFormat: z.string().optional(),
  timeFormat: z.string().optional(),

  // Attachment fields - same as natural
  height: z.number().int().optional(),

  // Text fields - same as natural
  wrap: z.boolean().optional()
})

export type GristWidgetOptions = z.infer<typeof GristWidgetOptionsSchema>

/**
 * Full Widget Options Codec
 *
 * Transforms the entire widgetOptions object bidirectionally.
 * Handles choices array transformation and currency normalization.
 *
 * @example
 * ```typescript
 * // User provides natural format
 * const natural = { choices: ["A", "B"], currency: "usd" }
 *
 * // Transform for Grist storage
 * const grist = WidgetOptionsCodec.parse(natural)
 * // { choices: ["L", "A", "B"], currency: "USD" }
 *
 * // Transform back for verification/display
 * const decoded = z.encode(WidgetOptionsCodec, grist)
 * // { choices: ["A", "B"], currency: "USD" }
 * ```
 */
export const WidgetOptionsCodec = z.codec(NaturalWidgetOptionsSchema, GristWidgetOptionsSchema, {
  decode: (natural) => {
    const result: Record<string, unknown> = { ...natural }

    // Transform choices: ["A", "B"] → ["L", "A", "B"]
    if (natural.choices) {
      result.choices = ['L', ...natural.choices]
    }

    // Normalize currency to uppercase
    if (natural.currency) {
      result.currency = natural.currency.toUpperCase()
    }

    return result as GristWidgetOptions
  },
  encode: (grist) => {
    const result: Record<string, unknown> = { ...grist }

    // Transform choices: ["L", "A", "B"] → ["A", "B"]
    if (grist.choices && Array.isArray(grist.choices) && grist.choices[0] === 'L') {
      result.choices = grist.choices.slice(1)
    }

    // Currency is already uppercase, passthrough
    return result as NaturalWidgetOptions
  }
})

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Encode natural widget options for Grist API.
 * Convenience wrapper around WidgetOptionsCodec.parse().
 */
export function encodeWidgetOptions(natural: NaturalWidgetOptions): GristWidgetOptions {
  return WidgetOptionsCodec.parse(natural)
}

/**
 * Decode Grist widget options to natural format.
 * Convenience wrapper around z.encode(WidgetOptionsCodec, ...).
 */
export function decodeWidgetOptions(grist: GristWidgetOptions): NaturalWidgetOptions {
  return z.encode(WidgetOptionsCodec, grist)
}

/**
 * Safe encode with validation - returns undefined if input is undefined/null.
 */
export function encodeWidgetOptionsSafe(
  natural: NaturalWidgetOptions | undefined | null
): GristWidgetOptions | undefined {
  if (natural === undefined || natural === null) return undefined
  return encodeWidgetOptions(natural)
}

/**
 * Safe decode with validation - returns undefined if input is undefined/null.
 */
export function decodeWidgetOptionsSafe(
  grist: GristWidgetOptions | undefined | null
): NaturalWidgetOptions | undefined {
  if (grist === undefined || grist === null) return undefined
  return decodeWidgetOptions(grist)
}
