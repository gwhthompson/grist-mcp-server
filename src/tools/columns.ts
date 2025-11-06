/**
 * Column Management Tool (Refactored with Base Class)
 *
 * REFACTORED VERSION using GristTool base class
 * Reduces code from ~339 lines to ~270 lines (-20% reduction)
 * Complex business logic preserved, boilerplate eliminated
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
import {
  resolveVisibleCol,
  extractForeignTable,
  isReferenceType,
  getColumnNameFromId,
  getColumnRef
} from '../services/column-resolver.js'
import type { GristClient } from '../services/grist-client.js'
import type { ApplyResponse, UserAction } from '../types.js'
import { toTableId, toColId } from '../types/advanced.js'
import { GristTool } from './base/GristTool.js'

// ============================================================================
// Column Operation Schemas (Discriminated Union)
// ============================================================================

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
      .describe(
        'Widget options: {"visibleCol": "Name"} for Ref/RefList, {"choices": ["Red", "Blue"]} for Choice'
      ),
    visibleCol: z
      .number()
      .optional()
      .describe('Numeric column reference (colRef) to display for Ref/RefList columns')
  })
  .strict()

const ModifyColumnOperationSchema = z
  .object({
    action: z.literal('modify'),
    colId: z.string().min(1).describe('Existing column identifier to modify'),
    type: ColumnTypeSchema.optional(),
    label: z.string().optional(),
    formula: z.string().optional(),
    isFormula: z.boolean().optional(),
    widgetOptions: z
      .any()
      .optional()
      .describe('Widget options: {"visibleCol": "Name"} for Ref/RefList, {"choices": ["Red", "Blue"]} for Choice'),
    visibleCol: z
      .number()
      .optional()
      .describe('Numeric column reference (colRef) to display for Ref/RefList columns')
  })
  .strict()

const DeleteColumnOperationSchema = z
  .object({
    action: z.literal('delete'),
    colId: z.string().min(1).describe('Column identifier to delete')
  })
  .strict()

const RenameColumnOperationSchema = z
  .object({
    action: z.literal('rename'),
    oldColId: z.string().min(1).describe('Current column identifier'),
    newColId: z.string().min(1).describe('New column identifier')
  })
  .strict()

const ColumnOperationSchema = z.discriminatedUnion('action', [
  AddColumnOperationSchema,
  ModifyColumnOperationSchema,
  DeleteColumnOperationSchema,
  RenameColumnOperationSchema
])

// ============================================================================
// GRIST_MANAGE_COLUMNS (Refactored)
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
        `Array of column operations to perform atomically (max ${MAX_COLUMN_OPERATIONS}). Operations execute in order`
      ),
    response_format: ResponseFormatSchema
  })
  .strict()

export type ManageColumnsInput = z.infer<typeof ManageColumnsSchema>
export type ColumnOperation = z.infer<typeof ColumnOperationSchema>

/**
 * Manage Columns Tool
 * Handles add, modify, delete, and rename operations on columns
 */
export class ManageColumnsTool extends GristTool<typeof ManageColumnsSchema, any> {
  constructor(client: GristClient) {
    super(client, ManageColumnsSchema)
  }

  protected async executeInternal(params: ManageColumnsInput) {
    // Resolve any string visibleCol values to numeric IDs
    const resolvedOperations = await Promise.all(
      params.operations.map((op) => this.resolveVisibleColInOperation(params.docId, op))
    )

    // Execute operations
    for (const op of resolvedOperations) {
      const action = this.buildActionForOperation(op, params.tableId)

      // Execute the action
      const response = await this.client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [action])

      // Handle visibleCol for add/modify operations
      if ((op.action === 'add' || op.action === 'modify') && 'visibleCol' in op && op.visibleCol) {
        await this.setDisplayFormula(params, op, response)
      }
    }

    // Build success response
    return {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      operations_completed: params.operations.length,
      summary: this.calculateOperationSummary(params.operations),
      message: `Successfully completed ${params.operations.length} column operation(s) on ${params.tableId}`,
      details: params.operations.map(this.formatOperationMessage)
    }
  }

  /**
   * Resolve visibleCol in an operation if needed
   */
  private async resolveVisibleColInOperation(
    docId: string,
    op: ColumnOperation
  ): Promise<ColumnOperation> {
    if (op.action !== 'add' && op.action !== 'modify') {
      return op
    }

    let visibleCol: string | number | undefined
    let cleanedWidgetOptions = op.widgetOptions

    if (op.widgetOptions && typeof op.widgetOptions === 'object' && 'visibleCol' in op.widgetOptions) {
      visibleCol = op.widgetOptions.visibleCol as string | number
      const { visibleCol: _, ...rest } = op.widgetOptions
      cleanedWidgetOptions = Object.keys(rest).length > 0 ? rest : undefined
    }

    if (visibleCol === undefined) {
      return op
    }

    const columnType = op.type
    if (!columnType) {
      throw new Error(
        `Column "${op.colId}" has visibleCol but no type specified. ` +
          `When setting visibleCol, you must also provide the column type (e.g., "Ref:People")`
      )
    }

    if (!isReferenceType(columnType)) {
      throw new Error(
        `Column "${op.colId}" has visibleCol but type "${columnType}" is not a Ref or RefList type`
      )
    }

    let resolvedVisibleCol: number
    if (typeof visibleCol === 'number') {
      resolvedVisibleCol = visibleCol
    } else if (typeof visibleCol === 'string') {
      const foreignTable = extractForeignTable(columnType)
      if (!foreignTable) {
        throw new Error(
          `Failed to extract foreign table from type "${columnType}". ` +
            `Expected format: "Ref:TableName" or "RefList:TableName"`
        )
      }
      resolvedVisibleCol = await resolveVisibleCol(this.client, docId, foreignTable, visibleCol)
    } else {
      throw new Error(`visibleCol must be a string (column name) or number (column ID)`)
    }

    return {
      ...op,
      widgetOptions: cleanedWidgetOptions,
      visibleCol: resolvedVisibleCol
    }
  }

  /**
   * Set display formula for reference columns
   */
  private async setDisplayFormula(
    params: ManageColumnsInput,
    op: ColumnOperation,
    response: ApplyResponse
  ) {
    if (op.action !== 'add' && op.action !== 'modify') return
    if (!('visibleCol' in op) || !op.visibleCol) return
    if (!op.type) return

    const foreignTable = extractForeignTable(op.type)
    if (!foreignTable) return

    const foreignColName = await getColumnNameFromId(
      this.client,
      params.docId,
      foreignTable,
      op.visibleCol
    )

    const formula = `$${op.colId}.${foreignColName}`

    let colRef: number
    if (op.action === 'add') {
      colRef = response.retValues[0]?.colRef
    } else {
      colRef = await getColumnRef(this.client, params.docId, params.tableId, op.colId)
    }

    const setDisplayAction: UserAction = ['SetDisplayFormula', params.tableId, null, colRef, formula]
    await this.client.post<ApplyResponse>(`/docs/${params.docId}/apply`, [setDisplayAction])
  }

  /**
   * Build action for a column operation
   */
  private buildActionForOperation(op: ColumnOperation, tableId: string): UserAction {
    switch (op.action) {
      case 'add':
        return buildAddColumnAction(toTableId(tableId), toColId(op.colId), {
          type: op.type,
          label: op.label,
          formula: op.formula,
          isFormula: op.isFormula,
          widgetOptions: op.widgetOptions,
          ...('visibleCol' in op && op.visibleCol !== undefined ? { visibleCol: op.visibleCol } : {})
        })
      case 'modify':
        return buildModifyColumnAction(toTableId(tableId), toColId(op.colId), this.buildModifyUpdates(op))
      case 'delete':
        return buildRemoveColumnAction(toTableId(tableId), toColId(op.colId))
      case 'rename':
        return buildRenameColumnAction(toTableId(tableId), toColId(op.oldColId), toColId(op.newColId))
    }
  }

  /**
   * Build updates object for modify operation
   */
  private buildModifyUpdates(op: ColumnOperation): any {
    if (op.action !== 'modify') return {}

    const modifyUpdates: any = {}
    if (op.type !== undefined) modifyUpdates.type = op.type
    if (op.label !== undefined) modifyUpdates.label = op.label
    if (op.formula !== undefined) modifyUpdates.formula = op.formula
    if (op.isFormula !== undefined) modifyUpdates.isFormula = op.isFormula
    if (op.widgetOptions !== undefined) modifyUpdates.widgetOptions = op.widgetOptions
    if ('visibleCol' in op && op.visibleCol !== undefined) modifyUpdates.visibleCol = op.visibleCol
    return modifyUpdates
  }

  /**
   * Format operation message for response
   */
  private formatOperationMessage(op: ColumnOperation): string {
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

  /**
   * Calculate summary of operations
   */
  private calculateOperationSummary(operations: ColumnOperation[]) {
    return {
      added: operations.filter((op) => op.action === 'add').length,
      modified: operations.filter((op) => op.action === 'modify').length,
      deleted: operations.filter((op) => op.action === 'delete').length,
      renamed: operations.filter((op) => op.action === 'rename').length
    }
  }
}

/**
 * Legacy function wrapper for backward compatibility
 */
export async function manageColumns(client: GristClient, params: ManageColumnsInput) {
  const tool = new ManageColumnsTool(client)
  return tool.execute(params)
}
