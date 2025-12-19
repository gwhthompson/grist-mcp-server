/**
 * Unit tests for to-layout-spec transformation
 *
 * Tests conversion from declarative layout to Grist's internal LayoutSpec:
 * - Simple section IDs
 * - Weighted sections
 * - New widget placeholders
 * - Column and row splits
 * - Nested layouts
 * - Placeholder replacement
 * - Weight calculations
 */

import { describe, expect, it } from 'vitest'
import type { LayoutNode } from '../../../../src/services/declarative-layout/schema.js'
import {
  replacePlaceholders,
  toLayoutSpec,
  validateExistingSections
} from '../../../../src/services/declarative-layout/to-layout-spec.js'
import type { LayoutSpec } from '../../../../src/types.js'

// =============================================================================
// Simple Transformations
// =============================================================================

describe('toLayoutSpec - Simple Nodes', () => {
  it('should transform section ID to leaf', () => {
    const layout: LayoutNode = 5
    const result = toLayoutSpec(layout)

    expect(result.layoutSpec).toEqual({
      type: 'leaf',
      leaf: 5
    })
    expect(result.newWidgets).toEqual([])
    expect(result.existingWidgetLinks).toEqual([])
  })

  it('should transform weighted section to leaf', () => {
    const layout: LayoutNode = [10, 2.5]
    const result = toLayoutSpec(layout)

    expect(result.layoutSpec).toEqual({
      type: 'leaf',
      leaf: 10
    })
    // Weight is handled at parent level
    expect(result.newWidgets).toEqual([])
  })

  it('should transform existing pane to leaf', () => {
    const layout: LayoutNode = { section: 15, weight: 1.5 }
    const result = toLayoutSpec(layout)

    expect(result.layoutSpec).toEqual({
      type: 'leaf',
      leaf: 15
    })
    expect(result.newWidgets).toEqual([])
  })
})

// =============================================================================
// New Widget Transformation
// =============================================================================

describe('toLayoutSpec - New Widgets', () => {
  it('should transform new pane to placeholder', () => {
    const layout: LayoutNode = {
      table: 'Products',
      widget: 'grid'
    }
    const result = toLayoutSpec(layout)

    expect(result.layoutSpec.type).toBe('leaf')
    expect((result.layoutSpec as { leaf: number }).leaf).toBeLessThan(0) // Negative placeholder
    expect(result.newWidgets).toHaveLength(1)
    expect(result.newWidgets[0]).toEqual({
      table: 'Products',
      widget: 'grid'
    })
  })

  it('should assign sequential negative placeholders', () => {
    const layout: LayoutNode = {
      cols: [
        { table: 'Products', widget: 'grid' },
        { table: 'Orders', widget: 'card' }
      ]
    }
    const result = toLayoutSpec(layout)

    expect(result.newWidgets).toHaveLength(2)

    const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'hsplit' }>
    const leaf1 = spec.children[0] as Extract<LayoutSpec, { type: 'leaf' }>
    const leaf2 = spec.children[1] as Extract<LayoutSpec, { type: 'leaf' }>

    expect(leaf1.leaf).toBe(-1)
    expect(leaf2.leaf).toBe(-2)
  })

  it('should populate placeholderMap correctly', () => {
    const layout: LayoutNode = {
      cols: [
        { table: 'Products', widget: 'grid' },
        { table: 'Orders', widget: 'card' }
      ]
    }
    const result = toLayoutSpec(layout)

    expect(result.placeholderMap.size).toBe(2)
    expect(result.placeholderMap.get(-1)).toBe(0) // First widget
    expect(result.placeholderMap.get(-2)).toBe(1) // Second widget
  })

  it('should preserve new widget properties', () => {
    const layout: LayoutNode = {
      table: 'Sales',
      widget: 'chart',
      chartType: 'bar',
      title: 'Sales Chart',
      x_axis: 'Date',
      y_axis: ['Revenue'],
      weight: 2.0
    }
    const result = toLayoutSpec(layout)

    expect(result.newWidgets[0]).toEqual({
      table: 'Sales',
      widget: 'chart',
      chartType: 'bar',
      title: 'Sales Chart',
      x_axis: 'Date',
      y_axis: ['Revenue'],
      weight: 2.0
    })
  })
})

// =============================================================================
// Split Transformations
// =============================================================================

describe('toLayoutSpec - Splits', () => {
  describe('two children', () => {
    it('should create hsplit for cols', () => {
      const layout: LayoutNode = { cols: [5, 10] }
      const result = toLayoutSpec(layout)

      expect(result.layoutSpec).toEqual({
        type: 'hsplit',
        children: [
          { type: 'leaf', leaf: 5 },
          { type: 'leaf', leaf: 10 }
        ],
        splitRatio: 0.5
      })
    })

    it('should create vsplit for rows', () => {
      const layout: LayoutNode = { rows: [5, 10] }
      const result = toLayoutSpec(layout)

      expect(result.layoutSpec).toEqual({
        type: 'vsplit',
        children: [
          { type: 'leaf', leaf: 5 },
          { type: 'leaf', leaf: 10 }
        ],
        splitRatio: 0.5
      })
    })

    it('should calculate splitRatio from weights', () => {
      // Weighted: [1, 3] → ratio 1/4 = 0.25
      const layout: LayoutNode = {
        cols: [
          [5, 1],
          [10, 3]
        ]
      }
      const result = toLayoutSpec(layout)

      const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'hsplit' }>
      expect(spec.splitRatio).toBe(0.25)
    })

    it('should handle custom weights on nodes', () => {
      // Weights: [2, 3] → ratio 2/5 = 0.4
      const layout: LayoutNode = {
        rows: [
          { section: 5, weight: 2 },
          { section: 10, weight: 3 }
        ]
      }
      const result = toLayoutSpec(layout)

      const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'vsplit' }>
      expect(spec.splitRatio).toBe(0.4)
    })

    it('should default to weight 1 when not specified', () => {
      const layout: LayoutNode = {
        cols: [
          5, // weight 1
          { section: 10, weight: 2 } // weight 2
        ]
      }
      const result = toLayoutSpec(layout)

      // Total weight: 3, first weight: 1 → ratio 1/3
      const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'hsplit' }>
      expect(spec.splitRatio).toBeCloseTo(1 / 3)
    })
  })

  describe('three or more children', () => {
    it('should create nested binary splits', () => {
      const layout: LayoutNode = { cols: [5, 10, 15] }
      const result = toLayoutSpec(layout)

      // Expected: hsplit(5, hsplit(10, 15))
      const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'hsplit' }>
      expect(spec.type).toBe('hsplit')
      expect(spec.children).toHaveLength(2)

      const firstChild = spec.children[0] as Extract<LayoutSpec, { type: 'leaf' }>
      expect(firstChild.leaf).toBe(5)

      const secondChild = spec.children[1] as Extract<LayoutSpec, { type: 'hsplit' }>
      expect(secondChild.type).toBe('hsplit')
      expect(secondChild.children).toHaveLength(2)
    })

    it('should calculate nested split ratios correctly', () => {
      // Weights: [1, 2, 1] (total=4)
      // First split: 1/(1+2+1) = 1/4 = 0.25
      // Second split: 2/(2+1) = 2/3 ≈ 0.667
      const layout: LayoutNode = {
        cols: [
          [5, 1],
          [10, 2],
          [15, 1]
        ]
      }
      const result = toLayoutSpec(layout)

      const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'hsplit' }>
      expect(spec.splitRatio).toBe(0.25)

      const nested = spec.children[1] as Extract<LayoutSpec, { type: 'hsplit' }>
      expect(nested.splitRatio).toBeCloseTo(2 / 3)
    })

    it('should handle four children', () => {
      const layout: LayoutNode = { rows: [5, 10, 15, 20] }
      const result = toLayoutSpec(layout)

      // Expected: vsplit(5, vsplit(10, vsplit(15, 20)))
      const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'vsplit' }>
      expect(spec.type).toBe('vsplit')

      const firstChild = spec.children[0] as Extract<LayoutSpec, { type: 'leaf' }>
      expect(firstChild.leaf).toBe(5)

      const level2 = spec.children[1] as Extract<LayoutSpec, { type: 'vsplit' }>
      expect(level2.type).toBe('vsplit')

      const level3 = level2.children[1] as Extract<LayoutSpec, { type: 'vsplit' }>
      expect(level3.type).toBe('vsplit')

      const lastChild1 = level3.children[0] as Extract<LayoutSpec, { type: 'leaf' }>
      const lastChild2 = level3.children[1] as Extract<LayoutSpec, { type: 'leaf' }>
      expect(lastChild1.leaf).toBe(15)
      expect(lastChild2.leaf).toBe(20)
    })
  })
})

// =============================================================================
// Nested Layouts
// =============================================================================

describe('toLayoutSpec - Nested Layouts', () => {
  it('should handle cols inside rows', () => {
    const layout: LayoutNode = {
      rows: [
        5,
        {
          cols: [10, 15]
        }
      ]
    }
    const result = toLayoutSpec(layout)

    const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'vsplit' }>
    expect(spec.type).toBe('vsplit')

    const firstChild = spec.children[0] as Extract<LayoutSpec, { type: 'leaf' }>
    expect(firstChild.leaf).toBe(5)

    const secondChild = spec.children[1] as Extract<LayoutSpec, { type: 'hsplit' }>
    expect(secondChild.type).toBe('hsplit')
  })

  it('should handle rows inside cols', () => {
    const layout: LayoutNode = {
      cols: [
        {
          rows: [5, 10]
        },
        15
      ]
    }
    const result = toLayoutSpec(layout)

    const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'hsplit' }>
    expect(spec.type).toBe('hsplit')

    const firstChild = spec.children[0] as Extract<LayoutSpec, { type: 'vsplit' }>
    expect(firstChild.type).toBe('vsplit')

    const secondChild = spec.children[1] as Extract<LayoutSpec, { type: 'leaf' }>
    expect(secondChild.leaf).toBe(15)
  })

  it('should handle deeply nested structure', () => {
    const layout: LayoutNode = {
      cols: [
        5,
        {
          rows: [
            10,
            {
              cols: [15, 20]
            }
          ]
        }
      ]
    }
    const result = toLayoutSpec(layout)

    const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'hsplit' }>
    expect(spec.type).toBe('hsplit')

    const level1 = spec.children[1] as Extract<LayoutSpec, { type: 'vsplit' }>
    expect(level1.type).toBe('vsplit')

    const level2 = level1.children[1] as Extract<LayoutSpec, { type: 'hsplit' }>
    expect(level2.type).toBe('hsplit')
  })
})

// =============================================================================
// Mixed Layouts (Existing + New Widgets)
// =============================================================================

describe('toLayoutSpec - Mixed Layouts', () => {
  it('should handle layout with both existing and new widgets', () => {
    const layout: LayoutNode = {
      cols: [
        5, // Existing
        { table: 'Products', widget: 'grid' } // New
      ]
    }
    const result = toLayoutSpec(layout)

    expect(result.newWidgets).toHaveLength(1)
    expect(result.newWidgets[0]).toEqual({
      table: 'Products',
      widget: 'grid'
    })

    const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'hsplit' }>
    const firstChild = spec.children[0] as Extract<LayoutSpec, { type: 'leaf' }>
    const secondChild = spec.children[1] as Extract<LayoutSpec, { type: 'leaf' }>

    expect(firstChild.leaf).toBe(5)
    expect(secondChild.leaf).toBe(-1) // Placeholder
  })

  it('should preserve order of new widgets in traversal', () => {
    const layout: LayoutNode = {
      rows: [
        { table: 'A', widget: 'grid' },
        5,
        { table: 'B', widget: 'card' },
        {
          cols: [10, { table: 'C', widget: 'form' }]
        }
      ]
    }
    const result = toLayoutSpec(layout)

    expect(result.newWidgets).toHaveLength(3)
    expect(result.newWidgets[0]?.table).toBe('A')
    expect(result.newWidgets[1]?.table).toBe('B')
    expect(result.newWidgets[2]?.table).toBe('C')
  })
})

// =============================================================================
// Placeholder Replacement
// =============================================================================

describe('replacePlaceholders', () => {
  it('should replace single placeholder in leaf', () => {
    const spec: LayoutSpec = { type: 'leaf', leaf: -1 }
    const map = new Map([[-1, 100]])

    const result = replacePlaceholders(spec, map)

    expect(result).toEqual({
      type: 'leaf',
      leaf: 100
    })
  })

  it('should not modify positive leaf IDs', () => {
    const spec: LayoutSpec = { type: 'leaf', leaf: 5 }
    const map = new Map([[-1, 100]])

    const result = replacePlaceholders(spec, map)

    expect(result).toEqual(spec)
  })

  it('should replace placeholders in split children', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: -1 },
        { type: 'leaf', leaf: -2 }
      ],
      splitRatio: 0.5
    }
    const map = new Map([
      [-1, 100],
      [-2, 200]
    ])

    const result = replacePlaceholders(spec, map)

    const hsplit = result as Extract<LayoutSpec, { type: 'hsplit' }>
    expect(hsplit.children[0]).toEqual({ type: 'leaf', leaf: 100 })
    expect(hsplit.children[1]).toEqual({ type: 'leaf', leaf: 200 })
    expect(hsplit.splitRatio).toBe(0.5)
  })

  it('should replace placeholders in nested structure', () => {
    const spec: LayoutSpec = {
      type: 'vsplit',
      children: [
        { type: 'leaf', leaf: 5 },
        {
          type: 'hsplit',
          children: [
            { type: 'leaf', leaf: -1 },
            { type: 'leaf', leaf: 10 }
          ],
          splitRatio: 0.4
        }
      ],
      splitRatio: 0.5
    }
    const map = new Map([[-1, 100]])

    const result = replacePlaceholders(spec, map)

    const vsplit = result as Extract<LayoutSpec, { type: 'vsplit' }>
    const nested = vsplit.children[1] as Extract<LayoutSpec, { type: 'hsplit' }>
    const nestedLeaf = nested.children[0] as Extract<LayoutSpec, { type: 'leaf' }>

    expect(nestedLeaf.leaf).toBe(100)
  })

  it('should throw error for missing placeholder mapping', () => {
    const spec: LayoutSpec = { type: 'leaf', leaf: -1 }
    const map = new Map([[-2, 100]]) // Wrong placeholder

    expect(() => replacePlaceholders(spec, map)).toThrow(/No section ID found for placeholder/)
  })

  it('should handle multiple placeholders correctly', () => {
    const spec: LayoutSpec = {
      type: 'hsplit',
      children: [
        { type: 'leaf', leaf: -1 },
        {
          type: 'vsplit',
          children: [
            { type: 'leaf', leaf: -2 },
            { type: 'leaf', leaf: -3 }
          ],
          splitRatio: 0.6
        }
      ],
      splitRatio: 0.5
    }
    const map = new Map([
      [-1, 100],
      [-2, 200],
      [-3, 300]
    ])

    const result = replacePlaceholders(spec, map)

    const hsplit = result as Extract<LayoutSpec, { type: 'hsplit' }>
    const leaf1 = hsplit.children[0] as Extract<LayoutSpec, { type: 'leaf' }>
    const vsplit = hsplit.children[1] as Extract<LayoutSpec, { type: 'vsplit' }>
    const leaf2 = vsplit.children[0] as Extract<LayoutSpec, { type: 'leaf' }>
    const leaf3 = vsplit.children[1] as Extract<LayoutSpec, { type: 'leaf' }>

    expect(leaf1.leaf).toBe(100)
    expect(leaf2.leaf).toBe(200)
    expect(leaf3.leaf).toBe(300)
  })
})

// =============================================================================
// Validation
// =============================================================================

describe('validateExistingSections', () => {
  it('should pass for valid section ID', () => {
    const layout: LayoutNode = 5
    const existing = new Set([5, 10, 15])

    expect(() => validateExistingSections(layout, existing)).not.toThrow()
  })

  it('should throw for missing section ID', () => {
    const layout: LayoutNode = 20
    const existing = new Set([5, 10, 15])

    expect(() => validateExistingSections(layout, existing)).toThrow(/Section 20 not found/)
  })

  it('should pass for new pane (not validated)', () => {
    const layout: LayoutNode = { table: 'Products', widget: 'grid' }
    const existing = new Set([5, 10, 15])

    expect(() => validateExistingSections(layout, existing)).not.toThrow()
  })

  it('should validate weighted section', () => {
    const layout: LayoutNode = [10, 2.5]
    const existing = new Set([10])

    expect(() => validateExistingSections(layout, existing)).not.toThrow()
  })

  it('should throw for missing weighted section', () => {
    const layout: LayoutNode = [20, 1.5]
    const existing = new Set([10])

    expect(() => validateExistingSections(layout, existing)).toThrow(/Section 20 not found/)
  })

  it('should validate existing pane', () => {
    const layout: LayoutNode = { section: 15 }
    const existing = new Set([15])

    expect(() => validateExistingSections(layout, existing)).not.toThrow()
  })

  it('should throw for missing existing pane', () => {
    const layout: LayoutNode = { section: 25 }
    const existing = new Set([15])

    expect(() => validateExistingSections(layout, existing)).toThrow(/Section 25 not found/)
  })

  it('should validate all sections in split', () => {
    const layout: LayoutNode = {
      cols: [5, 10, 15]
    }
    const existing = new Set([5, 10, 15])

    expect(() => validateExistingSections(layout, existing)).not.toThrow()
  })

  it('should throw if any section in split is missing', () => {
    const layout: LayoutNode = {
      cols: [5, 10, 20]
    }
    const existing = new Set([5, 10, 15])

    expect(() => validateExistingSections(layout, existing)).toThrow(/Section 20 not found/)
  })

  it('should validate nested structure', () => {
    const layout: LayoutNode = {
      rows: [
        5,
        {
          cols: [10, { section: 15 }]
        }
      ]
    }
    const existing = new Set([5, 10, 15])

    expect(() => validateExistingSections(layout, existing)).not.toThrow()
  })

  it('should provide available sections in error message', () => {
    const layout: LayoutNode = 99
    const existing = new Set([5, 10, 15])

    expect(() => validateExistingSections(layout, existing)).toThrow(
      /Available sections: 5, 10, 15/
    )
  })

  it('should handle mixed layout with new and existing widgets', () => {
    const layout: LayoutNode = {
      cols: [5, { table: 'Products', widget: 'grid' }, { section: 10 }]
    }
    const existing = new Set([5, 10])

    expect(() => validateExistingSections(layout, existing)).not.toThrow()
  })
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('toLayoutSpec - Edge Cases', () => {
  it('should handle empty weight as default 1', () => {
    const layout: LayoutNode = {
      cols: [5, 10]
    }
    const result = toLayoutSpec(layout)

    const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'hsplit' }>
    expect(spec.splitRatio).toBe(0.5) // Equal weights
  })

  it('should handle large weight values', () => {
    const layout: LayoutNode = {
      rows: [
        [5, 1000],
        [10, 1]
      ]
    }
    const result = toLayoutSpec(layout)

    const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'vsplit' }>
    expect(spec.splitRatio).toBeCloseTo(1000 / 1001)
  })

  it('should handle small fractional weights', () => {
    const layout: LayoutNode = {
      cols: [
        [5, 0.1],
        [10, 0.9]
      ]
    }
    const result = toLayoutSpec(layout)

    const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'hsplit' }>
    expect(spec.splitRatio).toBeCloseTo(0.1)
  })

  it('should preserve exact weight ratios', () => {
    const layout: LayoutNode = {
      rows: [
        [5, 1],
        [10, 2],
        [15, 3]
      ]
    }
    const result = toLayoutSpec(layout)

    const spec = result.layoutSpec as Extract<LayoutSpec, { type: 'vsplit' }>
    // First split: 1/6 (1 vs 2+3)
    expect(spec.splitRatio).toBeCloseTo(1 / 6)

    const nested = spec.children[1] as Extract<LayoutSpec, { type: 'vsplit' }>
    // Second split: 2/5 (2 vs 3)
    expect(nested.splitRatio).toBeCloseTo(2 / 5)
  })
})
