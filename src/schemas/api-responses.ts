/**
 * Zod schemas for validating Grist API responses
 *
 * These schemas ensure that data received from the Grist API matches
 * our expected structure, providing runtime type safety and early
 * error detection for API changes.
 */

import { z } from 'zod'
import { WidgetOptionsSchema, WidgetOptionsStringSchema } from './widget-options.js'

// ============================================================================
// Cell Value Schema (LLM-Optimized with Encoding Validation)
// ============================================================================

/**
 * Schema for Grist cell values with encoding validation
 *
 * Validates both primitive values and encoded complex types.
 * Encoded types use Grist's array format: [code, ...data]
 *
 * IMPORTANT: The .describe() on each variant becomes visible to LLMs
 * in the JSON Schema, providing inline documentation for correct encoding.
 *
 * @see docs/reference/grist-types.d.ts for complete GristObjCode specification
 */
export const CellValueSchema = z.union([
  // Primitive values (used directly, no encoding needed)
  z
    .null()
    .describe('Null value (empty cell)'),
  z.string().describe('Text value'),
  z.number().describe('Numeric or Int value'),
  z.boolean().describe('Boolean value (true/false)'),

  // ChoiceList: ["L", item1, item2, ...]
  z
    .tuple([z.literal('L')])
    .rest(z.union([z.string(), z.number(), z.boolean()]))
    .describe(
      'ChoiceList encoding: ["L", item1, item2, ...]. ' +
        'Example: ["L", "VIP", "Active", "Premium"]. ' +
        'Common mistake: Missing "L" prefix causes 500 error!'
    ),

  // Date: ["d", timestamp]
  z
    .tuple([z.literal('d'), z.number()])
    .describe(
      'Date encoding: ["d", timestamp_milliseconds]. ' +
        'Example: ["d", 1705276800000]. ' +
        'Get timestamp: Date.parse("2024-01-15") or Date.now()'
    ),

  // DateTime: ["D", timestamp, timezone]
  z
    .tuple([z.literal('D'), z.number(), z.string()])
    .describe(
      'DateTime encoding: ["D", timestamp_ms, "timezone"]. ' +
        'Example: ["D", 1705276800000, "UTC"] or ["D", 1705276800000, "America/New_York"]. ' +
        'Timezone must be IANA timezone string'
    ),

  // Reference: ["R", row_id] (single reference)
  z
    .tuple([z.literal('R'), z.number()])
    .describe(
      'Reference encoding: ["R", row_id]. ' +
        'Example: ["R", 123] references row 123 in the linked table'
    ),

  // ReferenceList: ["r", [row_ids]] (multiple references)
  z
    .tuple([z.literal('r'), z.array(z.number())])
    .describe(
      'ReferenceList encoding: ["r", [row_id1, row_id2, ...]]. ' +
        'Example: ["r", [1, 2, 3]] references rows 1, 2, and 3'
    ),

  // Dict: ["O", {key: value}] (object storage)
  z
    .tuple([z.literal('O'), z.record(z.unknown())])
    .describe(
      'Dict encoding: ["O", {key: value, ...}]. ' + 'Example: ["O", {"name": "John", "age": 30}]'
    ),

  // Other GristObjCode types (less common)
  // Only accept valid GristObjCode characters, not random strings
  // E=Exception, P=Pending, U=Unmarshallable, C=Censored, S=Skip, V=Versions, l=LookUp
  z
    .tuple([z.enum(['E', 'P', 'U', 'C', 'S', 'V', 'l'])])
    .rest(z.unknown())
    .describe(
      'Other encoded values: Exception ["E", ...], Pending ["P"], Unmarshallable ["U"], Censored ["C"], Skip ["S"], LookUp ["l", ...]'
    )
])

// ============================================================================
// Workspace Schemas
// ============================================================================

/**
 * Minimal workspace structure for summary view
 */
export const WorkspaceSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  org: z.string(),
  access: z.string()
})

/**
 * Full workspace information with all optional fields
 */
export const WorkspaceInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
  org: z.string(),
  orgDomain: z.string().optional(),
  orgName: z.string().optional(),
  access: z.string(),
  docs: z.array(z.lazy(() => DocumentInfoSchema)).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
})

/**
 * Array of workspace info objects
 */
export const WorkspaceArraySchema = z.array(WorkspaceInfoSchema)

// ============================================================================
// Document Schemas
// ============================================================================

/**
 * Document information from API
 */
export const DocumentInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  workspace: z
    .object({
      id: z.number(),
      name: z.string()
    })
    .optional(),
  access: z.string(),
  isPinned: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  urlId: z.string().optional(),
  trunkId: z.string().optional(),
  type: z.string().optional(),
  public: z.boolean().optional()
})

/**
 * Array of document info objects
 */
export const DocumentArraySchema = z.array(DocumentInfoSchema)

// ============================================================================
// Table Schemas
// ============================================================================

/**
 * Table field (column) information
 */
export const TableFieldSchema = z.object({
  id: z.number(),
  colId: z.string(),
  label: z.string(),
  type: z.string(),
  isFormula: z.boolean(),
  formula: z.string().optional(),
  widgetOptions: WidgetOptionsStringSchema
})

/**
 * Table information from API
 */
export const TableInfoSchema = z.object({
  id: z.string(),
  fields: z.array(TableFieldSchema)
})

/**
 * Array of table info objects
 */
export const TableArraySchema = z.array(TableInfoSchema)

// ============================================================================
// Record Schemas
// ============================================================================

/**
 * Single Grist record with ID and fields
 * May include formula errors when formulas fail to evaluate
 */
export const RecordSchema = z.object({
  id: z.number(),
  fields: z.record(z.string(), CellValueSchema),
  errors: z
    .record(z.string(), z.string())
    .optional()
    .describe('Formula evaluation errors by column ID. Example: {"TotalCost": "NameError"}')
})

/**
 * Array of records
 */
export const RecordArraySchema = z.array(RecordSchema)

/**
 * Records response from GET /tables/{tableId}/records
 */
export const RecordsResponseSchema = z.object({
  records: RecordArraySchema
})

/**
 * Upsert record format for PUT /records endpoint
 */
export const UpsertRecordSchema = z.object({
  require: z.record(z.string(), CellValueSchema),
  fields: z.record(z.string(), CellValueSchema)
})

/**
 * Upsert response from PUT /tables/{tableId}/records
 */
export const UpsertResponseSchema = z.object({
  records: z.array(z.number())
})

// ============================================================================
// Column Schemas
// ============================================================================

/**
 * Column information structure
 */
export const ColumnInfoSchema = z.object({
  type: z.string(),
  label: z.string().optional(),
  isFormula: z.boolean().optional(),
  formula: z.string().optional(),
  widgetOptions: WidgetOptionsSchema.optional()
})

/**
 * Column definition for table creation
 */
export const ColumnDefinitionSchema = z.object({
  colId: z.string(),
  type: z.string(),
  label: z.string().optional(),
  isFormula: z.boolean().optional(),
  formula: z.string().optional(),
  widgetOptions: WidgetOptionsSchema.optional()
})

// ============================================================================
// Apply Endpoint Schemas
// ============================================================================

/**
 * UserAction tuple types
 */
export const UserActionSchema = z.union([
  // Record operations
  z.tuple([
    z.literal('BulkAddRecord'),
    z.string(),
    z.array(z.number()),
    z.record(z.string(), z.array(CellValueSchema))
  ]),
  z.tuple([
    z.literal('BulkUpdateRecord'),
    z.string(),
    z.array(z.number()),
    z.record(z.string(), z.array(CellValueSchema))
  ]),
  z.tuple([z.literal('BulkRemoveRecord'), z.string(), z.array(z.number())]),

  // Table operations
  z.tuple([z.literal('AddTable'), z.string(), z.array(ColumnDefinitionSchema)]),
  z.tuple([z.literal('RenameTable'), z.string(), z.string()]),
  z.tuple([z.literal('RemoveTable'), z.string()]),

  // Column operations
  z.tuple([z.literal('AddColumn'), z.string(), z.string(), ColumnInfoSchema]),
  z.tuple([z.literal('ModifyColumn'), z.string(), z.string(), ColumnInfoSchema.partial()]),
  z.tuple([z.literal('RemoveColumn'), z.string(), z.string()]),
  z.tuple([z.literal('RenameColumn'), z.string(), z.string(), z.string()])
])

/**
 * Apply request schema
 */
export const ApplyRequestSchema = z.object({
  actions: z.array(UserActionSchema)
})

/**
 * Apply response schema
 * retValues contains action-specific return values (e.g., array of record IDs for BulkAddRecord)
 * Type varies by action, so z.any() is appropriate here
 */
export const ApplyResponseSchema = z.object({
  actionNum: z.number(),
  retValues: z.array(z.any()) // Type varies by action (record IDs, counts, etc.)
})

// ============================================================================
// SQL Query Schema
// ============================================================================

/**
 * SQL query response from /sql endpoint
 */
export const SQLQueryResponseSchema = z.object({
  records: z.array(z.record(z.string(), CellValueSchema)),
  tableId: z.string().optional()
})

// ============================================================================
// Generic Paginated Response Schema
// ============================================================================

/**
 * Generic schema for paginated responses
 * Use with .extend() to add the specific items array
 */
export const PaginationMetadataSchema = z.object({
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  has_more: z.boolean(),
  next_offset: z.number().nullable()
})

/**
 * Creates a schema for a paginated response
 *
 * @example
 * const PaginatedWorkspacesSchema = createPaginatedSchema(WorkspaceArraySchema)
 */
export function createPaginatedSchema<T extends z.ZodTypeAny>(itemsSchema: T) {
  return z.object({
    items: itemsSchema,
    pagination: PaginationMetadataSchema
  })
}

// ============================================================================
// Error Response Schema
// ============================================================================

/**
 * Error response from Grist API
 * details can contain any structured error information from the server
 */
export const GristErrorSchema = z.object({
  error: z.string(),
  details: z.any().optional() // Error details vary by error type
})

// ============================================================================
// Helper Functions for Validation
// ============================================================================

/**
 * Validates data against a schema and returns typed result
 * Throws descriptive error if validation fails
 *
 * @throws {z.ZodError} if validation fails
 */
export function validateApiResponse<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  context?: string
): z.infer<T> {
  try {
    return schema.parse(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const contextMsg = context ? `Context: ${context}\n` : ''
      const issues = error.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')

      throw new Error(
        `API Response Validation Failed\n${contextMsg}Issues:\n${issues}\n\nReceived data: ${JSON.stringify(data, null, 2)}`
      )
    }
    throw error
  }
}

/**
 * Safely validates data and returns a Result type instead of throwing
 */
export function safeValidate<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  return { success: false, error: result.error }
}

/**
 * Type guard that validates and narrows type in one step
 */
export function isValidApiResponse<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): data is z.infer<T> {
  return schema.safeParse(data).success
}

// ============================================================================
// Export inferred types from schemas
// ============================================================================

export type WorkspaceInfo = z.infer<typeof WorkspaceInfoSchema>
export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>
export type DocumentInfo = z.infer<typeof DocumentInfoSchema>
export type TableInfo = z.infer<typeof TableInfoSchema>
export type TableField = z.infer<typeof TableFieldSchema>
export type GristRecord = z.infer<typeof RecordSchema>
export type CellValue = z.infer<typeof CellValueSchema>
export type UserAction = z.infer<typeof UserActionSchema>
export type ApplyRequest = z.infer<typeof ApplyRequestSchema>
export type ApplyResponse = z.infer<typeof ApplyResponseSchema>
export type SQLQueryResponse = z.infer<typeof SQLQueryResponseSchema>
export type RecordsResponse = z.infer<typeof RecordsResponseSchema>
export type UpsertResponse = z.infer<typeof UpsertResponseSchema>
export type PaginationMetadata = z.infer<typeof PaginationMetadataSchema>
export type GristError = z.infer<typeof GristErrorSchema>
