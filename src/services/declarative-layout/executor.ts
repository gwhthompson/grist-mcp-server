/**
 * Executor for declarative layout operations.
 *
 * Orchestrates the complete workflow:
 * 1. Parse and validate layout
 * 2. Create new widgets (if any)
 * 3. Build and apply LayoutSpec
 * 4. Configure widget links
 */

import { toGristWidgetType } from '../../schemas/pages-widgets.js'
import type { ApplyResponse, LayoutSpec } from '../../types.js'
import type { GristClient } from '../grist-client.js'
import {
  buildCreateViewSectionAction,
  buildUpdateLayoutAction,
  processCreateViewSectionResults
} from '../pages-builder.js'
import { isSummaryTable } from '../summary-table-resolver.js'
import { formatGetLayoutResult } from './from-layout-spec.js'
import type { ResolvedLink, WidgetInfo } from './link-resolver.js'
import { buildLinkActions, resolveLink } from './link-resolver.js'
import type { LayoutNode } from './schema.js'
import {
  collectExistingSectionIds,
  collectLocalIds,
  collectNewPanes,
  LayoutNodeSchema
} from './schema.js'
import { replacePlaceholders, toLayoutSpec } from './to-layout-spec.js'
import { WidgetRegistry } from './widget-registry.js'

// =============================================================================
// Types
// =============================================================================

export interface CreatePageResult {
  success: boolean
  viewId: number
  pageName: string
  widgetsCreated: number
  sectionIds: number[]
}

export interface SetLayoutResult {
  success: boolean
  viewId: number
  widgetsAdded: number
  widgetsRemoved: number
}

export interface GetLayoutResult {
  layout: LayoutNode
  widgets: Array<{
    section: number
    table: string
    widget: string
    title?: string
  }>
}

// =============================================================================
// Create Page Executor
// =============================================================================

/**
 * Execute create_page operation with declarative layout.
 */
export async function executeCreatePage(
  client: GristClient,
  docId: string,
  pageName: string,
  layout: LayoutNode,
  getTableRef: (tableId: string) => Promise<number>
): Promise<CreatePageResult> {
  // Phase 1: Validate and collect
  const validatedLayout = LayoutNodeSchema.parse(layout)
  collectLocalIds(validatedLayout) // Validates uniqueness, throws on duplicates

  const newPanes = collectNewPanes(validatedLayout)
  if (newPanes.length === 0) {
    throw new Error(
      'create_page requires at least one new widget definition. ' +
        'Use set_layout to rearrange existing widgets on an existing page.'
    )
  }

  // Validate tables exist
  const tableRefs = new Map<string, number>()
  for (const pane of newPanes) {
    if (!tableRefs.has(pane.table)) {
      const tableRef = await getTableRef(pane.table)
      tableRefs.set(pane.table, tableRef)
    }
  }

  // Phase 2: Transform to LayoutSpec
  const {
    layoutSpec: preliminarySpec,
    newWidgets,
    placeholderMap
    // Note: existingWidgetLinks is not used for create_page since all widgets are new
  } = toLayoutSpec(validatedLayout)

  // Phase 3: Create widgets
  const registry = new WidgetRegistry()
  const placeholderToSectionId = new Map<number, number>()
  let viewRef: number | null = null
  const sectionIds: number[] = []

  for (const [i, widget] of newWidgets.entries()) {
    const tableRef = tableRefs.get(widget.table)
    if (tableRef === undefined) {
      throw new Error(`Table ref not found for "${widget.table}"`)
    }
    const widgetType = toGristWidgetType(widget.widget)

    // First widget creates the page (viewRef=0)
    const targetViewRef = viewRef ?? 0

    const action = buildCreateViewSectionAction(
      tableRef,
      targetViewRef,
      widgetType,
      null, // groupbyColRefs
      null // tableId
    )

    const response = await client.post<ApplyResponse>(`/docs/${docId}/apply`, [action])
    const results = processCreateViewSectionResults(response.retValues)
    const result = results[0]

    if (!result || !result.sectionRef) {
      throw new Error(`Failed to create widget for table "${widget.table}"`)
    }

    // First widget's viewRef becomes our page
    if (viewRef === null) {
      viewRef = result.viewRef
    }

    // Register the widget
    registry.register(result.sectionRef, widget.id)
    sectionIds.push(result.sectionRef)

    // Map placeholder to real ID
    for (const [placeholder, index] of placeholderMap) {
      if (index === i) {
        placeholderToSectionId.set(placeholder, result.sectionRef)
      }
    }

    // Queue link if present
    if (widget.link) {
      registry.queueLink(result.sectionRef, widget.link, widget.table)
    }

    // Set title if specified
    if (widget.title) {
      await client.post(`/docs/${docId}/apply`, [
        ['UpdateRecord', '_grist_Views_section', result.sectionRef, { title: widget.title }]
      ])
    }

    // Set chart type if chart widget
    if (widget.widget === 'chart' && widget.chartType) {
      await client.post(`/docs/${docId}/apply`, [
        [
          'UpdateRecord',
          '_grist_Views_section',
          result.sectionRef,
          {
            chartType: widget.chartType
          }
        ]
      ])
    }
  }

  // Phase 4: Apply layout
  // viewRef is guaranteed to be set since we validated newWidgets.length > 0
  if (viewRef === null) {
    throw new Error('Internal error: viewRef should be set after widget creation')
  }

  const finalLayoutSpec = replacePlaceholders(preliminarySpec, placeholderToSectionId)
  await client.post(`/docs/${docId}/apply`, [
    buildUpdateLayoutAction(viewRef, finalLayoutSpec),
    ['UpdateRecord', '_grist_Views', viewRef, { name: pageName }]
  ])

  // Phase 5: Configure links
  await configureLinks(client, docId, registry, viewRef)

  return {
    success: true,
    viewId: viewRef,
    pageName,
    widgetsCreated: newWidgets.length,
    sectionIds
  }
}

// =============================================================================
// Set Layout Executor
// =============================================================================

/**
 * Execute set_layout operation on an existing page.
 */
export async function executeSetLayout(
  client: GristClient,
  docId: string,
  viewId: number,
  layout: LayoutNode,
  removeWidgets: number[],
  getTableRef: (tableId: string) => Promise<number>,
  getExistingWidgets: () => Promise<Map<number, { tableId: string; tableRef: number }>>
): Promise<SetLayoutResult> {
  // Phase 1: Validate layout
  const validatedLayout = LayoutNodeSchema.parse(layout)
  collectLocalIds(validatedLayout)

  // Phase 2: Get existing widgets and validate
  const existingWidgets = await getExistingWidgets()
  const existingSectionIds = new Set(existingWidgets.keys())

  // Check referenced sections exist
  const referencedIds = collectExistingSectionIds(validatedLayout)
  for (const id of referencedIds) {
    if (!existingSectionIds.has(id)) {
      throw new Error(
        `Section ${id} not found on page. ` +
          `Available sections: ${[...existingSectionIds].join(', ')}`
      )
    }
  }

  // Check for orphaned widgets (not in layout and not in remove list)
  const removeSet = new Set(removeWidgets)
  for (const id of existingSectionIds) {
    if (!referencedIds.has(id) && !removeSet.has(id)) {
      throw new Error(
        `Section ${id} exists on page but is not in layout or remove list. ` +
          `Either include it in the layout or add it to the remove array.`
      )
    }
  }

  // Phase 3: Remove widgets
  if (removeWidgets.length > 0) {
    const removeActions = removeWidgets.map((sectionId) => [
      'RemoveRecord',
      '_grist_Views_section',
      sectionId
    ])
    await client.post(`/docs/${docId}/apply`, removeActions)
  }

  // Phase 4: Create new widgets
  const _newPanes = collectNewPanes(validatedLayout)
  const registry = new WidgetRegistry()
  const placeholderToSectionId = new Map<number, number>()

  // Register existing widgets
  for (const id of existingSectionIds) {
    if (!removeSet.has(id)) {
      registry.register(id)
    }
  }

  // Transform layout
  const {
    layoutSpec: preliminarySpec,
    newWidgets,
    existingWidgetLinks,
    placeholderMap
  } = toLayoutSpec(validatedLayout)

  // Create new widgets
  for (const [i, widget] of newWidgets.entries()) {
    const tableRef = await getTableRef(widget.table)
    const widgetType = toGristWidgetType(widget.widget)

    const action = buildCreateViewSectionAction(tableRef, viewId, widgetType, null, null)

    const response = await client.post<ApplyResponse>(`/docs/${docId}/apply`, [action])
    const results = processCreateViewSectionResults(response.retValues)
    const result = results[0]

    if (!result || !result.sectionRef) {
      throw new Error(`Failed to create widget for table "${widget.table}"`)
    }

    registry.register(result.sectionRef, widget.id)

    for (const [placeholder, index] of placeholderMap) {
      if (index === i) {
        placeholderToSectionId.set(placeholder, result.sectionRef)
      }
    }

    if (widget.link) {
      registry.queueLink(result.sectionRef, widget.link, widget.table)
    }

    if (widget.title) {
      await client.post(`/docs/${docId}/apply`, [
        ['UpdateRecord', '_grist_Views_section', result.sectionRef, { title: widget.title }]
      ])
    }

    if (widget.widget === 'chart' && widget.chartType) {
      await client.post(`/docs/${docId}/apply`, [
        ['UpdateRecord', '_grist_Views_section', result.sectionRef, { chartType: widget.chartType }]
      ])
    }
  }

  // Phase 5: Apply layout
  const finalLayoutSpec = replacePlaceholders(preliminarySpec, placeholderToSectionId)
  await client.post(`/docs/${docId}/apply`, [buildUpdateLayoutAction(viewId, finalLayoutSpec)])

  // Phase 6: Configure links
  for (const { sectionId, link } of existingWidgetLinks) {
    const info = existingWidgets.get(sectionId)
    if (info) {
      registry.queueLink(sectionId, link, info.tableId)
    }
  }

  await configureLinks(client, docId, registry, viewId)

  return {
    success: true,
    viewId,
    widgetsAdded: newWidgets.length,
    widgetsRemoved: removeWidgets.length
  }
}

// =============================================================================
// Get Layout Executor
// =============================================================================

/**
 * Execute get_layout operation.
 */
export async function executeGetLayout(
  client: GristClient,
  docId: string,
  viewId: number
): Promise<GetLayoutResult> {
  // Get layout spec from _grist_Views
  const viewResponse = await client.post<{ records: Array<{ fields: Record<string, unknown> }> }>(
    `/docs/${docId}/sql`,
    {
      sql: `SELECT layoutSpec FROM _grist_Views WHERE id = ?`,
      args: [viewId]
    }
  )

  const viewRecord = viewResponse.records[0]
  if (!viewRecord) {
    throw new Error(`Page with viewId ${viewId} not found`)
  }

  const layoutSpecJson = viewRecord.fields.layoutSpec as string
  const layoutSpec: LayoutSpec = layoutSpecJson
    ? JSON.parse(layoutSpecJson)
    : { type: 'leaf', leaf: 0 }

  // Get widget metadata
  const widgetsResponse = await client.post<{
    records: Array<{ fields: Record<string, unknown> }>
  }>(`/docs/${docId}/sql`, {
    sql: `
        SELECT
          vs.id as sectionId,
          t.tableId,
          vs.parentKey as widgetType,
          vs.title,
          vs.linkSrcSectionRef,
          vs.linkSrcColRef,
          vs.linkTargetColRef
        FROM _grist_Views_section vs
        JOIN _grist_Tables t ON vs.tableRef = t.id
        WHERE vs.parentId = ?
      `,
    args: [viewId]
  })

  const widgetsMap = new Map<
    number,
    {
      sectionId: number
      tableId: string
      widgetType: string
      title?: string
      linkSrcSectionRef?: number
      linkSrcColRef?: number
      linkTargetColRef?: number
    }
  >()

  for (const record of widgetsResponse.records) {
    const f = record.fields
    widgetsMap.set(f.sectionId as number, {
      sectionId: f.sectionId as number,
      tableId: f.tableId as string,
      widgetType: f.widgetType as string,
      title: f.title as string | undefined,
      linkSrcSectionRef: f.linkSrcSectionRef as number | undefined,
      linkSrcColRef: f.linkSrcColRef as number | undefined,
      linkTargetColRef: f.linkTargetColRef as number | undefined
    })
  }

  return formatGetLayoutResult(layoutSpec, widgetsMap)
}

// =============================================================================
// Link Configuration Helper
// =============================================================================

async function configureLinks(
  client: GristClient,
  docId: string,
  registry: WidgetRegistry,
  _viewId: number
): Promise<void> {
  const pendingLinks = registry.getPendingLinks()
  if (pendingLinks.length === 0) return

  const resolvedLinks: Array<{ sectionId: number; resolved: ResolvedLink }> = []

  // Helper to get widget info
  const getWidgetInfo = async (sectionId: number): Promise<WidgetInfo> => {
    const response = await client.post<{ records: Array<{ fields: Record<string, unknown> }> }>(
      `/docs/${docId}/sql`,
      {
        sql: `
          SELECT
            vs.id as sectionId,
            t.tableId,
            vs.tableRef,
            vs.parentKey as widgetType
          FROM _grist_Views_section vs
          JOIN _grist_Tables t ON vs.tableRef = t.id
          WHERE vs.id = ?
        `,
        args: [sectionId]
      }
    )

    const record = response.records[0]
    if (!record) {
      throw new Error(`Widget ${sectionId} not found`)
    }

    const f = record.fields
    const tableId = f.tableId as string
    const summaryCheck = await isSummaryTable(client, docId, f.tableRef as number)

    return {
      sectionId: f.sectionId as number,
      tableId,
      tableRef: f.tableRef as number,
      widgetType: f.widgetType as string,
      isSummaryTable: summaryCheck
    }
  }

  // Resolve all links
  for (const { sectionId, link, tableId } of pendingLinks) {
    const resolved = await resolveLink(
      client,
      docId,
      sectionId,
      tableId,
      link,
      registry,
      getWidgetInfo
    )
    resolvedLinks.push({ sectionId, resolved })
  }

  // Build and execute actions
  const actions = buildLinkActions(resolvedLinks)
  if (actions.length > 0) {
    await client.post(`/docs/${docId}/apply`, actions)
  }

  registry.clearPendingLinks()
}
