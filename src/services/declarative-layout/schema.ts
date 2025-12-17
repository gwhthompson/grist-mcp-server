/**
 * Declarative layout schema for Grist pages.
 *
 * Supports:
 * - Existing widgets by section ID: `5` or `[5, 2]` (weighted) or `{section: 5}`
 * - New widgets: `{table: "T", widget: "grid"}`
 * - Layout splits: `{cols: [...]}` or `{rows: [...]}`
 * - Widget linking: 7 semantic link types with explicit type discriminator
 */

import { z } from 'zod'

// =============================================================================
// Link Target Schema
// =============================================================================

/**
 * Widget identifier: section ID only.
 *
 * Architecture B: All widget references use real sectionIds from the database.
 * String IDs were removed to eliminate input/output divergence - LLMs now use
 * the same IDs they receive in responses.
 */
export const WidgetIdSchema = z.number().int().positive()

export type WidgetId = z.infer<typeof WidgetIdSchema>

// Legacy alias for backward compatibility
export const LinkTargetSchema = WidgetIdSchema
export type LinkTarget = WidgetId

// =============================================================================
// Link Schemas (7 types with explicit discriminator)
//
// All link types are named from the TARGET widget's perspective using
// preposition patterns: child_of, matched_by, detail_of, etc.
// =============================================================================

/**
 * Type 1: Master-detail filter (Row→Col)
 *
 * This widget is a child of the source widget.
 * Shows records where target_column (a Ref in this table) points to the selected row in source.
 *
 * Example: Products linked to Categories via the "Category" Ref column
 */
const ChildOfLinkSchema = z.strictObject({
  type: z.literal('child_of'),
  source_widget: WidgetIdSchema.describe('Parent widget that drives this link'),
  target_column: z.string().min(1).describe('Ref column in THIS table that points to source table')
})

/**
 * Type 2: Column matching filter (Col→Col)
 *
 * This widget filters by matching column values with the source widget.
 * Both columns typically reference the same third table.
 *
 * Example: Invoices and Payments both have a "Customer" Ref column
 */
const MatchedByLinkSchema = z.strictObject({
  type: z.literal('matched_by'),
  source_widget: WidgetIdSchema.describe('Widget to match column values with'),
  source_column: z.string().min(1).describe('Column in source table'),
  target_column: z.string().min(1).describe('Column in THIS table that must match')
})

/**
 * Type 3: Summary-to-detail filter (Summary-Group)
 *
 * This widget shows detail records grouped in the selected summary row.
 * The source must be a summary table; uses its "group" column automatically.
 *
 * Example: Sales summary by Category → individual Sales records
 */
const DetailOfLinkSchema = z.strictObject({
  type: z.literal('detail_of'),
  source_widget: WidgetIdSchema.describe('Summary widget to show detail records for')
})

/**
 * Type 4: Summary drill-down (Summary hierarchy)
 *
 * This widget is a more detailed breakdown of the source summary.
 * Source and target are both summary tables with different groupby columns.
 *
 * Example: Sales by Region → Sales by Region + Product
 */
const BreakdownOfLinkSchema = z.strictObject({
  type: z.literal('breakdown_of'),
  source_widget: WidgetIdSchema.describe('Less-detailed summary widget to drill down from')
})

/**
 * Type 5: RefList display (Show Referenced Records)
 *
 * This widget shows all records listed in the source's RefList column.
 * Filters to show exactly the records referenced by the RefList.
 *
 * Example: Project's TeamMembers (RefList) → show those Employees
 */
const ListedInLinkSchema = z.strictObject({
  type: z.literal('listed_in'),
  source_widget: WidgetIdSchema.describe('Widget containing the RefList column'),
  source_column: z.string().min(1).describe('RefList column in source table')
})

/**
 * Type 6: Cursor sync (Same-Table)
 *
 * This widget syncs its cursor position with the source widget.
 * Both widgets must show the same table. No filtering occurs.
 *
 * Example: Grid view synced with Card view of the same table
 */
const SyncedWithLinkSchema = z.strictObject({
  type: z.literal('synced_with'),
  source_widget: WidgetIdSchema.describe('Widget showing the same table to sync cursor with')
})

/**
 * Type 7: Reference follow (Cursor via Ref)
 *
 * This widget shows the record referenced by the source's Ref column.
 * When you select a row in source, cursor jumps to the referenced record.
 *
 * Example: Select an Order → cursor moves to the Order's Customer record
 */
const ReferencedByLinkSchema = z.strictObject({
  type: z.literal('referenced_by'),
  source_widget: WidgetIdSchema.describe('Widget containing the Ref column'),
  source_column: z.string().min(1).describe('Ref column in source table that points to THIS table')
})

// =============================================================================
// Combined Link Schema (Discriminated Union)
// =============================================================================

export const LinkSchema = z.discriminatedUnion('type', [
  ChildOfLinkSchema,
  MatchedByLinkSchema,
  DetailOfLinkSchema,
  BreakdownOfLinkSchema,
  ListedInLinkSchema,
  SyncedWithLinkSchema,
  ReferencedByLinkSchema
])

export type Link = z.infer<typeof LinkSchema>

// Export individual schemas for use in type guards
export type ChildOfLink = z.infer<typeof ChildOfLinkSchema>
export type MatchedByLink = z.infer<typeof MatchedByLinkSchema>
export type DetailOfLink = z.infer<typeof DetailOfLinkSchema>
export type BreakdownOfLink = z.infer<typeof BreakdownOfLinkSchema>
export type ListedInLink = z.infer<typeof ListedInLinkSchema>
export type SyncedWithLink = z.infer<typeof SyncedWithLinkSchema>
export type ReferencedByLink = z.infer<typeof ReferencedByLinkSchema>

// =============================================================================
// Widget Type Schemas
// =============================================================================

export const DeclarativeWidgetTypeSchema = z.enum([
  'grid',
  'card',
  'card_list',
  'chart',
  'form',
  'custom'
])

export type DeclarativeWidgetType = z.infer<typeof DeclarativeWidgetTypeSchema>

export const DeclarativeChartTypeSchema = z.enum([
  'bar',
  'line',
  'pie',
  'area',
  'scatter',
  'donut',
  'kaplan_meier'
])

export type DeclarativeChartType = z.infer<typeof DeclarativeChartTypeSchema>

// =============================================================================
// Pane Schemas (non-recursive parts)
// =============================================================================

/**
 * Existing widget reference with options.
 *
 * Architecture B: Removed `link` field - linking is now via `link_widgets` operation.
 */
export const ExistingPaneSchema = z.strictObject({
  section: z.number().int().positive(),
  weight: z.number().positive().optional()
})

export type ExistingPane = z.infer<typeof ExistingPaneSchema>

/**
 * Chart display options for configuring axis behavior, stacking, etc.
 */
export const ChartOptionsSchema = z
  .strictObject({
    multiseries: z.boolean().optional(),
    lineConnectGaps: z.boolean().optional(),
    lineMarkers: z.boolean().optional(),
    stacked: z.boolean().optional(),
    errorBars: z.boolean().optional(),
    invertYAxis: z.boolean().optional(),
    logYAxis: z.boolean().optional(),
    orientation: z.enum(['h', 'v']).optional(),
    donutHoleSize: z.number().min(0).max(1).optional(),
    showTotal: z.boolean().optional(),
    textSize: z.number().positive().optional(),
    aggregate: z.string().optional()
  })
  .optional()

export type ChartOptions = z.infer<typeof ChartOptionsSchema>

/**
 * New widget definition.
 *
 * Architecture B: Removed `id` and `link` fields.
 * - `id` was for local string IDs that didn't persist in responses
 * - `link` is now handled via separate `link_widgets` operation
 *
 * This ensures LLMs use the sectionIds returned in responses for linking.
 */
export const NewPaneSchema = z
  .strictObject({
    table: z.string().min(1),
    widget: DeclarativeWidgetTypeSchema.default('grid'),
    title: z.string().min(1).optional(),
    chartType: DeclarativeChartTypeSchema.optional(),
    /** X-axis column name (for chart widgets) */
    x_axis: z.string().optional(),
    /** Y-axis column names / series (for chart widgets) */
    y_axis: z.array(z.string()).optional(),
    /** Chart display options */
    chart_options: ChartOptionsSchema,
    weight: z.number().positive().optional()
  })
  .refine((data) => data.widget !== 'chart' || data.chartType !== undefined, {
    message: 'chartType is required when widget is "chart"',
    path: ['chartType']
  })

export type NewPane = z.infer<typeof NewPaneSchema>

// =============================================================================
// Recursive Layout Node
// =============================================================================

/**
 * A layout node can be:
 * - number: section ID
 * - [number, number]: weighted section [id, weight]
 * - ExistingPane: {section, weight?, link?}
 * - NewPane: {table, widget, ...}
 * - ColSplit: {cols: LayoutNode[], weight?}
 * - RowSplit: {rows: LayoutNode[], weight?}
 */
export type LayoutNode =
  | number
  | [number, number]
  | ExistingPane
  | NewPane
  | { cols: LayoutNode[]; weight?: number }
  | { rows: LayoutNode[]; weight?: number }

/**
 * Recursive schema for layout nodes.
 * Uses z.lazy() with explicit type annotation for proper recursion.
 */
export const LayoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.union([
    // Section ID
    z
      .number()
      .int()
      .positive(),

    // Weighted section: [id, weight]
    z.tuple([z.number().int().positive(), z.number().positive()]),

    // Existing pane with options
    ExistingPaneSchema,

    // New widget definition
    NewPaneSchema,

    // Column split
    z.strictObject({
      cols: z.array(LayoutNodeSchema).min(2).max(10),
      weight: z.number().positive().optional()
    }),

    // Row split
    z.strictObject({
      rows: z.array(LayoutNodeSchema).min(2).max(10),
      weight: z.number().positive().optional()
    })
  ])
)

// =============================================================================
// Type Guards
// =============================================================================

export function isSectionId(node: LayoutNode): node is number {
  return typeof node === 'number'
}

export function isWeightedSection(node: LayoutNode): node is [number, number] {
  return Array.isArray(node) && node.length === 2 && typeof node[0] === 'number'
}

export function isExistingPane(node: LayoutNode): node is ExistingPane {
  return typeof node === 'object' && !Array.isArray(node) && 'section' in node
}

export function isNewPane(node: LayoutNode): node is NewPane {
  return typeof node === 'object' && !Array.isArray(node) && 'table' in node
}

export function isColSplit(node: LayoutNode): node is { cols: LayoutNode[]; weight?: number } {
  return typeof node === 'object' && !Array.isArray(node) && 'cols' in node
}

export function isRowSplit(node: LayoutNode): node is { rows: LayoutNode[]; weight?: number } {
  return typeof node === 'object' && !Array.isArray(node) && 'rows' in node
}

// =============================================================================
// Link Type Guards
// =============================================================================

export function isChildOfLink(link: Link): link is ChildOfLink {
  return link.type === 'child_of'
}

export function isMatchedByLink(link: Link): link is MatchedByLink {
  return link.type === 'matched_by'
}

export function isDetailOfLink(link: Link): link is DetailOfLink {
  return link.type === 'detail_of'
}

export function isBreakdownOfLink(link: Link): link is BreakdownOfLink {
  return link.type === 'breakdown_of'
}

export function isListedInLink(link: Link): link is ListedInLink {
  return link.type === 'listed_in'
}

export function isSyncedWithLink(link: Link): link is SyncedWithLink {
  return link.type === 'synced_with'
}

export function isReferencedByLink(link: Link): link is ReferencedByLink {
  return link.type === 'referenced_by'
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract the section ID from any pane type.
 * Returns undefined for new panes (they don't have a section ID yet).
 */
export function getSectionId(node: LayoutNode): number | undefined {
  if (isSectionId(node)) return node
  if (isWeightedSection(node)) return node[0]
  if (isExistingPane(node)) return node.section
  return undefined
}

/**
 * Extract the weight from any node type.
 * Returns undefined if no weight specified (defaults to 1).
 */
export function getWeight(node: LayoutNode): number | undefined {
  if (isWeightedSection(node)) return node[1]
  if (typeof node === 'object' && !Array.isArray(node) && 'weight' in node) {
    return node.weight
  }
  return undefined
}

// NOTE: collectLocalIds was removed in Architecture B.
// Local string IDs are no longer supported - all widget references use real sectionIds.

/**
 * Collect all new panes defined in a layout.
 * Returns them in tree traversal order (depth-first, left-to-right).
 */
export function collectNewPanes(node: LayoutNode): NewPane[] {
  const panes: NewPane[] = []

  function walk(n: LayoutNode): void {
    if (isNewPane(n)) {
      panes.push(n)
    }
    if (isColSplit(n)) {
      n.cols.forEach(walk)
    }
    if (isRowSplit(n)) {
      n.rows.forEach(walk)
    }
  }

  walk(node)
  return panes
}

/**
 * Collect all existing section IDs referenced in a layout.
 */
export function collectExistingSectionIds(node: LayoutNode): Set<number> {
  const ids = new Set<number>()

  function walk(n: LayoutNode): void {
    const sectionId = getSectionId(n)
    if (sectionId !== undefined) {
      ids.add(sectionId)
    }
    if (isColSplit(n)) {
      n.cols.forEach(walk)
    }
    if (isRowSplit(n)) {
      n.rows.forEach(walk)
    }
  }

  walk(node)
  return ids
}
