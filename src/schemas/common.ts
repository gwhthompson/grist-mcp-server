import { z } from 'zod'

// Register shared schemas with meaningful IDs for JSON Schema refs
// This replaces opaque names like __schema0 with docId, tableId, etc.

export const ResponseFormatSchema = z
  .enum(['json', 'markdown', 'concise'])
  .default('json')
  .describe('json: programmatic. markdown: display. concise: IDs only')

export const DetailLevelWorkspaceSchema = z
  .enum(['summary', 'detailed'])
  .default('summary')
  .describe('summary: basic. detailed: +permissions, timestamps')

export const DetailLevelTableSchema = z
  .enum(['names', 'columns', 'full_schema'])
  .default('columns')
  .describe('names: IDs. columns: +names. full_schema: +types, options')

// =============================================================================
// Base Visual Schemas (registered for named $refs, used by column-types and widget-options)
// =============================================================================

export const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .describe('Hex color (#RRGGBB)')

export const AlignmentSchema = z.enum(['left', 'center', 'right'])

/**
 * Generic JSON object schema for arbitrary key-value data
 */
export const JsonObjectSchema = z.record(z.string(), z.unknown())

/**
 * Create a pagination schema with configurable max limit.
 *
 * @param options.maxLimit - Maximum allowed limit (default 1000)
 * @param options.defaultLimit - Default limit if not specified (default 100)
 *
 * @example
 * // For pages (smaller payloads)
 * const PagesPaginationSchema = createPaginationSchema({ maxLimit: 100 })
 *
 * // For records (larger batches allowed)
 * const RecordsPaginationSchema = createPaginationSchema({ maxLimit: 1000 })
 */
export function createPaginationSchema(options: { maxLimit?: number; defaultLimit?: number } = {}) {
  const { maxLimit = 1000, defaultLimit = 100 } = options

  return z.strictObject({
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(maxLimit).default(defaultLimit)
  })
}

// Default pagination schema (backwards compatible)
export const PaginationSchema = createPaginationSchema()
export type PaginationInput = z.infer<typeof PaginationSchema>

// Specialized variants for different contexts
export const PagesPaginationSchema = createPaginationSchema({ maxLimit: 100, defaultLimit: 50 })
export const RecordsPaginationSchema = createPaginationSchema({ maxLimit: 1000 })

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
    error: 'Document ID must be exactly 22 characters (Base58 format)'
  })
  .regex(/^[1-9A-HJ-NP-Za-km-z]{22}$/, {
    error:
      'Document ID must be Base58 format (22 chars, excludes 0OIl which are visually ambiguous)'
  })
  .brand<'DocId'>()
  .meta({ id: 'DocId' })

/** Branded DocId type - use DocIdSchema.parse() to create */
export type DocId = z.infer<typeof DocIdSchema>

export const TableIdSchema = z
  .string()
  .min(1, { error: 'Table ID cannot be empty' })
  .max(64, { error: 'Table ID cannot exceed 64 characters (Python identifier limit)' })
  .regex(/^[A-Z_][A-Za-z0-9_]*$/, {
    error:
      'Table ID must start with uppercase letter or underscore, followed by letters, numbers, or underscores'
  })
  .refine((id) => !PYTHON_KEYWORDS.has(id), {
    error:
      'Table ID cannot be a Python keyword (for, class, if, def, etc.) because Grist uses Python for formulas'
  })
  .brand<'TableId'>()
  .meta({ id: 'TableId' })

/** Branded TableId type - use TableIdSchema.parse() to create */
export type TableId = z.infer<typeof TableIdSchema>

export const WorkspaceIdSchema = z.coerce.number().int().positive()

export const ColIdSchema = z
  .string()
  .min(1, { error: 'Column ID cannot be empty' })
  .max(64, { error: 'Column ID cannot exceed 64 characters (Python identifier limit)' })
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    error:
      'Column ID must be a valid Python identifier (start with letter or underscore, followed by letters, numbers, or underscores)'
  })
  .refine((id) => !PYTHON_KEYWORDS.has(id), {
    error:
      'Column ID cannot be a Python keyword (for, class, if, def, etc.) because Grist uses Python for formulas'
  })
  .refine((id) => !id.startsWith('gristHelper_'), {
    error: 'Column ID cannot start with gristHelper_ (reserved prefix for Grist internal columns)'
  })
  .brand<'ColId'>()
  .meta({ id: 'ColId' })

/** Branded ColId type - use ColIdSchema.parse() to create */
export type ColId = z.infer<typeof ColIdSchema>

// Note: Column type schemas are defined in column-types.ts
// ColumnTypeLiteralSchema is registered as 'columnType' for JSON Schema $refs

// visibleCol is top-level, NOT in widgetOptions
export const RefWidgetOptionsSchema = z.strictObject({
  showColumn: z.union([z.string(), z.boolean()]).optional().describe('show/hide in views')
})

export const ChoiceWidgetOptionsSchema = z.strictObject({
  choices: z.array(z.string()).optional().describe('e.g. ["High","Medium","Low"]'),
  choiceColors: z.record(z.string(), z.string()).optional().describe('{"High":"#FF0000"}')
})

export const NumericWidgetOptionsSchema = z.strictObject({
  numMode: z.enum(['currency', 'decimal', 'percent', 'scientific']).optional(),
  numSign: z.enum(['parens']).optional().describe('parens for negatives'),
  decimals: z.number().int().min(0).max(20).optional(),
  maxDecimals: z.number().int().min(0).max(20).optional(),
  currency: z.string().length(3).optional().describe('e.g. USD, EUR')
})

export const DateWidgetOptionsSchema = z.strictObject({
  dateFormat: z.string().optional().describe('e.g. YYYY-MM-DD'),
  isCustomDateFormat: z.boolean().optional(),
  timeFormat: z.string().optional().describe('e.g. h:mma'),
  isCustomTimeFormat: z.boolean().optional()
})

export const TextWidgetOptionsSchema = z.strictObject({
  alignment: z.enum(['left', 'center', 'right']).optional(),
  wrap: z.boolean().optional(),
  fontBold: z.boolean().optional(),
  fontItalic: z.boolean().optional(),
  fontUnderline: z.boolean().optional(),
  fontStrikethrough: z.boolean().optional()
})

export const BoolWidgetOptionsSchema = z.strictObject({
  widget: z.enum(['TextBox', 'CheckBox']).optional()
})

export const AttachmentsWidgetOptionsSchema = z.strictObject({
  height: z.number().int().positive().optional().describe('preview height px')
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

export const RowIdsSchema = z.array(z.number().int().positive()).min(1).max(500)

const FilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
])

export const FilterSchema = z.record(z.string(), FilterValueSchema).optional()

export const ColumnSelectionSchema = z.array(z.string()).optional().describe('omit for all')

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

/**
 * Options for jsonSafeArray utility.
 */
export interface JsonSafeArrayOptions {
  min?: number
  max?: number
  description?: string
}

/**
 * Create a JSON-safe array schema that handles MCP client quirks.
 *
 * MCP clients may send arrays as:
 * 1. Native arrays: [{...}, {...}]
 * 2. JSON strings: "[{...}, {...}]" (array-level)
 * 3. Mixed: ["{...}", {...}] (element-level)
 *
 * This handles both levels using the existing codebase pattern of
 * z.preprocess() + parseJsonString, but applied at both levels.
 *
 * @example
 * // Before (only handles element-level):
 * z.array(z.preprocess(parseJsonString, ElementSchema)).min(1).max(10)
 *
 * // After (handles both levels):
 * jsonSafeArray(ElementSchema, { min: 1, max: 10 })
 */
export function jsonSafeArray<T extends z.ZodType>(
  elementSchema: T,
  options: JsonSafeArrayOptions = {}
) {
  const { min, max, description } = options

  // Build inner array with element-level preprocessing
  // This handles: ["{...}", "{...}"] → [{...}, {...}]
  let arraySchema = z.array(z.preprocess(parseJsonString, elementSchema))
  if (min !== undefined) arraySchema = arraySchema.min(min)
  if (max !== undefined) arraySchema = arraySchema.max(max)
  if (description) arraySchema = arraySchema.describe(description)

  // Wrap with array-level preprocessing
  // This handles: "[{...}, {...}]" → [{...}, {...}]
  return z.preprocess(parseJsonString, arraySchema)
}
