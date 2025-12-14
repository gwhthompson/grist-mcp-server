/**
 * MCP Protocol Tests - Error Serialization
 *
 * Validates that errors are correctly serialized through the MCP protocol layer,
 * enabling models to self-correct.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMCPTestClient, type MCPTestContext } from '../helpers/mcp-test-client.js'

describe('MCP Protocol - Error Serialization', () => {
  let ctx: MCPTestContext

  beforeAll(async () => {
    ctx = await createMCPTestClient()
  })

  afterAll(async () => {
    await ctx.cleanup()
  })

  describe('validation errors', () => {
    it('should return isError: true for invalid docId format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: 'invalid', // Too short - should fail validation
          tableId: 'Test'
        }
      })

      expect(result.isError).toBe(true)
      expect(result.content).toBeDefined()
      expect(result.content[0].type).toBe('text')

      const text = (result.content[0] as { text: string }).text
      // Should contain actionable error message
      expect(text.toLowerCase()).toMatch(/invalid|validation|docid/i)
    })

    it('should return isError: true for invalid tableId format', async () => {
      // Valid docId format but invalid tableId (lowercase start)
      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: '1234567890123456789012', // Valid Base58 format
          tableId: 'lowercase' // Invalid - must start with uppercase
        }
      })

      expect(result.isError).toBe(true)

      const text = (result.content[0] as { text: string }).text
      expect(text.toLowerCase()).toMatch(/invalid|validation|tableid/i)
    })

    it('should include field path in validation error', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: 'short', // Too short
          tableId: 'Test'
        }
      })

      expect(result.isError).toBe(true)

      const text = (result.content[0] as { text: string }).text
      expect(text).toContain('docId')
    })

    it('should return actionable error for unknown tool name in help', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_help',
        arguments: {
          tool_name: 'nonexistent_tool',
          topic: 'overview'
        }
      })

      expect(result.isError).toBe(true)

      const text = (result.content[0] as { text: string }).text
      expect(text.toLowerCase()).toMatch(/not found|unknown|invalid/i)
    })
  })

  describe('API errors', () => {
    it('should return isError: true for non-existent document', async () => {
      // Valid format but non-existent document
      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: 'AAAAAAAAAAAAAAAAAAAAAA', // Valid format, doesn't exist
          tableId: 'Test'
        }
      })

      expect(result.isError).toBe(true)

      const text = (result.content[0] as { text: string }).text
      // Should indicate the document wasn't found
      expect(text.toLowerCase()).toMatch(/not found|404|does not exist|cannot access/i)
    })

    it('should return isError: true for non-existent table', async () => {
      // First get a real workspace to get a document
      const wsResult = await ctx.client.callTool({
        name: 'grist_get_workspaces',
        arguments: { response_format: 'json', limit: 1 }
      })

      if (wsResult.isError) {
        // If we can't get workspaces, skip this test
        return
      }

      const wsData = JSON.parse((wsResult.content[0] as { text: string }).text)
      if (!wsData.items || wsData.items.length === 0) {
        return // No workspaces to test with
      }

      // Try to get documents
      const docsResult = await ctx.client.callTool({
        name: 'grist_get_documents',
        arguments: {
          workspaceId: wsData.items[0].id,
          response_format: 'json'
        }
      })

      if (docsResult.isError) {
        return // No documents to test with
      }

      const docsData = JSON.parse((docsResult.content[0] as { text: string }).text)
      if (!docsData.items || docsData.items.length === 0) {
        return // No documents to test with
      }

      // Now try to access a non-existent table
      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: docsData.items[0].id,
          tableId: 'NonExistentTable99999'
        }
      })

      expect(result.isError).toBe(true)

      const text = (result.content[0] as { text: string }).text
      expect(text.toLowerCase()).toMatch(/not found|does not exist|no such table/i)
    })
  })

  describe('error message quality', () => {
    it('should provide clear error messages for validation failures', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: 'x', // Invalid
          tableId: 'Test',
          operations: []
        }
      })

      expect(result.isError).toBe(true)

      const text = (result.content[0] as { text: string }).text

      // Error should be informative
      expect(text.length).toBeGreaterThan(20)

      // Should mention what's wrong
      expect(text.toLowerCase()).toMatch(/docid|document|22|base58/i)
    })

    it('should not expose internal stack traces', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: 'invalid',
          tableId: 'Test'
        }
      })

      expect(result.isError).toBe(true)

      const text = (result.content[0] as { text: string }).text

      // Should not contain internal stack traces
      expect(text).not.toMatch(/at\s+\w+\s+\(/)
      expect(text).not.toContain('node_modules')
    })
  })

  describe('partial failure handling', () => {
    it('should handle operations array errors gracefully', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: 'AAAAAAAAAAAAAAAAAAAAAA', // Valid format
          tableId: 'TestTable',
          operations: [
            {
              action: 'add',
              records: [{ Name: 'Test' }]
            }
          ]
        }
      })

      // Response should exist and contain content
      expect(result.content).toBeDefined()
      expect(result.content.length).toBeGreaterThan(0)

      const text = (result.content[0] as { text: string }).text

      // Should indicate failure either via isError flag or error content
      // grist_manage_records returns operation-level errors in content
      // rather than setting isError: true at protocol level
      const indicatesError =
        result.isError === true ||
        text.toLowerCase().includes('error') ||
        text.toLowerCase().includes('not found') ||
        text.toLowerCase().includes('failed') ||
        text.toLowerCase().includes('cannot access')

      expect(indicatesError, `Expected error indication in: ${text}`).toBe(true)

      // Should have meaningful content
      expect(text.length).toBeGreaterThan(0)
    })
  })
})
