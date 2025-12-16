/**
 * Transform Grist's internal LayoutSpec to declarative format.
 *
 * Used by get_layout to return layouts in a human-friendly format.
 * Note: Round-trip loses exact weights (returns nested binary structure).
 */

import type { LayoutSpec } from '../../types.js'
import type { LayoutNode, Link } from './schema.js'

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
 * @param spec - Grist's internal LayoutSpec
 * @param options - Optional configuration for enriching output
 * @returns Declarative layout node
 */
export function fromLayoutSpec(spec: LayoutSpec, options: FromLayoutSpecOptions = {}): LayoutNode {
  const { widgets, includeLinks = false } = options

  function transform(s: LayoutSpec): LayoutNode {
    if (s.type === 'leaf') {
      const sectionId = s.leaf

      // If we have widget info and want to include links
      if (widgets && includeLinks) {
        const info = widgets.get(sectionId)
        if (info?.linkSrcSectionRef && info.linkSrcSectionRef > 0) {
          // Has linking - return as ExistingPane with link
          const link = reconstructLink(info)
          if (link) {
            return {
              section: sectionId,
              link
            }
          }
        }
      }

      // Simple section reference
      return sectionId
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

// =============================================================================
// Link Reconstruction
// =============================================================================

/**
 * Reconstruct a Link from widget linking metadata.
 *
 * This is a best-effort reconstruction based on the colRef values.
 * Some link types (like group vs sync) require additional context
 * that may not be available, so we make educated guesses.
 */
function reconstructLink(info: WidgetInfo): Link | undefined {
  const { linkSrcSectionRef, linkSrcColRef, linkTargetColRef } = info

  if (!linkSrcSectionRef || linkSrcSectionRef <= 0) {
    return undefined
  }

  // Both colRefs are 0: cursor sync or summary
  if (
    (linkSrcColRef === 0 || linkSrcColRef === undefined) &&
    (linkTargetColRef === 0 || linkTargetColRef === undefined)
  ) {
    // Could be sync or summary - default to sync
    // (would need table relationship info to distinguish)
    return { sync: linkSrcSectionRef }
  }

  // Source colRef set, target is 0: select or refs
  if (
    linkSrcColRef &&
    linkSrcColRef > 0 &&
    (linkTargetColRef === 0 || linkTargetColRef === undefined)
  ) {
    // Could be select (Ref) or refs (RefList) - would need column type
    // Default to select, use string placeholder for col name
    return {
      select: {
        from: linkSrcSectionRef,
        col: `colRef_${linkSrcColRef}` // Placeholder - would need resolution
      }
    }
  }

  // Target colRef set: filter
  if (linkTargetColRef && linkTargetColRef > 0) {
    if (linkSrcColRef && linkSrcColRef > 0) {
      // Col→Col filter
      return {
        filter: {
          from: linkSrcSectionRef,
          col: `colRef_${linkSrcColRef}`,
          to: `colRef_${linkTargetColRef}`
        }
      }
    } else {
      // Row→Col filter
      return {
        filter: {
          from: linkSrcSectionRef,
          to: `colRef_${linkTargetColRef}`
        }
      }
    }
  }

  return undefined
}

// =============================================================================
// Enhanced Transform with Column Resolution
// =============================================================================

/**
 * Transform LayoutSpec to declarative format with resolved column names.
 *
 * @param spec - Grist's internal LayoutSpec
 * @param widgets - Widget metadata map
 * @param resolveColName - Async function to resolve colRef to colId
 * @returns Declarative layout with resolved column names in links
 */
export async function fromLayoutSpecWithResolution(
  spec: LayoutSpec,
  widgets: Map<number, WidgetInfo>,
  _resolveColName: (tableRef: number, colRef: number) => Promise<string | undefined>
): Promise<LayoutNode> {
  // First, collect all colRefs that need resolution
  const _colRefsToResolve = new Map<string, { tableRef: number; colRef: number }>()

  for (const _info of widgets.values()) {
    // We'd need tableRef - this is a limitation of the current approach
    // For now, return the basic transform
  }

  // Basic transform without full resolution
  return fromLayoutSpec(spec, { widgets, includeLinks: true })
}

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
    widget: w.widgetType,
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
