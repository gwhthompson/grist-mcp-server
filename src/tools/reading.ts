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
import type { RecordsResponse, SQLQueryResponse } from '../types.js'
import { GristTool } from './base/GristTool.js'

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
        'Optional parameterized query values. Use $1, $2, etc. in SQL. Example: ["Active", 100]'
      ),
    response_format: ResponseFormatSchema,
    ...PaginationSchema.shape
  })
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
  }

  protected formatResponse(data: any, format: 'json' | 'markdown') {
    const { data: truncatedData } = truncateIfNeeded(data.records, format, {
      total: data.total,
      offset: data.offset,
      limit: data.limit,
      has_more: data.has_more,
      next_offset: data.next_offset
    })

    // Return with records property for backward compatibility
    return super.formatResponse({ ...data, records: truncatedData }, format)
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
    ...PaginationSchema.shape
  })
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
      records: formattedRecords
    }
  }

  protected formatResponse(data: any, format: 'json' | 'markdown') {
    const { data: truncatedData } = truncateIfNeeded(data.records, format, {
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

    return super.formatResponse(truncatedData, format)
  }

  /**
   * Convert simple filters to Grist filter format
   */
  private convertToGristFilters(filters?: Record<string, any>): Record<string, any[]> {
    if (!filters || Object.keys(filters).length === 0) {
      return {}
    }

    const gristFilters: Record<string, any[]> = {}

    for (const [key, value] of Object.entries(filters)) {
      // If value is already an array, use as-is
      if (Array.isArray(value)) {
        gristFilters[key] = value
      } else {
        // Convert single value to array format
        gristFilters[key] = [value]
      }
    }

    return gristFilters
  }

  /**
   * Select specific columns from records
   */
  private selectColumns(records: any[], columns?: string[]): any[] {
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
   */
  private flattenRecords(records: any[]): any[] {
    return records.map((record) => ({
      id: record.id,
      ...record.fields
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
