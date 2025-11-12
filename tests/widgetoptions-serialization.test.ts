/**
 * Integration Test: widgetOptions Serialization Bug Fix
 *
 * This test verifies the fix for the critical bug where widgetOptions
 * were being stored as Python-style dict strings (with single quotes)
 * instead of proper JSON strings (with double quotes).
 *
 * Bug: buildAddTableAction() was not serializing widgetOptions to JSON
 * Fix: Added serializeWidgetOptions() helper and applied to all action builders
 *
 * Test Strategy:
 * 1. Create table with columns containing widgetOptions
 * 2. Retrieve column metadata from Grist
 * 3. Verify widgetOptions are stored as valid JSON strings
 * 4. Ensure NO single quotes (Python dict format)
 * 5. Verify the data can be parsed correctly
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ColumnsApiResponse } from '../src/services/column-resolver.js'
import { createTable } from '../src/tools/tables.js'
import type { DocId, WorkspaceId } from '../src/types/advanced.js'
import { ensureGristReady } from './helpers/docker.js'
import {
  createTestClient,
  createTestDocument,
  createTestWorkspace,
  deleteDocument,
  deleteWorkspace,
  getFirstOrg
} from './helpers/grist-api.js'

describe('widgetOptions Serialization Bug Fix', () => {
  const client = createTestClient()
  let orgId: number
  let workspaceId: WorkspaceId
  let docId: DocId

  beforeAll(async () => {
    await ensureGristReady()

    orgId = await getFirstOrg(client)
    workspaceId = (await createTestWorkspace(
      client,
      orgId,
      'WidgetOptions Serialization Test'
    )) as WorkspaceId
    docId = (await createTestDocument(client, workspaceId, 'Serialization Test Doc')) as DocId
  }, 60000)

  afterAll(async () => {
    if (docId) await deleteDocument(client, docId)
    if (workspaceId) await deleteWorkspace(client, workspaceId)
  })

  it('should serialize widgetOptions as JSON strings, not Python dicts', async () => {
    // Create table with multiple columns that have widgetOptions
    await createTable(client, {
      docId,
      tableName: 'Orders',
      columns: [
        {
          colId: 'OrderNumber',
          type: 'Text',
          label: 'Order Number'
        },
        {
          colId: 'Customer',
          type: 'Text',
          label: 'Customer Name'
        },
        {
          colId: 'Status',
          type: 'Choice',
          label: 'Order Status',
          widgetOptions: {
            choices: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']
          }
        },
        {
          colId: 'Priority',
          type: 'Choice',
          label: 'Priority Level',
          widgetOptions: {
            choices: ['Low', 'Medium', 'High', 'Critical']
          }
        },
        {
          colId: 'OrderTotal',
          type: 'Numeric',
          label: 'Order Total',
          widgetOptions: {
            numMode: 'currency',
            currency: 'USD',
            decimals: 2
          }
        }
      ],
      response_format: 'json'
    })

    // Retrieve raw column metadata directly from Grist API
    // (getTables parses widgetOptions, we need raw strings)
    const columnsResponse = await client.get<ColumnsApiResponse>(
      `/docs/${docId}/tables/Orders/columns`
    )

    // Find Status column
    const statusCol = columnsResponse.columns.find((c) => c.id === 'Status')
    expect(statusCol).toBeDefined()
    expect(statusCol.fields.widgetOptions).toBeDefined()

    const widgetOptions = statusCol.fields.widgetOptions

    console.log('=== ACTUAL VALUE STORED IN GRIST ===')
    console.log('Type:', typeof widgetOptions)
    console.log('Value:', widgetOptions)
    console.log('=====================================')

    // CRITICAL ASSERTIONS: No Python-style dict strings
    expect(widgetOptions).not.toContain("'") // No single quotes
    expect(widgetOptions).not.toMatch(/\{'/) // No Python dict opening
    expect(widgetOptions).not.toMatch(/':\s*\[/) // No Python dict syntax

    // Should be valid JSON with double quotes
    expect(widgetOptions).toContain('"choices"')
    expect(widgetOptions).toContain('"Pending"')
    expect(widgetOptions).toContain('"Processing"')

    // Should parse correctly as JSON
    expect(() => JSON.parse(widgetOptions)).not.toThrow()
    const parsedStatus = JSON.parse(widgetOptions)
    expect(parsedStatus).toEqual({
      choices: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']
    })

    // Check Priority column
    const priorityCol = columnsResponse.columns.find((c) => c.id === 'Priority')
    expect(priorityCol).toBeDefined()
    const priorityOptions = priorityCol.fields.widgetOptions
    expect(priorityOptions).not.toContain("'")
    expect(() => JSON.parse(priorityOptions)).not.toThrow()

    const parsedPriority = JSON.parse(priorityOptions)
    expect(parsedPriority).toEqual({
      choices: ['Low', 'Medium', 'High', 'Critical']
    })

    // Check OrderTotal column (numeric with currency)
    const totalCol = columnsResponse.columns.find((c) => c.id === 'OrderTotal')
    expect(totalCol).toBeDefined()
    const totalOptions = totalCol.fields.widgetOptions
    expect(totalOptions).not.toContain("'")
    expect(() => JSON.parse(totalOptions)).not.toThrow()

    const parsedTotal = JSON.parse(totalOptions)
    expect(parsedTotal).toEqual({
      numMode: 'currency',
      currency: 'USD',
      decimals: 2
    })
  }, 30000)

  it('should handle Text widgetOptions serialization', async () => {
    // Test that widgetOptions for Text columns are properly serialized
    // Note: Using only commonly-supported properties (alignment is validated in schema)
    await createTable(client, {
      docId,
      tableName: 'SimpleTextTable',
      columns: [
        {
          colId: 'Name',
          type: 'Text',
          widgetOptions: {
            alignment: 'center'
          }
        }
      ],
      response_format: 'json'
    })

    const columnsResponse = await client.get<ColumnsApiResponse>(
      `/docs/${docId}/tables/SimpleTextTable/columns`
    )
    const nameCol = columnsResponse.columns.find((c) => c.id === 'Name')
    expect(nameCol).toBeDefined()

    const widgetOptions = nameCol.fields.widgetOptions

    // Verify JSON format (not Python dict)
    expect(widgetOptions).not.toContain("'")
    expect(() => JSON.parse(widgetOptions)).not.toThrow()

    const parsed = JSON.parse(widgetOptions)
    expect(parsed.alignment).toBe('center')
  }, 30000)

  it('should handle table creation with mixed column types', async () => {
    await createTable(client, {
      docId,
      tableName: 'MixedTypes',
      columns: [
        {
          colId: 'PlainText',
          type: 'Text'
          // No widgetOptions
        },
        {
          colId: 'Category',
          type: 'Choice',
          widgetOptions: { choices: ['A', 'B', 'C'] }
        },
        {
          colId: 'PlainNumber',
          type: 'Numeric'
          // No widgetOptions
        },
        {
          colId: 'Currency',
          type: 'Numeric',
          widgetOptions: { numMode: 'currency', currency: 'EUR' }
        }
      ],
      response_format: 'json'
    })

    const columnsResponse = await client.get<ColumnsApiResponse>(
      `/docs/${docId}/tables/MixedTypes/columns`
    )

    // Columns with widgetOptions should be properly serialized
    const categoryCol = columnsResponse.columns.find((c) => c.id === 'Category')
    const currencyCol = columnsResponse.columns.find((c) => c.id === 'Currency')

    const categoryOptions = categoryCol.fields.widgetOptions
    const currencyOptions = currencyCol.fields.widgetOptions

    expect(categoryOptions).not.toContain("'")
    expect(currencyOptions).not.toContain("'")

    const parsedCategory = JSON.parse(categoryOptions)
    expect(parsedCategory.choices).toEqual(['A', 'B', 'C'])

    const parsedCurrency = JSON.parse(currencyOptions)
    expect(parsedCurrency.numMode).toBe('currency')
    expect(parsedCurrency.currency).toBe('EUR')
  }, 30000)

  it('should match the exact format from the bug report', async () => {
    // This is the exact example from the bug report
    await createTable(client, {
      docId,
      tableName: 'BugReportExample',
      columns: [
        {
          colId: 'OrderNumber',
          type: 'Text',
          label: 'Order Number'
        },
        {
          colId: 'Customer',
          type: 'Text', // Changed from Ref:Customers for simplicity
          label: 'Customer'
        },
        {
          colId: 'OrderDate',
          type: 'Date',
          label: 'Order Date'
        },
        {
          colId: 'OrderTotal',
          type: 'Numeric',
          label: 'Order Total'
        },
        {
          colId: 'Status',
          type: 'Choice',
          label: 'Order Status',
          widgetOptions: {
            choices: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']
          }
        }
      ],
      response_format: 'json'
    })

    const columnsResponse = await client.get<ColumnsApiResponse>(
      `/docs/${docId}/tables/BugReportExample/columns`
    )
    const statusCol = columnsResponse.columns.find((c) => c.id === 'Status')
    const widgetOptions = statusCol.fields.widgetOptions

    // The bug was: stored as {'choices': ['Pending', ...]}
    // The fix: should be {"choices": ["Pending", ...]}

    // Verify it's NOT the buggy format
    expect(widgetOptions).not.toMatch(/^\{'choices':/) // Not Python dict
    expect(widgetOptions).not.toContain("'Pending'") // Not Python strings

    // Verify it IS the correct format
    expect(widgetOptions).toMatch(/^\{"choices":/) // JSON object
    expect(widgetOptions).toContain('"Pending"') // JSON strings

    // Verify exact choices
    const parsed = JSON.parse(widgetOptions)
    expect(parsed.choices).toEqual(['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'])
  }, 30000)
})
