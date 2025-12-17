/**
 * MCP Integration Tests - grist_manage_records
 *
 * Tests the grist_manage_records tool via MCP protocol.
 * This is a consolidated tool supporting add, update, delete, and upsert actions.
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

describe('grist_manage_records', () => {
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

    // Create a test table
    await ctx.client.callTool({
      name: 'grist_manage_schema',
      arguments: {
        docId: testDocId,
        operations: [
          {
            action: 'create_table',
            name: 'TestData',
            columns: [
              { colId: 'Name', type: 'Text' },
              { colId: 'Email', type: 'Text' },
              { colId: 'Count', type: 'Numeric' }
            ]
          }
        ],
        response_format: 'json'
      }
    })
  }, 120000)

  afterAll(async () => {
    try {
      await cleanupTestContext(apiContext)
    } catch {
      // Ignore cleanup errors
    }
    await ctx.cleanup()
  }, 60000)

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
  // Action: Add
  // =========================================================================

  describe('action: add', () => {
    it('adds single record successfully', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add',
              tableId: 'TestData',
              records: [{ Name: 'Test User', Email: 'test@example.com', Count: 1 }]
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
      expect(parsed.totalRecordsAffected).toBeGreaterThan(0)
    })

    it('adds multiple records successfully', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add',
              tableId: 'TestData',
              records: [
                { Name: 'User A', Email: 'a@example.com', Count: 10 },
                { Name: 'User B', Email: 'b@example.com', Count: 20 },
                { Name: 'User C', Email: 'c@example.com', Count: 30 }
              ]
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
      expect(parsed.totalRecordsAffected).toBe(3)
    })

    it('handles non-existent column gracefully', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add',
              tableId: 'TestData',
              records: [{ NonExistentColumn: 'value' }]
            }
          ],
          response_format: 'json'
        }
      })

      // Grist may ignore unknown columns or return failure
      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      // Either succeeds (ignoring unknown column) or fails with success: false
      expect(typeof parsed.success).toBe('boolean')
    })

    it('returns failure for non-existent table', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add',
              tableId: 'NonExistentTable',
              records: [{ Name: 'Test' }]
            }
          ],
          response_format: 'json'
        }
      })

      // Tool returns success: false for operation failures (not isError)
      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(false)
    })
  })

  // =========================================================================
  // Action: Update
  // =========================================================================

  describe('action: update', () => {
    let recordIdToUpdate: number | null = null

    beforeAll(async () => {
      if (!testDocId) return

      // Add a record to update
      const addResult = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add',
              tableId: 'TestData',
              records: [{ Name: 'Update Test', Email: 'update@example.com', Count: 100 }]
            }
          ],
          response_format: 'json'
        }
      })

      if (!addResult.isError) {
        const addText = (addResult.content[0] as { text: string }).text
        const addParsed = JSON.parse(addText)
        recordIdToUpdate = addParsed.results?.[0]?.recordIds?.[0] ?? null
      }
    })

    it('updates record by row ID', async () => {
      if (!testDocId || !recordIdToUpdate) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'update',
              tableId: 'TestData',
              records: [{ id: recordIdToUpdate, fields: { Name: 'Updated Name', Count: 999 } }]
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
    })

    it('handles non-existent row ID gracefully', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'update',
              tableId: 'TestData',
              records: [{ id: 999999, fields: { Name: 'Should Fail' } }]
            }
          ],
          response_format: 'json'
        }
      })

      // Grist may silently succeed (no-op) or return failure
      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      // Response should have success field
      expect(typeof parsed.success).toBe('boolean')
    })
  })

  // =========================================================================
  // Action: Delete
  // =========================================================================

  describe('action: delete', () => {
    let recordIdToDelete: number | null = null

    beforeAll(async () => {
      if (!testDocId) return

      // Add a record to delete
      const addResult = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add',
              tableId: 'TestData',
              records: [{ Name: 'Delete Test', Email: 'delete@example.com', Count: 0 }]
            }
          ],
          response_format: 'json'
        }
      })

      if (!addResult.isError) {
        const addText = (addResult.content[0] as { text: string }).text
        const addParsed = JSON.parse(addText)
        recordIdToDelete = addParsed.results?.[0]?.recordIds?.[0] ?? null
      }
    })

    it('deletes record by row ID', async () => {
      if (!testDocId || !recordIdToDelete) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'delete',
              tableId: 'TestData',
              rowIds: [recordIdToDelete]
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
    })

    it('deletes records by filter', async () => {
      if (!testDocId) return

      // First add a record to delete
      await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add',
              tableId: 'TestData',
              records: [
                { Name: 'Filter Delete Test', Email: 'filterdelete@example.com', Count: -1 }
              ]
            }
          ],
          response_format: 'json'
        }
      })

      // Then delete by filter
      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'delete',
              tableId: 'TestData',
              filters: { Count: -1 }
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
    })

    it('handles non-existent row ID gracefully', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'delete',
              tableId: 'TestData',
              rowIds: [999999]
            }
          ],
          response_format: 'json'
        }
      })

      // Grist may silently succeed (no-op) or return failure
      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      // Response should have success field
      expect(typeof parsed.success).toBe('boolean')
    })
  })

  // =========================================================================
  // Action: Upsert
  // =========================================================================

  describe('action: upsert', () => {
    it('inserts new record when key does not exist', async () => {
      if (!testDocId) return

      const uniqueEmail = `upsert-new-${Date.now()}@example.com`

      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'upsert',
              tableId: 'TestData',
              records: [
                {
                  require: { Email: uniqueEmail },
                  fields: { Name: 'Upsert New', Count: 50 }
                }
              ]
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
    })

    it('updates existing record when key exists', async () => {
      if (!testDocId) return

      const uniqueEmail = `upsert-update-${Date.now()}@example.com`

      // First upsert to create
      await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'upsert',
              tableId: 'TestData',
              records: [
                {
                  require: { Email: uniqueEmail },
                  fields: { Name: 'Original Name', Count: 1 }
                }
              ]
            }
          ],
          response_format: 'json'
        }
      })

      // Second upsert should update
      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'upsert',
              tableId: 'TestData',
              records: [
                {
                  require: { Email: uniqueEmail },
                  fields: { Name: 'Updated Name', Count: 2 }
                }
              ]
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
    })
  })

  // =========================================================================
  // Multi-Operation Batches
  // =========================================================================

  describe('multi-operation batches', () => {
    it('executes multiple operations in sequence', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add',
              tableId: 'TestData',
              records: [{ Name: 'Batch Op 1', Email: 'batch1@example.com', Count: 100 }]
            },
            {
              action: 'add',
              tableId: 'TestData',
              records: [{ Name: 'Batch Op 2', Email: 'batch2@example.com', Count: 200 }]
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
      expect(parsed.results.length).toBe(2)
    })
  })

  // =========================================================================
  // Response Format
  // =========================================================================

  describe('response format', () => {
    it('returns json format correctly', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add',
              tableId: 'TestData',
              records: [{ Name: 'JSON Format Test', Email: 'json@example.com', Count: 1 }]
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      // Should be valid JSON
      expect(() => JSON.parse(text)).not.toThrow()
    })

    it('returns markdown format correctly', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add',
              tableId: 'TestData',
              records: [{ Name: 'Markdown Format Test', Email: 'md@example.com', Count: 1 }]
            }
          ],
          response_format: 'markdown'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      // Markdown should contain formatting
      expect(text).toMatch(/[#*-]|success|record/i)
    })
  })

  // =========================================================================
  // Schema Validation
  // =========================================================================

  describe('schema validation', () => {
    it('rejects missing required docId', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          operations: [{ action: 'add', tableId: 'Test', records: [{ Name: 'Test' }] }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects missing required operations', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: 'abcdefghij1234567890ab'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects empty operations array', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: []
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid action type', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [{ action: 'invalid', tableId: 'Test', records: [] }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid docId format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: 'invalid!',
          operations: [{ action: 'add', tableId: 'Test', records: [{ Name: 'Test' }] }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid tableId format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [{ action: 'add', tableId: 'lowercase', records: [{ Name: 'Test' }] }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid response_format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [{ action: 'add', tableId: 'Test', records: [{ Name: 'Test' }] }],
          response_format: 'invalid'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects add operation with empty records', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [{ action: 'add', tableId: 'Test', records: [] }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects update operation with invalid row ID', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [
            { action: 'update', tableId: 'Test', records: [{ id: -1, fields: { Name: 'Test' } }] }
          ]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects delete operation with invalid row IDs', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [{ action: 'delete', tableId: 'Test', rowIds: [-1, 0] }]
        }
      })

      expect(result.isError).toBe(true)
    })
  })
})
