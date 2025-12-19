/**
 * Unit tests for link-resolver service
 *
 * Tests semantic link resolution for all 7 link types:
 * - child_of (Master-detail filter)
 * - matched_by (Column matching filter)
 * - detail_of (Summary-to-detail filter)
 * - breakdown_of (Summary drill-down)
 * - listed_in (RefList display)
 * - synced_with (Cursor sync)
 * - referenced_by (Reference follow)
 */

import { describe, expect, it, vi } from 'vitest'
import {
  buildLinkActions,
  type ResolvedLink,
  resolveLink,
  type WidgetInfo
} from '../../../../src/services/declarative-layout/link-resolver.js'
import type { Link } from '../../../../src/services/declarative-layout/schema.js'
import { WidgetRegistry } from '../../../../src/services/declarative-layout/widget-registry.js'
import type { GristClient } from '../../../../src/services/grist-client.js'

// =============================================================================
// Mock Helpers
// =============================================================================

function createMockClient(mockResponses: Map<string, unknown>): GristClient {
  return {
    post: vi.fn().mockImplementation((url: string) => {
      // Match against partial URL patterns
      for (const [pattern, response] of mockResponses.entries()) {
        if (url.includes(pattern)) {
          return Promise.resolve(response)
        }
      }
      return Promise.reject(new Error(`No mock response for URL: ${url}`))
    })
  } as unknown as GristClient
}

function createWidgetInfo(
  sectionId: number,
  tableId: string,
  tableRef: number,
  widgetType = 'record',
  isSummaryTable = false
): WidgetInfo {
  return {
    sectionId,
    tableId,
    tableRef,
    widgetType,
    isSummaryTable
  }
}

// =============================================================================
// child_of Link Resolution
// =============================================================================

describe('resolveLink - child_of', () => {
  it('should resolve child_of link with Ref column', async () => {
    const client = createMockClient(
      new Map([
        [
          '/sql',
          {
            records: [
              {
                fields: {
                  colRef: 5,
                  colId: 'Category',
                  type: 'Ref:Categories'
                }
              }
            ]
          }
        ]
      ])
    )

    const link: Link = {
      type: 'child_of',
      source_widget: 10,
      target_column: 'Category'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (id: number): Promise<WidgetInfo> => {
      if (id === 10) return createWidgetInfo(10, 'Categories', 1, 'record')
      throw new Error(`Unknown widget ${id}`)
    }

    const result = await resolveLink(client, 'docId', 20, 'Products', link, registry, getWidgetInfo)

    expect(result).toEqual({
      linkSrcSectionRef: 10,
      linkSrcColRef: 0, // Row selection
      linkTargetColRef: 5 // Category column
    })
  })

  it('should resolve child_of link with RefList column', async () => {
    const client = createMockClient(
      new Map([
        [
          '/sql',
          {
            records: [
              {
                fields: {
                  colRef: 5,
                  colId: 'Tags',
                  type: 'RefList:Tags'
                }
              }
            ]
          }
        ]
      ])
    )

    const link: Link = {
      type: 'child_of',
      source_widget: 10,
      target_column: 'Tags'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (id: number): Promise<WidgetInfo> => {
      if (id === 10) return createWidgetInfo(10, 'Tags', 1, 'record')
      throw new Error(`Unknown widget ${id}`)
    }

    const result = await resolveLink(client, 'docId', 20, 'Products', link, registry, getWidgetInfo)

    expect(result).toEqual({
      linkSrcSectionRef: 10,
      linkSrcColRef: 0,
      linkTargetColRef: 5
    })
  })

  it('should reject child_of if target column is not Ref/RefList', async () => {
    const client = createMockClient(
      new Map([
        [
          '/sql',
          {
            records: [
              {
                fields: {
                  colRef: 5,
                  colId: 'Name',
                  type: 'Text'
                }
              }
            ]
          }
        ]
      ])
    )

    const link: Link = {
      type: 'child_of',
      source_widget: 10,
      target_column: 'Name'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Categories', 1)

    await expect(
      resolveLink(client, 'docId', 20, 'Products', link, registry, getWidgetInfo)
    ).rejects.toThrow(/expected Ref or RefList/)
  })

  it('should reject child_of if Ref points to wrong table', async () => {
    const client = createMockClient(
      new Map([
        [
          '/sql',
          {
            records: [
              {
                fields: {
                  colRef: 5,
                  colId: 'Category',
                  type: 'Ref:OtherTable'
                }
              }
            ]
          }
        ]
      ])
    )

    const link: Link = {
      type: 'child_of',
      source_widget: 10,
      target_column: 'Category'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Categories', 1)

    await expect(
      resolveLink(client, 'docId', 20, 'Products', link, registry, getWidgetInfo)
    ).rejects.toThrow(/references "OtherTable", not "Categories"/)
  })
})

// =============================================================================
// matched_by Link Resolution
// =============================================================================

describe('resolveLink - matched_by', () => {
  it('should resolve matched_by link with valid columns', async () => {
    // First call: resolve source column
    // Second call: resolve target column
    let callCount = 0
    const client = {
      post: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // Source column
          return Promise.resolve({
            records: [{ fields: { colRef: 3, colId: 'Customer' } }]
          })
        } else {
          // Target column
          return Promise.resolve({
            records: [{ fields: { colRef: 7, colId: 'Customer' } }]
          })
        }
      })
    } as unknown as GristClient

    const link: Link = {
      type: 'matched_by',
      source_widget: 10,
      source_column: 'Customer',
      target_column: 'Customer'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Invoices', 1)

    const result = await resolveLink(client, 'docId', 20, 'Payments', link, registry, getWidgetInfo)

    expect(result).toEqual({
      linkSrcSectionRef: 10,
      linkSrcColRef: 3, // Source Customer column
      linkTargetColRef: 7 // Target Customer column
    })
  })

  it('should handle different column names for matched_by', async () => {
    let callCount = 0
    const client = {
      post: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            records: [{ fields: { colRef: 3, colId: 'CompanyRef' } }]
          })
        } else {
          return Promise.resolve({
            records: [{ fields: { colRef: 7, colId: 'ClientRef' } }]
          })
        }
      })
    } as unknown as GristClient

    const link: Link = {
      type: 'matched_by',
      source_widget: 10,
      source_column: 'CompanyRef',
      target_column: 'ClientRef'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Invoices', 1)

    const result = await resolveLink(client, 'docId', 20, 'Payments', link, registry, getWidgetInfo)

    expect(result).toEqual({
      linkSrcSectionRef: 10,
      linkSrcColRef: 3,
      linkTargetColRef: 7
    })
  })
})

// =============================================================================
// detail_of Link Resolution
// =============================================================================

describe('resolveLink - detail_of', () => {
  it('should resolve detail_of link with summary table source', async () => {
    const client = createMockClient(new Map())

    const link: Link = {
      type: 'detail_of',
      source_widget: 10
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> =>
      createWidgetInfo(10, 'Sales_summary', 1, 'record', true)

    const result = await resolveLink(client, 'docId', 20, 'Sales', link, registry, getWidgetInfo)

    expect(result).toEqual({
      linkSrcSectionRef: 10,
      linkSrcColRef: 0,
      linkTargetColRef: 0
    })
  })

  it('should reject detail_of if source is not a summary table', async () => {
    const client = createMockClient(new Map())

    const link: Link = {
      type: 'detail_of',
      source_widget: 10
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> =>
      createWidgetInfo(10, 'Sales', 1, 'record', false)

    await expect(
      resolveLink(client, 'docId', 20, 'Sales', link, registry, getWidgetInfo)
    ).rejects.toThrow(/detail_of link requires source to be a summary table/)
  })
})

// =============================================================================
// breakdown_of Link Resolution
// =============================================================================

describe('resolveLink - breakdown_of', () => {
  it('should resolve breakdown_of link with summary table source', async () => {
    const client = createMockClient(new Map())

    const link: Link = {
      type: 'breakdown_of',
      source_widget: 10
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> =>
      createWidgetInfo(10, 'Sales_by_Region', 1, 'record', true)

    const result = await resolveLink(
      client,
      'docId',
      20,
      'Sales_by_Region_Product',
      link,
      registry,
      getWidgetInfo
    )

    expect(result).toEqual({
      linkSrcSectionRef: 10,
      linkSrcColRef: 0,
      linkTargetColRef: 0
    })
  })

  it('should reject breakdown_of if source is not a summary table', async () => {
    const client = createMockClient(new Map())

    const link: Link = {
      type: 'breakdown_of',
      source_widget: 10
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> =>
      createWidgetInfo(10, 'Sales', 1, 'record', false)

    await expect(
      resolveLink(client, 'docId', 20, 'Sales_summary', link, registry, getWidgetInfo)
    ).rejects.toThrow(/breakdown_of link requires source to be a summary table/)
  })
})

// =============================================================================
// listed_in Link Resolution
// =============================================================================

describe('resolveLink - listed_in', () => {
  it('should resolve listed_in link with RefList column', async () => {
    const client = createMockClient(
      new Map([
        [
          '/sql',
          {
            records: [
              {
                fields: {
                  colRef: 5,
                  colId: 'TeamMembers',
                  type: 'RefList:Employees'
                }
              }
            ]
          }
        ]
      ])
    )

    const link: Link = {
      type: 'listed_in',
      source_widget: 10,
      source_column: 'TeamMembers'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Projects', 1)

    const result = await resolveLink(
      client,
      'docId',
      20,
      'Employees',
      link,
      registry,
      getWidgetInfo
    )

    expect(result).toEqual({
      linkSrcSectionRef: 10,
      linkSrcColRef: 5,
      linkTargetColRef: 0
    })
  })

  it('should reject listed_in if column is not RefList', async () => {
    const client = createMockClient(
      new Map([
        [
          '/sql',
          {
            records: [
              {
                fields: {
                  colRef: 5,
                  colId: 'Manager',
                  type: 'Ref:Employees'
                }
              }
            ]
          }
        ]
      ])
    )

    const link: Link = {
      type: 'listed_in',
      source_widget: 10,
      source_column: 'Manager'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Projects', 1)

    await expect(
      resolveLink(client, 'docId', 20, 'Employees', link, registry, getWidgetInfo)
    ).rejects.toThrow(/expected RefList/)
  })

  it('should reject listed_in if column is Text', async () => {
    const client = createMockClient(
      new Map([
        [
          '/sql',
          {
            records: [
              {
                fields: {
                  colRef: 5,
                  colId: 'Names',
                  type: 'Text'
                }
              }
            ]
          }
        ]
      ])
    )

    const link: Link = {
      type: 'listed_in',
      source_widget: 10,
      source_column: 'Names'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Projects', 1)

    await expect(
      resolveLink(client, 'docId', 20, 'Employees', link, registry, getWidgetInfo)
    ).rejects.toThrow(/expected RefList/)
  })
})

// =============================================================================
// synced_with Link Resolution
// =============================================================================

describe('resolveLink - synced_with', () => {
  it('should resolve synced_with link for same table', async () => {
    const client = createMockClient(new Map())

    const link: Link = {
      type: 'synced_with',
      source_widget: 10
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Products', 1)

    const result = await resolveLink(client, 'docId', 20, 'Products', link, registry, getWidgetInfo)

    expect(result).toEqual({
      linkSrcSectionRef: 10,
      linkSrcColRef: 0,
      linkTargetColRef: 0
    })
  })

  it('should reject synced_with if tables differ', async () => {
    const client = createMockClient(new Map())

    const link: Link = {
      type: 'synced_with',
      source_widget: 10
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Products', 1)

    await expect(
      resolveLink(client, 'docId', 20, 'Orders', link, registry, getWidgetInfo)
    ).rejects.toThrow(/synced_with link requires both widgets to show the same table/)
  })
})

// =============================================================================
// referenced_by Link Resolution
// =============================================================================

describe('resolveLink - referenced_by', () => {
  it('should resolve referenced_by link with Ref column', async () => {
    const client = createMockClient(
      new Map([
        [
          '/sql',
          {
            records: [
              {
                fields: {
                  colRef: 5,
                  colId: 'Customer',
                  type: 'Ref:Customers'
                }
              }
            ]
          }
        ]
      ])
    )

    const link: Link = {
      type: 'referenced_by',
      source_widget: 10,
      source_column: 'Customer'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Orders', 1)

    const result = await resolveLink(
      client,
      'docId',
      20,
      'Customers',
      link,
      registry,
      getWidgetInfo
    )

    expect(result).toEqual({
      linkSrcSectionRef: 10,
      linkSrcColRef: 5,
      linkTargetColRef: 0
    })
  })

  it('should reject referenced_by if column is not Ref', async () => {
    const client = createMockClient(
      new Map([
        [
          '/sql',
          {
            records: [
              {
                fields: {
                  colRef: 5,
                  colId: 'Name',
                  type: 'Text'
                }
              }
            ]
          }
        ]
      ])
    )

    const link: Link = {
      type: 'referenced_by',
      source_widget: 10,
      source_column: 'Name'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Orders', 1)

    await expect(
      resolveLink(client, 'docId', 20, 'Customers', link, registry, getWidgetInfo)
    ).rejects.toThrow(/expected Ref/)
  })

  it('should reject referenced_by if Ref points to wrong table', async () => {
    const client = createMockClient(
      new Map([
        [
          '/sql',
          {
            records: [
              {
                fields: {
                  colRef: 5,
                  colId: 'Product',
                  type: 'Ref:Products'
                }
              }
            ]
          }
        ]
      ])
    )

    const link: Link = {
      type: 'referenced_by',
      source_widget: 10,
      source_column: 'Product'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Orders', 1)

    await expect(
      resolveLink(client, 'docId', 20, 'Customers', link, registry, getWidgetInfo)
    ).rejects.toThrow(/references "Products", not "Customers"/)
  })
})

// =============================================================================
// Common Validation
// =============================================================================

describe('resolveLink - Common Validation', () => {
  it('should reject self-link', async () => {
    const client = createMockClient(new Map())

    const link: Link = {
      type: 'synced_with',
      source_widget: 20
    }

    const registry = new WidgetRegistry()
    registry.register(20)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(20, 'Products', 1)

    await expect(
      resolveLink(client, 'docId', 20, 'Products', link, registry, getWidgetInfo)
    ).rejects.toThrow(/Cannot link widget 20 to itself/)
  })

  it('should reject chart as link source', async () => {
    const client = createMockClient(new Map())

    const link: Link = {
      type: 'child_of',
      source_widget: 10,
      target_column: 'Category'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Sales', 1, 'chart')

    await expect(
      resolveLink(client, 'docId', 20, 'Products', link, registry, getWidgetInfo)
    ).rejects.toThrow(/Cannot use chart widget.*as link source/)
  })
})

// =============================================================================
// buildLinkActions
// =============================================================================

describe('buildLinkActions', () => {
  it('should build single link action', () => {
    const resolvedLinks: Array<{ sectionId: number; resolved: ResolvedLink }> = [
      {
        sectionId: 20,
        resolved: {
          linkSrcSectionRef: 10,
          linkSrcColRef: 0,
          linkTargetColRef: 5
        }
      }
    ]

    const actions = buildLinkActions(resolvedLinks)

    expect(actions).toEqual([
      [
        'UpdateRecord',
        '_grist_Views_section',
        20,
        {
          linkSrcSectionRef: 10,
          linkSrcColRef: 0,
          linkTargetColRef: 5
        }
      ]
    ])
  })

  it('should build multiple link actions', () => {
    const resolvedLinks: Array<{ sectionId: number; resolved: ResolvedLink }> = [
      {
        sectionId: 20,
        resolved: {
          linkSrcSectionRef: 10,
          linkSrcColRef: 0,
          linkTargetColRef: 5
        }
      },
      {
        sectionId: 30,
        resolved: {
          linkSrcSectionRef: 10,
          linkSrcColRef: 3,
          linkTargetColRef: 7
        }
      }
    ]

    const actions = buildLinkActions(resolvedLinks)

    expect(actions).toHaveLength(2)
    expect(actions[0]).toEqual([
      'UpdateRecord',
      '_grist_Views_section',
      20,
      {
        linkSrcSectionRef: 10,
        linkSrcColRef: 0,
        linkTargetColRef: 5
      }
    ])
    expect(actions[1]).toEqual([
      'UpdateRecord',
      '_grist_Views_section',
      30,
      {
        linkSrcSectionRef: 10,
        linkSrcColRef: 3,
        linkTargetColRef: 7
      }
    ])
  })

  it('should build actions with zero colRefs', () => {
    const resolvedLinks: Array<{ sectionId: number; resolved: ResolvedLink }> = [
      {
        sectionId: 20,
        resolved: {
          linkSrcSectionRef: 10,
          linkSrcColRef: 0,
          linkTargetColRef: 0
        }
      }
    ]

    const actions = buildLinkActions(resolvedLinks)

    expect(actions[0]?.[3]).toEqual({
      linkSrcSectionRef: 10,
      linkSrcColRef: 0,
      linkTargetColRef: 0
    })
  })

  it('should return empty array for no links', () => {
    const actions = buildLinkActions([])
    expect(actions).toEqual([])
  })
})

// =============================================================================
// Error Messages
// =============================================================================

describe('resolveLink - Error Messages', () => {
  it('should provide helpful error for missing column', async () => {
    const client = createMockClient(
      new Map([
        [
          '/sql',
          {
            records: []
          }
        ]
      ])
    )

    const link: Link = {
      type: 'listed_in',
      source_widget: 10,
      source_column: 'NonExistent'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Projects', 1)

    await expect(
      resolveLink(client, 'docId', 20, 'Employees', link, registry, getWidgetInfo)
    ).rejects.toThrow()
  })

  it('should include widget ID in self-link error', async () => {
    const client = createMockClient(new Map())

    const link: Link = {
      type: 'synced_with',
      source_widget: 42
    }

    const registry = new WidgetRegistry()
    registry.register(42)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(42, 'Products', 1)

    await expect(
      resolveLink(client, 'docId', 42, 'Products', link, registry, getWidgetInfo)
    ).rejects.toThrow(/widget 42/)
  })

  it('should include column name in validation error', async () => {
    const client = createMockClient(
      new Map([
        [
          '/sql',
          {
            records: [
              {
                fields: {
                  colRef: 5,
                  colId: 'BadColumn',
                  type: 'Text'
                }
              }
            ]
          }
        ]
      ])
    )

    const link: Link = {
      type: 'listed_in',
      source_widget: 10,
      source_column: 'BadColumn'
    }

    const registry = new WidgetRegistry()
    registry.register(10)

    const getWidgetInfo = async (): Promise<WidgetInfo> => createWidgetInfo(10, 'Projects', 1)

    await expect(
      resolveLink(client, 'docId', 20, 'Employees', link, registry, getWidgetInfo)
    ).rejects.toThrow(/BadColumn/)
  })
})
