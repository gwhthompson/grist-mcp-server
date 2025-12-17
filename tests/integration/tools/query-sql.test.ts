/**
 * MCP Integration Tests - grist_query_sql
 *
 * Tests the grist_query_sql tool via MCP protocol.
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

describe('grist_query_sql', () => {
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

    // Create test table using MCP tool
    const schemaResult = await ctx.client.callTool({
      name: 'grist_manage_schema',
      arguments: {
        docId: testDocId,
        operations: [
          {
            action: 'create_table',
            name: 'Products',
            columns: [
              { colId: 'Name', type: 'Text' },
              { colId: 'Price', type: 'Numeric' },
              { colId: 'Category', type: 'Text' }
            ]
          }
        ],
        response_format: 'json'
      }
    })

    if (schemaResult.isError) {
      console.log('Failed to create table:', JSON.stringify(schemaResult.content))
      return
    }

    // Add test data
    const recordsResult = await ctx.client.callTool({
      name: 'grist_manage_records',
      arguments: {
        docId: testDocId,
        operations: [
          {
            action: 'add',
            tableId: 'Products',
            records: [
              { Name: 'Widget A', Price: 10.99, Category: 'Electronics' },
              { Name: 'Widget B', Price: 24.99, Category: 'Electronics' },
              { Name: 'Gadget X', Price: 99.99, Category: 'Hardware' }
            ]
          }
        ],
        response_format: 'json'
      }
    })

    if (recordsResult.isError) {
      console.log('Failed to add records:', JSON.stringify(recordsResult.content))
      return
    }
  }, 120000)

  afterAll(async () => {
    // Clean up test workspace and document
    await cleanupTestContext(apiContext)
    await ctx.cleanup()
  })

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
  // Success Cases
  // =========================================================================

  describe('success cases', () => {
    it('executes basic SELECT query', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: testDocId,
          sql: 'SELECT Name, Price FROM Products',
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
      expect(result.content).toBeDefined()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.records).toBeInstanceOf(Array)
      expect(parsed.records.length).toBeGreaterThan(0)
    })

    it('executes SELECT with WHERE clause', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: testDocId,
          sql: "SELECT Name, Price FROM Products WHERE Category = 'Electronics'",
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.records).toBeInstanceOf(Array)
    })

    it('executes SELECT with aggregation', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: testDocId,
          sql: 'SELECT Category, COUNT(*) as Count, AVG(Price) as AvgPrice FROM Products GROUP BY Category',
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.records).toBeInstanceOf(Array)
    })

    it('executes SELECT with ORDER BY', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: testDocId,
          sql: 'SELECT Name, Price FROM Products ORDER BY Price DESC',
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.records).toBeInstanceOf(Array)
      // First record should have highest price (SQL may return "Price" or use original column name)
      if (parsed.records.length >= 2) {
        const price0 = parsed.records[0].Price ?? parsed.records[0].price
        const price1 = parsed.records[1].Price ?? parsed.records[1].price
        if (price0 !== undefined && price1 !== undefined) {
          expect(price0).toBeGreaterThanOrEqual(price1)
        }
      }
    })

    it('supports markdown response format', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: testDocId,
          sql: 'SELECT Name, Price FROM Products',
          response_format: 'markdown'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      // Markdown format should contain headers or formatting
      expect(text).toMatch(/[#*-|]|name|price/i)
    })
  })

  // =========================================================================
  // Parameterized Queries
  // =========================================================================

  describe('parameterized queries', () => {
    it('supports string parameter', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: testDocId,
          sql: 'SELECT Name, Price FROM Products WHERE Category = ?',
          parameters: ['Electronics'],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.records).toBeInstanceOf(Array)
    })

    it('supports numeric parameter', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: testDocId,
          sql: 'SELECT Name, Price FROM Products WHERE Price > ?',
          parameters: [20],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.records).toBeInstanceOf(Array)
    })

    it('supports multiple parameters', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: testDocId,
          sql: 'SELECT Name, Price FROM Products WHERE Category = ? AND Price > ?',
          parameters: ['Electronics', 15],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.records).toBeInstanceOf(Array)
    })
  })

  // =========================================================================
  // Pagination
  // =========================================================================

  describe('pagination', () => {
    it('supports limit parameter', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: testDocId,
          sql: 'SELECT Name, Price FROM Products',
          limit: 1,
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.records.length).toBeLessThanOrEqual(1)
    })

    it('supports offset parameter', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: testDocId,
          sql: 'SELECT Name, Price FROM Products',
          offset: 1,
          limit: 10,
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.records).toBeInstanceOf(Array)
    })
  })

  // =========================================================================
  // Error Cases
  // =========================================================================

  describe('error cases', () => {
    it('returns error for non-existent document', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          sql: 'SELECT * FROM Test',
          response_format: 'json'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('returns error for invalid SQL syntax', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: testDocId,
          sql: 'SELEKT * FORM Products', // Invalid SQL
          response_format: 'json'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('returns error for non-existent table', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: testDocId,
          sql: 'SELECT * FROM NonExistentTable',
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
        name: 'grist_query_sql',
        arguments: { sql: 'SELECT * FROM Test' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects missing required sql', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: { docId: 'abcdefghij1234567890ab' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects empty sql', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          sql: ''
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid docId format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: 'invalid!',
          sql: 'SELECT * FROM Test'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid response_format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          sql: 'SELECT * FROM Test',
          response_format: 'invalid'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects negative limit', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          sql: 'SELECT * FROM Test',
          limit: -1
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects negative offset', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          sql: 'SELECT * FROM Test',
          offset: -1
        }
      })

      expect(result.isError).toBe(true)
    })
  })
})
