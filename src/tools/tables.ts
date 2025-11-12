/**
 * Table Management Tools
 */

import { z } from 'zod'
import {
  ColumnDefinitionSchema,
  DocIdSchema,
  ResponseFormatSchema,
  TableIdSchema
} from '../schemas/common.js'
import {
  buildAddTableAction,
  buildRemoveTableAction,
  buildRenameTableAction
} from '../services/action-builder.js'
import type { GristClient } from '../services/grist-client.js'
import type { ApplyResponse } from '../types.js'
import { toTableId } from '../types/advanced.js'
import { GristTool } from './base/GristTool.js'

// ============================================================================
// 1. GRIST_CREATE_TABLE (Refactored)
// ============================================================================

export const CreateTableSchema = z
  .object({
    docId: DocIdSchema,
    tableName: z
      .string()
      .min(1)
      .max(100)
      .describe(
        'Name for the new table. Use alphanumeric characters and underscores. Example: "Contacts", "Sales_Data"'
      ),
    columns: z
      .array(ColumnDefinitionSchema)
      .min(0)
      .max(100)
      .describe(
        'Array of column definitions to create with the table. Can be empty to create table with default columns'
      ),
    response_format: ResponseFormatSchema
  })
  .strict()

export type CreateTableInput = z.infer<typeof CreateTableSchema>

export class CreateTableTool extends GristTool<typeof CreateTableSchema, any> {
  constructor(client: GristClient) {
    super(client, CreateTableSchema)
  }

  protected async executeInternal(params: CreateTableInput) {
    const action = buildAddTableAction(toTableId(params.tableName), params.columns)
    const response = await this.client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [action])

    const tableId = response.retValues[0]?.table_id || params.tableName

    return {
      success: true,
      document_id: params.docId,
      table_id: tableId,
      table_name: params.tableName,
      columns_created: params.columns.length,
      message: `Successfully created table "${params.tableName}" with ${params.columns.length} column(s)`,
      url: `${this.client.getBaseUrl()}/doc/${params.docId}/p/${tableId}`
    }
  }
}

export async function createTable(client: GristClient, params: CreateTableInput) {
  const tool = new CreateTableTool(client)
  return tool.execute(params)
}

// ============================================================================
// 2. GRIST_RENAME_TABLE (Refactored)
// ============================================================================

export const RenameTableSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    newTableId: z
      .string()
      .min(1)
      .max(100)
      .describe('New table name. Must be unique within the document'),
    response_format: ResponseFormatSchema
  })
  .strict()

export type RenameTableInput = z.infer<typeof RenameTableSchema>

export class RenameTableTool extends GristTool<typeof RenameTableSchema, any> {
  constructor(client: GristClient) {
    super(client, RenameTableSchema)
  }

  protected async executeInternal(params: RenameTableInput) {
    const action = buildRenameTableAction(toTableId(params.tableId), toTableId(params.newTableId))
    await this.client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [action])

    return {
      success: true,
      document_id: params.docId,
      old_table_id: params.tableId,
      new_table_id: params.newTableId,
      message: `Successfully renamed table from "${params.tableId}" to "${params.newTableId}"`,
      note: 'References to this table in formulas will be automatically updated'
    }
  }
}

export async function renameTable(client: GristClient, params: RenameTableInput) {
  const tool = new RenameTableTool(client)
  return tool.execute(params)
}

// ============================================================================
// 3. GRIST_DELETE_TABLE (Refactored)
// ============================================================================

export const DeleteTableSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    response_format: ResponseFormatSchema
  })
  .strict()

export type DeleteTableInput = z.infer<typeof DeleteTableSchema>

export class DeleteTableTool extends GristTool<typeof DeleteTableSchema, any> {
  constructor(client: GristClient) {
    super(client, DeleteTableSchema)
  }

  protected async executeInternal(params: DeleteTableInput) {
    const action = buildRemoveTableAction(toTableId(params.tableId))
    await this.client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [action])

    return {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      message: `Successfully deleted table "${params.tableId}"`,
      warning:
        'THIS OPERATION CANNOT BE UNDONE. All data in the table has been permanently deleted.',
      note: 'If this was a mistake, you may be able to restore from document history if available'
    }
  }
}

export async function deleteTable(client: GristClient, params: DeleteTableInput) {
  const tool = new DeleteTableTool(client)
  return tool.execute(params)
}
