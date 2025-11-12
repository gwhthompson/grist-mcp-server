/**
 * Data Reading Tools (Refactored with Base Classes)
 *
 * REFACTORED VERSION using GristTool base class
 * Reduces code from ~218 lines to ~130 lines (-40% reduction)
 */

import { z } from 'zod'
import {
  ColumnSelectionSchema,
  DocIdSchema,
  FilterSchema,
  PaginationSchema,
  ResponseFormatSchema,
  TableIdSchema
} from '../schemas/common.js'
import { truncateIfNeeded } from '../services/formatter.js'
import type { GristClient } from '../services/grist-client.js'
import type { RecordsResponse, SQLQueryResponse, CellValue } from '../types.js'
import { GristTool } from './base/GristTool.js'

// Type for Grist record structure
interface GristRecord {
  id: number
  fields: Record<string, CellValue>
  errors?: Record<string, string> // Formula errors
}

// Type for flattened record
interface FlattenedRecord {
  id: number
  _errors?: Record<string, string> // Formula errors if present
  [key: string]: CellValue | Record<string, string> | undefined // Field values
}

// ============================================================================
// 1. GRIST_QUERY_SQL (Refactored)
// ============================================================================

export const QuerySQLSchema = z
  .object({
    docId: DocIdSchema,
    sql: z
      .string()
      .min(1)
      .describe(
        'SQL query to execute. Supports SELECT, JOINs, WHERE, GROUP BY, ORDER BY. Table names should match Grist table IDs. Example: "SELECT Name, Email FROM Contacts WHERE Status = \'Active\'"'
      ),
    parameters: z
      .array(z.any())
      .optional()
      .describe(
        'Optional parameterized query values. Use ? placeholders in SQL (SQLite style). Example SQL: "WHERE Status = ? AND Priority > ?" with parameters: ["Active", 1]'
      ),
    response_format: ResponseFormatSchema,
  })
  .merge(PaginationSchema)
  .strict()

export type QuerySQLInput = z.infer<typeof QuerySQLSchema>

/**
 * Query SQL Tool
 * Executes SQL queries with automatic pagination
 */
export class QuerySqlTool extends GristTool<typeof QuerySQLSchema, any> {
  constructor(client: GristClient) {
    super(client, QuerySQLSchema)
  }

  protected async executeInternal(params: QuerySQLInput) {
    // Build SQL query with LIMIT and OFFSET
    let sql = params.sql.trim()

    // Check if query already has LIMIT/OFFSET
    const hasLimit = /\bLIMIT\b/i.test(sql)
    const hasOffset = /\bOFFSET\b/i.test(sql)

    // Append pagination if not present
    if (!hasLimit) {
      sql += ` LIMIT ${params.limit}`
    }
    if (!hasOffset) {
      sql += ` OFFSET ${params.offset}`
    }

    // Execute SQL query
    // Note: Parameterized queries (using 'args') may not be supported in all Grist versions
    // If parameters are provided and fail with 400, we provide helpful error message
    try {
      const response = await this.client.post<SQLQueryResponse>(`/docs/${params.docId}/sql`, {
        sql,
        args: params.parameters || []
      })

      const records = response.records || []

    // Get total count estimate
    let total = records.length
    if (records.length === params.limit) {
      total = params.offset + records.length + 1 // +1 indicates "possibly more"
    } else {
      total = params.offset + records.length
    }

    const hasMore = records.length === params.limit

      return {
        total,
        offset: params.offset,
        limit: params.limit,
        has_more: hasMore,
        next_offset: hasMore ? params.offset + params.limit : null,
        records
      }
    } catch (error) {
      // Check if this might be a parameterized query issue
      if (params.parameters && params.parameters.length > 0) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        if (errorMsg.includes('400') || errorMsg.toLowerCase().includes('bad request')) {
          throw new Error(
            `SQL query failed - Parameterized queries may not be supported.\n\n` +
            `Your query uses parameters: ${JSON.stringify(params.parameters)}\n\n` +
            `Parameterized queries require Grist v1.1.0+. If you're using an older version:\n` +
            `1. Remove the "parameters" field\n` +
            `2. Embed values directly in SQL (use proper escaping!)\n` +
            `3. Example: Instead of "WHERE Status = $1", use "WHERE Status = 'VIP'"\n\n` +
            `Original error: ${errorMsg}`
          )
        }
      }
      throw error
    }
  }

  protected formatResponse(data: any, format: 'json' | 'markdown') {
    // For SQL query, we want to return items not records for consistency
    // but we'll call the array 'records' since that's what SQL returns
    const { data: truncatedData } = truncateIfNeeded(data.records, format, {
      total: data.total,
      offset: data.offset,
      limit: data.limit,
      has_more: data.has_more,
      next_offset: data.next_offset
    })

    // truncateIfNeeded returns { data: { ...metadata, items: [...] } }
    // Rename items to records for SQL context
    const { items, ...rest } = truncatedData as any
    const responseData = {
      ...rest,
      records: items  // SQL queries return 'records' not 'items'
    }

    return super.formatResponse(responseData, format)
  }
}

/**
 * Legacy function wrapper for backward compatibility
 */
export async function querySql(client: GristClient, params: QuerySQLInput) {
  const tool = new QuerySqlTool(client)
  return tool.execute(params)
}

// ============================================================================
// 2. GRIST_GET_RECORDS (Refactored)
// ============================================================================

export const GetRecordsSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    filters: FilterSchema,
    columns: ColumnSelectionSchema,
    response_format: ResponseFormatSchema,
  })
  .merge(PaginationSchema)
  .strict()

export type GetRecordsInput = z.infer<typeof GetRecordsSchema>

/**
 * Get Records Tool
 * Fetches records from a table with filtering and column selection
 */
export class GetRecordsTool extends GristTool<typeof GetRecordsSchema, any> {
  constructor(client: GristClient) {
    super(client, GetRecordsSchema)
  }

  protected async executeInternal(params: GetRecordsInput) {
    // Build query parameters
    const queryParams: any = {
      limit: params.limit,
      offset: params.offset
    }

    // Add filters if provided
    const gristFilters = this.convertToGristFilters(params.filters)
    if (Object.keys(gristFilters).length > 0) {
      queryParams.filter = JSON.stringify(gristFilters)
    }

    // Fetch records
    const response = await this.client.get<RecordsResponse>(
      `/docs/${params.docId}/tables/${params.tableId}/records`,
      queryParams
    )

    // Apply column selection and flatten records
    let records = response.records || []
    records = this.selectColumns(records, params.columns)
    const formattedRecords = this.flattenRecords(records)

    // Calculate metadata
    const total = this.estimateTotal(records.length, params.limit, params.offset)
    const hasMore = records.length === params.limit
    const nextOffset = hasMore ? params.offset + params.limit : null

    // Count formula errors
    const recordsWithErrors = records.filter(r => r.errors && Object.keys(r.errors).length > 0)
    const errorColumns = new Set<string>()
    records.forEach(r => {
      if (r.errors) {
        Object.keys(r.errors).forEach(col => errorColumns.add(col))
      }
    })

    return {
      document_id: params.docId,
      table_id: params.tableId,
      total,
      offset: params.offset,
      limit: params.limit,
      has_more: hasMore,
      next_offset: nextOffset,
      filters: params.filters || {},
      columns: params.columns || 'all',
      items: formattedRecords,  // Use 'items' for consistency with other list tools
      ...(recordsWithErrors.length > 0 ? {
        formula_errors: {
          records_with_errors: recordsWithErrors.length,
          affected_columns: Array.from(errorColumns)
        }
      } : {})
    }
  }

  protected formatResponse(data: any, format: 'json' | 'markdown') {
    // truncateIfNeeded already returns { data: { ...metadata, items: [...] } }
    // So truncatedData already has the complete structure we need
    const { data: truncatedData } = truncateIfNeeded(data.items, format, {
      document_id: data.document_id,
      table_id: data.table_id,
      total: data.total,
      offset: data.offset,
      limit: data.limit,
      has_more: data.has_more,
      next_offset: data.next_offset,
      filters: data.filters,
      columns: data.columns
    })

    // truncatedData already has the full structure with items array
    return super.formatResponse(truncatedData, format)
  }

  /**
   * Convert simple filters to Grist filter format
   */
  private convertToGristFilters(filters?: Record<string, CellValue | CellValue[]>): Record<string, CellValue[]> {
    if (!filters || Object.keys(filters).length === 0) {
      return {}
    }

    const gristFilters: Record<string, CellValue[]> = {}

    for (const [key, value] of Object.entries(filters)) {
      // Distinguish between:
      //   - CellValue[] (array of cell values for filtering multiple options like ['Alice', 'Bob'])
      //   - CellValue (single value, which could be an encoded array like ['L', 1, 2, 3])

      // Grist encoding markers for special CellValue types
      const GRIST_MARKERS = ['L', 'D', 'E', 'P', 'C', 'S', 'Reference', 'ReferenceList']

      const arrayValue: CellValue[] =
        Array.isArray(value) &&
        value.length > 0 &&
        typeof value[0] === 'string' &&
        GRIST_MARKERS.includes(value[0])
          ? [value as CellValue]       // Single encoded CellValue like ['L', 1, 2]
          : Array.isArray(value)
            ? (value as CellValue[])   // Array of simple values like ['Alice', 'Bob']
            : [value as CellValue]     // Single simple value

      gristFilters[key] = arrayValue
    }

    return gristFilters
  }

  /**
   * Select specific columns from records
   */
  private selectColumns(records: GristRecord[], columns?: string[]): GristRecord[] {
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

  /**
   * Flatten records (merge id and fields)
   * Preserves formula errors if present
   */
  private flattenRecords(records: GristRecord[]): FlattenedRecord[] {
    return records.map((record) => ({
      id: record.id,
      ...record.fields,
      ...(record.errors && Object.keys(record.errors).length > 0
        ? { _errors: record.errors }
        : {})
    }))
  }

  /**
   * Estimate total count based on returned records
   */
  private estimateTotal(recordCount: number, limit: number, offset: number): number {
    return recordCount < limit ? offset + recordCount : offset + recordCount + 1
  }
}

/**
 * Legacy function wrapper for backward compatibility
 */
export async function getRecords(client: GristClient, params: GetRecordsInput) {
  const tool = new GetRecordsTool(client)
  return tool.execute(params)
}
