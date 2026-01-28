/**
 * Column type schemas with loose validation and descriptive guidance.
 *
 * Structure:
 * - Single ColumnDefinitionSchema with all properties
 * - Type-specific options have `.describe()` annotations for LLM guidance
 * - Universal styling options are nested in `style` object
 * - Base schema registered for `$ref` reuse across tools
 *
 * This provides:
 * - Smaller JSON Schema payload (~70-80% reduction)
 * - Clear LLM guidance via descriptions
 * - Runtime validation catches invalid type+option combinations
 */

import { z } from 'zod'
import { getCurrencyCodeError, isValidCurrency } from '../constants/iso-4217-currencies.js'
import { AlignmentSchema, ColIdSchema, HexColorSchema } from './common.js'
import { BaseConditionalRuleSchema } from './conditional-rules.js'

// Re-export for consumers that expect these from column-types
export { AlignmentSchema, HexColorSchema } from './common.js'

/** Regex to parse Ref/RefList type strings (e.g., "Ref:Contacts") */
const REF_TYPE_REGEX = /^(Ref|RefList):(.+)$/

// JSON Schema validation only - transform is done in action builder
// Using .pipe() separates JSON Schema input from runtime output type
export const CurrencyCodeInputSchema = z.string().length(3).describe('e.g. USD, EUR')

// Full validation with transform for runtime use
export const CurrencyCodeSchema = CurrencyCodeInputSchema.transform((code) =>
  code.toUpperCase()
).refine(isValidCurrency, {
  error: (issue) => getCurrencyCodeError(issue.input as string)
})

// =============================================================================
// Rule Style Schema (for conditional formatting)
// =============================================================================

// Base schema with required types - .partial() makes all properties optional
const RuleStyleBaseSchema = z.object({
  textColor: HexColorSchema,
  fillColor: HexColorSchema,
  fontBold: z.boolean(),
  fontItalic: z.boolean(),
  fontUnderline: z.boolean(),
  fontStrikethrough: z.boolean()
})

export const RuleStyleSchema = RuleStyleBaseSchema.partial()

// =============================================================================
// Column Style Schema (universal styling, nested in `style` property)
// =============================================================================

// Base schema with required types - .partial() makes all properties optional
const ColumnStyleBaseSchema = z.object({
  textColor: HexColorSchema,
  fillColor: HexColorSchema,
  fontBold: z.boolean(),
  fontItalic: z.boolean(),
  fontUnderline: z.boolean(),
  fontStrikethrough: z.boolean(),
  headerTextColor: HexColorSchema,
  headerFillColor: HexColorSchema,
  headerFontBold: z.boolean(),
  headerFontItalic: z.boolean(),
  headerFontUnderline: z.boolean(),
  headerFontStrikethrough: z.boolean(),
  alignment: AlignmentSchema,
  rulesOptions: z
    .array(BaseConditionalRuleSchema)
    .describe('{formula, style} rules, first match wins')
})

export const ColumnStyleSchema = ColumnStyleBaseSchema.partial().meta({ id: 'ColumnStyle' })

export type ColumnStyle = z.infer<typeof ColumnStyleSchema>

// Legacy alias for backward compatibility
export const StylePropsSchema = ColumnStyleSchema
export type StyleProps = ColumnStyle

// =============================================================================
// Column Type Enum
// =============================================================================

export const ColumnTypeLiteralSchema = z
  .enum([
    'Any',
    'Text',
    'Numeric',
    'Int',
    'Bool',
    'Date',
    'DateTime',
    'Choice',
    'ChoiceList',
    'Attachments',
    'Ref',
    'RefList'
  ])
  .meta({ id: 'ColumnType' })

export type ColumnTypeLiteral = z.infer<typeof ColumnTypeLiteralSchema>

// Widget type enum for Text, Bool, and Numeric columns
export const WidgetTypeSchema = z.enum([
  'TextBox',
  'Markdown',
  'HyperLink',
  'Spinner',
  'CheckBox',
  'Switch'
])

// Numeric format mode enum
export const NumModeSchema = z
  .enum(['currency', 'decimal', 'percent', 'scientific', 'text'])
  .nullable()

// =============================================================================
// Choice Styling Schema
// =============================================================================

// Base schema with required types - .partial() makes all properties optional
const ChoiceStyleBaseSchema = z.object({
  textColor: HexColorSchema,
  fillColor: HexColorSchema,
  fontBold: z.boolean(),
  fontItalic: z.boolean(),
  fontUnderline: z.boolean(),
  fontStrikethrough: z.boolean()
})

const ChoiceStyleSchema = ChoiceStyleBaseSchema.partial()

export const ChoiceOptionsSchema = z
  .record(z.string(), ChoiceStyleSchema)
  .optional()
  .meta({ id: 'ChoiceOptions' })

// Table name schema for refTable field
export const RefTableSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Z_][A-Za-z0-9_]*$/)

// visibleCol can be column name (string) or column ID (number)
export const VisibleColSchema = z.union([z.string(), z.number()]).meta({ id: 'VisibleCol' })

// =============================================================================
// Column Definition Schema (shared by grist_create_table and grist_manage_columns)
// =============================================================================

/**
 * Unified column definition with all properties.
 * Type-specific options are annotated with which column types they apply to.
 *
 * Example:
 * ```json
 * {
 *   "colId": "Price",
 *   "type": "Numeric",
 *   "numMode": "currency",
 *   "currency": "USD",
 *   "style": {
 *     "textColor": "#00AA00",
 *     "fontBold": true,
 *     "alignment": "right"
 *   }
 * }
 * ```
 */
export const ColumnDefinitionSchema = z
  .object({
    // Core properties (all column types)
    colId: ColIdSchema,
    type: ColumnTypeLiteralSchema,
    label: z.string().optional(),
    isFormula: z.boolean().default(false),
    formula: z.string().optional().describe('e.g. $Price * $Quantity'),

    // Text options
    widget: WidgetTypeSchema.optional().describe('(Text/Bool/Numeric) display widget'),
    wrap: z.boolean().optional().describe('(Text) enable word wrap'),

    // Numeric/Int options
    numMode: NumModeSchema.optional().describe(
      '(Numeric/Int) currency, decimal, percent, scientific, text'
    ),
    currency: CurrencyCodeInputSchema.optional().describe('(Numeric/Int) ISO 4217 code'),
    numSign: z.enum(['parens']).nullable().optional().describe('(Numeric/Int) negative format'),
    decimals: z
      .number()
      .int()
      .min(0)
      .max(20)
      .optional()
      .describe('(Numeric/Int) fixed decimal places'),
    maxDecimals: z
      .number()
      .int()
      .min(0)
      .max(20)
      .optional()
      .describe('(Numeric/Int) max decimal places'),

    // Date/DateTime options
    dateFormat: z.string().max(100).optional().describe('(Date/DateTime) e.g. YYYY-MM-DD'),
    isCustomDateFormat: z.boolean().optional().describe('(Date/DateTime) use custom format'),
    timeFormat: z.string().max(100).optional().describe('(DateTime) e.g. HH:mm:ss'),
    isCustomTimeFormat: z.boolean().optional().describe('(DateTime) use custom format'),

    // Choice/ChoiceList options
    choices: z
      .array(z.string().min(1).max(255))
      .max(1000)
      .optional()
      .describe('(Choice/ChoiceList) available options'),
    choiceOptions: ChoiceOptionsSchema.describe(
      '(Choice/ChoiceList) option styles {fillColor, textColor}'
    ),

    // Ref/RefList options
    refTable: RefTableSchema.optional().describe('(Ref/RefList) target table name - REQUIRED'),
    visibleCol: VisibleColSchema.optional().describe('(Ref/RefList) display column name or ID'),

    // Attachments options
    height: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .optional()
      .describe('(Attachments) preview height px 1-5000'),

    // Universal styling (all column types)
    style: ColumnStyleSchema.optional()
  })
  .meta({ id: 'ColumnDefinition' })

export type ColumnDefinition = z.infer<typeof ColumnDefinitionSchema>

// =============================================================================
// Legacy Type Aliases (backward compatibility)
// =============================================================================

// These types are kept for backward compatibility with existing code
export type AllColumnTypes = ColumnDefinition
export type FlatColumn = ColumnDefinition
export type FlatColumnOptions = ColumnDefinition

// Legacy schema alias
export const AllColumnTypesSchema = ColumnDefinitionSchema

// =============================================================================
// Helpers for converting ColumnDefinition to Grist API format
// =============================================================================

// Type-specific options that go into widgetOptions (not styling)
const TYPE_SPECIFIC_KEYS = new Set([
  'widget',
  'wrap',
  'numMode',
  'currency',
  'numSign',
  'decimals',
  'maxDecimals',
  'dateFormat',
  'isCustomDateFormat',
  'timeFormat',
  'isCustomTimeFormat',
  'choices',
  'choiceOptions',
  'height'
])

// Core column properties (not widgetOptions)
const CORE_COLUMN_KEYS = new Set([
  'colId',
  'type',
  'refTable',
  'label',
  'isFormula',
  'formula',
  'visibleCol'
])

/**
 * Extract widget options from a column definition.
 * Combines type-specific options with nested style properties.
 * Note: rulesOptions is EXCLUDED - it requires special handling via ConditionalFormattingService.
 */
export function extractWidgetOptions(
  column: ColumnDefinition | Record<string, unknown>
): Record<string, unknown> | undefined {
  const widgetOptions: Record<string, unknown> = {}

  // Extract type-specific options
  for (const [key, value] of Object.entries(column)) {
    if (TYPE_SPECIFIC_KEYS.has(key) && value !== undefined) {
      widgetOptions[key] = value
    }
  }

  // Extract nested style properties and flatten them
  // Exclude rulesOptions - it requires special handling via ConditionalFormattingService
  if ('style' in column && column.style && typeof column.style === 'object') {
    for (const [key, value] of Object.entries(column.style)) {
      if (value !== undefined && key !== 'rulesOptions') {
        widgetOptions[key] = value
      }
    }
  }

  return Object.keys(widgetOptions).length > 0 ? widgetOptions : undefined
}

/**
 * Extract rulesOptions from a column definition for conditional formatting.
 * Returns the array of {formula, style, sectionId?} rule definitions, or undefined if not present.
 * When sectionId is provided, the rule applies to that specific widget (field scope).
 * When sectionId is omitted, the rule applies across all views (column scope).
 */
export function extractRulesOptions(
  column: ColumnDefinition | Record<string, unknown>
): Array<{ formula: string; style: Record<string, unknown>; sectionId?: number }> | undefined {
  if ('style' in column && column.style && typeof column.style === 'object') {
    const style = column.style as Record<string, unknown>
    if ('rulesOptions' in style && Array.isArray(style.rulesOptions)) {
      return style.rulesOptions as Array<{
        formula: string
        style: Record<string, unknown>
        sectionId?: number
      }>
    }
  }
  return undefined
}

/**
 * Extract core column properties from a column definition.
 */
export function extractCoreColumnProps(column: ColumnDefinition): {
  colId: string
  type: string
  refTable?: string
  label?: string
  isFormula?: boolean
  formula?: string
  visibleCol?: string | number
} {
  const core: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(column)) {
    if (CORE_COLUMN_KEYS.has(key) && value !== undefined) {
      core[key] = value
    }
  }

  return core as ReturnType<typeof extractCoreColumnProps>
}

/**
 * Convert a column definition to Grist API format.
 * Flattens nested style into widgetOptions.
 */
export function columnToGristFormat(column: ColumnDefinition): {
  colId: string
  type: string
  label?: string
  isFormula?: boolean
  formula?: string
  visibleCol?: string | number
  widgetOptions?: Record<string, unknown>
} {
  const core = extractCoreColumnProps(column)
  const widgetOptions = extractWidgetOptions(column)

  return {
    colId: core.colId,
    type: buildGristType(core),
    ...(core.label !== undefined && { label: core.label }),
    ...(core.isFormula !== undefined && { isFormula: core.isFormula }),
    ...(core.formula !== undefined && { formula: core.formula }),
    ...(core.visibleCol !== undefined && { visibleCol: core.visibleCol }),
    ...(widgetOptions && { widgetOptions })
  }
}

// =============================================================================
// Grist Type Conversion
// =============================================================================

/**
 * Build Grist API type string from split format.
 * Converts {type: 'Ref', refTable: 'Contacts'} → 'Ref:Contacts'
 * Non-reference types pass through unchanged.
 */
export function buildGristType(input: { type: string; refTable?: string }): string {
  if ((input.type === 'Ref' || input.type === 'RefList') && input.refTable) {
    return `${input.type}:${input.refTable}`
  }
  return input.type
}

/**
 * Parse Grist API type string to split format.
 * Converts 'Ref:Contacts' → {type: 'Ref', refTable: 'Contacts'}
 * Non-reference types return {type, refTable: undefined}
 */
export function parseGristType(gristType: string): { type: string; refTable?: string } {
  const match = gristType.match(REF_TYPE_REGEX)
  if (match?.[1] && match[2]) {
    return { type: match[1], refTable: match[2] }
  }
  return { type: gristType }
}
