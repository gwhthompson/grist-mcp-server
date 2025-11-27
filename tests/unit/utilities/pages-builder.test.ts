/**
 * Unit tests for pages-builder service
 *
 * Tests UserAction builders for pages and widgets:
 * - Master-detail pattern action generation
 * - Layout specification builders
 * - Widget linking actions
 * - Page navigation actions
 * - CreateViewSection result processing
 */

import { describe, expect, it } from 'vitest'
import { ValidationError } from '../../../src/errors/ValidationError.js'
import {
  buildAddPageAction,
  buildHorizontalSplitLayout,
  buildLeafLayout,
  buildMasterDetailPattern,
  buildUpdateLayoutAction,
  buildVerticalSplitLayout,
  buildWidgetLinkAction,
  processCreateViewSectionResults
} from '../../../src/services/pages-builder.js'

describe('Layout Builders', () => {
  describe('buildLeafLayout', () => {
    it('should create valid leaf layout', () => {
      const layout = buildLeafLayout(123)

      expect(layout).toEqual({
        type: 'leaf',
        leaf: 123
      })
    })

    it('should handle different widget IDs', () => {
      expect(buildLeafLayout(1).leaf).toBe(1)
      expect(buildLeafLayout(999).leaf).toBe(999)
    })
  })

  describe('buildHorizontalSplitLayout', () => {
    it('should create horizontal split with default ratio', () => {
      const layout = buildHorizontalSplitLayout(10, 20)

      expect(layout.type).toBe('hsplit')
      expect(layout.children).toHaveLength(2)
      expect(layout.children[0]).toEqual({ type: 'leaf', leaf: 10 })
      expect(layout.children[1]).toEqual({ type: 'leaf', leaf: 20 })
      expect(layout.splitRatio).toBe(0.5)
    })

    it('should accept custom split ratio', () => {
      const layout = buildHorizontalSplitLayout(10, 20, 0.4)

      expect(layout.splitRatio).toBe(0.4)
    })

    it('should preserve split ratio precision', () => {
      const layout = buildHorizontalSplitLayout(10, 20, 0.333)

      expect(layout.splitRatio).toBe(0.333)
    })
  })

  describe('buildVerticalSplitLayout', () => {
    it('should create vertical split with default ratio', () => {
      const layout = buildVerticalSplitLayout(30, 40)

      expect(layout.type).toBe('vsplit')
      expect(layout.children).toHaveLength(2)
      expect(layout.children[0]).toEqual({ type: 'leaf', leaf: 30 })
      expect(layout.children[1]).toEqual({ type: 'leaf', leaf: 40 })
      expect(layout.splitRatio).toBe(0.5)
    })

    it('should accept custom split ratio', () => {
      const layout = buildVerticalSplitLayout(30, 40, 0.7)

      expect(layout.splitRatio).toBe(0.7)
    })
  })
})

describe('Widget Linking Actions', () => {
  describe('buildWidgetLinkAction', () => {
    it('should create UpdateRecord action for widget linking', () => {
      const action = buildWidgetLinkAction(100, 200, 0, 5)

      expect(action[0]).toBe('UpdateRecord')
      expect(action[1]).toBe('_grist_Views_section')
      expect(action[2]).toBe(100) // targetSectionId
      expect(action[3]).toEqual({
        linkSrcSectionRef: 200, // sourceSectionId
        linkSrcColRef: 0, // sourceColRef
        linkTargetColRef: 5 // targetColRef
      })
    })

    it('should handle table-level linking (colRef 0)', () => {
      const action = buildWidgetLinkAction(50, 60, 0, 0)

      const updates = action[3]
      expect(updates.linkSrcColRef).toBe(0)
      expect(updates.linkTargetColRef).toBe(0)
    })

    it('should handle column-level linking', () => {
      const action = buildWidgetLinkAction(50, 60, 10, 15)

      const updates = action[3]
      expect(updates.linkSrcColRef).toBe(10)
      expect(updates.linkTargetColRef).toBe(15)
    })

    it('should reject undefined sourceColRef', () => {
      expect(() => {
        buildWidgetLinkAction(50, 60, undefined as unknown as number, 10)
      }).toThrow(ValidationError)
    })

    it('should reject null sourceColRef', () => {
      expect(() => {
        buildWidgetLinkAction(50, 60, null as unknown as number, 10)
      }).toThrow(ValidationError)
    })

    it('should reject NaN sourceColRef', () => {
      expect(() => {
        buildWidgetLinkAction(50, 60, NaN, 10)
      }).toThrow(ValidationError)
    })

    it('should reject undefined targetColRef', () => {
      expect(() => {
        buildWidgetLinkAction(50, 60, 10, undefined as unknown as number)
      }).toThrow(ValidationError)
    })

    it('should reject null targetColRef', () => {
      expect(() => {
        buildWidgetLinkAction(50, 60, 10, null as unknown as number)
      }).toThrow(ValidationError)
    })

    it('should reject NaN targetColRef', () => {
      expect(() => {
        buildWidgetLinkAction(50, 60, 10, NaN)
      }).toThrow(ValidationError)
    })

    it('should provide helpful error message for invalid sourceColRef', () => {
      try {
        buildWidgetLinkAction(50, 60, undefined as unknown as number, 10)
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        if (error instanceof ValidationError) {
          expect(error.message).toContain('sourceColRef must be a valid number')
          expect(error.message).toContain('column resolution failure')
        }
      }
    })

    it('should provide helpful error message for invalid targetColRef', () => {
      try {
        buildWidgetLinkAction(50, 60, 10, undefined as unknown as number)
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        if (error instanceof ValidationError) {
          expect(error.message).toContain('targetColRef must be a valid number')
          expect(error.message).toContain('column resolution failure')
        }
      }
    })
  })
})

describe('Page Navigation Actions', () => {
  describe('buildAddPageAction', () => {
    it('should create AddRecord action for page navigation', () => {
      const action = buildAddPageAction(42, 5)

      expect(action[0]).toBe('AddRecord')
      expect(action[1]).toBe('_grist_Pages')
      expect(action[2]).toBe(null) // No explicit row ID
      expect(action[3]).toEqual({
        viewRef: 42,
        indentation: 0,
        pagePos: 5
      })
    })

    it('should handle first page position', () => {
      const action = buildAddPageAction(10, 0)

      const fields = action[3]
      expect(fields.pagePos).toBe(0)
    })

    it('should handle large position numbers', () => {
      const action = buildAddPageAction(10, 999)

      const fields = action[3]
      expect(fields.pagePos).toBe(999)
    })
  })
})

describe('Layout Update Actions', () => {
  describe('buildUpdateLayoutAction', () => {
    it('should create UpdateRecord action for layout', () => {
      const layout = buildHorizontalSplitLayout(1, 2, 0.6)
      const action = buildUpdateLayoutAction(100, layout)

      expect(action[0]).toBe('UpdateRecord')
      expect(action[1]).toBe('_grist_Views')
      expect(action[2]).toBe(100) // viewId
      expect(action[3]).toHaveProperty('layoutSpec')
    })

    it('should serialize layout to JSON string', () => {
      const layout = buildLeafLayout(123)
      const action = buildUpdateLayoutAction(50, layout)

      const updates = action[3]
      expect(typeof updates.layoutSpec).toBe('string')
      expect(updates.layoutSpec).toBe('{"type":"leaf","leaf":123}')
    })

    it('should serialize complex nested layouts', () => {
      const layout = {
        type: 'hsplit' as const,
        children: [
          buildLeafLayout(1),
          {
            type: 'vsplit' as const,
            children: [buildLeafLayout(2), buildLeafLayout(3)],
            splitRatio: 0.5
          }
        ],
        splitRatio: 0.3
      }

      const action = buildUpdateLayoutAction(100, layout)
      const updates = action[3]

      expect(typeof updates.layoutSpec).toBe('string')
      const parsed = JSON.parse(updates.layoutSpec)
      expect(parsed.type).toBe('hsplit')
      expect(parsed.children).toHaveLength(2)
      expect(parsed.children[1].type).toBe('vsplit')
    })
  })
})

describe('Master-Detail Pattern Builder', () => {
  describe('buildMasterDetailPattern', () => {
    it('should generate complete action array for single /apply request', () => {
      const config = {
        pattern: 'master_detail' as const,
        master: {
          table: 'Customers',
          widget_type: 'grid', // User-facing type (transforms to 'record')
          width: 40
        },
        detail: {
          table: 'Orders',
          widget_type: 'card', // User-facing type (transforms to 'single')
          link_field: 'CustomerRef'
        },
        split: 'horizontal' as const
      }

      const tableRefsMap = new Map<string, number>([
        ['Customers', 10],
        ['Orders', 20]
      ])

      const actions = buildMasterDetailPattern(config, tableRefsMap)

      // Should create 2 CreateViewSection actions only
      expect(actions).toHaveLength(2)

      // Action 0: CreateViewSection for master widget (creates view + page)
      expect(actions[0][0]).toBe('CreateViewSection')
      expect(actions[0][1]).toBe(10) // Customers table ref
      expect(actions[0][2]).toBe(0) // viewRef=0 creates new view
      expect(actions[0][3]).toBe('record') // widget type
      expect(actions[0][4]).toBe(null) // no grouping
      expect(actions[0][5]).toBe(null) // existing table

      // Action 1: CreateViewSection for detail widget (adds to same view)
      expect(actions[1][0]).toBe('CreateViewSection')
      expect(actions[1][1]).toBe(20) // Orders table ref
      expect(actions[1][2]).toBe(0) // viewRef=0, both widgets on same view
      expect(actions[1][3]).toBe('single') // widget type
      expect(actions[1][4]).toBe(null)
      expect(actions[1][5]).toBe(null)
    })

    it('should transform user widget types to Grist internal types', () => {
      const testCases: Array<{
        userType: 'card_list' | 'grid' | 'card'
        expectedGristType: 'detail' | 'record' | 'single'
      }> = [
        { userType: 'card_list', expectedGristType: 'detail' },
        { userType: 'grid', expectedGristType: 'record' },
        { userType: 'card', expectedGristType: 'single' }
      ]

      for (const { userType, expectedGristType } of testCases) {
        const config = {
          pattern: 'master_detail' as const,
          master: {
            table: 'A',
            widget_type: userType
          },
          detail: {
            table: 'B',
            widget_type: 'card',
            link_field: 'ARef'
          },
          split: 'horizontal' as const
        }

        const tableRefsMap = new Map<string, number>([
          ['A', 1],
          ['B', 2]
        ])

        const actions = buildMasterDetailPattern(config, tableRefsMap)
        expect(actions[0][3]).toBe(expectedGristType) // Should transform to Grist type
        expect(actions).toHaveLength(2) // Only CreateViewSection actions
      }
    })

    it('should handle missing table in map', () => {
      const config = {
        pattern: 'master_detail' as const,
        master: {
          table: 'NonExistent',
          widget_type: 'grid' as const
        },
        detail: {
          table: 'Orders',
          widget_type: 'grid' as const,
          link_field: 'CustomerRef'
        },
        split: 'horizontal' as const
      }

      const tableRefsMap = new Map<string, number>([['Orders', 20]])

      expect(() => buildMasterDetailPattern(config, tableRefsMap)).toThrow()
    })

    it('should transform widget types correctly for both master and detail', () => {
      const config = {
        pattern: 'master_detail' as const,
        master: {
          table: 'A',
          widget_type: 'card_list' // User type (transforms to 'detail')
        },
        detail: {
          table: 'B',
          widget_type: 'grid', // User type (transforms to 'record')
          link_field: 'ARef'
        },
        split: 'vertical' as const
      }

      const tableRefsMap = new Map<string, number>([
        ['A', 1],
        ['B', 2]
      ])

      const actions = buildMasterDetailPattern(config, tableRefsMap)

      expect(actions[0][3]).toBe('detail') // Transformed from 'card_list'
      expect(actions[1][3]).toBe('record') // Transformed from 'grid'
      expect(actions).toHaveLength(2)
    })
  })
})

describe('CreateViewSection Result Processing', () => {
  describe('processCreateViewSectionResults', () => {
    it('should extract viewRef and sectionRef from results', () => {
      const retValues = [
        {
          sectionRef: 100,
          viewRef: 50,
          tableRef: 10,
          fieldRefs: [1, 2, 3]
        }
      ]

      const results = processCreateViewSectionResults(retValues)

      expect(results).toHaveLength(1)
      expect(results[0]).toEqual({
        sectionRef: 100,
        viewRef: 50,
        tableRef: 10,
        fieldRefs: [1, 2, 3]
      })
    })

    it('should handle multiple CreateViewSection results', () => {
      const retValues = [
        {
          sectionRef: 100,
          viewRef: 50,
          tableRef: 10,
          fieldRefs: [1, 2]
        },
        {
          sectionRef: 200,
          viewRef: 50,
          tableRef: 20,
          fieldRefs: [3, 4, 5]
        }
      ]

      const results = processCreateViewSectionResults(retValues)

      expect(results).toHaveLength(2)
      expect(results[0].sectionRef).toBe(100)
      expect(results[1].sectionRef).toBe(200)
      // Both should share same viewRef
      expect(results[0].viewRef).toBe(50)
      expect(results[1].viewRef).toBe(50)
    })

    it('should handle empty retValues array', () => {
      const results = processCreateViewSectionResults([])

      expect(results).toHaveLength(0)
    })

    it('should filter out non-CreateViewSection results', () => {
      const retValues = [
        {
          sectionRef: 100,
          viewRef: 50,
          tableRef: 10,
          fieldRefs: [1, 2]
        },
        null, // Some other action result
        {
          sectionRef: 200,
          viewRef: 50,
          tableRef: 20,
          fieldRefs: [3]
        }
      ]

      const results = processCreateViewSectionResults(retValues)

      // Should only process CreateViewSection results
      expect(results).toHaveLength(2)
      expect(results[0].sectionRef).toBe(100)
      expect(results[1].sectionRef).toBe(200)
    })

    it('should preserve fieldRefs array structure', () => {
      const retValues = [
        {
          sectionRef: 100,
          viewRef: 50,
          tableRef: 10,
          fieldRefs: [5, 10, 15, 20]
        }
      ]

      const results = processCreateViewSectionResults(retValues)

      expect(results[0].fieldRefs).toEqual([5, 10, 15, 20])
      expect(Array.isArray(results[0].fieldRefs)).toBe(true)
    })
  })
})

describe('Action Format Validation', () => {
  it('all actions should follow UserAction tuple format', () => {
    // Test that actions are tuples [ActionName, ...args]
    const addPageAction = buildAddPageAction(1, 0)
    expect(Array.isArray(addPageAction)).toBe(true)
    expect(typeof addPageAction[0]).toBe('string')

    const updateLayoutAction = buildUpdateLayoutAction(1, buildLeafLayout(1))
    expect(Array.isArray(updateLayoutAction)).toBe(true)
    expect(typeof updateLayoutAction[0]).toBe('string')

    const widgetLinkAction = buildWidgetLinkAction(1, 2, 0, 0)
    expect(Array.isArray(widgetLinkAction)).toBe(true)
    expect(typeof widgetLinkAction[0]).toBe('string')
  })

  it('should use correct Grist metadata table names', () => {
    expect(buildAddPageAction(1, 0)[1]).toBe('_grist_Pages')
    expect(buildUpdateLayoutAction(1, buildLeafLayout(1))[1]).toBe('_grist_Views')
    expect(buildWidgetLinkAction(1, 2, 0, 0)[1]).toBe('_grist_Views_section')
  })
})
