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
  addRecords as domainAddRecords,
  deleteRecords as domainDeleteRecords,
  updateRecords as domainUpdateRecords
} from '../domain/operations/records.js'
import type { ToolContext, ToolDefinition } from '../registry/types.js'
import { CellValueSchema } from '../schemas/api-responses.js'
import { encodeRecordForApi } from '../schemas/cell-codecs.js'
import {
  DocIdSchema,
  FilterSchema,
  ResponseFormatSchema,
  TableIdSchema
} from '../schemas/common.js'
import { toDocId, toTableId } from '../types/advanced.js'
import type { UpsertResponse } from '../types.js'
import {
  validateRecordsDataIntegrity,
  validateRowIdsExist,
  validateUpsertRecordsDataIntegrity
} from '../validators/data-integrity-validators.js'
import { validateRecords, validateUpsertRecords } from '../validators/record-validator.js'
import { BatchOperationTool } from './base/BatchOperationTool.js'
import { nextSteps } from './utils/next-steps.js'

// =============================================================================
// Record Operation Schemas - discriminated union on 'action' field
// =============================================================================

export const RecordDataSchema = z.record(z.string(), CellValueSchema)

/** Add operation: Insert new records */
const AddRecordOperationSchema = z
  .object({
    action: z.literal('add'),
    tableId: TableIdSchema,
    records: z.array(RecordDataSchema).min(1).max(MAX_RECORDS_PER_BATCH)
  })
  .describe('add records')

/** Update operation: Modify existing records by row ID */
const UpdateRecordOperationSchema = z
  .object({
    action: z.literal('update'),
    tableId: TableIdSchema,
    records: z
      .array(
        z.object({
          id: z.number().int().positive(),
          fields: RecordDataSchema
        })
      )
      .min(1)
      .max(MAX_RECORDS_PER_BATCH)
  })
  .describe('update records')

/** Delete operation: Remove records by row ID or filter */
const DeleteRecordOperationSchema = z
  .object({
    action: z.literal('delete'),
    tableId: TableIdSchema,
    rowIds: z.array(z.number().int().positive()).min(1).max(MAX_RECORDS_PER_BATCH).optional(),
    filters: FilterSchema.describe('use rowIds OR filters, not both')
  })
  .refine((data) => data.rowIds || data.filters, {
    message: 'Either rowIds or filters must be provided for delete'
  })
  .refine((data) => !(data.rowIds && data.filters), {
    message: 'Provide either rowIds OR filters, not both'
  })
  .describe('delete records')

/** Upsert operation: Add or update by unique key */
const UpsertRecordOperationSchema = z
  .object({
    action: z.literal('upsert'),
    tableId: TableIdSchema,
    records: z
      .array(
        z.object({
          require: RecordDataSchema.describe('match criteria'),
          fields: RecordDataSchema.optional().describe('values to set')
        })
      )
      .min(1)
      .max(MAX_RECORDS_PER_BATCH),
    onMany: z
      .enum(['first', 'none', 'all'])
      .default('first')
      .describe('first/none/all on multiple'),
    allowEmptyRequire: z.boolean().default(false).describe('DANGER: updates all rows'),
    add: z.boolean().default(true).describe('insert if no match'),
    update: z.boolean().default(true).describe('update if match')
  })
  .describe('upsert records')

/**
 * Discriminated union of all record operations
 */
const RecordOperationSchema = z.discriminatedUnion('action', [
  AddRecordOperationSchema,
  UpdateRecordOperationSchema,
  DeleteRecordOperationSchema,
  UpsertRecordOperationSchema
])

/** Main schema for grist_manage_records */
export const ManageRecordsSchema = z.strictObject({
  docId: DocIdSchema,
  operations: z.array(RecordOperationSchema).min(1).max(10),
  response_format: ResponseFormatSchema
})

export type ManageRecordsInput = z.infer<typeof ManageRecordsSchema>
export type RecordOperation = z.infer<typeof RecordOperationSchema>

// =============================================================================
// Response types
// =============================================================================

interface OperationResult {
  action: string
  tableId: string
  success: boolean
  recordsAffected: number
  recordIds?: number[]
  error?: string
  filtersUsed?: Record<string, unknown>
  verified?: boolean
}

interface ManageRecordsResponse {
  success: boolean
  docId: string
  tablesAffected: string[]
  operationsCompleted: number
  totalRecordsAffected: number
  results: OperationResult[]
  message: string
  partialFailure?: {
    operationIndex: number
    tableId: string
    error: string
    completedOperations: number
  }
  nextSteps?: string[]
}

// =============================================================================
// Tool Implementation
// =============================================================================

interface RecordsResponse {
  records: Array<{ id: number }>
}

export class ManageRecordsTool extends BatchOperationTool<
  typeof ManageRecordsSchema,
  RecordOperation,
  OperationResult,
  ManageRecordsResponse
> {
  constructor(context: ToolContext) {
    super(context, ManageRecordsSchema)
  }

  protected getOperations(params: ManageRecordsInput): RecordOperation[] {
    return params.operations
  }

  protected getDocId(params: ManageRecordsInput): string {
    return params.docId
  }

  protected getActionName(operation: RecordOperation): string {
    return `${operation.action} on ${operation.tableId}`
  }

  protected async executeOperation(
    docId: string,
    operation: RecordOperation,
    _index: number
  ): Promise<OperationResult> {
    const tableIdBranded = toTableId(operation.tableId)
    const docIdBranded = toDocId(docId)

    const result = await this.executeSingleOperation(docId, operation.tableId, operation)

    // Invalidate cache after any modification
    this.schemaCache.invalidateCache(docIdBranded, tableIdBranded)

    return {
      ...result,
      tableId: operation.tableId
    }
  }

  protected buildSuccessResponse(
    docId: string,
    results: OperationResult[],
    params: ManageRecordsInput
  ): ManageRecordsResponse {
    const affectedTables = new Set(results.map((r) => r.tableId))
    const totalAffected = results.reduce((sum, r) => sum + r.recordsAffected, 0)
    const tableCount = affectedTables.size
    const tableText = tableCount === 1 ? 'table' : 'tables'

    return {
      success: true,
      docId,
      tablesAffected: Array.from(affectedTables),
      operationsCompleted: params.operations.length,
      totalRecordsAffected: totalAffected,
      results,
      message: `Successfully completed ${params.operations.length} operation(s) affecting ${totalAffected} record(s) across ${tableCount} ${tableText}`
    }
  }

  protected buildFailureResponse(
    docId: string,
    failedIndex: number,
    failedOperation: RecordOperation,
    completedResults: OperationResult[],
    errorMessage: string,
    _params: ManageRecordsInput
  ): ManageRecordsResponse {
    const affectedTables = new Set(completedResults.map((r) => r.tableId))
    const totalAffected = completedResults.reduce((sum, r) => sum + r.recordsAffected, 0)

    return {
      success: false,
      docId,
      tablesAffected: Array.from(affectedTables),
      operationsCompleted: failedIndex,
      totalRecordsAffected: totalAffected,
      results: completedResults,
      message: `Operation ${failedIndex + 1} (${failedOperation.action} on ${failedOperation.tableId}) failed: ${errorMessage}`,
      partialFailure: {
        operationIndex: failedIndex,
        tableId: failedOperation.tableId,
        error: errorMessage,
        completedOperations: failedIndex
      }
    }
  }

  protected async afterExecute(
    result: ManageRecordsResponse,
    params: ManageRecordsInput
  ): Promise<ManageRecordsResponse> {
    const addResults = result.results.filter((r) => r.action === 'add' && r.recordIds?.length)
    const updateResults = result.results.filter((r) => r.action === 'update')
    const deleteResults = result.results.filter((r) => r.action === 'delete')
    const firstAdd = addResults[0]
    const firstDelete = deleteResults[0]

    const builder = nextSteps()

    if (result.partialFailure) {
      builder
        .add(`Fix error in ${result.partialFailure.tableId}: ${result.partialFailure.error}`)
        .add(`Resume from operation index ${result.partialFailure.operationIndex}`)
    } else if (result.success) {
      builder
        .addIf(
          !!firstAdd?.recordIds?.length,
          `Use grist_get_records with docId="${params.docId}" and tableId="${firstAdd?.tableId}" to verify added records`
        )
        .addIf(updateResults.length > 0, 'Use grist_get_records to verify updated data')
        .addIf(
          !!firstDelete,
          `Use grist_get_records with tableId="${firstDelete?.tableId}" to verify records were deleted`
        )
        .addIf(
          addResults.length > 0 && result.totalRecordsAffected > 0,
          "Use grist_manage_pages action='create_page' to create a view for the data"
        )
    }

    return { ...result, nextSteps: builder.build() }
  }

  private async executeSingleOperation(
    docId: string,
    tableId: string,
    op: RecordOperation
  ): Promise<Omit<OperationResult, 'tableId'>> {
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
  ): Promise<Omit<OperationResult, 'tableId'>> {
    const { schemaCache } = this
    const docIdBranded = toDocId(docId)
    const tableIdBranded = toTableId(tableId)

    // Fetch fresh column metadata for validation
    const columns = await schemaCache.getFreshColumns(docIdBranded, tableIdBranded)

    // Type validation (pre-write)
    validateRecords(op.records, columns, tableId)

    // Data integrity validation (pre-write: references exist, choices valid)
    await validateRecordsDataIntegrity(
      op.records,
      columns,
      tableIdBranded,
      docIdBranded,
      schemaCache
    )

    // Use domain operation - handles encoding, API call, and verification
    const result = await domainAddRecords(this.context, docId, tableId, op.records)

    return {
      action: 'add',
      success: true,
      recordsAffected: result.count,
      recordIds: result.records.map((r) => r.id),
      verified: true
    }
  }

  private async executeUpdate(
    docId: string,
    tableId: string,
    op: Extract<RecordOperation, { action: 'update' }>
  ): Promise<Omit<OperationResult, 'tableId'>> {
    const { schemaCache } = this
    const docIdBranded = toDocId(docId)
    const tableIdBranded = toTableId(tableId)

    // Extract row IDs and validate they exist (pre-write)
    const rowIds = op.records.map((r) => r.id)
    await validateRowIdsExist(rowIds, tableIdBranded, docIdBranded, schemaCache)

    // Fetch fresh column metadata
    const columns = await schemaCache.getFreshColumns(docIdBranded, tableIdBranded)

    // Type validation (pre-write) - validate all at once
    const allFields = op.records.map((r) => r.fields)
    validateRecords(allFields, columns, tableId)

    // Data integrity validation (pre-write) - validate all at once
    await validateRecordsDataIntegrity(
      allFields,
      columns,
      tableIdBranded,
      docIdBranded,
      schemaCache
    )

    // Use domain operation - handles encoding, API call, and verification
    const result = await domainUpdateRecords(this.context, docId, tableId, op.records)

    return {
      action: 'update',
      success: true,
      recordsAffected: result.count,
      recordIds: result.records.map((r) => r.id),
      verified: true
    }
  }

  private async executeDelete(
    docId: string,
    tableId: string,
    op: Extract<RecordOperation, { action: 'delete' }>
  ): Promise<Omit<OperationResult, 'tableId'>> {
    const { schemaCache } = this
    const docIdBranded = toDocId(docId)
    const tableIdBranded = toTableId(tableId)
    let rowIdsToDelete: number[]

    if (op.rowIds) {
      // Validate row IDs exist (pre-write)
      await validateRowIdsExist(op.rowIds, tableIdBranded, docIdBranded, schemaCache)
      rowIdsToDelete = op.rowIds
    } else if (op.filters) {
      // Find matching records by filter
      rowIdsToDelete = await this.findMatchingRecordIds(docId, tableId, op.filters)
      if (rowIdsToDelete.length === 0) {
        return {
          action: 'delete',
          success: true,
          recordsAffected: 0,
          filtersUsed: op.filters,
          verified: true
        }
      }
    } else {
      throw new Error('Either rowIds or filters must be provided for delete')
    }

    // Use domain operation - handles API call and verification (records gone)
    const result = await domainDeleteRecords(this.context, docId, tableId, rowIdsToDelete)

    return {
      action: 'delete',
      success: true,
      recordsAffected: result.count,
      recordIds: result.deletedIds,
      verified: true,
      ...(op.filters ? { filtersUsed: op.filters } : {})
    }
  }

  private async executeUpsert(
    docId: string,
    tableId: string,
    op: Extract<RecordOperation, { action: 'upsert' }>
  ): Promise<Omit<OperationResult, 'tableId'>> {
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
  tablesAffected: z.array(z.string()),
  operationsCompleted: z.number(),
  totalRecordsAffected: z.number(),
  results: z.array(
    z.object({
      action: z.string().describe('add/update/delete/upsert'),
      tableId: z.string(),
      success: z.boolean(),
      recordsAffected: z.number(),
      recordIds: z.array(z.number()).optional(),
      error: z.string().optional(),
      filtersUsed: z.record(z.string(), z.unknown()).optional(),
      verified: z.boolean().optional()
    })
  ),
  message: z.string(),
  partialFailure: z
    .object({
      operationIndex: z.number(),
      tableId: z.string(),
      error: z.string(),
      completedOperations: z.number()
    })
    .optional()
    .describe('present if batch stopped early'),
  nextSteps: z.array(z.string()).optional().describe('suggested next actions')
})

// =============================================================================
// Tool Definition
// =============================================================================

export const MANAGE_RECORDS_TOOL: ToolDefinition = {
  name: 'grist_manage_records',
  title: 'Manage Records',
  description:
    'Record CRUD: add, update, delete, or upsert. Single or batch operations. ' +
    'Supports cross-table dependencies (add Company, then Contact referencing it).',
  purpose: 'All record CRUD operations (add/update/delete/upsert)',
  category: 'records',
  inputSchema: ManageRecordsSchema,
  outputSchema: ManageRecordsOutputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true, // Can delete records
    idempotentHint: false, // add operations create new records each time
    openWorldHint: true
  },
  handler: manageRecords,
  docs: {
    overview:
      'Record operations: add, update, delete, upsert. Single records or batches. ' +
      'Operations execute sequentially, enabling cross-table dependencies.\n\n' +
      'DATA FORMAT BY COLUMN TYPE:\n' +
      '- Text: "string value"\n' +
      '- Numeric/Int: 42 or 3.14 (number, not string)\n' +
      '- Bool: true or false (not "true"/"false" strings)\n' +
      '- Date: "2024-03-15" (ISO format string)\n' +
      '- DateTime: "2024-03-15T14:30:00Z" (ISO format)\n' +
      '- Choice: "Option1" (must match defined choice exactly)\n' +
      '- ChoiceList: ["Option1", "Option2"] (array of strings)\n' +
      '- Ref: 42 (row ID number of referenced record)\n' +
      '- RefList: [1, 2, 3] (array of row ID numbers)\n\n' +
      'IMPORTANT - List formats:\n' +
      '- ChoiceList: ["a", "b"] NOT ["L", "a", "b"]\n' +
      '- RefList: [1, 2] NOT ["L", 1, 2]\n' +
      '- The "L" prefix is internal Grist format - never use it in API calls',
    examples: [
      {
        desc: 'Add a single record',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'add',
              tableId: 'Contacts',
              records: [{ Name: 'Alice', Email: 'alice@example.com' }]
            }
          ]
        }
      },
      {
        desc: 'Add records to multiple tables',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'add',
              tableId: 'Companies',
              records: [{ Name: 'Acme Corp' }]
            },
            {
              action: 'add',
              tableId: 'Contacts',
              records: [{ Name: 'John', Company: 1 }]
            }
          ]
        }
      },
      {
        desc: 'Update and delete in same table',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'update',
              tableId: 'Tasks',
              records: [
                { id: 1, fields: { Status: 'Complete' } },
                { id: 2, fields: { Status: 'Complete' } }
              ]
            },
            { action: 'delete', tableId: 'Tasks', rowIds: [3, 4] }
          ]
        }
      },
      {
        desc: 'Upsert by email',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'upsert',
              tableId: 'Users',
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
          operations: [{ action: 'delete', tableId: 'Logs', filters: { Status: 'Archived' } }]
        }
      }
    ],
    errors: [
      { error: 'Column not found', solution: 'Use grist_get_tables (case-sensitive)' },
      { error: 'Row ID not found', solution: 'Use grist_get_records to find valid row IDs' },
      {
        error: 'Partial failure',
        solution:
          'Check partialFailure.tableId and operationIndex to identify which table/operation failed'
      },
      {
        error: 'Cross-table reference invalid',
        solution: 'Order operations so creates happen before references'
      },
      { error: 'Invalid choice', solution: 'Use grist_get_tables with detail_level="full_schema"' }
    ]
  }
}
