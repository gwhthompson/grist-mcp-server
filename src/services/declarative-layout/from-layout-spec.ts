/**
 * Transform Grist's internal LayoutSpec to declarative format.
 *
 * Used by get_layout to return layouts in a human-friendly format.
 * Note: Round-trip loses exact weights (returns nested binary structure).
 */

import { fromGristWidgetType, type GristWidgetType } from '../../schemas/pages-widgets.js'
import type { LayoutSpec } from '../../types.js'
import type { LayoutNode } from './schema.js'

// =============================================================================
// Types
// =============================================================================

export interface WidgetInfo {
  sectionId: number
  tableId: string
  widgetType: string
  title?: string
  linkSrcSectionRef?: number
  linkSrcColRef?: number
  linkTargetColRef?: number
}

export interface FromLayoutSpecOptions {
  /** Widget metadata for enriching the output */
  widgets?: Map<number, WidgetInfo>

  /** Column name resolver (colRef → colId) */
  resolveColName?: (tableRef: number, colRef: number) => Promise<string | undefined>

  /** Whether to include link information */
  includeLinks?: boolean
}

// =============================================================================
// Main Transform Function
// =============================================================================

/**
 * Transform a LayoutSpec to declarative format.
 *
 * Architecture B: Links are no longer embedded in the layout structure.
 * Link information is returned separately in widget metadata (see formatGetLayoutResult).
 *
 * @param spec - Grist's internal LayoutSpec
 * @param options - Optional configuration for enriching output (widgets for metadata)
 * @returns Declarative layout node
 */
export function fromLayoutSpec(spec: LayoutSpec, options: FromLayoutSpecOptions = {}): LayoutNode {
  // Note: includeLinks option is ignored in Architecture B - links not in layout
  const { includeLinks: _ } = options
  void _ // Suppress unused variable warning

  function transform(s: LayoutSpec): LayoutNode {
    if (s.type === 'leaf') {
      // Architecture B: Just return section ID, no embedded links
      return s.leaf
    }

    // Split node
    const children = s.children.map(transform)

    if (s.type === 'hsplit') {
      return { cols: children }
    }

    if (s.type === 'vsplit') {
      return { rows: children }
    }

    // Should never reach here
    throw new Error(`Unknown LayoutSpec type: ${(s as LayoutSpec).type}`)
  }

  return transform(spec)
}

// NOTE: Link reconstruction code was removed in Architecture B.
// Links are no longer embedded in the layout schema - use link_widgets operation.
// Widget link metadata (linkSrcSectionRef, etc.) is still returned in widget info.

// =============================================================================
// Output Formatting
// =============================================================================

export interface GetLayoutResult {
  layout: LayoutNode
  widgets: Array<{
    section: number
    table: string
    widget: string
    title?: string
  }>
}

/**
 * Format the get_layout response with layout and widget metadata.
 */
export function formatGetLayoutResult(
  spec: LayoutSpec,
  widgets: Map<number, WidgetInfo>
): GetLayoutResult {
  const layout = fromLayoutSpec(spec, { widgets, includeLinks: true })

  const widgetList = [...widgets.values()].map((w) => ({
    section: w.sectionId,
    table: w.tableId,
    widget: fromGristWidgetType(w.widgetType as GristWidgetType),
    ...(w.title ? { title: w.title } : {})
  }))

  return {
    layout,
    widgets: widgetList
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract all section IDs from a LayoutSpec.
 */
export function extractSectionIds(spec: LayoutSpec): Set<number> {
  const ids = new Set<number>()

  function walk(s: LayoutSpec): void {
    if (s.type === 'leaf') {
      ids.add(s.leaf)
    } else {
      s.children.forEach(walk)
    }
  }

  walk(spec)
  return ids
}

/**
 * Count the number of widgets in a LayoutSpec.
 */
export function countWidgets(spec: LayoutSpec): number {
  if (spec.type === 'leaf') {
    return 1
  }
  return spec.children.reduce((sum, child) => sum + countWidgets(child), 0)
}
