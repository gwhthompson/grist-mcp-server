/**
 * Transform declarative layout to Grist's internal LayoutSpec format.
 *
 * Key transformations:
 * - Flatten weighted items to binary tree with splitRatio
 * - Use negative IDs as placeholders for new widgets
 * - Collect new widget definitions and link configurations
 */

import type { LayoutSpec } from '../../types.js'
import type { LayoutNode, Link, NewPane } from './schema.js'
import {
  getWeight,
  isColSplit,
  isExistingPane,
  isNewPane,
  isRowSplit,
  isSectionId,
  isWeightedSection
} from './schema.js'

// =============================================================================
// Types
// =============================================================================

export interface TransformResult {
  /** The transformed LayoutSpec (may contain negative placeholder IDs) */
  layoutSpec: LayoutSpec

  /** New widgets to create, in tree traversal order */
  newWidgets: NewPane[]

  /** Links from existing widgets (section ID → link config) */
  existingWidgetLinks: Array<{
    sectionId: number
    link: Link
  }>

  /** Placeholder ID → index in newWidgets array */
  placeholderMap: Map<number, number>
}

// =============================================================================
// Main Transform Function
// =============================================================================

/**
 * Transform a declarative layout to Grist's LayoutSpec format.
 *
 * @param layout - The declarative layout node
 * @returns Transform result with LayoutSpec and metadata
 */
export function toLayoutSpec(layout: LayoutNode): TransformResult {
  const newWidgets: NewPane[] = []
  const existingWidgetLinks: TransformResult['existingWidgetLinks'] = []
  const placeholderMap = new Map<number, number>()
  let placeholderCounter = 0

  /**
   * Get the next placeholder ID (negative to distinguish from real IDs).
   */
  function nextPlaceholder(): number {
    return -++placeholderCounter
  }

  /**
   * Transform a single node to LayoutSpec.
   */
  function transform(node: LayoutNode): LayoutSpec {
    // Simple section ID
    if (isSectionId(node)) {
      return { type: 'leaf', leaf: node }
    }

    // Weighted section: [id, weight]
    if (isWeightedSection(node)) {
      // Weight is handled at parent level, just return leaf
      return { type: 'leaf', leaf: node[0] }
    }

    // Existing pane with options
    if (isExistingPane(node)) {
      // Note: link handling removed in Architecture B - use link_widgets operation
      return { type: 'leaf', leaf: node.section }
    }

    // New widget definition
    if (isNewPane(node)) {
      const placeholder = nextPlaceholder()
      const index = newWidgets.length
      newWidgets.push(node)
      placeholderMap.set(placeholder, index)
      return { type: 'leaf', leaf: placeholder }
    }

    // Column split
    if (isColSplit(node)) {
      return buildSplit('hsplit', node.cols)
    }

    // Row split
    if (isRowSplit(node)) {
      return buildSplit('vsplit', node.rows)
    }

    // Should never reach here if schema validation passed
    throw new Error(`Unknown layout node type: ${JSON.stringify(node)}`)
  }

  /**
   * Build a split layout from children.
   * Converts N children to nested binary splits.
   */
  function buildSplit(type: 'hsplit' | 'vsplit', children: LayoutNode[]): LayoutSpec {
    if (children.length < 2) {
      throw new Error(`Split must have at least 2 children, got ${children.length}`)
    }

    // Get weights for all children (default to 1)
    const weights = children.map((child) => getWeight(child) ?? 1)
    const totalWeight = weights.reduce((a, b) => a + b, 0)

    // For 2 children, simple split
    if (children.length === 2) {
      const w0 = weights[0] ?? 1
      const c0 = children[0]
      const c1 = children[1]
      // Safety: we've confirmed children.length === 2
      if (c0 === undefined || c1 === undefined) {
        throw new Error('Internal error: children array shorter than expected')
      }
      const ratio = w0 / totalWeight
      return {
        type,
        children: [transform(c0), transform(c1)],
        splitRatio: ratio
      }
    }

    // For 3+ children, create nested binary splits
    // First child vs. rest, then recursively split the rest
    return buildNestedSplit(type, children, weights)
  }

  /**
   * Build nested binary splits for 3+ children.
   *
   * Strategy: Left-associative nesting
   * [a, b, c, d] → hsplit(a, hsplit(b, hsplit(c, d)))
   *
   * With weights [1, 2, 1, 2] (total=6):
   * - First split: a (1/6) vs rest (5/6) → ratio 1/6
   * - Second split: b (2/5) vs rest (3/5) → ratio 2/5
   * - Third split: c (1/3) vs d (2/3) → ratio 1/3
   */
  function buildNestedSplit(
    type: 'hsplit' | 'vsplit',
    children: LayoutNode[],
    weights: number[]
  ): LayoutSpec {
    // Base case: 2 children
    if (children.length === 2) {
      const w0 = weights[0] ?? 1
      const w1 = weights[1] ?? 1
      const c0 = children[0]
      const c1 = children[1]
      // Safety: we've confirmed children.length === 2
      if (c0 === undefined || c1 === undefined) {
        throw new Error('Internal error: children array shorter than expected')
      }
      const totalWeight = w0 + w1
      const ratio = w0 / totalWeight
      return {
        type,
        children: [transform(c0), transform(c1)],
        splitRatio: ratio
      }
    }

    // Recursive case: split first child from rest
    const firstWeight = weights[0] ?? 1
    const restWeights = weights.slice(1)
    const firstChild = children[0]
    const restChildren = children.slice(1)
    // Safety: we've confirmed children.length > 2
    if (firstChild === undefined) {
      throw new Error('Internal error: children array is empty')
    }
    const restTotalWeight = restWeights.reduce((a, b) => a + b, 0)
    const totalWeight = firstWeight + restTotalWeight

    const ratio = firstWeight / totalWeight

    return {
      type,
      children: [transform(firstChild), buildNestedSplit(type, restChildren, restWeights)],
      splitRatio: ratio
    }
  }

  const layoutSpec = transform(layout)

  return {
    layoutSpec,
    newWidgets,
    existingWidgetLinks,
    placeholderMap
  }
}

// =============================================================================
// Placeholder Replacement
// =============================================================================

/**
 * Replace placeholder IDs in a LayoutSpec with real section IDs.
 *
 * @param spec - The LayoutSpec with placeholder IDs
 * @param placeholderToSectionId - Map from placeholder ID to real section ID
 * @returns New LayoutSpec with real IDs
 */
export function replacePlaceholders(
  spec: LayoutSpec,
  placeholderToSectionId: Map<number, number>
): LayoutSpec {
  if (spec.type === 'leaf') {
    if (spec.leaf < 0) {
      const realId = placeholderToSectionId.get(spec.leaf)
      if (realId === undefined) {
        throw new Error(`No section ID found for placeholder ${spec.leaf}`)
      }
      return { type: 'leaf', leaf: realId }
    }
    return spec
  }

  return {
    type: spec.type,
    children: spec.children.map((child) => replacePlaceholders(child, placeholderToSectionId)),
    splitRatio: spec.splitRatio
  }
}

// =============================================================================
// Validation
// =============================================================================

/** Assert section exists, throw descriptive error if not */
function assertSectionExists(sectionId: number, existingSectionIds: Set<number>): void {
  if (!existingSectionIds.has(sectionId)) {
    throw new Error(
      `Section ${sectionId} not found on this page. ` +
        `Available sections: ${[...existingSectionIds].join(', ')}`
    )
  }
}

/** Get section ID from a node if it references an existing section */
function getSectionIdFromNode(node: LayoutNode): number | null {
  if (isSectionId(node)) return node
  if (isWeightedSection(node)) return node[0]
  if (isExistingPane(node)) return node.section
  return null
}

/**
 * Validate that all existing section IDs in a layout actually exist on the page.
 *
 * @param layout - The declarative layout
 * @param existingSectionIds - Set of section IDs that exist on the page
 * @throws Error if any referenced section ID doesn't exist
 */
export function validateExistingSections(
  layout: LayoutNode,
  existingSectionIds: Set<number>
): void {
  function walk(node: LayoutNode): void {
    const sectionId = getSectionIdFromNode(node)
    if (sectionId !== null) {
      assertSectionExists(sectionId, existingSectionIds)
    }

    if (isColSplit(node)) {
      for (const col of node.cols) walk(col)
    }
    if (isRowSplit(node)) {
      for (const row of node.rows) walk(row)
    }
  }

  walk(layout)
}
