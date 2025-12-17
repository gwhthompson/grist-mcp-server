/**
 * Configure Widget Integration Tests
 *
 * Tests all grist_configure_widget operations against a live Grist instance:
 * - add: Add new widget to existing page
 * - modify: Change widget properties (title, type, table)
 * - sort: Set widget sorting
 * - filter: Add widget filter
 * - link: Link widgets for master-detail relationships
 * - delete: Remove widget from page
 *
 * Requires Docker environment running.
 *
 * These tests verify:
 * 1. Operations execute without Python sandbox errors
 * 2. Proper response structure is returned
 * 3. Complete payloads are sent to Grist (no missing required fields)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildPage, configureWidget } from '../../../src/tools/pages/index.js'
import type { DocId, TableId } from '../../../src/types/advanced.js'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  cleanupTestContext,
  createFullTestContext,
  createTestClient,
  createTestTable
} from '../../helpers/grist-api.js'

describe('Configure Widget - Integration Tests', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>
  let docId: DocId
  let _customersTableId: TableId
  let _ordersTableId: TableId
  let _productsTableId: TableId

  beforeAll(async () => {
    await ensureGristReady()

    // Create test document with multiple tables
    context = await createFullTestContext(client, {
      docName: 'Widget Config Test Doc',
      tableName: 'Customers'
    })

    docId = context.docId
    _customersTableId = context.tableId

    // Create Orders table with reference to Customers
    _ordersTableId = await createTestTable(client, docId, 'Orders', [
      {
        id: 'OrderID',
        fields: {
          type: 'Text',
          label: 'Order ID'
        }
      },
      {
        id: 'CustomerRef',
        fields: {
          type: 'Ref:Customers',
          label: 'Customer'
        }
      },
      {
        id: 'Amount',
        fields: {
          type: 'Numeric',
          label: 'Amount'
        }
      },
      {
        id: 'OrderDate',
        fields: {
          type: 'Date',
          label: 'Order Date'
        }
      },
      {
        id: 'Status',
        fields: {
          type: 'Choice',
          label: 'Status'
        }
      }
    ])

    // Create Products table
    _productsTableId = await createTestTable(client, docId, 'Products', [
      {
        id: 'ProductName',
        fields: {
          type: 'Text',
          label: 'Product Name'
        }
      },
      {
        id: 'Price',
        fields: {
          type: 'Numeric',
          label: 'Price'
        }
      },
      {
        id: 'Category',
        fields: {
          type: 'Choice',
          label: 'Category'
        }
      }
    ])

    // Create a test page with master-detail pattern that we'll modify
    await buildPage(context.toolContext, {
      docId,
      page_name: 'Customer Orders Dashboard',
      config: {
        pattern: 'master_detail',
        master: {
          table: 'Customers',
          widget_type: 'card_list',
          width: 40,
          title: 'Master: Customers'
        },
        detail: {
          table: 'Orders',
          widget_type: 'grid',
          link_field: 'CustomerRef',
          title: 'Detail: Orders'
        },
        split: 'horizontal'
      },
      response_format: 'json'
    })
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  describe('add operation', () => {
    it('should add a new widget to existing page', async () => {
      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'add',
            page_name: 'Customer Orders Dashboard',
            table: 'Products',
            widget_type: 'card',
            title: 'Product Quick View',
            position: 'right'
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
      expect(responseText).toContain('Product Quick View')
    })

    it('should add widget to bottom position', async () => {
      // Create a simple page first
      await buildPage(context.toolContext, {
        docId,
        page_name: 'Simple Products Page',
        config: {
          pattern: 'custom',
          widgets: [
            {
              table: 'Products',
              widget_type: 'grid',
              title: 'All Products'
            }
          ]
        },
        response_format: 'json'
      })

      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'add',
            page_name: 'Simple Products Page',
            table: 'Products',
            widget_type: 'chart',
            title: 'Product Chart',
            position: 'bottom'
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
    })
  })

  describe('modify operation', () => {
    it('should modify widget title on dedicated page', async () => {
      // Create a dedicated page for this test
      await buildPage(context.toolContext, {
        docId,
        page_name: 'Modify Title Test Page',
        config: {
          pattern: 'custom',
          widgets: [
            {
              table: 'Orders',
              widget_type: 'grid',
              title: 'Orders Grid'
            }
          ]
        },
        response_format: 'json'
      })

      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'modify',
            page_name: 'Modify Title Test Page',
            widget: 'Orders Grid',
            title: 'Modified Orders'
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
      expect(responseText).toContain('Modified widget')
    })

    it('should modify widget type on dedicated page', async () => {
      // Create a dedicated page for this test
      await buildPage(context.toolContext, {
        docId,
        page_name: 'Modify Type Test Page',
        config: {
          pattern: 'custom',
          widgets: [
            {
              table: 'Customers',
              widget_type: 'card_list',
              title: 'Customer List'
            }
          ]
        },
        response_format: 'json'
      })

      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'modify',
            page_name: 'Modify Type Test Page',
            widget: 'Customer List',
            widget_type: 'grid'
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
    })

    it('should modify widget table', async () => {
      // First add a widget we can safely modify
      await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'add',
            page_name: 'Simple Products Page',
            table: 'Products',
            widget_type: 'grid',
            title: 'Modifiable Widget'
          }
        ],
        response_format: 'json'
      })

      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'modify',
            page_name: 'Simple Products Page',
            widget: 'Modifiable Widget',
            table: 'Customers'
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
    })
  })

  describe('sort operation', () => {
    it('should set widget sorting with single column ascending', async () => {
      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'sort',
            page_name: 'Customer Orders Dashboard',
            widget: 'Detail: Orders',
            sort_spec: [4] // Sort by OrderDate column (4th column)
          }
        ],
        response_format: 'json'
      })

      // Verify operation succeeded (looking at response content, not structure)
      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
      expect(responseText).toContain('Set sorting')
    })

    it('should set widget sorting with multiple columns', async () => {
      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'sort',
            page_name: 'Customer Orders Dashboard',
            widget: 'Detail: Orders',
            sort_spec: [5, -3] // Sort by Status asc, then Amount desc
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
    })

    it('should set widget sorting with flags', async () => {
      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'sort',
            page_name: 'Customer Orders Dashboard',
            widget: 'Detail: Orders',
            sort_spec: ['3:emptyLast', '-5:naturalSort']
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
    })
  })

  describe('filter operation', () => {
    it('should add included value filter', async () => {
      // Create dedicated page for filter test
      await buildPage(context.toolContext, {
        docId,
        page_name: 'Filter Included Test Page',
        config: {
          pattern: 'custom',
          widgets: [
            {
              table: 'Orders',
              widget_type: 'grid',
              title: 'Orders for Filtering'
            }
          ]
        },
        response_format: 'json'
      })

      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'filter',
            page_name: 'Filter Included Test Page',
            widget: 'Orders for Filtering',
            column: 'Status',
            filter_spec: {
              included: ['Pending', 'Shipped']
            },
            pinned: false
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
      expect(responseText).toContain('Added filter')
    })

    it('should add excluded value filter', async () => {
      // Create dedicated page for filter test
      await buildPage(context.toolContext, {
        docId,
        page_name: 'Filter Excluded Test Page',
        config: {
          pattern: 'custom',
          widgets: [
            {
              table: 'Products',
              widget_type: 'grid',
              title: 'Products for Filtering'
            }
          ]
        },
        response_format: 'json'
      })

      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'filter',
            page_name: 'Filter Excluded Test Page',
            widget: 'Products for Filtering',
            column: 'Category',
            filter_spec: {
              excluded: ['Discontinued']
            },
            pinned: true
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
      expect(responseText).toContain('Added filter')
    })
  })

  describe('link operation', () => {
    it('should link two widgets using numeric column IDs', async () => {
      // Use master-detail pattern which automatically creates linked widgets
      // Then verify link operation works
      await buildPage(context.toolContext, {
        docId,
        page_name: 'Link Test MD Page',
        config: {
          pattern: 'master_detail',
          master: {
            table: 'Customers',
            widget_type: 'grid',
            title: 'Link Test Master'
          },
          detail: {
            table: 'Orders',
            widget_type: 'grid',
            link_field: 'CustomerRef',
            title: 'Link Test Detail'
          },
          split: 'horizontal'
        },
        response_format: 'json'
      })

      // The widgets are already linked by master-detail pattern
      // This test verifies the link operation can re-link widgets
      // Custom titles from config above take precedence over defaults
      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'link',
            page_name: 'Link Test MD Page',
            target_widget: 'Link Test Detail', // Custom title from config above
            link_config: {
              source_widget: 'Link Test Master', // Custom title from config above
              source_col: 0,
              target_col: 0
            }
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
    })
  })

  describe('delete operation', () => {
    it('should delete widget from page', async () => {
      // First add a widget we can safely delete
      await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'add',
            page_name: 'Simple Products Page',
            table: 'Products',
            widget_type: 'card',
            title: 'Deletable Widget'
          }
        ],
        response_format: 'json'
      })

      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'delete',
            page_name: 'Simple Products Page',
            widget: 'Deletable Widget'
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
      expect(responseText).toContain('Deleted widget')
    })

    it('should rebuild layout after deletion', async () => {
      // Create page with multiple widgets
      await buildPage(context.toolContext, {
        docId,
        page_name: 'Delete Layout Test Page',
        config: {
          pattern: 'custom',
          widgets: [
            {
              table: 'Products',
              widget_type: 'grid',
              title: 'Widget A'
            },
            {
              table: 'Products',
              widget_type: 'card',
              title: 'Widget B'
            }
          ]
        },
        response_format: 'json'
      })

      // Delete one widget
      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'delete',
            page_name: 'Delete Layout Test Page',
            widget: 'Widget B'
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
    })
  })

  describe('multiple operations in sequence', () => {
    it('should execute multiple operations atomically', async () => {
      // Create a fresh page for multi-operation test
      await buildPage(context.toolContext, {
        docId,
        page_name: 'Multi-Op Test Page',
        config: {
          pattern: 'custom',
          widgets: [
            {
              table: 'Products',
              widget_type: 'grid',
              title: 'Products Grid'
            }
          ]
        },
        response_format: 'json'
      })

      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'modify',
            page_name: 'Multi-Op Test Page',
            widget: 'Products Grid',
            title: 'All Products'
          },
          {
            action: 'sort',
            page_name: 'Multi-Op Test Page',
            widget: 'Products Grid', // Use original name - rename happens later
            sort_spec: [2] // Sort by Price
          },
          {
            action: 'filter',
            page_name: 'Multi-Op Test Page',
            widget: 'Products Grid', // Use original name
            column: 'Category',
            filter_spec: {
              included: ['Electronics', 'Books']
            },
            pinned: false
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
      // Check that all 3 operations are mentioned
      expect(responseText).toContain('Modified widget')
      expect(responseText).toContain('Set sorting')
      expect(responseText).toContain('Added filter')
    })
  })

  describe('error handling', () => {
    it('should return error response with invalid page name', async () => {
      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'sort',
            page_name: 'Nonexistent Page',
            widget: 'Some Widget',
            sort_spec: [1]
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      expect(result).toHaveErrorResponse(/not found/i)
    })

    it('should return error response with invalid widget name', async () => {
      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'sort',
            page_name: 'Customer Orders Dashboard',
            widget: 'Nonexistent Widget',
            sort_spec: [1]
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      expect(result).toHaveErrorResponse(/not found/i)
    })

    it('should return error response with invalid column name', async () => {
      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'filter',
            page_name: 'Customer Orders Dashboard',
            widget: 'Detail: Orders',
            column: 'NonexistentColumn',
            filter_spec: {
              included: ['value']
            },
            pinned: false
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      expect(result).toHaveErrorResponse(/.+/)
    })
  })

  describe('Response Format Regression Tests', () => {
    it('should not double-wrap response (fix for Claude Desktop crash bug)', async () => {
      // This test ensures the double-wrapping bug is fixed
      // Bug: ConfigureWidgetTool was manually constructing MCPToolResponse
      // in executeInternal(), then base class wrapped it again, causing:
      // { content: [{text: "{\"content\": [...], \"structuredContent\": {...}}"}], ... }

      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'add',
            page_name: 'Customer Orders Dashboard',
            table: 'Products' as TableId,
            widget_type: 'grid',
            title: 'Products List',
            position: 'bottom'
          }
        ],
        response_format: 'json'
      })

      // Verify result has correct MCPToolResponse structure
      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      expect(Array.isArray(result.content)).toBe(true)
      expect(result.content.length).toBeGreaterThan(0)
      expect(result.structuredContent).toBeDefined()

      // Verify content[0].text is plain JSON string, NOT nested MCP response
      const contentText = result.content[0].text
      expect(typeof contentText).toBe('string')

      // Parse the JSON
      const parsed = JSON.parse(contentText)

      // ❌ WRONG (double-wrapped): Would have 'content' and 'structuredContent' keys
      expect(parsed).not.toHaveProperty('content')
      expect(parsed).not.toHaveProperty('structuredContent')

      // ✅ CORRECT: Should have business data keys only
      expect(parsed).toHaveProperty('success')
      expect(parsed).toHaveProperty('operationsCompleted')
      expect(parsed).toHaveProperty('summary')

      // Verify structuredContent matches parsed content
      expect(result.structuredContent).toEqual(parsed)
    })

    it('should not double-wrap markdown responses either', async () => {
      // Use a different operation to avoid widget naming conflicts
      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'sort',
            page_name: 'Customer Orders Dashboard',
            widget: 'Master: Customers',
            sort_spec: [2, -3] // Sort by column 2 asc, then column 3 desc
          }
        ],
        response_format: 'markdown'
      })

      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      expect(result.structuredContent).toBeDefined()

      const contentText = result.content[0].text

      // Verify content is markdown text, NOT JSON-encoded MCP response
      expect(typeof contentText).toBe('string')
      expect(contentText).toContain('**success**') // Has markdown formatting
      expect(contentText).not.toContain('"content":[') // NOT double-wrapped
      expect(contentText).not.toContain('"structuredContent"') // NOT double-wrapped

      // The key test: if it were double-wrapped, contentText would be JSON
      // containing nested MCP response. Parsing would succeed and have 'content' key.
      expect(() => {
        const parsed = JSON.parse(contentText)
        // If we get here, it's JSON (bad)
        expect(parsed).not.toHaveProperty('content')
      }).toThrow() // Should throw because it's markdown, not JSON

      // structuredContent should be object with business data
      expect(result.structuredContent).toHaveProperty('success')
      expect(result.structuredContent).toHaveProperty('operationsCompleted')
    })
  })

  describe('visible_fields operation', () => {
    it('should set visible fields to a subset of columns', async () => {
      // Create page with Orders widget (has multiple columns)
      await buildPage(context.toolContext, {
        docId,
        page_name: 'Visible Fields Test Page',
        config: {
          pattern: 'custom',
          widgets: [
            {
              table: 'Orders',
              widget_type: 'grid',
              title: 'Orders Widget'
            }
          ]
        },
        response_format: 'json'
      })

      // Set visible_fields to only show OrderID and Amount
      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'modify',
            page_name: 'Visible Fields Test Page',
            widget: 'Orders Widget',
            visible_fields: ['OrderID', 'Amount']
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      const responseText = result.content[0].text
      expect(responseText).toContain('success')
      expect(responseText).toContain('true')
      expect(responseText).toContain('Modified widget')

      // Verify only specified fields are visible by querying _grist_Views_section_field
      const fieldsResp = await client.post<{
        records: Array<{ fields: Record<string, unknown> }>
      }>(`/docs/${docId}/sql`, {
        sql: `SELECT c.colId
                FROM _grist_Views_section_field f
                JOIN _grist_Tables_column c ON f.colRef = c.id
                JOIN _grist_Views_section vs ON f.parentId = vs.id
                WHERE vs.title = ?
                ORDER BY f.parentPos`,
        args: ['Orders Widget']
      })

      const visibleColumns = fieldsResp.records.map((r) => {
        const fields = r.fields || (r as unknown as Record<string, unknown>)
        return fields.colId
      })

      // Should have exactly the 2 specified columns in order
      expect(visibleColumns).toEqual(['OrderID', 'Amount'])
    })

    it('should reorder fields according to visible_fields order', async () => {
      // Create page with Orders widget
      await buildPage(context.toolContext, {
        docId,
        page_name: 'Field Reorder Test Page',
        config: {
          pattern: 'custom',
          widgets: [
            {
              table: 'Orders',
              widget_type: 'grid',
              title: 'Reorder Widget'
            }
          ]
        },
        response_format: 'json'
      })

      // Set fields in reverse order: Amount, OrderID
      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'modify',
            page_name: 'Field Reorder Test Page',
            widget: 'Reorder Widget',
            visible_fields: ['Amount', 'OrderID']
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      expect(result.content[0].text).toContain('success')

      // Verify field order
      const fieldsResp = await client.post<{
        records: Array<{ fields: Record<string, unknown> }>
      }>(`/docs/${docId}/sql`, {
        sql: `SELECT c.colId
                FROM _grist_Views_section_field f
                JOIN _grist_Tables_column c ON f.colRef = c.id
                JOIN _grist_Views_section vs ON f.parentId = vs.id
                WHERE vs.title = ?
                ORDER BY f.parentPos`,
        args: ['Reorder Widget']
      })

      const visibleColumns = fieldsResp.records.map((r) => {
        const fields = r.fields || (r as unknown as Record<string, unknown>)
        return fields.colId
      })

      // Should have fields in the specified order
      expect(visibleColumns).toEqual(['Amount', 'OrderID'])
    })

    it('should return error for non-existent column name', async () => {
      // Create page with Orders widget
      await buildPage(context.toolContext, {
        docId,
        page_name: 'Invalid Column Test Page',
        config: {
          pattern: 'custom',
          widgets: [
            {
              table: 'Orders',
              widget_type: 'grid',
              title: 'Invalid Column Widget'
            }
          ]
        },
        response_format: 'json'
      })

      // Try to set visible_fields with non-existent column
      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'modify',
            page_name: 'Invalid Column Test Page',
            widget: 'Invalid Column Widget',
            visible_fields: ['OrderID', 'NonExistentColumn']
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      expect(result).toHaveErrorResponse(/NonExistentColumn.*not found/i)
    })

    it('should combine visible_fields with other modify options', async () => {
      // Create page with Products widget
      await buildPage(context.toolContext, {
        docId,
        page_name: 'Combined Modify Test Page',
        config: {
          pattern: 'custom',
          widgets: [
            {
              table: 'Products',
              widget_type: 'grid',
              title: 'Products Combined Widget'
            }
          ]
        },
        response_format: 'json'
      })

      // Modify title AND set visible_fields in same operation
      const result = await configureWidget(context.toolContext, {
        docId,
        operations: [
          {
            action: 'modify',
            page_name: 'Combined Modify Test Page',
            widget: 'Products Combined Widget',
            title: 'Renamed Products Widget',
            visible_fields: ['ProductName', 'Price']
          }
        ],
        response_format: 'json'
      })

      expect(result).toBeDefined()
      expect(result.content[0].text).toContain('success')
      expect(result.content[0].text).toContain('Modified widget')

      // Verify title was changed
      const widgetResp = await client.post<{
        records: Array<{ fields: Record<string, unknown> }>
      }>(`/docs/${docId}/sql`, {
        sql: `SELECT title FROM _grist_Views_section WHERE title = ?`,
        args: ['Renamed Products Widget']
      })
      expect(widgetResp.records.length).toBe(1)

      // Verify fields are set
      const fieldsResp = await client.post<{
        records: Array<{ fields: Record<string, unknown> }>
      }>(`/docs/${docId}/sql`, {
        sql: `SELECT c.colId
                FROM _grist_Views_section_field f
                JOIN _grist_Tables_column c ON f.colRef = c.id
                JOIN _grist_Views_section vs ON f.parentId = vs.id
                WHERE vs.title = ?
                ORDER BY f.parentPos`,
        args: ['Renamed Products Widget']
      })

      const visibleColumns = fieldsResp.records.map((r) => {
        const fields = r.fields || (r as unknown as Record<string, unknown>)
        return fields.colId
      })
      expect(visibleColumns).toEqual(['ProductName', 'Price'])
    })
  })
})
