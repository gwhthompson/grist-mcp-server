/**
 * Consolidated page and widget management tool.
 *
 * Operations:
 * - Layout: create_page (declarative), set_layout, get_layout
 * - Metadata: rename_page, delete_page, reorder_pages
 * - Config: configure_widget
 */

import { z } from 'zod'
import { reorderPages as reorderPagesOp } from '../domain/operations/pages.js'
import type { ToolContext, ToolDefinition } from '../registry/types.js'
import { ApplyResponseSchema } from '../schemas/api-responses.js'
import {
  createBatchOutputSchema,
  type GenericBatchResponse,
  type GenericOperationResult,
  GenericOperationResultSchema
} from '../schemas/batch-operation-schemas.js'
import { DocIdSchema, jsonSafeArray, ResponseFormatSchema } from '../schemas/common.js'
import {
  buildLinkActions,
  executeCreatePage,
  executeGetLayout,
  executeSetLayout,
  LayoutNodeSchema,
  LinkSchema,
  type ResolvedLink,
  resolveLink,
  type WidgetId,
  WidgetIdSchema,
  WidgetRegistry
} from '../services/declarative-layout/index.js'
import type { WidgetInfo as LinkWidgetInfo } from '../services/declarative-layout/link-resolver.js'
import { serializeSortSpec } from '../services/pages-builder.js'
import { isSummaryTable } from '../services/summary-table-resolver.js'
import { buildViewSectionUpdate, ViewSectionService } from '../services/view-section.js'
import {
  getPageByName,
  resolveColumnNameToColRef,
  resolveWidgetNameToSectionId
} from '../services/widget-resolver.js'
import type { SectionId } from '../types/advanced.js'
import type { ApplyResponse, SQLQueryResponse } from '../types.js'
import { first } from '../utils/array-helpers.js'
import { extractFields } from '../utils/grist-field-extractor.js'
import { defineBatchTool } from './factory/index.js'
import { fetchWidgetTableMetadata } from './pages/shared.js'
import { nextSteps } from './utils/next-steps.js'

// =============================================================================
// Batch State Management
// =============================================================================

/**
 * Batch state is used to track page renames and cache page info within a single batch execution.
 * Since the factory pattern doesn't have built-in state, we use module-level state
 * that gets reset when beforeExecute runs.
 */
let batchPageNameMap = new Map<string, string>()
let batchPageInfoCache = new Map<string, { id: number; viewRef: number; pagePos: number }>()

function resetBatchState(): void {
  batchPageNameMap = new Map()
  batchPageInfoCache = new Map()
}

// =============================================================================
// Shared Schemas
// =============================================================================

/** Page reference: name (string) or viewId (number) */
export const PageRefSchema = z.union([z.string().min(1), z.number().int().positive()])

// =============================================================================
// Layout Operation Schemas
// =============================================================================

const CreatePageOperationSchema = z
  .object({
    action: z.literal('create_page'),
    name: z.string().min(1).max(100),
    layout: LayoutNodeSchema
  })
  .describe('create page')

const SetLayoutOperationSchema = z
  .object({
    action: z.literal('set_layout'),
    page: PageRefSchema.describe('name or viewId'),
    layout: LayoutNodeSchema,
    remove: z.array(z.number().int().positive()).optional().describe('sectionIds to remove')
  })
  .describe('update layout')

const GetLayoutOperationSchema = z
  .object({
    action: z.literal('get_layout'),
    page: PageRefSchema.describe('name or viewId')
  })
  .describe('get layout')

// =============================================================================
// Metadata Operation Schemas
// =============================================================================

const RenamePageOperationSchema = z
  .object({
    action: z.literal('rename_page'),
    page: z.string().min(1),
    newName: z.string().min(1).max(100)
  })
  .describe('rename page')

const DeletePageOperationSchema = z
  .object({
    action: z.literal('delete_page'),
    page: z.string().min(1),
    deleteData: z.boolean().default(false).describe('also delete tables')
  })
  .describe('delete page')

const ReorderPagesOperationSchema = z
  .object({
    action: z.literal('reorder_pages'),
    order: z.array(z.string().min(1)).min(1).describe('page names in order')
  })
  .describe('reorder pages')

// =============================================================================
// Config Operation Schema
// =============================================================================

const ConfigureWidgetOperationSchema = z
  .object({
    action: z.literal('configure_widget'),
    page: z.string().min(1),
    widget: z.string().min(1).describe('widget title'),
    title: z.string().optional(),
    sortBy: z
      .array(z.union([z.number(), z.string()]))
      .optional()
      .describe('e.g. ["-Date", "Amount"]')
  })
  .describe('configure widget')

// =============================================================================
// Link Operation Schema (Architecture B)
// =============================================================================

/** Link specification for connecting two widgets */
const LinkSpecSchema = z
  .object({
    source: WidgetIdSchema,
    target: WidgetIdSchema,
    link: LinkSchema
  })
  .describe('widget link spec')

/** Architecture B: Configure widget links using sectionIds from create_page response */
const LinkWidgetsOperationSchema = z
  .object({
    action: z.literal('link_widgets'),
    viewId: z.number().int().positive(),
    links: z.array(LinkSpecSchema).min(1).max(20)
  })
  .describe('link widgets')

// =============================================================================
// Discriminated Union and Main Schema
// =============================================================================

const PageOperationSchema = z.discriminatedUnion('action', [
  CreatePageOperationSchema,
  SetLayoutOperationSchema,
  GetLayoutOperationSchema,
  RenamePageOperationSchema,
  DeletePageOperationSchema,
  ReorderPagesOperationSchema,
  ConfigureWidgetOperationSchema,
  LinkWidgetsOperationSchema
])

export const ManagePagesSchema = z.strictObject({
  docId: DocIdSchema,
  operations: jsonSafeArray(PageOperationSchema, { min: 1, max: 20 }),
  response_format: ResponseFormatSchema
})

export type ManagePagesInput = z.infer<typeof ManagePagesSchema>
export type PageOperation = z.infer<typeof PageOperationSchema>

// =============================================================================
// Response Types (using shared interfaces from batch-operation-schemas.ts)
// =============================================================================

// OperationResult → GenericOperationResult
// GenericBatchResponse → GenericBatchResponse

// =============================================================================
// Helper Functions for Operations
// =============================================================================

/**
 * Execute a single page operation.
 */
async function executeSingleOperation(
  ctx: ToolContext,
  docId: string,
  op: PageOperation
): Promise<GenericOperationResult> {
  switch (op.action) {
    case 'create_page':
      return executeCreatePageOp(ctx, docId, op)
    case 'set_layout':
      return executeSetLayoutOp(ctx, docId, op)
    case 'get_layout':
      return executeGetLayoutOp(ctx, docId, op)
    case 'rename_page':
      return executeRenamePage(ctx, docId, op)
    case 'delete_page':
      return executeDeletePage(ctx, docId, op)
    case 'reorder_pages':
      return executeReorderPagesOp(ctx, docId, op)
    case 'configure_widget':
      return executeConfigureWidget(ctx, docId, op)
    case 'link_widgets':
      return executeLinkWidgets(ctx, docId, op)
  }
}

// ---------------------------------------------------------------------------
// Layout Operations
// ---------------------------------------------------------------------------

async function executeCreatePageOp(
  ctx: ToolContext,
  docId: string,
  op: Extract<PageOperation, { action: 'create_page' }>
): Promise<GenericOperationResult> {
  const { client } = ctx

  const result = await executeCreatePage(
    client,
    docId,
    op.name,
    op.layout,
    async (tableId: string) => {
      const tableResp = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
        sql: 'SELECT id FROM _grist_Tables WHERE tableId = ?',
        args: [tableId]
      })
      if (tableResp.records.length === 0) {
        throw new Error(`Table "${tableId}" not found`)
      }
      const record = first(tableResp.records, `Table ${tableId}`)
      const fields = extractFields(record)
      return fields.id as number
    }
  )

  return {
    action: 'create_page',
    success: true,
    details: {
      pageName: result.pageName,
      viewId: result.viewId,
      widgetsCreated: result.widgetsCreated,
      sectionIds: result.sectionIds
    }
  }
}

async function executeSetLayoutOp(
  ctx: ToolContext,
  docId: string,
  op: Extract<PageOperation, { action: 'set_layout' }>
): Promise<GenericOperationResult> {
  const { client } = ctx

  // Resolve page
  const viewId =
    typeof op.page === 'number' ? op.page : (await resolvePageName(client, docId, op.page)).viewRef

  const result = await executeSetLayout(
    client,
    docId,
    viewId,
    op.layout,
    op.remove ?? [],
    async (tableId: string) => {
      const tableResp = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
        sql: 'SELECT id FROM _grist_Tables WHERE tableId = ?',
        args: [tableId]
      })
      if (tableResp.records.length === 0) {
        throw new Error(`Table "${tableId}" not found`)
      }
      const record = first(tableResp.records, `Table ${tableId}`)
      const fields = extractFields(record)
      return fields.id as number
    },
    async () => {
      // Get existing widgets on page
      const widgetsResp = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
        sql: `
          SELECT vs.id, t.tableId, vs.tableRef
          FROM _grist_Views_section vs
          JOIN _grist_Tables t ON vs.tableRef = t.id
          WHERE vs.parentId = ?
        `,
        args: [viewId]
      })

      const widgets = new Map<number, { tableId: string; tableRef: number }>()
      for (const record of widgetsResp.records) {
        const fields = extractFields(record)
        widgets.set(fields.id as number, {
          tableId: fields.tableId as string,
          tableRef: fields.tableRef as number
        })
      }
      return widgets
    }
  )

  return {
    action: 'set_layout',
    success: true,
    details: {
      viewId: result.viewId,
      widgetsAdded: result.widgetsAdded,
      widgetsRemoved: result.widgetsRemoved
    }
  }
}

async function executeGetLayoutOp(
  ctx: ToolContext,
  docId: string,
  op: Extract<PageOperation, { action: 'get_layout' }>
): Promise<GenericOperationResult> {
  const { client } = ctx

  // Resolve page
  const viewId =
    typeof op.page === 'number' ? op.page : (await resolvePageName(client, docId, op.page)).viewRef

  const result = await executeGetLayout(client, docId, viewId)

  return {
    action: 'get_layout',
    success: true,
    details: {
      layout: result.layout,
      widgets: result.widgets
    }
  }
}

// ---------------------------------------------------------------------------
// Metadata Operations
// ---------------------------------------------------------------------------

async function executeRenamePage(
  ctx: ToolContext,
  docId: string,
  op: Extract<PageOperation, { action: 'rename_page' }>
): Promise<GenericOperationResult> {
  const { client } = ctx
  const page = await resolvePageName(client, docId, op.page)

  // Track rename in batch state
  batchPageNameMap.set(op.page, op.newName)
  batchPageInfoCache.set(op.newName, page)

  await client.post<ApplyResponse>(
    `/docs/${docId}/apply`,
    [['UpdateRecord', '_grist_Views', page.viewRef, { name: op.newName }]],
    {
      schema: ApplyResponseSchema,
      context: `Renaming page "${op.page}" to "${op.newName}"`
    }
  )

  return {
    action: 'rename_page',
    success: true,
    details: {
      oldName: op.page,
      newName: op.newName
    }
  }
}

async function executeDeletePage(
  ctx: ToolContext,
  docId: string,
  op: Extract<PageOperation, { action: 'delete_page' }>
): Promise<GenericOperationResult> {
  const { client } = ctx
  const page = await resolvePageName(client, docId, op.page)
  const actions: Array<['BulkRemoveRecord' | 'RemoveTable', string, number[] | string]> = [
    ['BulkRemoveRecord', '_grist_Pages', [page.id]]
  ]
  const deletedTables: string[] = []

  if (op.deleteData) {
    const tablesResp = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `
        SELECT DISTINCT t.tableId
        FROM _grist_Views_section vs
        JOIN _grist_Tables t ON vs.tableRef = t.id
        WHERE vs.parentId = ?
      `,
      args: [page.viewRef]
    })

    for (const record of tablesResp.records) {
      const fields = extractFields(record)
      const tableId = fields.tableId as string
      actions.push(['RemoveTable', tableId, tableId])
      deletedTables.push(tableId)
    }
  }

  await client.post<ApplyResponse>(`/docs/${docId}/apply`, actions, {
    schema: ApplyResponseSchema,
    context: `Deleting page "${op.page}"`
  })

  return {
    action: 'delete_page',
    success: true,
    details: {
      pageName: op.page,
      pageId: page.id,
      ...(deletedTables.length > 0 && { deleted_tables: deletedTables })
    }
  }
}

async function executeReorderPagesOp(
  ctx: ToolContext,
  docId: string,
  op: Extract<PageOperation, { action: 'reorder_pages' }>
): Promise<GenericOperationResult> {
  const result = await reorderPagesOp(ctx, docId, op.order)
  return {
    action: 'reorder_pages',
    success: true,
    verified: result.verified,
    details: {
      new_order: result.newOrder,
      pagesReordered: result.count
    }
  }
}

// ---------------------------------------------------------------------------
// Config Operations
// ---------------------------------------------------------------------------

async function executeConfigureWidget(
  ctx: ToolContext,
  docId: string,
  op: Extract<PageOperation, { action: 'configure_widget' }>
): Promise<GenericOperationResult> {
  const { client } = ctx
  const page = await resolvePageName(client, docId, op.page)
  const sectionId = await resolveWidgetNameToSectionId(client, docId, page.viewRef, op.widget)

  const service = new ViewSectionService(client)
  const existing = await service.getViewSection(docId, sectionId as SectionId)
  const updates: Record<string, unknown> = {}

  if (op.title !== undefined) {
    updates.title = op.title
  }

  if (op.sortBy !== undefined) {
    // Get table for column resolution
    const metadata = await fetchWidgetTableMetadata(client, docId, [sectionId])
    const tableMetadata = metadata.get(sectionId)
    if (!tableMetadata) {
      throw new Error(`Could not find table for widget "${op.widget}"`)
    }

    const resolvedSortSpec = await resolveSortSpec(client, docId, tableMetadata.tableId, op.sortBy)
    updates.sortColRefs = serializeSortSpec(resolvedSortSpec)
  }

  if (Object.keys(updates).length > 0) {
    const updatePayload = buildViewSectionUpdate(existing, updates)
    await client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [['UpdateRecord', '_grist_Views_section', sectionId, updatePayload]],
      {
        schema: ApplyResponseSchema,
        context: `Configuring widget "${op.widget}"`
      }
    )
  }

  return {
    action: 'configure_widget',
    success: true,
    details: {
      page: op.page,
      widget: op.widget,
      updates: Object.keys(updates)
    }
  }
}

// ---------------------------------------------------------------------------
// Link Operations (Architecture B)
// ---------------------------------------------------------------------------

/**
 * Execute link_widgets operation.
 *
 * Architecture B: All widget references use real sectionIds from previous responses.
 * Validates that widgets exist on the specified page before applying links.
 */
async function executeLinkWidgets(
  ctx: ToolContext,
  docId: string,
  op: Extract<PageOperation, { action: 'link_widgets' }>
): Promise<GenericOperationResult> {
  const { client } = ctx
  const { viewId, links } = op

  // Phase 1: Validate all widgets exist on the page
  const widgetsOnPage = await fetchWidgetsOnPage(client, docId, viewId)
  const widgetMap = new Map(widgetsOnPage.map((w) => [w.sectionId, w]))

  // Collect all referenced sectionIds
  const referencedIds = new Set<number>()
  for (const linkSpec of links) {
    referencedIds.add(linkSpec.source)
    referencedIds.add(linkSpec.target)
  }

  // Validate all widgets exist on this page
  for (const sectionId of referencedIds) {
    if (!widgetMap.has(sectionId)) {
      throw new Error(
        `Widget ${sectionId} not found on page ${viewId}. ` +
          `Available widgets: ${[...widgetMap.keys()].join(', ')}`
      )
    }
  }

  // Phase 2: Set up registry with all widgets
  const registry = new WidgetRegistry()
  for (const w of widgetsOnPage) {
    registry.register(w.sectionId)
  }

  // Phase 3: Resolve and build link actions
  const resolvedLinks: Array<{ sectionId: number; resolved: ResolvedLink }> = []

  // Helper to get widget info
  const getWidgetInfo = async (sectionId: number): Promise<LinkWidgetInfo> => {
    const info = widgetMap.get(sectionId)
    if (!info) {
      throw new Error(`Widget ${sectionId} not found on page`)
    }
    const summaryCheck = await isSummaryTable(client, docId, info.tableRef)
    return {
      sectionId: info.sectionId,
      tableId: info.tableId,
      tableRef: info.tableRef,
      widgetType: info.widgetType,
      isSummaryTable: summaryCheck
    }
  }

  for (const linkSpec of links) {
    const targetInfo = widgetMap.get(linkSpec.target)
    if (!targetInfo) {
      throw new Error(`Target widget ${linkSpec.target} not found`)
    }

    // Update link source_widget to use the actual source sectionId
    const linkWithSource = {
      ...linkSpec.link,
      source_widget: linkSpec.source as WidgetId
    }

    const resolved = await resolveLink(
      client,
      docId,
      linkSpec.target,
      targetInfo.tableId,
      linkWithSource,
      registry,
      getWidgetInfo
    )
    resolvedLinks.push({ sectionId: linkSpec.target, resolved })
  }

  // Phase 4: Apply link actions
  const actions = buildLinkActions(resolvedLinks)
  if (actions.length > 0) {
    await client.post<ApplyResponse>(`/docs/${docId}/apply`, actions, {
      schema: ApplyResponseSchema,
      context: `Configuring ${links.length} widget link(s)`
    })
  }

  return {
    action: 'link_widgets',
    success: true,
    details: {
      viewId,
      linksConfigured: links.length,
      widgets: links.map((l) => ({
        source: l.source,
        target: l.target,
        type: l.link.type
      }))
    }
  }
}

/**
 * Fetch all widgets on a page with metadata needed for link resolution.
 */
async function fetchWidgetsOnPage(
  client: ToolContext['client'],
  docId: string,
  viewId: number
): Promise<
  Array<{
    sectionId: number
    tableId: string
    tableRef: number
    widgetType: string
  }>
> {
  const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
    sql: `
      SELECT
        vs.id as sectionId,
        t.tableId,
        vs.tableRef,
        vs.parentKey as widgetType
      FROM _grist_Views_section vs
      JOIN _grist_Tables t ON vs.tableRef = t.id
      WHERE vs.parentId = ?
    `,
    args: [viewId]
  })

  return response.records.map((record) => {
    const f = extractFields(record)
    return {
      sectionId: f.sectionId as number,
      tableId: f.tableId as string,
      tableRef: f.tableRef as number,
      widgetType: f.widgetType as string
    }
  })
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

async function resolvePageName(
  client: ToolContext['client'],
  docId: string,
  pageName: string
): Promise<{ id: number; viewRef: number; pagePos: number }> {
  // Check for in-flight rename
  const newNameFromRename = batchPageNameMap.get(pageName)
  if (newNameFromRename) {
    throw new Error(
      `Page "${pageName}" was renamed to "${newNameFromRename}" in an earlier operation. ` +
        `Use "${newNameFromRename}" instead.`
    )
  }

  // Check cache
  const cached = batchPageInfoCache.get(pageName)
  if (cached) {
    return cached
  }

  // Fetch from database
  const page = await getPageByName(client, docId, pageName)
  batchPageInfoCache.set(pageName, page)
  return page
}

async function resolveSortSpec(
  client: ToolContext['client'],
  docId: string,
  tableId: string,
  sortSpec: Array<number | string>
): Promise<Array<number | string>> {
  const resolved: Array<number | string> = []

  for (const item of sortSpec) {
    if (typeof item === 'number') {
      resolved.push(item)
    } else {
      const isDescending = item.startsWith('-')
      const withoutPrefix = isDescending ? item.slice(1) : item
      const colonIndex = withoutPrefix.indexOf(':')
      const columnPart = colonIndex >= 0 ? withoutPrefix.slice(0, colonIndex) : withoutPrefix
      const flagsPart = colonIndex >= 0 ? withoutPrefix.slice(colonIndex) : ''

      const numericValue = Number(columnPart)
      if (!Number.isNaN(numericValue) && columnPart.trim() !== '') {
        const colId = isDescending ? -numericValue : numericValue
        resolved.push(flagsPart ? `${colId}${flagsPart}` : colId)
      } else {
        const colRef = await resolveColumnNameToColRef(client, docId, tableId, columnPart)
        const signedColRef = isDescending ? -colRef : colRef
        resolved.push(flagsPart ? `${signedColRef}${flagsPart}` : signedColRef)
      }
    }
  }

  return resolved
}

// =============================================================================
// Output Schema
// =============================================================================

export const ManagePagesOutputSchema = createBatchOutputSchema(GenericOperationResultSchema)

// =============================================================================
// Tool Definition (Factory Pattern)
// =============================================================================

export const MANAGE_PAGES_TOOL = defineBatchTool<
  typeof ManagePagesSchema,
  PageOperation,
  GenericOperationResult,
  GenericBatchResponse
>({
  name: 'grist_manage_pages',
  title: 'Manage Pages',
  description:
    'Declarative page layouts with widget arrangement and linking. ' +
    'Also: rename/delete/reorder pages, configure widget sorting.',
  purpose: 'Page layout and management',
  category: 'document_structure',
  inputSchema: ManagePagesSchema,
  outputSchema: ManagePagesOutputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true, // Can delete pages
    idempotentHint: false,
    openWorldHint: true
  },

  getOperations: (params) => params.operations,
  getDocId: (params) => params.docId,
  getActionName: (operation) => operation.action,

  async beforeExecute() {
    // Reset batch state for page name tracking across operations
    resetBatchState()
  },

  async executeOperation(ctx, docId, operation, _index) {
    return executeSingleOperation(ctx, docId, operation)
  },

  buildSuccessResponse(docId, results, params) {
    const operationTypes = new Set(results.map((r) => r.action))
    const typeList = Array.from(operationTypes).join(', ')

    return {
      success: true,
      docId,
      operationsCompleted: params.operations.length,
      results,
      message: `Successfully completed ${params.operations.length} page operation(s): ${typeList}`
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
        action: failedOperation.action,
        error: errorMessage,
        completedOperations: failedIndex
      }
    }
  },

  async afterExecute(result, params, _ctx) {
    const createResults = result.results.filter((r) => r.action === 'create_page' && r.success)
    // Check if any create_page results have multiple widgets (sectionIds array)
    const linkablePages = createResults.filter((r) => {
      const details = r.details as { sectionIds?: number[]; viewId?: number } | undefined
      return details?.sectionIds && details.sectionIds.length > 1
    })

    const builder = nextSteps()

    if (result.partialFailure) {
      builder
        .add(`Fix error: ${result.partialFailure.error}`)
        .add(`Resume from operation index ${result.partialFailure.operationIndex}`)
    } else if (result.success) {
      const firstLinkable = linkablePages[0]
      if (firstLinkable) {
        const details = firstLinkable.details as { sectionIds: number[]; viewId: number }
        builder.add(
          `Use link_widgets with viewId=${details.viewId} and sectionIds ${JSON.stringify(details.sectionIds)} to connect widgets`
        )
      }
      builder.addIf(
        createResults.length > 0,
        `Use grist_get_records with docId="${params.docId}" to populate newly created pages`
      )
    }

    return { ...result, nextSteps: builder.build() }
  },

  docs: {
    overview:
      'Create pages with declarative layouts specifying widget arrangement (cols/rows splits). ' +
      'Use link_widgets to establish relationships between widgets after creation. ' +
      'Operations: create_page, set_layout, get_layout, link_widgets, rename_page, delete_page, reorder_pages, configure_widget.\n\n' +
      'ARCHITECTURE B (Two-Step Flow):\n' +
      '1. create_page returns sectionIds: { viewId: 42, sectionIds: [101, 102] }\n' +
      '2. link_widgets uses those sectionIds to establish links\n\n' +
      'LINK TYPE DECISION TABLE - Choose based on your data relationship:\n' +
      '┌─────────────┬──────────────────────────────────────────────────────────┐\n' +
      '│ Relationship│ Use This Link Type                                       │\n' +
      '├─────────────┼──────────────────────────────────────────────────────────┤\n' +
      '│ Foreign key │ child_of - Target has Ref column to source table         │\n' +
      '│             │ Example: Contacts.Company → Companies                    │\n' +
      '├─────────────┼──────────────────────────────────────────────────────────┤\n' +
      '│ Same lookup │ matched_by - Both reference same third table             │\n' +
      '│             │ Example: Both have Project column referencing Projects   │\n' +
      '├─────────────┼──────────────────────────────────────────────────────────┤\n' +
      '│ Summary→Raw │ detail_of - Click summary row, see grouped records       │\n' +
      '│             │ Source MUST be summary table                             │\n' +
      '├─────────────┼──────────────────────────────────────────────────────────┤\n' +
      '│ Summary→Sum │ breakdown_of - Drill into more detailed summary          │\n' +
      '│             │ BOTH must be summary tables (source less granular)       │\n' +
      '├─────────────┼──────────────────────────────────────────────────────────┤\n' +
      '│ RefList     │ listed_in - Show records in source RefList column        │\n' +
      '│             │ Source column MUST be RefList type                       │\n' +
      '├─────────────┼──────────────────────────────────────────────────────────┤\n' +
      '│ Same table  │ synced_with - Sync cursor position between widgets       │\n' +
      '│             │ BOTH widgets must show the same table                    │\n' +
      '├─────────────┼──────────────────────────────────────────────────────────┤\n' +
      '│ Follow ref  │ referenced_by - Cursor jumps to referenced record        │\n' +
      '│             │ Source column MUST be Ref pointing to target table       │\n' +
      '└─────────────┴──────────────────────────────────────────────────────────┘\n\n' +
      'LAYOUT CONSTRAINTS:\n' +
      '- cols/rows arrays need 2+ items (use weights for single-widget full-width)\n' +
      '- weight: controls relative size (default 1). weight:2 = twice as wide/tall\n' +
      '- set_layout: ALL existing widgets must appear in layout OR remove array\n' +
      '- Nesting: cols can contain rows, rows can contain cols (max 3 levels)\n\n' +
      'CHART CONFIGURATION:\n' +
      '- chartType: "bar", "pie", "line", "area", "kaplan_meier", "donut"\n' +
      '- x_axis: Column name for X-axis (categories)\n' +
      '- y_axis: Array of column names for Y-axis values\n' +
      '- For pie/donut: x_axis=labels, y_axis=[values]\n' +
      '- For bar/line: x_axis=categories, y_axis=series columns\n\n' +
      'RELATED TOOLS:\n' +
      '- Row rules: grist_manage_schema update_table with rowRules\n' +
      '- Column rules: grist_manage_schema modify_column with style.rulesOptions',
    examples: [
      {
        desc: 'Create page then link widgets (master-detail)',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'create_page',
              name: 'Company Dashboard',
              layout: {
                cols: [
                  { table: 'Companies', widget: 'grid' },
                  { table: 'Contacts', widget: 'card_list' }
                ]
              }
            }
          ]
        }
      },
      {
        desc: 'Link widgets using sectionIds from create_page response',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'link_widgets',
              viewId: 42,
              links: [
                {
                  source: 101,
                  target: 102,
                  link: { type: 'child_of', source_widget: 101, target_column: 'Company' }
                }
              ]
            }
          ]
        }
      },
      {
        desc: 'Create page with chart and configure axes',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'create_page',
              name: 'Sales Dashboard',
              layout: {
                cols: [
                  { table: 'Sales', widget: 'grid' },
                  {
                    table: 'Sales',
                    widget: 'chart',
                    chartType: 'bar',
                    x_axis: 'Region',
                    y_axis: ['Revenue', 'Cost']
                  }
                ]
              }
            }
          ]
        }
      },
      {
        desc: 'Get and modify layout',
        input: {
          docId: 'abc123',
          operations: [{ action: 'get_layout', page: 'Dashboard' }]
        }
      },
      {
        desc: 'Update layout with new widget',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'set_layout',
              page: 'Dashboard',
              layout: {
                rows: [
                  { cols: [5, 6] },
                  { table: 'Summary', widget: 'chart', chartType: 'bar', weight: 2 }
                ]
              }
            }
          ]
        }
      },
      {
        desc: 'Rename and reorder pages',
        input: {
          docId: 'abc123',
          operations: [
            { action: 'rename_page', page: 'Old Name', newName: 'New Name' },
            { action: 'reorder_pages', order: ['Dashboard', 'New Name', 'Settings'] }
          ]
        }
      },
      {
        desc: 'Configure widget sorting',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'configure_widget',
              page: 'Dashboard',
              widget: 'Transactions',
              sortBy: ['-Date', 'Amount']
            }
          ]
        }
      }
    ],
    errors: [
      { error: 'Page not found', solution: 'Check page name (case-sensitive)' },
      { error: 'Table not found', solution: 'Use grist_get_tables to list tables' },
      { error: 'Section not found', solution: 'Use get_layout to see widget section IDs' },
      {
        error: 'Widget not found on page',
        solution: 'Use sectionIds from create_page response for link_widgets'
      },
      {
        error: 'Orphaned widgets',
        solution: 'Include all existing widgets in layout or add to remove array'
      }
    ]
  }
})

export async function managePages(context: ToolContext, params: ManagePagesInput) {
  return MANAGE_PAGES_TOOL.handler(context, params)
}

// Export tools array for registry
export const MANAGE_PAGES_TOOLS: ReadonlyArray<ToolDefinition> = [MANAGE_PAGES_TOOL] as const
