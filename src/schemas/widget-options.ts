import { z } from 'zod'
import { getCurrencyCodeError, isValidCurrency } from '../constants/iso-4217-currencies.js'
import { log } from '../utils/shared-logger.js'
import { AlignmentSchema as BaseAlignmentSchema } from './common.js'
import { HeaderStyleSchema, type WidgetStyle, WidgetStyleSchema } from './styles.js'

// Re-export for backward compatibility (many files import StylePropertiesSchema from here)
export const StylePropertiesSchema = WidgetStyleSchema
export type StyleProperties = WidgetStyle

// Alias for header style
const HeaderStylePropertiesSchema = HeaderStyleSchema

// Optional alignment schema for widget options (base schema is non-optional)
const AlignmentSchema = BaseAlignmentSchema.optional()

const TextWidgetTypeSchema = z.enum(['TextBox', 'Markdown', 'HyperLink']).optional()
const NumericWidgetTypeSchema = z.enum(['Spinner']).optional()
const BoolWidgetTypeSchema = z.enum(['CheckBox', 'Switch']).optional()

export const TextWidgetOptionsSchema = z.strictObject({
  ...StylePropertiesSchema.shape,
  ...HeaderStylePropertiesSchema.shape,
  widget: TextWidgetTypeSchema.describe('Widget type for display'),
  alignment: AlignmentSchema.describe('Text alignment'),
  wrap: z.boolean().optional().describe('Enable text wrapping'),
  rulesOptions: z
    .array(StylePropertiesSchema)
    .optional()
    .describe('Conditional formatting styles (array index matches rules array)')
})

export type TextWidgetOptions = z.infer<typeof TextWidgetOptionsSchema>

const NumberFormatSchema = z
  .enum(['currency', 'decimal', 'percent', 'scientific', 'text'])
  .nullable()
  .optional()

export const NumericWidgetOptionsSchema = z
  .strictObject({
    ...StylePropertiesSchema.shape,
    ...HeaderStylePropertiesSchema.shape,
    widget: NumericWidgetTypeSchema.describe('Widget type for display'),
    numMode: NumberFormatSchema.describe(
      'Number display mode (currency, decimal, percent, scientific)'
    ),
    currency: z
      .string()
      .length(3)
      .transform((code) => code.toUpperCase())
      .refine(isValidCurrency, {
        error: (issue) => getCurrencyCodeError(issue.input as string)
      })
      .optional()
      .describe('ISO 4217 currency code (e.g., "USD", "EUR", "GBP" - case-insensitive)'),
    numSign: z
      .enum(['parens'])
      .nullable()
      .optional()
      .describe('Number sign display (null for minus, "parens" for parentheses)'),
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
    alignment: AlignmentSchema.describe('Number alignment'),
    rulesOptions: z
      .array(StylePropertiesSchema)
      .optional()
      .describe('Conditional formatting styles (array index matches rules array)')
  })
  .superRefine((data, ctx) => {
    if (data.numMode === 'currency' && !data.currency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'currency field is required when numMode is "currency"',
        path: ['currency']
      })
    }
  })

export type NumericWidgetOptions = z.infer<typeof NumericWidgetOptionsSchema>

export const BoolWidgetOptionsSchema = z.strictObject({
  ...StylePropertiesSchema.shape,
  ...HeaderStylePropertiesSchema.shape,
  widget: BoolWidgetTypeSchema.describe('Widget type for boolean display (CheckBox or Switch)'),
  alignment: AlignmentSchema.describe('Widget alignment'),
  rulesOptions: z
    .array(StylePropertiesSchema)
    .optional()
    .describe('Conditional formatting styles (array index matches rules array)')
})

export type BoolWidgetOptions = z.infer<typeof BoolWidgetOptionsSchema>

export const DateWidgetOptionsSchema = z
  .strictObject({
    ...StylePropertiesSchema.shape,
    ...HeaderStylePropertiesSchema.shape,
    dateFormat: z
      .string()
      .max(100)
      .optional()
      .describe('Date format string (e.g., "YYYY-MM-DD", "MMM D, YYYY") - max 100 chars'),
    isCustomDateFormat: z.boolean().optional().describe('Whether the date format is custom'),
    alignment: AlignmentSchema.describe('Date alignment'),
    rulesOptions: z
      .array(StylePropertiesSchema)
      .optional()
      .describe('Conditional formatting styles (array index matches rules array)')
  })
  .superRefine((data, ctx) => {
    if (data.isCustomDateFormat === true && !data.dateFormat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dateFormat field is required when isCustomDateFormat is true',
        path: ['dateFormat']
      })
    }
  })

export type DateWidgetOptions = z.infer<typeof DateWidgetOptionsSchema>

export const DateTimeWidgetOptionsSchema = z
  .strictObject({
    ...StylePropertiesSchema.shape,
    ...HeaderStylePropertiesSchema.shape,
    dateFormat: z.string().max(100).optional().describe('Date format string - max 100 chars'),
    isCustomDateFormat: z.boolean().optional().describe('Whether the date format is custom'),
    timeFormat: z
      .string()
      .max(100)
      .optional()
      .describe('Time format string (e.g., "HH:mm:ss", "h:mm A") - max 100 chars'),
    isCustomTimeFormat: z.boolean().optional().describe('Whether the time format is custom'),
    alignment: AlignmentSchema.describe('DateTime alignment'),
    rulesOptions: z
      .array(StylePropertiesSchema)
      .optional()
      .describe('Conditional formatting styles (array index matches rules array)')
  })
  .superRefine((data, ctx) => {
    if (data.isCustomDateFormat === true && !data.dateFormat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dateFormat field is required when isCustomDateFormat is true',
        path: ['dateFormat']
      })
    }
    if (data.isCustomTimeFormat === true && !data.timeFormat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'timeFormat field is required when isCustomTimeFormat is true',
        path: ['timeFormat']
      })
    }
  })

export type DateTimeWidgetOptions = z.infer<typeof DateTimeWidgetOptionsSchema>

const ChoiceOptionsSchema = z.record(z.string(), StylePropertiesSchema).optional()

export const ChoiceWidgetOptionsSchema = z.strictObject({
  ...StylePropertiesSchema.shape,
  ...HeaderStylePropertiesSchema.shape,
  choices: z
    .array(z.string().min(1).max(255))
    .max(1000)
    .optional()
    .describe('Available choices for the column (max 1000 choices, each max 255 chars)'),
  choiceOptions: ChoiceOptionsSchema.describe('Style configuration for individual choices'),
  alignment: AlignmentSchema.describe('Choice alignment'),
  rulesOptions: z
    .array(StylePropertiesSchema)
    .optional()
    .describe('Conditional formatting styles (array index matches rules array)')
})

export type ChoiceWidgetOptions = z.infer<typeof ChoiceWidgetOptionsSchema>

export const ChoiceListWidgetOptionsSchema = ChoiceWidgetOptionsSchema

export type ChoiceListWidgetOptions = z.infer<typeof ChoiceListWidgetOptionsSchema>

export const RefWidgetOptionsSchema = z.strictObject({
  ...StylePropertiesSchema.shape,
  ...HeaderStylePropertiesSchema.shape,
  alignment: AlignmentSchema.describe('Reference display alignment'),
  visibleCol: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Column name or numeric ID to display (extracted during processing)'),
  rulesOptions: z
    .array(StylePropertiesSchema)
    .optional()
    .describe('Conditional formatting styles (array index matches rules array)')
})

export type RefWidgetOptions = z.infer<typeof RefWidgetOptionsSchema>

export const RefListWidgetOptionsSchema = RefWidgetOptionsSchema

export type RefListWidgetOptions = z.infer<typeof RefListWidgetOptionsSchema>

export const AttachmentsWidgetOptionsSchema = z.strictObject({
  ...StylePropertiesSchema.shape,
  ...HeaderStylePropertiesSchema.shape,
  height: z
    .number()
    .int()
    .min(1)
    .max(5000)
    .optional()
    .describe('Attachment display height in pixels (1-5000)'),
  alignment: AlignmentSchema.describe('Attachment alignment'),
  rulesOptions: z
    .array(StylePropertiesSchema)
    .optional()
    .describe('Conditional formatting styles (array index matches rules array)')
})

export type AttachmentsWidgetOptions = z.infer<typeof AttachmentsWidgetOptionsSchema>

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

export const WidgetOptionsStringSchema = z
  .string()
  .optional()
  .describe('Widget options as JSON string')

function parseAsJson(val: string): object | null {
  try {
    return JSON.parse(val)
  } catch {
    return null
  }
}

function convertPythonDict(val: string): object | null {
  try {
    const jsonString = val.replace(/'/g, '"')
    return JSON.parse(jsonString)
  } catch {
    return null
  }
}

function logParsingError(val: string, jsonError: unknown, conversionError: unknown): void {
  if (process.env.DEBUG_MCP_PARAMS !== 'true') {
    return
  }

  log.error('Failed to parse widgetOptions', {
    value: val,
    jsonError: jsonError instanceof Error ? jsonError.message : String(jsonError),
    conversionError:
      conversionError instanceof Error ? conversionError.message : String(conversionError)
  })
}

function logPythonConversion(original: string, converted: string): void {
  if (process.env.DEBUG_MCP_PARAMS !== 'true') {
    return
  }

  log.debug('Converted Python-style dict to JSON', {
    original,
    converted
  })
}

function preprocessWidgetOptions(val: unknown): object {
  if (val === undefined || val === null || val === '') {
    return {}
  }

  if (typeof val === 'object') {
    return val
  }

  if (typeof val !== 'string') {
    return {}
  }

  const parsed = parseAsJson(val)
  if (parsed !== null) {
    return parsed
  }

  const jsonError = new Error('Standard JSON parsing failed')
  const converted = convertPythonDict(val)
  if (converted !== null) {
    logPythonConversion(val, val.replace(/'/g, '"'))
    return converted
  }

  const conversionError = new Error('Python dict conversion failed')
  logParsingError(val, jsonError, conversionError)
  return {}
}

export const WidgetOptionsSchema = z.preprocess(preprocessWidgetOptions, WidgetOptionsUnionSchema)

export function getWidgetOptionsSchema(columnType: string): z.ZodType<any, any> {
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
      return z.looseObject({})
  }
}

export function parseWidgetOptions<T = AnyWidgetOptions>(
  widgetOptionsStr: string | undefined | null,
  columnType?: string
): T | null {
  if (!widgetOptionsStr) {
    return null
  }

  const preprocessed = preprocessWidgetOptions(widgetOptionsStr)

  if (
    Object.keys(preprocessed).length === 0 &&
    widgetOptionsStr.trim() !== '{}' &&
    widgetOptionsStr.trim() !== ''
  ) {
    return null
  }

  if (columnType) {
    const schema = getWidgetOptionsSchema(columnType)
    const result = schema.safeParse(preprocessed)
    return result.success ? (result.data as T) : null
  }

  return preprocessed as T
}

export function stringifyWidgetOptions(options: AnyWidgetOptions | null | undefined): string {
  if (!options || Object.keys(options).length === 0) {
    return '{}'
  }

  const cleanOptions: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) {
      cleanOptions[key] = value
    }
  }

  return JSON.stringify(cleanOptions)
}

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
    errors: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`)
  }
}
