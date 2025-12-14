/**
 * MCP Protocol Tests - tools/list
 *
 * Validates that the tools/list endpoint returns correct data
 * through the MCP protocol layer.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALL_TOOLS } from '../../src/registry/tool-definitions.js'
import { createMCPTestClient, type MCPTestContext } from '../helpers/mcp-test-client.js'

describe('MCP Protocol - tools/list', () => {
  let ctx: MCPTestContext

  beforeAll(async () => {
    ctx = await createMCPTestClient({ skipResources: true })
  })

  afterAll(async () => {
    await ctx.cleanup()
  })

  describe('tool count and names', () => {
    it('should return all 12 registered tools', async () => {
      const result = await ctx.client.listTools()
      expect(result.tools).toHaveLength(12)
    })

    it('should return tools with correct names', async () => {
      const result = await ctx.client.listTools()
      const toolNames = result.tools.map((t) => t.name).sort()

      const expectedNames = ALL_TOOLS.map((t) => t.name).sort()
      expect(toolNames).toEqual(expectedNames)
    })

    it('should include grist_discover_tools for progressive disclosure', async () => {
      const result = await ctx.client.listTools()
      const discoverTool = result.tools.find((t) => t.name === 'grist_discover_tools')

      expect(discoverTool).toBeDefined()
      expect(discoverTool?.description).toContain('progressive')
    })
  })

  describe('tool metadata', () => {
    it('should include title for each tool', async () => {
      const result = await ctx.client.listTools()

      for (const tool of result.tools) {
        expect(tool.title, `Tool ${tool.name} should have title`).toBeDefined()
        expect(typeof tool.title).toBe('string')
        expect(tool.title?.length).toBeGreaterThan(0)
      }
    })

    it('should include description for each tool', async () => {
      const result = await ctx.client.listTools()

      for (const tool of result.tools) {
        expect(tool.description, `Tool ${tool.name} should have description`).toBeDefined()
        expect(typeof tool.description).toBe('string')
        expect(tool.description?.length).toBeGreaterThan(0)
      }
    })

    it('should include annotations for each tool', async () => {
      const result = await ctx.client.listTools()

      for (const tool of result.tools) {
        expect(tool.annotations, `Tool ${tool.name} should have annotations`).toBeDefined()

        const annotations = tool.annotations as Record<string, unknown>
        expect(typeof annotations.readOnlyHint).toBe('boolean')
        expect(typeof annotations.destructiveHint).toBe('boolean')
        expect(typeof annotations.idempotentHint).toBe('boolean')
        expect(typeof annotations.openWorldHint).toBe('boolean')
      }
    })
  })

  describe('read-only tool annotations', () => {
    const readOnlyTools = [
      'grist_discover_tools',
      'grist_get_workspaces',
      'grist_get_documents',
      'grist_get_tables',
      'grist_get_records',
      'grist_query_sql',
      'grist_help'
    ]

    it.each(readOnlyTools)('%s should have readOnlyHint: true', async (toolName) => {
      const result = await ctx.client.listTools()
      const tool = result.tools.find((t) => t.name === toolName)

      expect(tool).toBeDefined()
      const annotations = tool?.annotations as Record<string, unknown>
      expect(annotations.readOnlyHint).toBe(true)
    })
  })

  describe('write tool annotations', () => {
    const writeTools = [
      'grist_manage_records',
      'grist_manage_schema',
      'grist_manage_pages',
      'grist_create_document',
      'grist_manage_webhooks'
    ]

    it.each(writeTools)('%s should have readOnlyHint: false', async (toolName) => {
      const result = await ctx.client.listTools()
      const tool = result.tools.find((t) => t.name === toolName)

      expect(tool).toBeDefined()
      const annotations = tool?.annotations as Record<string, unknown>
      expect(annotations.readOnlyHint).toBe(false)
    })
  })

  describe('input schema', () => {
    it('should include inputSchema for each tool', async () => {
      const result = await ctx.client.listTools()

      for (const tool of result.tools) {
        expect(tool.inputSchema, `Tool ${tool.name} should have inputSchema`).toBeDefined()
        expect(tool.inputSchema.type).toBe('object')
      }
    })

    it('should use $defs for shared schema references', async () => {
      const result = await ctx.client.listTools()

      // grist_manage_records uses shared schemas like docId, tableId
      const manageRecordsTool = result.tools.find((t) => t.name === 'grist_manage_records')
      expect(manageRecordsTool).toBeDefined()

      const schema = manageRecordsTool?.inputSchema as Record<string, unknown>
      expect(schema.$defs, 'grist_manage_records should use $defs for shared schemas').toBeDefined()
    })

    it('should include required fields in schema', async () => {
      const result = await ctx.client.listTools()

      // grist_get_records requires docId and tableId
      const getRecordsTool = result.tools.find((t) => t.name === 'grist_get_records')
      expect(getRecordsTool).toBeDefined()

      const schema = getRecordsTool?.inputSchema as Record<string, unknown>
      const required = schema.required as string[]

      expect(required).toContain('docId')
      expect(required).toContain('tableId')
    })

    it('should include property descriptions', async () => {
      const result = await ctx.client.listTools()

      const getWorkspacesTool = result.tools.find((t) => t.name === 'grist_get_workspaces')
      expect(getWorkspacesTool).toBeDefined()

      const schema = getWorkspacesTool?.inputSchema as Record<string, unknown>
      const properties = schema.properties as Record<string, Record<string, unknown>>

      // detail_level should have a description
      expect(properties.detail_level?.description).toBeDefined()
    })
  })

  describe('output schema', () => {
    it('should include outputSchema for tools that define it', async () => {
      const result = await ctx.client.listTools()

      // These tools should have outputSchema based on tool definitions
      const toolsWithOutputSchema = [
        'grist_discover_tools',
        'grist_get_workspaces',
        'grist_get_documents',
        'grist_get_tables',
        'grist_get_records',
        'grist_query_sql',
        'grist_manage_records',
        'grist_manage_schema',
        'grist_manage_pages',
        'grist_create_document',
        'grist_manage_webhooks'
      ]

      for (const toolName of toolsWithOutputSchema) {
        const tool = result.tools.find((t) => t.name === toolName)
        expect(tool, `Tool ${toolName} should exist`).toBeDefined()

        // Note: outputSchema might not be present in SDK types, access via type assertion
        const toolWithOutput = tool as unknown as { outputSchema?: unknown }
        expect(
          toolWithOutput.outputSchema,
          `Tool ${toolName} should have outputSchema`
        ).toBeDefined()
      }
    })
  })
})
