/**
 * Record Operation Tools (4 tools)
 *
 * These tools enable CRUD operations on records:
 * - grist_add_records: Insert new records
 * - grist_update_records: Modify existing records
 * - grist_upsert_records: Add or update if exists (critical for sync workflows)
 * - grist_delete_records: Remove records
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
import { formatErrorResponse, formatToolResponse } from '../services/formatter.js'
import type { GristClient } from '../services/grist-client.js'
import type { ApplyResponse, UpsertResponse } from '../types.js'
import { toTableId, toRowId } from '../types/advanced.js'

// ============================================================================
// 1. GRIST_ADD_RECORDS
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
        `Array of record objects to add (max ${MAX_RECORDS_PER_BATCH}). Each object maps column IDs to values. Example: [{"Name": "John", "Email": "john@example.com"}, {"Name": "Jane", "Email": "jane@example.com"}]`
      ),
    response_format: ResponseFormatSchema
  })
  .strict()

export type AddRecordsInput = z.infer<typeof AddRecordsSchema>

export async function addRecords(client: GristClient, params: AddRecordsInput) {
  try {
    // Build BulkAddRecord action
    const action = buildBulkAddRecordAction(toTableId(params.tableId), params.records)

    // Execute via /apply endpoint (expects array of actions directly)
    const response = await client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [action])

    // Extract added record IDs from response
    const addedIds = response.retValues[0] || []

    const result = {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      records_added: params.records.length,
      record_ids: addedIds,
      message: `Successfully added ${params.records.length} record(s) to ${params.tableId}`
    }

    return formatToolResponse(result, params.response_format)
  } catch (error) {
    return formatErrorResponse(error instanceof Error ? error.message : String(error))
  }
}

// ============================================================================
// 2. GRIST_UPDATE_RECORDS
// ============================================================================

export const UpdateRecordsSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    rowIds: RowIdsSchema,
    updates: z
      .record(z.string(), z.any())
      .describe(
        'Object mapping column IDs to new values. Example: {"Status": "Complete", "UpdatedDate": "2024-01-15"}'
      ),
    response_format: ResponseFormatSchema
  })
  .strict()

export type UpdateRecordsInput = z.infer<typeof UpdateRecordsSchema>

export async function updateRecords(client: GristClient, params: UpdateRecordsInput) {
  try {
    // Build BulkUpdateRecord action
    const action = buildBulkUpdateRecordAction(
      toTableId(params.tableId),
      params.rowIds.map(toRowId),
      params.updates
    )

    // Execute via /apply endpoint (expects array of actions directly)
    await client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [action])

    const result = {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      records_updated: params.rowIds.length,
      message: `Successfully updated ${params.rowIds.length} record(s) in ${params.tableId}`
    }

    return formatToolResponse(result, params.response_format)
  } catch (error) {
    return formatErrorResponse(error instanceof Error ? error.message : String(error))
  }
}

// ============================================================================
// 3. GRIST_UPSERT_RECORDS (Critical for sync workflows)
// ============================================================================

export const UpsertRecordsSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    records: z
      .array(
        z.object({
          require: z
            .record(z.string(), z.any())
            .describe(
              'Unique identifier fields to check for existing record. Example: {"Email": "john@example.com"}'
            ),
          fields: z
            .record(z.string(), z.any())
            .describe('Fields to set/update. Example: {"Name": "John Doe", "Status": "Active"}')
        })
      )
      .min(1)
      .max(MAX_RECORDS_PER_BATCH)
      .describe(
        `Array of upsert operations (max ${MAX_RECORDS_PER_BATCH}). Each has "require" (match criteria) and "fields" (values to set)`
      ),
    onMany: z
      .enum(['first', 'none', 'all'])
      .default('first')
      .describe(
        'Action when multiple records match: "first" = update first match, "none" = error, "all" = update all matches'
      ),
    add: z
      .boolean()
      .default(true)
      .describe('If true, add new record when no match found. If false, skip non-matching records'),
    update: z
      .boolean()
      .default(true)
      .describe('If true, update matching records. If false, skip matching records'),
    response_format: ResponseFormatSchema
  })
  .strict()

export type UpsertRecordsInput = z.infer<typeof UpsertRecordsSchema>

export async function upsertRecords(client: GristClient, params: UpsertRecordsInput) {
  try {
    // Prepare upsert records in Grist format
    const upsertData = {
      records: params.records.map((r) => ({
        require: r.require,
        fields: r.fields
      })),
      onMany: params.onMany,
      add: params.add,
      update: params.update
    }

    // Execute via PUT /records endpoint
    const response = await client.put<UpsertResponse>(
      `/docs/${params.docId}/tables/${params.tableId}/records`,
      upsertData
    )

    // Response contains array of record IDs (added or updated)
    // Note: Grist API may return null or empty for upsert responses
    const recordIds = response?.records || []

    const result = {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      records_processed: params.records.length,
      record_ids: recordIds,
      message: `Successfully processed ${params.records.length} upsert operation(s) on ${params.tableId}`,
      note: 'Record IDs returned include both newly added and updated records'
    }

    return formatToolResponse(result, params.response_format)
  } catch (error) {
    return formatErrorResponse(error instanceof Error ? error.message : String(error))
  }
}

// ============================================================================
// 4. GRIST_DELETE_RECORDS
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

export async function deleteRecords(client: GristClient, params: DeleteRecordsInput) {
  try {
    // Build BulkRemoveRecord action
    const action = buildBulkRemoveRecordAction(
      toTableId(params.tableId),
      params.rowIds.map(toRowId)
    )

    // Execute via /apply endpoint (expects array of actions directly)
    await client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [action])

    const result = {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      records_deleted: params.rowIds.length,
      message: `Successfully deleted ${params.rowIds.length} record(s) from ${params.tableId}`,
      warning: 'This operation cannot be undone. Deleted records are permanently removed.'
    }

    return formatToolResponse(result, params.response_format)
  } catch (error) {
    return formatErrorResponse(error instanceof Error ? error.message : String(error))
  }
}
