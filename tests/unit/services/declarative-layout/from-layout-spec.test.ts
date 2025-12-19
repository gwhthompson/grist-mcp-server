/**
 * Unit tests for from-layout-spec transformation
 *
 * Tests conversion from Grist's internal LayoutSpec to declarative format:
 * - Leaf nodes
 * - Horizontal and vertical splits
 * - Nested structures
 * - Widget metadata formatting
 * - Utility functions (extractSectionIds, countWidgets)
 */

import { describe, expect, it } from 'vitest'
import {
  countWidgets,
  extractSectionIds,
  formatGetLayoutResult,
  fromLayoutSpec,
  type WidgetInfo
} from '../../../../src/services/declarative-layout/from-layout-spec.js'
import type { LayoutNode } from '../../../../src/services/declarative-layout/schema.js'
import type { LayoutSpec } from '../../../../src/types.js'

// =============================================================================
// Simple Transformations
// =============================================================================

describe('fromLayoutSpec - Simple Nodes', () => {
  it('should transform leaf to section ID', () => {
    const spec: LayoutSpec = {
      type: 'leaf',
      leaf: 5
    }

    const result = fromLayoutSpec(spec)
    expect(result).toBe(5)
  })

  it('should handle different leaf IDs', () => {
    const spec1: LayoutSpec = { type: 'leaf', leaf: 1 }
    const spec2: LayoutSpec = { type: 'leaf', leaf: 999 }

    expect(fromLayoutSpec(spec1)).toBe(1)
    expect(fromLayoutSpec(spec2)).toBe(999)
  })
})

// =============================================================================
// Split Transformations
// =============================================================================

describe('fromLayoutSpec - Splits', () => {
  it('should transform hsplit to cols', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        { type: 'leaf', leaf: 10 }
      ],
      splitRatio: 0.5
    }

    const result = fromLayoutSpec(spec) as Extract<LayoutNode, { cols: LayoutNode[] }>
    expect(result).toEqual({
      cols: [5, 10]
    })
  })

  it('should transform vsplit to rows', () => {
    const spec: LayoutSpec = {
      type: 'vsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        { type: 'leaf', leaf: 10 }
      ],
      splitRatio: 0.5
    }

    const result = fromLayoutSpec(spec) as Extract<LayoutNode, { rows: LayoutNode[] }>
    expect(result).toEqual({
      rows: [5, 10]
    })
  })

  it('should handle three children in hsplit', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        {
          type: 'hsplit',
          children: [
            { type: 'leaf', leaf: 10 },
            { type: 'leaf', leaf: 15 }
          ],
          splitRatio: 0.5
        }
      ],
      splitRatio: 0.33
    }

    const result = fromLayoutSpec(spec) as Extract<LayoutNode, { cols: LayoutNode[] }>
    expect(result.cols).toHaveLength(2)
    expect(result.cols?.[0]).toBe(5)

    const nested = result.cols?.[1] as Extract<LayoutNode, { cols: LayoutNode[] }>
    expect(nested.cols).toEqual([10, 15])
  })

  it('should handle three children in vsplit', () => {
    const spec: LayoutSpec = {
      type: 'vsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        {
          type: 'vsplit',
          children: [
            { type: 'leaf', leaf: 10 },
            { type: 'leaf', leaf: 15 }
          ],
          splitRatio: 0.5
        }
      ],
      splitRatio: 0.33
    }

    const result = fromLayoutSpec(spec) as Extract<LayoutNode, { rows: LayoutNode[] }>
    expect(result.rows).toHaveLength(2)
    expect(result.rows?.[0]).toBe(5)

    const nested = result.rows?.[1] as Extract<LayoutNode, { rows: LayoutNode[] }>
    expect(nested.rows).toEqual([10, 15])
  })
})

// =============================================================================
// Nested Structures
// =============================================================================

describe('fromLayoutSpec - Nested Structures', () => {
  it('should handle hsplit inside vsplit', () => {
    const spec: LayoutSpec = {
      type: 'vsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        {
          type: 'hsplit',
          children: [
            { type: 'leaf', leaf: 10 },
            { type: 'leaf', leaf: 15 }
          ],
          splitRatio: 0.5
        }
      ],
      splitRatio: 0.5
    }

    const result = fromLayoutSpec(spec) as Extract<LayoutNode, { rows: LayoutNode[] }>
    expect(result.rows).toHaveLength(2)
    expect(result.rows?.[0]).toBe(5)

    const nested = result.rows?.[1] as Extract<LayoutNode, { cols: LayoutNode[] }>
    expect(nested.cols).toEqual([10, 15])
  })

  it('should handle vsplit inside hsplit', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        {
          type: 'vsplit',
          children: [
            { type: 'leaf', leaf: 5 },
            { type: 'leaf', leaf: 10 }
          ],
          splitRatio: 0.6
        },
        { type: 'leaf', leaf: 15 }
      ],
      splitRatio: 0.4
    }

    const result = fromLayoutSpec(spec) as Extract<LayoutNode, { cols: LayoutNode[] }>
    expect(result.cols).toHaveLength(2)

    const nested = result.cols?.[0] as Extract<LayoutNode, { rows: LayoutNode[] }>
    expect(nested.rows).toEqual([5, 10])

    expect(result.cols?.[1]).toBe(15)
  })

  it('should handle deeply nested structure', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        {
          type: 'vsplit',
          children: [
            { type: 'leaf', leaf: 10 },
            {
              type: 'hsplit',
              children: [
                { type: 'leaf', leaf: 15 },
                { type: 'leaf', leaf: 20 }
              ],
              splitRatio: 0.5
            }
          ],
          splitRatio: 0.5
        }
      ],
      splitRatio: 0.5
    }

    const result = fromLayoutSpec(spec) as Extract<LayoutNode, { cols: LayoutNode[] }>
    expect(result.cols?.[0]).toBe(5)

    const level1 = result.cols?.[1] as Extract<LayoutNode, { rows: LayoutNode[] }>
    expect(level1.rows?.[0]).toBe(10)

    const level2 = level1.rows?.[1] as Extract<LayoutNode, { cols: LayoutNode[] }>
    expect(level2.cols).toEqual([15, 20])
  })
})

// =============================================================================
// Widget Metadata Formatting
// =============================================================================

describe('formatGetLayoutResult', () => {
  it('should format simple leaf layout', () => {
    const spec: LayoutSpec = { type: 'leaf', leaf: 5 }
    const widgets = new Map<number, WidgetInfo>([
      [
        5,
        {
          sectionId: 5,
          tableId: 'Products',
          widgetType: 'record',
          title: 'Products Grid'
        }
      ]
    ])

    const result = formatGetLayoutResult(spec, widgets)

    expect(result.layout).toBe(5)
    expect(result.widgets).toEqual([
      {
        section: 5,
        table: 'Products',
        widget: 'record',
        title: 'Products Grid'
      }
    ])
  })

  it('should format split layout with multiple widgets', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        { type: 'leaf', leaf: 10 }
      ],
      splitRatio: 0.5
    }
    const widgets = new Map<number, WidgetInfo>([
      [5, { sectionId: 5, tableId: 'Products', widgetType: 'record' }],
      [10, { sectionId: 10, tableId: 'Orders', widgetType: 'single', title: 'Order Details' }]
    ])

    const result = formatGetLayoutResult(spec, widgets)

    expect(result.layout).toEqual({
      cols: [5, 10]
    })
    expect(result.widgets).toEqual([
      {
        section: 5,
        table: 'Products',
        widget: 'record'
      },
      {
        section: 10,
        table: 'Orders',
        widget: 'single',
        title: 'Order Details'
      }
    ])
  })

  it('should omit title when undefined', () => {
    const spec: LayoutSpec = { type: 'leaf', leaf: 5 }
    const widgets = new Map<number, WidgetInfo>([
      [5, { sectionId: 5, tableId: 'Products', widgetType: 'record' }]
    ])

    const result = formatGetLayoutResult(spec, widgets)

    expect(result.widgets[0]).toEqual({
      section: 5,
      table: 'Products',
      widget: 'record'
    })
    expect(result.widgets[0]).not.toHaveProperty('title')
  })

  it('should include title when defined', () => {
    const spec: LayoutSpec = { type: 'leaf', leaf: 5 }
    const widgets = new Map<number, WidgetInfo>([
      [5, { sectionId: 5, tableId: 'Products', widgetType: 'record', title: 'My Grid' }]
    ])

    const result = formatGetLayoutResult(spec, widgets)

    expect(result.widgets[0]?.title).toBe('My Grid')
  })

  it('should handle nested layout with multiple widgets', () => {
    const spec: LayoutSpec = {
      type: 'vsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        {
          type: 'hsplit',
          children: [
            { type: 'leaf', leaf: 10 },
            { type: 'leaf', leaf: 15 }
          ],
          splitRatio: 0.5
        }
      ],
      splitRatio: 0.5
    }
    const widgets = new Map<number, WidgetInfo>([
      [5, { sectionId: 5, tableId: 'A', widgetType: 'record' }],
      [10, { sectionId: 10, tableId: 'B', widgetType: 'single' }],
      [15, { sectionId: 15, tableId: 'C', widgetType: 'chart' }]
    ])

    const result = formatGetLayoutResult(spec, widgets)

    expect(result.widgets).toHaveLength(3)
    expect(result.widgets.map((w) => w.section)).toEqual([5, 10, 15])
  })

  it('should preserve widget order from map iteration', () => {
    const spec: LayoutSpec = { type: 'leaf', leaf: 5 }
    const widgets = new Map<number, WidgetInfo>([
      [10, { sectionId: 10, tableId: 'B', widgetType: 'record' }],
      [5, { sectionId: 5, tableId: 'A', widgetType: 'record' }],
      [15, { sectionId: 15, tableId: 'C', widgetType: 'record' }]
    ])

    const result = formatGetLayoutResult(spec, widgets)

    // Map iteration order is insertion order
    expect(result.widgets.map((w) => w.section)).toEqual([10, 5, 15])
  })
})

// =============================================================================
// Utility Functions
// =============================================================================

describe('extractSectionIds', () => {
  it('should extract single section ID from leaf', () => {
    const spec: LayoutSpec = { type: 'leaf', leaf: 5 }
    const ids = extractSectionIds(spec)

    expect(ids).toEqual(new Set([5]))
  })

  it('should extract section IDs from hsplit', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        { type: 'leaf', leaf: 10 }
      ],
      splitRatio: 0.5
    }
    const ids = extractSectionIds(spec)

    expect(ids).toEqual(new Set([5, 10]))
  })

  it('should extract section IDs from vsplit', () => {
    const spec: LayoutSpec = {
      type: 'vsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        { type: 'leaf', leaf: 10 }
      ],
      splitRatio: 0.5
    }
    const ids = extractSectionIds(spec)

    expect(ids).toEqual(new Set([5, 10]))
  })

  it('should extract section IDs from nested structure', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        {
          type: 'vsplit',
          children: [
            { type: 'leaf', leaf: 10 },
            {
              type: 'hsplit',
              children: [
                { type: 'leaf', leaf: 15 },
                { type: 'leaf', leaf: 20 }
              ],
              splitRatio: 0.5
            }
          ],
          splitRatio: 0.5
        }
      ],
      splitRatio: 0.5
    }
    const ids = extractSectionIds(spec)

    expect(ids).toEqual(new Set([5, 10, 15, 20]))
  })

  it('should not include duplicates', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        {
          type: 'vsplit',
          children: [
            { type: 'leaf', leaf: 5 },
            { type: 'leaf', leaf: 10 }
          ],
          splitRatio: 0.5
        }
      ],
      splitRatio: 0.5
    }
    const ids = extractSectionIds(spec)

    expect(ids).toEqual(new Set([5, 10]))
  })

  it('should handle complex nested layout', () => {
    const spec: LayoutSpec = {
      type: 'vsplit',
      children: [
        {
          type: 'hsplit',
          children: [
            { type: 'leaf', leaf: 1 },
            { type: 'leaf', leaf: 2 }
          ],
          splitRatio: 0.5
        },
        {
          type: 'hsplit',
          children: [
            { type: 'leaf', leaf: 3 },
            { type: 'leaf', leaf: 4 }
          ],
          splitRatio: 0.5
        }
      ],
      splitRatio: 0.5
    }
    const ids = extractSectionIds(spec)

    expect(ids).toEqual(new Set([1, 2, 3, 4]))
  })
})

describe('countWidgets', () => {
  it('should count single widget in leaf', () => {
    const spec: LayoutSpec = { type: 'leaf', leaf: 5 }
    expect(countWidgets(spec)).toBe(1)
  })

  it('should count widgets in hsplit', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        { type: 'leaf', leaf: 10 }
      ],
      splitRatio: 0.5
    }
    expect(countWidgets(spec)).toBe(2)
  })

  it('should count widgets in vsplit', () => {
    const spec: LayoutSpec = {
      type: 'vsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        { type: 'leaf', leaf: 10 }
      ],
      splitRatio: 0.5
    }
    expect(countWidgets(spec)).toBe(2)
  })

  it('should count widgets in nested structure', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        {
          type: 'vsplit',
          children: [
            { type: 'leaf', leaf: 10 },
            { type: 'leaf', leaf: 15 }
          ],
          splitRatio: 0.5
        }
      ],
      splitRatio: 0.5
    }
    expect(countWidgets(spec)).toBe(3)
  })

  it('should count all widgets in deeply nested structure', () => {
    const spec: LayoutSpec = {
      type: 'vsplit',
      children: [
        {
          type: 'hsplit',
          children: [
            { type: 'leaf', leaf: 1 },
            { type: 'leaf', leaf: 2 }
          ],
          splitRatio: 0.5
        },
        {
          type: 'hsplit',
          children: [
            { type: 'leaf', leaf: 3 },
            {
              type: 'vsplit',
              children: [
                { type: 'leaf', leaf: 4 },
                { type: 'leaf', leaf: 5 }
              ],
              splitRatio: 0.5
            }
          ],
          splitRatio: 0.5
        }
      ],
      splitRatio: 0.5
    }
    expect(countWidgets(spec)).toBe(5)
  })

  it('should count widgets with three children split', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        {
          type: 'hsplit',
          children: [
            { type: 'leaf', leaf: 10 },
            { type: 'leaf', leaf: 15 }
          ],
          splitRatio: 0.5
        }
      ],
      splitRatio: 0.33
    }
    expect(countWidgets(spec)).toBe(3)
  })
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('fromLayoutSpec - Edge Cases', () => {
  it('should handle single widget page', () => {
    const spec: LayoutSpec = { type: 'leaf', leaf: 100 }
    const result = fromLayoutSpec(spec)
    expect(result).toBe(100)
  })

  it('should handle empty split (theoretical edge case)', () => {
    // Note: This shouldn't happen in practice, but testing defensive behavior
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [],
      splitRatio: 0.5
    }

    const result = fromLayoutSpec(spec) as Extract<LayoutNode, { cols: LayoutNode[] }>
    expect(result.cols).toEqual([])
  })

  it('should preserve splitRatio values (not used in output but validated)', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        { type: 'leaf', leaf: 10 }
      ],
      splitRatio: 0.7
    }

    // fromLayoutSpec doesn't preserve splitRatio in output (weights lost)
    const result = fromLayoutSpec(spec) as Extract<LayoutNode, { cols: LayoutNode[] }>
    expect(result).toEqual({ cols: [5, 10] })
  })

  it('should handle large section IDs', () => {
    const spec: LayoutSpec = { type: 'leaf', leaf: 999999 }
    const result = fromLayoutSpec(spec)
    expect(result).toBe(999999)
  })

  it('should handle many children in split', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: 1 },
        {
          type: 'hsplit',
          children: [
            { type: 'leaf', leaf: 2 },
            {
              type: 'hsplit',
              children: [
                { type: 'leaf', leaf: 3 },
                {
                  type: 'hsplit',
                  children: [
                    { type: 'leaf', leaf: 4 },
                    { type: 'leaf', leaf: 5 }
                  ],
                  splitRatio: 0.5
                }
              ],
              splitRatio: 0.5
            }
          ],
          splitRatio: 0.5
        }
      ],
      splitRatio: 0.5
    }

    const ids = extractSectionIds(spec)
    expect(ids.size).toBe(5)
    expect(countWidgets(spec)).toBe(5)
  })
})

// =============================================================================
// Options Parameter
// =============================================================================

describe('fromLayoutSpec - Options Parameter', () => {
  it('should accept empty options', () => {
    const spec: LayoutSpec = { type: 'leaf', leaf: 5 }
    const result = fromLayoutSpec(spec, {})
    expect(result).toBe(5)
  })

  it('should accept widgets option', () => {
    const spec: LayoutSpec = { type: 'leaf', leaf: 5 }
    const widgets = new Map<number, WidgetInfo>([
      [5, { sectionId: 5, tableId: 'Products', widgetType: 'record' }]
    ])
    const result = fromLayoutSpec(spec, { widgets })
    expect(result).toBe(5)
  })

  it('should ignore includeLinks option (Architecture B)', () => {
    const spec: LayoutSpec = { type: 'leaf', leaf: 5 }
    // includeLinks is ignored in Architecture B
    const result = fromLayoutSpec(spec, { includeLinks: true })
    expect(result).toBe(5)
  })

  it('should work without any options', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        { type: 'leaf', leaf: 10 }
      ],
      splitRatio: 0.5
    }
    const result = fromLayoutSpec(spec)
    expect(result).toEqual({ cols: [5, 10] })
  })
})
