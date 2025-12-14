import { z } from 'zod'
import { MAX_COLUMN_OPERATIONS } from '../constants.js'
import { type ToolContext, type ToolDefinition, WRITE_SAFE_ANNOTATIONS } from '../registry/types.js'
import { ApplyResponseSchema } from '../schemas/api-responses.js'
import {
  buildGristType,
  ChoiceOptionsSchema,
  ColumnStyleSchema,
  ColumnTypeLiteralSchema,
  CurrencyCodeInputSchema,
  extractRulesOptions,
  extractWidgetOptions,
  NumModeSchema,
  parseGristType,
  RefTableSchema,
  WidgetTypeSchema
} from '../schemas/column-types.js'
import { ColIdSchema, DocIdSchema, ResponseFormatSchema, TableIdSchema } from '../schemas/common.js'
import { ManageColumnsOutputSchema } from '../schemas/output-schemas.js'
// Note: WidgetOptionsUnionSchema no longer used - flat column options are extracted via extractWidgetOptions
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
import { ConditionalFormattingService } from '../services/conditional-formatting/service.js'
import { serializeUserActions } from '../services/grist-client.js'
import { VisibleColService, type VisibleColSetupParams } from '../services/visiblecol-service.js'
import { toColId, toDocId, toTableId } from '../types/advanced.js'
import type { ApplyResponse, UserActionObject } from '../types.js'
import { validateRetValues } from '../validators/apply-response.js'
import { GristTool } from './base/GristTool.js'

// =============================================================================
// Column Operation Schemas - explicitly defined for clear JSON Schema $defs
// =============================================================================

/**
 * Add operation: colId and type are required, all other properties optional.
 * Explicitly defined (not using .extend()) so registered schemas produce named $refs.
 */
const AddColumnOperationSchema = z
  .object({
    action: z.literal('add'),
    // Core properties
    colId: ColIdSchema,
    type: ColumnTypeLiteralSchema.describe('Column type (required for add)'),
    label: z.string().optional().describe('Human-readable label'),
    isFormula: z.boolean().default(false).describe('Formula column flag'),
    formula: z.string().optional().describe('Python formula (e.g., "$Price * $Quantity")'),
    // Text/Bool/Numeric widget options
    widget: WidgetTypeSchema.optional(),
    wrap: z.boolean().optional().describe('Text only: enable text wrapping'),
    // Numeric/Int options
    numMode: NumModeSchema.optional(),
    currency: CurrencyCodeInputSchema.optional().describe(
      'Numeric/Int only: currency code (requires numMode:"currency")'
    ),
    numSign: z
      .enum(['parens'])
      .nullable()
      .optional()
      .describe('Numeric/Int only: parentheses for negatives'),
    decimals: z
      .number()
      .int()
      .min(0)
      .max(20)
      .optional()
      .describe('Numeric/Int only: min decimal places'),
    maxDecimals: z
      .number()
      .int()
      .min(0)
      .max(20)
      .optional()
      .describe('Numeric/Int only: max decimal places'),
    // Date/DateTime options
    dateFormat: z
      .string()
      .max(100)
      .optional()
      .describe('Date/DateTime only: format (e.g., "YYYY-MM-DD")'),
    isCustomDateFormat: z
      .boolean()
      .optional()
      .describe('Date/DateTime only: custom date format flag'),
    timeFormat: z.string().max(100).optional().describe('DateTime only: format (e.g., "HH:mm:ss")'),
    isCustomTimeFormat: z.boolean().optional().describe('DateTime only: custom time format flag'),
    // Choice/ChoiceList options
    choices: z
      .array(z.string().min(1).max(255))
      .max(1000)
      .optional()
      .describe('Choice/ChoiceList only: available choices'),
    choiceOptions: ChoiceOptionsSchema,
    // Ref/RefList options
    refTable: RefTableSchema.optional(),
    visibleCol: z
      .union([z.string(), z.number()])
      .optional()
      .describe('Ref/RefList only: display column'),
    // Attachments options
    height: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .optional()
      .describe('Attachments only: display height in pixels'),
    // Universal styling
    style: ColumnStyleSchema.optional()
  })
  .describe('Add a new column with type-specific options')

/**
 * Update operation: colId required, everything else optional.
 * Explicitly defined (not using .partial()) so registered schemas produce named $refs.
 */
const UpdateColumnOperationSchema = z
  .object({
    action: z.literal('update'),
    // Core properties (colId required, type optional)
    colId: ColIdSchema,
    type: ColumnTypeLiteralSchema.optional().describe(
      'Optional. Provide when changing type-specific options'
    ),
    label: z.string().optional().describe('Human-readable label'),
    isFormula: z.boolean().optional().describe('Formula column flag'),
    formula: z.string().optional().describe('Python formula (e.g., "$Price * $Quantity")'),
    untieColIdFromLabel: z
      .boolean()
      .optional()
      .describe("If true, colId won't auto-update when label changes"),
    // Text/Bool/Numeric widget options
    widget: WidgetTypeSchema.optional(),
    wrap: z.boolean().optional().describe('Text only: enable text wrapping'),
    // Numeric/Int options
    numMode: NumModeSchema.optional(),
    currency: CurrencyCodeInputSchema.optional().describe(
      'Numeric/Int only: currency code (requires numMode:"currency")'
    ),
    numSign: z
      .enum(['parens'])
      .nullable()
      .optional()
      .describe('Numeric/Int only: parentheses for negatives'),
    decimals: z
      .number()
      .int()
      .min(0)
      .max(20)
      .optional()
      .describe('Numeric/Int only: min decimal places'),
    maxDecimals: z
      .number()
      .int()
      .min(0)
      .max(20)
      .optional()
      .describe('Numeric/Int only: max decimal places'),
    // Date/DateTime options
    dateFormat: z
      .string()
      .max(100)
      .optional()
      .describe('Date/DateTime only: format (e.g., "YYYY-MM-DD")'),
    isCustomDateFormat: z
      .boolean()
      .optional()
      .describe('Date/DateTime only: custom date format flag'),
    timeFormat: z.string().max(100).optional().describe('DateTime only: format (e.g., "HH:mm:ss")'),
    isCustomTimeFormat: z.boolean().optional().describe('DateTime only: custom time format flag'),
    // Choice/ChoiceList options
    choices: z
      .array(z.string().min(1).max(255))
      .max(1000)
      .optional()
      .describe('Choice/ChoiceList only: available choices'),
    choiceOptions: ChoiceOptionsSchema,
    // Ref/RefList options
    refTable: RefTableSchema.optional(),
    visibleCol: z
      .union([z.string(), z.number()])
      .optional()
      .describe('Ref/RefList only: display column'),
    // Attachments options
    height: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .optional()
      .describe('Attachments only: display height in pixels'),
    // Universal styling
    style: ColumnStyleSchema.optional()
  })
  .describe('Update an existing column (fails if not found)')

// Delete: removes column
const DeleteColumnOperationSchema = z.strictObject({
  action: z.literal('delete'),
  colId: z.string().min(1).describe('Column identifier to delete')
})

// Rename: changes column identifier
const RenameColumnOperationSchema = z.strictObject({
  action: z.literal('rename'),
  colId: z.string().min(1).describe('Current column identifier'),
  newColId: z.string().min(1).describe('New column identifier')
})

/**
 * Column operation discriminated union on 'action' field.
 * Now uses single-level discrimination instead of nested anyOf[oneOf[...], ...]
 */
const ColumnOperationSchema = z.discriminatedUnion('action', [
  AddColumnOperationSchema,
  UpdateColumnOperationSchema,
  DeleteColumnOperationSchema,
  RenameColumnOperationSchema
])

export const ManageColumnsSchema = z.strictObject({
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

export type ManageColumnsInput = z.infer<typeof ManageColumnsSchema>
export type ColumnOperation = z.infer<typeof ColumnOperationSchema>

interface ManageColumnsResponseData {
  docId: string
  tableId: string
  operationsPerformed: number
  actions: string[]
  colId_changes?: ColIdChangeInfo[]
  warning?: string
}

interface ColIdChangeInfo {
  originalColId: string
  newColId: string
  operation: 'update'
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

    // Enrich update operations with column type if type-specific options present but type missing
    const enrichedOperations = await Promise.all(
      resolvedOperations.map((op) => this.enrichUpdateOperation(params.docId, params.tableId, op))
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
      if ((op.action === 'add' || op.action === 'update') && 'visibleCol' in op && op.visibleCol) {
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
          // For update, query for the colRef
          colRef = await getColumnRef(this.client, params.docId, params.tableId, op.colId)
        }

        visibleColParams.push({
          docId: params.docId,
          tableId: params.tableId,
          colId: op.colId,
          colRef,
          visibleCol: op.visibleCol as number,
          // Convert split format {type: 'RefList', refTable: 'People'} to Grist format 'RefList:People'
          columnType: buildGristType(op as { type: string; refTable?: string })
        })
      }
    }

    // Execute visibleCol setup in batch
    if (visibleColParams.length > 0) {
      const visibleColService = new VisibleColService(this.client)
      await visibleColService.setupBatch(visibleColParams)
    }

    // Process conditional formatting rules (rulesOptions with formula+style pairs)
    // This uses the 3-step process: AddEmptyRule → ModifyColumn → UpdateRecord
    const rulesProcessed: Array<{ colId: string; rulesAdded: number }> = []
    for (const op of enrichedOperations) {
      if (op.action !== 'add' && op.action !== 'update') continue

      const rules = extractRulesOptions(op as Record<string, unknown>)
      if (!rules || rules.length === 0) continue

      // Create service for column-scope rules
      const cfService = new ConditionalFormattingService(this.client, 'column')

      // Add each rule using the 3-step atomic process
      for (const rule of rules) {
        await cfService.addRule(
          params.docId,
          params.tableId,
          { tableId: params.tableId, colId: op.colId },
          rule
        )
      }

      rulesProcessed.push({ colId: op.colId, rulesAdded: rules.length })
    }

    // Invalidate schema cache after successful column operations
    // This ensures fresh schema is fetched on next record validation
    this.schemaCache.invalidateCache(toDocId(params.docId), toTableId(params.tableId))

    // Detect colId changes for update operations that changed label
    // When label is changed without untieColIdFromLabel: true, Grist auto-updates colId
    const colIdChanges = await this.detectColIdChanges(
      params.docId,
      params.tableId,
      enrichedOperations
    )

    // Check if any operations set type-specific options (would generate widgetOptions)
    const hasTypeSpecificOptions = params.operations.some(
      (op) =>
        (op.action === 'add' || op.action === 'update') &&
        this.hasTypeSpecificOptions(op as Record<string, unknown>)
    )

    // Build success response
    const responseData: ManageColumnsResponseData & Record<string, unknown> = {
      success: true,
      docId: params.docId,
      tableId: params.tableId,
      operationsPerformed: params.operations.length,
      actions: enrichedOperations.map((op) => {
        if (op.action === 'rename') {
          return `${op.action}: ${op.colId} -> ${op.newColId}`
        }
        return `${op.action}: ${op.colId}`
      }),
      summary: this.calculateOperationSummary(params.operations),
      message: `Successfully completed ${params.operations.length} column operation(s) on ${params.tableId}`,
      details: params.operations.map(this.formatOperationMessage)
    }

    // Add hint for type-specific options verification
    if (hasTypeSpecificOptions) {
      responseData.hint = `To verify column options were set correctly, use: grist_get_tables({docId: "${params.docId}", tableId: "${params.tableId}", detail_level: "full_schema"})`
    }

    // Add colId change warnings if any occurred
    if (colIdChanges.length > 0) {
      responseData.colId_changes = colIdChanges
      const changesDesc = colIdChanges
        .map((c) => `"${c.originalColId}" → "${c.newColId}"`)
        .join(', ')
      responseData.warning =
        `Column ID(s) changed due to label modification: ${changesDesc}. ` +
        `Use untieColIdFromLabel: true to prevent this. ` +
        `Update any code referencing the old column ID(s).`
    }

    // Add conditional formatting info if any rules were processed
    if (rulesProcessed.length > 0) {
      responseData.conditional_formatting = {
        columns_with_rules: rulesProcessed,
        total_rules_added: rulesProcessed.reduce((sum, r) => sum + r.rulesAdded, 0)
      }
    }

    return responseData
  }

  private async enrichUpdateOperation(
    docId: string,
    tableId: string,
    op: ColumnOperation
  ): Promise<ColumnOperation> {
    // Only enrich update operations
    if (op.action !== 'update') {
      return op
    }

    // Check if type-specific options are present but type is not
    const hasOptions = this.hasTypeSpecificOptions(op)
    if (hasOptions && !op.type) {
      // Fetch the column metadata from Grist to get the type
      const columns = await this.client.get<{
        columns: Array<{ id: string; fields: { type: string } }>
      }>(`/docs/${docId}/tables/${tableId}/columns`)

      const column = columns.columns.find((col) => col.id === op.colId)
      if (!column) {
        throw new Error(
          `Cannot fetch type for column "${op.colId}" in table "${tableId}". ` +
            `Column not found. When updating type-specific options, either provide the type explicitly ` +
            `or ensure the column exists.`
        )
      }

      // Parse Grist type to split format and add to operation
      const parsed = parseGristType(column.fields.type)
      return {
        ...op,
        type: parsed.type,
        ...(parsed.refTable && { refTable: parsed.refTable })
      } as ColumnOperation
    }

    return op
  }

  // Check if operation has any type-specific options that would become widgetOptions
  private hasTypeSpecificOptions(op: Record<string, unknown>): boolean {
    const typeSpecificKeys = [
      'numMode',
      'currency',
      'decimals',
      'maxDecimals',
      'numSign',
      'widget',
      'wrap',
      'alignment',
      'dateFormat',
      'timeFormat',
      'isCustomDateFormat',
      'isCustomTimeFormat',
      'choices',
      'choiceOptions',
      'height',
      'textColor',
      'fillColor',
      'fontBold',
      'fontItalic',
      'fontUnderline',
      'fontStrikethrough',
      'headerTextColor',
      'headerFillColor',
      'headerFontBold',
      'headerFontItalic',
      'headerFontUnderline',
      'headerFontStrikethrough',
      'rulesOptions'
    ]
    return typeSpecificKeys.some((key) => op[key] !== undefined)
  }

  // Resolve string visibleCol to numeric column ID
  private async resolveVisibleColInOperation(
    docId: string,
    op: ColumnOperation
  ): Promise<ColumnOperation> {
    if (op.action !== 'add' && op.action !== 'update') {
      return op
    }

    // For add operations with discriminated union, visibleCol only exists on Ref/RefList
    // For update operations, visibleCol is available on all types (FlatColumnOptionsSchema)
    if (op.action === 'add') {
      // Only Ref/RefList add operations have visibleCol
      if (op.type !== 'Ref' && op.type !== 'RefList') {
        return op
      }
      // Now TypeScript knows op is Ref or RefList add operation
      if (!op.visibleCol) {
        return op
      }

      // Resolve string to numeric ID
      let resolvedVisibleCol: number
      if (typeof op.visibleCol === 'number') {
        resolvedVisibleCol = op.visibleCol
      } else {
        const foreignTable = op.refTable
        if (!foreignTable) {
          throw new Error(`Column "${op.colId}" has visibleCol but no refTable specified.`)
        }
        resolvedVisibleCol = await resolveVisibleCol(
          this.client,
          docId,
          foreignTable,
          op.visibleCol
        )
      }

      return { ...op, visibleCol: resolvedVisibleCol } as ColumnOperation
    }

    // For update operations (FlatColumnOptionsSchema has visibleCol on all types)
    const visibleCol = op.visibleCol
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

    // Validate column type is a reference type (supports both split and combined formats)
    const isSplitRefType = columnType === 'Ref' || columnType === 'RefList'
    if (!isSplitRefType && !isReferenceType(columnType)) {
      throw new Error(
        `Column "${op.colId}" has visibleCol but type "${columnType}" is not a Ref or RefList type`
      )
    }

    // Resolve string column names to numeric IDs
    let resolvedVisibleCol: number
    if (typeof visibleCol === 'number') {
      resolvedVisibleCol = visibleCol
    } else if (typeof visibleCol === 'string') {
      // Get foreign table from refTable field (new split format) or extract from combined type
      const opWithRefTable = op as { refTable?: string }
      const foreignTable = opWithRefTable.refTable || extractForeignTable(columnType)
      if (!foreignTable) {
        throw new Error(
          `Column "${op.colId}" has visibleCol but no refTable specified. ` +
            `For Ref/RefList columns, use refTable to specify the target table.`
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
      case 'add': {
        // Extract widgetOptions from flat column options
        const widgetOptions = extractWidgetOptions(op as unknown as Record<string, unknown>)
        // Convert split Ref format {type:'Ref', refTable:'X'} to Grist format 'Ref:X'
        const gristType = buildGristType(op as { type: string; refTable?: string })
        return buildAddColumnAction(toTableId(tableId), toColId(op.colId), {
          type: gristType,
          label: op.label,
          formula: op.formula,
          isFormula: op.isFormula,
          widgetOptions,
          ...('visibleCol' in op && op.visibleCol !== undefined
            ? { visibleCol: op.visibleCol }
            : {})
        })
      }
      case 'update':
        return buildModifyColumnAction(
          toTableId(tableId),
          toColId(op.colId),
          this.buildUpdateUpdates(op)
        )
      case 'delete':
        return buildRemoveColumnAction(toTableId(tableId), toColId(op.colId))
      case 'rename':
        return buildRenameColumnAction(toTableId(tableId), toColId(op.colId), toColId(op.newColId))
    }
  }

  private buildUpdateUpdates(
    op: ColumnOperation
  ): Record<string, string | number | boolean | object | undefined> {
    if (op.action !== 'update') return {}

    // Extract widgetOptions from flat column options
    const widgetOptions = extractWidgetOptions(op as unknown as Record<string, unknown>)

    const updates: Record<string, string | number | boolean | object | undefined> = {}
    // Convert split Ref format to Grist format if type is provided
    if (op.type !== undefined) {
      const opWithRefTable = op as { type: string; refTable?: string }
      updates.type = buildGristType(opWithRefTable)
    }
    if (op.label !== undefined) updates.label = op.label
    if (op.formula !== undefined) updates.formula = op.formula
    if (op.isFormula !== undefined) updates.isFormula = op.isFormula
    if (widgetOptions !== undefined) updates.widgetOptions = widgetOptions
    if ('visibleCol' in op && op.visibleCol !== undefined) updates.visibleCol = op.visibleCol
    if ('untieColIdFromLabel' in op && op.untieColIdFromLabel !== undefined)
      updates.untieColIdFromLabel = op.untieColIdFromLabel
    return updates
  }

  private formatOperationMessage(op: ColumnOperation): string {
    switch (op.action) {
      case 'add':
        return `Added column "${op.colId}" (${op.type})`
      case 'update':
        return `Updated column "${op.colId}"`
      case 'delete':
        return `Deleted column "${op.colId}"`
      case 'rename':
        return `Renamed column "${op.colId}" to "${op.newColId}"`
    }
  }

  private calculateOperationSummary(operations: ColumnOperation[]) {
    return {
      added: operations.filter((op) => op.action === 'add').length,
      updated: operations.filter((op) => op.action === 'update').length,
      deleted: operations.filter((op) => op.action === 'delete').length,
      renamed: operations.filter((op) => op.action === 'rename').length
    }
  }

  /**
   * Detect colId changes for update operations that changed label.
   * When label is changed without untieColIdFromLabel: true, Grist auto-updates colId.
   * We fetch fresh column data to compare actual colIds after the operation.
   */
  private async detectColIdChanges(
    docId: string,
    tableId: string,
    operations: ColumnOperation[]
  ): Promise<ColIdChangeInfo[]> {
    // Filter update operations that changed label without untieColIdFromLabel
    const updateOpsWithLabel = operations.filter(
      (op): op is Extract<ColumnOperation, { action: 'update' }> =>
        op.action === 'update' && op.label !== undefined && !op.untieColIdFromLabel
    )

    if (updateOpsWithLabel.length === 0) {
      return []
    }

    // Fetch fresh column data from Grist to check actual colIds
    const columnsResponse = await this.client.get<{
      columns: Array<{ id: string; fields: { label?: string } }>
    }>(`/docs/${docId}/tables/${tableId}/columns`)

    const colIdChanges: ColIdChangeInfo[] = []

    for (const op of updateOpsWithLabel) {
      // The original colId we sent in the update operation
      const originalColId = op.colId

      // Check if a column now exists with a different colId but matching label
      // When Grist auto-updates colId from label, the new colId is based on the label
      const matchingColumn = columnsResponse.columns.find(
        (col) => col.fields.label === op.label && col.id !== originalColId
      )

      // Also check if the original colId no longer exists
      // (meaning it was renamed due to label change)
      const originalExists = columnsResponse.columns.some((col) => col.id === originalColId)

      if (matchingColumn && !originalExists) {
        colIdChanges.push({
          originalColId,
          newColId: matchingColumn.id,
          operation: 'update'
        })
      }
    }

    return colIdChanges
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
    description: 'Add, update, delete, or rename columns',
    purpose: 'Add, update, delete, rename columns',
    category: 'columns',
    inputSchema: ManageColumnsSchema,
    outputSchema: ManageColumnsOutputSchema,
    annotations: WRITE_SAFE_ANNOTATIONS,
    handler: manageColumns,
    docs: {
      overview:
        'Add, update, delete, or rename columns. Type-specific options shown per type. Actions: add (type required), update (type optional), delete, rename. **Ref columns:** Use `type: "Ref"` with `refTable: "TableName"`. **colId/label:** By default, Grist auto-updates colId when label changes. Use `untieColIdFromLabel: true` to prevent.',
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
          desc: 'Multiple operations with flat options',
          input: {
            docId: 'abc123',
            tableId: 'Tasks',
            operations: [
              {
                action: 'add',
                colId: 'Priority',
                type: 'Choice',
                choices: ['High', 'Medium', 'Low']
              },
              {
                action: 'update',
                colId: 'Status',
                type: 'Choice',
                choices: ['Active', 'Inactive']
              },
              { action: 'rename', colId: 'Email', newColId: 'EmailAddress' },
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
              {
                action: 'add',
                colId: 'Manager',
                type: 'Ref',
                refTable: 'People',
                visibleCol: 'Email'
              }
            ]
          }
        },
        {
          desc: 'Numeric with currency formatting',
          input: {
            docId: 'abc123',
            tableId: 'Products',
            operations: [
              {
                action: 'add',
                colId: 'Price',
                type: 'Numeric',
                numMode: 'currency',
                currency: 'USD',
                decimals: 2
              }
            ]
          }
        },
        {
          desc: 'Formula column',
          input: {
            docId: 'abc123',
            tableId: 'Orders',
            operations: [
              {
                action: 'add',
                colId: 'Total',
                type: 'Numeric',
                isFormula: true,
                formula: '$Price * $Quantity'
              }
            ]
          }
        },
        {
          desc: 'Change label without changing colId',
          input: {
            docId: 'abc123',
            tableId: 'Products',
            operations: [
              {
                action: 'update',
                colId: 'Name',
                label: 'Product Name',
                untieColIdFromLabel: true
              }
            ]
          }
        }
      ],
      errors: [
        { error: 'Column not found', solution: 'Use grist_get_tables' },
        { error: 'Column already exists', solution: "Use action='update'" },
        { error: 'All operations rolled back', solution: 'Fix failed operation and retry all' },
        {
          error: 'colId changed unexpectedly',
          solution: 'Use untieColIdFromLabel: true when updating label to preserve colId'
        }
      ]
    }
  }
] as const
