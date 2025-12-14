/**
 * Consolidated page and widget management tool.
 *
 * Consolidates grist_build_page, grist_configure_widget, and grist_update_page
 * into a single batched operations interface.
 *
 * Benefits:
 * - ~75% reduction in tools/list token usage for page operations
 * - Batch multiple page/widget operations in a single API call
 * - Consistent interface for all page/widget CRUD operations
 *
 * Operations:
 * - Pages: create, rename, delete, reorder
 * - Widgets: add, remove, configure, link
 */

import { z } from 'zod'
import { type ToolContext, type ToolDefinition, WRITE_SAFE_ANNOTATIONS } from '../registry/types.js'
import { ApplyResponseSchema } from '../schemas/api-responses.js'
import { DocIdSchema, ResponseFormatSchema } from '../schemas/common.js'
import { toGristWidgetType, UserWidgetTypeSchema } from '../schemas/pages-widgets.js'
import { validateWidgetLink } from '../services/link-validator.js'
import {
  buildCreateViewSectionAction,
  buildHorizontalSplitLayout,
  buildLeafLayout,
  buildUpdateLayoutAction,
  buildVerticalSplitLayout,
  processCreateViewSectionResults,
  serializeSortSpec
} from '../services/pages-builder.js'
import { buildViewSectionUpdate, ViewSectionService } from '../services/view-section.js'
import {
  getPageByName,
  resolveColumnNameToColRef,
  resolveWidgetNameToSectionId
} from '../services/widget-resolver.js'
import type { SectionId, ViewId } from '../types/advanced.js'
import type { ApplyResponse, LayoutSpec, SQLQueryResponse, UserAction } from '../types.js'
import { first } from '../utils/array-helpers.js'
import { extractFields } from '../utils/grist-field-extractor.js'
import { validateRetValues } from '../validators/apply-response.js'
import { GristTool } from './base/GristTool.js'
import { fetchWidgetTableMetadata, getFirstSectionId } from './pages/shared.js'

// Use registered UserWidgetTypeSchema from pages-widgets.ts
const WidgetTypeSchema = UserWidgetTypeSchema

// =============================================================================
// Page Operation Schemas
// =============================================================================

const CreatePageOperationSchema = z
  .object({
    action: z.literal('create_page'),
    name: z.string().min(1).max(100).describe('Page name'),
    widgets: z
      .array(
        z
          .object({
            table: z.string().min(1).describe('Table name for widget data'),
            type: WidgetTypeSchema.default('grid').describe('Widget type'),
            title: z.string().optional().describe('Widget title'),
            chartType: z
              .enum(['bar', 'pie', 'line', 'area', 'scatter', 'kaplan_meier', 'donut'])
              .optional()
              .describe('Required when type is "chart"')
          })
          .refine((w) => w.type !== 'chart' || w.chartType, {
            message: 'chartType is required when type is "chart"'
          })
      )
      .min(1)
      .max(10)
      .describe('Widgets to create on the page')
  })
  .describe('Create a new page with widgets')

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
// Widget Operation Schemas
// =============================================================================

const AddWidgetOperationSchema = z
  .object({
    action: z.literal('add_widget'),
    page: z.string().min(1).describe('Page name'),
    table: z.string().min(1).describe('Table name for widget data'),
    type: WidgetTypeSchema.default('grid').describe('Widget type'),
    title: z.string().optional().describe('Widget title'),
    position: z.enum(['bottom', 'right', 'replace']).default('bottom').describe('Position on page')
  })
  .describe('Add a widget to an existing page')

const RemoveWidgetOperationSchema = z
  .object({
    action: z.literal('remove_widget'),
    page: z.string().min(1).describe('Page name'),
    widget: z.string().min(1).describe('Widget title to remove')
  })
  .describe('Remove a widget from a page')

const ConfigureWidgetOperationSchema = z
  .object({
    action: z.literal('configure_widget'),
    page: z.string().min(1).describe('Page name'),
    widget: z.string().min(1).describe('Widget title'),
    title: z.string().optional().describe('New title'),
    sortBy: z
      .array(z.union([z.number(), z.string()]))
      .optional()
      .describe('Sort columns')
  })
  .describe('Configure widget properties')

const LinkWidgetsOperationSchema = z
  .object({
    action: z.literal('link_widgets'),
    page: z.string().min(1).describe('Page name'),
    target: z.string().min(1).describe('Target widget to filter'),
    source: z.string().min(1).describe('Source widget providing selection'),
    linkColumn: z.string().optional().describe('Column for linking (e.g., reference column)')
  })
  .describe('Link two widgets for master-detail relationship')

// =============================================================================
// Discriminated Union and Main Schema
// =============================================================================

const PageOperationSchema = z.discriminatedUnion('action', [
  CreatePageOperationSchema,
  RenamePageOperationSchema,
  DeletePageOperationSchema,
  ReorderPagesOperationSchema,
  AddWidgetOperationSchema,
  RemoveWidgetOperationSchema,
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
  details: Record<string, unknown>
  error?: string
}

interface ManagePagesResponse {
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

export class ManagePagesTool extends GristTool<typeof ManagePagesSchema, ManagePagesResponse> {
  // Track page renames within batch for atomicity
  private pageNameMap = new Map<string, string>()
  private pageInfoCache = new Map<string, { id: number; viewRef: number; pagePos: number }>()

  constructor(context: ToolContext) {
    super(context, ManagePagesSchema)
  }

  protected async executeInternal(params: ManagePagesInput): Promise<ManagePagesResponse> {
    // Reset batch state
    this.pageNameMap.clear()
    this.pageInfoCache.clear()

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
      message: `Successfully completed ${params.operations.length} page operation(s)`
    }
  }

  private async executeOperation(docId: string, op: PageOperation): Promise<OperationResult> {
    switch (op.action) {
      case 'create_page':
        return this.executeCreatePage(docId, op)
      case 'rename_page':
        return this.executeRenamePage(docId, op)
      case 'delete_page':
        return this.executeDeletePage(docId, op)
      case 'reorder_pages':
        return this.executeReorderPages(docId, op)
      case 'add_widget':
        return this.executeAddWidget(docId, op)
      case 'remove_widget':
        return this.executeRemoveWidget(docId, op)
      case 'configure_widget':
        return this.executeConfigureWidget(docId, op)
      case 'link_widgets':
        return this.executeLinkWidgets(docId, op)
    }
  }

  // ---------------------------------------------------------------------------
  // Page Operations
  // ---------------------------------------------------------------------------

  private async executeCreatePage(
    docId: string,
    op: Extract<PageOperation, { action: 'create_page' }>
  ): Promise<OperationResult> {
    // Get table refs for all widgets
    const tableRefs = new Map<string, number>()
    for (const widget of op.widgets) {
      if (!tableRefs.has(widget.table)) {
        const tableResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
          sql: 'SELECT id FROM _grist_Tables WHERE tableId = ?',
          args: [widget.table]
        })
        if (tableResp.records.length === 0) {
          throw new Error(`Table "${widget.table}" not found`)
        }
        const record = first(tableResp.records, `Table ${widget.table}`)
        const fields = extractFields(record)
        tableRefs.set(widget.table, fields.id as number)
      }
    }

    // Create first widget to get the view
    const firstWidget = op.widgets[0]
    if (!firstWidget) {
      throw new Error('At least one widget is required')
    }
    const firstTableRef = tableRefs.get(firstWidget.table)
    if (!firstTableRef) {
      throw new Error(`Table "${firstWidget.table}" not found`)
    }
    const widgetType = toGristWidgetType(firstWidget.type)

    const createAction = buildCreateViewSectionAction(
      firstTableRef,
      0, // viewRef=0 creates a new page
      widgetType,
      null,
      null
    )

    const createResp = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [createAction],
      {
        schema: ApplyResponseSchema,
        context: `Creating page "${op.name}"`
      }
    )

    validateRetValues(createResp, { context: `Creating page "${op.name}"` })
    const results = processCreateViewSectionResults(createResp.retValues)
    const firstResult = results[0] as { viewRef: number; sectionRef: number }
    const viewRef = firstResult.viewRef
    const firstSectionId = firstResult.sectionRef

    // Rename the page
    const renameAction: UserAction = ['UpdateRecord', '_grist_Views', viewRef, { name: op.name }]
    await this.client.post<ApplyResponse>(`/docs/${docId}/apply`, [renameAction], {
      schema: ApplyResponseSchema,
      context: `Renaming page to "${op.name}"`
    })

    // Set title for first widget if provided
    if (firstWidget.title) {
      await this.client.post<ApplyResponse>(
        `/docs/${docId}/apply`,
        [['UpdateRecord', '_grist_Views_section', firstSectionId, { title: firstWidget.title }]],
        { schema: ApplyResponseSchema, context: `Setting widget title` }
      )
    }

    // Set initial layoutSpec for first widget - critical for proper positioning
    // Without this, getLayoutSpec returns empty {} and subsequent widgets position incorrectly
    const initialLayout = buildLeafLayout(firstSectionId)
    await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [buildUpdateLayoutAction(viewRef, initialLayout)],
      { schema: ApplyResponseSchema, context: `Setting initial layout` }
    )

    // Create additional widgets
    for (let i = 1; i < op.widgets.length; i++) {
      const widget = op.widgets[i]
      if (!widget) continue
      const tableRef = tableRefs.get(widget.table)
      if (!tableRef) continue
      const type = toGristWidgetType(widget.type)

      const addAction = buildCreateViewSectionAction(tableRef, viewRef, type, null, null)
      const addResp = await this.client.post<ApplyResponse>(`/docs/${docId}/apply`, [addAction], {
        schema: ApplyResponseSchema,
        context: `Adding widget for "${widget.table}"`
      })

      validateRetValues(addResp, { context: `Adding widget` })
      const addResults = processCreateViewSectionResults(addResp.retValues)
      const newSectionId = (addResults[0] as { sectionRef: number }).sectionRef

      // Update layout
      const service = new ViewSectionService(this.client)
      const layoutSpecStr = await service.getLayoutSpec(docId, viewRef as ViewId)
      const currentLayout = JSON.parse(layoutSpecStr || '{}') as LayoutSpec

      const newLayout = buildVerticalSplitLayout(
        getFirstSectionId(currentLayout),
        newSectionId,
        0.5
      )
      await this.client.post<ApplyResponse>(
        `/docs/${docId}/apply`,
        [buildUpdateLayoutAction(viewRef, newLayout)],
        { schema: ApplyResponseSchema, context: `Updating layout` }
      )

      // Set title if provided
      if (widget.title) {
        await this.client.post<ApplyResponse>(
          `/docs/${docId}/apply`,
          [['UpdateRecord', '_grist_Views_section', newSectionId, { title: widget.title }]],
          { schema: ApplyResponseSchema, context: `Setting widget title` }
        )
      }
    }

    return {
      action: 'create_page',
      success: true,
      details: {
        pageName: op.name,
        viewId: viewRef,
        widgetsCreated: op.widgets.length
      }
    }
  }

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
    const actions: UserAction[] = [['BulkRemoveRecord', '_grist_Pages', [page.id]]]
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
        actions.push(['RemoveTable', tableId])
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
    const actions: UserAction[] = []

    for (let i = 0; i < op.order.length; i++) {
      const pageName = op.order[i]
      if (!pageName) continue
      const page = await this.resolvePageName(docId, pageName)
      actions.push(['UpdateRecord', '_grist_Pages', page.id, { pagePos: i + 1 }])
    }

    await this.client.post<ApplyResponse>(`/docs/${docId}/apply`, actions, {
      schema: ApplyResponseSchema,
      context: `Reordering ${op.order.length} pages`
    })

    return {
      action: 'reorder_pages',
      success: true,
      details: {
        new_order: op.order
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Widget Operations
  // ---------------------------------------------------------------------------

  private async executeAddWidget(
    docId: string,
    op: Extract<PageOperation, { action: 'add_widget' }>
  ): Promise<OperationResult> {
    const page = await this.resolvePageName(docId, op.page)

    // Get table ref
    const tableResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: 'SELECT id FROM _grist_Tables WHERE tableId = ?',
      args: [op.table]
    })
    if (tableResp.records.length === 0) {
      throw new Error(`Table "${op.table}" not found`)
    }
    const tableRef = (first(tableResp.records, `Table ${op.table}`) as { id: number }).id

    // Get current layout
    const service = new ViewSectionService(this.client)
    const layoutSpecStr = await service.getLayoutSpec(docId, page.viewRef as ViewId)
    const currentLayout = JSON.parse(layoutSpecStr || '{}') as LayoutSpec

    // Create widget
    const widgetType = toGristWidgetType(op.type)
    const createAction = buildCreateViewSectionAction(
      tableRef,
      page.viewRef,
      widgetType,
      null,
      null
    )
    const createResp = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [createAction],
      {
        schema: ApplyResponseSchema,
        context: `Adding widget to "${op.page}"`
      }
    )

    validateRetValues(createResp, { context: `Adding widget` })
    const results = processCreateViewSectionResults(createResp.retValues)
    const newSectionId = (results[0] as { sectionRef: number }).sectionRef

    // Build new layout
    let newLayout: LayoutSpec
    const firstSectionId = getFirstSectionId(currentLayout)
    if (op.position === 'replace') {
      newLayout = buildLeafLayout(newSectionId)
    } else if (op.position === 'right') {
      newLayout = buildHorizontalSplitLayout(firstSectionId, newSectionId, 0.5)
    } else {
      newLayout = buildVerticalSplitLayout(firstSectionId, newSectionId, 0.5)
    }

    const updateActions: UserAction[] = [buildUpdateLayoutAction(page.viewRef, newLayout)]
    if (op.title) {
      updateActions.push([
        'UpdateRecord',
        '_grist_Views_section',
        newSectionId,
        { title: op.title }
      ])
    }

    await this.client.post<ApplyResponse>(`/docs/${docId}/apply`, updateActions, {
      schema: ApplyResponseSchema,
      context: `Updating layout and widget title`
    })

    return {
      action: 'add_widget',
      success: true,
      details: {
        page: op.page,
        table: op.table,
        sectionId: newSectionId
      }
    }
  }

  private async executeRemoveWidget(
    docId: string,
    op: Extract<PageOperation, { action: 'remove_widget' }>
  ): Promise<OperationResult> {
    const page = await this.resolvePageName(docId, op.page)
    const sectionId = await resolveWidgetNameToSectionId(
      this.client,
      docId,
      page.viewRef,
      op.widget
    )

    // Delete widget
    await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [['BulkRemoveRecord', '_grist_Views_section', [sectionId]]],
      {
        schema: ApplyResponseSchema,
        context: `Removing widget "${op.widget}"`
      }
    )

    // Rebuild layout with remaining widgets
    const remainingWidgets = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: 'SELECT id FROM _grist_Views_section WHERE parentId = ? AND id != ? LIMIT 1',
      args: [page.viewRef, sectionId]
    })

    if (remainingWidgets.records.length > 0) {
      const remainingSectionId = (
        first(remainingWidgets.records, 'Remaining widget') as { id: number }
      ).id
      const newLayout = buildLeafLayout(remainingSectionId)
      await this.client.post<ApplyResponse>(
        `/docs/${docId}/apply`,
        [buildUpdateLayoutAction(page.viewRef, newLayout)],
        { schema: ApplyResponseSchema, context: `Updating layout` }
      )
    }

    return {
      action: 'remove_widget',
      success: true,
      details: {
        page: op.page,
        widget: op.widget,
        sectionId: sectionId
      }
    }
  }

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

  private async executeLinkWidgets(
    docId: string,
    op: Extract<PageOperation, { action: 'link_widgets' }>
  ): Promise<OperationResult> {
    const page = await this.resolvePageName(docId, op.page)

    const targetSectionId = await resolveWidgetNameToSectionId(
      this.client,
      docId,
      page.viewRef,
      op.target
    )
    const sourceSectionId = await resolveWidgetNameToSectionId(
      this.client,
      docId,
      page.viewRef,
      op.source
    )

    const metadata = await fetchWidgetTableMetadata(this.client, docId, [
      sourceSectionId,
      targetSectionId
    ])
    const sourceColRef = 0
    let targetColRef = 0

    if (op.linkColumn) {
      const targetMetadata = metadata.get(targetSectionId)
      if (targetMetadata) {
        targetColRef = await resolveColumnNameToColRef(
          this.client,
          docId,
          targetMetadata.tableId,
          op.linkColumn
        )
      }
    }

    // Validate link
    await validateWidgetLink(
      this.client,
      docId,
      sourceSectionId,
      targetSectionId,
      sourceColRef,
      targetColRef
    )

    // Update target widget with link
    const service = new ViewSectionService(this.client)
    const existing = await service.getViewSection(docId, targetSectionId as SectionId)
    const updatePayload = buildViewSectionUpdate(existing, {
      linkSrcSectionRef: sourceSectionId,
      linkSrcColRef: sourceColRef,
      linkTargetColRef: targetColRef
    })

    await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [['UpdateRecord', '_grist_Views_section', targetSectionId, updatePayload]],
      {
        schema: ApplyResponseSchema,
        context: `Linking widgets`
      }
    )

    // Verify the link was actually persisted
    const verifiedSection = await service.getViewSection(docId, targetSectionId as SectionId)
    if (verifiedSection.linkSrcSectionRef !== sourceSectionId) {
      throw new Error(
        `Widget linking failed: linkSrcSectionRef was not persisted. ` +
          `Expected ${sourceSectionId}, got ${verifiedSection.linkSrcSectionRef}. ` +
          `This may indicate incompatible widget types or Grist rejected the link configuration.`
      )
    }

    return {
      action: 'link_widgets',
      success: true,
      details: {
        page: op.page,
        target: op.target,
        source: op.source,
        link_column: op.linkColumn,
        verified: {
          linkSrcSectionRef: verifiedSection.linkSrcSectionRef,
          linkSrcColRef: verifiedSection.linkSrcColRef,
          linkTargetColRef: verifiedSection.linkTargetColRef
        }
      }
    }
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

export const ManagePagesOutputSchema = z.object({
  success: z.boolean(),
  docId: z.string(),
  operationsCompleted: z.number(),
  results: z.array(
    z.object({
      action: z.string(),
      success: z.boolean(),
      details: z.record(z.string(), z.unknown()),
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

export const MANAGE_PAGES_TOOL: ToolDefinition = {
  name: 'grist_manage_pages',
  title: 'Manage Pages',
  description: 'Create/rename/delete pages, add/remove/configure widgets, link widgets',
  purpose: 'Page and widget operations',
  category: 'document_structure',
  inputSchema: ManagePagesSchema,
  outputSchema: ManagePagesOutputSchema,
  annotations: WRITE_SAFE_ANNOTATIONS,
  handler: managePages,
  docs: {
    overview:
      'Batch page and widget operations. Pages: create, rename, delete, reorder. ' +
      'Widgets: add, remove, configure (title, sorting), link for master-detail.',
    examples: [
      {
        desc: 'Create page with widgets',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'create_page',
              name: 'Dashboard',
              widgets: [
                { table: 'Summary', type: 'chart', title: 'Overview' },
                { table: 'Details', type: 'grid', title: 'Transactions' }
              ]
            }
          ]
        }
      },
      {
        desc: 'Link widgets',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'link_widgets',
              page: 'Dashboard',
              target: 'Transactions',
              source: 'Overview',
              linkColumn: 'CategoryRef'
            }
          ]
        }
      },
      {
        desc: 'Reorder and rename',
        input: {
          docId: 'abc123',
          operations: [
            { action: 'rename_page', page: 'Old Name', newName: 'New Name' },
            { action: 'reorder_pages', order: ['Dashboard', 'New Name', 'Settings'] }
          ]
        }
      },
      {
        desc: 'Add widget and configure',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'add_widget',
              page: 'Dashboard',
              table: 'Sales',
              type: 'grid',
              title: 'Recent Sales',
              position: 'right'
            },
            {
              action: 'configure_widget',
              page: 'Dashboard',
              widget: 'Recent Sales',
              sortBy: ['-Date', 'Amount']
            }
          ]
        }
      }
    ],
    errors: [
      { error: 'Page not found', solution: 'Check page name (case-sensitive)' },
      { error: 'Table not found', solution: 'Use grist_get_tables to list tables' },
      { error: 'Widget not found', solution: 'Use widget title as shown in Grist UI' },
      { error: 'Partial failure', solution: 'Check partial_failure.operation_index' }
    ]
  }
}
