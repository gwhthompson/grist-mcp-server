import { z } from 'zod'
import { log } from '../utils/shared-logger.js'
import { WidgetOptionsSchema, WidgetOptionsStringSchema } from './widget-options.js'

const KNOWN_OBJ_CODES = new Set(['L', 'l', 'O', 'D', 'd', 'S', 'C', 'R', 'r', 'E', 'P', 'U', 'V'])
// Track unknown codes we've warned about (avoid log spam)
const warnedCellValueCodes = new Set<string>()

// Idempotent: encoded values pass through unchanged
function preprocessCellValue(val: unknown): unknown {
  // Regex first - Date.parse is too permissive
  if (typeof val === 'string') {
    const isISO8601 = /^\d{4}-\d{2}-\d{2}(T|$)/.test(val)
    if (isISO8601) {
      const timestampMs = Date.parse(val)
      if (!Number.isNaN(timestampMs)) {
        const timestampSec = Math.floor(timestampMs / 1000)
        if (val.includes('T')) return ['D', timestampSec, 'UTC']
        return ['d', timestampSec]
      }
    }
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return ['L']

    const firstElem = val[0]

    // Must check structure, not just first letter
    if (typeof firstElem === 'string' && firstElem.length === 1) {
      const isValidEncoding =
        (firstElem === 'd' && val.length === 2 && typeof val[1] === 'number') ||
        (firstElem === 'D' &&
          val.length === 3 &&
          typeof val[1] === 'number' &&
          typeof val[2] === 'string') ||
        firstElem === 'L' ||
        (firstElem === 'R' && val.length === 3) ||
        (firstElem === 'r' && val.length === 3 && Array.isArray(val[2])) ||
        (firstElem === 'O' &&
          val.length === 2 &&
          val[1] !== null &&
          typeof val[1] === 'object' &&
          !Array.isArray(val[1])) ||
        (firstElem === 'l' && val.length >= 2)

      if (isValidEncoding) return val
    }

    if (val.every((v) => typeof v === 'string')) return ['L', ...val]
    if (val.every((v) => typeof v === 'number')) return ['L', ...val]
  }

  return val
}

export function decodeCellValue(val: unknown): unknown {
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0]

    if (first === 'L') return val.slice(1)
    if (first === 'l' && val.length >= 2) return Array.isArray(val[1]) ? val[1] : [val[1]]
    if (first === 'r' && val.length === 3 && typeof val[1] === 'string' && Array.isArray(val[2]))
      return val[2]
    if (
      first === 'R' &&
      val.length === 3 &&
      typeof val[1] === 'string' &&
      typeof val[2] === 'number'
    )
      return val[2]

    if (first === 'd' && val.length === 2 && typeof val[1] === 'number') {
      return new Date(val[1] * 1000).toISOString().split('T')[0]
    }
    if (
      first === 'D' &&
      val.length === 3 &&
      typeof val[1] === 'number' &&
      typeof val[2] === 'string'
    ) {
      return new Date(val[1] * 1000).toISOString()
    }
    if (first === 'O' && val.length === 2 && typeof val[1] === 'object') return val[1]

    // Graceful degradation: warn about unknown codes but return raw value
    if (typeof first === 'string' && first.length === 1 && !KNOWN_OBJ_CODES.has(first)) {
      if (!warnedCellValueCodes.has(first)) {
        warnedCellValueCodes.add(first)
        log.warn('Unknown CellValue encoding code encountered, returning raw value', {
          code: first,
          value: JSON.stringify(val),
          hint: 'This may indicate a new Grist encoding type. The raw value will be passed through.'
        })
      }
    }
  }

  return val
}

export function decodeRecord(record: {
  id: number
  fields: Record<string, unknown>
  errors?: Record<string, string>
}): {
  id: number
  fields: Record<string, unknown>
  errors?: Record<string, string>
} {
  const decodedFields: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(record.fields)) {
    decodedFields[key] = decodeCellValue(value)
  }

  return {
    id: record.id,
    fields: decodedFields,
    ...(record.errors && { errors: record.errors })
  }
}

export function decodeRecords(
  records: Array<{ id: number; fields: Record<string, unknown>; errors?: Record<string, string> }>
): Array<{
  id: number
  fields: Record<string, unknown>
  errors?: Record<string, string>
}> {
  return records.map(decodeRecord)
}

/**
 * Decode cell value using column type information.
 * Handles raw timestamps for Date/DateTime columns that Grist returns as plain numbers.
 * @param value - The raw cell value from Grist API
 * @param columnType - The Grist column type (e.g., "Date", "DateTime:UTC", "Text", "Numeric")
 * @returns Decoded value with dates converted to ISO strings
 */
export function decodeCellValueWithType(value: unknown, columnType: string): unknown {
  // First apply existing decoding for encoded values (e.g., ['L', ...], ['d', ts])
  const decoded = decodeCellValue(value)

  // If it's a number and column is Date/DateTime, convert to ISO string
  // Grist API returns Date/DateTime as raw Unix timestamps (seconds), not encoded arrays
  if (typeof decoded === 'number') {
    if (columnType === 'Date') {
      return new Date(decoded * 1000).toISOString().split('T')[0] // "YYYY-MM-DD"
    }
    if (columnType.startsWith('DateTime')) {
      return new Date(decoded * 1000).toISOString() // "YYYY-MM-DDTHH:mm:ss.sssZ"
    }
  }

  return decoded
}

/**
 * Decode all fields in a record using column type information.
 * @param fields - Record fields from Grist API
 * @param columnTypes - Map of column ID to column type
 * @returns Decoded fields with dates converted to ISO strings
 */
export function decodeRecordFieldsWithTypes(
  fields: Record<string, unknown>,
  columnTypes: Map<string, string>
): Record<string, unknown> {
  const decoded: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    const colType = columnTypes.get(key) || 'Text'
    decoded[key] = decodeCellValueWithType(value, colType)
  }
  return decoded
}

/**
 * User-facing schema for cell values - only natural formats.
 * This is what LLMs see in tool JSON schemas via zod-to-json-schema.
 * MCP SDK uses pipeStrategy: "input" so only this schema is exposed.
 */
export const CellValueInputSchema = z.union([
  z.null().describe('Empty cell'),
  z.string().describe('Text value. For dates use ISO 8601: "2024-01-15" or "2024-01-15T10:30:00Z"'),
  z.number().describe('Numeric value. For Ref columns, use row ID directly'),
  z.boolean().describe('True or false'),
  z
    .array(z.union([z.string(), z.number(), z.boolean()]))
    .describe('List of values for ChoiceList or RefList columns')
])
// Register for named $ref in JSON Schema (replaces __schema0)
CellValueInputSchema.register(z.globalRegistry, {
  id: 'cellValue',
  description: 'Cell value: null, string, number, boolean, or array'
})

/**
 * Internal schema validating Grist-encoded formats (after preprocessing).
 * NOT exposed in JSON Schema - only used internally for validation after transform.
 */
const GristEncodedCellValueSchema = z.union([
  z.null(),
  z.string(),
  z.number(),
  z.boolean(),
  z.tuple([z.literal('L')]).rest(z.union([z.string(), z.number(), z.boolean()])),
  z.tuple([z.literal('l')]).rest(z.unknown()),
  z.tuple([z.literal('d'), z.number()]),
  z.tuple([z.literal('D'), z.number(), z.string()]),
  z.tuple([z.literal('r'), z.string(), z.array(z.number())]),
  z.tuple([z.literal('R'), z.string(), z.number()]),
  z.tuple([z.literal('O'), z.record(z.string(), z.unknown())]),
  z.tuple([z.enum(['E', 'P', 'U', 'C', 'S', 'V'])]).rest(z.unknown())
])

/**
 * CellValueSchema for tool inputs.
 * - JSON Schema shows CellValueInputSchema (natural formats only) via pipeStrategy: "input"
 * - Runtime: transform converts natural -> Grist encoded via preprocessCellValue
 * - Validates transformed output against GristEncodedCellValueSchema
 */
export const CellValueSchema = CellValueInputSchema.transform(preprocessCellValue).pipe(
  GristEncodedCellValueSchema
)

export const WorkspaceSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  org: z.string(),
  access: z.string()
})

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

export const WorkspaceArraySchema = z.array(WorkspaceInfoSchema)

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

export const DocumentArraySchema = z.array(DocumentInfoSchema)

export const TableFieldSchema = z.object({
  id: z.number(),
  colId: z.string(),
  label: z.string(),
  type: z.string(),
  isFormula: z.boolean(),
  formula: z.string().optional(),
  widgetOptions: WidgetOptionsStringSchema
})

export const TableInfoSchema = z.object({
  id: z.string(),
  fields: z.array(TableFieldSchema)
})

export const TableArraySchema = z.array(TableInfoSchema)

export const RecordSchema = z.object({
  id: z.number(),
  fields: z.record(z.string(), CellValueSchema),
  errors: z
    .record(z.string(), z.string())
    .optional()
    .describe('Formula evaluation errors by column ID. Example: {"TotalCost": "NameError"}')
})

export const RecordArraySchema = z.array(RecordSchema)

export const RecordsResponseSchema = z.object({
  records: RecordArraySchema
})

export const UpsertRecordSchema = z.object({
  require: z.record(z.string(), CellValueSchema),
  fields: z.record(z.string(), CellValueSchema)
})

export const UpsertResponseSchema = z.object({
  records: z.array(z.number())
})

export const ColumnInfoSchema = z.object({
  type: z.string(),
  label: z.string().optional(),
  isFormula: z.boolean().optional(),
  formula: z.string().optional(),
  widgetOptions: WidgetOptionsSchema.optional()
})

export const ColumnDefinitionSchema = z.object({
  colId: z.string(),
  type: z.string(),
  label: z.string().optional(),
  isFormula: z.boolean().optional(),
  formula: z.string().optional(),
  widgetOptions: WidgetOptionsSchema.optional()
})

export const UserActionSchema = z.union([
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
  z.tuple([z.literal('AddTable'), z.string(), z.array(ColumnDefinitionSchema)]),
  z.tuple([z.literal('RenameTable'), z.string(), z.string()]),
  z.tuple([z.literal('RemoveTable'), z.string()]),
  z.tuple([z.literal('AddColumn'), z.string(), z.string(), ColumnInfoSchema]),
  z.tuple([z.literal('ModifyColumn'), z.string(), z.string(), ColumnInfoSchema.partial()]),
  z.tuple([z.literal('RemoveColumn'), z.string(), z.string()]),
  z.tuple([z.literal('RenameColumn'), z.string(), z.string(), z.string()])
])

export const ApplyRequestSchema = z.object({
  actions: z.array(UserActionSchema)
})

// retValues type varies by action
export const ApplyResponseSchema = z.object({
  actionNum: z.number(),
  actionHash: z.string().nullable(),
  retValues: z.array(z.unknown()),
  isModification: z.boolean()
})

export const SQLQueryResponseSchema = z.object({
  records: z.array(z.record(z.string(), CellValueSchema)),
  tableId: z.string().optional()
})

export const PaginationMetadataSchema = z.object({
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  has_more: z.boolean(),
  next_offset: z.number().nullable()
})

export function createPaginatedSchema<T extends z.ZodType<any, any>>(itemsSchema: T) {
  return z.object({
    items: itemsSchema,
    pagination: PaginationMetadataSchema
  })
}

export const GristErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional()
})

export function validateApiResponse<T extends z.ZodType<any, any>>(
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

export function safeValidate<T extends z.ZodType<any, any>>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  return { success: false, error: result.error }
}

export function isValidApiResponse<T extends z.ZodType<any, any>>(
  schema: T,
  data: unknown
): data is z.infer<T> {
  return schema.safeParse(data).success
}

export const ViewSectionRecordSchema = z.object({
  id: z.number().int().positive(),
  parentId: z.number().int().nonnegative(),
  tableRef: z.number().int().positive(),
  parentKey: z.string(),
  title: z.string(),
  description: z.string().optional(),
  linkSrcSectionRef: z.number().int().nonnegative().nullable(),
  linkSrcColRef: z.number().int().nonnegative().nullable(),
  linkTargetColRef: z.number().int().nonnegative().nullable(),
  sortColRefs: z.string().nullable(),
  filterSpec: z.string().nullable(),
  borderWidth: z.number().int().nonnegative(),
  chartType: z.string().optional(),
  options: z.string().optional()
})

export const ViewLayoutSpecSchema = z.object({
  id: z.number().int().positive(),
  layoutSpec: z.string()
})

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
export type ViewSectionRecord = z.infer<typeof ViewSectionRecordSchema>
export type ViewLayoutSpec = z.infer<typeof ViewLayoutSpecSchema>
