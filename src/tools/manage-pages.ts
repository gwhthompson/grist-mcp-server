/**
 * Consolidated page and widget management tool.
 *
 * Operations:
 * - Layout: create_page (declarative), set_layout, get_layout
 * - Metadata: rename_page, delete_page, reorder_pages
 * - Config: configure_widget
 */

import { reorderPages as reorderPagesOp } from '../domain/operations/pages.js'
import type { ToolContext, ToolDefinition } from '../registry/types.js'
import { ApplyResponseSchema } from '../schemas/api-responses.js'
import type {
  GenericBatchResponse,
  GenericOperationResult
} from '../schemas/batch-operation-schemas.js'
import {
  type ManagePagesInput,
  ManagePagesOutputSchema,
  ManagePagesSchema,
  type PageOperation
} from '../schemas/page-operations.js'
import {
  buildLinkActions,
  executeCreatePage,
  executeGetLayout,
  executeSetLayout,
  type ResolvedLink,
  resolveLink,
  type WidgetId,
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

export {
  type ManagePagesInput,
  ManagePagesSchema,
  type PageOperation,
  PageRefSchema
} from '../schemas/page-operations.js'

// =============================================================================
// Batch Context
// =============================================================================

/** Per-batch context tracking page renames and caching page info. */
interface PagesBatchContext {
  /** Maps old page name → new name for in-flight renames */
  readonly renames: Map<string, string>
  /** Caches page info lookups within the batch */
  readonly pageInfo: Map<string, { id: number; viewRef: number; pagePos: number }>
}

function createBatchContext(): PagesBatchContext {
  return { renames: new Map(), pageInfo: new Map() }
}

/**
 * Module-level batch context, reset before each batch execution.
 * Threaded explicitly through the operation chain as a parameter.
 */
let batchContext: PagesBatchContext = createBatchContext()

// =============================================================================
// Helper Functions for Operations
// =============================================================================

/**
 * Execute a single page operation.
 */
function executeSingleOperation(
  ctx: ToolContext,
  docId: string,
  op: PageOperation,
  batch: PagesBatchContext
): Promise<GenericOperationResult> {
  switch (op.action) {
    case 'create_page':
      return executeCreatePageOp(ctx, docId, op)
    case 'set_layout':
      return executeSetLayoutOp(ctx, docId, op, batch)
    case 'get_layout':
      return executeGetLayoutOp(ctx, docId, op, batch)
    case 'rename_page':
      return executeRenamePage(ctx, docId, op, batch)
    case 'delete_page':
      return executeDeletePage(ctx, docId, op, batch)
    case 'reorder_pages':
      return executeReorderPagesOp(ctx, docId, op)
    case 'configure_widget':
      return executeConfigureWidget(ctx, docId, op, batch)
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
  op: Extract<PageOperation, { action: 'set_layout' }>,
  batch: PagesBatchContext
): Promise<GenericOperationResult> {
  const { client } = ctx

  // Resolve page
  const viewId =
    typeof op.page === 'number'
      ? op.page
      : (await resolvePageName(client, docId, op.page, batch)).viewRef

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
  op: Extract<PageOperation, { action: 'get_layout' }>,
  batch: PagesBatchContext
): Promise<GenericOperationResult> {
  const { client } = ctx

  // Resolve page
  const viewId =
    typeof op.page === 'number'
      ? op.page
      : (await resolvePageName(client, docId, op.page, batch)).viewRef

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
  op: Extract<PageOperation, { action: 'rename_page' }>,
  batch: PagesBatchContext
): Promise<GenericOperationResult> {
  const { client } = ctx
  const page = await resolvePageName(client, docId, op.page, batch)

  // Track rename in batch context
  batch.renames.set(op.page, op.newName)
  batch.pageInfo.set(op.newName, page)

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
  op: Extract<PageOperation, { action: 'delete_page' }>,
  batch: PagesBatchContext
): Promise<GenericOperationResult> {
  const { client } = ctx
  const page = await resolvePageName(client, docId, op.page, batch)
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
  op: Extract<PageOperation, { action: 'configure_widget' }>,
  batch: PagesBatchContext
): Promise<GenericOperationResult> {
  const { client } = ctx
  const page = await resolvePageName(client, docId, op.page, batch)
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
  pageName: string,
  batch: PagesBatchContext
): Promise<{ id: number; viewRef: number; pagePos: number }> {
  // Check for in-flight rename
  const newNameFromRename = batch.renames.get(pageName)
  if (newNameFromRename) {
    throw new Error(
      `Page "${pageName}" was renamed to "${newNameFromRename}" in an earlier operation. ` +
        `Use "${newNameFromRename}" instead.`
    )
  }

  // Check cache
  const cached = batch.pageInfo.get(pageName)
  if (cached) {
    return cached
  }

  // Fetch from database
  const page = await getPageByName(client, docId, pageName)
  batch.pageInfo.set(pageName, page)
  return page
}

/** Parse a sort spec string into its components */
interface ParsedSortItem {
  isDescending: boolean
  columnPart: string
  flagsPart: string
}

function parseSortString(item: string): ParsedSortItem {
  const isDescending = item.startsWith('-')
  const withoutPrefix = isDescending ? item.slice(1) : item
  const colonIndex = withoutPrefix.indexOf(':')

  return {
    isDescending,
    columnPart: colonIndex >= 0 ? withoutPrefix.slice(0, colonIndex) : withoutPrefix,
    flagsPart: colonIndex >= 0 ? withoutPrefix.slice(colonIndex) : ''
  }
}

/** Format a resolved column ref with sign and flags */
function formatSortResult(
  colRef: number,
  isDescending: boolean,
  flagsPart: string
): number | string {
  const signedColRef = isDescending ? -colRef : colRef
  return flagsPart ? `${signedColRef}${flagsPart}` : signedColRef
}

/** Check if a string represents a numeric column ref */
function isNumericColumnRef(columnPart: string): boolean {
  const numericValue = Number(columnPart)
  return !Number.isNaN(numericValue) && columnPart.trim() !== ''
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
      continue
    }

    const parsed = parseSortString(item)

    if (isNumericColumnRef(parsed.columnPart)) {
      const colRef = Number(parsed.columnPart)
      resolved.push(formatSortResult(colRef, parsed.isDescending, parsed.flagsPart))
    } else {
      const colRef = await resolveColumnNameToColRef(client, docId, tableId, parsed.columnPart)
      resolved.push(formatSortResult(colRef, parsed.isDescending, parsed.flagsPart))
    }
  }

  return resolved
}

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

  // biome-ignore lint/suspicious/useAwait: Factory type requires async return
  async beforeExecute() {
    // Create fresh batch context for page name tracking across operations
    batchContext = createBatchContext()
  },

  executeOperation(ctx, docId, operation, _index) {
    return executeSingleOperation(ctx, docId, operation, batchContext)
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

  // biome-ignore lint/suspicious/useAwait: Factory type requires async return
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
      'Declarative page layouts with cols/rows splits. create_page returns sectionIds; use link_widgets to connect. Actions: create_page, set_layout, link_widgets, rename/delete/reorder pages.',
    parameters:
      'LINK TYPES (in link object, source auto-populated): ' +
      'child_of {target_column} - master→detail via Ref. ' +
      'matched_by {source_column, target_column} - match column values. ' +
      'detail_of {} - summary→source records. ' +
      'breakdown_of {} - coarse→fine summary. ' +
      'listed_in {source_column} - RefList display. ' +
      'synced_with {} - cursor sync (same table). ' +
      'referenced_by {source_column} - follow Ref cursor. ' +
      'CHARTS: bar/pie/line/area/donut with x_axis + y_axis[]. ' +
      'OPTIONS by type: bar (multiseries, stacked, orientation), line (lineConnectGaps, lineMarkers), pie/donut (showTotal, donutHoleSize).',
    examples: [
      {
        desc: 'Create page with two widgets',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'create_page',
              name: 'Dashboard',
              layout: { cols: [{ table: 'Companies', widget: 'grid' }, { table: 'Contacts' }] }
            }
          ]
        }
      },
      {
        desc: 'Link widgets (master-detail)',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'link_widgets',
              viewId: 42,
              links: [
                { source: 101, target: 102, link: { type: 'child_of', target_column: 'Company' } }
              ]
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

export function managePages(context: ToolContext, params: ManagePagesInput) {
  return MANAGE_PAGES_TOOL.handler(context, params)
}

// Export tools array for registry
export const MANAGE_PAGES_TOOLS: ReadonlyArray<ToolDefinition> = [MANAGE_PAGES_TOOL] as const
