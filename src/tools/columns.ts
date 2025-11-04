/**
 * Column Management Tool (1 tool)
 *
 * Consolidated tool for complete column lifecycle management:
 * - grist_manage_columns: Add, modify, delete, and rename columns in one atomic operation
 *
 * This consolidation reduces tool bloat and enables atomic multi-column changes.
 */

import { z } from 'zod'
import { MAX_COLUMN_OPERATIONS } from '../constants.js'
import {
  ColumnTypeSchema,
  DocIdSchema,
  ResponseFormatSchema,
  TableIdSchema
} from '../schemas/common.js'
import {
  buildAddColumnAction,
  buildModifyColumnAction,
  buildRemoveColumnAction,
  buildRenameColumnAction
} from '../services/action-builder.js'
import { formatErrorResponse, formatToolResponse } from '../services/formatter.js'
import type { GristClient } from '../services/grist-client.js'
import type { ApplyResponse, UserAction } from '../types.js'

// ============================================================================
// Column Operation Schemas (Discriminated Union)
// ============================================================================

// Add column operation
const AddColumnOperationSchema = z
  .object({
    action: z.literal('add'),
    colId: z
      .string()
      .min(1)
      .describe(
        'Column identifier. Use alphanumeric and underscores. Example: "Email", "Phone_Number"'
      ),
    type: ColumnTypeSchema,
    label: z.string().optional().describe('Human-readable label. If omitted, uses colId'),
    formula: z
      .string()
      .optional()
      .describe('Formula code (Python) if this is a formula column. Example: "$Price * $Quantity"'),
    isFormula: z.boolean().optional().describe('Set to true if this is a formula column'),
    widgetOptions: z
      .any()
      .optional()
      .describe('Widget-specific options. Example: {"choices": ["Red", "Blue"]} for Choice columns')
  })
  .strict()

// Modify column operation
const ModifyColumnOperationSchema = z
  .object({
    action: z.literal('modify'),
    colId: z.string().min(1).describe('Existing column identifier to modify'),
    type: ColumnTypeSchema.optional(),
    label: z.string().optional(),
    formula: z.string().optional(),
    isFormula: z.boolean().optional(),
    widgetOptions: z.any().optional()
  })
  .strict()

// Delete column operation
const DeleteColumnOperationSchema = z
  .object({
    action: z.literal('delete'),
    colId: z.string().min(1).describe('Column identifier to delete')
  })
  .strict()

// Rename column operation
const RenameColumnOperationSchema = z
  .object({
    action: z.literal('rename'),
    oldColId: z.string().min(1).describe('Current column identifier'),
    newColId: z.string().min(1).describe('New column identifier')
  })
  .strict()

// Discriminated union of all column operations
const ColumnOperationSchema = z.discriminatedUnion('action', [
  AddColumnOperationSchema,
  ModifyColumnOperationSchema,
  DeleteColumnOperationSchema,
  RenameColumnOperationSchema
])

// ============================================================================
// GRIST_MANAGE_COLUMNS
// ============================================================================

export const ManageColumnsSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    operations: z
      .array(ColumnOperationSchema)
      .min(1)
      .max(MAX_COLUMN_OPERATIONS)
      .describe(
        `Array of column operations to perform atomically (max ${MAX_COLUMN_OPERATIONS}). Operations execute in order provided`
      ),
    response_format: ResponseFormatSchema
  })
  .strict()

export type ManageColumnsInput = z.infer<typeof ManageColumnsSchema>
export type ColumnOperation = z.infer<typeof ColumnOperationSchema>

// Helper functions for manageColumns

function buildModifyUpdates(op: ColumnOperation): any {
  if (op.action !== 'modify') return {}

  const modifyUpdates: any = {}
  if (op.type !== undefined) modifyUpdates.type = op.type
  if (op.label !== undefined) modifyUpdates.label = op.label
  if (op.formula !== undefined) modifyUpdates.formula = op.formula
  if (op.isFormula !== undefined) modifyUpdates.isFormula = op.isFormula
  if (op.widgetOptions !== undefined) modifyUpdates.widgetOptions = op.widgetOptions
  return modifyUpdates
}

function buildActionForOperation(op: ColumnOperation, tableId: string): UserAction {
  switch (op.action) {
    case 'add':
      return buildAddColumnAction(tableId, op.colId, {
        type: op.type,
        label: op.label,
        formula: op.formula,
        isFormula: op.isFormula,
        widgetOptions: op.widgetOptions
      })
    case 'modify':
      return buildModifyColumnAction(tableId, op.colId, buildModifyUpdates(op))
    case 'delete':
      return buildRemoveColumnAction(tableId, op.colId)
    case 'rename':
      return buildRenameColumnAction(tableId, op.oldColId, op.newColId)
  }
}

function formatOperationMessage(op: ColumnOperation): string {
  switch (op.action) {
    case 'add':
      return `Added column "${op.colId}" (${op.type})`
    case 'modify':
      return `Modified column "${op.colId}"`
    case 'delete':
      return `Deleted column "${op.colId}"`
    case 'rename':
      return `Renamed column "${op.oldColId}" to "${op.newColId}"`
  }
}

function calculateOperationSummary(operations: ColumnOperation[]) {
  return {
    added: operations.filter((op) => op.action === 'add').length,
    modified: operations.filter((op) => op.action === 'modify').length,
    deleted: operations.filter((op) => op.action === 'delete').length,
    renamed: operations.filter((op) => op.action === 'rename').length
  }
}

export async function manageColumns(client: GristClient, params: ManageColumnsInput) {
  try {
    // Build array of UserActions from operations
    const actions: UserAction[] = params.operations.map((op) =>
      buildActionForOperation(op, params.tableId)
    )

    // Execute all actions atomically via /apply endpoint
    await client.post<ApplyResponse>(`/docs/${params.docId}/apply`, actions)

    // Build success response
    const result = {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      operations_completed: params.operations.length,
      summary: calculateOperationSummary(params.operations),
      message: `Successfully completed ${params.operations.length} column operation(s) on ${params.tableId}`,
      details: params.operations.map(formatOperationMessage),
      note: 'All operations were executed atomically. If any operation failed, all changes were rolled back.'
    }

    return formatToolResponse(result, params.response_format)
  } catch (error) {
    return formatErrorResponse(error instanceof Error ? error.message : String(error))
  }
}
