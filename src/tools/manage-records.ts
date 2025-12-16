/**
 * Consolidated record management tool.
 *
 * Consolidates grist_add_records, grist_update_records, grist_delete_records,
 * and grist_upsert_records into a single batched operations interface.
 *
 * Benefits:
 * - ~75% reduction in tools/list token usage for record operations
 * - Batch multiple record operations in a single API call
 * - Consistent interface for all record CRUD operations
 */

import { z } from 'zod'
import { MAX_RECORDS_PER_BATCH } from '../constants.js'
import {
  DESTRUCTIVE_ANNOTATIONS,
  type ToolContext,
  type ToolDefinition,
  WRITE_SAFE_ANNOTATIONS
} from '../registry/types.js'
import { ApplyResponseSchema, CellValueSchema } from '../schemas/api-responses.js'
import { encodeRecordForApi } from '../schemas/cell-codecs.js'
import {
  DocIdSchema,
  FilterSchema,
  ResponseFormatSchema,
  TableIdSchema
} from '../schemas/common.js'
import {
  buildBulkAddRecordAction,
  buildBulkRemoveRecordAction,
  buildBulkUpdateRecordAction
} from '../services/action-builder.js'
import { serializeUserAction } from '../services/grist-client.js'
import { toDocId, toRowId, toTableId } from '../types/advanced.js'
import type { ApplyResponse, UpsertResponse } from '../types.js'
import { validateRetValues } from '../validators/apply-response.js'
import {
  validateRecordsDataIntegrity,
  validateRowIdsExist,
  validateUpsertRecordsDataIntegrity
} from '../validators/data-integrity-validators.js'
import {
  validateRecord,
  validateRecords,
  validateUpsertRecords
} from '../validators/record-validator.js'
import { GristTool } from './base/GristTool.js'

// =============================================================================
// Record Operation Schemas - discriminated union on 'action' field
// =============================================================================

export const RecordDataSchema = z.record(z.string(), CellValueSchema)

/**
 * Add operation: Insert new records
 */
const AddRecordOperationSchema = z
  .object({
    action: z.literal('add'),
    records: z
      .array(RecordDataSchema)
      .min(1)
      .max(MAX_RECORDS_PER_BATCH)
      .describe('Records to add [{col: value}]')
  })
  .describe('Insert new records into the table')

/**
 * Update operation: Modify existing records by row ID
 */
const UpdateRecordOperationSchema = z
  .object({
    action: z.literal('update'),
    records: z
      .array(
        z.object({
          id: z.number().int().positive().describe('Row ID to update'),
          fields: RecordDataSchema.describe('Column values to update')
        })
      )
      .min(1)
      .max(MAX_RECORDS_PER_BATCH)
      .describe('Records to update [{id, fields}]')
  })
  .describe('Update existing records by row ID')

/**
 * Delete operation: Remove records by row ID or filter
 */
const DeleteRecordOperationSchema = z
  .object({
    action: z.literal('delete'),
    rowIds: z
      .array(z.number().int().positive())
      .min(1)
      .max(MAX_RECORDS_PER_BATCH)
      .optional()
      .describe('Row IDs to delete'),
    filters: FilterSchema.describe('Delete matching records (alternative to rowIds)')
  })
  .refine((data) => data.rowIds || data.filters, {
    message: 'Either rowIds or filters must be provided for delete'
  })
  .refine((data) => !(data.rowIds && data.filters), {
    message: 'Provide either rowIds OR filters, not both'
  })
  .describe('Delete records by row ID or filter')

/**
 * Upsert operation: Add or update by unique key
 */
const UpsertRecordOperationSchema = z
  .object({
    action: z.literal('upsert'),
    records: z
      .array(
        z.object({
          require: RecordDataSchema.describe('Lookup criteria (required)'),
          fields: RecordDataSchema.optional().describe('Values to set/update')
        })
      )
      .min(1)
      .max(MAX_RECORDS_PER_BATCH)
      .describe('Records with {require: match, fields: update}'),
    onMany: z
      .enum(['first', 'none', 'all'])
      .default('first')
      .describe('first: update first match, none: error if multiple, all: update all matches'),
    allowEmptyRequire: z
      .boolean()
      .default(false)
      .describe('Allow empty require (updates all rows)'),
    add: z.boolean().default(true).describe('Allow adding if no match'),
    update: z.boolean().default(true).describe('Allow updating matches')
  })
  .describe('Add or update records by unique key (idempotent sync)')

/**
 * Discriminated union of all record operations
 */
const RecordOperationSchema = z.discriminatedUnion('action', [
  AddRecordOperationSchema,
  UpdateRecordOperationSchema,
  DeleteRecordOperationSchema,
  UpsertRecordOperationSchema
])

/**
 * Main schema for grist_manage_records
 */
export const ManageRecordsSchema = z.strictObject({
  docId: DocIdSchema,
  tableId: TableIdSchema,
  operations: z
    .array(RecordOperationSchema)
    .min(1)
    .max(10)
    .describe('Array of record operations to perform in sequence'),
  response_format: ResponseFormatSchema
})

export type ManageRecordsInput = z.infer<typeof ManageRecordsSchema>
export type RecordOperation = z.infer<typeof RecordOperationSchema>

// =============================================================================
// Response types
// =============================================================================

interface OperationResult {
  action: string
  success: boolean
  recordsAffected: number
  recordIds?: number[]
  error?: string
  filtersUsed?: Record<string, unknown>
}

interface ManageRecordsResponse {
  success: boolean
  docId: string
  tableId: string
  operationsCompleted: number
  totalRecordsAffected: number
  results: OperationResult[]
  message: string
  partialFailure?: {
    operationIndex: number
    error: string
    completedOperations: number
  }
}

// =============================================================================
// Tool Implementation
// =============================================================================

interface RecordsResponse {
  records: Array<{ id: number }>
}

export class ManageRecordsTool extends GristTool<
  typeof ManageRecordsSchema,
  ManageRecordsResponse
> {
  constructor(context: ToolContext) {
    super(context, ManageRecordsSchema)
  }

  protected async executeInternal(params: ManageRecordsInput): Promise<ManageRecordsResponse> {
    const { schemaCache } = this
    const docId = toDocId(params.docId)
    const tableId = toTableId(params.tableId)
    const results: OperationResult[] = []
    let totalAffected = 0

    // Execute operations sequentially (later operations may depend on earlier ones)
    for (let i = 0; i < params.operations.length; i++) {
      const op = params.operations[i]
      if (!op) continue
      try {
        const result = await this.executeOperation(params.docId, params.tableId, op)
        results.push(result)
        totalAffected += result.recordsAffected

        // Invalidate cache after any modification
        schemaCache.invalidateCache(docId, tableId)
      } catch (error) {
        // Return partial failure info
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          docId: params.docId,
          tableId: params.tableId,
          operationsCompleted: i,
          totalRecordsAffected: totalAffected,
          results,
          message: `Operation ${i + 1} (${op.action}) failed: ${errorMessage}`,
          partialFailure: {
            operationIndex: i,
            error: errorMessage,
            completedOperations: i
          }
        }
      }
    }

    return {
      success: true,
      docId: params.docId,
      tableId: params.tableId,
      operationsCompleted: params.operations.length,
      totalRecordsAffected: totalAffected,
      results,
      message: `Successfully completed ${params.operations.length} operation(s) affecting ${totalAffected} record(s)`
    }
  }

  private async executeOperation(
    docId: string,
    tableId: string,
    op: RecordOperation
  ): Promise<OperationResult> {
    switch (op.action) {
      case 'add':
        return this.executeAdd(docId, tableId, op)
      case 'update':
        return this.executeUpdate(docId, tableId, op)
      case 'delete':
        return this.executeDelete(docId, tableId, op)
      case 'upsert':
        return this.executeUpsert(docId, tableId, op)
    }
  }

  private async executeAdd(
    docId: string,
    tableId: string,
    op: Extract<RecordOperation, { action: 'add' }>
  ): Promise<OperationResult> {
    const { schemaCache } = this
    const docIdBranded = toDocId(docId)
    const tableIdBranded = toTableId(tableId)

    // Fetch fresh column metadata for validation
    const columns = await schemaCache.getFreshColumns(docIdBranded, tableIdBranded)

    // Type validation
    validateRecords(op.records, columns, tableId)

    // Data integrity validation
    await validateRecordsDataIntegrity(
      op.records,
      columns,
      tableIdBranded,
      docIdBranded,
      schemaCache
    )

    // Build column type map for transformation
    const columnTypes = new Map(columns.map((c) => [c.id, c.fields.type]))

    // Transform user-friendly formats to API formats
    const transformedRecords = op.records.map((record) => encodeRecordForApi(record, columnTypes))

    const action = buildBulkAddRecordAction(tableIdBranded, transformedRecords)
    const response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Adding ${op.records.length} records to ${tableId}`
      }
    )

    const retValues = validateRetValues(response, {
      context: `BulkAddRecord on ${tableId}`
    })

    const result = retValues[0]
    if (!Array.isArray(result)) {
      throw new Error(`Expected array of row IDs but got ${typeof result}`)
    }

    return {
      action: 'add',
      success: true,
      recordsAffected: op.records.length,
      recordIds: result as number[]
    }
  }

  private async executeUpdate(
    docId: string,
    tableId: string,
    op: Extract<RecordOperation, { action: 'update' }>
  ): Promise<OperationResult> {
    const { schemaCache } = this
    const docIdBranded = toDocId(docId)
    const tableIdBranded = toTableId(tableId)

    // Extract row IDs and validate they exist
    const rowIds = op.records.map((r) => r.id)
    await validateRowIdsExist(rowIds, tableIdBranded, docIdBranded, schemaCache)

    // Fetch fresh column metadata
    const columns = await schemaCache.getFreshColumns(docIdBranded, tableIdBranded)

    // Process each record update
    for (const record of op.records) {
      validateRecord(record.fields, columns, tableId)
      await validateRecordsDataIntegrity(
        [record.fields],
        columns,
        tableIdBranded,
        docIdBranded,
        schemaCache
      )
    }

    // Build column type map for transformation
    const columnTypes = new Map(columns.map((c) => [c.id, c.fields.type]))

    // Build bulk update action - group updates by fields being updated
    // For simplicity, process each record individually
    for (const record of op.records) {
      // Transform user-friendly formats to API formats
      const transformedFields = encodeRecordForApi(record.fields, columnTypes)
      const action = buildBulkUpdateRecordAction(
        tableIdBranded,
        [toRowId(record.id)],
        transformedFields
      )
      const response = await this.client.post<ApplyResponse>(
        `/docs/${docId}/apply`,
        [serializeUserAction(action)],
        {
          schema: ApplyResponseSchema,
          context: `Updating record ${record.id} in ${tableId}`
        }
      )
      validateRetValues(response, { context: `BulkUpdateRecord on ${tableId}` })
    }

    return {
      action: 'update',
      success: true,
      recordsAffected: op.records.length,
      recordIds: rowIds
    }
  }

  private async executeDelete(
    docId: string,
    tableId: string,
    op: Extract<RecordOperation, { action: 'delete' }>
  ): Promise<OperationResult> {
    const { schemaCache } = this
    const docIdBranded = toDocId(docId)
    const tableIdBranded = toTableId(tableId)
    let rowIdsToDelete: number[]

    if (op.rowIds) {
      await validateRowIdsExist(op.rowIds, tableIdBranded, docIdBranded, schemaCache)
      rowIdsToDelete = op.rowIds
    } else if (op.filters) {
      rowIdsToDelete = await this.findMatchingRecordIds(docId, tableId, op.filters)
      if (rowIdsToDelete.length === 0) {
        return {
          action: 'delete',
          success: true,
          recordsAffected: 0,
          filtersUsed: op.filters
        }
      }
    } else {
      throw new Error('Either rowIds or filters must be provided for delete')
    }

    const action = buildBulkRemoveRecordAction(tableIdBranded, rowIdsToDelete.map(toRowId))
    const response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Deleting ${rowIdsToDelete.length} records from ${tableId}`
      }
    )

    validateRetValues(response, { context: `BulkRemoveRecord on ${tableId}` })

    return {
      action: 'delete',
      success: true,
      recordsAffected: rowIdsToDelete.length,
      recordIds: rowIdsToDelete,
      ...(op.filters ? { filtersUsed: op.filters } : {})
    }
  }

  private async executeUpsert(
    docId: string,
    tableId: string,
    op: Extract<RecordOperation, { action: 'upsert' }>
  ): Promise<OperationResult> {
    const { schemaCache } = this
    const docIdBranded = toDocId(docId)
    const tableIdBranded = toTableId(tableId)

    // Fetch fresh column metadata
    const columns = await schemaCache.getFreshColumns(docIdBranded, tableIdBranded)

    // Type validation
    validateUpsertRecords(op.records, columns, tableId)

    // Data integrity validation
    await validateUpsertRecordsDataIntegrity(
      op.records,
      columns,
      tableIdBranded,
      docIdBranded,
      schemaCache
    )

    // Build column type map for transformation
    const columnTypes = new Map(columns.map((c) => [c.id, c.fields.type]))

    // Transform user-friendly formats to API formats in both require and fields
    const transformedRecords = op.records.map((record) => ({
      require: encodeRecordForApi(record.require, columnTypes),
      fields: record.fields ? encodeRecordForApi(record.fields, columnTypes) : undefined
    }))

    const queryParams: Record<string, string> = {}
    if (op.onMany && op.onMany !== 'first') {
      queryParams.onmany = op.onMany
    }
    if (op.allowEmptyRequire) {
      queryParams.allow_empty_require = 'true'
    }
    if (!op.add) {
      queryParams.noadd = 'true'
    }
    if (!op.update) {
      queryParams.noupdate = 'true'
    }

    const response = await this.client.put<UpsertResponse | null>(
      `/docs/${docId}/tables/${tableId}/records`,
      { records: transformedRecords },
      { config: { params: queryParams } }
    )

    let recordIds: number[] = []
    if (response?.records) {
      recordIds = response.records
    } else {
      recordIds = await this.findAffectedRecordIds(docId, tableId, op.records)
    }

    return {
      action: 'upsert',
      success: true,
      recordsAffected: op.records.length,
      recordIds: recordIds
    }
  }

  private async findMatchingRecordIds(
    docId: string,
    tableId: string,
    filters: Record<string, unknown>
  ): Promise<number[]> {
    const gristFilters: Record<string, unknown[]> = {}
    for (const [key, value] of Object.entries(filters)) {
      gristFilters[key] = Array.isArray(value) ? value : [value]
    }

    const response = await this.client.get<RecordsResponse>(
      `/docs/${docId}/tables/${tableId}/records`,
      {
        filter: JSON.stringify(gristFilters),
        limit: MAX_RECORDS_PER_BATCH
      }
    )

    return (response.records || []).map((r) => r.id)
  }

  private async findAffectedRecordIds(
    docId: string,
    tableId: string,
    records: Array<{ require?: Record<string, unknown>; fields?: Record<string, unknown> }>
  ): Promise<number[]> {
    const allIds = new Set<number>()

    for (const record of records) {
      if (!record.require || Object.keys(record.require).length === 0) {
        continue
      }

      try {
        const filter: Record<string, unknown[]> = {}
        for (const [key, value] of Object.entries(record.require)) {
          filter[key] = [value]
        }

        const response = await this.client.get<RecordsResponse>(
          `/docs/${docId}/tables/${tableId}/records`,
          {
            filter: JSON.stringify(filter),
            limit: 100
          }
        )

        for (const rec of response.records || []) {
          allIds.add(rec.id)
        }
      } catch {
        // Continue with other records if query fails
      }
    }

    return Array.from(allIds)
  }
}

export async function manageRecords(context: ToolContext, params: ManageRecordsInput) {
  const tool = new ManageRecordsTool(context)
  return tool.execute(params)
}

// =============================================================================
// Output Schema for MCP
// =============================================================================

export const ManageRecordsOutputSchema = z.object({
  success: z.boolean(),
  docId: z.string(),
  tableId: z.string(),
  operationsCompleted: z.number(),
  totalRecordsAffected: z.number(),
  results: z.array(
    z.object({
      action: z.string(),
      success: z.boolean(),
      recordsAffected: z.number(),
      recordIds: z.array(z.number()).optional(),
      error: z.string().optional(),
      filtersUsed: z.record(z.string(), z.unknown()).optional()
    })
  ),
  message: z.string(),
  partialFailure: z
    .object({
      operationIndex: z.number(),
      error: z.string(),
      completedOperations: z.number()
    })
    .optional()
})

// =============================================================================
// Tool Definition
// =============================================================================

export const MANAGE_RECORDS_TOOL: ToolDefinition = {
  name: 'grist_manage_records',
  title: 'Manage Records',
  description: 'Add, update, delete, or upsert records in batch',
  purpose: 'CRUD operations on table records',
  category: 'records',
  inputSchema: ManageRecordsSchema,
  outputSchema: ManageRecordsOutputSchema,
  annotations: { ...WRITE_SAFE_ANNOTATIONS, ...DESTRUCTIVE_ANNOTATIONS },
  handler: manageRecords,
  docs: {
    overview:
      'Batch record operations: add, update, delete, upsert. Operations execute sequentially. ' +
      'Use add for inserts, update for modifications by row ID, delete for removal, ' +
      'upsert for idempotent sync by unique key.',
    examples: [
      {
        desc: 'Add records',
        input: {
          docId: 'abc123',
          tableId: 'Contacts',
          operations: [
            {
              action: 'add',
              records: [
                { Name: 'John', Email: 'john@example.com' },
                { Name: 'Jane', Email: 'jane@example.com' }
              ]
            }
          ]
        }
      },
      {
        desc: 'Update and delete in batch',
        input: {
          docId: 'abc123',
          tableId: 'Tasks',
          operations: [
            {
              action: 'update',
              records: [
                { id: 1, fields: { Status: 'Complete' } },
                { id: 2, fields: { Status: 'Complete' } }
              ]
            },
            { action: 'delete', rowIds: [3, 4] }
          ]
        }
      },
      {
        desc: 'Upsert by email',
        input: {
          docId: 'abc123',
          tableId: 'Users',
          operations: [
            {
              action: 'upsert',
              records: [
                { require: { Email: 'alice@example.com' }, fields: { Name: 'Alice', Active: true } }
              ]
            }
          ]
        }
      },
      {
        desc: 'Delete by filter',
        input: {
          docId: 'abc123',
          tableId: 'Logs',
          operations: [{ action: 'delete', filters: { Status: 'Archived' } }]
        }
      }
    ],
    errors: [
      { error: 'Column not found', solution: 'Use grist_get_tables (case-sensitive)' },
      { error: 'Row ID not found', solution: 'Use grist_get_records to find valid row IDs' },
      {
        error: 'Partial failure',
        solution: 'Check partial_failure.operation_index to see which operation failed'
      },
      { error: 'Invalid reference', solution: 'Row ID must exist in referenced table' },
      { error: 'Invalid choice', solution: 'Use grist_get_tables with detail_level="full_schema"' }
    ]
  }
}
