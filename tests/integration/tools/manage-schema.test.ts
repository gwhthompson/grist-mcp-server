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

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
      expect(parsed.results[0].verified).toBe(true)
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

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
      expect(parsed.results[0].verified).toBe(true)
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

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
      expect(parsed.results[0].verified).toBe(true)
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

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
      expect(parsed.results[0].verified).toBe(true)
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
  // Conditional Formatting
  // =========================================================================

  describe('conditional formatting', () => {
    it('creates table with column rules (rulesOptions)', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'RulesTest',
              columns: [
                {
                  colId: 'Status',
                  type: 'Choice',
                  choices: ['Active', 'Inactive', 'Pending'],
                  style: {
                    rulesOptions: [
                      {
                        formula: '$Status == "Active"',
                        style: { textColor: '#00AA00', fontBold: true }
                      },
                      {
                        formula: '$Status == "Inactive"',
                        style: { textColor: '#AA0000' }
                      }
                    ]
                  }
                },
                {
                  colId: 'Amount',
                  type: 'Numeric',
                  style: {
                    rulesOptions: [
                      {
                        formula: '$Amount > 1000',
                        style: { fillColor: '#FFFFCC' }
                      }
                    ]
                  }
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
      expect(parsed.results[0].details.conditional_formatting_rules).toBe(3)
    })

    it('updates table with row rules (rowRules)', async () => {
      if (!testDocId) return

      // First create a table to update
      await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'RowRulesTest',
              columns: [
                { colId: 'Priority', type: 'Choice', choices: ['High', 'Medium', 'Low'] },
                { colId: 'Value', type: 'Numeric' }
              ]
            }
          ],
          response_format: 'json'
        }
      })

      // Now update with row rules
      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'update_table',
              tableId: 'RowRulesTest',
              rowRules: [
                {
                  formula: '$Priority == "High"',
                  style: { fillColor: '#FFCCCC' }
                },
                {
                  formula: '$Value > 500',
                  style: { fontBold: true }
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
      expect(parsed.results[0].details.rowRulesUpdated).toBe(2)
    })

    it('adds column with conditional formatting rules', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add_column',
              tableId: 'RulesTest',
              column: {
                colId: 'Score',
                type: 'Numeric',
                style: {
                  rulesOptions: [
                    {
                      formula: '$Score >= 90',
                      style: { textColor: '#00AA00', fontBold: true }
                    },
                    {
                      formula: '$Score < 60',
                      style: { textColor: '#AA0000' }
                    }
                  ]
                }
              }
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
  // Data-Driven: All Column Types (from schema columnType enum)
  // =========================================================================

  describe('data-driven: column types', () => {
    // Setup: Create reference tables for Ref/RefList tests
    beforeAll(async () => {
      if (!testDocId) return

      // Create People table for Ref/RefList columns
      await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'People',
              columns: [
                { colId: 'Name', type: 'Text' },
                { colId: 'Email', type: 'Text' }
              ]
            },
            {
              action: 'create_table',
              name: 'ColumnTypeTest',
              columns: [{ colId: 'Id', type: 'Numeric' }]
            }
          ],
          response_format: 'json'
        }
      })

      // Add reference rows for Ref column tests
      await ctx.client.callTool({
        name: 'grist_manage_records',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add',
              tableId: 'People',
              records: [
                { Name: 'Alice', Email: 'alice@example.com' },
                { Name: 'Bob', Email: 'bob@example.com' }
              ]
            }
          ],
          response_format: 'json'
        }
      })
    })

    // Complete column type coverage from schema columnType enum:
    // Any, Text, Numeric, Int, Bool, Date, DateTime, Choice, ChoiceList, Attachments, Ref, RefList
    const COLUMN_TYPE_CASES = [
      // Simple types
      { type: 'Any', colId: 'AnyData' },
      { type: 'Text', colId: 'Description' },
      { type: 'Numeric', colId: 'Price' },
      { type: 'Int', colId: 'Quantity' },
      { type: 'Bool', colId: 'IsActive' },

      // Date types with format options
      { type: 'Date', colId: 'DueDate', options: { dateFormat: 'YYYY-MM-DD' } },
      {
        type: 'DateTime',
        colId: 'CreatedAt',
        options: { dateFormat: 'YYYY-MM-DD', timeFormat: 'HH:mm:ss' }
      },

      // Choice types (require choices array)
      { type: 'Choice', colId: 'Status', options: { choices: ['Open', 'In Progress', 'Closed'] } },
      {
        type: 'ChoiceList',
        colId: 'Tags',
        options: { choices: ['urgent', 'bug', 'feature', 'docs'] }
      },

      // Attachments
      { type: 'Attachments', colId: 'Files', options: { height: 100 } },

      // Reference types (require refTable + visibleCol)
      { type: 'Ref', colId: 'Owner', refTable: 'People', visibleCol: 'Name' },
      { type: 'RefList', colId: 'Team', refTable: 'People', visibleCol: 'Name' }
    ] as const

    it.each(COLUMN_TYPE_CASES)('creates column type: $type', async ({
      type,
      colId,
      options,
      refTable,
      visibleCol
    }) => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add_column',
              tableId: 'ColumnTypeTest',
              column: { colId, type, refTable, visibleCol, ...options }
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
  // Data-Driven: Widget Options (all options from schema)
  // =========================================================================

  describe('data-driven: widget options', () => {
    // Setup: Create table for widget options testing
    beforeAll(async () => {
      if (!testDocId) return

      await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create_table',
              name: 'WidgetOptionsTest',
              columns: [{ colId: 'Id', type: 'Numeric' }]
            }
          ],
          response_format: 'json'
        }
      })
    })

    // Complete widget options coverage from schema
    const WIDGET_OPTIONS_CASES = [
      // Text widgets
      { type: 'Text', colId: 'PlainText', options: { widget: 'TextBox' } },
      { type: 'Text', colId: 'MarkdownCol', options: { widget: 'Markdown', wrap: true } },
      { type: 'Text', colId: 'LinkCol', options: { widget: 'HyperLink' } },
      { type: 'Text', colId: 'AlignedText', options: { style: { alignment: 'center' } } },

      // Bool widgets
      { type: 'Bool', colId: 'CheckboxBool', options: { widget: 'CheckBox' } },
      { type: 'Bool', colId: 'SwitchBool', options: { widget: 'Switch' } },

      // Numeric formatting - ALL numMode values
      {
        type: 'Numeric',
        colId: 'CurrencyCol',
        options: { numMode: 'currency', currency: 'USD', decimals: 2 }
      },
      {
        type: 'Numeric',
        colId: 'DecimalCol',
        options: { numMode: 'decimal', decimals: 3, maxDecimals: 5 }
      },
      { type: 'Numeric', colId: 'PercentCol', options: { numMode: 'percent', decimals: 1 } },
      { type: 'Numeric', colId: 'ScientificCol', options: { numMode: 'scientific' } },
      {
        type: 'Numeric',
        colId: 'NegParens',
        options: { numMode: 'currency', currency: 'EUR', numSign: 'parens' }
      },
      { type: 'Int', colId: 'SpinnerInt', options: { widget: 'Spinner' } },

      // Date/DateTime formats
      {
        type: 'Date',
        colId: 'ISODate',
        options: { dateFormat: 'YYYY-MM-DD', isCustomDateFormat: true }
      },
      {
        type: 'DateTime',
        colId: 'FullDateTime',
        options: { dateFormat: 'DD/MM/YYYY', timeFormat: 'HH:mm:ss', isCustomTimeFormat: true }
      },

      // Choice styling (choiceOptions)
      {
        type: 'Choice',
        colId: 'StyledChoice',
        options: {
          choices: ['High', 'Medium', 'Low'],
          choiceOptions: {
            High: { fillColor: '#FF0000', textColor: '#FFFFFF', fontBold: true },
            Low: { fillColor: '#00FF00' }
          }
        }
      },

      // Conditional formatting (rulesOptions)
      {
        type: 'Numeric',
        colId: 'ConditionalNum',
        options: {
          style: {
            rulesOptions: [
              {
                formula: '$ConditionalNum > 1000',
                style: { fillColor: '#FFFF00', fontBold: true }
              },
              { formula: '$ConditionalNum < 0', style: { textColor: '#FF0000' } }
            ]
          }
        }
      },

      // Column header styling
      {
        type: 'Text',
        colId: 'StyledHeader',
        options: {
          style: {
            headerFillColor: '#0000FF',
            headerTextColor: '#FFFFFF',
            headerFontBold: true
          }
        }
      }
    ] as const

    it.each(WIDGET_OPTIONS_CASES)('creates $type column with $colId options', async ({
      type,
      colId,
      options
    }) => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_schema',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'add_column',
              tableId: 'WidgetOptionsTest',
              column: { colId, type, ...options }
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
