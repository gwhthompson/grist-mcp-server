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
import { type ToolContext, type ToolDefinition, WRITE_SAFE_ANNOTATIONS } from '../registry/types.js'
import { ApplyResponseSchema } from '../schemas/api-responses.js'
import {
  createBatchOutputSchema,
  GenericOperationResultSchema
} from '../schemas/batch-operation-schemas.js'
import { DocIdSchema, ResponseFormatSchema } from '../schemas/common.js'
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
import { BatchOperationTool } from './base/BatchOperationTool.js'
import { fetchWidgetTableMetadata } from './pages/shared.js'
import { nextSteps } from './utils/next-steps.js'

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
    name: z.string().min(1).max(100).describe('Page name'),
    layout: LayoutNodeSchema.describe('Declarative layout with widgets and arrangement')
  })
  .describe('Create a new page with declarative layout')

const SetLayoutOperationSchema = z
  .object({
    action: z.literal('set_layout'),
    page: PageRefSchema.describe('Page name or viewId'),
    layout: LayoutNodeSchema.describe(
      'New layout (must include all existing widgets or remove them)'
    ),
    remove: z
      .array(z.number().int().positive())
      .optional()
      .describe('Section IDs to remove from the page')
  })
  .describe('Update page layout. All existing widgets must be in layout or remove array.')

const GetLayoutOperationSchema = z
  .object({
    action: z.literal('get_layout'),
    page: PageRefSchema.describe('Page name or viewId')
  })
  .describe('Get page layout in declarative format')

// =============================================================================
// Metadata Operation Schemas
// =============================================================================

const RenamePageOperationSchema = z
  .object({
    action: z.literal('rename_page'),
    page: z.string().min(1).describe('Current page name'),
    newName: z.string().min(1).max(100).describe('New page name')
  })
  .describe('Rename an existing page')

const DeletePageOperationSchema = z
  .object({
    action: z.literal('delete_page'),
    page: z.string().min(1).describe('Page name to delete'),
    deleteData: z.boolean().default(false).describe('Also delete underlying tables (DESTRUCTIVE)')
  })
  .describe('Delete a page and optionally its data')

const ReorderPagesOperationSchema = z
  .object({
    action: z.literal('reorder_pages'),
    order: z.array(z.string().min(1)).min(1).describe('Page names in desired order')
  })
  .describe('Reorder pages in navigation')

// =============================================================================
// Config Operation Schema
// =============================================================================

const ConfigureWidgetOperationSchema = z
  .object({
    action: z.literal('configure_widget'),
    page: z.string().min(1).describe('Page name'),
    widget: z.string().min(1).describe('Widget title'),
    title: z.string().optional().describe('New title'),
    sortBy: z
      .array(z.union([z.number(), z.string()]))
      .optional()
      .describe('Sort columns (e.g., ["-Date", "Amount"])')
  })
  .describe('Configure widget properties (title, sorting)')

// =============================================================================
// Link Operation Schema (Architecture B)
// =============================================================================

/**
 * Link specification for connecting two widgets.
 * Both source and target must be sectionIds from the same page.
 */
const LinkSpecSchema = z
  .object({
    source: WidgetIdSchema.describe('Source widget sectionId'),
    target: WidgetIdSchema.describe('Target widget sectionId to configure link on'),
    link: LinkSchema.describe('Link type and configuration')
  })
  .describe('Specification for linking two widgets')

/**
 * Architecture B: Separate operation for configuring widget links.
 *
 * Use after create_page/set_layout to establish relationships between widgets.
 * All widget references use real sectionIds from previous responses.
 */
const LinkWidgetsOperationSchema = z
  .object({
    action: z.literal('link_widgets'),
    viewId: z.number().int().positive().describe('Page viewId containing the widgets'),
    links: z.array(LinkSpecSchema).min(1).max(20).describe('Links to establish between widgets')
  })
  .describe('Configure links between widgets on a page. Use sectionIds from create_page response.')

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
  operations: z
    .array(PageOperationSchema)
    .min(1)
    .max(20)
    .describe('Page/widget operations to perform in sequence'),
  response_format: ResponseFormatSchema
})

export type ManagePagesInput = z.infer<typeof ManagePagesSchema>
export type PageOperation = z.infer<typeof PageOperationSchema>

// =============================================================================
// Response Types
// =============================================================================

interface OperationResult {
  action: string
  success: boolean
  verified?: boolean
  details: Record<string, unknown>
  error?: string
}

interface ManagePagesResponse {
  success: boolean
  docId: string
  operationsCompleted: number
  results: OperationResult[]
  message: string
  partialFailure?: {
    operationIndex: number
    error: string
    completedOperations: number
  }
  nextSteps?: string[]
}

// =============================================================================
// Tool Implementation
// =============================================================================

export class ManagePagesTool extends BatchOperationTool<
  typeof ManagePagesSchema,
  PageOperation,
  OperationResult,
  ManagePagesResponse
> {
  // Track page renames within batch for atomicity
  private pageNameMap = new Map<string, string>()
  private pageInfoCache = new Map<string, { id: number; viewRef: number; pagePos: number }>()

  constructor(context: ToolContext) {
    super(context, ManagePagesSchema)
  }

  protected getOperations(params: ManagePagesInput): PageOperation[] {
    return params.operations
  }

  protected getDocId(params: ManagePagesInput): string {
    return params.docId
  }

  protected getActionName(operation: PageOperation): string {
    return operation.action
  }

  protected async executeOperation(
    docId: string,
    operation: PageOperation,
    _index: number
  ): Promise<OperationResult> {
    return this.executeSingleOperation(docId, operation)
  }

  protected async executeInternal(params: ManagePagesInput): Promise<ManagePagesResponse> {
    // Reset batch state before executing operations
    this.pageNameMap.clear()
    this.pageInfoCache.clear()

    // Delegate to parent's batch execution
    return super.executeInternal(params)
  }

  protected buildSuccessResponse(
    docId: string,
    results: OperationResult[],
    params: ManagePagesInput
  ): ManagePagesResponse {
    return {
      success: true,
      docId,
      operationsCompleted: params.operations.length,
      results,
      message: `Successfully completed ${params.operations.length} page operation(s)`
    }
  }

  protected buildFailureResponse(
    docId: string,
    failedIndex: number,
    failedOperation: PageOperation,
    completedResults: OperationResult[],
    errorMessage: string,
    _params: ManagePagesInput
  ): ManagePagesResponse {
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
    result: ManagePagesResponse,
    _params: ManagePagesInput
  ): Promise<ManagePagesResponse> {
    const pageCreates = result.results.filter((r) => r.action === 'create_page')
    const pageRenames = result.results.filter((r) => r.action === 'rename_page')
    const pageDeletes = result.results.filter((r) => r.action === 'delete_page')
    const reorderOps = result.results.filter((r) => r.action === 'reorder_pages')
    const configureOps = result.results.filter((r) => r.action === 'configure_widget')
    const linkOps = result.results.filter((r) => r.action === 'link_widgets')
    const getLayouts = result.results.filter((r) => r.action === 'get_layout')

    const firstCreate = pageCreates[0]
    const firstRename = pageRenames[0]

    const builder = nextSteps()

    if (result.partialFailure) {
      builder
        .add(`Fix error: ${result.partialFailure.error}`)
        .add(`Resume from operation index ${result.partialFailure.operationIndex}`)
    } else if (result.success) {
      // After create_page, suggest linking widgets (only if no link ops and multiple widgets)
      builder.addIfFn(pageCreates.length > 0 && linkOps.length === 0, () => {
        const viewId = firstCreate?.details.viewId as number
        const sectionIds = firstCreate?.details.sectionIds as number[]
        if (viewId && sectionIds && sectionIds.length > 1) {
          return `Use link_widgets with viewId=${viewId} and sectionIds=[${sectionIds.join(', ')}] to connect widgets`
        }
        return ''
      })

      builder
        .addIf(
          pageRenames.length > 0,
          `Use get_layout to verify page "${firstRename?.details.newName}" configuration`
        )
        .addIf(
          pageDeletes.length > 0,
          'Use get_layout on remaining pages to verify document structure'
        )
        .addIf(
          reorderOps.length > 0,
          'Page order updated. Navigate through pages to verify new order'
        )
        .addIf(
          configureOps.length > 0,
          'Use grist_get_records to verify widget displays data with new configuration'
        )
        .addIf(
          linkOps.length > 0,
          'Use grist_manage_records to add test data and verify links work correctly'
        )
        .addIf(
          getLayouts.length > 0,
          'Use set_layout to modify the layout, or configure_widget to adjust sorting'
        )
    }

    return { ...result, nextSteps: builder.build() }
  }

  private async executeSingleOperation(docId: string, op: PageOperation): Promise<OperationResult> {
    switch (op.action) {
      case 'create_page':
        return this.executeCreatePage(docId, op)
      case 'set_layout':
        return this.executeSetLayout(docId, op)
      case 'get_layout':
        return this.executeGetLayout(docId, op)
      case 'rename_page':
        return this.executeRenamePage(docId, op)
      case 'delete_page':
        return this.executeDeletePage(docId, op)
      case 'reorder_pages':
        return this.executeReorderPages(docId, op)
      case 'configure_widget':
        return this.executeConfigureWidget(docId, op)
      case 'link_widgets':
        return this.executeLinkWidgets(docId, op)
    }
  }

  // ---------------------------------------------------------------------------
  // Layout Operations
  // ---------------------------------------------------------------------------

  private async executeCreatePage(
    docId: string,
    op: Extract<PageOperation, { action: 'create_page' }>
  ): Promise<OperationResult> {
    const result = await executeCreatePage(
      this.client,
      docId,
      op.name,
      op.layout,
      async (tableId: string) => {
        const tableResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
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

  private async executeSetLayout(
    docId: string,
    op: Extract<PageOperation, { action: 'set_layout' }>
  ): Promise<OperationResult> {
    // Resolve page
    const viewId =
      typeof op.page === 'number' ? op.page : (await this.resolvePageName(docId, op.page)).viewRef

    const result = await executeSetLayout(
      this.client,
      docId,
      viewId,
      op.layout,
      op.remove ?? [],
      async (tableId: string) => {
        const tableResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
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
        const widgetsResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
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

  private async executeGetLayout(
    docId: string,
    op: Extract<PageOperation, { action: 'get_layout' }>
  ): Promise<OperationResult> {
    // Resolve page
    const viewId =
      typeof op.page === 'number' ? op.page : (await this.resolvePageName(docId, op.page)).viewRef

    const result = await executeGetLayout(this.client, docId, viewId)

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

  private async executeRenamePage(
    docId: string,
    op: Extract<PageOperation, { action: 'rename_page' }>
  ): Promise<OperationResult> {
    const page = await this.resolvePageName(docId, op.page)

    // Track rename
    this.pageNameMap.set(op.page, op.newName)
    this.pageInfoCache.set(op.newName, page)

    await this.client.post<ApplyResponse>(
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

  private async executeDeletePage(
    docId: string,
    op: Extract<PageOperation, { action: 'delete_page' }>
  ): Promise<OperationResult> {
    const page = await this.resolvePageName(docId, op.page)
    const actions: Array<['BulkRemoveRecord' | 'RemoveTable', string, number[] | string]> = [
      ['BulkRemoveRecord', '_grist_Pages', [page.id]]
    ]
    const deletedTables: string[] = []

    if (op.deleteData) {
      const tablesResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
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

    await this.client.post<ApplyResponse>(`/docs/${docId}/apply`, actions, {
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

  private async executeReorderPages(
    docId: string,
    op: Extract<PageOperation, { action: 'reorder_pages' }>
  ): Promise<OperationResult> {
    const result = await reorderPagesOp(this.context, docId, op.order)
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

  private async executeConfigureWidget(
    docId: string,
    op: Extract<PageOperation, { action: 'configure_widget' }>
  ): Promise<OperationResult> {
    const page = await this.resolvePageName(docId, op.page)
    const sectionId = await resolveWidgetNameToSectionId(
      this.client,
      docId,
      page.viewRef,
      op.widget
    )

    const service = new ViewSectionService(this.client)
    const existing = await service.getViewSection(docId, sectionId as SectionId)
    const updates: Record<string, unknown> = {}

    if (op.title !== undefined) {
      updates.title = op.title
    }

    if (op.sortBy !== undefined) {
      // Get table for column resolution
      const metadata = await fetchWidgetTableMetadata(this.client, docId, [sectionId])
      const tableMetadata = metadata.get(sectionId)
      if (!tableMetadata) {
        throw new Error(`Could not find table for widget "${op.widget}"`)
      }

      const resolvedSortSpec = await this.resolveSortSpec(docId, tableMetadata.tableId, op.sortBy)
      updates.sortColRefs = serializeSortSpec(resolvedSortSpec)
    }

    if (Object.keys(updates).length > 0) {
      const updatePayload = buildViewSectionUpdate(existing, updates)
      await this.client.post<ApplyResponse>(
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
  private async executeLinkWidgets(
    docId: string,
    op: Extract<PageOperation, { action: 'link_widgets' }>
  ): Promise<OperationResult> {
    const { viewId, links } = op

    // Phase 1: Validate all widgets exist on the page
    const widgetsOnPage = await this.fetchWidgetsOnPage(docId, viewId)
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
      const summaryCheck = await isSummaryTable(this.client, docId, info.tableRef)
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
        this.client,
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
      await this.client.post<ApplyResponse>(`/docs/${docId}/apply`, actions, {
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
  private async fetchWidgetsOnPage(
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
    const response = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
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
  // Helper Methods
  // ---------------------------------------------------------------------------

  private async resolvePageName(
    docId: string,
    pageName: string
  ): Promise<{ id: number; viewRef: number; pagePos: number }> {
    // Check for in-flight rename
    const newNameFromRename = this.pageNameMap.get(pageName)
    if (newNameFromRename) {
      throw new Error(
        `Page "${pageName}" was renamed to "${newNameFromRename}" in an earlier operation. ` +
          `Use "${newNameFromRename}" instead.`
      )
    }

    // Check cache
    const cached = this.pageInfoCache.get(pageName)
    if (cached) {
      return cached
    }

    // Fetch from database
    const page = await getPageByName(this.client, docId, pageName)
    this.pageInfoCache.set(pageName, page)
    return page
  }

  private async resolveSortSpec(
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
          const colRef = await resolveColumnNameToColRef(this.client, docId, tableId, columnPart)
          const signedColRef = isDescending ? -colRef : colRef
          resolved.push(flagsPart ? `${signedColRef}${flagsPart}` : signedColRef)
        }
      }
    }

    return resolved
  }
}

export async function managePages(context: ToolContext, params: ManagePagesInput) {
  const tool = new ManagePagesTool(context)
  return tool.execute(params)
}

// =============================================================================
// Output Schema
// =============================================================================

export const ManagePagesOutputSchema = createBatchOutputSchema(GenericOperationResultSchema)

// =============================================================================
// Tool Definition
// =============================================================================

export const MANAGE_PAGES_TOOL: ToolDefinition = {
  name: 'grist_manage_pages',
  title: 'Manage Pages',
  description:
    'Declarative page layouts with widget arrangement and linking. ' +
    'Also: rename/delete/reorder pages, configure widget sorting.',
  purpose: 'Page layout and management',
  category: 'document_structure',
  inputSchema: ManagePagesSchema,
  outputSchema: ManagePagesOutputSchema,
  annotations: WRITE_SAFE_ANNOTATIONS,
  handler: managePages,
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
}
