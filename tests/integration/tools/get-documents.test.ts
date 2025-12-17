/**
 * MCP Integration Tests - grist_get_documents
 *
 * Tests the grist_get_documents tool via MCP protocol.
 * Validates full stack: MCP → Zod validation → Tool → Grist API → Response formatting
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMCPTestClient, type MCPTestContext } from '../../helpers/mcp-test-client.js'

describe('grist_get_documents', () => {
  let ctx: MCPTestContext

  beforeAll(async () => {
    ctx = await createMCPTestClient()
  }, 30000)

  afterAll(async () => {
    await ctx.cleanup()
  })

  // =========================================================================
  // Success Cases
  // =========================================================================

  describe('success cases', () => {
    it('returns documents with default parameters', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: {}
      })

      expect(result.isError).toBeFalsy()
      expect(result.content).toBeDefined()
      expect(result.content[0].type).toBe('text')

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
      expect(parsed.total).toBeGreaterThanOrEqual(0)
    })

    it('returns documents with json format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
      expect(typeof parsed.total).toBe('number')
      expect(typeof parsed.offset).toBe('number')
      expect(typeof parsed.limit).toBe('number')
    })

    it('returns documents with markdown format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { response_format: 'markdown' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      // Markdown format should contain headers or formatting
      expect(text).toMatch(/[#*-]|document/i)
    })

    it('supports summary detail level', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { detail_level: 'summary', response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
      // Summary should have basic fields
      if (parsed.items.length > 0) {
        expect(parsed.items[0]).toHaveProperty('docId')
        expect(parsed.items[0]).toHaveProperty('name')
      }
    })

    it('supports detailed level', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { detail_level: 'detailed', response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
    })
  })

  // =========================================================================
  // Lookup by ID
  // =========================================================================

  describe('lookup by docId', () => {
    it('returns specific document when valid docId is provided', async () => {
      // First get a document list to find a valid docId
      const listResult = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { limit: 1, response_format: 'json' }
      })

      if (listResult.isError) {
        // Skip test if no documents available
        return
      }

      const listText = (listResult.content[0] as { text: string }).text
      const listParsed = JSON.parse(listText)

      if (listParsed.items.length === 0) {
        // Skip test if no documents available
        return
      }

      const docId = listParsed.items[0].docId

      // Now fetch that specific document
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { docId, response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items.length).toBe(1)
      expect(parsed.items[0].docId).toBe(docId)
    })

    it('returns error for non-existent docId', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { docId: 'abcdefghij1234567890ab' } // Valid format but doesn't exist
      })

      expect(result.isError).toBe(true)
    })
  })

  // =========================================================================
  // Filtering
  // =========================================================================

  describe('filtering', () => {
    it('supports name_contains filter', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { name_contains: 'nonexistent_xyz_123', response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      // Should return empty array for non-matching filter
      expect(parsed.items).toBeInstanceOf(Array)
      expect(parsed.items.length).toBe(0)
    })

    it('supports workspaceId filter', async () => {
      // First get workspaces to find a valid ID
      const wsResult = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: { limit: 1, response_format: 'json' }
      })

      if (wsResult.isError) {
        return
      }

      const wsText = (wsResult.content[0] as { text: string }).text
      const wsParsed = JSON.parse(wsText)

      if (wsParsed.items.length === 0) {
        return
      }

      const workspaceId = wsParsed.items[0].id

      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { workspaceId, response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
    })
  })

  // =========================================================================
  // Pagination
  // =========================================================================

  describe('pagination', () => {
    it('supports limit parameter', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { limit: 1, response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.limit).toBe(1)
      expect(parsed.items.length).toBeLessThanOrEqual(1)
    })

    it('supports offset parameter', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { offset: 0, limit: 10, response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.offset).toBe(0)
    })

    it('handles large offset gracefully', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { offset: 9999, response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      // With large offset, should return empty items but not error
      expect(parsed.items).toBeInstanceOf(Array)
      expect(parsed.offset).toBe(9999)
    })
  })

  // =========================================================================
  // Response Content
  // =========================================================================

  describe('response content', () => {
    it('returns document items with expected structure', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      // Verify response structure
      expect(parsed).toHaveProperty('items')
      expect(parsed).toHaveProperty('total')
      expect(parsed).toHaveProperty('offset')
      expect(parsed).toHaveProperty('limit')

      // If documents exist, verify item structure
      if (parsed.items.length > 0) {
        const doc = parsed.items[0]
        expect(doc).toHaveProperty('docId')
        expect(doc).toHaveProperty('name')
        expect(doc).toHaveProperty('access')
      }
    })
  })

  // =========================================================================
  // Schema Validation
  // =========================================================================

  describe('schema validation', () => {
    it('rejects invalid response_format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { response_format: 'invalid' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid detail_level', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { detail_level: 'invalid' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects negative limit', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { limit: -1 }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects negative offset', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { offset: -1 }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects limit exceeding maximum', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { limit: 10000 }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid docId format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { docId: 'invalid!' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects docId with forbidden characters (0OIl)', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { docId: '0OIl567890123456789012' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects docId with wrong length', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { docId: 'short' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects empty name_contains', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: { name_contains: '' }
      })

      expect(result.isError).toBe(true)
    })
  })
})
