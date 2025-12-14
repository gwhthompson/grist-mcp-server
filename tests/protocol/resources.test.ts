/**
 * MCP Protocol Tests - Resources
 *
 * Validates that resources are correctly exposed through
 * the MCP protocol layer.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMCPTestClient, type MCPTestContext } from '../helpers/mcp-test-client.js'

describe('MCP Protocol - Resources', () => {
  let ctx: MCPTestContext

  beforeAll(async () => {
    ctx = await createMCPTestClient()
  })

  afterAll(async () => {
    await ctx.cleanup()
  })

  describe('resources/list', () => {
    it('should return resource list', async () => {
      const result = await ctx.client.listResources()

      expect(result.resources).toBeDefined()
      expect(Array.isArray(result.resources)).toBe(true)
    })

    it('should include document index resource', async () => {
      const result = await ctx.client.listResources()

      const docIndexResource = result.resources.find(
        (r) => r.uri === 'grist://docs' || r.name === 'grist_documents'
      )
      expect(docIndexResource).toBeDefined()
      expect(docIndexResource?.mimeType).toBe('application/json')
    })
  })

  describe('resource templates', () => {
    it('should return resource templates', async () => {
      const result = await ctx.client.listResourceTemplates()

      expect(result.resourceTemplates).toBeDefined()
      expect(Array.isArray(result.resourceTemplates)).toBe(true)
    })

    it('should include document schema template', async () => {
      const result = await ctx.client.listResourceTemplates()

      const docSchemaTemplate = result.resourceTemplates.find(
        (t) => t.uriTemplate?.includes('{docId}') && !t.uriTemplate?.includes('{tableId}')
      )
      expect(docSchemaTemplate).toBeDefined()
      expect(docSchemaTemplate?.name).toBe('grist_document_schema')
      expect(docSchemaTemplate?.mimeType).toBe('application/json')
    })

    it('should include table schema template', async () => {
      const result = await ctx.client.listResourceTemplates()

      const tableSchemaTemplate = result.resourceTemplates.find((t) =>
        t.uriTemplate?.includes('{tableId}')
      )
      expect(tableSchemaTemplate).toBeDefined()
      expect(tableSchemaTemplate?.name).toBe('grist_table_schema')
      expect(tableSchemaTemplate?.uriTemplate).toContain('{docId}')
      expect(tableSchemaTemplate?.uriTemplate).toContain('{tableId}')
    })

    it('should include page structure template', async () => {
      const result = await ctx.client.listResourceTemplates()

      const pageStructureTemplate = result.resourceTemplates.find((t) =>
        t.uriTemplate?.includes('/pages')
      )
      expect(pageStructureTemplate).toBeDefined()
      expect(pageStructureTemplate?.name).toBe('grist_page_structure')
    })
  })

  describe('resource metadata', () => {
    it('should include descriptions for resources', async () => {
      const result = await ctx.client.listResources()

      for (const resource of result.resources) {
        expect(
          resource.description,
          `Resource ${resource.uri} should have description`
        ).toBeDefined()
      }
    })

    it('should include descriptions for resource templates', async () => {
      const result = await ctx.client.listResourceTemplates()

      for (const template of result.resourceTemplates) {
        expect(
          template.description,
          `Template ${template.name} should have description`
        ).toBeDefined()
      }
    })

    it('should use application/json mime type for all resources', async () => {
      const result = await ctx.client.listResources()

      for (const resource of result.resources) {
        expect(resource.mimeType).toBe('application/json')
      }

      const templatesResult = await ctx.client.listResourceTemplates()
      for (const template of templatesResult.resourceTemplates) {
        expect(template.mimeType).toBe('application/json')
      }
    })
  })

  describe('URI scheme', () => {
    it('should use grist:// URI scheme', async () => {
      const result = await ctx.client.listResources()

      for (const resource of result.resources) {
        expect(resource.uri).toMatch(/^grist:\/\//)
      }

      const templatesResult = await ctx.client.listResourceTemplates()
      for (const template of templatesResult.resourceTemplates) {
        expect(template.uriTemplate).toMatch(/^grist:\/\//)
      }
    })

    it('should have hierarchical URI structure', async () => {
      const result = await ctx.client.listResourceTemplates()

      // Document schema: grist://docs/{docId}
      const docTemplate = result.resourceTemplates.find((t) => t.name === 'grist_document_schema')
      expect(docTemplate?.uriTemplate).toBe('grist://docs/{docId}')

      // Table schema: grist://docs/{docId}/tables/{tableId}
      const tableTemplate = result.resourceTemplates.find((t) => t.name === 'grist_table_schema')
      expect(tableTemplate?.uriTemplate).toBe('grist://docs/{docId}/tables/{tableId}')

      // Page structure: grist://docs/{docId}/pages
      const pageTemplate = result.resourceTemplates.find((t) => t.name === 'grist_page_structure')
      expect(pageTemplate?.uriTemplate).toBe('grist://docs/{docId}/pages')
    })
  })

  describe('resources/read', () => {
    it('should read document index resource', async () => {
      const result = await ctx.client.readResource({ uri: 'grist://docs' })

      expect(result.contents).toBeDefined()
      expect(result.contents.length).toBeGreaterThan(0)

      // Content should be JSON
      const content = result.contents[0]
      expect(content.mimeType).toBe('application/json')

      // Should be parseable JSON
      if (content.text) {
        expect(() => JSON.parse(content.text)).not.toThrow()
      }
    })
  })
})
