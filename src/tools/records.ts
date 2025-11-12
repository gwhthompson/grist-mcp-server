/**
 * Record Operation Tools
 */

import { z } from 'zod'
import { MAX_RECORDS_PER_BATCH } from '../constants.js'
import { CellValueSchema } from '../schemas/api-responses.js'
import {
  DocIdSchema,
  ResponseFormatSchema,
  RowIdsSchema,
  TableIdSchema
} from '../schemas/common.js'
import {
  buildBulkAddRecordAction,
  buildBulkRemoveRecordAction,
  buildBulkUpdateRecordAction
} from '../services/action-builder.js'
import type { GristClient } from '../services/grist-client.js'
import { toRowId, toTableId } from '../types/advanced.js'
import type { ApplyResponse, UpsertResponse } from '../types.js'
import { GristTool } from './base/GristTool.js'

// ============================================================================
// 1. GRIST_ADD_RECORDS (Refactored)
// ============================================================================

export const AddRecordsSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    records: z
      .array(z.record(z.string(), CellValueSchema))
      .min(1)
      .max(MAX_RECORDS_PER_BATCH)
      .describe(
        `Array of record objects to add (max ${MAX_RECORDS_PER_BATCH}). Each object maps column IDs to values. Example: [{"Name": "John", "Email": "john@example.com"}]`
      ),
    response_format: ResponseFormatSchema
  })
  .strict()

export type AddRecordsInput = z.infer<typeof AddRecordsSchema>

export class AddRecordsTool extends GristTool<typeof AddRecordsSchema, unknown> {
  constructor(client: GristClient) {
    super(client, AddRecordsSchema)
  }

  protected async executeInternal(params: AddRecordsInput) {
    const action = buildBulkAddRecordAction(toTableId(params.tableId), params.records)
    const response = await this.client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [action])

    const addedIds = response.retValues?.[0] || []

    return {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      records_added: params.records.length,
      record_ids: addedIds,
      message: `Successfully added ${params.records.length} record(s) to ${params.tableId}`
    }
  }
}

export async function addRecords(client: GristClient, params: AddRecordsInput) {
  const tool = new AddRecordsTool(client)
  return tool.execute(params)
}

// ============================================================================
// 2. GRIST_UPDATE_RECORDS (Refactored)
// ============================================================================

export const UpdateRecordsSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    rowIds: RowIdsSchema,
    updates: z
      .record(z.string(), CellValueSchema)
      .describe(
        'Object mapping column IDs to new values. Example: {"Status": "Complete", "UpdatedDate": "2024-01-15"}'
      ),
    response_format: ResponseFormatSchema
  })
  .strict()

export type UpdateRecordsInput = z.infer<typeof UpdateRecordsSchema>

export class UpdateRecordsTool extends GristTool<typeof UpdateRecordsSchema, unknown> {
  constructor(client: GristClient) {
    super(client, UpdateRecordsSchema)
  }

  protected async executeInternal(params: UpdateRecordsInput) {
    const action = buildBulkUpdateRecordAction(
      toTableId(params.tableId),
      params.rowIds.map(toRowId),
      params.updates
    )

    await this.client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [action])

    return {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      records_updated: params.rowIds.length,
      message: `Successfully updated ${params.rowIds.length} record(s) in ${params.tableId}`
    }
  }
}

export async function updateRecords(client: GristClient, params: UpdateRecordsInput) {
  const tool = new UpdateRecordsTool(client)
  return tool.execute(params)
}

// ============================================================================
// 3. GRIST_UPSERT_RECORDS (Refactored)
// ============================================================================

/**
 * Upsert record format with require and fields
 * - require: Fields to match existing records
 * - fields: Fields to update or set in new records
 */
const UpsertRecordSchema = z.object({
  require: z.record(z.string(), CellValueSchema).optional(),
  fields: z.record(z.string(), CellValueSchema).optional()
})

export const UpsertRecordsSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    records: z
      .array(UpsertRecordSchema)
      .min(1)
      .max(MAX_RECORDS_PER_BATCH)
      .describe(
        `Array of record objects to upsert (max ${MAX_RECORDS_PER_BATCH}). Each record has 'require' (fields to match) and 'fields' (fields to update/add).`
      ),
    onMany: z
      .enum(['first', 'none', 'all'])
      .default('first')
      .describe('Strategy when multiple matches found: "first", "none", or "all"'),
    allowEmptyRequire: z
      .boolean()
      .default(false)
      .describe('Allow upsert with no require fields (adds all as new records)'),
    add: z.boolean().default(true).describe('Allow adding new records if no match'),
    update: z.boolean().default(true).describe('Allow updating existing records'),
    response_format: ResponseFormatSchema
  })
  .strict()

export type UpsertRecordsInput = z.infer<typeof UpsertRecordsSchema>

export class UpsertRecordsTool extends GristTool<typeof UpsertRecordsSchema, unknown> {
  constructor(client: GristClient) {
    super(client, UpsertRecordsSchema)
  }

  protected async executeInternal(params: UpsertRecordsInput) {
    const requestBody = {
      records: params.records,
      onMany: params.onMany,
      allowEmptyRequire: params.allowEmptyRequire,
      add: params.add,
      update: params.update
    }

    const response = await this.client.post<UpsertResponse>(
      `/docs/${params.docId}/tables/${params.tableId}/records`,
      requestBody
    )

    return {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      records_processed: params.records.length,
      record_ids: response.records || [],
      message: `Successfully processed ${params.records.length} upsert operation(s) on ${params.tableId}`,
      note: 'Record IDs returned include both newly added and updated records'
    }
  }
}

export async function upsertRecords(client: GristClient, params: UpsertRecordsInput) {
  const tool = new UpsertRecordsTool(client)
  return tool.execute(params)
}

// ============================================================================
// 4. GRIST_DELETE_RECORDS (Refactored)
// ============================================================================

export const DeleteRecordsSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    rowIds: RowIdsSchema,
    response_format: ResponseFormatSchema
  })
  .strict()

export type DeleteRecordsInput = z.infer<typeof DeleteRecordsSchema>

export class DeleteRecordsTool extends GristTool<typeof DeleteRecordsSchema, unknown> {
  constructor(client: GristClient) {
    super(client, DeleteRecordsSchema)
  }

  protected async executeInternal(params: DeleteRecordsInput) {
    const action = buildBulkRemoveRecordAction(
      toTableId(params.tableId),
      params.rowIds.map(toRowId)
    )

    await this.client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [action])

    return {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      records_deleted: params.rowIds.length,
      message: `Successfully deleted ${params.rowIds.length} record(s) from ${params.tableId}`,
      warning: 'This operation cannot be undone. Deleted records are permanently removed.'
    }
  }
}

export async function deleteRecords(client: GristClient, params: DeleteRecordsInput) {
  const tool = new DeleteRecordsTool(client)
  return tool.execute(params)
}
