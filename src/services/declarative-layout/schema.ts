/**
 * Declarative layout schema for Grist pages.
 *
 * Supports:
 * - Existing widgets by section ID: `5` or `[5, 2]` (weighted) or `{section: 5}`
 * - New widgets: `{table: "T", widget: "grid"}`
 * - Layout splits: `{cols: [...]}` or `{rows: [...]}`
 * - Widget linking: 7 semantic link types (sync, select, filter, group, summary, refs, custom)
 */

import { z } from 'zod'

// =============================================================================
// Link Target Schema
// =============================================================================

/**
 * Link target can be:
 * - number: existing section ID
 * - string: local ID defined in the same layout
 */
export const LinkTargetSchema = z.union([z.number().int().positive(), z.string().min(1)])

export type LinkTarget = z.infer<typeof LinkTargetSchema>

// =============================================================================
// Link Schemas (7 types from spec)
// =============================================================================

/** Cursor sync: same table, same row */
const SyncLinkSchema = z.strictObject({
  sync: LinkTargetSchema
})

/** Follow Ref column: source.col → target row */
const SelectLinkSchema = z.strictObject({
  select: z.strictObject({
    from: LinkTargetSchema,
    col: z.string().min(1)
  })
})

/** Filter: row→col or col→col */
const FilterLinkSchema = z.strictObject({
  filter: z.strictObject({
    from: LinkTargetSchema,
    col: z.string().min(1).optional(),
    to: z.string().min(1)
  })
})

/** Summary group-by link */
const GroupLinkSchema = z.strictObject({
  group: LinkTargetSchema
})

/** Summary table link */
const SummaryLinkSchema = z.strictObject({
  summary: LinkTargetSchema
})

/** Show referenced records via RefList */
const RefsLinkSchema = z.strictObject({
  refs: z.strictObject({
    from: LinkTargetSchema,
    col: z.string().min(1)
  })
})

/** Custom widget selection */
const CustomLinkSchema = z.strictObject({
  custom: LinkTargetSchema
})

export const LinkSchema = z.union([
  SyncLinkSchema,
  SelectLinkSchema,
  FilterLinkSchema,
  GroupLinkSchema,
  SummaryLinkSchema,
  RefsLinkSchema,
  CustomLinkSchema
])

export type Link = z.infer<typeof LinkSchema>

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

/** Existing widget with options */
export const ExistingPaneSchema = z.strictObject({
  section: z.number().int().positive(),
  weight: z.number().positive().optional(),
  link: LinkSchema.optional()
})

export type ExistingPane = z.infer<typeof ExistingPaneSchema>

/** New widget definition */
export const NewPaneSchema = z
  .strictObject({
    table: z.string().min(1),
    widget: DeclarativeWidgetTypeSchema.default('grid'),
    id: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    chartType: DeclarativeChartTypeSchema.optional(),
    weight: z.number().positive().optional(),
    link: LinkSchema.optional()
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

export function isSyncLink(link: Link): link is z.infer<typeof SyncLinkSchema> {
  return 'sync' in link
}

export function isSelectLink(link: Link): link is z.infer<typeof SelectLinkSchema> {
  return 'select' in link
}

export function isFilterLink(link: Link): link is z.infer<typeof FilterLinkSchema> {
  return 'filter' in link
}

export function isGroupLink(link: Link): link is z.infer<typeof GroupLinkSchema> {
  return 'group' in link
}

export function isSummaryLink(link: Link): link is z.infer<typeof SummaryLinkSchema> {
  return 'summary' in link
}

export function isRefsLink(link: Link): link is z.infer<typeof RefsLinkSchema> {
  return 'refs' in link
}

export function isCustomLink(link: Link): link is z.infer<typeof CustomLinkSchema> {
  return 'custom' in link
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

/**
 * Extract all local IDs defined in a layout.
 * Used for validating uniqueness and resolving link targets.
 */
export function collectLocalIds(node: LayoutNode): Set<string> {
  const ids = new Set<string>()

  function walk(n: LayoutNode): void {
    if (isNewPane(n) && n.id) {
      if (ids.has(n.id)) {
        throw new Error(`Duplicate local ID "${n.id}" in layout`)
      }
      ids.add(n.id)
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
