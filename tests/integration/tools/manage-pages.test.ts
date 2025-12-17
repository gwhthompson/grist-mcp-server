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
import { createMCPTestClient, type MCPTestContext } from '../../helpers/mcp-test-client.js'

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

    // Create a test table
    const tableResult = await ctx.client.callTool({
      name: 'grist_manage_schema',
      arguments: {
        docId: testDocId,
        operations: [
          {
            action: 'create_table',
            name: 'PageTestData',
            columns: [
              { colId: 'Name', type: 'Text' },
              { colId: 'Value', type: 'Numeric' }
            ]
          }
        ],
        response_format: 'json'
      }
    })

    if (tableResult.isError) {
      console.log('Failed to create table:', JSON.stringify(tableResult.content))
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
