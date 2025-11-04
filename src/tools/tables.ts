/**
 * Table Management Tools (3 tools)
 *
 * These tools enable table lifecycle management:
 * - grist_create_table: Create new table with initial columns
 * - grist_rename_table: Rename existing table
 * - grist_delete_table: Remove table (WARNING: data loss)
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
import { formatErrorResponse, formatToolResponse } from '../services/formatter.js'
import type { GristClient } from '../services/grist-client.js'
import type { ApplyResponse } from '../types.js'

// ============================================================================
// 1. GRIST_CREATE_TABLE
// ============================================================================

export const CreateTableSchema = z
  .object({
    docId: DocIdSchema,
    tableName: z
      .string()
      .min(1)
      .max(100)
      .describe(
        'Name for the new table. Use alphanumeric characters and underscores. Example: "Contacts", "Sales_Data", "Project_Tasks"'
      ),
    columns: z
      .array(ColumnDefinitionSchema)
      .min(0)
      .max(100)
      .describe(
        'Array of column definitions to create with the table. Can be empty to create table with default columns only'
      ),
    response_format: ResponseFormatSchema
  })
  .strict()

export type CreateTableInput = z.infer<typeof CreateTableSchema>

export async function createTable(client: GristClient, params: CreateTableInput) {
  try {
    // Build AddTable action
    const action = buildAddTableAction(params.tableName, params.columns)

    // Execute via /apply endpoint (expects array of actions directly)
    const response = await client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [action])

    // Extract created table ID from response
    const tableId = response.retValues[0]?.table_id || params.tableName

    const result = {
      success: true,
      document_id: params.docId,
      table_id: tableId,
      table_name: params.tableName,
      columns_created: params.columns.length,
      message: `Successfully created table "${params.tableName}" with ${params.columns.length} column(s)`,
      url: `${client.getBaseUrl()}/doc/${params.docId}/p/${tableId}`
    }

    return formatToolResponse(result, params.response_format)
  } catch (error) {
    return formatErrorResponse(error instanceof Error ? error.message : String(error))
  }
}

// ============================================================================
// 2. GRIST_RENAME_TABLE
// ============================================================================

export const RenameTableSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    newTableId: z
      .string()
      .min(1)
      .max(100)
      .describe(
        'New table identifier. Use alphanumeric characters and underscores. Example: "ContactsNew", "Sales_Data_2024"'
      ),
    response_format: ResponseFormatSchema
  })
  .strict()

export type RenameTableInput = z.infer<typeof RenameTableSchema>

export async function renameTable(client: GristClient, params: RenameTableInput) {
  try {
    // Validate that old and new names are different
    if (params.tableId === params.newTableId) {
      return formatErrorResponse(
        `New table ID "${params.newTableId}" is the same as the current table ID. ` +
          `Please provide a different name.`
      )
    }

    // Build RenameTable action
    const action = buildRenameTableAction(params.tableId, params.newTableId)

    // Execute via /apply endpoint (expects array of actions directly)
    await client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [action])

    const result = {
      success: true,
      document_id: params.docId,
      old_table_id: params.tableId,
      new_table_id: params.newTableId,
      message: `Successfully renamed table from "${params.tableId}" to "${params.newTableId}"`,
      url: `${client.getBaseUrl()}/doc/${params.docId}/p/${params.newTableId}`
    }

    return formatToolResponse(result, params.response_format)
  } catch (error) {
    return formatErrorResponse(error instanceof Error ? error.message : String(error))
  }
}

// ============================================================================
// 3. GRIST_DELETE_TABLE
// ============================================================================

export const DeleteTableSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    response_format: ResponseFormatSchema
  })
  .strict()

export type DeleteTableInput = z.infer<typeof DeleteTableSchema>

export async function deleteTable(client: GristClient, params: DeleteTableInput) {
  try {
    // Build RemoveTable action
    const action = buildRemoveTableAction(params.tableId)

    // Execute via /apply endpoint (expects array of actions directly)
    await client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [action])

    const result = {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      message: `Successfully deleted table "${params.tableId}"`,
      warning:
        'THIS OPERATION CANNOT BE UNDONE. All data in the table has been permanently deleted.',
      note: 'If this was a mistake, you may be able to restore from document history if available'
    }

    return formatToolResponse(result, params.response_format)
  } catch (error) {
    return formatErrorResponse(error instanceof Error ? error.message : String(error))
  }
}
