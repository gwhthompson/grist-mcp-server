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
  type ToolContext,
  type ToolDefinition,
  WRITE_IDEMPOTENT_ANNOTATIONS
} from '../registry/types.js'
import { ApplyResponseSchema } from '../schemas/api-responses.js'
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
import { ColIdSchema, DocIdSchema, ResponseFormatSchema, TableIdSchema } from '../schemas/common.js'
import {
  buildAddColumnAction,
  buildAddTableAction,
  buildModifyColumnAction,
  buildRemoveColumnAction,
  buildRemoveTableAction,
  buildRenameColumnAction,
  buildRenameTableAction
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
import { GristTool } from './base/GristTool.js'

// =============================================================================
// Shared Schemas (registered for named $refs)
// =============================================================================

// JsonObjectSchema for arbitrary JSON data in responses
const JsonObjectSchema = z.record(z.string(), z.unknown())
JsonObjectSchema.register(z.globalRegistry, {
  id: 'jsonObject',
  description: 'Arbitrary JSON object'
})

// =============================================================================
// Table Operation Schemas
// =============================================================================

const CreateTableOperationSchema = z
  .object({
    action: z.literal('create_table'),
    name: z.string().min(1).max(100).describe('Table name (becomes tableId after normalization)'),
    columns: z
      .array(ColumnDefinitionSchema)
      .min(0)
      .max(100)
      .default([])
      .describe('Column definitions with type-specific options')
  })
  .describe('Create a new table with optional columns')

const RenameTableOperationSchema = z
  .object({
    action: z.literal('rename_table'),
    tableId: TableIdSchema,
    newTableId: z.string().min(1).max(100).describe('New table name')
  })
  .describe('Rename an existing table')

const DeleteTableOperationSchema = z
  .object({
    action: z.literal('delete_table'),
    tableId: TableIdSchema
  })
  .describe('Delete a table and all its data (DESTRUCTIVE)')

// =============================================================================
// Column Operation Schemas
// =============================================================================

const AddColumnOperationSchema = z
  .object({
    action: z.literal('add_column'),
    tableId: TableIdSchema,
    column: ColumnDefinitionSchema.describe('Column definition')
  })
  .describe('Add a column to an existing table')

const ModifyColumnOperationSchema = z
  .object({
    action: z.literal('modify_column'),
    tableId: TableIdSchema,
    colId: ColIdSchema,
    updates: z
      .object({
        type: ColumnTypeLiteralSchema.optional().describe('New column type'),
        refTable: z.string().optional().describe('For Ref/RefList: target table'),
        label: z.string().optional().describe('Human-readable label'),
        isFormula: z.boolean().optional().describe('Formula column flag'),
        formula: z.string().optional().describe('Python formula'),
        visibleCol: VisibleColSchema.optional().describe('Display column for Ref'),
        untieColIdFromLabel: z
          .boolean()
          .optional()
          .describe('Prevent colId auto-update on label change'),
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
        // Style with conditional formatting
        style: ColumnStyleSchema.optional().describe(
          'Visual styling including conditional formatting rules. ' +
            'For rulesOptions, each rule requires {formula, style} where formula is a Python expression ' +
            '(e.g., "$Price > 1000") and style contains formatting (fillColor, textColor, fontBold, etc.).'
        )
      })
      .describe('Properties to update')
  })
  .describe('Modify an existing column')

const RemoveColumnOperationSchema = z
  .object({
    action: z.literal('remove_column'),
    tableId: TableIdSchema,
    colId: ColIdSchema
  })
  .describe('Remove a column from a table')

const RenameColumnOperationSchema = z
  .object({
    action: z.literal('rename_column'),
    tableId: TableIdSchema,
    colId: ColIdSchema,
    newColId: z.string().min(1).describe('New column identifier')
  })
  .describe('Rename a column')

// =============================================================================
// Summary Table Operation Schema
// =============================================================================

const CreateSummaryOperationSchema = z
  .object({
    action: z.literal('create_summary'),
    sourceTable: z.string().min(1).describe('Source table name'),
    groupByColumns: z.array(z.string().min(1)).min(1).describe('Columns to group by'),
    keepPage: z.boolean().default(false).describe('Keep the auto-created page visible')
  })
  .describe('Create a summary table for aggregations')

// =============================================================================
// Discriminated Union and Main Schema
// =============================================================================

const SchemaOperationSchema = z.discriminatedUnion('action', [
  CreateTableOperationSchema,
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
  operations: z
    .array(SchemaOperationSchema)
    .min(1)
    .max(MAX_COLUMN_OPERATIONS)
    .describe('Schema operations to perform in sequence'),
  response_format: ResponseFormatSchema
})

export type ManageSchemaInput = z.infer<typeof ManageSchemaSchema>
export type SchemaOperation = z.infer<typeof SchemaOperationSchema>

// =============================================================================
// Response Types
// =============================================================================

interface OperationResult {
  action: string
  success: boolean
  details: Record<string, unknown>
  error?: string
}

interface ManageSchemaResponse {
  success: boolean
  docId: string
  operationsCompleted: number
  results: OperationResult[]
  message: string
  partial_failure?: {
    operation_index: number
    error: string
    completed_operations: number
  }
}

// =============================================================================
// Tool Implementation
// =============================================================================

export class ManageSchemaTool extends GristTool<typeof ManageSchemaSchema, ManageSchemaResponse> {
  constructor(context: ToolContext) {
    super(context, ManageSchemaSchema)
  }

  protected async executeInternal(params: ManageSchemaInput): Promise<ManageSchemaResponse> {
    const results: OperationResult[] = []

    for (let i = 0; i < params.operations.length; i++) {
      const op = params.operations[i]
      if (!op) continue
      try {
        const result = await this.executeOperation(params.docId, op)
        results.push(result)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          docId: params.docId,
          operationsCompleted: i,
          results,
          message: `Operation ${i + 1} (${op.action}) failed: ${errorMessage}`,
          partial_failure: {
            operation_index: i,
            error: errorMessage,
            completed_operations: i
          }
        }
      }
    }

    return {
      success: true,
      docId: params.docId,
      operationsCompleted: params.operations.length,
      results,
      message: `Successfully completed ${params.operations.length} schema operation(s)`
    }
  }

  private async executeOperation(docId: string, op: SchemaOperation): Promise<OperationResult> {
    switch (op.action) {
      case 'create_table':
        return this.executeCreateTable(docId, op)
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
  ): Promise<OperationResult> {
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

    // Invalidate cache
    this.schemaCache.invalidateDocument(toDocId(docId))

    return {
      action: 'create_table',
      success: true,
      details: {
        tableId: tableId,
        columnsCreated: op.columns.length
      }
    }
  }

  private async executeRenameTable(
    docId: string,
    op: Extract<SchemaOperation, { action: 'rename_table' }>
  ): Promise<OperationResult> {
    const action = buildRenameTableAction(toTableId(op.tableId), toTableId(op.newTableId))
    const response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Renaming table ${op.tableId} to ${op.newTableId}`
      }
    )

    validateRetValues(response, { context: `RenameTable ${op.tableId}` })
    this.schemaCache.invalidateDocument(toDocId(docId))

    return {
      action: 'rename_table',
      success: true,
      details: {
        old_tableId: op.tableId,
        new_tableId: op.newTableId
      }
    }
  }

  private async executeDeleteTable(
    docId: string,
    op: Extract<SchemaOperation, { action: 'delete_table' }>
  ): Promise<OperationResult> {
    const action = buildRemoveTableAction(toTableId(op.tableId))
    const response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Deleting table ${op.tableId}`
      }
    )

    validateRetValues(response, { context: `RemoveTable ${op.tableId}` })
    this.schemaCache.invalidateDocument(toDocId(docId))

    return {
      action: 'delete_table',
      success: true,
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
  ): Promise<OperationResult> {
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
    let rulesAdded = 0
    if (rules && rules.length > 0) {
      const cfService = new ConditionalFormattingService(this.client, 'column')
      for (const rule of rules) {
        await cfService.addRule(
          docId,
          op.tableId,
          { tableId: op.tableId, colId: column.colId },
          rule
        )
        rulesAdded++
      }
    }

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
  ): Promise<OperationResult> {
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
        const cfService = new ConditionalFormattingService(this.client, 'column')
        for (const rule of rules) {
          await cfService.addRule(docId, op.tableId, { tableId: op.tableId, colId: op.colId }, rule)
          rulesAdded++
        }
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
  ): Promise<OperationResult> {
    const action = buildRemoveColumnAction(toTableId(op.tableId), toColId(op.colId))
    const response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Removing column ${op.colId} from ${op.tableId}`
      }
    )

    validateRetValues(response, { context: `RemoveColumn ${op.colId}` })
    this.schemaCache.invalidateCache(toDocId(docId), toTableId(op.tableId))

    return {
      action: 'remove_column',
      success: true,
      details: {
        tableId: op.tableId,
        colId: op.colId
      }
    }
  }

  private async executeRenameColumn(
    docId: string,
    op: Extract<SchemaOperation, { action: 'rename_column' }>
  ): Promise<OperationResult> {
    const action = buildRenameColumnAction(
      toTableId(op.tableId),
      toColId(op.colId),
      toColId(op.newColId)
    )
    const response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Renaming column ${op.colId} to ${op.newColId}`
      }
    )

    validateRetValues(response, { context: `RenameColumn ${op.colId}` })
    this.schemaCache.invalidateCache(toDocId(docId), toTableId(op.tableId))

    return {
      action: 'rename_column',
      success: true,
      details: {
        tableId: op.tableId,
        old_colId: op.colId,
        new_colId: op.newColId
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Summary Table Operations
  // ---------------------------------------------------------------------------

  private async executeCreateSummary(
    docId: string,
    op: Extract<SchemaOperation, { action: 'create_summary' }>
  ): Promise<OperationResult> {
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
}

export async function manageSchema(context: ToolContext, params: ManageSchemaInput) {
  const tool = new ManageSchemaTool(context)
  return tool.execute(params)
}

// =============================================================================
// Output Schema
// =============================================================================

export const ManageSchemaOutputSchema = z.object({
  success: z.boolean(),
  docId: z.string(),
  operationsCompleted: z.number(),
  results: z.array(
    z.object({
      action: z.string(),
      success: z.boolean(),
      details: JsonObjectSchema,
      error: z.string().optional()
    })
  ),
  message: z.string(),
  partial_failure: z
    .object({
      operation_index: z.number(),
      error: z.string(),
      completed_operations: z.number()
    })
    .optional()
})

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
  annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
  handler: manageSchema,
  docs: {
    overview:
      'Batch schema operations: tables (create, rename, delete), columns (add, modify, remove, rename), ' +
      'and summary tables. Operations execute sequentially. ' +
      '**Ref columns:** Use `type: "Ref"` with `refTable: "TableName"`.',
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
      { error: 'Partial failure', solution: 'Check partial_failure.operation_index' }
    ]
  }
}
