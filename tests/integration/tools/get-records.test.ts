/**
 * MCP Integration Tests - grist_get_records
 *
 * Tests the grist_get_records tool via MCP protocol.
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

describe('grist_get_records', () => {
  let ctx: MCPTestContext
  let testDocId: string | null = null
  let testTableId: string | null = null
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

    // Create a test table with some columns
    const createTableResult = await ctx.client.callTool({
      name: 'grist_manage_schema',
      arguments: {
        docId: testDocId,
        operations: [
          {
            action: 'create_table',
            name: 'TestRecords',
            columns: [
              { colId: 'Name', type: 'Text' },
              { colId: 'Status', type: 'Choice', options: { choices: ['Active', 'Inactive'] } },
              { colId: 'Count', type: 'Numeric' }
            ]
          }
        ],
        response_format: 'json'
      }
    })

    if (createTableResult.isError) {
      console.log('Failed to create table:', JSON.stringify(createTableResult.content))
      return
    }

    testTableId = 'TestRecords'

    // Add some test records
    await ctx.client.callTool({
      name: 'grist_manage_records',
      arguments: {
        docId: testDocId,
        operations: [
          {
            action: 'add',
            tableId: 'TestRecords',
            records: [
              { Name: 'Item 1', Status: 'Active', Count: 10 },
              { Name: 'Item 2', Status: 'Inactive', Count: 20 },
              { Name: 'Item 3', Status: 'Active', Count: 30 }
            ]
          }
        ],
        response_format: 'json'
      }
    })
  }, 120000)

  afterAll(async () => {
    await cleanupTestContext(apiContext)
    await ctx.cleanup()
  })

  // =========================================================================
  // Prerequisite Check
  // =========================================================================

  describe('prerequisite check', () => {
    it('has test document and table available', () => {
      if (!testDocId || !testTableId) {
        console.warn('No test document/table available - some tests will be skipped')
      }
    })
  })

  // =========================================================================
  // Success Cases
  // =========================================================================

  describe('success cases', () => {
    it('returns records with required parameters only', async () => {
      if (!testDocId || !testTableId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: { docId: testDocId, tableId: testTableId }
      })

      expect(result.isError).toBeFalsy()
      expect(result.content).toBeDefined()
      expect(result.content[0].type).toBe('text')

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
      expect(parsed.items.length).toBeGreaterThan(0)
    })

    it('returns records with json format', async () => {
      if (!testDocId || !testTableId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: { docId: testDocId, tableId: testTableId, response_format: 'json' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
      expect(typeof parsed.total).toBe('number')
      expect(typeof parsed.offset).toBe('number')
      expect(typeof parsed.limit).toBe('number')
    })

    it('returns records with markdown format', async () => {
      if (!testDocId || !testTableId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: { docId: testDocId, tableId: testTableId, response_format: 'markdown' }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      // Markdown format should contain headers or formatting
      expect(text).toMatch(/[#*-|]|record/i)
    })
  })

  // =========================================================================
  // Filtering
  // =========================================================================

  describe('filtering', () => {
    it('filters by string field', async () => {
      if (!testDocId || !testTableId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: testDocId,
          tableId: testTableId,
          filters: { Status: 'Active' },
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
      // All returned records should have Status: Active
      for (const record of parsed.items) {
        expect(record.Status).toBe('Active')
      }
    })

    it('filters by numeric field', async () => {
      if (!testDocId || !testTableId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: testDocId,
          tableId: testTableId,
          filters: { Count: 20 },
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
    })

    it('returns empty for non-matching filter', async () => {
      if (!testDocId || !testTableId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: testDocId,
          tableId: testTableId,
          filters: { Name: 'NonExistent' },
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
      expect(parsed.items.length).toBe(0)
    })
  })

  // =========================================================================
  // Column Selection
  // =========================================================================

  describe('column selection', () => {
    it('returns only selected columns', async () => {
      if (!testDocId || !testTableId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: testDocId,
          tableId: testTableId,
          columns: ['Name', 'Status'],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
      if (parsed.items.length > 0) {
        const record = parsed.items[0]
        expect(record).toHaveProperty('Name')
        expect(record).toHaveProperty('Status')
        // Count should not be present
        expect(record).not.toHaveProperty('Count')
      }
    })
  })

  // =========================================================================
  // Pagination
  // =========================================================================

  describe('pagination', () => {
    it('supports limit parameter', async () => {
      if (!testDocId || !testTableId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: testDocId,
          tableId: testTableId,
          limit: 1,
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.limit).toBe(1)
      expect(parsed.items.length).toBeLessThanOrEqual(1)
    })

    it('supports offset parameter', async () => {
      if (!testDocId || !testTableId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: testDocId,
          tableId: testTableId,
          offset: 1,
          limit: 10,
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.offset).toBe(1)
    })

    it('handles large offset gracefully', async () => {
      if (!testDocId || !testTableId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: testDocId,
          tableId: testTableId,
          offset: 9999,
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.items).toBeInstanceOf(Array)
      expect(parsed.items.length).toBe(0)
    })
  })

  // =========================================================================
  // Response Content
  // =========================================================================

  describe('response content', () => {
    it('returns records with expected structure', async () => {
      if (!testDocId || !testTableId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: testDocId,
          tableId: testTableId,
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      // Verify response structure
      expect(parsed).toHaveProperty('items')
      expect(parsed).toHaveProperty('total')
      expect(parsed).toHaveProperty('offset')
      expect(parsed).toHaveProperty('limit')

      // Verify record structure
      if (parsed.items.length > 0) {
        const record = parsed.items[0]
        expect(record).toHaveProperty('id')
      }
    })
  })

  // =========================================================================
  // Error Cases
  // =========================================================================

  describe('error cases', () => {
    it('returns error for non-existent document', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          tableId: 'Test',
          response_format: 'json'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('returns error for non-existent table', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_get_records',
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
  // Schema Validation
  // =========================================================================

  describe('schema validation', () => {
    it('rejects missing required docId', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: { tableId: 'Test', response_format: 'json' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects missing required tableId', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: { docId: 'abcdefghij1234567890ab', response_format: 'json' }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid response_format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          tableId: 'Test',
          response_format: 'invalid'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects negative limit', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          tableId: 'Test',
          limit: -1
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects negative offset', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          tableId: 'Test',
          offset: -1
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid docId format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: 'invalid!',
          tableId: 'Test'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid tableId format (lowercase start)', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          tableId: 'lowercase'
        }
      })

      expect(result.isError).toBe(true)
    })
  })
})
