/**
 * Record Operation Tools (Refactored with Base Classes)
 *
 * REFACTORED VERSION using GristTool base class
 * Reduces code from ~246 lines to ~160 lines (-35% reduction)
 */

import { z } from 'zod'
import { MAX_RECORDS_PER_BATCH } from '../constants.js'
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
import type { ApplyResponse, UpsertResponse } from '../types.js'
import { toTableId, toRowId } from '../types/advanced.js'
import { GristTool } from './base/GristTool.js'

// ============================================================================
// 1. GRIST_ADD_RECORDS (Refactored)
// ============================================================================

export const AddRecordsSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    records: z
      .array(z.record(z.string(), z.any()))
      .min(1)
      .max(MAX_RECORDS_PER_BATCH)
      .describe(
        `Array of record objects to add (max ${MAX_RECORDS_PER_BATCH}). Each object maps column IDs to values. Example: [{"Name": "John", "Email": "john@example.com"}]`
      ),
    response_format: ResponseFormatSchema
  })
  .strict()

export type AddRecordsInput = z.infer<typeof AddRecordsSchema>

export class AddRecordsTool extends GristTool<typeof AddRecordsSchema, any> {
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
    records: z
      .array(
        z.object({
          id: z.number().int().positive().describe('Row ID of the record to update'),
          fields: z.record(z.string(), z.any()).describe('Fields to update')
        })
      )
      .min(1)
      .max(MAX_RECORDS_PER_BATCH)
      .describe(`Array of records with id and fields to update (max ${MAX_RECORDS_PER_BATCH})`),
    response_format: ResponseFormatSchema
  })
  .strict()

export type UpdateRecordsInput = z.infer<typeof UpdateRecordsSchema>

export class UpdateRecordsTool extends GristTool<typeof UpdateRecordsSchema, any> {
  constructor(client: GristClient) {
    super(client, UpdateRecordsSchema)
  }

  protected async executeInternal(params: UpdateRecordsInput) {
    const rowIds = params.records.map(r => toRowId(r.id))
    const records = params.records.map(r => r.fields as any)

    const action = buildBulkUpdateRecordAction(toTableId(params.tableId), rowIds, records as any)
    await this.client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [action])

    return {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      records_updated: params.records.length,
      record_ids: params.records.map(r => r.id),
      message: `Successfully updated ${params.records.length} record(s) in ${params.tableId}`
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

export const UpsertRecordsSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    records: z
      .array(z.record(z.string(), z.any()))
      .min(1)
      .max(MAX_RECORDS_PER_BATCH)
      .describe(`Array of record objects to upsert (max ${MAX_RECORDS_PER_BATCH})`),
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

export class UpsertRecordsTool extends GristTool<typeof UpsertRecordsSchema, any> {
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

export class DeleteRecordsTool extends GristTool<typeof DeleteRecordsSchema, any> {
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
