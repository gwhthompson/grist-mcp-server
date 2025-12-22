/**
 * Consolidated schema management tool.
 *
 * Consolidates grist_create_table, grist_rename_table, grist_delete_table,
 * grist_manage_columns, and grist_create_summary_table into a single interface.
 *
 * Benefits:
 * - ~75% reduction in tools/list token usage for schema operations
 * - Batch multiple schema operations in a single API call
 * - Consistent interface for all schema CRUD operations
 *
 * Scopes:
 * - Tables: create, rename, delete
 * - Columns: add, modify, remove, rename
 * - Summaries: create summary tables for aggregations
 */

import { z } from 'zod'
import { MAX_COLUMN_OPERATIONS } from '../constants.js'
import {
  deleteTable as deleteTableOp,
  removeColumn as removeColumnOp,
  renameColumn as renameColumnOp,
  renameTable as renameTableOp
} from '../domain/operations/schema.js'
import type { ToolContext, ToolDefinition } from '../registry/types.js'
import { ApplyResponseSchema } from '../schemas/api-responses.js'
import {
  createBatchOutputSchema,
  type GenericBatchResponse,
  type GenericOperationResult,
  GenericOperationResultSchema
} from '../schemas/batch-operation-schemas.js'
import {
  buildGristType,
  ChoiceOptionsSchema,
  type ColumnDefinition,
  ColumnDefinitionSchema,
  ColumnStyleSchema,
  ColumnTypeLiteralSchema,
  extractRulesOptions,
  extractWidgetOptions,
  parseGristType,
  VisibleColSchema
} from '../schemas/column-types.js'
import {
  ColIdSchema,
  DocIdSchema,
  jsonSafeArray,
  ResponseFormatSchema,
  TableIdSchema
} from '../schemas/common.js'
import { BaseConditionalRuleSchema } from '../schemas/conditional-rules.js'
import {
  buildAddColumnAction,
  buildAddTableAction,
  buildModifyColumnAction
} from '../services/action-builder.js'
import { getColumnRef, resolveVisibleCol } from '../services/column-resolver.js'
import { ConditionalFormattingService } from '../services/conditional-formatting/service.js'
import { serializeUserAction } from '../services/grist-client.js'
import { VisibleColService, type VisibleColSetupParams } from '../services/visiblecol-service.js'
import { resolveColumnNameToColRef } from '../services/widget-resolver.js'
import { toColId, toDocId, toTableId } from '../types/advanced.js'
import type { ApplyResponse, SQLQueryResponse, UserAction } from '../types.js'
import { first } from '../utils/array-helpers.js'
import { extractFields } from '../utils/grist-field-extractor.js'
import { validateRetValues } from '../validators/apply-response.js'
import { BatchOperationTool } from './base/BatchOperationTool.js'
import { nextSteps } from './utils/next-steps.js'

// =============================================================================
// Shared Schemas
// =============================================================================

// =============================================================================
// Table Operation Schemas
// =============================================================================

const CreateTableOperationSchema = z
  .object({
    action: z.literal('create_table'),
    name: z.string().min(1).max(100).describe('becomes tableId'),
    columns: z.array(ColumnDefinitionSchema).min(0).max(100).default([])
  })
  .describe('create table')

const RenameTableOperationSchema = z
  .object({
    action: z.literal('rename_table'),
    tableId: TableIdSchema,
    newTableId: z.string().min(1).max(100)
  })
  .describe('rename table')

const DeleteTableOperationSchema = z
  .object({
    action: z.literal('delete_table'),
    tableId: TableIdSchema
  })
  .describe('delete table')

const UpdateTableOperationSchema = z
  .object({
    action: z.literal('update_table'),
    tableId: TableIdSchema,
    rowRules: z.array(BaseConditionalRuleSchema).optional().describe('replaces existing row rules')
  })
  .describe('update table')

// =============================================================================
// Column Operation Schemas
// =============================================================================

const AddColumnOperationSchema = z
  .object({
    action: z.literal('add_column'),
    tableId: TableIdSchema,
    column: ColumnDefinitionSchema
  })
  .describe('add column')

const ModifyColumnOperationSchema = z
  .object({
    action: z.literal('modify_column'),
    tableId: TableIdSchema,
    colId: ColIdSchema,
    updates: z.object({
      type: ColumnTypeLiteralSchema.optional(),
      refTable: z.string().optional().describe('for Ref/RefList'),
      label: z.string().optional(),
      isFormula: z.boolean().optional(),
      formula: z.string().optional().describe('Python expression'),
      visibleCol: VisibleColSchema.optional().describe('display column for Ref'),
      untieColIdFromLabel: z.boolean().optional(),
      // Type-specific options
      widget: z.string().optional(),
      wrap: z.boolean().optional(),
      numMode: z.string().nullable().optional(),
      currency: z.string().optional(),
      numSign: z.string().nullable().optional(),
      decimals: z.number().optional(),
      maxDecimals: z.number().optional(),
      dateFormat: z.string().optional(),
      isCustomDateFormat: z.boolean().optional(),
      timeFormat: z.string().optional(),
      isCustomTimeFormat: z.boolean().optional(),
      choices: z.array(z.string()).optional(),
      choiceOptions: ChoiceOptionsSchema,
      height: z.number().optional(),
      style: ColumnStyleSchema.optional().describe('styling + rulesOptions')
    })
  })
  .describe('modify column')

const RemoveColumnOperationSchema = z
  .object({
    action: z.literal('remove_column'),
    tableId: TableIdSchema,
    colId: ColIdSchema
  })
  .describe('remove column')

const RenameColumnOperationSchema = z
  .object({
    action: z.literal('rename_column'),
    tableId: TableIdSchema,
    colId: ColIdSchema,
    newColId: z.string().min(1)
  })
  .describe('rename column')

// =============================================================================
// Summary Table Operation Schema
// =============================================================================

const CreateSummaryOperationSchema = z
  .object({
    action: z.literal('create_summary'),
    sourceTable: z.string().min(1),
    groupByColumns: z.array(z.string().min(1)).min(1),
    keepPage: z.boolean().default(false).describe('keep auto-created page')
  })
  .describe('create summary')

// =============================================================================
// Discriminated Union and Main Schema
// =============================================================================

const SchemaOperationSchema = z.discriminatedUnion('action', [
  CreateTableOperationSchema,
  UpdateTableOperationSchema,
  RenameTableOperationSchema,
  DeleteTableOperationSchema,
  AddColumnOperationSchema,
  ModifyColumnOperationSchema,
  RemoveColumnOperationSchema,
  RenameColumnOperationSchema,
  CreateSummaryOperationSchema
])

export const ManageSchemaSchema = z.strictObject({
  docId: DocIdSchema,
  operations: jsonSafeArray(SchemaOperationSchema, { min: 1, max: MAX_COLUMN_OPERATIONS }),
  response_format: ResponseFormatSchema
})

export type ManageSchemaInput = z.infer<typeof ManageSchemaSchema>
export type SchemaOperation = z.infer<typeof SchemaOperationSchema>

// =============================================================================
// Response Types (using shared interfaces from batch-operation-schemas.ts)
// =============================================================================

// OperationResult → GenericOperationResult
// GenericBatchResponse → GenericBatchResponse

// =============================================================================
// Tool Implementation
// =============================================================================

export class ManageSchemaTool extends BatchOperationTool<
  typeof ManageSchemaSchema,
  SchemaOperation,
  GenericOperationResult,
  GenericBatchResponse
> {
  constructor(context: ToolContext) {
    super(context, ManageSchemaSchema)
  }

  protected getOperations(params: ManageSchemaInput): SchemaOperation[] {
    return params.operations
  }

  protected getDocId(params: ManageSchemaInput): string {
    return params.docId
  }

  protected getActionName(operation: SchemaOperation): string {
    return operation.action
  }

  protected async executeOperation(
    docId: string,
    operation: SchemaOperation,
    _index: number
  ): Promise<GenericOperationResult> {
    return this.executeSingleOperation(docId, operation)
  }

  protected buildSuccessResponse(
    docId: string,
    results: GenericOperationResult[],
    params: ManageSchemaInput
  ): GenericBatchResponse {
    return {
      success: true,
      docId,
      operationsCompleted: params.operations.length,
      results,
      message: `Successfully completed ${params.operations.length} schema operation(s)`
    }
  }

  protected buildFailureResponse(
    docId: string,
    failedIndex: number,
    failedOperation: SchemaOperation,
    completedResults: GenericOperationResult[],
    errorMessage: string,
    _params: ManageSchemaInput
  ): GenericBatchResponse {
    return {
      success: false,
      docId,
      operationsCompleted: failedIndex,
      results: completedResults,
      message: `Operation ${failedIndex + 1} (${failedOperation.action}) failed: ${errorMessage}`,
      partialFailure: {
        operationIndex: failedIndex,
        error: errorMessage,
        completedOperations: failedIndex
      }
    }
  }

  protected async afterExecute(
    result: GenericBatchResponse,
    _params: ManageSchemaInput
  ): Promise<GenericBatchResponse> {
    const tableCreates = result.results.filter((r) => r.action === 'create_table')
    const tableDeletes = result.results.filter((r) => r.action === 'delete_table')
    const tableRenames = result.results.filter((r) => r.action === 'rename_table')
    const columnAdds = result.results.filter((r) => r.action === 'add_column')
    const columnRemoves = result.results.filter((r) => r.action === 'remove_column')
    const columnRenames = result.results.filter((r) => r.action === 'rename_column')
    const columnModifies = result.results.filter((r) => r.action === 'modify_column')
    const summaryCreates = result.results.filter((r) => r.action === 'create_summary')

    const firstTableCreate = tableCreates[0]
    const firstTableRename = tableRenames[0]
    const firstColRename = columnRenames[0]
    const firstSummary = summaryCreates[0]

    const builder = nextSteps()

    if (result.partialFailure) {
      builder
        .add(`Fix error: ${result.partialFailure.error}`)
        .add(`Resume from operation index ${result.partialFailure.operationIndex}`)
    } else if (result.success) {
      builder
        // Table creates
        .addIf(
          tableCreates.length > 0,
          `Use grist_manage_records with action='add' to add data to "${firstTableCreate?.details.tableId}"`
        )
        .addIf(
          tableCreates.length > 0,
          "Use grist_manage_pages action='create_page' to create a view"
        )
        // Table deletes
        .addIf(tableDeletes.length > 0, 'Use grist_get_tables to verify table was deleted')
        .addIf(
          tableDeletes.length > 0,
          'Update any formulas or pages that referenced the deleted table'
        )
        // Table renames
        .addIf(
          tableRenames.length > 0,
          `Use grist_get_tables to verify rename to "${firstTableRename?.details.new_tableId}"`
        )
        .addIf(
          tableRenames.length > 0,
          'Update any formulas or references using the old table name'
        )
        // Column adds (only if no table creates)
        .addIf(
          columnAdds.length > 0 && tableCreates.length === 0,
          "Use grist_get_tables with detail_level='full_schema' to verify column configuration"
        )
        // Column removes
        .addIf(
          columnRemoves.length > 0,
          "Use grist_get_tables with detail_level='columns' to verify column removal"
        )
        .addIf(columnRemoves.length > 0, 'Update any formulas that referenced the removed column')
        // Column renames
        .addIf(
          columnRenames.length > 0,
          `Use grist_get_tables with detail_level='columns' to verify rename to "${firstColRename?.details.new_colId}"`
        )
        .addIf(columnRenames.length > 0, 'Update any formulas referencing the old column name')
        // Column modifies
        .addIf(
          columnModifies.length > 0,
          "Use grist_get_tables with detail_level='full_schema' to verify column changes"
        )
        // Summary creates
        .addIf(
          summaryCreates.length > 0,
          `Use grist_get_records with tableId="${firstSummary?.details.summaryTableId}" to query aggregated data`
        )
    }

    return { ...result, nextSteps: builder.build() }
  }

  private async executeSingleOperation(
    docId: string,
    op: SchemaOperation
  ): Promise<GenericOperationResult> {
    switch (op.action) {
      case 'create_table':
        return this.executeCreateTable(docId, op)
      case 'update_table':
        return this.executeUpdateTable(docId, op)
      case 'rename_table':
        return this.executeRenameTable(docId, op)
      case 'delete_table':
        return this.executeDeleteTable(docId, op)
      case 'add_column':
        return this.executeAddColumn(docId, op)
      case 'modify_column':
        return this.executeModifyColumn(docId, op)
      case 'remove_column':
        return this.executeRemoveColumn(docId, op)
      case 'rename_column':
        return this.executeRenameColumn(docId, op)
      case 'create_summary':
        return this.executeCreateSummary(docId, op)
    }
  }

  // ---------------------------------------------------------------------------
  // Table Operations
  // ---------------------------------------------------------------------------

  private async executeCreateTable(
    docId: string,
    op: Extract<SchemaOperation, { action: 'create_table' }>
  ): Promise<GenericOperationResult> {
    // Resolve visibleCol in columns
    const resolvedColumns = await this.resolveVisibleColInColumns(docId, op.columns)
    const gristColumns = this.columnsToGristFormat(resolvedColumns)

    const action = buildAddTableAction(toTableId(op.name), gristColumns)
    const response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Creating table ${op.name}`
      }
    )

    const retValues = validateRetValues(response, { context: `AddTable ${op.name}` })
    const retValue = retValues[0]

    // Note: Grist API returns table_id (snake_case) in its response
    let tableId = op.name
    if (typeof retValue === 'object' && retValue !== null && 'table_id' in retValue) {
      tableId = (retValue as { table_id: string }).table_id
    }

    // Handle visibleCol setup for Ref columns
    await this.setupVisibleColForTable(docId, tableId, resolvedColumns)

    // Process conditional formatting rules for each column (rulesOptions)
    let totalRulesApplied = 0
    for (const column of resolvedColumns) {
      const rules = extractRulesOptions(column)
      if (rules && rules.length > 0) {
        totalRulesApplied += await this.applyColumnRules(docId, tableId, column.colId, rules)
      }
    }

    // Invalidate cache
    this.schemaCache.invalidateDocument(toDocId(docId))

    // Auto-delete empty Table1 if this is a fresh document
    await this.maybeDeleteEmptyTable1(docId)

    return {
      action: 'create_table',
      success: true,
      details: {
        tableId: tableId,
        columnsCreated: op.columns.length,
        ...(totalRulesApplied > 0 && { conditional_formatting_rules: totalRulesApplied })
      }
    }
  }

  private async executeUpdateTable(
    docId: string,
    op: Extract<SchemaOperation, { action: 'update_table' }>
  ): Promise<GenericOperationResult> {
    const tableId = toTableId(op.tableId)
    let rowRulesUpdated = 0

    // Handle row rules if provided
    if (op.rowRules !== undefined) {
      const cfService = new ConditionalFormattingService(this.client, 'row')
      await cfService.replaceAllRules(docId, tableId, { tableId }, op.rowRules)
      rowRulesUpdated = op.rowRules.length
    }

    return {
      action: 'update_table',
      success: true,
      details: {
        tableId: op.tableId,
        ...(rowRulesUpdated > 0 && { rowRulesUpdated })
      }
    }
  }

  private async executeRenameTable(
    docId: string,
    op: Extract<SchemaOperation, { action: 'rename_table' }>
  ): Promise<GenericOperationResult> {
    const result = await renameTableOp(this.context, docId, op.tableId, op.newTableId)
    return {
      action: 'rename_table',
      success: true,
      verified: result.verified,
      details: {
        old_tableId: result.oldTableId,
        new_tableId: result.entity.tableId
      }
    }
  }

  private async executeDeleteTable(
    docId: string,
    op: Extract<SchemaOperation, { action: 'delete_table' }>
  ): Promise<GenericOperationResult> {
    const result = await deleteTableOp(this.context, docId, op.tableId)
    return {
      action: 'delete_table',
      success: true,
      verified: result.verified,
      details: {
        tableId: op.tableId,
        warning: 'All data permanently deleted'
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Column Operations
  // ---------------------------------------------------------------------------

  private async executeAddColumn(
    docId: string,
    op: Extract<SchemaOperation, { action: 'add_column' }>
  ): Promise<GenericOperationResult> {
    const column = await this.resolveVisibleColInColumn(docId, op.column)
    const widgetOptions = extractWidgetOptions(column)
    const gristType = buildGristType(column as { type: string; refTable?: string })

    const action = buildAddColumnAction(toTableId(op.tableId), toColId(column.colId), {
      type: gristType,
      label: column.label,
      formula: column.formula,
      isFormula: column.isFormula,
      widgetOptions,
      ...(column.visibleCol !== undefined ? { visibleCol: column.visibleCol } : {})
    })

    const response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Adding column ${column.colId} to ${op.tableId}`
      }
    )

    const retValues = validateRetValues(response, { context: `AddColumn ${column.colId}` })

    // Setup visibleCol if needed
    if ((column.type === 'Ref' || column.type === 'RefList') && column.visibleCol) {
      const retValue = retValues[0] as { colRef?: number } | undefined
      if (retValue?.colRef) {
        const visibleColService = new VisibleColService(this.client)
        await visibleColService.setupBatch([
          {
            docId,
            tableId: op.tableId,
            colId: column.colId,
            colRef: retValue.colRef,
            visibleCol: column.visibleCol as number,
            columnType: gristType
          }
        ])
      }
    }

    // Process conditional formatting rules (rulesOptions with formula+style pairs)
    const rules = extractRulesOptions(column)
    const rulesAdded =
      rules && rules.length > 0
        ? await this.applyColumnRules(docId, op.tableId, column.colId, rules)
        : 0

    this.schemaCache.invalidateCache(toDocId(docId), toTableId(op.tableId))

    return {
      action: 'add_column',
      success: true,
      details: {
        tableId: op.tableId,
        colId: column.colId,
        type: column.type,
        ...(rulesAdded > 0 && { conditional_formatting_rules: rulesAdded })
      }
    }
  }

  private async executeModifyColumn(
    docId: string,
    op: Extract<SchemaOperation, { action: 'modify_column' }>
  ): Promise<GenericOperationResult> {
    const updates: Record<string, unknown> = {}

    // Handle type with refTable
    if (op.updates.type) {
      updates.type = buildGristType({
        type: op.updates.type,
        refTable: op.updates.refTable
      })
    }

    // Copy simple properties
    const simpleProps = ['label', 'formula', 'isFormula', 'untieColIdFromLabel'] as const
    for (const prop of simpleProps) {
      if (op.updates[prop] !== undefined) {
        updates[prop] = op.updates[prop]
      }
    }

    // Handle visibleCol resolution
    if (op.updates.visibleCol !== undefined) {
      if (typeof op.updates.visibleCol === 'string') {
        const columnType =
          op.updates.type || (await this.getColumnType(docId, op.tableId, op.colId))
        const parsed = parseGristType(columnType)
        const refTable = op.updates.refTable || parsed.refTable
        if (refTable) {
          updates.visibleCol = await resolveVisibleCol(
            this.client,
            docId,
            refTable,
            op.updates.visibleCol
          )
        }
      } else {
        updates.visibleCol = op.updates.visibleCol
      }
    }

    // Build widgetOptions from type-specific updates
    const widgetOptions = this.buildWidgetOptions(op.updates)
    if (widgetOptions && Object.keys(widgetOptions).length > 0) {
      updates.widgetOptions = widgetOptions
    }

    const action = buildModifyColumnAction(toTableId(op.tableId), toColId(op.colId), updates)
    const response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Modifying column ${op.colId} in ${op.tableId}`
      }
    )

    validateRetValues(response, { context: `ModifyColumn ${op.colId}` })

    // Handle visibleCol post-processing
    if (updates.visibleCol !== undefined) {
      const colRef = await getColumnRef(this.client, docId, op.tableId, op.colId)
      const columnType =
        (updates.type as string) || (await this.getColumnType(docId, op.tableId, op.colId))
      const visibleColService = new VisibleColService(this.client)
      await visibleColService.setupBatch([
        {
          docId,
          tableId: op.tableId,
          colId: op.colId,
          colRef,
          visibleCol: updates.visibleCol as number,
          columnType
        }
      ])
    }

    // Process conditional formatting rules from style.rulesOptions
    let rulesAdded = 0
    if (op.updates.style) {
      const rules = extractRulesOptions({ style: op.updates.style })
      if (rules && rules.length > 0) {
        rulesAdded = await this.applyColumnRules(docId, op.tableId, op.colId, rules)
      }
    }

    this.schemaCache.invalidateCache(toDocId(docId), toTableId(op.tableId))

    return {
      action: 'modify_column',
      success: true,
      details: {
        tableId: op.tableId,
        colId: op.colId,
        propertiesUpdated: Object.keys(updates),
        ...(rulesAdded > 0 && { conditional_formatting_rules: rulesAdded })
      }
    }
  }

  private async executeRemoveColumn(
    docId: string,
    op: Extract<SchemaOperation, { action: 'remove_column' }>
  ): Promise<GenericOperationResult> {
    const result = await removeColumnOp(this.context, docId, op.tableId, op.colId)
    return {
      action: 'remove_column',
      success: true,
      verified: result.verified,
      details: {
        tableId: result.tableId,
        colId: result.colId
      }
    }
  }

  private async executeRenameColumn(
    docId: string,
    op: Extract<SchemaOperation, { action: 'rename_column' }>
  ): Promise<GenericOperationResult> {
    const result = await renameColumnOp(this.context, docId, op.tableId, op.colId, op.newColId)
    return {
      action: 'rename_column',
      success: true,
      verified: result.verified,
      details: {
        tableId: result.entity.tableId,
        old_colId: result.oldColId,
        new_colId: result.entity.colId
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Summary Table Operations
  // ---------------------------------------------------------------------------

  private async executeCreateSummary(
    docId: string,
    op: Extract<SchemaOperation, { action: 'create_summary' }>
  ): Promise<GenericOperationResult> {
    // Get source table ref
    const sourceTableRef = await this.schemaCache.getTableRef(toDocId(docId), op.sourceTable)
    if (sourceTableRef === null) {
      throw new Error(`Source table "${op.sourceTable}" not found`)
    }

    // Resolve group-by column refs
    const groupByColRefs: number[] = []
    for (const colName of op.groupByColumns) {
      const colRef = await resolveColumnNameToColRef(this.client, docId, op.sourceTable, colName)
      groupByColRefs.push(colRef)
    }

    // Create summary section
    const createActions: UserAction[] = [
      ['CreateViewSection', sourceTableRef, 0, 'record', groupByColRefs, null]
    ]

    const createResponse = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      createActions,
      {
        schema: ApplyResponseSchema,
        context: `Creating summary table for ${op.sourceTable}`
      }
    )

    validateRetValues(createResponse, { context: `Creating summary for ${op.sourceTable}` })

    const retValue = createResponse.retValues[0] as { viewRef: number; sectionRef: number }
    const viewRef = retValue.viewRef
    const sectionRef = retValue.sectionRef

    // Handle page visibility
    if (op.keepPage) {
      await this.renameView(docId, viewRef, op.sourceTable, op.groupByColumns)
    } else {
      await this.removePageAndTabBar(docId, viewRef)
    }

    // Invalidate cache
    this.schemaCache.invalidateDocument(toDocId(docId))

    // Get summary table name
    const summaryTableId = await this.getSummaryTableIdFromSection(docId, sectionRef)

    return {
      action: 'create_summary',
      success: true,
      details: {
        summaryTableId: summaryTableId,
        sourceTable: op.sourceTable,
        groupByColumns: op.groupByColumns
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  /**
   * Apply conditional formatting rules for a column.
   * Handles both field-scoped and column-scoped rules.
   * @returns Number of rules applied
   */
  private async applyColumnRules(
    docId: string,
    tableId: string,
    colId: string,
    rules: Array<{ formula: string; style: Record<string, unknown>; sectionId?: number }>
  ): Promise<number> {
    let rulesApplied = 0
    for (const rule of rules) {
      if (rule.sectionId) {
        // Field-scoped rule (applies to specific widget only)
        const fieldService = new ConditionalFormattingService(this.client, 'field')
        await fieldService.addRule(
          docId,
          tableId,
          { tableId, sectionId: rule.sectionId, fieldColId: colId },
          { formula: rule.formula, style: rule.style }
        )
      } else {
        // Column-scoped rule (applies across all views)
        const colService = new ConditionalFormattingService(this.client, 'column')
        await colService.addRule(docId, tableId, { tableId, colId }, rule)
      }
      rulesApplied++
    }
    return rulesApplied
  }

  private async resolveVisibleColInColumns(
    docId: string,
    columns: ColumnDefinition[]
  ): Promise<ColumnDefinition[]> {
    return Promise.all(columns.map((col) => this.resolveVisibleColInColumn(docId, col)))
  }

  private async resolveVisibleColInColumn(
    docId: string,
    col: ColumnDefinition
  ): Promise<ColumnDefinition> {
    if (col.type !== 'Ref' && col.type !== 'RefList') return col
    if (!col.visibleCol || typeof col.visibleCol === 'number') return col

    const foreignTable = col.refTable
    if (!foreignTable) {
      throw new Error(`Column "${col.colId}" has visibleCol but no refTable specified`)
    }

    const numericId = await resolveVisibleCol(this.client, docId, foreignTable, col.visibleCol)
    return { ...col, visibleCol: numericId }
  }

  private columnsToGristFormat(columns: ColumnDefinition[]): Array<{
    colId: string
    type: string
    label?: string
    isFormula?: boolean
    formula?: string
    visibleCol?: string | number
    widgetOptions?: Record<string, unknown>
  }> {
    return columns.map((col) => {
      const widgetOptions = extractWidgetOptions(col)
      const gristType = buildGristType(col as { type: string; refTable?: string })
      return {
        colId: col.colId,
        type: gristType,
        ...(col.label !== undefined && { label: col.label }),
        ...(col.isFormula !== undefined && { isFormula: col.isFormula }),
        ...(col.formula !== undefined && { formula: col.formula }),
        ...(col.visibleCol !== undefined && { visibleCol: col.visibleCol }),
        ...(widgetOptions && { widgetOptions })
      }
    })
  }

  private async setupVisibleColForTable(
    docId: string,
    tableId: string,
    columns: ColumnDefinition[]
  ): Promise<void> {
    const visibleColColumns = columns.filter(
      (col) => (col.type === 'Ref' || col.type === 'RefList') && col.visibleCol
    )

    if (visibleColColumns.length === 0) return

    // Query table columns to get colRefs
    const columnsResponse = await this.client.get<{
      columns: Array<{ id: string; fields: { colRef: number } }>
    }>(`/docs/${docId}/tables/${tableId}/columns`)

    const columnMap = new Map(columnsResponse.columns.map((c) => [c.id, c.fields.colRef]))
    const setupParams: VisibleColSetupParams[] = []

    for (const col of visibleColColumns) {
      const colRef = columnMap.get(col.colId)
      if (!colRef) continue

      setupParams.push({
        docId,
        tableId,
        colId: col.colId,
        colRef,
        visibleCol: col.visibleCol as number,
        columnType: buildGristType(col as { type: string; refTable?: string })
      })
    }

    if (setupParams.length > 0) {
      const visibleColService = new VisibleColService(this.client)
      await visibleColService.setupBatch(setupParams)
    }
  }

  private buildWidgetOptions(
    updates: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    const typeSpecificKeys = [
      'widget',
      'wrap',
      'numMode',
      'currency',
      'numSign',
      'decimals',
      'maxDecimals',
      'dateFormat',
      'isCustomDateFormat',
      'timeFormat',
      'isCustomTimeFormat',
      'choices',
      'choiceOptions',
      'height'
    ]

    const widgetOptions: Record<string, unknown> = {}
    for (const key of typeSpecificKeys) {
      if (updates[key] !== undefined) {
        widgetOptions[key] = updates[key]
      }
    }

    return Object.keys(widgetOptions).length > 0 ? widgetOptions : undefined
  }

  private async getColumnType(docId: string, tableId: string, colId: string): Promise<string> {
    const columns = await this.client.get<{
      columns: Array<{ id: string; fields: { type: string } }>
    }>(`/docs/${docId}/tables/${tableId}/columns`)

    const column = columns.columns.find((c) => c.id === colId)
    if (!column) {
      throw new Error(`Column "${colId}" not found in table "${tableId}"`)
    }
    return column.fields.type
  }

  private async getSummaryTableIdFromSection(docId: string, sectionRef: number): Promise<string> {
    const response = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `
        SELECT t.tableId
        FROM _grist_Views_section s
        JOIN _grist_Tables t ON s.tableRef = t.id
        WHERE s.id = ?
      `,
      args: [sectionRef]
    })

    if (response.records.length === 0) {
      throw new Error(`Could not find summary table for section ${sectionRef}`)
    }

    const fields = extractFields(first(response.records, `Summary table for section ${sectionRef}`))
    return fields.tableId as string
  }

  private async removePageAndTabBar(docId: string, viewRef: number): Promise<void> {
    const queryResponse = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `
        SELECT p.id as pageId, t.id as tabBarId
        FROM _grist_Views v
        LEFT JOIN _grist_Pages p ON p.viewRef = v.id
        LEFT JOIN _grist_TabBar t ON t.viewRef = v.id
        WHERE v.id = ?
        LIMIT 1
      `,
      args: [viewRef]
    })

    if (queryResponse.records.length === 0) return

    const fields = extractFields(first(queryResponse.records, 'Page lookup'))
    const removeActions: UserAction[] = []

    if (fields.pageId && typeof fields.pageId === 'number') {
      removeActions.push(['BulkRemoveRecord', '_grist_Pages', [fields.pageId]])
    }
    if (fields.tabBarId && typeof fields.tabBarId === 'number') {
      removeActions.push(['BulkRemoveRecord', '_grist_TabBar', [fields.tabBarId]])
    }

    if (removeActions.length > 0) {
      await this.client.post<ApplyResponse>(`/docs/${docId}/apply`, removeActions, {
        schema: ApplyResponseSchema,
        context: 'Removing page/tabBar for summary table'
      })
    }
  }

  private async renameView(
    docId: string,
    viewRef: number,
    sourceTable: string,
    groupByColumns: string[]
  ): Promise<void> {
    const viewName = `Summary: ${sourceTable} by ${groupByColumns.join(', ')}`
    await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [['UpdateRecord', '_grist_Views', viewRef, { name: viewName }]],
      {
        schema: ApplyResponseSchema,
        context: `Renaming summary table view`
      }
    )
  }

  /**
   * Auto-delete the default Table1 when creating a new table in a fresh document.
   * Only deletes if Table1 exists, has no records, and no custom columns.
   * This is a convenience feature - failures are silently ignored.
   */
  private async maybeDeleteEmptyTable1(docId: string): Promise<void> {
    try {
      // Check if Table1 exists
      const tablesResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
        sql: `SELECT tableId FROM _grist_Tables WHERE tableId = 'Table1'`
      })
      if (tablesResp.records.length === 0) return

      // Check for records
      const recordsResp = await this.client.get<{ records: unknown[] }>(
        `/docs/${docId}/tables/Table1/records?limit=1`
      )
      if (recordsResp.records.length > 0) return

      // Check for custom columns (beyond default A, B, C)
      const columnsResp = await this.client.get<{ columns: Array<{ id: string }> }>(
        `/docs/${docId}/tables/Table1/columns`
      )
      const defaultCols = new Set(['A', 'B', 'C'])
      const hasCustomCols = columnsResp.columns.some(
        (c) => !c.id.startsWith('gristHelper_') && !defaultCols.has(c.id)
      )
      if (hasCustomCols) return

      // Safe to delete - use RemoveTable UserAction
      await this.client.post<ApplyResponse>(`/docs/${docId}/apply`, [['RemoveTable', 'Table1']], {
        schema: ApplyResponseSchema,
        context: 'Auto-removing empty Table1'
      })
    } catch {
      // Silently ignore - this is a convenience feature
    }
  }
}

export async function manageSchema(context: ToolContext, params: ManageSchemaInput) {
  const tool = new ManageSchemaTool(context)
  return tool.execute(params)
}

// =============================================================================
// Output Schema
// =============================================================================

export const ManageSchemaOutputSchema = createBatchOutputSchema(GenericOperationResultSchema)

// =============================================================================
// Tool Definition
// =============================================================================

export const MANAGE_SCHEMA_TOOL: ToolDefinition = {
  name: 'grist_manage_schema',
  title: 'Manage Schema',
  description: 'Create/rename/delete tables, add/modify/remove columns, create summary tables',
  purpose: 'Schema operations: tables, columns, summaries',
  category: 'tables',
  inputSchema: ManageSchemaSchema,
  outputSchema: ManageSchemaOutputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true, // Can delete tables/columns
    idempotentHint: false, // create_table is not idempotent
    openWorldHint: true
  },
  handler: manageSchema,
  docs: {
    overview:
      'Batch schema operations: tables (create, rename, delete), columns (add, modify, remove, rename), ' +
      'and summary tables. Operations execute sequentially. ' +
      '**Ref columns:** Use `type: "Ref"` with `refTable: "TableName"`.\n\n' +
      '**Summary tables:** Named `{SourceTable}_summary_{GroupByColumns}` ' +
      '(e.g., Tasks_summary_Status for Tasks grouped by Status).\n\n' +
      'FORMULA SYNTAX (Python expressions):\n' +
      '- Column references: $ColumnName (e.g., $Price * $Quantity)\n' +
      '- Cross-table lookups: $RefColumn.FieldName (e.g., $Company.Name)\n' +
      '- Conditionals: "High" if $Amount > 1000 else "Low"\n' +
      '- Date math: $DueDate - TODAY() (returns timedelta)\n' +
      '- String ops: $Name.upper(), $Email.split("@")[0]\n' +
      '- Aggregations in summary: SUM($group.Amount), COUNT($group)\n' +
      '- Common functions: ROUND(), MAX(), MIN(), LEN(), NOW(), TODAY()\n' +
      '- Set isFormula:true for dynamic formulas, isFormula:false for defaults\n\n' +
      'FORMULA EXAMPLES:\n' +
      '- Total: "$Quantity * $UnitPrice"\n' +
      '- Full name: "$FirstName + \\" \\" + $LastName"\n' +
      '- Days until: "($DueDate - TODAY()).days if $DueDate else None"\n' +
      '- Status color: "\\"red\\" if $Overdue else \\"green\\""\n' +
      '- Lookup: "$Customer.Email if $Customer else \\"\\""\n\n' +
      'RELATED TOOLS:\n' +
      '- Conditional formatting: grist_manage_conditional_rules (column/row/field scope)\n' +
      '- Page layouts: grist_manage_pages (widget arrangement and linking)',
    examples: [
      {
        desc: 'Create table with columns',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'create_table',
              name: 'Contacts',
              columns: [
                { colId: 'Name', type: 'Text', label: 'Full Name' },
                { colId: 'Email', type: 'Text' },
                { colId: 'Status', type: 'Choice', choices: ['Active', 'Inactive'] }
              ]
            }
          ]
        }
      },
      {
        desc: 'Add column and create summary',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'add_column',
              tableId: 'Sales',
              column: { colId: 'Region', type: 'Text' }
            },
            {
              action: 'create_summary',
              sourceTable: 'Sales',
              groupByColumns: ['Region']
            }
          ]
        }
      },
      {
        desc: 'Modify column type',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'modify_column',
              tableId: 'Products',
              colId: 'Price',
              updates: {
                type: 'Numeric',
                numMode: 'currency',
                currency: 'USD',
                decimals: 2
              }
            }
          ]
        }
      },
      {
        desc: 'Rename and delete operations',
        input: {
          docId: 'abc123',
          operations: [
            { action: 'rename_table', tableId: 'OldName', newTableId: 'NewName' },
            { action: 'rename_column', tableId: 'NewName', colId: 'Old', newColId: 'New' },
            { action: 'remove_column', tableId: 'NewName', colId: 'Unused' }
          ]
        }
      }
    ],
    errors: [
      { error: 'Table not found', solution: 'Use grist_get_tables to list tables' },
      { error: 'Column not found', solution: 'Use grist_get_tables with detail_level="columns"' },
      { error: 'Table already exists', solution: 'Use rename_table or choose different name' },
      { error: 'Partial failure', solution: 'Check partialFailure.operationIndex' }
    ]
  }
}
