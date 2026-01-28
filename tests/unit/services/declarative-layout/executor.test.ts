/**
 * Unit tests for declarative layout executor
 *
 * Tests the execution layer that orchestrates:
 * - executeCreatePage: Create new page with widgets
 * - executeSetLayout: Modify layout on existing page
 * - executeGetLayout: Retrieve current layout
 */

import type { Mock } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  executeCreatePage,
  executeGetLayout,
  executeSetLayout
} from '../../../../src/services/declarative-layout/executor.js'
import type { LayoutNode } from '../../../../src/services/declarative-layout/schema.js'
import type { GristClient } from '../../../../src/services/grist-client.js'

// =============================================================================
// Test Utilities
// =============================================================================

/** Create a mock GristClient with spied methods */
function createMockClient(): {
  client: GristClient
  postMock: Mock
  getMock: Mock
} {
  const postMock = vi.fn()
  const getMock = vi.fn()
  const client = {
    post: postMock,
    get: getMock,
    patch: vi.fn(),
    delete: vi.fn()
  } as unknown as GristClient

  return { client, postMock, getMock }
}

/** Create a mock getTableRef function */
function createMockGetTableRef(
  mapping: Record<string, number>
): (tableId: string) => Promise<number> {
  return async (tableId: string) => {
    const ref = mapping[tableId]
    if (ref === undefined) {
      throw new Error(`Table "${tableId}" not found`)
    }
    return ref
  }
}

/** Create a mock getExistingWidgets function */
function createMockGetExistingWidgets(
  widgets: Array<{ sectionId: number; tableId: string; tableRef: number }>
): () => Promise<Map<number, { tableId: string; tableRef: number }>> {
  return async () => {
    const map = new Map<number, { tableId: string; tableRef: number }>()
    for (const w of widgets) {
      map.set(w.sectionId, { tableId: w.tableId, tableRef: w.tableRef })
    }
    return map
  }
}

// =============================================================================
// executeCreatePage Tests
// =============================================================================

describe('executeCreatePage', () => {
  let mockClient: GristClient
  let postMock: Mock

  beforeEach(() => {
    const mocks = createMockClient()
    mockClient = mocks.client
    postMock = mocks.postMock
  })

  describe('validation', () => {
    it('should throw if layout has no new widgets', async () => {
      const layout: LayoutNode = 5 // Just an existing section ID

      await expect(
        executeCreatePage(
          mockClient,
          'testDoc123456789012',
          'Test Page',
          layout,
          createMockGetTableRef({})
        )
      ).rejects.toThrow(/create_page requires at least one new widget/)
    })

    it('should throw if layout only has existing panes', async () => {
      const layout: LayoutNode = {
        cols: [{ section: 5 }, { section: 10 }]
      }

      await expect(
        executeCreatePage(
          mockClient,
          'testDoc123456789012',
          'Test Page',
          layout,
          createMockGetTableRef({})
        )
      ).rejects.toThrow(/create_page requires at least one new widget/)
    })
  })

  describe('single widget creation', () => {
    it('should create page with single grid widget', async () => {
      const layout: LayoutNode = {
        table: 'Products',
        widget: 'grid'
      }

      // Mock responses for: CreateViewSection, UpdateLayout, UpdateRecord (name)
      postMock
        .mockResolvedValueOnce({
          retValues: [{ sectionRef: 100, viewRef: 50 }]
        })
        .mockResolvedValueOnce({}) // Layout update

      const result = await executeCreatePage(
        mockClient,
        'testDoc123456789012',
        'Products Page',
        layout,
        createMockGetTableRef({ Products: 1 })
      )

      expect(result.success).toBe(true)
      expect(result.viewId).toBe(50)
      expect(result.pageName).toBe('Products Page')
      expect(result.widgetsCreated).toBe(1)
      expect(result.sectionIds).toEqual([100])
    })

    it('should configure chart widget with title', async () => {
      // Test basic chart widget creation with title (without complex axis configuration)
      // Axis configuration involves multiple SQL queries and is better tested in integration tests
      const layout: LayoutNode = {
        table: 'Sales',
        widget: 'chart',
        chartType: 'bar',
        title: 'Sales Chart'
        // Note: x_axis/y_axis require complex SQL mocking, tested in integration
      }

      // Mock POST responses in order:
      // 1. CreateViewSectionAction
      // 2. Title update
      // 3. Chart type update
      // 4. Layout update
      postMock
        .mockResolvedValueOnce({
          retValues: [{ sectionRef: 100, viewRef: 50 }]
        })
        .mockResolvedValueOnce({}) // Title update
        .mockResolvedValueOnce({}) // Chart type
        .mockResolvedValueOnce({}) // Layout update

      const result = await executeCreatePage(
        mockClient,
        'testDoc123456789012',
        'Sales Dashboard',
        layout,
        createMockGetTableRef({ Sales: 2 })
      )

      expect(result.success).toBe(true)
      expect(result.widgetsCreated).toBe(1)

      // Verify chart type was set (lowercase per implementation)
      expect(postMock).toHaveBeenCalledWith(
        '/docs/testDoc123456789012/apply',
        expect.arrayContaining([
          expect.arrayContaining([
            'UpdateRecord',
            '_grist_Views_section',
            100,
            expect.objectContaining({ chartType: 'bar' })
          ])
        ])
      )
    })
  })

  describe('multiple widget creation', () => {
    it('should create page with multiple widgets in columns', async () => {
      const layout: LayoutNode = {
        cols: [
          { table: 'Products', widget: 'grid' },
          { table: 'Orders', widget: 'card' }
        ]
      }

      postMock
        .mockResolvedValueOnce({ retValues: [{ sectionRef: 100, viewRef: 50 }] })
        .mockResolvedValueOnce({ retValues: [{ sectionRef: 101, viewRef: 50 }] })
        .mockResolvedValueOnce({}) // Layout update

      const result = await executeCreatePage(
        mockClient,
        'testDoc123456789012',
        'Dashboard',
        layout,
        createMockGetTableRef({ Products: 1, Orders: 2 })
      )

      expect(result.success).toBe(true)
      expect(result.widgetsCreated).toBe(2)
      expect(result.sectionIds).toEqual([100, 101])
    })

    it('should handle nested layout structure', async () => {
      const layout: LayoutNode = {
        rows: [
          { table: 'Products', widget: 'grid' },
          {
            cols: [
              { table: 'Orders', widget: 'grid' },
              { table: 'Customers', widget: 'card' }
            ]
          }
        ]
      }

      postMock
        .mockResolvedValueOnce({ retValues: [{ sectionRef: 100, viewRef: 50 }] })
        .mockResolvedValueOnce({ retValues: [{ sectionRef: 101, viewRef: 50 }] })
        .mockResolvedValueOnce({ retValues: [{ sectionRef: 102, viewRef: 50 }] })
        .mockResolvedValueOnce({}) // Layout update

      const result = await executeCreatePage(
        mockClient,
        'testDoc123456789012',
        'Dashboard',
        layout,
        createMockGetTableRef({ Products: 1, Orders: 2, Customers: 3 })
      )

      expect(result.success).toBe(true)
      expect(result.widgetsCreated).toBe(3)
      expect(result.sectionIds).toHaveLength(3)
    })
  })

  describe('error handling', () => {
    it('should throw if table not found', async () => {
      const layout: LayoutNode = {
        table: 'NonExistent',
        widget: 'grid'
      }

      await expect(
        executeCreatePage(
          mockClient,
          'testDoc123456789012',
          'Test',
          layout,
          createMockGetTableRef({ Products: 1 })
        )
      ).rejects.toThrow(/Table "NonExistent" not found/)
    })

    it('should throw if widget creation fails', async () => {
      const layout: LayoutNode = {
        table: 'Products',
        widget: 'grid'
      }

      postMock.mockResolvedValueOnce({
        retValues: [{ sectionRef: null }]
      })

      await expect(
        executeCreatePage(
          mockClient,
          'testDoc123456789012',
          'Test',
          layout,
          createMockGetTableRef({ Products: 1 })
        )
      ).rejects.toThrow(/Failed to create widget/)
    })
  })
})

// =============================================================================
// executeSetLayout Tests
// =============================================================================

describe('executeSetLayout', () => {
  let mockClient: GristClient
  let postMock: Mock

  beforeEach(() => {
    const mocks = createMockClient()
    mockClient = mocks.client
    postMock = mocks.postMock
  })

  describe('validation', () => {
    it('should throw if referenced section does not exist', async () => {
      const layout: LayoutNode = {
        cols: [5, 99] // 99 doesn't exist
      }

      await expect(
        executeSetLayout(
          mockClient,
          'testDoc123456789012',
          50,
          layout,
          [],
          createMockGetTableRef({}),
          createMockGetExistingWidgets([{ sectionId: 5, tableId: 'Products', tableRef: 1 }])
        )
      ).rejects.toThrow(/Section 99 not found/)
    })

    it('should throw if section is orphaned (not in layout or remove)', async () => {
      const layout: LayoutNode = 5 // Only references section 5

      await expect(
        executeSetLayout(
          mockClient,
          'testDoc123456789012',
          50,
          layout,
          [], // Not removing 10
          createMockGetTableRef({}),
          createMockGetExistingWidgets([
            { sectionId: 5, tableId: 'Products', tableRef: 1 },
            { sectionId: 10, tableId: 'Orders', tableRef: 2 } // Orphaned
          ])
        )
      ).rejects.toThrow(/Section 10 exists on page but is not in layout or remove/)
    })
  })

  describe('rearranging existing widgets', () => {
    it('should rearrange existing widgets without adding/removing', async () => {
      const layout: LayoutNode = {
        rows: [5, 10] // Just swap from cols to rows
      }

      postMock.mockResolvedValueOnce({}) // Layout update

      const result = await executeSetLayout(
        mockClient,
        'testDoc123456789012',
        50,
        layout,
        [],
        createMockGetTableRef({}),
        createMockGetExistingWidgets([
          { sectionId: 5, tableId: 'Products', tableRef: 1 },
          { sectionId: 10, tableId: 'Orders', tableRef: 2 }
        ])
      )

      expect(result.success).toBe(true)
      expect(result.viewId).toBe(50)
      expect(result.widgetsAdded).toBe(0)
      expect(result.widgetsRemoved).toBe(0)
    })
  })

  describe('removing widgets', () => {
    it('should remove widgets specified in remove array', async () => {
      const layout: LayoutNode = 5 // Keep only section 5

      postMock
        .mockResolvedValueOnce({}) // Remove action
        .mockResolvedValueOnce({}) // Layout update

      const result = await executeSetLayout(
        mockClient,
        'testDoc123456789012',
        50,
        layout,
        [10], // Remove section 10
        createMockGetTableRef({}),
        createMockGetExistingWidgets([
          { sectionId: 5, tableId: 'Products', tableRef: 1 },
          { sectionId: 10, tableId: 'Orders', tableRef: 2 }
        ])
      )

      expect(result.success).toBe(true)
      expect(result.widgetsRemoved).toBe(1)

      // Verify remove action was called
      expect(postMock).toHaveBeenCalledWith('/docs/testDoc123456789012/apply', [
        ['RemoveRecord', '_grist_Views_section', 10]
      ])
    })
  })

  describe('adding new widgets', () => {
    it('should add new widget to existing layout', async () => {
      const layout: LayoutNode = {
        cols: [5, { table: 'Orders', widget: 'grid' }]
      }

      postMock
        .mockResolvedValueOnce({ retValues: [{ sectionRef: 100, viewRef: 50 }] }) // Create widget
        .mockResolvedValueOnce({}) // Layout update

      const result = await executeSetLayout(
        mockClient,
        'testDoc123456789012',
        50,
        layout,
        [],
        createMockGetTableRef({ Orders: 2 }),
        createMockGetExistingWidgets([{ sectionId: 5, tableId: 'Products', tableRef: 1 }])
      )

      expect(result.success).toBe(true)
      expect(result.widgetsAdded).toBe(1)
    })
  })

  describe('combined operations', () => {
    it('should handle add and remove in same operation', async () => {
      const layout: LayoutNode = {
        cols: [5, { table: 'Customers', widget: 'card' }]
      }

      postMock
        .mockResolvedValueOnce({}) // Remove section 10
        .mockResolvedValueOnce({ retValues: [{ sectionRef: 100, viewRef: 50 }] }) // Create widget
        .mockResolvedValueOnce({}) // Layout update

      const result = await executeSetLayout(
        mockClient,
        'testDoc123456789012',
        50,
        layout,
        [10], // Remove section 10
        createMockGetTableRef({ Customers: 3 }),
        createMockGetExistingWidgets([
          { sectionId: 5, tableId: 'Products', tableRef: 1 },
          { sectionId: 10, tableId: 'Orders', tableRef: 2 }
        ])
      )

      expect(result.success).toBe(true)
      expect(result.widgetsAdded).toBe(1)
      expect(result.widgetsRemoved).toBe(1)
    })
  })
})

// =============================================================================
// executeGetLayout Tests
// =============================================================================

describe('executeGetLayout', () => {
  let mockClient: GristClient
  let postMock: Mock

  beforeEach(() => {
    const mocks = createMockClient()
    mockClient = mocks.client
    postMock = mocks.postMock
  })

  describe('basic retrieval', () => {
    it('should retrieve simple layout', async () => {
      // Mock SQL responses
      postMock
        .mockResolvedValueOnce({
          records: [
            {
              fields: {
                layoutSpec: JSON.stringify({ type: 'leaf', leaf: 100 })
              }
            }
          ]
        })
        .mockResolvedValueOnce({
          records: [
            {
              fields: {
                sectionId: 100,
                tableId: 'Products',
                widgetType: 'record',
                title: 'Products Grid'
              }
            }
          ]
        })

      const result = await executeGetLayout(mockClient, 'testDoc123456789012', 50)

      expect(result.layout).toBeDefined()
      expect(result.widgets).toHaveLength(1)
      expect(result.widgets[0]).toMatchObject({
        section: 100,
        table: 'Products',
        widget: 'grid' // 'record' in Grist API maps to 'grid' externally
      })
    })

    it('should handle complex nested layout', async () => {
      const layoutSpec = {
        type: 'hsplit',
        children: [
          { type: 'leaf', leaf: 100 },
          {
            type: 'vsplit',
            children: [
              { type: 'leaf', leaf: 101 },
              { type: 'leaf', leaf: 102 }
            ],
            splitRatio: 0.5
          }
        ],
        splitRatio: 0.4
      }

      postMock
        .mockResolvedValueOnce({
          records: [
            {
              fields: { layoutSpec: JSON.stringify(layoutSpec) }
            }
          ]
        })
        .mockResolvedValueOnce({
          records: [
            { fields: { sectionId: 100, tableId: 'Products', widgetType: 'record' } },
            { fields: { sectionId: 101, tableId: 'Orders', widgetType: 'single' } },
            { fields: { sectionId: 102, tableId: 'Customers', widgetType: 'detail' } }
          ]
        })

      const result = await executeGetLayout(mockClient, 'testDoc123456789012', 50)

      expect(result.widgets).toHaveLength(3)
    })
  })

  describe('error handling', () => {
    it('should throw if page not found', async () => {
      postMock.mockResolvedValueOnce({ records: [] })

      await expect(executeGetLayout(mockClient, 'testDoc123456789012', 999)).rejects.toThrow(
        /Page with viewId 999 not found/
      )
    })

    it('should handle empty layout spec', async () => {
      postMock
        .mockResolvedValueOnce({
          records: [
            {
              fields: { layoutSpec: null }
            }
          ]
        })
        .mockResolvedValueOnce({ records: [] })

      const result = await executeGetLayout(mockClient, 'testDoc123456789012', 50)

      // Should return default leaf layout
      expect(result.layout).toBeDefined()
    })
  })
})

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('validateLayoutReferences', () => {
  // Note: This is an internal function, tested indirectly through executeSetLayout
  // These tests document expected behavior

  it('should accept layout with all valid references', async () => {
    const { client, postMock } = createMockClient()
    postMock.mockResolvedValueOnce({}) // Layout update

    const layout: LayoutNode = { cols: [5, 10] }

    // Should not throw
    await expect(
      executeSetLayout(
        client,
        'testDoc123456789012',
        50,
        layout,
        [],
        createMockGetTableRef({}),
        createMockGetExistingWidgets([
          { sectionId: 5, tableId: 'A', tableRef: 1 },
          { sectionId: 10, tableId: 'B', tableRef: 2 }
        ])
      )
    ).resolves.toMatchObject({ success: true })
  })
})
