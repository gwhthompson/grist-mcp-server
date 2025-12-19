/**
 * Transform Helpers for Domain Operations
 *
 * Utility functions that apply codecs and schema transformations.
 * These bridge the gap between user input and Grist API format.
 *
 * Usage:
 * ```typescript
 * // In tool method:
 * const transformedOptions = transformWidgetOptionsForGrist(userOptions)
 * const result = await domainOp(ctx, docId, tableId, {
 *   ...input,
 *   widgetOptions: transformedOptions
 * })
 * ```
 */

import {
  decodeWidgetOptionsSafe,
  encodeWidgetOptionsSafe,
  type GristWidgetOptions,
  type NaturalWidgetOptions
} from '../codecs/widget-options.js'

/**
 * Transform user-provided widget options to Grist storage format.
 *
 * Transformations:
 * - choices: ["A", "B"] → ["L", "A", "B"]
 * - currency: "usd" → "USD"
 *
 * @param natural - Widget options in natural user format
 * @returns Widget options in Grist storage format, or undefined if input is nullish
 */
export function transformWidgetOptionsForGrist(
  natural: NaturalWidgetOptions | Record<string, unknown> | undefined | null
): GristWidgetOptions | undefined {
  if (!natural) return undefined

  // If the input doesn't have choices or currency, just return as-is
  const hasTransformableFields = 'choices' in natural || 'currency' in natural
  if (!hasTransformableFields) {
    return natural as GristWidgetOptions
  }

  // Apply codec transformation
  return encodeWidgetOptionsSafe(natural as NaturalWidgetOptions)
}

/**
 * Transform Grist storage format back to natural user format.
 *
 * Transformations:
 * - choices: ["L", "A", "B"] → ["A", "B"]
 * - currency: unchanged (already uppercase)
 *
 * @param grist - Widget options in Grist storage format
 * @returns Widget options in natural user format, or undefined if input is nullish
 */
export function transformWidgetOptionsFromGrist(
  grist: GristWidgetOptions | Record<string, unknown> | undefined | null
): NaturalWidgetOptions | undefined {
  if (!grist) return undefined

  // If the input doesn't have L-prefixed choices, just return as-is
  const hasGristChoices =
    'choices' in grist &&
    Array.isArray(grist.choices) &&
    grist.choices.length > 0 &&
    grist.choices[0] === 'L'

  if (!hasGristChoices) {
    return grist as NaturalWidgetOptions
  }

  // Apply codec transformation
  return decodeWidgetOptionsSafe(grist as GristWidgetOptions)
}

/**
 * Extract and transform widget options from a column definition.
 *
 * Takes a column definition object (which may have top-level widget option fields)
 * and returns properly transformed widgetOptions for Grist.
 *
 * @param columnDef - Column definition with optional top-level widget fields
 * @returns Transformed widgetOptions object
 */
export function extractAndTransformWidgetOptions(
  columnDef: Record<string, unknown>
): Record<string, unknown> | undefined {
  // Collect widget option fields from top level
  const widgetOptionFields = [
    'choices',
    'choiceOptions',
    'currency',
    'decimals',
    'numMode',
    'numSign',
    'maxDecimals',
    'dateFormat',
    'isCustomDateFormat',
    'timeFormat',
    'isCustomTimeFormat',
    'height',
    'wrap',
    'widget',
    'alignment'
  ]

  const natural: Record<string, unknown> = {}
  let hasOptions = false

  // Merge existing widgetOptions if present
  if (columnDef.widgetOptions && typeof columnDef.widgetOptions === 'object') {
    Object.assign(natural, columnDef.widgetOptions)
    hasOptions = true
  }

  // Add top-level fields
  for (const field of widgetOptionFields) {
    if (columnDef[field] !== undefined) {
      natural[field] = columnDef[field]
      hasOptions = true
    }
  }

  if (!hasOptions) return undefined

  // Transform using codec
  return transformWidgetOptionsForGrist(natural as NaturalWidgetOptions)
}
