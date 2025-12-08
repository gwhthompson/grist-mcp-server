import { z } from 'zod'
import { MAX_COLUMN_OPERATIONS } from '../constants.js'
import { type ToolContext, type ToolDefinition, WRITE_SAFE_ANNOTATIONS } from '../registry/types.js'
import { ApplyResponseSchema } from '../schemas/api-responses.js'
import {
  ColumnTypeSchema,
  DocIdSchema,
  ResponseFormatSchema,
  TableIdSchema
} from '../schemas/common.js'
import { ManageColumnsOutputSchema } from '../schemas/output-schemas.js'
import { WidgetOptionsUnionSchema } from '../schemas/widget-options.js'
import {
  buildAddColumnAction,
  buildModifyColumnAction,
  buildRemoveColumnAction,
  buildRenameColumnAction
} from '../services/action-builder.js'
import {
  extractForeignTable,
  getColumnRef,
  isReferenceType,
  resolveVisibleCol
} from '../services/column-resolver.js'
import { serializeUserActions } from '../services/grist-client.js'
import {
  VisibleColService,
  type VisibleColSetupParams
} from '../services/visiblecol-service.js'
import { toColId, toDocId, toTableId } from '../types/advanced.js'
import type { ApplyResponse, UserActionObject } from '../types.js'
import { validateRetValues } from '../validators/apply-response.js'
import { GristTool } from './base/GristTool.js'

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
    isFormula: z
      .boolean()
      .default(false)
      .describe('Set to true if this is a formula column. Defaults to false (data column)'),
    widgetOptions: WidgetOptionsUnionSchema.optional().describe(
      'Widget options object validated by column type. Examples: ' +
        '{"numMode": "currency", "currency": "USD"} for Numeric, ' +
        '{"choices": ["Red", "Blue"]} for Choice, ' +
        '{"dateFormat": "YYYY-MM-DD"} for Date. ' +
        'Must match the column type - validation enforced.'
    ),
    visibleCol: z
      .union([z.string(), z.number()])
      .optional()
      .describe(
        'Which column from referenced table to display (Ref/RefList only). ' +
          'String column name (e.g., "Email") auto-resolves to numeric ID. ' +
          'Numeric ID (e.g., 456) used directly.'
      )
  })
  .strict()

const ModifyColumnOperationSchema = z
  .object({
    action: z.literal('modify'),
    colId: z.string().min(1).describe('Existing column identifier to modify'),
    type: ColumnTypeSchema.optional(),
    label: z.string().optional(),
    formula: z.string().optional(),
    isFormula: z
      .boolean()
      .default(false)
      .describe('Set to true if this is a formula column. Defaults to false (data column)'),
    widgetOptions: WidgetOptionsUnionSchema.optional().describe(
      'Widget options object validated by column type. ' +
        'IMPORTANT: When updating widgetOptions, you MUST also include the "type" field ' +
        'to enable proper validation. Example: {action: "modify", colId: "Price", ' +
        'type: "Numeric", widgetOptions: {"numMode": "currency", "currency": "USD"}}'
    ),
    visibleCol: z
      .union([z.string(), z.number()])
      .optional()
      .describe(
        'Which column from referenced table to display (Ref/RefList only). ' +
          'String column name (e.g., "Email") auto-resolves to numeric ID. ' +
          'Numeric ID (e.g., 456) used directly.'
      )
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

interface ManageColumnsResponseData {
  document_id: string
  table_id: string
  operations_performed: number
  actions: string[]
}

export class ManageColumnsTool extends GristTool<
  typeof ManageColumnsSchema,
  ManageColumnsResponseData
> {
  constructor(context: ToolContext) {
    super(context, ManageColumnsSchema)
  }

  protected async executeInternal(params: ManageColumnsInput) {
    // Resolve any string visibleCol values to numeric IDs
    const resolvedOperations = await Promise.all(
      params.operations.map((op) => this.resolveVisibleColInOperation(params.docId, op))
    )

    // Enrich modify operations with column type if widgetOptions present but type missing
    const enrichedOperations = await Promise.all(
      resolvedOperations.map((op) => this.enrichModifyOperation(params.docId, params.tableId, op))
    )

    // Batch execute operations (single API call for all actions)
    const actions = enrichedOperations.map((op) => this.buildActionForOperation(op, params.tableId))

    const response = await this.client.post<ApplyResponse>(
      `/docs/${params.docId}/apply`,
      serializeUserActions(actions),
      {
        schema: ApplyResponseSchema,
        context: `Applying ${actions.length} column operation(s) to ${params.tableId}`
      }
    )

    validateRetValues(response, {
      expectedCount: actions.length,
      context: `${actions.length} column operation(s) on ${params.tableId}`
    })

    // Handle visibleCol post-processing using VisibleColService
    // Based on Grist Core issue #970, we need UpdateRecord + SetDisplayFormula
    const visibleColParams: VisibleColSetupParams[] = []

    for (let i = 0; i < enrichedOperations.length; i++) {
      // Safe: loop bound guarantees enrichedOperations[i] exists
      const op = enrichedOperations[i] as ColumnOperation
      if ((op.action === 'add' || op.action === 'modify') && 'visibleCol' in op && op.visibleCol) {
        // Get colRef based on operation type
        let colRef: number
        if (op.action === 'add') {
          // Safe: loop bound guarantees response.retValues[i] exists
          const retValue = response.retValues[i] as unknown
          if (typeof retValue === 'object' && retValue !== null && 'colRef' in retValue) {
            colRef = (retValue as { colRef: number }).colRef
          } else {
            // Skip if we can't get colRef from response
            continue
          }
        } else {
          // For modify, query for the colRef
          colRef = await getColumnRef(this.client, params.docId, params.tableId, op.colId)
        }

        visibleColParams.push({
          docId: params.docId,
          tableId: params.tableId,
          colId: op.colId,
          colRef,
          visibleCol: op.visibleCol as number,
          columnType: op.type as string
        })
      }
    }

    // Execute visibleCol setup in batch
    if (visibleColParams.length > 0) {
      const visibleColService = new VisibleColService(this.client)
      await visibleColService.setupBatch(visibleColParams)
    }

    // Invalidate schema cache after successful column operations
    // This ensures fresh schema is fetched on next record validation
    this.schemaCache.invalidateCache(toDocId(params.docId), toTableId(params.tableId))

    // Check if any operations set widgetOptions
    const hasWidgetOptions = params.operations.some(
      (op) => (op.action === 'add' || op.action === 'modify') && 'widgetOptions' in op
    )

    // Build success response
    return {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      operations_performed: params.operations.length,
      actions: enrichedOperations.map((op) => {
        if (op.action === 'rename') {
          return `${op.action}: ${op.oldColId} -> ${op.newColId}`
        }
        return `${op.action}: ${op.colId}`
      }),
      summary: this.calculateOperationSummary(params.operations),
      message: `Successfully completed ${params.operations.length} column operation(s) on ${params.tableId}`,
      details: params.operations.map(this.formatOperationMessage),
      ...(hasWidgetOptions
        ? {
            hint: `To verify widgetOptions were set correctly, use: grist_get_tables({docId: "${params.docId}", tableId: "${params.tableId}", detail_level: "full_schema"})`
          }
        : {})
    }
  }

  private async enrichModifyOperation(
    docId: string,
    tableId: string,
    op: ColumnOperation
  ): Promise<ColumnOperation> {
    // Only enrich modify operations
    if (op.action !== 'modify') {
      return op
    }

    // Check if widgetOptions is present but type is not
    if (op.widgetOptions !== undefined && !op.type) {
      // Fetch the column metadata from Grist to get the type
      const columns = await this.client.get<{
        columns: Array<{ id: string; fields: { type: string } }>
      }>(`/docs/${docId}/tables/${tableId}/columns`)

      const column = columns.columns.find((col) => col.id === op.colId)
      if (!column) {
        throw new Error(
          `Cannot fetch type for column "${op.colId}" in table "${tableId}". ` +
            `Column not found. When updating widgetOptions, either provide the type explicitly ` +
            `or ensure the column exists.`
        )
      }

      // Add the fetched type to the operation
      return {
        ...op,
        type: column.fields.type
      }
    }

    return op
  }

  // Resolve string visibleCol to numeric column ID
  private async resolveVisibleColInOperation(
    docId: string,
    op: ColumnOperation
  ): Promise<ColumnOperation> {
    if (op.action !== 'add' && op.action !== 'modify') {
      return op
    }

    // visibleCol should be at top-level only
    const visibleCol: string | number | undefined = op.visibleCol

    // If no visibleCol, return operation unchanged
    if (visibleCol === undefined) {
      return op
    }

    // Validate column type is provided when using visibleCol
    const columnType = op.type
    if (!columnType) {
      throw new Error(
        `Column "${op.colId}" has visibleCol but no type specified. ` +
          `When setting visibleCol, you must also provide the column type (e.g., "Ref:People")`
      )
    }

    // Validate column type is a reference type
    if (!isReferenceType(columnType)) {
      throw new Error(
        `Column "${op.colId}" has visibleCol but type "${columnType}" is not a Ref or RefList type`
      )
    }

    // Resolve string column names to numeric IDs
    let resolvedVisibleCol: number
    if (typeof visibleCol === 'number') {
      resolvedVisibleCol = visibleCol
    } else if (typeof visibleCol === 'string') {
      const foreignTable = extractForeignTable(columnType)
      if (!foreignTable) {
        throw new Error(
          `Failed to extract foreign table name from column type "${columnType}". ` +
            `visibleCol can only be used with Reference columns. ` +
            `Expected column type format: "Ref:TableName" or "RefList:TableName" (e.g., "Ref:Customers" or "RefList:Orders"). ` +
            `Current type "${columnType}" is not a valid reference format. ` +
            `Next steps: Use grist_get_tables to verify the column type. ` +
            `If this is not meant to be a reference column, remove visibleCol from the column definition. ` +
            `If it should be a reference, correct the type to "Ref:ForeignTableName".`
        )
      }
      resolvedVisibleCol = await resolveVisibleCol(this.client, docId, foreignTable, visibleCol)
    } else {
      throw new Error(`visibleCol must be a string (column name) or number (column ID)`)
    }

    // Return operation with resolved numeric visibleCol
    return {
      ...op,
      visibleCol: resolvedVisibleCol
    }
  }

  private buildActionForOperation(op: ColumnOperation, tableId: string): UserActionObject {
    switch (op.action) {
      case 'add':
        return buildAddColumnAction(toTableId(tableId), toColId(op.colId), {
          type: op.type,
          label: op.label,
          formula: op.formula,
          isFormula: op.isFormula,
          widgetOptions: op.widgetOptions,
          ...('visibleCol' in op && op.visibleCol !== undefined
            ? { visibleCol: op.visibleCol }
            : {})
        })
      case 'modify':
        return buildModifyColumnAction(
          toTableId(tableId),
          toColId(op.colId),
          this.buildModifyUpdates(op)
        )
      case 'delete':
        return buildRemoveColumnAction(toTableId(tableId), toColId(op.colId))
      case 'rename':
        return buildRenameColumnAction(
          toTableId(tableId),
          toColId(op.oldColId),
          toColId(op.newColId)
        )
    }
  }

  private buildModifyUpdates(
    op: ColumnOperation
  ): Record<string, string | number | boolean | object | undefined> {
    if (op.action !== 'modify') return {}

    const modifyUpdates: Record<string, string | number | boolean | object | undefined> = {}
    if (op.type !== undefined) modifyUpdates.type = op.type
    if (op.label !== undefined) modifyUpdates.label = op.label
    if (op.formula !== undefined) modifyUpdates.formula = op.formula
    if (op.isFormula !== undefined) modifyUpdates.isFormula = op.isFormula
    if (op.widgetOptions !== undefined) modifyUpdates.widgetOptions = op.widgetOptions
    if ('visibleCol' in op && op.visibleCol !== undefined) modifyUpdates.visibleCol = op.visibleCol
    return modifyUpdates
  }

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

  private calculateOperationSummary(operations: ColumnOperation[]) {
    return {
      added: operations.filter((op) => op.action === 'add').length,
      modified: operations.filter((op) => op.action === 'modify').length,
      deleted: operations.filter((op) => op.action === 'delete').length,
      renamed: operations.filter((op) => op.action === 'rename').length
    }
  }
}

export async function manageColumns(context: ToolContext, params: ManageColumnsInput) {
  const tool = new ManageColumnsTool(context)
  return tool.execute(params)
}

export const COLUMN_TOOLS: ReadonlyArray<ToolDefinition> = [
  {
    name: 'grist_manage_columns',
    title: 'Manage Grist Columns',
    description: `Add, modify, delete, or rename columns (atomic, rollback on error).
Actions: add (colId,type), modify (colId,changes), delete, rename
Params: docId, tableId, operations (array)
Ex: {operations:[{action:"add",colId:"Phone",type:"Text"}]}`,
    purpose: 'Add, modify, delete, rename columns',
    category: 'columns',
    inputSchema: ManageColumnsSchema,
    outputSchema: ManageColumnsOutputSchema,
    annotations: WRITE_SAFE_ANNOTATIONS,
    handler: manageColumns,
    docs: {
      overview:
        'Add, modify, delete, or rename columns. Operations execute atomically. Actions: add (colId, type, label?, formula?, widgetOptions?), modify (colId, changes), delete (colId), rename (oldColId, newColId). Note: visibleCol is top-level, NOT in widgetOptions.',
      examples: [
        {
          desc: 'Add column',
          input: {
            docId: 'abc123',
            tableId: 'Contacts',
            operations: [{ action: 'add', colId: 'Phone', type: 'Text' }]
          }
        },
        {
          desc: 'Multiple operations',
          input: {
            docId: 'abc123',
            tableId: 'Tasks',
            operations: [
              {
                action: 'add',
                colId: 'Priority',
                type: 'Choice',
                widgetOptions: { choices: ['High', 'Medium', 'Low'] }
              },
              {
                action: 'modify',
                colId: 'Status',
                type: 'Choice',
                widgetOptions: { choices: ['Active', 'Inactive'] }
              },
              { action: 'rename', oldColId: 'Email', newColId: 'EmailAddress' },
              { action: 'delete', colId: 'OldColumn' }
            ]
          }
        },
        {
          desc: 'Reference with visibleCol',
          input: {
            docId: 'abc123',
            tableId: 'Tasks',
            operations: [
              { action: 'add', colId: 'Manager', type: 'Ref:People', visibleCol: 'Email' }
            ]
          }
        }
      ],
      errors: [
        { error: 'Column not found', solution: 'Use grist_get_tables' },
        { error: 'Column already exists', solution: "Use action='modify'" },
        { error: 'All operations rolled back', solution: 'Fix failed operation and retry all' }
      ]
    }
  }
] as const
