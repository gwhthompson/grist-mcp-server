import { z } from 'zod'
import { ValidationError } from '../errors/index.js'
import { READ_ONLY_ANNOTATIONS, type ToolContext, type ToolDefinition } from '../registry/types.js'
import { decodeCellValue } from '../schemas/api-responses.js'
import { decodeFromApi } from '../schemas/cell-codecs.js'
import {
  ColumnSelectionSchema,
  DocIdSchema,
  FilterSchema,
  PaginationSchema,
  ResponseFormatSchema,
  TableIdSchema
} from '../schemas/common.js'
import { GetRecordsOutputSchema, QuerySqlOutputSchema } from '../schemas/output-schemas.js'
import { truncateIfNeeded } from '../services/formatter.js'
import { toDocId, toTableId } from '../types/advanced.js'
import type { CellValue, RecordsResponse, SQLQueryResponse } from '../types.js'
import { defineStandardTool } from './factory/index.js'
import { nextSteps } from './utils/next-steps.js'

// =============================================================================
// Module-Level Constants
// =============================================================================

const SQL_LIMIT_REGEX = /\bLIMIT\b/i
const SQL_OFFSET_REGEX = /\bOFFSET\b/i

// =============================================================================
// Shared Types
// =============================================================================

interface GristRecord {
  id: number
  fields: Record<string, CellValue>
  errors?: Record<string, string>
}

interface FlattenedRecord {
  id: number
  _errors?: Record<string, string>
  [key: string]: CellValue | Record<string, string> | undefined
}

interface SqlResponseData {
  total: number
  offset: number
  limit: number
  hasMore: boolean
  nextOffset: number | null
  records: Array<Record<string, CellValue>>
  nextSteps?: string[]
}

interface GetRecordsResponseData {
  docId: string
  tableId: string
  total: number
  offset: number
  limit: number
  hasMore: boolean
  nextOffset: number | null
  filters: Record<string, CellValue | CellValue[]>
  columns: string | string[]
  items: FlattenedRecord[]
  formulaErrors?: {
    recordsWithErrors: number
    affectedColumns: string[]
  }
  nextSteps?: string[]
}

// =============================================================================
// Query SQL Tool
// =============================================================================

export const QuerySQLSchema = z.strictObject({
  docId: DocIdSchema,
  sql: z
    .string()
    .min(1, 'SQL query cannot be empty')
    .max(10000, 'SQL query too long (max 10,000 characters)')
    .describe('SQLite query'),
  parameters: z
    .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional()
    .describe('? placeholder values'),
  response_format: ResponseFormatSchema,
  ...PaginationSchema.shape
})

export type QuerySQLInput = z.infer<typeof QuerySQLSchema>

/**
 * Check if any record values look like Unix timestamps (seconds since epoch).
 * Range: Jan 1, 2000 to Jan 1, 2100 (~946684800 to ~4102444800)
 */
function hasLikelyTimestamps(records: Array<Record<string, CellValue>>): boolean {
  const MIN_TIMESTAMP = 946684800 // 2000-01-01
  const MAX_TIMESTAMP = 4102444800 // 2100-01-01

  for (const record of records) {
    for (const value of Object.values(record)) {
      if (typeof value === 'number' && value >= MIN_TIMESTAMP && value <= MAX_TIMESTAMP) {
        return true
      }
    }
  }
  return false
}

function addPaginationToSql(sql: string, limit: number, offset: number): string {
  const hasLimit = SQL_LIMIT_REGEX.test(sql)
  const hasOffset = SQL_OFFSET_REGEX.test(sql)

  let paginatedSql = sql.trim()
  if (!hasLimit) {
    paginatedSql += ` LIMIT ${limit}`
  }
  if (!hasOffset) {
    paginatedSql += ` OFFSET ${offset}`
  }

  return paginatedSql
}

function checkParameterizedQueryError(error: unknown, parameters?: unknown[]): void {
  if (!parameters || !Array.isArray(parameters) || parameters.length === 0) {
    return
  }

  const errorMsg = error instanceof Error ? error.message : String(error)
  const is400Error = errorMsg.includes('400') || errorMsg.toLowerCase().includes('bad request')

  if (is400Error) {
    throw new Error(
      `SQL query failed - Parameterized queries may not be supported.\n\n` +
        `Your query uses parameters: ${JSON.stringify(parameters)}\n\n` +
        `Parameterized queries require Grist v1.1.0+. If you're using an older version:\n` +
        `1. Remove the "parameters" field\n` +
        `2. Embed values directly in SQL (use proper escaping!)\n` +
        `3. Example: Instead of "WHERE Status = $1", use "WHERE Status = 'VIP'"\n\n` +
        `Original error: ${errorMsg}`
    )
  }
}

export const QUERY_SQL_TOOL = defineStandardTool<typeof QuerySQLSchema, SqlResponseData>({
  name: 'grist_query_sql',
  title: 'Query Grist with SQL',
  description: 'Execute SQL for JOINs, aggregations, and complex queries',
  purpose: 'Run SQL queries with JOINs and aggregations',
  category: 'reading',
  inputSchema: QuerySQLSchema,
  outputSchema: QuerySqlOutputSchema,
  annotations: READ_ONLY_ANNOTATIONS,

  async execute(ctx, params) {
    const sql = addPaginationToSql(params.sql, params.limit, params.offset)

    try {
      const response = await ctx.client.post<SQLQueryResponse>(`/docs/${params.docId}/sql`, {
        sql,
        args: params.parameters || []
      })

      const rawRecords = response.records || []
      const records: Array<Record<string, CellValue>> = rawRecords.map((record) => {
        const decodedRecord: Record<string, CellValue> = {}
        for (const [key, value] of Object.entries(record)) {
          decodedRecord[key] = decodeCellValue(value) as CellValue
        }
        return decodedRecord
      })

      const total =
        records.length === params.limit
          ? params.offset + records.length + 1
          : params.offset + records.length

      const hasMore = records.length === params.limit

      return {
        total,
        offset: params.offset,
        limit: params.limit,
        hasMore: hasMore,
        nextOffset: hasMore ? params.offset + params.limit : null,
        records
      }
    } catch (error) {
      checkParameterizedQueryError(error, params.parameters)
      throw error
    }
  },

  // biome-ignore lint/suspicious/useAwait: Factory type requires async return
  async afterExecute(result, _params, _ctx) {
    // Truncation is handled by the base formatter, just add nextSteps
    return {
      ...result,
      nextSteps: nextSteps()
        .addPaginationHint(result, 'results')
        .addIf(
          result.records.length > 0,
          'Use grist_manage_records to modify data based on query results'
        )
        .addIf(
          result.records.length > 0 && hasLikelyTimestamps(result.records),
          'Dates appear as Unix timestamps. Convert: new Date(timestamp * 1000).toISOString()'
        )
        .build()
    }
  },

  docs: {
    overview:
      'Execute SQL queries for JOINs, aggregations, and complex filters. Use grist_get_records for single-table queries without SQL. Supports parameterized queries with ? placeholders (requires Grist v1.1.0+). **Output format:** SQL returns raw SQLite types: dates are Unix timestamps (seconds), booleans are 0/1. For ISO dates and decoded values, use grist_get_records instead.',
    examples: [
      {
        desc: 'JOIN query',
        input: {
          docId: 'abc123',
          sql: 'SELECT c.Name, o.Total FROM Customers c JOIN Orders o ON c.id = o.Customer'
        }
      },
      {
        desc: 'Aggregation',
        input: {
          docId: 'abc123',
          sql: 'SELECT Region, AVG(Sales) as AvgSales FROM Data GROUP BY Region'
        }
      },
      {
        desc: 'Parameterized',
        input: {
          docId: 'abc123',
          sql: 'SELECT * FROM Contacts WHERE Region = ?',
          parameters: ['West']
        }
      },
      {
        desc: 'Select with row ID and boolean (note: Active returns 0/1)',
        input: {
          docId: 'abc123',
          sql: 'SELECT id, Name, Active FROM Customers WHERE Active = 1'
        }
      }
    ],
    errors: [
      { error: 'SQL syntax error', solution: 'Verify table/column names with grist_get_tables' },
      { error: 'Table not found', solution: 'Use grist_get_tables to see available tables' },
      {
        error: 'Unexpected boolean format (0/1 vs true/false)',
        solution: 'SQL returns raw SQLite types. Compare with 0/1, not true/false'
      },
      {
        error: 'Dates appear as numbers (Unix timestamps)',
        solution: 'SQL returns raw timestamps. Convert: new Date(timestamp * 1000).toISOString()'
      }
    ]
  }
})

export function querySql(context: ToolContext, params: QuerySQLInput) {
  return QUERY_SQL_TOOL.handler(context, params)
}

// =============================================================================
// Get Records Tool
// =============================================================================

export const GetRecordsSchema = z.strictObject({
  docId: DocIdSchema,
  tableId: TableIdSchema,
  filters: FilterSchema,
  columns: ColumnSelectionSchema,
  response_format: ResponseFormatSchema,
  ...PaginationSchema.shape
})

export type GetRecordsInput = z.infer<typeof GetRecordsSchema>

function convertToGristFilters(
  filters?: Record<string, CellValue | CellValue[]>
): Record<string, CellValue[]> {
  if (!filters || Object.keys(filters).length === 0) {
    return {}
  }

  const gristFilters: Record<string, CellValue[]> = {}
  const GRIST_MARKERS = ['L', 'D', 'E', 'P', 'C', 'S', 'Reference', 'ReferenceList']

  for (const [key, value] of Object.entries(filters)) {
    const arrayValue: CellValue[] =
      Array.isArray(value) &&
      value.length > 0 &&
      typeof value[0] === 'string' &&
      GRIST_MARKERS.includes(value[0])
        ? [value as CellValue]
        : Array.isArray(value)
          ? (value as CellValue[])
          : [value as CellValue]

    gristFilters[key] = arrayValue
  }

  return gristFilters
}

function collectErrorColumns(records: GristRecord[]): Set<string> {
  const cols = new Set<string>()
  for (const r of records) {
    if (r.errors) {
      for (const col of Object.keys(r.errors)) {
        cols.add(col)
      }
    }
  }
  return cols
}

function selectColumns(records: GristRecord[], columns?: string[]): GristRecord[] {
  if (!columns || columns.length === 0) {
    return records
  }

  return records.map((record) => ({
    id: record.id,
    fields: Object.fromEntries(
      Object.entries(record.fields).filter(([key]) => columns.includes(key))
    )
  }))
}

function flattenRecords(
  records: GristRecord[],
  columnTypes: Map<string, string>
): FlattenedRecord[] {
  return records.map((record) => {
    const decodedFields: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record.fields)) {
      const colType = columnTypes.get(key) || 'Text'
      decodedFields[key] = decodeFromApi(value, colType)
    }

    return {
      id: record.id,
      ...decodedFields,
      ...(record.errors && Object.keys(record.errors).length > 0 ? { _errors: record.errors } : {})
    }
  })
}

export const GET_RECORDS_TOOL = defineStandardTool<typeof GetRecordsSchema, GetRecordsResponseData>(
  {
    name: 'grist_get_records',
    title: 'Get Grist Records',
    description: 'Fetch records with optional filters',
    purpose: 'Fetch records with filters',
    category: 'reading',
    inputSchema: GetRecordsSchema,
    outputSchema: GetRecordsOutputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
    core: true,

    async execute(ctx, params) {
      // Fetch column types for type-aware decoding (Date/DateTime → ISO strings)
      const columns = await ctx.schemaCache.getTableColumns(
        toDocId(params.docId),
        toTableId(params.tableId)
      )
      const columnTypes = new Map(columns.map((c) => [c.id, c.fields.type]))

      // Validate requested columns exist in the table schema
      if (params.columns && params.columns.length > 0) {
        const validColumnIds = new Set(columns.map((c) => c.id))
        const invalidColumns = params.columns.filter((col) => !validColumnIds.has(col))
        if (invalidColumns.length > 0) {
          throw new ValidationError(
            'columns',
            invalidColumns,
            `Column(s) not found: ${invalidColumns.join(', ')}`,
            { tableId: params.tableId, docId: params.docId },
            `Available columns: ${Array.from(validColumnIds).join(', ')}`
          )
        }
      }

      // Grist API doesn't support offset - implement client-side pagination
      // Fetch offset + limit + 1 records to detect if there are more pages
      const fetchLimit = params.offset + params.limit + 1
      const queryParams: Record<string, unknown> = {
        limit: fetchLimit
      }

      const gristFilters = convertToGristFilters(params.filters)
      if (Object.keys(gristFilters).length > 0) {
        queryParams.filter = JSON.stringify(gristFilters)
      }

      const response = await ctx.client.get<RecordsResponse>(
        `/docs/${params.docId}/tables/${params.tableId}/records`,
        queryParams
      )

      const allRecords = response.records || []
      // Apply offset client-side by slicing
      const slicedRecords = allRecords.slice(params.offset, params.offset + params.limit)
      const selectedRecords = selectColumns(slicedRecords, params.columns)
      const formattedRecords = flattenRecords(selectedRecords, columnTypes)

      // Calculate pagination correctly
      const totalFetched = allRecords.length
      const hasMore = totalFetched > params.offset + params.limit
      const total = totalFetched // Exact count of records that match filters
      const nextOffset = hasMore ? params.offset + params.limit : null

      const recordsWithErrors = selectedRecords.filter(
        (r) => r.errors && Object.keys(r.errors).length > 0
      )
      const errorColumns = collectErrorColumns(selectedRecords)

      return {
        docId: params.docId,
        tableId: params.tableId,
        total,
        offset: params.offset,
        limit: params.limit,
        hasMore: hasMore,
        nextOffset: nextOffset,
        filters: params.filters || {},
        columns: params.columns || 'all',
        items: formattedRecords,
        ...(recordsWithErrors.length > 0
          ? {
              formulaErrors: {
                recordsWithErrors: recordsWithErrors.length,
                affectedColumns: Array.from(errorColumns)
              }
            }
          : {})
      }
    },

    // biome-ignore lint/suspicious/useAwait: Factory type requires async return
    async afterExecute(result, params, _ctx) {
      // Handle truncation within afterExecute since factory doesn't support formatResponse
      const format = params.response_format || 'json'
      const { data: truncatedData } = truncateIfNeeded(result.items, format, {
        docId: result.docId,
        tableId: result.tableId,
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        hasMore: result.hasMore,
        nextOffset: result.nextOffset,
        filters: result.filters,
        columns: result.columns,
        ...(result.formulaErrors ? { formulaErrors: result.formulaErrors } : {})
      })

      return {
        ...truncatedData,
        nextSteps: nextSteps()
          .addPaginationHint(result, 'records')
          .addIf(result.items.length > 0, 'Use grist_manage_records to modify these records')
          .addIf(
            !!result.formulaErrors && result.formulaErrors.recordsWithErrors > 0,
            `Fix formula errors in columns: ${result.formulaErrors?.affectedColumns.join(', ')}`
          )
          .build()
      } as GetRecordsResponseData
    },

    docs: {
      overview:
        'Fetch records with filters. No SQL needed. Use grist_query_sql for JOINs and aggregations. Filter syntax: {"Status": "Active"}, {"Priority": 1}, {"IsActive": true}, {"Status": ["Open", "In Progress"]}.',
      examples: [
        {
          desc: 'Filter by status',
          input: { docId: 'abc123', tableId: 'Contacts', filters: { Status: 'Active' } }
        },
        {
          desc: 'Filter by number',
          input: { docId: 'abc123', tableId: 'Tasks', filters: { Priority: 1 } }
        },
        {
          desc: 'Select columns',
          input: { docId: 'abc123', tableId: 'Contacts', columns: ['Name', 'Email'] }
        }
      ],
      errors: [
        { error: 'Table not found', solution: 'Use grist_get_tables' },
        { error: 'Column not found', solution: "Use grist_get_tables with detail_level='columns'" }
      ]
    }
  }
)

export function getRecords(context: ToolContext, params: GetRecordsInput) {
  return GET_RECORDS_TOOL.handler(context, params)
}

// =============================================================================
// Tool Definitions Export
// =============================================================================

export const READING_TOOLS: ReadonlyArray<ToolDefinition> = [
  QUERY_SQL_TOOL,
  GET_RECORDS_TOOL
] as const
