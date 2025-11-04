/**
 * Data Reading Tools (2 tools)
 *
 * These tools enable reading and querying data from Grist tables:
 * - grist_query_sql: Execute SQL queries for complex analytics
 * - grist_get_records: Simple record fetching without SQL
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
import { formatErrorResponse, formatToolResponse, truncateIfNeeded } from '../services/formatter.js'
import type { GristClient } from '../services/grist-client.js'
import type { RecordsResponse, SQLQueryResponse } from '../types.js'

// ============================================================================
// 1. GRIST_QUERY_SQL
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

export async function querySql(client: GristClient, params: QuerySQLInput) {
  try {
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
    const response = await client.post<SQLQueryResponse>(`/docs/${params.docId}/sql`, {
      sql,
      args: params.parameters || []
    })

    const records = response.records || []

    // Get total count (requires separate query without LIMIT)
    let total = records.length
    if (records.length === params.limit) {
      // Might be more records, estimate
      total = params.offset + records.length + 1 // +1 indicates "possibly more"
    } else {
      total = params.offset + records.length
    }

    // Build response data
    const responseData = {
      total: total,
      offset: params.offset,
      limit: params.limit,
      has_more: records.length === params.limit, // If we got full limit, there might be more
      next_offset: records.length === params.limit ? params.offset + params.limit : null,
      records
    }

    // Check for truncation
    const { data } = truncateIfNeeded(records, params.response_format, {
      total: responseData.total,
      offset: params.offset,
      limit: params.limit,
      has_more: responseData.has_more,
      next_offset: responseData.next_offset,
      sql_query: params.sql
    })

    return formatToolResponse(data, params.response_format)
  } catch (error) {
    return formatErrorResponse(error instanceof Error ? error.message : String(error))
  }
}

// ============================================================================
// 2. GRIST_GET_RECORDS
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

// Helper functions for getRecords

function convertToGristFilters(filters?: Record<string, any>): Record<string, any[]> {
  if (!filters || Object.keys(filters).length === 0) {
    return {}
  }

  const gristFilters: Record<string, any[]> = {}

  for (const [key, value] of Object.entries(filters)) {
    // If value is already an array (e.g., ["in", [1, 2, 3]]), use as-is
    if (Array.isArray(value)) {
      gristFilters[key] = value
    } else {
      // Convert single value to array format
      gristFilters[key] = [value]
    }
  }

  return gristFilters
}

function selectColumns(records: any[], columns?: string[]): any[] {
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

function flattenRecords(records: any[]): any[] {
  return records.map((record) => ({
    id: record.id,
    ...record.fields
  }))
}

function estimateTotal(recordCount: number, limit: number, offset: number): number {
  return recordCount < limit ? offset + recordCount : offset + recordCount + 1 // +1 indicates "possibly more"
}

export async function getRecords(client: GristClient, params: GetRecordsInput) {
  try {
    // Build query parameters
    const queryParams: any = {
      limit: params.limit,
      offset: params.offset
    }

    // Add filters if provided
    const gristFilters = convertToGristFilters(params.filters)
    if (Object.keys(gristFilters).length > 0) {
      queryParams.filter = JSON.stringify(gristFilters)
    }

    // Fetch records
    const response = await client.get<RecordsResponse>(
      `/docs/${params.docId}/tables/${params.tableId}/records`,
      queryParams
    )

    // Apply column selection and flatten records
    let records = response.records || []
    records = selectColumns(records, params.columns)
    const formattedRecords = flattenRecords(records)

    // Calculate metadata
    const total = estimateTotal(records.length, params.limit, params.offset)
    const hasMore = records.length === params.limit
    const nextOffset = hasMore ? params.offset + params.limit : null

    // Check for truncation
    const { data } = truncateIfNeeded(formattedRecords, params.response_format, {
      document_id: params.docId,
      table_id: params.tableId,
      total,
      offset: params.offset,
      limit: params.limit,
      has_more: hasMore,
      next_offset: nextOffset,
      filters: params.filters || {},
      columns: params.columns || 'all'
    })

    return formatToolResponse(data, params.response_format)
  } catch (error) {
    return formatErrorResponse(error instanceof Error ? error.message : String(error))
  }
}
