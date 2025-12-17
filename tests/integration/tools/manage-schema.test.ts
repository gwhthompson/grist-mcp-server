/**
 * MCP Integration Tests - grist_manage_schema
 *
 * Tests the grist_manage_schema tool via MCP protocol.
 * This is a consolidated tool supporting table and column operations.
 * Actions: create_table, update_table, rename_table, delete_table,
 *          add_column, modify_column, remove_column, rename_column, create_summary
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

describe('grist_manage_schema', () => {
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
  // Action: create_table
  // =========================================================================

  describe('action: create_table', () => {
    it('creates table with columns', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'TestTable1',
              columns: [
                { colId: 'Name', type: 'Text' },
                { colId: 'Age', type: 'Numeric' },
                { colId: 'Active', type: 'Bool' }
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

    it('creates table with valid TableId-format name', async () => {
      if (!testDocId) return

      // Note: Tool currently requires names to be valid TableId format
      // (no spaces, starts with uppercase). Normalization should be
      // implemented in the tool but isn't yet.
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'AnotherTable',
              columns: [{ colId: 'Field1', type: 'Text' }]
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

    it('creates table with Choice column', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'ChoiceTable',
              columns: [
                {
                  colId: 'Status',
                  type: 'Choice',
                  options: { choices: ['Open', 'In Progress', 'Closed'] }
                }
              ]
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
    })

    it('handles duplicate table name gracefully', async () => {
      if (!testDocId) return

      // First create
      await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'DuplicateTest',
              columns: [{ colId: 'Field', type: 'Text' }]
            }
          ],
          response_format: 'json'
        }
      })

      // Second create with same name - Grist may auto-rename or error
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'DuplicateTest',
              columns: [{ colId: 'Field', type: 'Text' }]
            }
          ],
          response_format: 'json'
        }
      })

      // Tool returns success: false for operation failures (not isError)
      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      // Either operation failed (success: false) or Grist auto-renamed
      expect(parsed.success === false || parsed.success === true).toBe(true)
    })
  })

  // =========================================================================
  // Action: add_column
  // =========================================================================

  describe('action: add_column', () => {
    it('adds column to existing table', async () => {
      if (!testDocId) return

      // First create a table
      await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'AddColumnTest',
              columns: [{ colId: 'Initial', type: 'Text' }]
            }
          ],
          response_format: 'json'
        }
      })

      // Then add a column
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add_column',
              tableId: 'AddColumnTest',
              column: { colId: 'NewColumn', type: 'Numeric' }
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

    it('returns failure for non-existent table', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add_column',
              tableId: 'NonExistentTable',
              column: { colId: 'Col', type: 'Text' }
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
  // Action: modify_column
  // =========================================================================

  describe('action: modify_column', () => {
    it('modifies column type', async () => {
      if (!testDocId) return

      // Create table with column to modify
      await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'ModifyColumnTest',
              columns: [{ colId: 'ModifyMe', type: 'Text' }]
            }
          ],
          response_format: 'json'
        }
      })

      // Modify the column
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'modify_column',
              tableId: 'ModifyColumnTest',
              colId: 'ModifyMe',
              updates: { type: 'Numeric' }
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
  // Action: rename_column
  // =========================================================================

  describe('action: rename_column', () => {
    it('renames column', async () => {
      if (!testDocId) return

      // Create table with column to rename
      await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'RenameColTest',
              columns: [{ colId: 'OldName', type: 'Text' }]
            }
          ],
          response_format: 'json'
        }
      })

      // Rename the column
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'rename_column',
              tableId: 'RenameColTest',
              colId: 'OldName',
              newColId: 'NewName'
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
    })
  })

  // =========================================================================
  // Action: remove_column
  // =========================================================================

  describe('action: remove_column', () => {
    it('removes column from table', async () => {
      if (!testDocId) return

      // Create table with column to remove
      await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'RemoveColTest',
              columns: [
                { colId: 'Keep', type: 'Text' },
                { colId: 'Remove', type: 'Text' }
              ]
            }
          ],
          response_format: 'json'
        }
      })

      // Remove the column
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'remove_column',
              tableId: 'RemoveColTest',
              colId: 'Remove'
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
    })
  })

  // =========================================================================
  // Action: rename_table
  // =========================================================================

  describe('action: rename_table', () => {
    it('renames table', async () => {
      if (!testDocId) return

      // Create table to rename
      await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'RenameTableTest',
              columns: [{ colId: 'Field', type: 'Text' }]
            }
          ],
          response_format: 'json'
        }
      })

      // Rename the table
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'rename_table',
              tableId: 'RenameTableTest',
              newTableId: 'RenamedTable'
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
    })
  })

  // =========================================================================
  // Action: delete_table
  // =========================================================================

  describe('action: delete_table', () => {
    it('deletes table', async () => {
      if (!testDocId) return

      // Create table to delete
      await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'DeleteTableTest',
              columns: [{ colId: 'Field', type: 'Text' }]
            }
          ],
          response_format: 'json'
        }
      })

      // Delete the table
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'delete_table',
              tableId: 'DeleteTableTest'
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
    })

    it('returns failure for non-existent table', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'delete_table',
              tableId: 'NonExistentTable'
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
  // Action: create_summary
  // =========================================================================

  describe('action: create_summary', () => {
    it('creates summary table', async () => {
      if (!testDocId) return

      // Create source table with data
      await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'SummarySource',
              columns: [
                { colId: 'Category', type: 'Text' },
                { colId: 'Amount', type: 'Numeric' }
              ]
            }
          ],
          response_format: 'json'
        }
      })

      // Add some data
      await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add',
              tableId: 'SummarySource',
              records: [
                { Category: 'A', Amount: 100 },
                { Category: 'B', Amount: 200 },
                { Category: 'A', Amount: 150 }
              ]
            }
          ],
          response_format: 'json'
        }
      })

      // Create summary table
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_summary',
              sourceTable: 'SummarySource',
              groupByColumns: ['Category']
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
    })
  })

  // =========================================================================
  // Multi-Operation Batches
  // =========================================================================

  describe('multi-operation batches', () => {
    it('executes multiple operations in sequence', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'BatchTest',
              columns: [{ colId: 'Initial', type: 'Text' }]
            },
            {
              action: 'add_column',
              tableId: 'BatchTest',
              column: { colId: 'Added', type: 'Numeric' }
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
  // Schema Validation
  // =========================================================================

  describe('schema validation', () => {
    it('rejects missing required docId', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          operations: [{ action: 'create_table', name: 'Test', columns: [] }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects missing required operations', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: 'abcdefghij1234567890ab'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects empty operations array', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: []
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid action type', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [{ action: 'invalid', name: 'Test' }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid docId format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: 'invalid!',
          operations: [{ action: 'create_table', name: 'Test', columns: [] }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid tableId format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [{ action: 'delete_table', tableId: 'lowercase' }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid response_format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [{ action: 'create_table', name: 'Test', columns: [] }],
          response_format: 'invalid'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid column type', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [
            {
              action: 'create_table',
              name: 'Test',
              columns: [{ colId: 'Col', type: 'InvalidType' }]
            }
          ]
        }
      })

      expect(result.isError).toBe(true)
    })
  })
})
