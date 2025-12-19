/**
 * Unit tests for declarative layout schema validation
 *
 * Tests:
 * - Layout node parsing and validation
 * - Link schema validation (7 link types)
 * - Type guards
 * - Utility functions (collectNewPanes, collectExistingSectionIds, etc.)
 */

import { describe, expect, it } from 'vitest'
import {
  type BreakdownOfLink,
  ChartOptionsSchema,
  type ChildOfLink,
  collectExistingSectionIds,
  collectNewPanes,
  DeclarativeChartTypeSchema,
  DeclarativeWidgetTypeSchema,
  type DetailOfLink,
  ExistingPaneSchema,
  getSectionId,
  getWeight,
  isBreakdownOfLink,
  isChildOfLink,
  isColSplit,
  isDetailOfLink,
  isExistingPane,
  isListedInLink,
  isMatchedByLink,
  isNewPane,
  isReferencedByLink,
  isRowSplit,
  isSectionId,
  isSyncedWithLink,
  isWeightedSection,
  type LayoutNode,
  LayoutNodeSchema,
  type Link,
  LinkSchema,
  type ListedInLink,
  type MatchedByLink,
  type NewPane,
  NewPaneSchema,
  type ReferencedByLink,
  type SyncedWithLink,
  WidgetIdSchema
} from '../../../../src/services/declarative-layout/schema.js'

// =============================================================================
// Widget ID Schema
// =============================================================================

describe('WidgetIdSchema', () => {
  it('should accept positive integers', () => {
    expect(WidgetIdSchema.parse(1)).toBe(1)
    expect(WidgetIdSchema.parse(42)).toBe(42)
    expect(WidgetIdSchema.parse(999999)).toBe(999999)
  })

  it('should reject zero and negative numbers', () => {
    expect(() => WidgetIdSchema.parse(0)).toThrow()
    expect(() => WidgetIdSchema.parse(-1)).toThrow()
    expect(() => WidgetIdSchema.parse(-100)).toThrow()
  })

  it('should reject non-integers', () => {
    expect(() => WidgetIdSchema.parse(1.5)).toThrow()
    expect(() => WidgetIdSchema.parse(3.14)).toThrow()
  })

  it('should reject non-numeric values', () => {
    expect(() => WidgetIdSchema.parse('5')).toThrow()
    expect(() => WidgetIdSchema.parse(null)).toThrow()
    expect(() => WidgetIdSchema.parse(undefined)).toThrow()
    expect(() => WidgetIdSchema.parse({})).toThrow()
  })
})

// =============================================================================
// Link Schemas
// =============================================================================

describe('Link Schemas', () => {
  describe('ChildOfLink', () => {
    it('should validate correct child_of link', () => {
      const link = {
        type: 'child_of',
        source_widget: 10,
        target_column: 'Category'
      }
      const result = LinkSchema.parse(link) as ChildOfLink
      expect(result.type).toBe('child_of')
      expect(result.source_widget).toBe(10)
      expect(result.target_column).toBe('Category')
    })

    it('should reject missing target_column', () => {
      const link = {
        type: 'child_of',
        source_widget: 10
      }
      expect(() => LinkSchema.parse(link)).toThrow()
    })

    it('should reject empty target_column', () => {
      const link = {
        type: 'child_of',
        source_widget: 10,
        target_column: ''
      }
      expect(() => LinkSchema.parse(link)).toThrow()
    })

    it('should reject extra properties', () => {
      const link = {
        type: 'child_of',
        source_widget: 10,
        target_column: 'Category',
        extra_field: 'not allowed'
      }
      expect(() => LinkSchema.parse(link)).toThrow()
    })
  })

  describe('MatchedByLink', () => {
    it('should validate correct matched_by link', () => {
      const link = {
        type: 'matched_by',
        source_widget: 20,
        source_column: 'Customer',
        target_column: 'Customer'
      }
      const result = LinkSchema.parse(link) as MatchedByLink
      expect(result.type).toBe('matched_by')
      expect(result.source_widget).toBe(20)
      expect(result.source_column).toBe('Customer')
      expect(result.target_column).toBe('Customer')
    })

    it('should reject missing columns', () => {
      const link1 = {
        type: 'matched_by',
        source_widget: 20,
        target_column: 'Customer'
      }
      expect(() => LinkSchema.parse(link1)).toThrow()

      const link2 = {
        type: 'matched_by',
        source_widget: 20,
        source_column: 'Customer'
      }
      expect(() => LinkSchema.parse(link2)).toThrow()
    })

    it('should reject empty column names', () => {
      const link = {
        type: 'matched_by',
        source_widget: 20,
        source_column: '',
        target_column: 'Customer'
      }
      expect(() => LinkSchema.parse(link)).toThrow()
    })
  })

  describe('DetailOfLink', () => {
    it('should validate correct detail_of link', () => {
      const link = {
        type: 'detail_of',
        source_widget: 30
      }
      const result = LinkSchema.parse(link) as DetailOfLink
      expect(result.type).toBe('detail_of')
      expect(result.source_widget).toBe(30)
    })

    it('should reject extra properties', () => {
      const link = {
        type: 'detail_of',
        source_widget: 30,
        extra: 'field'
      }
      expect(() => LinkSchema.parse(link)).toThrow()
    })
  })

  describe('BreakdownOfLink', () => {
    it('should validate correct breakdown_of link', () => {
      const link = {
        type: 'breakdown_of',
        source_widget: 40
      }
      const result = LinkSchema.parse(link) as BreakdownOfLink
      expect(result.type).toBe('breakdown_of')
      expect(result.source_widget).toBe(40)
    })
  })

  describe('ListedInLink', () => {
    it('should validate correct listed_in link', () => {
      const link = {
        type: 'listed_in',
        source_widget: 50,
        source_column: 'TeamMembers'
      }
      const result = LinkSchema.parse(link) as ListedInLink
      expect(result.type).toBe('listed_in')
      expect(result.source_widget).toBe(50)
      expect(result.source_column).toBe('TeamMembers')
    })

    it('should reject missing source_column', () => {
      const link = {
        type: 'listed_in',
        source_widget: 50
      }
      expect(() => LinkSchema.parse(link)).toThrow()
    })
  })

  describe('SyncedWithLink', () => {
    it('should validate correct synced_with link', () => {
      const link = {
        type: 'synced_with',
        source_widget: 60
      }
      const result = LinkSchema.parse(link) as SyncedWithLink
      expect(result.type).toBe('synced_with')
      expect(result.source_widget).toBe(60)
    })
  })

  describe('ReferencedByLink', () => {
    it('should validate correct referenced_by link', () => {
      const link = {
        type: 'referenced_by',
        source_widget: 70,
        source_column: 'Customer'
      }
      const result = LinkSchema.parse(link) as ReferencedByLink
      expect(result.type).toBe('referenced_by')
      expect(result.source_widget).toBe(70)
      expect(result.source_column).toBe('Customer')
    })

    it('should reject missing source_column', () => {
      const link = {
        type: 'referenced_by',
        source_widget: 70
      }
      expect(() => LinkSchema.parse(link)).toThrow()
    })
  })

  describe('Link discriminated union', () => {
    it('should reject unknown link type', () => {
      const link = {
        type: 'unknown_type',
        source_widget: 10
      }
      expect(() => LinkSchema.parse(link)).toThrow()
    })

    it('should reject missing type', () => {
      const link = {
        source_widget: 10
      }
      expect(() => LinkSchema.parse(link)).toThrow()
    })
  })
})

// =============================================================================
// Widget Type Schemas
// =============================================================================

describe('DeclarativeWidgetTypeSchema', () => {
  it('should accept all valid widget types', () => {
    expect(DeclarativeWidgetTypeSchema.parse('grid')).toBe('grid')
    expect(DeclarativeWidgetTypeSchema.parse('card')).toBe('card')
    expect(DeclarativeWidgetTypeSchema.parse('card_list')).toBe('card_list')
    expect(DeclarativeWidgetTypeSchema.parse('chart')).toBe('chart')
    expect(DeclarativeWidgetTypeSchema.parse('form')).toBe('form')
    expect(DeclarativeWidgetTypeSchema.parse('custom')).toBe('custom')
  })

  it('should reject invalid widget types', () => {
    expect(() => DeclarativeWidgetTypeSchema.parse('table')).toThrow()
    expect(() => DeclarativeWidgetTypeSchema.parse('unknown')).toThrow()
    expect(() => DeclarativeWidgetTypeSchema.parse('')).toThrow()
  })
})

describe('DeclarativeChartTypeSchema', () => {
  it('should accept all valid chart types', () => {
    expect(DeclarativeChartTypeSchema.parse('bar')).toBe('bar')
    expect(DeclarativeChartTypeSchema.parse('line')).toBe('line')
    expect(DeclarativeChartTypeSchema.parse('pie')).toBe('pie')
    expect(DeclarativeChartTypeSchema.parse('area')).toBe('area')
    expect(DeclarativeChartTypeSchema.parse('scatter')).toBe('scatter')
    expect(DeclarativeChartTypeSchema.parse('donut')).toBe('donut')
    expect(DeclarativeChartTypeSchema.parse('kaplan_meier')).toBe('kaplan_meier')
  })

  it('should reject invalid chart types', () => {
    expect(() => DeclarativeChartTypeSchema.parse('histogram')).toThrow()
    expect(() => DeclarativeChartTypeSchema.parse('bubble')).toThrow()
  })
})

// =============================================================================
// Pane Schemas
// =============================================================================

describe('ExistingPaneSchema', () => {
  it('should validate pane with only section', () => {
    const pane = { section: 100 }
    const result = ExistingPaneSchema.parse(pane)
    expect(result.section).toBe(100)
    expect(result.weight).toBeUndefined()
  })

  it('should validate pane with section and weight', () => {
    const pane = { section: 100, weight: 2.5 }
    const result = ExistingPaneSchema.parse(pane)
    expect(result.section).toBe(100)
    expect(result.weight).toBe(2.5)
  })

  it('should reject negative section IDs', () => {
    expect(() => ExistingPaneSchema.parse({ section: -1 })).toThrow()
  })

  it('should reject negative weights', () => {
    expect(() => ExistingPaneSchema.parse({ section: 100, weight: -1 })).toThrow()
  })

  it('should reject zero weight', () => {
    expect(() => ExistingPaneSchema.parse({ section: 100, weight: 0 })).toThrow()
  })

  it('should reject extra properties', () => {
    expect(() => ExistingPaneSchema.parse({ section: 100, extra: 'field' })).toThrow()
  })
})

describe('ChartOptionsSchema', () => {
  it('should accept valid chart options', () => {
    const options = {
      multiseries: true,
      lineConnectGaps: false,
      stacked: true,
      orientation: 'h' as const,
      donutHoleSize: 0.5
    }
    const result = ChartOptionsSchema.parse(options)
    expect(result).toEqual(options)
  })

  it('should accept undefined (optional)', () => {
    const result = ChartOptionsSchema.parse(undefined)
    expect(result).toBeUndefined()
  })

  it('should reject invalid donut hole size', () => {
    expect(() => ChartOptionsSchema.parse({ donutHoleSize: -0.1 })).toThrow()
    expect(() => ChartOptionsSchema.parse({ donutHoleSize: 1.1 })).toThrow()
  })

  it('should reject invalid orientation', () => {
    expect(() => ChartOptionsSchema.parse({ orientation: 'x' })).toThrow()
  })

  it('should accept zero text size', () => {
    // textSize must be positive, so 0 should fail
    expect(() => ChartOptionsSchema.parse({ textSize: 0 })).toThrow()
  })

  it('should accept positive text size', () => {
    const result = ChartOptionsSchema.parse({ textSize: 14 })
    expect(result?.textSize).toBe(14)
  })
})

describe('NewPaneSchema', () => {
  it('should validate minimal new pane', () => {
    const pane = {
      table: 'Products',
      widget: 'grid' as const
    }
    const result = NewPaneSchema.parse(pane)
    expect(result.table).toBe('Products')
    expect(result.widget).toBe('grid')
  })

  it('should apply default widget type', () => {
    const pane = {
      table: 'Products'
    }
    const result = NewPaneSchema.parse(pane)
    expect(result.widget).toBe('grid')
  })

  it('should validate pane with all optional fields', () => {
    const pane = {
      table: 'Sales',
      widget: 'grid' as const,
      title: 'Sales Table',
      weight: 1.5
    }
    const result = NewPaneSchema.parse(pane)
    expect(result.table).toBe('Sales')
    expect(result.title).toBe('Sales Table')
    expect(result.weight).toBe(1.5)
  })

  it('should require chartType when widget is chart', () => {
    const pane = {
      table: 'Sales',
      widget: 'chart' as const
    }
    expect(() => NewPaneSchema.parse(pane)).toThrow(/chartType is required/)
  })

  it('should validate chart pane with chartType', () => {
    const pane = {
      table: 'Sales',
      widget: 'chart' as const,
      chartType: 'bar' as const,
      x_axis: 'Date',
      y_axis: ['Revenue']
    }
    const result = NewPaneSchema.parse(pane)
    expect(result.widget).toBe('chart')
    expect(result.chartType).toBe('bar')
    expect(result.x_axis).toBe('Date')
    expect(result.y_axis).toEqual(['Revenue'])
  })

  it('should require y_axis for scatter charts', () => {
    const pane = {
      table: 'Sales',
      widget: 'chart' as const,
      chartType: 'scatter' as const,
      x_axis: 'Price'
    }
    expect(() => NewPaneSchema.parse(pane)).toThrow(/Scatter charts require/)
  })

  it('should accept scatter chart with y_axis', () => {
    const pane = {
      table: 'Sales',
      widget: 'chart' as const,
      chartType: 'scatter' as const,
      x_axis: 'Price',
      y_axis: ['Quantity']
    }
    const result = NewPaneSchema.parse(pane)
    expect(result.chartType).toBe('scatter')
    expect(result.y_axis).toEqual(['Quantity'])
  })

  it('should reject empty table name', () => {
    const pane = {
      table: '',
      widget: 'grid' as const
    }
    expect(() => NewPaneSchema.parse(pane)).toThrow()
  })

  it('should reject empty title', () => {
    const pane = {
      table: 'Products',
      widget: 'grid' as const,
      title: ''
    }
    expect(() => NewPaneSchema.parse(pane)).toThrow()
  })
})

// =============================================================================
// LayoutNode Schema
// =============================================================================

describe('LayoutNodeSchema', () => {
  describe('section ID', () => {
    it('should accept positive integer', () => {
      const node = 5
      const result = LayoutNodeSchema.parse(node)
      expect(result).toBe(5)
    })

    it('should reject negative integer', () => {
      expect(() => LayoutNodeSchema.parse(-5)).toThrow()
    })
  })

  describe('weighted section', () => {
    it('should accept [id, weight] tuple', () => {
      const node = [10, 2.5]
      const result = LayoutNodeSchema.parse(node)
      expect(result).toEqual([10, 2.5])
    })

    it('should reject negative weight', () => {
      expect(() => LayoutNodeSchema.parse([10, -1])).toThrow()
    })

    it('should reject wrong tuple length', () => {
      expect(() => LayoutNodeSchema.parse([10])).toThrow()
      expect(() => LayoutNodeSchema.parse([10, 2, 3])).toThrow()
    })
  })

  describe('existing pane', () => {
    it('should accept pane with section', () => {
      const node = { section: 20 }
      const result = LayoutNodeSchema.parse(node)
      expect(result).toEqual({ section: 20 })
    })
  })

  describe('new pane', () => {
    it('should accept new widget definition', () => {
      const node = {
        table: 'Products',
        widget: 'card' as const
      }
      const result = LayoutNodeSchema.parse(node)
      expect(result).toMatchObject({ table: 'Products', widget: 'card' })
    })
  })

  describe('column split', () => {
    it('should accept cols split with 2 children', () => {
      const node = {
        cols: [5, 10]
      }
      const result = LayoutNodeSchema.parse(node)
      expect(result).toEqual({ cols: [5, 10] })
    })

    it('should accept cols split with weight', () => {
      const node = {
        cols: [5, 10],
        weight: 1.5
      }
      const result = LayoutNodeSchema.parse(node)
      expect(result).toEqual({ cols: [5, 10], weight: 1.5 })
    })

    it('should reject cols split with less than 2 children', () => {
      expect(() => LayoutNodeSchema.parse({ cols: [5] })).toThrow()
    })

    it('should reject cols split with more than 10 children', () => {
      const cols = Array.from({ length: 11 }, (_, i) => i + 1)
      expect(() => LayoutNodeSchema.parse({ cols })).toThrow()
    })

    it('should accept nested cols splits', () => {
      const node = {
        cols: [
          5,
          {
            cols: [10, 15]
          }
        ]
      }
      const result = LayoutNodeSchema.parse(node)
      expect(result).toEqual(node)
    })
  })

  describe('row split', () => {
    it('should accept rows split with 2 children', () => {
      const node = {
        rows: [5, 10]
      }
      const result = LayoutNodeSchema.parse(node)
      expect(result).toEqual({ rows: [5, 10] })
    })

    it('should accept rows split with weight', () => {
      const node = {
        rows: [5, 10],
        weight: 2.0
      }
      const result = LayoutNodeSchema.parse(node)
      expect(result).toEqual({ rows: [5, 10], weight: 2.0 })
    })

    it('should accept nested rows splits', () => {
      const node = {
        rows: [
          5,
          {
            rows: [10, 15]
          }
        ]
      }
      const result = LayoutNodeSchema.parse(node)
      expect(result).toEqual(node)
    })
  })

  describe('complex nested layouts', () => {
    it('should accept deeply nested layout', () => {
      const node = {
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
      const result = LayoutNodeSchema.parse(node)
      expect(result).toEqual(node)
    })

    it('should accept layout mixing section types', () => {
      const node = {
        rows: [
          5, // Simple section ID
          [10, 2.0], // Weighted section
          { section: 15 }, // Existing pane
          { table: 'Products', widget: 'grid' as const } // New pane
        ]
      }
      const result = LayoutNodeSchema.parse(node)
      expect(result).toMatchObject(node)
    })
  })
})

// =============================================================================
// Type Guards
// =============================================================================

describe('Type Guards', () => {
  describe('isSectionId', () => {
    it('should return true for number', () => {
      expect(isSectionId(5)).toBe(true)
      expect(isSectionId(100)).toBe(true)
    })

    it('should return false for non-numbers', () => {
      expect(isSectionId([5, 2])).toBe(false)
      expect(isSectionId({ section: 5 })).toBe(false)
      expect(isSectionId({ table: 'T' })).toBe(false)
      expect(isSectionId({ cols: [1, 2] })).toBe(false)
    })
  })

  describe('isWeightedSection', () => {
    it('should return true for [number, number] tuple', () => {
      expect(isWeightedSection([5, 2])).toBe(true)
      expect(isWeightedSection([10, 1.5])).toBe(true)
    })

    it('should return false for non-tuples', () => {
      expect(isWeightedSection(5)).toBe(false)
      expect(isWeightedSection([5])).toBe(false)
      expect(isWeightedSection({ section: 5 })).toBe(false)
    })
  })

  describe('isExistingPane', () => {
    it('should return true for object with section', () => {
      expect(isExistingPane({ section: 5 })).toBe(true)
      expect(isExistingPane({ section: 5, weight: 2 })).toBe(true)
    })

    it('should return false for other types', () => {
      expect(isExistingPane(5)).toBe(false)
      expect(isExistingPane([5, 2])).toBe(false)
      expect(isExistingPane({ table: 'T' })).toBe(false)
    })
  })

  describe('isNewPane', () => {
    it('should return true for object with table', () => {
      expect(isNewPane({ table: 'Products', widget: 'grid' })).toBe(true)
    })

    it('should return false for other types', () => {
      expect(isNewPane(5)).toBe(false)
      expect(isNewPane({ section: 5 })).toBe(false)
      expect(isNewPane({ cols: [1, 2] })).toBe(false)
    })
  })

  describe('isColSplit', () => {
    it('should return true for object with cols', () => {
      expect(isColSplit({ cols: [1, 2] })).toBe(true)
      expect(isColSplit({ cols: [1, 2], weight: 1.5 })).toBe(true)
    })

    it('should return false for other types', () => {
      expect(isColSplit(5)).toBe(false)
      expect(isColSplit({ rows: [1, 2] })).toBe(false)
      expect(isColSplit({ section: 5 })).toBe(false)
    })
  })

  describe('isRowSplit', () => {
    it('should return true for object with rows', () => {
      expect(isRowSplit({ rows: [1, 2] })).toBe(true)
      expect(isRowSplit({ rows: [1, 2], weight: 2.0 })).toBe(true)
    })

    it('should return false for other types', () => {
      expect(isRowSplit(5)).toBe(false)
      expect(isRowSplit({ cols: [1, 2] })).toBe(false)
      expect(isRowSplit({ section: 5 })).toBe(false)
    })
  })
})

describe('Link Type Guards', () => {
  const childOfLink: Link = { type: 'child_of', source_widget: 1, target_column: 'C' }
  const matchedByLink: Link = {
    type: 'matched_by',
    source_widget: 2,
    source_column: 'A',
    target_column: 'B'
  }
  const detailOfLink: Link = { type: 'detail_of', source_widget: 3 }
  const breakdownOfLink: Link = { type: 'breakdown_of', source_widget: 4 }
  const listedInLink: Link = { type: 'listed_in', source_widget: 5, source_column: 'L' }
  const syncedWithLink: Link = { type: 'synced_with', source_widget: 6 }
  const referencedByLink: Link = {
    type: 'referenced_by',
    source_widget: 7,
    source_column: 'R'
  }

  describe('isChildOfLink', () => {
    it('should return true for child_of link', () => {
      expect(isChildOfLink(childOfLink)).toBe(true)
    })

    it('should return false for other link types', () => {
      expect(isChildOfLink(matchedByLink)).toBe(false)
      expect(isChildOfLink(detailOfLink)).toBe(false)
    })
  })

  describe('isMatchedByLink', () => {
    it('should return true for matched_by link', () => {
      expect(isMatchedByLink(matchedByLink)).toBe(true)
    })

    it('should return false for other link types', () => {
      expect(isMatchedByLink(childOfLink)).toBe(false)
      expect(isMatchedByLink(detailOfLink)).toBe(false)
    })
  })

  describe('isDetailOfLink', () => {
    it('should return true for detail_of link', () => {
      expect(isDetailOfLink(detailOfLink)).toBe(true)
    })

    it('should return false for other link types', () => {
      expect(isDetailOfLink(childOfLink)).toBe(false)
      expect(isDetailOfLink(breakdownOfLink)).toBe(false)
    })
  })

  describe('isBreakdownOfLink', () => {
    it('should return true for breakdown_of link', () => {
      expect(isBreakdownOfLink(breakdownOfLink)).toBe(true)
    })

    it('should return false for other link types', () => {
      expect(isBreakdownOfLink(detailOfLink)).toBe(false)
      expect(isBreakdownOfLink(listedInLink)).toBe(false)
    })
  })

  describe('isListedInLink', () => {
    it('should return true for listed_in link', () => {
      expect(isListedInLink(listedInLink)).toBe(true)
    })

    it('should return false for other link types', () => {
      expect(isListedInLink(breakdownOfLink)).toBe(false)
      expect(isListedInLink(syncedWithLink)).toBe(false)
    })
  })

  describe('isSyncedWithLink', () => {
    it('should return true for synced_with link', () => {
      expect(isSyncedWithLink(syncedWithLink)).toBe(true)
    })

    it('should return false for other link types', () => {
      expect(isSyncedWithLink(listedInLink)).toBe(false)
      expect(isSyncedWithLink(referencedByLink)).toBe(false)
    })
  })

  describe('isReferencedByLink', () => {
    it('should return true for referenced_by link', () => {
      expect(isReferencedByLink(referencedByLink)).toBe(true)
    })

    it('should return false for other link types', () => {
      expect(isReferencedByLink(syncedWithLink)).toBe(false)
      expect(isReferencedByLink(childOfLink)).toBe(false)
    })
  })
})

// =============================================================================
// Utility Functions
// =============================================================================

describe('getSectionId', () => {
  it('should return section ID for simple number', () => {
    expect(getSectionId(5)).toBe(5)
  })

  it('should return section ID from weighted section', () => {
    expect(getSectionId([10, 2.5])).toBe(10)
  })

  it('should return section ID from existing pane', () => {
    expect(getSectionId({ section: 15 })).toBe(15)
  })

  it('should return undefined for new pane', () => {
    expect(getSectionId({ table: 'Products', widget: 'grid' })).toBeUndefined()
  })

  it('should return undefined for splits', () => {
    expect(getSectionId({ cols: [1, 2] })).toBeUndefined()
    expect(getSectionId({ rows: [1, 2] })).toBeUndefined()
  })
})

describe('getWeight', () => {
  it('should return undefined for simple section ID', () => {
    expect(getWeight(5)).toBeUndefined()
  })

  it('should return weight from weighted section', () => {
    expect(getWeight([10, 2.5])).toBe(2.5)
  })

  it('should return weight from existing pane', () => {
    expect(getWeight({ section: 15, weight: 1.5 })).toBe(1.5)
  })

  it('should return undefined when weight not specified', () => {
    expect(getWeight({ section: 15 })).toBeUndefined()
  })

  it('should return weight from new pane', () => {
    expect(getWeight({ table: 'Products', widget: 'grid', weight: 3.0 })).toBe(3.0)
  })

  it('should return weight from splits', () => {
    expect(getWeight({ cols: [1, 2], weight: 2.0 })).toBe(2.0)
    expect(getWeight({ rows: [1, 2], weight: 1.5 })).toBe(1.5)
  })
})

describe('collectNewPanes', () => {
  it('should collect no panes from section ID', () => {
    const panes = collectNewPanes(5)
    expect(panes).toEqual([])
  })

  it('should collect no panes from existing pane', () => {
    const panes = collectNewPanes({ section: 10 })
    expect(panes).toEqual([])
  })

  it('should collect single new pane', () => {
    const newPane: NewPane = { table: 'Products', widget: 'grid' }
    const panes = collectNewPanes(newPane)
    expect(panes).toEqual([newPane])
  })

  it('should collect multiple new panes from cols split', () => {
    const pane1: NewPane = { table: 'Products', widget: 'grid' }
    const pane2: NewPane = { table: 'Orders', widget: 'card' }
    const node: LayoutNode = { cols: [pane1, 5, pane2] }
    const panes = collectNewPanes(node)
    expect(panes).toEqual([pane1, pane2])
  })

  it('should collect new panes from nested structure', () => {
    const pane1: NewPane = { table: 'Products', widget: 'grid' }
    const pane2: NewPane = { table: 'Orders', widget: 'card' }
    const pane3: NewPane = { table: 'Customers', widget: 'form' }
    const node: LayoutNode = {
      cols: [
        pane1,
        {
          rows: [5, pane2, { cols: [10, pane3] }]
        }
      ]
    }
    const panes = collectNewPanes(node)
    expect(panes).toEqual([pane1, pane2, pane3])
  })

  it('should preserve tree traversal order (depth-first)', () => {
    const pane1: NewPane = { table: 'A', widget: 'grid' }
    const pane2: NewPane = { table: 'B', widget: 'grid' }
    const pane3: NewPane = { table: 'C', widget: 'grid' }
    const pane4: NewPane = { table: 'D', widget: 'grid' }

    const node: LayoutNode = {
      rows: [{ cols: [pane1, pane2] }, { cols: [pane3, pane4] }]
    }

    const panes = collectNewPanes(node)
    expect(panes.map((p) => p.table)).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('collectExistingSectionIds', () => {
  it('should collect single section ID', () => {
    const ids = collectExistingSectionIds(5)
    expect(ids).toEqual(new Set([5]))
  })

  it('should collect weighted section ID', () => {
    const ids = collectExistingSectionIds([10, 2.5])
    expect(ids).toEqual(new Set([10]))
  })

  it('should collect section from existing pane', () => {
    const ids = collectExistingSectionIds({ section: 15 })
    expect(ids).toEqual(new Set([15]))
  })

  it('should not collect from new pane', () => {
    const ids = collectExistingSectionIds({ table: 'Products', widget: 'grid' })
    expect(ids).toEqual(new Set())
  })

  it('should collect multiple section IDs from split', () => {
    const node: LayoutNode = {
      cols: [5, [10, 1.5], { section: 15 }]
    }
    const ids = collectExistingSectionIds(node)
    expect(ids).toEqual(new Set([5, 10, 15]))
  })

  it('should collect from deeply nested structure', () => {
    const node: LayoutNode = {
      cols: [
        5,
        {
          rows: [
            10,
            {
              cols: [15, 20, { section: 25 }]
            }
          ]
        }
      ]
    }
    const ids = collectExistingSectionIds(node)
    expect(ids).toEqual(new Set([5, 10, 15, 20, 25]))
  })

  it('should not include duplicates', () => {
    const node: LayoutNode = {
      cols: [5, 10, { rows: [5, 10] }]
    }
    const ids = collectExistingSectionIds(node)
    expect(ids).toEqual(new Set([5, 10]))
  })

  it('should handle mixed layout with new and existing panes', () => {
    const node: LayoutNode = {
      rows: [
        5,
        { table: 'Products', widget: 'grid' },
        { section: 10 },
        { table: 'Orders', widget: 'card' },
        [15, 2.0]
      ]
    }
    const ids = collectExistingSectionIds(node)
    expect(ids).toEqual(new Set([5, 10, 15]))
  })
})
