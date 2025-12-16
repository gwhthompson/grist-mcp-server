/**
 * MCP Protocol Tests - Schema Generation
 *
 * Validates that JSON schemas generated from Zod schemas
 * are compliant with MCP spec and JSON Schema 2020-12.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMCPTestClient, type MCPTestContext } from '../helpers/mcp-test-client.js'

describe('MCP Protocol - Schema Generation', () => {
  let ctx: MCPTestContext

  beforeAll(async () => {
    ctx = await createMCPTestClient({ skipResources: true })
  })

  afterAll(async () => {
    await ctx.cleanup()
  })

  describe('JSON Schema compliance', () => {
    it('should have valid $schema reference if present', async () => {
      const result = await ctx.client.listTools()

      for (const tool of result.tools) {
        const schema = tool.inputSchema as Record<string, unknown>

        // MCP spec says default is 2020-12 if no $schema field
        // If present, should be a valid JSON Schema reference (SDK uses draft-07)
        if (schema.$schema) {
          expect(schema.$schema).toContain('json-schema.org')
        }
      }
    })

    it('should have type: object for all tool schemas', async () => {
      const result = await ctx.client.listTools()

      for (const tool of result.tools) {
        expect(tool.inputSchema.type).toBe('object')
      }
    })

    it('should have valid additionalProperties setting', async () => {
      const result = await ctx.client.listTools()

      for (const tool of result.tools) {
        const schema = tool.inputSchema as Record<string, unknown>
        // Should either be false or not present
        if (schema.additionalProperties !== undefined) {
          expect(schema.additionalProperties).toBe(false)
        }
      }
    })
  })

  describe('$defs reference resolution', () => {
    it('should have inlined docId/tableId schemas (not $refs)', async () => {
      const result = await ctx.client.listTools()

      // grist_manage_records should have docId/tableId inlined (not in $defs)
      // This avoids $ref indirection that causes model hallucination
      const manageRecordsTool = result.tools.find((t) => t.name === 'grist_manage_records')
      expect(manageRecordsTool).toBeDefined()

      const schema = manageRecordsTool?.inputSchema as Record<string, unknown>
      const props = schema.properties as Record<string, Record<string, unknown>>

      // docId should be inlined with type: "string" directly
      expect(props.docId).toBeDefined()
      expect(props.docId.type).toBe('string')
      expect(props.docId.pattern).toBeDefined()
    })

    it('should have valid schema structure after $ref resolution', async () => {
      const result = await ctx.client.listTools()

      for (const tool of result.tools) {
        const schema = tool.inputSchema as Record<string, unknown>

        // Properties should be defined (unless tool has no parameters)
        if (schema.properties) {
          expect(typeof schema.properties).toBe('object')
        }

        // If $defs exist, they should be objects
        if (schema.$defs) {
          expect(typeof schema.$defs).toBe('object')
          for (const [defName, defSchema] of Object.entries(
            schema.$defs as Record<string, unknown>
          )) {
            expect(defSchema, `$defs.${defName} should be an object`).toBeDefined()
            expect(typeof defSchema).toBe('object')
          }
        }
      }
    })

    it('should have no unnamed schemas in $defs', async () => {
      // This regression test ensures all reused schemas are properly registered
      // with z.globalRegistry. Unregistered schemas get auto-generated names
      // like __schema0, __schema1 which are opaque and break documentation.
      const result = await ctx.client.listTools()

      for (const tool of result.tools) {
        const schema = tool.inputSchema as Record<string, unknown>
        if (schema.$defs) {
          for (const key of Object.keys(schema.$defs as Record<string, unknown>)) {
            expect(
              key.startsWith('__schema'),
              `Tool ${tool.name} has unnamed schema "${key}" - register it with z.globalRegistry`
            ).toBe(false)
          }
        }
      }
    })
  })

  describe('required fields', () => {
    it('should mark required parameters correctly', async () => {
      const result = await ctx.client.listTools()

      // grist_get_records requires docId and tableId
      const getRecordsTool = result.tools.find((t) => t.name === 'grist_get_records')
      expect(getRecordsTool).toBeDefined()

      const schema = getRecordsTool?.inputSchema as Record<string, unknown>
      const required = schema.required as string[]

      expect(required).toBeDefined()
      expect(required).toContain('docId')
      expect(required).toContain('tableId')
    })

    it('should not require optional parameters', async () => {
      const result = await ctx.client.listTools()

      const getRecordsTool = result.tools.find((t) => t.name === 'grist_get_records')
      expect(getRecordsTool).toBeDefined()

      const schema = getRecordsTool?.inputSchema as Record<string, unknown>
      const required = schema.required as string[] | undefined

      // response_format, filters, columns should NOT be required
      expect(required).not.toContain('response_format')
      expect(required).not.toContain('filters')
      expect(required).not.toContain('columns')
    })
  })

  describe('enum constraints', () => {
    it('should include enum values for constrained parameters', async () => {
      const result = await ctx.client.listTools()

      const getWorkspacesTool = result.tools.find((t) => t.name === 'grist_get_workspaces')
      expect(getWorkspacesTool).toBeDefined()

      const schema = getWorkspacesTool?.inputSchema as Record<string, unknown>
      const properties = schema.properties as Record<string, Record<string, unknown>>

      // detail_level should have enum constraint
      const detailLevel = properties.detail_level
      expect(detailLevel?.enum).toBeDefined()
      expect(Array.isArray(detailLevel?.enum)).toBe(true)
      expect(detailLevel?.enum).toContain('summary')
      expect(detailLevel?.enum).toContain('detailed')
    })

    it('should include enum values for response_format', async () => {
      const result = await ctx.client.listTools()

      const getRecordsTool = result.tools.find((t) => t.name === 'grist_get_records')
      expect(getRecordsTool).toBeDefined()

      const schema = getRecordsTool?.inputSchema as Record<string, unknown>
      const properties = schema.properties as Record<string, Record<string, unknown>>

      const responseFormat = properties.response_format
      expect(responseFormat?.enum).toBeDefined()
      expect(responseFormat?.enum).toContain('json')
      expect(responseFormat?.enum).toContain('markdown')
    })
  })

  describe('default values', () => {
    it('should include default values where specified', async () => {
      const result = await ctx.client.listTools()

      const getWorkspacesTool = result.tools.find((t) => t.name === 'grist_get_workspaces')
      expect(getWorkspacesTool).toBeDefined()

      const schema = getWorkspacesTool?.inputSchema as Record<string, unknown>
      const properties = schema.properties as Record<string, Record<string, unknown>>

      // response_format should default to 'json'
      const responseFormat = properties.response_format
      expect(responseFormat?.default).toBe('json')

      // limit should have a default
      const limit = properties.limit
      expect(limit?.default).toBeDefined()
    })
  })

  describe('schema structure validation', () => {
    it('should have valid structure for grist_discover_tools schema', async () => {
      const result = await ctx.client.listTools()

      const discoverTool = result.tools.find((t) => t.name === 'grist_discover_tools')
      expect(discoverTool).toBeDefined()

      const schema = discoverTool?.inputSchema as Record<string, unknown>
      const properties = schema.properties as Record<string, Record<string, unknown>>

      // Should have detail_level, category, tool_name, response_format properties
      expect(properties.detail_level).toBeDefined()
      expect(properties.category).toBeDefined()
      expect(properties.tool_name).toBeDefined()
      expect(properties.response_format).toBeDefined()
    })

    it('should have valid structure for grist_get_records schema', async () => {
      const result = await ctx.client.listTools()

      const getRecordsTool = result.tools.find((t) => t.name === 'grist_get_records')
      expect(getRecordsTool).toBeDefined()

      const schema = getRecordsTool?.inputSchema as Record<string, unknown>
      const properties = schema.properties as Record<string, Record<string, unknown>>
      const required = schema.required as string[]

      // Required fields
      expect(required).toContain('docId')
      expect(required).toContain('tableId')

      // Should have expected properties
      expect(properties.docId).toBeDefined()
      expect(properties.tableId).toBeDefined()
      expect(properties.filters).toBeDefined()
      expect(properties.columns).toBeDefined()
      expect(properties.response_format).toBeDefined()
      expect(properties.limit).toBeDefined()
      expect(properties.offset).toBeDefined()
    })

    it('should have correct type definitions in properties', async () => {
      const result = await ctx.client.listTools()

      const getWorkspacesTool = result.tools.find((t) => t.name === 'grist_get_workspaces')
      expect(getWorkspacesTool).toBeDefined()

      const schema = getWorkspacesTool?.inputSchema as Record<string, unknown>
      const properties = schema.properties as Record<string, Record<string, unknown>>

      // limit should be integer type
      expect(properties.limit?.type).toBe('integer')

      // response_format should be string with enum
      expect(properties.response_format?.type).toBe('string')
      expect(properties.response_format?.enum).toBeDefined()
    })
  })
})
