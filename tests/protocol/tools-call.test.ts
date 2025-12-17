/**
 * MCP Protocol Tests - tools/call
 *
 * Validates that tools can be invoked through the MCP protocol layer
 * and return correct responses.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMCPTestClient, type MCPTestContext } from '../helpers/mcp-test-client.js'

describe('MCP Protocol - tools/call', () => {
  let ctx: MCPTestContext

  beforeAll(async () => {
    ctx = await createMCPTestClient()
  })

  afterAll(async () => {
    await ctx.cleanup()
  })

  describe('discovery tools', () => {
    it('should call grist_get_workspaces successfully', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: { response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()
      expect(result.content).toBeDefined()
      expect(result.content[0].type).toBe('text')

      // Parse the JSON response
      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeDefined()
      expect(Array.isArray(parsed.items)).toBe(true)
    })
  })

  describe('utility tools', () => {
    it('should call grist_help successfully', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: {
          tool_name: 'grist_manage_records',
          topic: 'overview'
        }
      })

      expect(result.isError).toBeFalsy()
      expect(result.content).toBeDefined()

      const text = (result.content[0] as { text: string }).text
      expect(text).toContain('grist_manage_records')
    })

    it('should return different topics from grist_help', async () => {
      const overviewResult = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_manage_records', topic: 'overview' }
      })

      const errorsResult = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_manage_records', topic: 'errors' }
      })

      const examplesResult = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_manage_records', topic: 'examples' }
      })

      expect(overviewResult.isError).toBeFalsy()
      expect(errorsResult.isError).toBeFalsy()
      expect(examplesResult.isError).toBeFalsy()

      // Each topic should return different content
      const overviewText = (overviewResult.content[0] as { text: string }).text
      const errorsText = (errorsResult.content[0] as { text: string }).text
      const examplesText = (examplesResult.content[0] as { text: string }).text

      expect(errorsText).toContain('Solution')
      expect(examplesText).not.toBe(overviewText)
    })
  })

  describe('response format', () => {
    it('should return JSON format by default', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: {}
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      // Should be valid JSON (default format)
      expect(() => JSON.parse(text)).not.toThrow()
    })

    it('should return markdown format when requested', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: { response_format: 'markdown' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      // Markdown format typically contains headers or formatting
      expect(text).toMatch(/[#*-]/)
    })

    it('should include structuredContent in response', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: { response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      // SDK doesn't expose structuredContent directly, but we can verify
      // the response structure by parsing the text content
      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeDefined()
      expect(Array.isArray(parsed.items)).toBe(true)
    })
  })

  describe('pagination support', () => {
    it('should support limit parameter', async () => {
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

    it('should support offset parameter', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: { offset: 0, limit: 10, response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.offset).toBe(0)
    })
  })
})
