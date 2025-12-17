/**
 * MCP Integration Tests - grist_get_tables
 *
 * Tests the grist_get_tables tool via MCP protocol.
 * Validates full stack: MCP → Zod validation → Tool → Grist API → Response formatting
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

describe('grist_get_tables', () => {
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
  }, 60000)

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
      // Skip all tests if no test document
      if (!testDocId) {
        console.warn('No test document available - some tests will be skipped')
      }
    })
  })

  // =========================================================================
  // Success Cases
  // =========================================================================

  describe('success cases', () => {
    it('returns tables for a valid document', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: testDocId, response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()
      expect(result.content).toBeDefined()
      expect(result.content[0].type).toBe('text')

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
      expect(typeof parsed.total).toBe('number')
    })

    it('returns tables with json format', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: testDocId, response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
      expect(typeof parsed.total).toBe('number')
      expect(typeof parsed.offset).toBe('number')
      expect(typeof parsed.limit).toBe('number')
    })

    it('returns tables with markdown format', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: testDocId, response_format: 'markdown' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      // Markdown format should contain headers or formatting
      expect(text).toMatch(/[#*-]|table/i)
    })
  })

  // =========================================================================
  // Detail Levels
  // =========================================================================

  describe('detail levels', () => {
    it('supports names detail level', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: testDocId, detail_level: 'names', response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
    })

    it('supports columns detail level (default)', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: testDocId, detail_level: 'columns', response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
    })

    it('supports full_schema detail level', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: testDocId, detail_level: 'full_schema', response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
    })
  })

  // =========================================================================
  // Table Filtering
  // =========================================================================

  describe('table filtering', () => {
    it('returns error for non-existent tableId', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: {
          docId: testDocId,
          tableId: 'NonExistentTable',
          response_format: 'json'
        }
      })

      expect(result.isError).toBe(true)
    })
  })

  // =========================================================================
  // Pagination
  // =========================================================================

  describe('pagination', () => {
    it('supports limit parameter', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: testDocId, limit: 1, response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.limit).toBe(1)
      expect(parsed.items.length).toBeLessThanOrEqual(1)
    })

    it('supports offset parameter', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: testDocId, offset: 0, limit: 10, response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.offset).toBe(0)
    })
  })

  // =========================================================================
  // Response Content
  // =========================================================================

  describe('response content', () => {
    it('returns items with expected structure', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: testDocId, response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      // Verify response structure
      expect(parsed).toHaveProperty('docId')
      expect(parsed).toHaveProperty('items')
      expect(parsed).toHaveProperty('total')
      expect(parsed).toHaveProperty('offset')
      expect(parsed).toHaveProperty('limit')

      // If tables exist, verify item structure
      if (parsed.items.length > 0) {
        const table = parsed.items[0]
        expect(table).toHaveProperty('id')
      }
    })
  })

  // =========================================================================
  // Error Cases
  // =========================================================================

  describe('error cases', () => {
    it('returns error for non-existent document', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: {
          docId: 'abcdefghij1234567890ab', // Valid format but doesn't exist
          response_format: 'json'
        }
      })

      expect(result.isError).toBe(true)
    })
  })

  // =========================================================================
  // Schema Validation
  // =========================================================================

  describe('schema validation', () => {
    it('rejects missing required docId', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { response_format: 'json' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid response_format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: 'abcdefghij1234567890ab', response_format: 'invalid' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid detail_level', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: 'abcdefghij1234567890ab', detail_level: 'invalid' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects negative limit', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: 'abcdefghij1234567890ab', limit: -1 }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects negative offset', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: 'abcdefghij1234567890ab', offset: -1 }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid docId format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: 'invalid!' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects docId with forbidden characters (0OIl)', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: '0OIl567890123456789012' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects docId with wrong length', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: 'short' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid tableId format (lowercase start)', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: 'abcdefghij1234567890ab', tableId: 'lowercase' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects tableId that is a Python keyword', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_tables',
        arguments: { docId: 'abcdefghij1234567890ab', tableId: 'Class' }
      })

      // Note: 'Class' starts uppercase but 'class' is a keyword
      // The validation might be case-sensitive
      expect(result.isError).toBe(true)
    })
  })
})
