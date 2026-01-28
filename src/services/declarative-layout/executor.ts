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
  buildChartConfigAction,
  buildCreateViewSectionAction,
  buildUpdateLayoutAction,
  configureChartAxes,
  processCreateViewSectionResults
} from '../pages-builder.js'
import { formatGetLayoutResult } from './from-layout-spec.js'
import type { LayoutNode, NewPane } from './schema.js'
import { collectExistingSectionIds, collectNewPanes, LayoutNodeSchema } from './schema.js'
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
// Widget Configuration Helper
// =============================================================================

/**
 * Configure a newly created widget with title and chart settings.
 * Consolidates duplicated logic from executeCreatePage and executeSetLayout.
 */
async function configureNewWidget(
  client: GristClient,
  docId: string,
  sectionRef: number,
  widget: NewPane
): Promise<void> {
  // Set title if specified
  if (widget.title) {
    await client.post(`/docs/${docId}/apply`, [
      ['UpdateRecord', '_grist_Views_section', sectionRef, { title: widget.title }]
    ])
  }

  // Configure chart widget (type, options, axes)
  if (widget.widget === 'chart' && widget.chartType) {
    // Set chart type and options
    const chartAction = buildChartConfigAction(
      sectionRef,
      widget.chartType,
      widget.chart_options ?? undefined
    )
    await client.post(`/docs/${docId}/apply`, [chartAction])

    // Configure chart axes if specified
    if (widget.x_axis || (widget.y_axis && widget.y_axis.length > 0)) {
      const axisActions = await configureChartAxes(
        client,
        docId,
        sectionRef,
        widget.table,
        widget.x_axis,
        widget.y_axis
      )
      if (axisActions.length > 0) {
        await client.post(`/docs/${docId}/apply`, axisActions)
      }
    }
  }
}

/** Result of creating widgets from layout */
interface CreateWidgetsResult {
  sectionIds: number[]
  placeholderToSectionId: Map<number, number>
  viewRef: number | null
}

/**
 * Create widgets from layout and return section IDs.
 * Shared between executeCreatePage and executeSetLayout.
 */
async function createWidgetsFromLayout(
  client: GristClient,
  docId: string,
  viewId: number | null,
  newWidgets: NewPane[],
  placeholderMap: Map<number, number>,
  getTableRef: (tableId: string) => Promise<number>,
  registry: WidgetRegistry
): Promise<CreateWidgetsResult> {
  const sectionIds: number[] = []
  const placeholderToSectionId = new Map<number, number>()
  let viewRef = viewId

  for (const [i, widget] of newWidgets.entries()) {
    const tableRef = await getTableRef(widget.table)
    const widgetType = toGristWidgetType(widget.widget)
    const targetViewRef = viewRef ?? 0

    const action = buildCreateViewSectionAction(tableRef, targetViewRef, widgetType, null, null)
    const response = await client.post<ApplyResponse>(`/docs/${docId}/apply`, [action])
    const results = processCreateViewSectionResults(response.retValues)
    const result = results[0]

    if (!result?.sectionRef) {
      throw new Error(`Failed to create widget for table "${widget.table}"`)
    }

    if (viewRef === null) {
      viewRef = result.viewRef
    }

    registry.register(result.sectionRef)
    sectionIds.push(result.sectionRef)

    // Map placeholder to real ID
    for (const [placeholder, index] of placeholderMap) {
      if (index === i) {
        placeholderToSectionId.set(placeholder, result.sectionRef)
      }
    }

    await configureNewWidget(client, docId, result.sectionRef, widget)
  }

  return { sectionIds, placeholderToSectionId, viewRef }
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
  const newPanes = collectNewPanes(validatedLayout)
  if (newPanes.length === 0) {
    throw new Error(
      'create_page requires at least one new widget definition. ' +
        'Use set_layout to rearrange existing widgets on an existing page.'
    )
  }

  // Phase 2: Transform to LayoutSpec
  const { layoutSpec: preliminarySpec, newWidgets, placeholderMap } = toLayoutSpec(validatedLayout)

  // Phase 3: Create widgets
  const registry = new WidgetRegistry()
  const { sectionIds, placeholderToSectionId, viewRef } = await createWidgetsFromLayout(
    client,
    docId,
    null, // No existing page
    newWidgets,
    placeholderMap,
    getTableRef,
    registry
  )

  if (viewRef === null) {
    throw new Error('Internal error: viewRef should be set after widget creation')
  }

  // Phase 4: Apply layout and name page
  const finalLayoutSpec = replacePlaceholders(preliminarySpec, placeholderToSectionId)
  await client.post(`/docs/${docId}/apply`, [
    buildUpdateLayoutAction(viewRef, finalLayoutSpec),
    ['UpdateRecord', '_grist_Views', viewRef, { name: pageName }]
  ])

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

/** Validate layout references and check for orphaned widgets */
function validateLayoutReferences(
  referencedIds: Set<number>,
  existingSectionIds: Set<number>,
  removeWidgets: number[]
): void {
  // Check referenced sections exist
  for (const id of referencedIds) {
    if (!existingSectionIds.has(id)) {
      throw new Error(
        `Section ${id} not found on page. Available sections: ${[...existingSectionIds].join(', ')}`
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
}

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

  // Phase 2: Get existing widgets and validate
  const existingWidgets = await getExistingWidgets()
  const existingSectionIds = new Set(existingWidgets.keys())
  const referencedIds = collectExistingSectionIds(validatedLayout)
  validateLayoutReferences(referencedIds, existingSectionIds, removeWidgets)

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
  const registry = new WidgetRegistry()
  const removeSet = new Set(removeWidgets)
  for (const id of existingSectionIds) {
    if (!removeSet.has(id)) {
      registry.register(id)
    }
  }

  const {
    layoutSpec: preliminarySpec,
    newWidgets,
    existingWidgetLinks,
    placeholderMap
  } = toLayoutSpec(validatedLayout)

  const { placeholderToSectionId } = await createWidgetsFromLayout(
    client,
    docId,
    viewId,
    newWidgets,
    placeholderMap,
    getTableRef,
    registry
  )

  // Phase 5: Apply layout
  const finalLayoutSpec = replacePlaceholders(preliminarySpec, placeholderToSectionId)
  await client.post(`/docs/${docId}/apply`, [buildUpdateLayoutAction(viewId, finalLayoutSpec)])

  void existingWidgetLinks // Links handled separately via link_widgets operation

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

// NOTE: Link configuration helper was removed in Architecture B.
// Widget linking is now done via the separate `link_widgets` operation in manage-pages.ts
// which uses the link-resolver.ts module directly.
