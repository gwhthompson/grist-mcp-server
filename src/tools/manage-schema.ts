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

import {
  deleteTable as deleteTableOp,
  removeColumn as removeColumnOp,
  renameColumn as renameColumnOp,
  renameTable as renameTableOp
} from '../domain/operations/schema.js'
import type { ToolContext, ToolDefinition } from '../registry/types.js'
import { ApplyResponseSchema } from '../schemas/api-responses.js'
import type {
  GenericBatchResponse,
  GenericOperationResult
} from '../schemas/batch-operation-schemas.js'
import {
  buildGristType,
  type ColumnDefinition,
  extractRulesOptions,
  extractWidgetOptions,
  parseGristType
} from '../schemas/column-types.js'
import {
  type ManageSchemaInput,
  ManageSchemaOutputSchema,
  ManageSchemaSchema,
  type SchemaOperation
} from '../schemas/schema-operations.js'
import {
  buildAddColumnAction,
  buildAddTableAction,
  buildModifyColumnAction
} from '../services/action-builder.js'
import { serializeUserAction } from '../services/action-serializer.js'
import { getColumnRef, resolveVisibleCol } from '../services/column-resolver.js'
import { ConditionalFormattingService } from '../services/conditional-formatting/service.js'
import { VisibleColService, type VisibleColSetupParams } from '../services/visiblecol-service.js'
import { resolveColumnNameToColRef } from '../services/widget-resolver.js'
import { toColId, toDocId, toTableId } from '../types/advanced.js'
import type { ApplyResponse, SQLQueryResponse, UserAction } from '../types.js'
import { first } from '../utils/array-helpers.js'
import { extractFields } from '../utils/grist-field-extractor.js'
import { log } from '../utils/logger.js'
import { validateRetValues } from '../validators/apply-response.js'
import { defineBatchTool } from './factory/index.js'
import { nextSteps } from './utils/next-steps.js'

export {
  type ManageSchemaInput,
  ManageSchemaSchema,
  type SchemaOperation
} from '../schemas/schema-operations.js'

// =============================================================================
// Response Types (using shared interfaces from batch-operation-schemas.ts)
// =============================================================================

// OperationResult → GenericOperationResult
// GenericBatchResponse → GenericBatchResponse

// =============================================================================
// Helper Functions for Operations
// =============================================================================

/**
 * Execute a single schema operation.
 */
function executeSingleOperation(
  ctx: ToolContext,
  docId: string,
  op: SchemaOperation
): Promise<GenericOperationResult> {
  switch (op.action) {
    case 'create_table':
      return executeCreateTable(ctx, docId, op)
    case 'update_table':
      return executeUpdateTable(ctx, docId, op)
    case 'rename_table':
      return executeRenameTable(ctx, docId, op)
    case 'delete_table':
      return executeDeleteTable(ctx, docId, op)
    case 'add_column':
      return executeAddColumn(ctx, docId, op)
    case 'modify_column':
      return executeModifyColumn(ctx, docId, op)
    case 'remove_column':
      return executeRemoveColumn(ctx, docId, op)
    case 'rename_column':
      return executeRenameColumn(ctx, docId, op)
    case 'create_summary':
      return executeCreateSummary(ctx, docId, op)
  }
}

// ---------------------------------------------------------------------------
// Table Operations
// ---------------------------------------------------------------------------

async function executeCreateTable(
  ctx: ToolContext,
  docId: string,
  op: Extract<SchemaOperation, { action: 'create_table' }>
): Promise<GenericOperationResult> {
  const { client, schemaCache } = ctx

  // Resolve visibleCol in columns
  const resolvedColumns = await resolveVisibleColInColumns(client, docId, op.columns)
  const gristColumns = columnsToGristFormat(resolvedColumns)

  const action = buildAddTableAction(toTableId(op.name), gristColumns)
  const response = await client.post<ApplyResponse>(
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
  await setupVisibleColForTable(client, docId, tableId, resolvedColumns)

  // Process conditional formatting rules for each column (rulesOptions)
  let totalRulesApplied = 0
  for (const column of resolvedColumns) {
    const rules = extractRulesOptions(column)
    if (rules && rules.length > 0) {
      totalRulesApplied += await applyColumnRules(client, docId, tableId, column.colId, rules)
    }
  }

  // Invalidate cache
  schemaCache.invalidateDocument(toDocId(docId))

  // Auto-delete empty Table1 if this is a fresh document
  await maybeDeleteEmptyTable1(client, docId)

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

async function executeUpdateTable(
  ctx: ToolContext,
  docId: string,
  op: Extract<SchemaOperation, { action: 'update_table' }>
): Promise<GenericOperationResult> {
  const { client } = ctx
  const tableId = toTableId(op.tableId)
  let rowRulesUpdated = 0

  // Handle row rules if provided
  if (op.rowRules !== undefined) {
    const cfService = new ConditionalFormattingService(client, 'row')
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

async function executeRenameTable(
  ctx: ToolContext,
  docId: string,
  op: Extract<SchemaOperation, { action: 'rename_table' }>
): Promise<GenericOperationResult> {
  const result = await renameTableOp(ctx, docId, op.tableId, op.newTableId)
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

async function executeDeleteTable(
  ctx: ToolContext,
  docId: string,
  op: Extract<SchemaOperation, { action: 'delete_table' }>
): Promise<GenericOperationResult> {
  const result = await deleteTableOp(ctx, docId, op.tableId)
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

async function executeAddColumn(
  ctx: ToolContext,
  docId: string,
  op: Extract<SchemaOperation, { action: 'add_column' }>
): Promise<GenericOperationResult> {
  const { client, schemaCache } = ctx

  const column = await resolveVisibleColInColumn(client, docId, op.column)
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

  const response = await client.post<ApplyResponse>(
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
      const visibleColService = new VisibleColService(client)
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
      ? await applyColumnRules(client, docId, op.tableId, column.colId, rules)
      : 0

  schemaCache.invalidateCache(toDocId(docId), toTableId(op.tableId))

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

async function executeModifyColumn(
  ctx: ToolContext,
  docId: string,
  op: Extract<SchemaOperation, { action: 'modify_column' }>
): Promise<GenericOperationResult> {
  const { client, schemaCache } = ctx
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
        op.updates.type || (await getColumnType(client, docId, op.tableId, op.colId))
      const parsed = parseGristType(columnType)
      const refTable = op.updates.refTable || parsed.refTable
      if (refTable) {
        updates.visibleCol = await resolveVisibleCol(client, docId, refTable, op.updates.visibleCol)
      }
    } else {
      updates.visibleCol = op.updates.visibleCol
    }
  }

  // Build widgetOptions from type-specific updates
  const widgetOptions = buildWidgetOptions(op.updates)
  if (widgetOptions && Object.keys(widgetOptions).length > 0) {
    updates.widgetOptions = widgetOptions
  }

  const action = buildModifyColumnAction(toTableId(op.tableId), toColId(op.colId), updates)
  const response = await client.post<ApplyResponse>(
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
    const colRef = await getColumnRef(client, docId, op.tableId, op.colId)
    const columnType =
      (updates.type as string) || (await getColumnType(client, docId, op.tableId, op.colId))
    const visibleColService = new VisibleColService(client)
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
      rulesAdded = await applyColumnRules(client, docId, op.tableId, op.colId, rules)
    }
  }

  schemaCache.invalidateCache(toDocId(docId), toTableId(op.tableId))

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

async function executeRemoveColumn(
  ctx: ToolContext,
  docId: string,
  op: Extract<SchemaOperation, { action: 'remove_column' }>
): Promise<GenericOperationResult> {
  const result = await removeColumnOp(ctx, docId, op.tableId, op.colId)
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

async function executeRenameColumn(
  ctx: ToolContext,
  docId: string,
  op: Extract<SchemaOperation, { action: 'rename_column' }>
): Promise<GenericOperationResult> {
  const result = await renameColumnOp(ctx, docId, op.tableId, op.colId, op.newColId)
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

async function executeCreateSummary(
  ctx: ToolContext,
  docId: string,
  op: Extract<SchemaOperation, { action: 'create_summary' }>
): Promise<GenericOperationResult> {
  const { client, schemaCache } = ctx

  // Get source table ref
  const sourceTableRef = await schemaCache.getTableRef(toDocId(docId), op.sourceTable)
  if (sourceTableRef === null) {
    throw new Error(`Source table "${op.sourceTable}" not found`)
  }

  // Resolve group-by column refs
  const groupByColRefs: number[] = []
  for (const colName of op.groupByColumns) {
    const colRef = await resolveColumnNameToColRef(client, docId, op.sourceTable, colName)
    groupByColRefs.push(colRef)
  }

  // Create summary section
  const createActions: UserAction[] = [
    ['CreateViewSection', sourceTableRef, 0, 'record', groupByColRefs, null]
  ]

  const createResponse = await client.post<ApplyResponse>(`/docs/${docId}/apply`, createActions, {
    schema: ApplyResponseSchema,
    context: `Creating summary table for ${op.sourceTable}`
  })

  validateRetValues(createResponse, { context: `Creating summary for ${op.sourceTable}` })

  const retValue = createResponse.retValues[0] as { viewRef: number; sectionRef: number }
  const viewRef = retValue.viewRef
  const sectionRef = retValue.sectionRef

  // Handle page visibility
  if (op.keepPage) {
    await renameView(client, docId, viewRef, op.sourceTable, op.groupByColumns)
  } else {
    await removePageAndTabBar(client, docId, viewRef)
  }

  // Invalidate cache
  schemaCache.invalidateDocument(toDocId(docId))

  // Get summary table name
  const summaryTableId = await getSummaryTableIdFromSection(client, docId, sectionRef)

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
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Apply conditional formatting rules for a column.
 * Handles both field-scoped and column-scoped rules.
 * @returns Number of rules applied
 */
async function applyColumnRules(
  client: ToolContext['client'],
  docId: string,
  tableId: string,
  colId: string,
  rules: Array<{ formula: string; style: Record<string, unknown>; sectionId?: number }>
): Promise<number> {
  let rulesApplied = 0
  for (const rule of rules) {
    if (rule.sectionId) {
      // Field-scoped rule (applies to specific widget only)
      const fieldService = new ConditionalFormattingService(client, 'field')
      await fieldService.addRule(
        docId,
        tableId,
        { tableId, sectionId: rule.sectionId, fieldColId: colId },
        { formula: rule.formula, style: rule.style }
      )
    } else {
      // Column-scoped rule (applies across all views)
      const colService = new ConditionalFormattingService(client, 'column')
      await colService.addRule(docId, tableId, { tableId, colId }, rule)
    }
    rulesApplied++
  }
  return rulesApplied
}

async function resolveVisibleColInColumns(
  client: ToolContext['client'],
  docId: string,
  columns: ColumnDefinition[]
): Promise<ColumnDefinition[]> {
  return await Promise.all(columns.map((col) => resolveVisibleColInColumn(client, docId, col)))
}

async function resolveVisibleColInColumn(
  client: ToolContext['client'],
  docId: string,
  col: ColumnDefinition
): Promise<ColumnDefinition> {
  if (col.type !== 'Ref' && col.type !== 'RefList') return col
  if (!col.visibleCol || typeof col.visibleCol === 'number') return col

  const foreignTable = col.refTable
  if (!foreignTable) {
    throw new Error(`Column "${col.colId}" has visibleCol but no refTable specified`)
  }

  const numericId = await resolveVisibleCol(client, docId, foreignTable, col.visibleCol)
  return { ...col, visibleCol: numericId }
}

function columnsToGristFormat(columns: ColumnDefinition[]): Array<{
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

async function setupVisibleColForTable(
  client: ToolContext['client'],
  docId: string,
  tableId: string,
  columns: ColumnDefinition[]
): Promise<void> {
  const visibleColColumns = columns.filter(
    (col) => (col.type === 'Ref' || col.type === 'RefList') && col.visibleCol
  )

  if (visibleColColumns.length === 0) return

  // Query table columns to get colRefs
  const columnsResponse = await client.get<{
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
    const visibleColService = new VisibleColService(client)
    await visibleColService.setupBatch(setupParams)
  }
}

function buildWidgetOptions(updates: Record<string, unknown>): Record<string, unknown> | undefined {
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

async function getColumnType(
  client: ToolContext['client'],
  docId: string,
  tableId: string,
  colId: string
): Promise<string> {
  const columns = await client.get<{
    columns: Array<{ id: string; fields: { type: string } }>
  }>(`/docs/${docId}/tables/${tableId}/columns`)

  const column = columns.columns.find((c) => c.id === colId)
  if (!column) {
    throw new Error(`Column "${colId}" not found in table "${tableId}"`)
  }
  return column.fields.type
}

async function getSummaryTableIdFromSection(
  client: ToolContext['client'],
  docId: string,
  sectionRef: number
): Promise<string> {
  const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
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

async function removePageAndTabBar(
  client: ToolContext['client'],
  docId: string,
  viewRef: number
): Promise<void> {
  const queryResponse = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
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
    await client.post<ApplyResponse>(`/docs/${docId}/apply`, removeActions, {
      schema: ApplyResponseSchema,
      context: 'Removing page/tabBar for summary table'
    })
  }
}

async function renameView(
  client: ToolContext['client'],
  docId: string,
  viewRef: number,
  sourceTable: string,
  groupByColumns: string[]
): Promise<void> {
  const viewName = `Summary: ${sourceTable} by ${groupByColumns.join(', ')}`
  await client.post<ApplyResponse>(
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
async function maybeDeleteEmptyTable1(client: ToolContext['client'], docId: string): Promise<void> {
  try {
    // Check if Table1 exists
    const tablesResp = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT tableId FROM _grist_Tables WHERE tableId = 'Table1'`
    })
    if (tablesResp.records.length === 0) return

    // Check for records
    const recordsResp = await client.get<{ records: unknown[] }>(
      `/docs/${docId}/tables/Table1/records?limit=1`
    )
    if (recordsResp.records.length > 0) return

    // Check for custom columns (beyond default A, B, C)
    const columnsResp = await client.get<{ columns: Array<{ id: string }> }>(
      `/docs/${docId}/tables/Table1/columns`
    )
    const defaultCols = new Set(['A', 'B', 'C'])
    const hasCustomCols = columnsResp.columns.some(
      (c) => !c.id.startsWith('gristHelper_') && !defaultCols.has(c.id)
    )
    if (hasCustomCols) return

    // Safe to delete - use RemoveTable UserAction
    await client.post<ApplyResponse>(`/docs/${docId}/apply`, [['RemoveTable', 'Table1']], {
      schema: ApplyResponseSchema,
      context: 'Auto-removing empty Table1'
    })
  } catch (error) {
    // Best-effort cleanup - log for debugging but don't fail the operation
    log.debug(
      'Failed to auto-remove empty Table1',
      { docId },
      error instanceof Error ? error : undefined
    )
  }
}

// =============================================================================
// Tool Definition (Factory Pattern)
// =============================================================================

export const MANAGE_SCHEMA_TOOL = defineBatchTool<
  typeof ManageSchemaSchema,
  SchemaOperation,
  GenericOperationResult,
  GenericBatchResponse
>({
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

  getOperations: (params) => params.operations,
  getDocId: (params) => params.docId,
  getActionName: (operation) => operation.action,

  executeOperation(ctx, docId, operation, _index) {
    return executeSingleOperation(ctx, docId, operation)
  },

  buildSuccessResponse(docId, results, params) {
    return {
      success: true,
      docId,
      operationsCompleted: params.operations.length,
      results,
      message: `Successfully completed ${params.operations.length} schema operation(s)`
    }
  },

  buildFailureResponse(docId, failedIndex, failedOperation, completedResults, errorMessage) {
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
  },

  // biome-ignore lint/suspicious/useAwait: Factory type requires async return
  async afterExecute(result, _params, _ctx) {
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
  },

  docs: {
    overview:
      'Batch schema operations: tables (create/rename/delete), columns (add/modify/remove), and summary tables. Ref columns need refTable. Summary tables auto-named {Source}_summary_{GroupBy}.',
    parameters:
      'FORMULAS: Python expressions with $ColName refs. Examples: "$Price * $Qty", "$Due - TODAY()", "SUM($group.Amount)". Set isFormula:true for computed, false for defaults. ' +
      'CHOICE STYLING: Use choiceOptions: {"High": {fillColor: "#FF0000", textColor: "#FFFFFF"}}. ' +
      'DATE FORMATS: YYYY-MM-DD, MMM D YYYY, DD/MM/YYYY (Moment.js tokens). TIME: HH:mm, h:mm A.',
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
                { colId: 'Name', type: 'Text' },
                { colId: 'Status', type: 'Choice', choices: ['Active', 'Inactive'] }
              ]
            }
          ]
        }
      },
      {
        desc: 'Add column and create summary table',
        input: {
          docId: 'abc123',
          operations: [
            { action: 'add_column', tableId: 'Sales', column: { colId: 'Region', type: 'Text' } },
            { action: 'create_summary', sourceTable: 'Sales', groupByColumns: ['Region'] }
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
})

export function manageSchema(context: ToolContext, params: ManageSchemaInput) {
  return MANAGE_SCHEMA_TOOL.handler(context, params)
}

// Export tools array for registry
export const MANAGE_SCHEMA_TOOLS: ReadonlyArray<ToolDefinition> = [MANAGE_SCHEMA_TOOL] as const
