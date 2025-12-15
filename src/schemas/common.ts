import { z } from 'zod'

// Register shared schemas with meaningful IDs for JSON Schema refs
// This replaces opaque names like __schema0 with docId, tableId, etc.

export const ResponseFormatSchema = z.enum(['json', 'markdown']).default('json')

export const DetailLevelWorkspaceSchema = z
  .enum(['summary', 'detailed'])
  .default('summary')
  .describe('summary: name and basic info. detailed: adds permissions, timestamps')

export const DetailLevelTableSchema = z
  .enum(['names', 'columns', 'full_schema'])
  .default('columns')
  .describe(
    'names: table names only. columns: adds column names. full_schema: adds column types and options'
  )

// =============================================================================
// Base Visual Schemas (registered for named $refs, used by column-types and widget-options)
// =============================================================================

export const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .describe('Hex color (#RRGGBB)')

export const AlignmentSchema = z.enum(['left', 'center', 'right']).describe('Text alignment')

export const PaginationSchema = z.strictObject({
  offset: z.number().int().min(0).default(0).describe('Start position'),

  limit: z.number().int().min(1).max(1000).default(100).describe('Max items to return')
})

export type PaginationInput = z.infer<typeof PaginationSchema>

// Grist uses Python for formulas
const PYTHON_KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield'
])

export const DocIdSchema = z
  .string()
  .length(22, {
    message: 'Document ID must be exactly 22 characters (Base58 format)'
  })
  .regex(/^[1-9A-HJ-NP-Za-km-z]{22}$/, {
    message:
      'Document ID must be Base58 format (22 chars, excludes 0OIl which are visually ambiguous)'
  })
  .describe('Document ID (from grist_get_documents)')

export const TableIdSchema = z
  .string()
  .min(1, { message: 'Table ID cannot be empty' })
  .max(64, { message: 'Table ID cannot exceed 64 characters (Python identifier limit)' })
  .regex(/^[A-Z_][A-Za-z0-9_]*$/, {
    message:
      'Table ID must start with uppercase letter or underscore, followed by letters, numbers, or underscores'
  })
  .refine((id) => !PYTHON_KEYWORDS.has(id), {
    error:
      'Table ID cannot be a Python keyword (for, class, if, def, etc.) because Grist uses Python for formulas'
  })
  .describe('Table name (from grist_get_tables)')

export const WorkspaceIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .describe('Workspace ID (from grist_get_workspaces)')

export const ColIdSchema = z
  .string()
  .min(1, { message: 'Column ID cannot be empty' })
  .max(64, { message: 'Column ID cannot exceed 64 characters (Python identifier limit)' })
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message:
      'Column ID must be a valid Python identifier (start with letter or underscore, followed by letters, numbers, or underscores)'
  })
  .refine((id) => !PYTHON_KEYWORDS.has(id), {
    error:
      'Column ID cannot be a Python keyword (for, class, if, def, etc.) because Grist uses Python for formulas'
  })
  .refine((id) => !id.startsWith('gristHelper_'), {
    error: 'Column ID cannot start with gristHelper_ (reserved prefix for Grist internal columns)'
  })
  .describe('Column ID')

// Note: Column type schemas are defined in column-types.ts
// ColumnTypeLiteralSchema is registered as 'columnType' for JSON Schema $refs

// visibleCol is top-level, NOT in widgetOptions
export const RefWidgetOptionsSchema = z.strictObject({
  showColumn: z
    .union([z.string(), z.boolean()])
    .optional()
    .describe('UI visibility control (hide/show in views).')
})

export const ChoiceWidgetOptionsSchema = z.strictObject({
  choices: z
    .array(z.string())
    .optional()
    .describe(
      'Available options. Examples: ["Red", "Blue", "Green"], ["High", "Medium", "Low"], ["Yes", "No", "Maybe"]'
    ),
  choiceColors: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      'Color each option. Example: {"High": "#FF0000", "Low": "#00FF00"} colors High priority red and Low priority green'
    )
})

export const NumericWidgetOptionsSchema = z.strictObject({
  numMode: z
    .enum(['currency', 'decimal', 'percent', 'scientific'])
    .optional()
    .describe('Number display mode'),
  numSign: z.enum(['parens']).optional().describe('Use parentheses for negative numbers'),
  decimals: z
    .number()
    .int()
    .min(0)
    .max(20)
    .optional()
    .describe('Number of decimal places to display'),
  maxDecimals: z
    .number()
    .int()
    .min(0)
    .max(20)
    .optional()
    .describe('Maximum number of decimal places'),
  currency: z
    .string()
    .length(3)
    .optional()
    .describe('3-letter currency code like "USD", "EUR", "GBP", "JPY", "CAD"')
})

export const DateWidgetOptionsSchema = z.strictObject({
  dateFormat: z.string().optional().describe('Date format string (e.g., "YYYY-MM-DD")'),
  isCustomDateFormat: z.boolean().optional().describe('Whether using custom date format'),
  timeFormat: z.string().optional().describe('Time format string (e.g., "h:mma")'),
  isCustomTimeFormat: z.boolean().optional().describe('Whether using custom time format')
})

export const TextWidgetOptionsSchema = z.strictObject({
  alignment: z.enum(['left', 'center', 'right']).optional().describe('Text alignment'),
  wrap: z.boolean().optional().describe('Enable text wrapping'),
  fontBold: z.boolean().optional().describe('Bold text'),
  fontItalic: z.boolean().optional().describe('Italic text'),
  fontUnderline: z.boolean().optional().describe('Underline text'),
  fontStrikethrough: z.boolean().optional().describe('Strikethrough text')
})

export const BoolWidgetOptionsSchema = z.strictObject({
  widget: z.enum(['TextBox', 'CheckBox']).optional().describe('Widget type for boolean display')
})

export const AttachmentsWidgetOptionsSchema = z.strictObject({
  height: z.number().int().positive().optional().describe('Height of attachment preview in pixels')
})

export const EmptyWidgetOptionsSchema = z.strictObject({})

export const WidgetOptionsSchema = z.union([
  RefWidgetOptionsSchema,
  ChoiceWidgetOptionsSchema,
  NumericWidgetOptionsSchema,
  DateWidgetOptionsSchema,
  TextWidgetOptionsSchema,
  BoolWidgetOptionsSchema,
  AttachmentsWidgetOptionsSchema,
  EmptyWidgetOptionsSchema
])

export function createWidgetOptionsSchema(columnType: string): z.ZodType<any, any> {
  if (columnType === 'Ref' || columnType === 'RefList') {
    return RefWidgetOptionsSchema
  }
  if (columnType === 'Choice' || columnType === 'ChoiceList') {
    return ChoiceWidgetOptionsSchema
  }
  if (columnType === 'Numeric' || columnType === 'Int') {
    return NumericWidgetOptionsSchema
  }
  if (columnType === 'Date' || columnType === 'DateTime') {
    return DateWidgetOptionsSchema
  }
  if (columnType === 'Text') {
    return TextWidgetOptionsSchema
  }
  if (columnType === 'Bool') {
    return BoolWidgetOptionsSchema
  }
  if (columnType === 'Attachments') {
    return AttachmentsWidgetOptionsSchema
  }
  return EmptyWidgetOptionsSchema
}

// Note: ColumnDefinitionSchema is defined in column-types.ts with flat options structure
// It's registered as 'ColumnDefinition' for JSON Schema $refs

export const RowIdsSchema = z
  .array(z.number().int().positive())
  .min(1)
  .max(500)
  .describe('Row IDs (max 500, from grist_get_records)')

const FilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
])

export const FilterSchema = z
  .record(z.string(), FilterValueSchema)
  .optional()
  .describe('Column value filters')

export const ColumnSelectionSchema = z
  .array(z.string())
  .optional()
  .describe('Columns to return (omit for all)')

export const StandardToolParams = z.object({
  response_format: ResponseFormatSchema
})

export const ListToolParams = StandardToolParams.extend(PaginationSchema.shape)

/**
 * Parse JSON strings to objects for discriminatedUnion parameters.
 * Claude Code may send oneOf parameters as JSON strings instead of objects.
 * Use with z.preprocess() to handle both string and object inputs.
 */
export function parseJsonString(val: unknown): unknown {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val)
    } catch {
      return val
    }
  }
  return val
}

