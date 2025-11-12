/**
 * Comprehensive Widget Options Type System for Grist
 *
 * This module provides proper TypeScript types and Zod schemas for all widget options
 * across all 11 Grist column types. Widget options are stored as JSON strings in the
 * Grist API and must be parsed/stringified appropriately.
 *
 * Each column type has different widget options:
 * - Text: alignment, wrap, hyperlink configuration
 * - Numeric: currency, decimal places, formatting
 * - Date: date format, time format, timezone
 * - Choice: choices array, colors
 * - Bool: widget style (switch, checkbox)
 * - And more...
 */

import { z } from 'zod'
import { isValidCurrency, getCurrencyCodeError } from '../constants/iso-4217-currencies.js'

// ============================================================================
// Common Style Properties (shared across many widget types)
// ============================================================================

/**
 * Hex color schema - strict validation
 * Must be 6-digit hexadecimal in format #RRGGBB
 */
const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be hex format (#RRGGBB, e.g., "#FF0000" for red)')
  .optional()

/**
 * Text style options applicable to cell content
 * All color values must be in hex format (#RRGGBB)
 */
const StylePropertiesSchema = z.object({
  textColor: HexColorSchema.describe('Text color in hex format (e.g., "#FF0000")'),
  fillColor: HexColorSchema.describe('Background/fill color in hex format (e.g., "#FFFF00")'),
  fontBold: z.boolean().optional().describe('Bold text formatting'),
  fontItalic: z.boolean().optional().describe('Italic text formatting'),
  fontUnderline: z.boolean().optional().describe('Underline text formatting'),
  fontStrikethrough: z.boolean().optional().describe('Strikethrough text formatting')
}).strict()

/**
 * Header style options applicable to column headers
 * All color values must be in hex format (#RRGGBB)
 */
const HeaderStylePropertiesSchema = z.object({
  headerTextColor: HexColorSchema.describe('Header text color in hex format'),
  headerFillColor: HexColorSchema.describe('Header background color in hex format'),
  headerFontBold: z.boolean().optional().describe('Bold header text'),
  headerFontUnderline: z.boolean().optional().describe('Underline header text'),
  headerFontItalic: z.boolean().optional().describe('Italic header text'),
  headerFontStrikethrough: z.boolean().optional().describe('Strikethrough header text')
}).strict()

/**
 * Common alignment option
 */
const AlignmentSchema = z.enum(['left', 'center', 'right']).optional()

// ============================================================================
// Widget Type Enums
// ============================================================================

/**
 * Widget types available for different column types
 */
const TextWidgetTypeSchema = z.enum(['TextBox', 'Markdown', 'HyperLink']).optional()
const NumericWidgetTypeSchema = z.enum(['Spinner']).optional()
const BoolWidgetTypeSchema = z.enum(['CheckBox', 'Switch']).optional()

// ============================================================================
// Text Column Widget Options
// ============================================================================

/**
 * Widget options for Text columns
 * Supports TextBox (default), Markdown, and HyperLink widgets
 */
export const TextWidgetOptionsSchema = StylePropertiesSchema.extend({
  widget: TextWidgetTypeSchema.describe('Widget type for display'),
  alignment: AlignmentSchema.describe('Text alignment'),
  wrap: z.boolean().optional().describe('Enable text wrapping')
}).merge(HeaderStylePropertiesSchema).strict()

export type TextWidgetOptions = z.infer<typeof TextWidgetOptionsSchema>

// ============================================================================
// Numeric Column Widget Options
// ============================================================================

/**
 * Number format modes for numeric columns
 * Matches NumberFormat type from grist-types.d.ts
 */
const NumberFormatSchema = z.enum(['currency', 'decimal', 'percent', 'scientific', 'text']).nullable().optional()

/**
 * Widget options for Numeric and Int columns
 * Supports various number formatting modes
 */
export const NumericWidgetOptionsSchema = StylePropertiesSchema.extend({
  widget: NumericWidgetTypeSchema.describe('Widget type for display'),
  numMode: NumberFormatSchema.describe('Number display mode (currency, decimal, percent, scientific)'),
  currency: z
    .string()
    .length(3)
    .transform(code => code.toUpperCase())
    .refine(isValidCurrency, (code) => ({
      message: getCurrencyCodeError(code)
    }))
    .optional()
    .describe('ISO 4217 currency code (e.g., "USD", "EUR", "GBP" - case-insensitive)'),
  numSign: z.enum(['parens']).nullable().optional().describe('Number sign display (null for minus, "parens" for parentheses)'),
  decimals: z
    .number()
    .int()
    .min(0)
    .max(20)
    .optional()
    .describe('Minimum number of decimal places to display (0-20)'),
  maxDecimals: z
    .number()
    .int()
    .min(0)
    .max(20)
    .optional()
    .describe('Maximum number of decimal places to display (0-20)'),
  alignment: AlignmentSchema.describe('Number alignment')
}).merge(HeaderStylePropertiesSchema).strict()
  .superRefine((data, ctx) => {
    // Cross-field validation: currency mode requires currency code
    if (data.numMode === 'currency' && !data.currency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'currency field is required when numMode is "currency"',
        path: ['currency']
      })
    }
  })

export type NumericWidgetOptions = z.infer<typeof NumericWidgetOptionsSchema>

// ============================================================================
// Boolean Column Widget Options
// ============================================================================

/**
 * Widget options for Bool columns
 * Supports CheckBox (default) and Switch widgets
 */
export const BoolWidgetOptionsSchema = StylePropertiesSchema.extend({
  widget: BoolWidgetTypeSchema.describe('Widget type for boolean display (CheckBox or Switch)'),
  alignment: AlignmentSchema.describe('Widget alignment')
}).merge(HeaderStylePropertiesSchema).strict()

export type BoolWidgetOptions = z.infer<typeof BoolWidgetOptionsSchema>

// ============================================================================
// Date Column Widget Options
// ============================================================================

/**
 * Widget options for Date columns
 * Controls date format and display
 */
export const DateWidgetOptionsSchema = StylePropertiesSchema.extend({
  dateFormat: z
    .string()
    .max(100)
    .optional()
    .describe('Date format string (e.g., "YYYY-MM-DD", "MMM D, YYYY") - max 100 chars'),
  isCustomDateFormat: z.boolean().optional().describe('Whether the date format is custom'),
  alignment: AlignmentSchema.describe('Date alignment')
}).merge(HeaderStylePropertiesSchema).strict()
  .superRefine((data, ctx) => {
    // Cross-field validation: custom date format requires dateFormat
    if (data.isCustomDateFormat === true && !data.dateFormat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dateFormat field is required when isCustomDateFormat is true',
        path: ['dateFormat']
      })
    }
  })

export type DateWidgetOptions = z.infer<typeof DateWidgetOptionsSchema>

// ============================================================================
// DateTime Column Widget Options
// ============================================================================

/**
 * Widget options for DateTime columns
 * Controls both date and time format
 */
export const DateTimeWidgetOptionsSchema = StylePropertiesSchema.extend({
  dateFormat: z
    .string()
    .max(100)
    .optional()
    .describe('Date format string - max 100 chars'),
  isCustomDateFormat: z.boolean().optional().describe('Whether the date format is custom'),
  timeFormat: z
    .string()
    .max(100)
    .optional()
    .describe('Time format string (e.g., "HH:mm:ss", "h:mm A") - max 100 chars'),
  isCustomTimeFormat: z.boolean().optional().describe('Whether the time format is custom'),
  alignment: AlignmentSchema.describe('DateTime alignment')
}).merge(HeaderStylePropertiesSchema).strict()
  .superRefine((data, ctx) => {
    // Cross-field validation: custom date format requires dateFormat
    if (data.isCustomDateFormat === true && !data.dateFormat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dateFormat field is required when isCustomDateFormat is true',
        path: ['dateFormat']
      })
    }
    // Cross-field validation: custom time format requires timeFormat
    if (data.isCustomTimeFormat === true && !data.timeFormat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'timeFormat field is required when isCustomTimeFormat is true',
        path: ['timeFormat']
      })
    }
  })

export type DateTimeWidgetOptions = z.infer<typeof DateTimeWidgetOptionsSchema>

// ============================================================================
// Choice Column Widget Options
// ============================================================================

/**
 * Style configuration for individual choices
 */
const ChoiceOptionsSchema = z.record(
  z.string(),
  StylePropertiesSchema
).optional()

/**
 * Widget options for Choice columns
 * Supports a list of choices with optional styling per choice
 */
export const ChoiceWidgetOptionsSchema = StylePropertiesSchema.extend({
  choices: z
    .array(z.string().min(1).max(255))
    .max(1000)
    .optional()
    .describe('Available choices for the column (max 1000 choices, each max 255 chars)'),
  choiceOptions: ChoiceOptionsSchema.describe('Style configuration for individual choices'),
  alignment: AlignmentSchema.describe('Choice alignment')
}).merge(HeaderStylePropertiesSchema).strict()

export type ChoiceWidgetOptions = z.infer<typeof ChoiceWidgetOptionsSchema>

// ============================================================================
// ChoiceList Column Widget Options
// ============================================================================

/**
 * Widget options for ChoiceList columns
 * Same as Choice but allows multiple selections
 */
export const ChoiceListWidgetOptionsSchema = ChoiceWidgetOptionsSchema

export type ChoiceListWidgetOptions = z.infer<typeof ChoiceListWidgetOptionsSchema>

// ============================================================================
// Reference Column Widget Options
// ============================================================================

/**
 * Widget options for Ref columns
 * Controls which column from the referenced table to display
 */
export const RefWidgetOptionsSchema = StylePropertiesSchema.extend({
  alignment: AlignmentSchema.describe('Reference display alignment'),
  visibleCol: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Column name or numeric ID to display (extracted during processing)')
}).merge(HeaderStylePropertiesSchema).strict()

export type RefWidgetOptions = z.infer<typeof RefWidgetOptionsSchema>

// ============================================================================
// ReferenceList Column Widget Options
// ============================================================================

/**
 * Widget options for RefList columns
 * Same as Ref but displays multiple references
 */
export const RefListWidgetOptionsSchema = RefWidgetOptionsSchema.extend({})

export type RefListWidgetOptions = z.infer<typeof RefListWidgetOptionsSchema>

// ============================================================================
// Attachments Column Widget Options
// ============================================================================

/**
 * Widget options for Attachments columns
 * Controls attachment display height
 */
export const AttachmentsWidgetOptionsSchema = StylePropertiesSchema.extend({
  height: z
    .number()
    .int()
    .min(1)
    .max(5000)
    .optional()
    .describe('Attachment display height in pixels (1-5000)'),
  alignment: AlignmentSchema.describe('Attachment alignment')
}).merge(HeaderStylePropertiesSchema).strict()

export type AttachmentsWidgetOptions = z.infer<typeof AttachmentsWidgetOptionsSchema>

// ============================================================================
// Discriminated Union for All Widget Options
// ============================================================================

/**
 * Discriminated union of all widget options based on column type
 * This provides compile-time type safety when working with widget options
 */
export type WidgetOptionsByType =
  | { type: 'Text'; options: TextWidgetOptions }
  | { type: 'Numeric'; options: NumericWidgetOptions }
  | { type: 'Int'; options: NumericWidgetOptions }
  | { type: 'Bool'; options: BoolWidgetOptions }
  | { type: 'Date'; options: DateWidgetOptions }
  | { type: 'DateTime'; options: DateTimeWidgetOptions }
  | { type: 'Choice'; options: ChoiceWidgetOptions }
  | { type: 'ChoiceList'; options: ChoiceListWidgetOptions }
  | { type: 'Ref'; options: RefWidgetOptions }
  | { type: 'RefList'; options: RefListWidgetOptions }
  | { type: 'Attachments'; options: AttachmentsWidgetOptions }

/**
 * Union type of all widget options (without discriminator)
 */
export type AnyWidgetOptions =
  | TextWidgetOptions
  | NumericWidgetOptions
  | BoolWidgetOptions
  | DateWidgetOptions
  | DateTimeWidgetOptions
  | ChoiceWidgetOptions
  | ChoiceListWidgetOptions
  | RefWidgetOptions
  | RefListWidgetOptions
  | AttachmentsWidgetOptions

// ============================================================================
// Zod Schema for Parsing Widget Options JSON Strings
// ============================================================================

/**
 * Union schema that accepts any valid widget options
 * Used for parsing widgetOptions from API responses
 */
export const WidgetOptionsUnionSchema = z.union([
  TextWidgetOptionsSchema,
  NumericWidgetOptionsSchema,
  BoolWidgetOptionsSchema,
  DateWidgetOptionsSchema,
  DateTimeWidgetOptionsSchema,
  ChoiceWidgetOptionsSchema,
  ChoiceListWidgetOptionsSchema,
  RefWidgetOptionsSchema,
  RefListWidgetOptionsSchema,
  AttachmentsWidgetOptionsSchema
])

/**
 * Schema for widgetOptions as stored in Grist API (JSON string)
 * The API returns widgetOptions as a JSON string that must be parsed
 */
export const WidgetOptionsStringSchema = z
  .string()
  .optional()
  .describe('Widget options as JSON string')

/**
 * Preprocesses widgetOptions value to convert string formats to objects
 * Supports both valid JSON and Python-style dict strings with single quotes
 */
function preprocessWidgetOptions(val: unknown): object {
  // If it's undefined or null, return empty object
  if (val === undefined || val === null || val === '') {
    return {}
  }
  // If it's already an object, return as-is
  if (typeof val === 'object') {
    return val
  }
  // If it's a string, try to parse it
  if (typeof val === 'string') {
    // First, try parsing as valid JSON
    try {
      return JSON.parse(val)
    } catch (jsonError) {
      // If that fails, try converting Python-style dict to JSON
      // Replace single quotes with double quotes
      try {
        const jsonString = val.replace(/'/g, '"')
        const parsed = JSON.parse(jsonString)

        // Log warning if debug mode is enabled
        if (process.env.DEBUG_MCP_PARAMS === 'true') {
          console.warn('[widgetOptions] Converted Python-style dict to JSON:', {
            original: val,
            converted: jsonString
          })
        }

        return parsed
      } catch (conversionError) {
        // If all parsing fails, log error and return empty object
        if (process.env.DEBUG_MCP_PARAMS === 'true') {
          console.error('[widgetOptions] Failed to parse widgetOptions:', {
            value: val,
            jsonError: jsonError instanceof Error ? jsonError.message : String(jsonError),
            conversionError: conversionError instanceof Error ? conversionError.message : String(conversionError)
          })
        }
        return {}
      }
    }
  }
  // Otherwise return empty object
  return {}
}

/**
 * Preprocessor that converts JSON string to object before validation
 * Supports both valid JSON and Python-style dict strings with single quotes
 */
export const WidgetOptionsSchema = z.preprocess(
  preprocessWidgetOptions,
  WidgetOptionsUnionSchema
)

// ============================================================================
// Type-Safe Widget Options Factory Functions
// ============================================================================

/**
 * Get the appropriate widget options schema based on column type
 * Enables type-safe validation and parsing
 */
export function getWidgetOptionsSchema(columnType: string): z.ZodTypeAny {
  // Handle reference types (e.g., "Ref:TableName")
  const baseType = columnType.split(':')[0]

  switch (baseType) {
    case 'Text':
      return TextWidgetOptionsSchema
    case 'Numeric':
    case 'Int':
      return NumericWidgetOptionsSchema
    case 'Bool':
      return BoolWidgetOptionsSchema
    case 'Date':
      return DateWidgetOptionsSchema
    case 'DateTime':
      return DateTimeWidgetOptionsSchema
    case 'Choice':
      return ChoiceWidgetOptionsSchema
    case 'ChoiceList':
      return ChoiceListWidgetOptionsSchema
    case 'Ref':
      return RefWidgetOptionsSchema
    case 'RefList':
      return RefListWidgetOptionsSchema
    case 'Attachments':
      return AttachmentsWidgetOptionsSchema
    default:
      // For unknown types, accept any object
      return z.object({}).passthrough()
  }
}

/**
 * Parse widget options from JSON string with type safety
 * Supports both valid JSON and Python-style dict strings
 */
export function parseWidgetOptions<T = AnyWidgetOptions>(
  widgetOptionsStr: string | undefined | null,
  columnType?: string
): T | null {
  if (!widgetOptionsStr) {
    return null
  }

  // Use the preprocessor to handle both JSON and Python-style dicts
  const preprocessed = preprocessWidgetOptions(widgetOptionsStr)

  // If preprocessing resulted in empty object and input wasn't empty, parsing failed
  if (Object.keys(preprocessed).length === 0 && widgetOptionsStr.trim() !== '{}' && widgetOptionsStr.trim() !== '') {
    return null
  }

  // If column type is provided, validate against specific schema
  if (columnType) {
    const schema = getWidgetOptionsSchema(columnType)
    const result = schema.safeParse(preprocessed)
    return result.success ? (result.data as T) : null
  }

  // Otherwise just return parsed object
  return preprocessed as T
}

/**
 * Stringify widget options to JSON for API requests
 */
export function stringifyWidgetOptions(options: AnyWidgetOptions | null | undefined): string {
  if (!options || Object.keys(options).length === 0) {
    return '{}'
  }

  // Remove undefined values
  const cleanOptions: Record<string, any> = {}
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) {
      cleanOptions[key] = value
    }
  }

  return JSON.stringify(cleanOptions)
}

/**
 * Validate widget options against column type
 */
export function validateWidgetOptions(
  options: unknown,
  columnType: string
): { valid: boolean; errors?: string[] } {
  const schema = getWidgetOptionsSchema(columnType)
  const result = schema.safeParse(options)

  if (result.success) {
    return { valid: true }
  }

  return {
    valid: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
  }
}
