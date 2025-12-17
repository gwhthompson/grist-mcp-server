/**
 * MCP Integration Tests - grist_help
 *
 * Tests the grist_help tool via MCP protocol.
 * Validates full stack: MCP → Zod validation → Tool → Response formatting
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMCPTestClient, type MCPTestContext } from '../../helpers/mcp-test-client.js'

describe('grist_help', () => {
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
    it('returns help for grist_get_workspaces', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_get_workspaces' }
      })

      expect(result.isError).toBeFalsy()
      expect(result.content).toBeDefined()
      expect(result.content[0].type).toBe('text')

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.toolName).toBe('grist_get_workspaces')
      expect(parsed.documentation).toBeDefined()
    })

    it('returns help for grist_manage_records', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_manage_records' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.toolName).toBe('grist_manage_records')
      expect(parsed.documentation).toBeDefined()
    })

    it('returns help for grist_manage_schema', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_manage_schema' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.toolName).toBe('grist_manage_schema')
    })

    it('returns help for grist_query_sql', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_query_sql' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.toolName).toBe('grist_query_sql')
    })
  })

  // =========================================================================
  // Topic Filtering
  // =========================================================================

  describe('topic filtering', () => {
    it('returns overview topic', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_get_records', topic: 'overview' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.topic).toBe('overview')
      expect(parsed.documentation).toBeDefined()
    })

    it('returns examples topic', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_get_records', topic: 'examples' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.topic).toBe('examples')
    })

    it('returns errors topic', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_get_records', topic: 'errors' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.topic).toBe('errors')
    })

    it('returns parameters topic', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_get_records', topic: 'parameters' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.topic).toBe('parameters')
    })

    it('returns full topic (default)', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_get_records', topic: 'full' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.topic).toBe('full')
    })

    it('defaults to full topic when not specified', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_get_records' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.topic).toBe('full')
    })
  })

  // =========================================================================
  // Response Format
  // =========================================================================

  describe('response format', () => {
    it('returns json format correctly', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_get_workspaces', response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      expect(() => JSON.parse(text)).not.toThrow()

      const parsed = JSON.parse(text)
      expect(parsed.toolName).toBeDefined()
      expect(parsed.topic).toBeDefined()
      expect(parsed.documentation).toBeDefined()
      expect(parsed.availableTopics).toBeDefined()
    })

    it('returns markdown format correctly', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_get_workspaces', response_format: 'markdown' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      // Markdown should contain headers or formatting
      expect(text).toMatch(/[#*-]|help|tool|documentation/i)
    })
  })

  // =========================================================================
  // Response Content
  // =========================================================================

  describe('response content', () => {
    it('includes available topics in response', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_get_records', response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.availableTopics).toBeInstanceOf(Array)
      expect(parsed.availableTopics).toContain('overview')
      expect(parsed.availableTopics).toContain('examples')
      expect(parsed.availableTopics).toContain('errors')
      expect(parsed.availableTopics).toContain('parameters')
      expect(parsed.availableTopics).toContain('full')
    })

    it('includes next steps in response', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_get_records', response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      // Next steps may or may not be present
      if (parsed.nextSteps) {
        expect(parsed.nextSteps).toBeInstanceOf(Array)
      }
    })
  })

  // =========================================================================
  // All Tools
  // =========================================================================

  describe('all tools', () => {
    const toolNames = [
      'grist_get_workspaces',
      'grist_get_documents',
      'grist_get_tables',
      'grist_get_records',
      'grist_query_sql',
      'grist_manage_records',
      'grist_manage_schema',
      'grist_manage_pages',
      'grist_create_document',
      'grist_manage_webhooks',
      'grist_help'
    ]

    for (const toolName of toolNames) {
      it(`returns help for ${toolName}`, async () => {
        const result = await ctx.client.callTool({
          name: 'grist_help',
          arguments: { tool_name: toolName }
        })

        expect(result.isError).toBeFalsy()

        const text = (result.content[0] as { text: string }).text
        const parsed = JSON.parse(text)

        expect(parsed.toolName).toBe(toolName)
        expect(parsed.documentation).toBeDefined()
      })
    }
  })

  // =========================================================================
  // Schema Validation
  // =========================================================================

  describe('schema validation', () => {
    it('rejects missing required tool_name', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: {}
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid tool_name', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'invalid_tool_name' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid topic', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_get_workspaces', topic: 'invalid' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid response_format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: { tool_name: 'grist_get_workspaces', response_format: 'invalid' }
      })

      expect(result.isError).toBe(true)
    })
  })
})
