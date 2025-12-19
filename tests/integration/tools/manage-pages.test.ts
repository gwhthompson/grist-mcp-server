/**
 * MCP Integration Tests - grist_manage_pages
 *
 * Tests the grist_manage_pages tool via MCP protocol.
 * This is a consolidated tool supporting page and widget operations.
 * Actions: create_page, set_layout, get_layout, rename_page, delete_page,
 *          reorder_pages, configure_widget, link_widgets
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestContext,
  createTestDocument,
  createTestWorkspace,
  getFirstOrg,
  type TestContext
} from '../../helpers/grist-api.js'
import {
  callMCPTool,
  createMCPTestClient,
  type MCPTestContext
} from '../../helpers/mcp-test-client.js'

// =============================================================================
// Datasets for link types (covers link-resolver.ts)
// =============================================================================

/**
 * Dataset for all 7 link types in declarative layout.
 * Each link type exercises different code paths in link-resolver.ts.
 * Pre-requisite: Tables with Ref columns must be created in beforeAll.
 */
const LINK_TYPE_CASES = [
  {
    type: 'child_of' as const,
    desc: 'Master-detail filter (Row→Col)',
    sourceTable: 'Categories',
    targetTable: 'Products',
    linkConfig: (sourceId: number) => ({
      type: 'child_of' as const,
      source_widget: sourceId,
      target_column: 'Category' // Ref column in Products pointing to Categories
    })
  },
  {
    type: 'matched_by' as const,
    desc: 'Column matching filter (Col→Col)',
    sourceTable: 'Orders',
    targetTable: 'Payments',
    linkConfig: (sourceId: number) => ({
      type: 'matched_by' as const,
      source_widget: sourceId,
      source_column: 'Customer',
      target_column: 'Customer' // Both reference same Customers table
    })
  },
  {
    type: 'synced_with' as const,
    desc: 'Cursor sync (Same-Table)',
    sourceTable: 'PageTestData',
    targetTable: 'PageTestData',
    linkConfig: (sourceId: number) => ({
      type: 'synced_with' as const,
      source_widget: sourceId
    })
  },
  {
    type: 'referenced_by' as const,
    desc: 'Reference follow (Cursor via Ref)',
    sourceTable: 'Products',
    targetTable: 'Categories',
    linkConfig: (sourceId: number) => ({
      type: 'referenced_by' as const,
      source_widget: sourceId,
      source_column: 'Category' // Ref column in Products
    })
  }
] as const

describe('grist_manage_pages', () => {
  let ctx: MCPTestContext
  let testDocId: string | null = null
  let testWorkspaceId: number | null = null
  const apiContext: Partial<TestContext> = {}

  beforeAll(async () => {
    ctx = await createMCPTestClient()

    // Use the Grist client directly to create workspace in the right org
    const client = ctx.serverInstance.context.client

    // Get the correct org (example org in Docker setup)
    const orgId = await getFirstOrg(client)

    // Create a dedicated test workspace (not personal workspace 2)
    testWorkspaceId = await createTestWorkspace(client, orgId)
    apiContext.workspaceId = testWorkspaceId
    apiContext.client = client

    // Create test document using direct API
    testDocId = await createTestDocument(client, testWorkspaceId)
    apiContext.docId = testDocId

    // Create test tables for link type testing
    // Need: Categories, Products (with Ref:Categories), Customers, Orders, Payments
    const tableResult = await ctx.client.callTool({
      name: 'grist_manage_schema',
      arguments: {
        docId: testDocId,
        operations: [
          // Basic test table
          {
            action: 'create_table',
            name: 'PageTestData',
            columns: [
              { colId: 'Name', type: 'Text' },
              { colId: 'Value', type: 'Numeric' }
            ]
          },
          // Categories (master table for child_of and referenced_by tests)
          {
            action: 'create_table',
            name: 'Categories',
            columns: [
              { colId: 'Name', type: 'Text' },
              { colId: 'Description', type: 'Text' }
            ]
          },
          // Products (child table with Ref to Categories)
          {
            action: 'create_table',
            name: 'Products',
            columns: [
              { colId: 'Name', type: 'Text' },
              { colId: 'Price', type: 'Numeric' },
              { colId: 'Category', type: 'Ref', refTable: 'Categories', visibleCol: 'Name' }
            ]
          },
          // Customers (shared reference target for matched_by tests)
          {
            action: 'create_table',
            name: 'Customers',
            columns: [
              { colId: 'Name', type: 'Text' },
              { colId: 'Email', type: 'Text' }
            ]
          },
          // Orders (for matched_by tests - references Customers)
          {
            action: 'create_table',
            name: 'Orders',
            columns: [
              { colId: 'OrderNum', type: 'Text' },
              { colId: 'Customer', type: 'Ref', refTable: 'Customers', visibleCol: 'Name' }
            ]
          },
          // Payments (for matched_by tests - also references Customers)
          {
            action: 'create_table',
            name: 'Payments',
            columns: [
              { colId: 'Amount', type: 'Numeric' },
              { colId: 'Customer', type: 'Ref', refTable: 'Customers', visibleCol: 'Name' }
            ]
          }
        ],
        response_format: 'json'
      }
    })

    if (tableResult.isError) {
      console.log('Failed to create tables:', JSON.stringify(tableResult.content))
    }
  }, 120000)

  afterAll(async () => {
    try {
      await cleanupTestContext(apiContext)
    } catch {
      // Ignore cleanup errors
    }
    await ctx.cleanup()
  }, 60000)

  // =========================================================================
  // Prerequisite Check
  // =========================================================================

  describe('prerequisite check', () => {
    it('has test document available', () => {
      if (!testDocId) {
        console.warn('No test document available - some tests will be skipped')
      }
    })
  })

  // =========================================================================
  // Action: create_page
  // =========================================================================

  describe('action: create_page', () => {
    it('creates page with single widget', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Test Page 1',
              layout: {
                table: 'PageTestData',
                widget: 'grid'
              }
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
    })

    it('creates page with multiple widgets', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Multi Widget Page',
              layout: {
                cols: [
                  { table: 'PageTestData', widget: 'grid' },
                  { table: 'PageTestData', widget: 'card' }
                ]
              }
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
    })

    it('creates page with vertical layout', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Vertical Layout Page',
              layout: {
                rows: [
                  { table: 'PageTestData', widget: 'grid' },
                  { table: 'PageTestData', widget: 'card' }
                ]
              }
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
    })
  })

  // =========================================================================
  // Action: get_layout
  // =========================================================================

  describe('action: get_layout', () => {
    it('gets layout for existing page', async () => {
      if (!testDocId) return

      // First create a page
      const createResult = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Get Layout Test Page',
              layout: { table: 'PageTestData', widget: 'grid' }
            }
          ],
          response_format: 'json'
        }
      })

      if (createResult.isError) return

      // Then get its layout
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'get_layout',
              page: 'Get Layout Test Page'
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
    })
  })

  // =========================================================================
  // Action: rename_page
  // =========================================================================

  describe('action: rename_page', () => {
    it('renames existing page', async () => {
      if (!testDocId) return

      // First create a page to rename
      await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Rename Me Page',
              layout: { table: 'PageTestData', widget: 'grid' }
            }
          ],
          response_format: 'json'
        }
      })

      // Then rename it
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'rename_page',
              page: 'Rename Me Page',
              newName: 'Renamed Page'
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
    })
  })

  // =========================================================================
  // Action: delete_page
  // =========================================================================

  describe('action: delete_page', () => {
    it('deletes existing page', async () => {
      if (!testDocId) return

      // First create a page to delete
      await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Delete Me Page',
              layout: { table: 'PageTestData', widget: 'grid' }
            }
          ],
          response_format: 'json'
        }
      })

      // Then delete it
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'delete_page',
              page: 'Delete Me Page'
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
    })

    it('returns error for non-existent page', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'delete_page',
              page: 'NonExistent Page'
            }
          ],
          response_format: 'json'
        }
      })

      // Tool returns success: false in body (not isError flag)
      expect(result.isError).toBeFalsy()
      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)
      expect(parsed.success).toBe(false)
    })
  })

  // =========================================================================
  // Action: configure_widget
  // =========================================================================

  describe('action: configure_widget', () => {
    it('configures widget title', async () => {
      if (!testDocId) return

      // First create a page with a widget
      await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Configure Widget Page',
              layout: {
                table: 'PageTestData',
                widget: 'grid',
                title: 'Original Title'
              }
            }
          ],
          response_format: 'json'
        }
      })

      // Then configure the widget
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'configure_widget',
              page: 'Configure Widget Page',
              widget: 'Original Title',
              title: 'New Title'
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
    })
  })

  // =========================================================================
  // Response Format
  // =========================================================================

  describe('response format', () => {
    it('returns json format correctly', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'JSONFormatPage',
              layout: { table: 'PageTestData', widget: 'grid' }
            }
          ],
          response_format: 'json'
        }
      })

      // Debug output on failure
      if (result.isError) {
        const text = (result.content[0] as { text: string }).text
        console.error('JSON format test error:', text)
      }

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      expect(() => JSON.parse(text)).not.toThrow()
    })

    it('returns markdown format correctly', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'MarkdownFormatPage',
              layout: { table: 'PageTestData', widget: 'grid' }
            }
          ],
          response_format: 'markdown'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      expect(text).toMatch(/[#*-]|page|widget/i)
    })
  })

  // =========================================================================
  // Declarative Layout Features
  // =========================================================================

  describe('declarative layout', () => {
    it('creates page with chart widget', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Chart Page',
              layout: {
                table: 'PageTestData',
                widget: 'chart',
                chartType: 'bar',
                x_axis: 'Name',
                y_axis: ['Value']
              }
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
      expect(parsed.results[0].details.widgetsCreated).toBe(1)
    })

    it('creates page with nested row/col layout', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Nested Layout Page',
              layout: {
                cols: [
                  { table: 'PageTestData', widget: 'grid' },
                  {
                    rows: [
                      { table: 'PageTestData', widget: 'card' },
                      { table: 'PageTestData', widget: 'card_list' }
                    ]
                  }
                ]
              }
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
      // Should create 3 widgets: grid, card, card_list
      expect(parsed.results[0].details.widgetsCreated).toBe(3)
    })

    it('creates page with card_list widget', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Card List Page',
              layout: {
                table: 'PageTestData',
                widget: 'card_list',
                title: 'Data Cards'
              }
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
    })

    it('creates chart with display options', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Stacked Chart Page',
              layout: {
                table: 'PageTestData',
                widget: 'chart',
                chartType: 'bar',
                x_axis: 'Name',
                y_axis: ['Value'],
                chart_options: {
                  stacked: true,
                  orientation: 'h'
                }
              }
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
    })
  })

  // =========================================================================
  // Action: set_layout
  // =========================================================================

  describe('action: set_layout', () => {
    it('updates layout with existing widgets only', async () => {
      if (!testDocId) return

      // First create a page with two widgets
      const createResult = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'SetLayout Test Page',
              layout: {
                cols: [
                  { table: 'PageTestData', widget: 'grid', title: 'Widget A' },
                  { table: 'PageTestData', widget: 'card', title: 'Widget B' }
                ]
              }
            }
          ],
          response_format: 'json'
        }
      })

      expect(createResult.isError).toBeFalsy()
      const createText = (createResult.content[0] as { text: string }).text
      const createParsed = JSON.parse(createText)
      const viewId = createParsed.results[0].details.viewId as number
      const sectionIds = createParsed.results[0].details.sectionIds as number[]

      // Now change the layout to rows instead of cols
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'set_layout',
              page: viewId,
              layout: {
                rows: [sectionIds[0], sectionIds[1]]
              }
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)
      expect(parsed.success).toBe(true)
    })

    it('removes widget via remove parameter', async () => {
      if (!testDocId) return

      // Create a page with two widgets
      const createResult = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Remove Widget Test',
              layout: {
                cols: [
                  { table: 'PageTestData', widget: 'grid', title: 'Keep' },
                  { table: 'PageTestData', widget: 'card', title: 'Remove' }
                ]
              }
            }
          ],
          response_format: 'json'
        }
      })

      expect(createResult.isError).toBeFalsy()
      const createText = (createResult.content[0] as { text: string }).text
      const createParsed = JSON.parse(createText)
      const viewId = createParsed.results[0].details.viewId as number
      const sectionIds = createParsed.results[0].details.sectionIds as number[]

      // Remove the second widget
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'set_layout',
              page: viewId,
              layout: sectionIds[0] as number, // Just keep the first widget
              remove: [sectionIds[1] as number]
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)
      expect(parsed.success).toBe(true)
      expect(parsed.results[0].details.widgetsRemoved).toBe(1)
    })
  })

  // =========================================================================
  // Action: link_widgets
  // =========================================================================

  describe('action: link_widgets', () => {
    it('links two widgets with synced_with (same table)', async () => {
      if (!testDocId) return

      // Create a page with two widgets showing the same table
      const createResult = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Link Sync Test',
              layout: {
                cols: [
                  { table: 'PageTestData', widget: 'grid', title: 'Grid' },
                  { table: 'PageTestData', widget: 'card', title: 'Card' }
                ]
              }
            }
          ],
          response_format: 'json'
        }
      })

      expect(createResult.isError).toBeFalsy()
      const createText = (createResult.content[0] as { text: string }).text
      const createParsed = JSON.parse(createText)
      const viewId = createParsed.results[0].details.viewId as number
      const sectionIds = createParsed.results[0].details.sectionIds as number[]

      // Link card to sync with grid
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'link_widgets',
              viewId,
              links: [
                {
                  source: sectionIds[0] as number,
                  target: sectionIds[1] as number,
                  link: {
                    type: 'synced_with',
                    source_widget: sectionIds[0] as number
                  }
                }
              ]
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)
      expect(parsed.success).toBe(true)
    })

    it('validates non-existent sectionId', async () => {
      if (!testDocId) return

      // Create a page first to get a valid viewId
      const createResult = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Invalid Link Test',
              layout: { table: 'PageTestData', widget: 'grid' }
            }
          ],
          response_format: 'json'
        }
      })

      const createText = (createResult.content[0] as { text: string }).text
      const createParsed = JSON.parse(createText)
      const viewId = createParsed.results[0].details.viewId as number

      // Try to link with non-existent sectionId
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'link_widgets',
              viewId,
              links: [
                {
                  source: 99999,
                  target: 99998,
                  link: {
                    type: 'synced_with',
                    source_widget: 99999
                  }
                }
              ]
            }
          ],
          response_format: 'json'
        }
      })

      // Should fail validation
      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)
      expect(parsed.success).toBe(false)
    })
  })

  // =========================================================================
  // Dataset: Link Types (covers link-resolver.ts)
  // Uses callMCPTool harness for cleaner assertions
  // =========================================================================

  describe('link types dataset', () => {
    it.each(LINK_TYPE_CASES)('creates link with $type ($desc)', async ({
      type,
      sourceTable,
      targetTable,
      linkConfig
    }) => {
      if (!testDocId) return

      // Step 1: Create page with two widgets using the harness
      const createResult = await callMCPTool(ctx, 'grist_manage_pages', {
        docId: testDocId,
        operations: [
          {
            action: 'create_page',
            name: `Link Test ${type}`,
            layout: {
              cols: [
                { table: sourceTable, widget: 'grid', title: `Source ${type}` },
                { table: targetTable, widget: 'grid', title: `Target ${type}` }
              ]
            }
          }
        ],
        response_format: 'json'
      })

      expect(createResult.isError).toBe(false)
      expect(createResult.success).toBe(true)

      // Extract IDs from the standardized result
      const details = (
        createResult.parsed?.results as Array<{ details: Record<string, unknown> }>
      )?.[0]?.details
      const viewId = details?.viewId as number
      const sectionIds = details?.sectionIds as number[]

      // Step 2: Link widgets using the link type
      const linkResult = await callMCPTool(ctx, 'grist_manage_pages', {
        docId: testDocId,
        operations: [
          {
            action: 'link_widgets',
            viewId,
            links: [
              {
                source: sectionIds[0],
                target: sectionIds[1],
                link: linkConfig(sectionIds[0])
              }
            ]
          }
        ],
        response_format: 'json'
      })

      expect(linkResult.isError).toBe(false)
      expect(linkResult.success).toBe(true)
    })
  })

  // =========================================================================
  // Action: reorder_pages
  // =========================================================================

  describe('action: reorder_pages', () => {
    it('reorders pages by name', async () => {
      if (!testDocId) return

      // Create two pages to reorder
      await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_page',
              name: 'Reorder Page A',
              layout: { table: 'PageTestData', widget: 'grid' }
            },
            {
              action: 'create_page',
              name: 'Reorder Page B',
              layout: { table: 'PageTestData', widget: 'grid' }
            }
          ],
          response_format: 'json'
        }
      })

      // Reorder: B before A
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'reorder_pages',
              order: ['Reorder Page B', 'Reorder Page A']
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)
      expect(parsed.success).toBe(true)
      expect(parsed.results[0].verified).toBe(true)
    })

    it('handles non-existent page name', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'reorder_pages',
              order: ['NonExistent Page', 'Another Missing']
            }
          ],
          response_format: 'json'
        }
      })

      // Should fail with page not found
      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)
      expect(parsed.success).toBe(false)
    })
  })

  // =========================================================================
  // Schema Validation
  // =========================================================================

  describe('schema validation', () => {
    it('rejects missing required docId', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          operations: [
            {
              action: 'create_page',
              name: 'Test',
              layout: { type: 'leaf', table: 'Test', widget: 'grid' }
            }
          ]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects missing required operations', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: 'abcdefghij1234567890ab'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects empty operations array', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: []
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid action type', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [{ action: 'invalid', name: 'Test' }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid docId format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: 'invalid!',
          operations: [
            {
              action: 'create_page',
              name: 'Test',
              layout: { type: 'leaf', table: 'Test', widget: 'grid' }
            }
          ]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid response_format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [
            {
              action: 'create_page',
              name: 'Test',
              layout: { type: 'leaf', table: 'Test', widget: 'grid' }
            }
          ],
          response_format: 'invalid'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid widget type', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [
            {
              action: 'create_page',
              name: 'Test',
              layout: { table: 'Test', widget: 'invalid_widget' }
            }
          ]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid layout structure', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_pages',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [
            {
              action: 'create_page',
              name: 'Test',
              layout: { invalid: 'structure' }
            }
          ]
        }
      })

      expect(result.isError).toBe(true)
    })
  })
})
