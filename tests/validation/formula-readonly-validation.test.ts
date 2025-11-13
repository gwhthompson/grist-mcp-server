import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addRecords, updateRecords } from '../../src/tools/records.js'
import { ensureGristReady } from '../helpers/docker.js'
import {
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../helpers/grist-api.js'

/**
 * Formula Column Write Protection Tests
 *
 * Tests that formula columns (isFormula=true) cannot be written to,
 * while trigger formula columns (isFormula=false + formula exists) CAN be written to.
 *
 * Critical validations:
 * - Formula columns reject write attempts with actionable errors
 * - Trigger formula columns allow writes
 * - Regular data columns allow writes
 */

describe('Formula Column Write Protection', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>
  let recordId: number

  beforeAll(async () => {
    await ensureGristReady()

    // Create test context with formula and trigger formula columns
    context = await createFullTestContext(client, {
      workspaceName: 'Formula Protection Test Workspace',
      docName: 'Formula Protection Test',
      tableName: 'Products',
      columns: [
        {
          id: 'Name',
          fields: {
            label: 'Product Name',
            type: 'Text'
          }
        },
        {
          id: 'Price',
          fields: {
            label: 'Price',
            type: 'Numeric'
          }
        },
        {
          id: 'Quantity',
          fields: {
            label: 'Quantity',
            type: 'Int'
          }
        },
        {
          id: 'Total',
          fields: {
            label: 'Total (Formula)',
            type: 'Numeric',
            isFormula: true,
            formula: '$Price * $Quantity'
          }
        },
        {
          id: 'LastModified',
          fields: {
            label: 'Last Modified (Trigger Formula)',
            type: 'DateTime',
            isFormula: false, // This is a trigger formula - WRITABLE
            formula: 'NOW()',
            recalcWhen: 2 // MANUAL_UPDATES
          }
        }
      ]
    })

    // Add initial test record
    const result = await addRecords(client, {
      docId: context.docId,
      tableId: context.tableId,
      records: [
        {
          Name: 'Widget',
          Price: 10.0,
          Quantity: 5
        }
      ],
      response_format: 'json'
    })
    expect(result.isError).toBeFalsy()
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
    const data = result.structuredContent as any
    recordId = data.record_ids[0]
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  describe('Formula Column (isFormula=true) - Read Only', () => {
    it('should prevent writing to formula column on add', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [
          {
            Name: 'Gadget',
            Price: 20.0,
            Quantity: 3,
            // biome-ignore lint/suspicious/noExplicitAny: Testing formula column write rejection
            Total: 999.99 as any // Attempting to write to formula column
          }
        ],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Cannot write to formula column/i)
    })

    it('should prevent writing to formula column on update', async () => {
      const result = await updateRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        rowIds: [recordId],
        updates: {
          // biome-ignore lint/suspicious/noExplicitAny: Testing formula column write rejection
          Total: 999.99 as any // Attempting to update formula column
        },
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Cannot write to formula column/i)
    })

    it('error message should mention column is read-only', async () => {
      const result = await updateRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        rowIds: [recordId],
        updates: {
          // biome-ignore lint/suspicious/noExplicitAny: Testing formula column write rejection
          Total: 999.99 as any
        },
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      const message = result.content[0].text
      // Should mention the column name
      expect(message).toMatch(/Total/i)
      // Should explain it's read-only
      expect(message).toMatch(/read.only|formula column/i)
      // Should explain isFormula property
      expect(message).toMatch(/isFormula.*true/i)
    })

    it('error message should suggest trigger formulas', async () => {
      const result = await updateRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        rowIds: [recordId],
        updates: {
          // biome-ignore lint/suspicious/noExplicitAny: Testing formula column write rejection
          Total: 999.99 as any
        },
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      const message = result.content[0].text
      // Should suggest alternative
      expect(message).toMatch(/trigger formula|isFormula.*false/i)
    })
  })

  describe('Trigger Formula Column (isFormula=false) - Writable', () => {
    it('should allow writing to trigger formula column on add', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [
          {
            Name: 'Tool',
            Price: 15.0,
            Quantity: 2,
            LastModified: Date.now() // Trigger formula - should work
          }
        ],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should allow writing to trigger formula column on update', async () => {
      const result = await updateRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        rowIds: [recordId],
        updates: {
          LastModified: Date.now() // Trigger formula - should work
        },
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
    })
  })

  describe('Regular Data Column - Writable', () => {
    it('should allow writing to data columns on add', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [
          {
            Name: 'New Product',
            Price: 25.0,
            Quantity: 10
          }
        ],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should allow writing to data columns on update', async () => {
      const result = await updateRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        rowIds: [recordId],
        updates: {
          Name: 'Updated Widget',
          Price: 12.0,
          Quantity: 7
        },
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
    })
  })

  describe('Mixed Column Validation', () => {
    it('should allow writing to data and trigger formula columns only', async () => {
      const result = await updateRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        rowIds: [recordId],
        updates: {
          Name: 'Mixed Update', // Data column - OK
          Price: 30.0, // Data column - OK
          LastModified: Date.now() // Trigger formula - OK
          // Total: 999.99               // Formula column - would fail
        },
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
    })

    it('should reject if any formula column is in updates', async () => {
      const result = await updateRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        rowIds: [recordId],
        updates: {
          Name: 'Mixed Update 2', // Data column - OK
          Price: 35.0, // Data column - OK
          // biome-ignore lint/suspicious/noExplicitAny: Testing formula column write rejection
          Total: 999.99 as any, // Formula column - FAIL
          LastModified: Date.now() // Trigger formula - OK
        },
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Cannot write to formula column/i)
    })

    it('should list all formula columns in error message', async () => {
      // First add another formula column
      await client.post(`/docs/${context.docId}/tables/${context.tableId}/columns`, {
        columns: [
          {
            id: 'DoublePrice',
            fields: {
              label: 'Double Price (Formula)',
              type: 'Numeric',
              isFormula: true,
              formula: '$Price * 2'
            }
          }
        ]
      })

      // Invalidate cache to pick up new column
      const { getSchemaCache } = await import('../../src/services/schema-cache.js')
      const schemaCache = getSchemaCache(client)
      schemaCache.invalidateCache(context.docId, context.tableId)

      const result = await updateRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        rowIds: [recordId],
        updates: {
          // biome-ignore lint/suspicious/noExplicitAny: Testing multiple formula column write rejections
          Total: 999.99 as any,
          // biome-ignore lint/suspicious/noExplicitAny: Testing multiple formula column write rejections
          DoublePrice: 888.88 as any
        },
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      const message = result.content[0].text
      // Should list both formula columns
      expect(message).toMatch(/Total/i)
      expect(message).toMatch(/DoublePrice/i)
    })
  })

  describe('Formula Column Detection', () => {
    it('should detect formula columns by isFormula=true property', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic column metadata structure from Grist API
      const columns = await client.get<{ columns: any[] }>(
        `/docs/${context.docId}/tables/${context.tableId}/columns`
      )

      // biome-ignore lint/suspicious/noExplicitAny: Dynamic column object from API response
      const totalColumn = columns.columns.find((c: any) => c.id === 'Total')
      expect(totalColumn).toBeDefined()
      expect(totalColumn.fields.isFormula).toBe(true)
      expect(totalColumn.fields.formula).toBe('$Price * $Quantity')
    })

    it('should detect trigger formulas by isFormula=false + formula exists', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic column metadata structure from Grist API
      const columns = await client.get<{ columns: any[] }>(
        `/docs/${context.docId}/tables/${context.tableId}/columns`
      )

      // biome-ignore lint/suspicious/noExplicitAny: Dynamic column object from API response
      const lastModifiedColumn = columns.columns.find((c: any) => c.id === 'LastModified')
      expect(lastModifiedColumn).toBeDefined()
      expect(lastModifiedColumn.fields.isFormula).toBe(false)
      expect(lastModifiedColumn.fields.formula).toBeTruthy()
      // Note: recalcWhen may default to 0 depending on Grist version
      // The key distinction is isFormula=false + formula exists
    })

    it('should detect data columns by isFormula=false + no formula', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic column metadata structure from Grist API
      const columns = await client.get<{ columns: any[] }>(
        `/docs/${context.docId}/tables/${context.tableId}/columns`
      )

      // biome-ignore lint/suspicious/noExplicitAny: Dynamic column object from API response
      const nameColumn = columns.columns.find((c: any) => c.id === 'Name')
      expect(nameColumn).toBeDefined()
      expect(nameColumn.fields.isFormula).toBe(false)
      expect(nameColumn.fields.formula || '').toBe('')
    })
  })
})
