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
  FilterSchema,
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

export const AddRecordsSchema = z.strictObject({
  docId: DocIdSchema,
  tableId: TableIdSchema,
  records: z
    .array(z.record(z.string(), CellValueSchema))
    .min(1)
    .max(MAX_RECORDS_PER_BATCH)
    .describe(`Records to add [{col: value}]`),
  response_format: ResponseFormatSchema
})

export type AddRecordsInput = z.infer<typeof AddRecordsSchema>

export class AddRecordsTool extends GristTool<typeof AddRecordsSchema, unknown> {
  constructor(context: ToolContext) {
    super(context, AddRecordsSchema)
  }

  protected async executeInternal(params: AddRecordsInput) {
    const { schemaCache } = this
    const docId = toDocId(params.docId)
    const tableId = toTableId(params.tableId)

    // Fetch fresh column metadata for validation (includes widgetOptions for Choice)
    const columns = await schemaCache.getFreshColumns(docId, tableId)

    // Type validation (column existence, writable, type compatibility)
    validateRecords(params.records, columns, params.tableId)

    // Data integrity validation (Ref values exist, Choice values valid)
    await validateRecordsDataIntegrity(params.records, columns, tableId, docId, schemaCache)

    const action = buildBulkAddRecordAction(tableId, params.records)
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
      docId: params.docId,
      tableId: params.tableId,
      recordsAdded: params.records.length,
      recordIds: addedIds,
      message: `Successfully added ${params.records.length} record(s) to ${params.tableId}`
    }
  }
}

export async function addRecords(context: ToolContext, params: AddRecordsInput) {
  const tool = new AddRecordsTool(context)
  return tool.execute(params)
}

export const UpdateRecordsSchema = z.strictObject({
  docId: DocIdSchema,
  tableId: TableIdSchema,
  rowIds: RowIdsSchema,
  updates: z.record(z.string(), CellValueSchema).describe('Column values to update'),
  response_format: ResponseFormatSchema
})

export type UpdateRecordsInput = z.infer<typeof UpdateRecordsSchema>

export class UpdateRecordsTool extends GristTool<typeof UpdateRecordsSchema, unknown> {
  constructor(context: ToolContext) {
    super(context, UpdateRecordsSchema)
  }

  protected async executeInternal(params: UpdateRecordsInput) {
    const { schemaCache } = this
    const docId = toDocId(params.docId)
    const tableId = toTableId(params.tableId)

    // Validate row IDs exist before attempting update (prevents 500 error)
    await validateRowIdsExist(params.rowIds, tableId, docId, schemaCache)

    // Fetch fresh column metadata for validation
    const columns = await schemaCache.getFreshColumns(docId, tableId)

    // Type validation
    validateRecord(params.updates, columns, params.tableId)

    // Data integrity validation (Ref values exist, Choice values valid)
    await validateRecordsDataIntegrity([params.updates], columns, tableId, docId, schemaCache)

    const action = buildBulkUpdateRecordAction(tableId, params.rowIds.map(toRowId), params.updates)

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
      docId: params.docId,
      tableId: params.tableId,
      recordsUpdated: params.rowIds.length,
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

export const UpsertRecordsSchema = z.strictObject({
  docId: DocIdSchema,
  tableId: TableIdSchema,
  records: z
    .array(UpsertRecordSchema)
    .min(1)
    .max(MAX_RECORDS_PER_BATCH)
    .describe('Records with {require: match, fields: update}'),
  onMany: z.enum(['first', 'none', 'all']).default('first').describe('Multi-match strategy'),
  allowEmptyRequire: z.boolean().default(false).describe('Allow empty require (adds all)'),
  add: z.boolean().default(true).describe('Allow adding if no match'),
  update: z.boolean().default(true).describe('Allow updating matches'),
  response_format: ResponseFormatSchema
})

export type UpsertRecordsInput = z.infer<typeof UpsertRecordsSchema>

export class UpsertRecordsTool extends GristTool<typeof UpsertRecordsSchema, unknown> {
  constructor(context: ToolContext) {
    super(context, UpsertRecordsSchema)
  }

  protected async executeInternal(params: UpsertRecordsInput) {
    const { schemaCache } = this
    const docId = toDocId(params.docId)
    const tableId = toTableId(params.tableId)

    // Fetch fresh column metadata for validation
    const columns = await schemaCache.getFreshColumns(docId, tableId)

    // Type validation
    validateUpsertRecords(params.records, columns, params.tableId)

    // Data integrity validation (Ref values exist, Choice values valid)
    await validateUpsertRecordsDataIntegrity(params.records, columns, tableId, docId, schemaCache)

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
      // Grist API doesn't return IDs for upsert - query for affected records
      recordIds = await this.findAffectedRecordIds(params)
    }

    return {
      success: true,
      docId: params.docId,
      tableId: params.tableId,
      recordsProcessed: params.records.length,
      recordIds: recordIds,
      message: `Successfully processed ${params.records.length} upsert operation(s) on ${params.tableId}`,
      note:
        recordIds.length === 0
          ? 'Could not determine affected record IDs. Use grist_get_records with filters to find them.'
          : 'Record IDs determined by querying for records matching the require fields'
    }
  }

  private async findAffectedRecordIds(params: UpsertRecordsInput): Promise<number[]> {
    // Collect all unique require field combinations to query
    const allIds = new Set<number>()

    for (const record of params.records) {
      if (!record.require || Object.keys(record.require).length === 0) {
        continue // Skip records with empty require (can't query for them)
      }

      try {
        // Build filter from require fields
        const filter: Record<string, unknown[]> = {}
        for (const [key, value] of Object.entries(record.require)) {
          filter[key] = [value]
        }

        const response = await this.client.get<{ records: Array<{ id: number }> }>(
          `/docs/${params.docId}/tables/${params.tableId}/records`,
          {
            filter: JSON.stringify(filter),
            limit: 100 // Reasonable limit for upsert results
          }
        )

        for (const rec of response.records || []) {
          allIds.add(rec.id)
        }
      } catch {
        // If query fails, continue with other records
      }
    }

    return Array.from(allIds)
  }
}

export async function upsertRecords(context: ToolContext, params: UpsertRecordsInput) {
  const tool = new UpsertRecordsTool(context)
  return tool.execute(params)
}

export const DeleteRecordsSchema = z
  .strictObject({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    rowIds: RowIdsSchema.optional().describe('Row IDs to delete (or use filters)'),
    filters: FilterSchema.describe('Delete matching records (or use rowIds)'),
    response_format: ResponseFormatSchema
  })
  .refine((data) => data.rowIds || data.filters, {
    message: 'Either rowIds or filters must be provided'
  })

export type DeleteRecordsInput = z.infer<typeof DeleteRecordsSchema>

interface RecordsResponse {
  records: Array<{ id: number }>
}

export class DeleteRecordsTool extends GristTool<typeof DeleteRecordsSchema, unknown> {
  constructor(context: ToolContext) {
    super(context, DeleteRecordsSchema)
  }

  protected async executeInternal(params: DeleteRecordsInput) {
    const { schemaCache } = this
    const docId = toDocId(params.docId)
    const tableId = toTableId(params.tableId)
    let rowIdsToDelete: number[]

    if (params.rowIds) {
      // Validate row IDs exist before attempting delete (prevents 500 error)
      await validateRowIdsExist(params.rowIds, tableId, docId, schemaCache)
      rowIdsToDelete = params.rowIds
    } else if (params.filters) {
      // Query for matching records first
      rowIdsToDelete = await this.findMatchingRecordIds(params)
      if (rowIdsToDelete.length === 0) {
        return {
          success: true,
          docId: params.docId,
          tableId: params.tableId,
          recordsDeleted: 0,
          message: 'No records matched the provided filters',
          filtersUsed: params.filters
        }
      }
    } else {
      throw new Error('Either rowIds or filters must be provided')
    }

    const action = buildBulkRemoveRecordAction(tableId, rowIdsToDelete.map(toRowId))

    const response = await this.client.post<ApplyResponse>(
      `/docs/${params.docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Deleting ${rowIdsToDelete.length} records from ${params.tableId}`
      }
    )

    validateRetValues(response, { context: `BulkRemoveRecord on ${params.tableId}` })

    return {
      success: true,
      docId: params.docId,
      tableId: params.tableId,
      recordsDeleted: rowIdsToDelete.length,
      deletedRowIds: rowIdsToDelete,
      message: `Successfully deleted ${rowIdsToDelete.length} record(s) from ${params.tableId}`,
      warning: 'This operation cannot be undone. Deleted records are permanently removed.',
      ...(params.filters ? { filtersUsed: params.filters } : {})
    }
  }

  private async findMatchingRecordIds(params: DeleteRecordsInput): Promise<number[]> {
    // Convert filters to Grist format
    const gristFilters: Record<string, unknown[]> = {}
    for (const [key, value] of Object.entries(params.filters || {})) {
      gristFilters[key] = Array.isArray(value) ? value : [value]
    }

    const response = await this.client.get<RecordsResponse>(
      `/docs/${params.docId}/tables/${params.tableId}/records`,
      {
        filter: JSON.stringify(gristFilters),
        limit: MAX_RECORDS_PER_BATCH // Don't delete more than batch limit at once
      }
    )

    return (response.records || []).map((r) => r.id)
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
    description: 'Insert new records',
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
        },
        {
          error: 'Invalid reference',
          solution:
            'Row ID must exist in referenced table. Use grist_get_records to find valid IDs.'
        },
        {
          error: 'Invalid choice',
          solution:
            'Value must be in allowed choices. Use grist_get_tables with detail_level="full_schema" to see choices.'
        }
      ]
    }
  },
  {
    name: 'grist_update_records',
    title: 'Update Grist Records',
    description: 'Update existing records by row ID',
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
        { error: 'Row ID not found', solution: 'Use grist_get_records to find valid row IDs' },
        { error: 'Column not found', solution: 'Use grist_get_tables' },
        {
          error: 'Invalid reference',
          solution:
            'Row ID must exist in referenced table. Use grist_get_records to find valid IDs.'
        },
        {
          error: 'Invalid choice',
          solution:
            'Value must be in allowed choices. Use grist_get_tables with detail_level="full_schema" to see choices.'
        }
      ]
    }
  },
  {
    name: 'grist_upsert_records',
    title: 'Upsert Grist Records',
    description: 'Add or update records by unique key (idempotent sync)',
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
        { error: 'Multiple records match', solution: 'Use onMany parameter' },
        {
          error: 'Invalid reference',
          solution:
            'Row ID must exist in referenced table. Use grist_get_records to find valid IDs.'
        },
        {
          error: 'Invalid choice',
          solution:
            'Value must be in allowed choices. Use grist_get_tables with detail_level="full_schema" to see choices.'
        }
      ]
    }
  },
  {
    name: 'grist_delete_records',
    title: 'Delete Grist Records',
    description: 'Permanently delete records by row ID or filters',
    purpose: 'Delete records permanently',
    category: 'records',
    inputSchema: DeleteRecordsSchema,
    outputSchema: DeleteRecordsOutputSchema,
    annotations: DESTRUCTIVE_ANNOTATIONS,
    handler: deleteRecords,
    docs: {
      overview:
        'Permanently remove records by row ID or by filter. Cannot be undone. ' +
        'Use rowIds for specific records, or filters to delete matching records.',
      examples: [
        {
          desc: 'Delete by IDs',
          input: { docId: 'abc123', tableId: 'Tasks', rowIds: [1, 2, 3] }
        },
        {
          desc: 'Delete by filter',
          input: { docId: 'abc123', tableId: 'Orders', filters: { Status: 'Cancelled' } }
        },
        {
          desc: 'Delete with multiple filter values',
          input: {
            docId: 'abc123',
            tableId: 'Logs',
            filters: { Level: ['debug', 'info'], Archived: true }
          }
        }
      ],
      errors: [
        { error: 'Row ID not found', solution: 'Use grist_get_records first' },
        { error: 'Permission denied', solution: 'Verify write access' },
        { error: 'No records matched', solution: 'Check filter values and column names' }
      ]
    }
  }
] as const
