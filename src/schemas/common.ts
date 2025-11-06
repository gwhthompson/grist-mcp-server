/**
 * Common Zod schemas for reuse across all tools
 * Ensures consistent validation and reduces duplication
 */

import { z } from 'zod'

// ============================================================================
// Response Format Schema
// ============================================================================

export const ResponseFormatSchema = z
  .enum(['json', 'markdown'])
  .default('markdown')
  .describe('Output format: "json" for structured data, "markdown" for human-readable text')

// ============================================================================
// Detail Level Schemas
// ============================================================================

export const DetailLevelWorkspaceSchema = z
  .enum(['summary', 'detailed'])
  .default('summary')
  .describe(
    '"summary": Name, ID, doc count only. "detailed": + permissions, timestamps, full metadata'
  )

export const DetailLevelTableSchema = z
  .enum(['names', 'columns', 'full_schema'])
  .default('columns')
  .describe(
    '"names": Table names only. "columns": + column names. "full_schema": + types, formulas, widgetOptions'
  )

// ============================================================================
// Pagination Schema
// ============================================================================

export const PaginationSchema = z
  .object({
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Starting position (0-indexed) for pagination'),

    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .describe('Number of items to return (min: 1, max: 1000)')
  })
  .strict()

// Type inference for pagination params
export type PaginationInput = z.infer<typeof PaginationSchema>

// ============================================================================
// Common ID Schemas
// ============================================================================

export const DocIdSchema = z
  .string()
  .min(1)
  .describe('Document ID from grist_list_documents. Example: "aKt7TZe8YGLp3ak8bDL8TZ"')

export const TableIdSchema = z
  .string()
  .min(1)
  .describe('Table ID from grist_get_tables. Example: "Contacts", "Sales_Data", "Projects"')

export const WorkspaceIdSchema = z
  .string()
  .min(1)
  .describe('Workspace ID from grist_list_workspaces. Example: "123" or "456"')

// ============================================================================
// Column Type Schema
// ============================================================================

// Base column types (simple types)
const BaseColumnTypeSchema = z.enum([
  'Text',
  'Numeric',
  'Int',
  'Bool',
  'Date',
  'DateTime',
  'Choice',
  'ChoiceList',
  'Attachments'
])

// Reference column types (with table name)
// Format: "Ref:TableName" or "RefList:TableName"
const RefColumnTypeSchema = z.string().regex(/^Ref(List)?:[A-Za-z_][A-Za-z0-9_]*$/, {
  message: 'Reference type must be in format "Ref:TableName" or "RefList:TableName"'
})

// Union of all column types
export const ColumnTypeSchema = z
  .union([BaseColumnTypeSchema, RefColumnTypeSchema])
  .describe('Column data type in Grist. Use "Ref:TableName" or "RefList:TableName" for references.')

// ============================================================================
// Widget Options Schemas
// ============================================================================

/**
 * Widget options for Reference and RefList columns
 */
export const RefWidgetOptionsSchema = z
  .object({
    visibleCol: z
      .union([z.string(), z.number()])
      .optional()
      .describe(
        'Which column from foreign table to display for references. ' +
          'String (e.g., "Name") auto-resolves to numeric ID. Number (e.g., 456) used directly.'
      ),
    showColumn: z
      .union([z.string(), z.boolean()])
      .optional()
      .describe('UI visibility control (hide/show in views). Different from visibleCol.')
  })
  .strict()

/**
 * Widget options for Choice and ChoiceList columns
 */
export const ChoiceWidgetOptionsSchema = z
  .object({
    choices: z.array(z.string()).optional().describe('Array of valid choices for the column'),
    choiceColors: z
      .record(z.string(), z.string())
      .optional()
      .describe('Color mapping for choices. Keys are choice values, values are hex colors')
  })
  .strict()

/**
 * Widget options for Numeric and Int columns
 */
export const NumericWidgetOptionsSchema = z
  .object({
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
      .describe('ISO 4217 currency code (e.g., "USD", "EUR", "GBP")')
  })
  .strict()

/**
 * Widget options for Date and DateTime columns
 */
export const DateWidgetOptionsSchema = z
  .object({
    dateFormat: z.string().optional().describe('Date format string (e.g., "YYYY-MM-DD")'),
    isCustomDateFormat: z.boolean().optional().describe('Whether using custom date format'),
    timeFormat: z.string().optional().describe('Time format string (e.g., "h:mma")'),
    isCustomTimeFormat: z.boolean().optional().describe('Whether using custom time format')
  })
  .strict()

/**
 * Widget options for Text columns
 */
export const TextWidgetOptionsSchema = z
  .object({
    alignment: z.enum(['left', 'center', 'right']).optional().describe('Text alignment'),
    wrap: z.boolean().optional().describe('Enable text wrapping'),
    fontBold: z.boolean().optional().describe('Bold text'),
    fontItalic: z.boolean().optional().describe('Italic text'),
    fontUnderline: z.boolean().optional().describe('Underline text'),
    fontStrikethrough: z.boolean().optional().describe('Strikethrough text')
  })
  .strict()

/**
 * Widget options for Bool columns
 */
export const BoolWidgetOptionsSchema = z
  .object({
    widget: z.enum(['TextBox', 'CheckBox']).optional().describe('Widget type for boolean display')
  })
  .strict()

/**
 * Widget options for Attachments columns
 */
export const AttachmentsWidgetOptionsSchema = z
  .object({
    height: z.number().int().positive().optional().describe('Height of attachment preview in pixels')
  })
  .strict()

/**
 * Empty widget options for columns with no special options
 */
export const EmptyWidgetOptionsSchema = z.object({}).strict()

/**
 * Union of all widget options schemas
 * Provides complete type safety for all column types
 */
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

/**
 * Factory function to create the appropriate widget options schema based on column type
 * Enables type-safe widget options validation
 */
export function createWidgetOptionsSchema(columnType: string): z.ZodTypeAny {
  // Reference columns
  if (columnType === 'Ref' || columnType === 'RefList') {
    return RefWidgetOptionsSchema
  }
  // Choice columns
  if (columnType === 'Choice' || columnType === 'ChoiceList') {
    return ChoiceWidgetOptionsSchema
  }
  // Numeric columns
  if (columnType === 'Numeric' || columnType === 'Int') {
    return NumericWidgetOptionsSchema
  }
  // Date/DateTime columns
  if (columnType === 'Date' || columnType === 'DateTime') {
    return DateWidgetOptionsSchema
  }
  // Text columns
  if (columnType === 'Text') {
    return TextWidgetOptionsSchema
  }
  // Boolean columns
  if (columnType === 'Bool') {
    return BoolWidgetOptionsSchema
  }
  // Attachments columns
  if (columnType === 'Attachments') {
    return AttachmentsWidgetOptionsSchema
  }
  // Default: empty options
  return EmptyWidgetOptionsSchema
}

// ============================================================================
// Column Definition Schema (for table creation)
// ============================================================================

export const ColumnDefinitionSchema = z
  .object({
    colId: z
      .string()
      .min(1)
      .describe(
        'Column identifier (e.g., "Email", "Phone_Number"). Use alphanumeric and underscores'
      ),

    type: ColumnTypeSchema,

    label: z.string().optional().describe('Human-readable column label. If omitted, uses colId'),

    isFormula: z.boolean().optional().describe('Set to true if this is a formula column'),

    formula: z
      .string()
      .optional()
      .describe('Formula code (Python) if isFormula is true. Example: "$Price * $Quantity"'),

    widgetOptions: WidgetOptionsSchema.optional().describe(
      'Widget-specific options:\n' +
        '- Ref/RefList: {"visibleCol": "Name"} - Display specific column from foreign table\n' +
        '- Choice/ChoiceList: {"choices": ["Red", "Blue", "Green"]} - Valid options\n' +
        'Example: {"visibleCol": "Name"} for a Ref:People column to show names instead of IDs'
    )
  })
  .strict()

// ============================================================================
// Row IDs Schema (for bulk operations)
// ============================================================================

export const RowIdsSchema = z
  .array(z.number().int().positive())
  .min(1)
  .max(500)
  .describe(
    'Array of row IDs to operate on (max 500 per request). Get row IDs from grist_get_records'
  )

// ============================================================================
// Filter Schema (for record queries)
// ============================================================================

/**
 * Filter value can be:
 * - A simple value (string, number, boolean, null) for equality check
 * - An array of values for OR logic / IN operator
 */
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
  .describe(
    'Filters to apply (automatically converted to Grist format). ' +
      'Simple format: {"ColumnName": value} - Example: {"Status": "Active", "Priority": 1}. ' +
      'Multiple values: {"ColumnName": ["val1", "val2"]} for OR logic - Example: {"Status": ["Active", "Lead"]}. ' +
      'Multiple columns use AND logic: {"Status": "Active", "Region": "West"} matches records with BOTH conditions.'
  )

// ============================================================================
// Column Selection Schema
// ============================================================================

export const ColumnSelectionSchema = z
  .array(z.string())
  .optional()
  .describe(
    'List of column IDs to return. Omit to return all columns. Example: ["Name", "Email", "Phone"]'
  )

// ============================================================================
// Helper: Create standard tool response with validation
// ============================================================================

/**
 * Standard parameters that most tools should include
 */
export const StandardToolParams = z.object({
  response_format: ResponseFormatSchema
})

/**
 * Standard parameters for list-based tools
 */
export const ListToolParams = StandardToolParams.extend({
  ...PaginationSchema.shape
})
