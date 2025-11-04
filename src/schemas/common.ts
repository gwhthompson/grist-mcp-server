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

export const ColumnTypeSchema = z
  .enum([
    'Text',
    'Numeric',
    'Int',
    'Bool',
    'Date',
    'DateTime',
    'Choice',
    'ChoiceList',
    'Ref',
    'RefList',
    'Attachments'
  ])
  .describe('Column data type in Grist')

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

    widgetOptions: z
      .any()
      .optional()
      .describe(
        'Widget-specific options (JSON object). Example: {"choices": ["Red", "Blue", "Green"]} for Choice columns'
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

export const FilterSchema = z
  .record(z.string(), z.any())
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
