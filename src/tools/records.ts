import { z } from 'zod'
import { MAX_RECORDS_PER_BATCH } from '../constants.js'
import {
  DESTRUCTIVE_ANNOTATIONS,
  SLOW_IDEMPOTENT_ANNOTATIONS,
  SLOW_OPERATION_ANNOTATIONS,
  type ToolContext,
  type ToolDefinition,
  WRITE_IDEMPOTENT_ANNOTATIONS
} from '../registry/types.js'
import { ApplyResponseSchema, CellValueSchema } from '../schemas/api-responses.js'
import {
  DocIdSchema,
  ResponseFormatSchema,
  RowIdsSchema,
  TableIdSchema
} from '../schemas/common.js'
import {
  AddRecordsOutputSchema,
  DeleteRecordsOutputSchema,
  UpdateRecordsOutputSchema,
  UpsertRecordsOutputSchema
} from '../schemas/output-schemas.js'
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
  validateRecord,
  validateRecords,
  validateUpsertRecords
} from '../validators/record-validator.js'
import { GristTool } from './base/GristTool.js'

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
  constructor(context: ToolContext) {
    super(context, AddRecordsSchema)
  }

  protected async executeInternal(params: AddRecordsInput) {
    const { schemaCache } = this
    const columns = await schemaCache.getTableColumns(
      toDocId(params.docId),
      toTableId(params.tableId)
    )

    validateRecords(params.records, columns)

    const action = buildBulkAddRecordAction(toTableId(params.tableId), params.records)
    const response = await this.client.post<ApplyResponse>(
      `/docs/${params.docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Adding ${params.records.length} records to ${params.tableId}`
      }
    )

    const retValues = validateRetValues(response, {
      context: `BulkAddRecord on ${params.tableId}`
    })

    const result = retValues[0]
    if (!Array.isArray(result)) {
      throw new Error(
        `Expected array of row IDs but got ${typeof result}. ` +
          `BulkAddRecord should return array of created row IDs.`
      )
    }

    const addedIds = result

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

export async function addRecords(context: ToolContext, params: AddRecordsInput) {
  const tool = new AddRecordsTool(context)
  return tool.execute(params)
}

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
  constructor(context: ToolContext) {
    super(context, UpdateRecordsSchema)
  }

  protected async executeInternal(params: UpdateRecordsInput) {
    const { schemaCache } = this
    const columns = await schemaCache.getTableColumns(
      toDocId(params.docId),
      toTableId(params.tableId)
    )

    validateRecord(params.updates, columns)

    const action = buildBulkUpdateRecordAction(
      toTableId(params.tableId),
      params.rowIds.map(toRowId),
      params.updates
    )

    const response = await this.client.post<ApplyResponse>(
      `/docs/${params.docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Updating ${params.rowIds.length} records in ${params.tableId}`
      }
    )

    validateRetValues(response, { context: `BulkUpdateRecord on ${params.tableId}` })

    return {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      records_updated: params.rowIds.length,
      message: `Successfully updated ${params.rowIds.length} record(s) in ${params.tableId}`
    }
  }
}

export async function updateRecords(context: ToolContext, params: UpdateRecordsInput) {
  const tool = new UpdateRecordsTool(context)
  return tool.execute(params)
}

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
  constructor(context: ToolContext) {
    super(context, UpsertRecordsSchema)
  }

  protected async executeInternal(params: UpsertRecordsInput) {
    const { schemaCache } = this
    const columns = await schemaCache.getTableColumns(
      toDocId(params.docId),
      toTableId(params.tableId)
    )

    validateUpsertRecords(params.records, columns)

    const requestBody = {
      records: params.records
    }

    const queryParams: Record<string, string> = {}

    if (params.onMany && params.onMany !== 'first') {
      queryParams.onmany = params.onMany
    }

    if (params.allowEmptyRequire) {
      queryParams.allow_empty_require = 'true'
    }

    if (!params.add) {
      queryParams.noadd = 'true'
    }

    if (!params.update) {
      queryParams.noupdate = 'true'
    }

    const response = await this.client.put<UpsertResponse | null>(
      `/docs/${params.docId}/tables/${params.tableId}/records`,
      requestBody,
      {
        config: {
          params: queryParams
        }
      }
    )

    let recordIds: number[] = []

    if (response?.records) {
      recordIds = response.records
    } else {
      recordIds = []
    }

    return {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      records_processed: params.records.length,
      record_ids: recordIds,
      message: `Successfully processed ${params.records.length} upsert operation(s) on ${params.tableId}`,
      note:
        recordIds.length === 0
          ? 'Grist upsert API does not return record IDs. Query table with filters to find affected records.'
          : 'Record IDs returned include both newly added and updated records'
    }
  }
}

export async function upsertRecords(context: ToolContext, params: UpsertRecordsInput) {
  const tool = new UpsertRecordsTool(context)
  return tool.execute(params)
}

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
  constructor(context: ToolContext) {
    super(context, DeleteRecordsSchema)
  }

  protected async executeInternal(params: DeleteRecordsInput) {
    const action = buildBulkRemoveRecordAction(
      toTableId(params.tableId),
      params.rowIds.map(toRowId)
    )

    const response = await this.client.post<ApplyResponse>(
      `/docs/${params.docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Deleting ${params.rowIds.length} records from ${params.tableId}`
      }
    )

    validateRetValues(response, { context: `BulkRemoveRecord on ${params.tableId}` })

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

export async function deleteRecords(context: ToolContext, params: DeleteRecordsInput) {
  const tool = new DeleteRecordsTool(context)
  return tool.execute(params)
}

export const RECORD_TOOLS: ReadonlyArray<ToolDefinition> = [
  {
    name: 'grist_add_records',
    title: 'Add Grist Records',
    description: `Insert new records (fastest, no duplicate check).
NOT FOR: CSV imports, sync -> use grist_upsert_records
Params: docId, tableId, records (array, max 500)
Ex: {records:[{"Name":"John","Email":"j@x.com"}]}`,
    purpose: 'Insert new records',
    category: 'records',
    inputSchema: AddRecordsSchema,
    outputSchema: AddRecordsOutputSchema,
    annotations: SLOW_OPERATION_ANNOTATIONS,
    handler: addRecords,
    docs: {
      overview:
        'Insert new records. Fastest for bulk inserts. Use grist_upsert_records if records might already exist. Use natural formats; the server handles encoding.',
      examples: [
        {
          desc: 'Add single record',
          input: {
            docId: 'abc123',
            tableId: 'Contacts',
            records: [{ Name: 'John Smith', Email: 'john@example.com' }]
          }
        },
        {
          desc: 'Add with various types',
          input: {
            docId: 'abc123',
            tableId: 'Employees',
            records: [
              {
                Name: 'Jane',
                Age: 30,
                Tags: ['VIP', 'Manager'],
                HireDate: '2021-01-15',
                Manager: 456
              }
            ]
          }
        }
      ],
      errors: [
        { error: 'Column not found', solution: 'Use grist_get_tables (case-sensitive)' },
        { error: 'Duplicate key', solution: 'Use grist_upsert_records for sync' },
        {
          error: 'Cannot write to formula column',
          solution: 'Use grist_manage_columns to make it non-formula'
        }
      ]
    }
  },
  {
    name: 'grist_update_records',
    title: 'Update Grist Records',
    description: `Update existing records by row ID.
NOT FOR: Sync by unique key -> use grist_upsert_records
Params: docId, tableId, rowIds (array), updates (object)
Ex: {rowIds:[1,2],updates:{"Status":"Complete"}}`,
    purpose: 'Modify records by row ID',
    category: 'records',
    inputSchema: UpdateRecordsSchema,
    outputSchema: UpdateRecordsOutputSchema,
    annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    handler: updateRecords,
    docs: {
      overview:
        "Modify records by row ID. Use grist_upsert_records if you don't have row IDs. All specified rows receive the same updates.",
      examples: [
        {
          desc: 'Update status',
          input: {
            docId: 'abc123',
            tableId: 'Tasks',
            rowIds: [1, 2, 3],
            updates: { Status: 'Complete', CompletedDate: '2024-01-15' }
          }
        }
      ],
      errors: [
        { error: 'Row ID not found', solution: 'Use grist_get_records to get IDs' },
        { error: 'Column not found', solution: 'Use grist_get_tables' }
      ]
    }
  },
  {
    name: 'grist_upsert_records',
    title: 'Upsert Grist Records',
    description: `Add or update by unique key (idempotent sync).
USE FOR: CSV imports, API syncs, deduplication
Params: docId, tableId, records:[{require:{key},fields:{}}]
Ex: {records:[{require:{"Email":"j@x.com"},fields:{"Name":"John"}}]}`,
    purpose: 'Add or update by unique key (sync)',
    category: 'records',
    inputSchema: UpsertRecordsSchema,
    outputSchema: UpsertRecordsOutputSchema,
    annotations: SLOW_IDEMPOTENT_ANNOTATIONS,
    handler: upsertRecords,
    docs: {
      overview:
        'Add or update records by unique key. Use for sync workflows. Parameters: require (unique identifier to match), fields (values to set), onMany (first/none/all), add (insert if not found), update (modify if found).',
      examples: [
        {
          desc: 'Upsert by email',
          input: {
            docId: 'abc123',
            tableId: 'Contacts',
            records: [{ require: { Email: 'john@example.com' }, fields: { Name: 'John Doe' } }]
          }
        },
        {
          desc: 'Update only (no insert)',
          input: {
            docId: 'abc123',
            tableId: 'Contacts',
            records: [{ require: { Email: 'john@example.com' }, fields: { Status: 'Active' } }],
            add: false,
            update: true
          }
        }
      ],
      errors: [
        {
          error: 'Upsert created duplicate',
          solution: 'Check case-sensitivity and whitespace in require field'
        },
        { error: 'Multiple records match', solution: 'Use onMany parameter' }
      ]
    }
  },
  {
    name: 'grist_delete_records',
    title: 'Delete Grist Records',
    description: `Permanently delete records by row ID (CANNOT be undone).
NOT FOR: Archiving -> use grist_update_records with Status="Archived"
Params: docId, tableId, rowIds (array, max 500)
Ex: {rowIds:[1,2,3]}`,
    purpose: 'Delete records permanently',
    category: 'records',
    inputSchema: DeleteRecordsSchema,
    outputSchema: DeleteRecordsOutputSchema,
    annotations: DESTRUCTIVE_ANNOTATIONS,
    handler: deleteRecords,
    docs: {
      overview: 'Permanently remove records by row ID. Cannot be undone.',
      examples: [
        {
          desc: 'Delete by IDs',
          input: { docId: 'abc123', tableId: 'Tasks', rowIds: [1, 2, 3] }
        }
      ],
      errors: [
        { error: 'Row ID not found', solution: 'Use grist_get_records first' },
        { error: 'Permission denied', solution: 'Verify write access' }
      ]
    }
  }
] as const
