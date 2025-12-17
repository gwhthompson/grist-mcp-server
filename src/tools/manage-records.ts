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
    tableId: TableIdSchema,
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
    tableId: TableIdSchema,
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
    tableId: TableIdSchema,
    rowIds: z
      .array(z.number().int().positive())
      .min(1)
      .max(MAX_RECORDS_PER_BATCH)
      .optional()
      .describe('Row IDs to delete (use this OR filters, not both)'),
    filters: FilterSchema.describe(
      'Delete records matching criteria (use this OR rowIds, not both). Example: {Status: "Cancelled"}'
    )
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
    tableId: TableIdSchema,
    records: z
      .array(
        z.object({
          require: RecordDataSchema.describe(
            'Match criteria to find existing records. Example: {Email: "x@y.com"}'
          ),
          fields: RecordDataSchema.optional().describe(
            'Values to set on matched/new records. Example: {Name: "Updated", Status: "Active"}'
          )
        })
      )
      .min(1)
      .max(MAX_RECORDS_PER_BATCH)
      .describe('Records with {require: match criteria, fields: values to set}'),
    onMany: z
      .enum(['first', 'none', 'all'])
      .default('first')
      .describe('If multiple records match: "first"=update first, "none"=error, "all"=update all'),
    allowEmptyRequire: z
      .boolean()
      .default(false)
      .describe('Allow empty require (DANGER: updates all rows if true)'),
    add: z.boolean().default(true).describe('Insert new record if no match found'),
    update: z.boolean().default(true).describe('Update existing record if match found')
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
  tableId: string
  success: boolean
  recordsAffected: number
  recordIds?: number[]
  error?: string
  filtersUsed?: Record<string, unknown>
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

export class ManageRecordsTool extends GristTool<
  typeof ManageRecordsSchema,
  ManageRecordsResponse
> {
  constructor(context: ToolContext) {
    super(context, ManageRecordsSchema)
  }

  protected async executeInternal(params: ManageRecordsInput): Promise<ManageRecordsResponse> {
    const { schemaCache } = this
    const docIdBranded = toDocId(params.docId)
    const results: OperationResult[] = []
    const affectedTables = new Set<string>()
    let totalAffected = 0

    // Execute operations sequentially (later operations may depend on earlier ones)
    for (let i = 0; i < params.operations.length; i++) {
      const op = params.operations[i]
      if (!op) continue

      const tableIdBranded = toTableId(op.tableId)

      try {
        const result = await this.executeOperation(params.docId, op.tableId, op)
        results.push({
          ...result,
          tableId: op.tableId
        })
        totalAffected += result.recordsAffected
        affectedTables.add(op.tableId)

        // Invalidate cache after any modification
        schemaCache.invalidateCache(docIdBranded, tableIdBranded)
      } catch (error) {
        // Return partial failure info
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          docId: params.docId,
          tablesAffected: Array.from(affectedTables),
          operationsCompleted: i,
          totalRecordsAffected: totalAffected,
          results,
          message: `Operation ${i + 1} (${op.action} on ${op.tableId}) failed: ${errorMessage}`,
          partialFailure: {
            operationIndex: i,
            tableId: op.tableId,
            error: errorMessage,
            completedOperations: i
          }
        }
      }
    }

    const tableCount = affectedTables.size
    const tableText = tableCount === 1 ? 'table' : 'tables'

    return {
      success: true,
      docId: params.docId,
      tablesAffected: Array.from(affectedTables),
      operationsCompleted: params.operations.length,
      totalRecordsAffected: totalAffected,
      results,
      message: `Successfully completed ${params.operations.length} operation(s) affecting ${totalAffected} record(s) across ${tableCount} ${tableText}`
    }
  }

  protected async afterExecute(
    result: ManageRecordsResponse,
    params: ManageRecordsInput
  ): Promise<ManageRecordsResponse> {
    const nextSteps: string[] = []

    if (result.partialFailure) {
      // Guide recovery from partial failure
      nextSteps.push(
        `Fix error in ${result.partialFailure.tableId}: ${result.partialFailure.error}`
      )
      nextSteps.push(`Resume from operation index ${result.partialFailure.operationIndex}`)
    } else if (result.success) {
      // Generate contextual next steps based on operations performed
      const addResults = result.results.filter((r) => r.action === 'add' && r.recordIds?.length)
      const updateResults = result.results.filter((r) => r.action === 'update')

      if (addResults.length > 0) {
        const firstAdd = addResults[0]
        if (firstAdd?.recordIds && firstAdd.recordIds.length > 0) {
          nextSteps.push(
            `Use grist_get_records with docId="${params.docId}" and tableId="${firstAdd.tableId}" to verify added records`
          )
        }
      }

      if (updateResults.length > 0) {
        nextSteps.push(`Use grist_get_records to verify updated data`)
      }

      // Suggest page creation if data was added
      if (addResults.length > 0 && result.totalRecordsAffected > 0) {
        nextSteps.push(`Use grist_manage_pages action='create_page' to create a view for the data`)
      }
    }

    return { ...result, nextSteps: nextSteps.length > 0 ? nextSteps : undefined }
  }

  private async executeOperation(
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
  ): Promise<Omit<OperationResult, 'tableId'>> {
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
  ): Promise<Omit<OperationResult, 'tableId'>> {
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
  success: z.boolean().describe('true if all operations completed without errors'),
  docId: z.string().describe('Document that was modified'),
  tablesAffected: z.array(z.string()).describe('Tables modified (for cache invalidation)'),
  operationsCompleted: z.number().describe('Count of successful operations'),
  totalRecordsAffected: z.number().describe('Total records added/updated/deleted'),
  results: z
    .array(
      z.object({
        action: z.string().describe('Operation type: add/update/delete/upsert'),
        tableId: z.string().describe('Table this operation modified'),
        success: z.boolean().describe('true if this operation succeeded'),
        recordsAffected: z.number().describe('Records affected by this operation'),
        recordIds: z.array(z.number()).optional().describe('Row IDs of affected records'),
        error: z.string().optional().describe('Error message if operation failed'),
        filtersUsed: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Filters used for delete')
      })
    )
    .describe('Per-operation results with recordIds for follow-up queries'),
  message: z.string().describe('Human-readable summary'),
  partialFailure: z
    .object({
      operationIndex: z.number().describe('Index of failed operation (0-based)'),
      tableId: z.string().describe('Table where failure occurred'),
      error: z.string().describe('What went wrong'),
      completedOperations: z.number().describe('Operations that succeeded before failure')
    })
    .optional()
    .describe('Present if operations stopped mid-batch'),
  nextSteps: z.array(z.string()).optional().describe('Suggested next actions')
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
