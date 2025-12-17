/**
 * MCP Integration Tests - grist_get_workspaces
 *
 * Tests the grist_get_workspaces tool via MCP protocol.
 * Validates full stack: MCP → Zod validation → Tool → Grist API → Response formatting
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMCPTestClient, type MCPTestContext } from '../../helpers/mcp-test-client.js'

describe('grist_get_workspaces', () => {
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
    it('returns workspaces with default parameters', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
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

    it('returns workspaces with json format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
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

    it('returns workspaces with markdown format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: { response_format: 'markdown' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      // Markdown format should contain headers or formatting
      expect(text).toMatch(/[#*-]|workspace/i)
    })

    it('supports summary detail level', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: { detail_level: 'summary', response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
      // Summary should have basic fields
      if (parsed.items.length > 0) {
        expect(parsed.items[0]).toHaveProperty('id')
        expect(parsed.items[0]).toHaveProperty('name')
      }
    })

    it('supports detailed level', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: { detail_level: 'detailed', response_format: 'json' }
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
        name: 'grist_get_workspaces',
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
        name: 'grist_get_workspaces',
        arguments: { offset: 0, limit: 10, response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.offset).toBe(0)
    })

    it('handles large offset gracefully', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
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
    it('returns workspace items with expected structure', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
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

      // If workspaces exist, verify item structure
      if (parsed.items.length > 0) {
        const workspace = parsed.items[0]
        expect(workspace).toHaveProperty('id')
        expect(workspace).toHaveProperty('name')
      }
    })
  })

  // =========================================================================
  // Schema Validation
  // =========================================================================

  describe('schema validation', () => {
    it('rejects invalid response_format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: { response_format: 'invalid' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid detail_level', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: { detail_level: 'invalid' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects negative limit', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: { limit: -1 }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects negative offset', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: { offset: -1 }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects limit exceeding maximum', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: { limit: 10000 }
      })

      expect(result.isError).toBe(true)
    })
  })
})
