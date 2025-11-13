/**
 * Formula Column Tests - Real-world validation
 *
 * Tests formula columns with actual calculations against live Grist
 * Validates formula evaluation, dependencies, and recalculation behavior
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CellValue } from '../../src/schemas/api-responses.js'
import type { DocId, TableId } from '../../src/types/advanced.js'
import { ensureGristReady } from '../helpers/docker.js'
import {
  addTestRecords,
  cleanupTestContext,
  createFullTestContext,
  createTestClient,
  createTestTable
} from '../helpers/grist-api.js'

// Type for Grist API responses
interface ColumnMetadata {
  id: string
  fields: {
    widgetOptions?: string
    type?: string
    label?: string
    isFormula?: boolean
    formula?: string
    [key: string]: unknown
  }
}

interface ColumnsResponse {
  columns: ColumnMetadata[]
}

interface RecordData {
  id: number
  fields: Record<string, CellValue>
}

interface RecordsResponse {
  records: RecordData[]
}

describe('Formula Columns - Real-World Tests', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>
  let docId: DocId

  beforeAll(async () => {
    await ensureGristReady()

    context = await createFullTestContext(client, {
      docName: 'Formula Test Doc',
      tableName: 'CalculationTable'
    })

    docId = context.docId
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  /**
   * Helper function to get columns for a table
   * The /docs/{docId}/tables endpoint does NOT include columns
   * We must fetch them separately using /docs/{docId}/tables/{tableId}/columns
   */
  async function _getTableColumns(docId: DocId, tableId: TableId): Promise<ColumnMetadata[]> {
    const response = await client.get<ColumnsResponse>(`/docs/${docId}/tables/${tableId}/columns`)
    return response.columns || []
  }

  describe('Simple arithmetic formulas', () => {
    let tableId: TableId

    beforeAll(async () => {
      // Create table with data columns and formula columns
      tableId = await createTestTable(client, docId, 'Arithmetic', [
        { id: 'A', fields: { type: 'Int', label: 'A' } },
        { id: 'B', fields: { type: 'Int', label: 'B' } },
        {
          id: 'Sum',
          fields: {
            type: 'Numeric',
            label: 'Sum',
            isFormula: true,
            formula: '$A + $B'
          }
        },
        {
          id: 'Product',
          fields: {
            type: 'Numeric',
            label: 'Product',
            isFormula: true,
            formula: '$A * $B'
          }
        },
        {
          id: 'Average',
          fields: {
            type: 'Numeric',
            label: 'Average',
            isFormula: true,
            formula: '($A + $B) / 2'
          }
        }
      ])
    })

    it('should calculate sum formula correctly', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [{ fields: { A: 5, B: 10 } }])

      // Query back and verify formula calculated
      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(record).toBeDefined()
      expect(record?.fields.A).toBe(5)
      expect(record?.fields.B).toBe(10)
      expect(record?.fields.Sum).toBe(15) // Formula: $A + $B
    })

    it('should calculate product formula correctly', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [{ fields: { A: 7, B: 8 } }])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(record?.fields.Product).toBe(56) // Formula: $A * $B
    })

    it('should calculate average formula correctly', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [{ fields: { A: 20, B: 30 } }])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(record?.fields.Average).toBe(25) // Formula: ($A + $B) / 2
    })

    it('should recalculate formula when data changes', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        { fields: { A: 100, B: 50 } }
      ])

      // Verify initial calculation
      let records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)
      let record = records.records.find((r) => r.id === recordIds[0])
      expect(record?.fields.Sum).toBe(150)

      // Update A value
      await client.patch(`/docs/${docId}/tables/${tableId}/records`, {
        records: [
          {
            id: recordIds[0],
            fields: { A: 200 }
          }
        ]
      })

      // Verify recalculation
      records = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${tableId}/records`)
      record = records.records.find((r) => r.id === recordIds[0])
      expect(record?.fields.Sum).toBe(250) // Recalculated: 200 + 50
    })

    it('should handle zero and negative numbers', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        { fields: { A: 0, B: 0 } },
        { fields: { A: -5, B: 10 } },
        { fields: { A: -10, B: -20 } }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record1 = records.records.find((r) => r.id === recordIds[0])
      expect(record1?.fields.Sum).toBe(0)
      expect(record1?.fields.Product).toBe(0)

      const record2 = records.records.find((r) => r.id === recordIds[1])
      expect(record2?.fields.Sum).toBe(5)
      expect(record2?.fields.Product).toBe(-50)

      const record3 = records.records.find((r) => r.id === recordIds[2])
      expect(record3?.fields.Sum).toBe(-30)
      expect(record3?.fields.Product).toBe(200)
    })
  })

  describe('Conditional formulas', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'Conditional', [
        { id: 'Status', fields: { type: 'Text', label: 'Status' } },
        { id: 'Value', fields: { type: 'Numeric', label: 'Value' } },
        {
          id: 'IsActive',
          fields: {
            type: 'Bool',
            label: 'Is Active',
            isFormula: true,
            formula: '$Status == "Active"'
          }
        },
        {
          id: 'DisplayValue',
          fields: {
            type: 'Numeric',
            label: 'Display Value',
            isFormula: true,
            formula: '$Value if $Status == "Active" else 0'
          }
        },
        {
          id: 'Category',
          fields: {
            type: 'Text',
            label: 'Category',
            isFormula: true,
            formula: '"High" if $Value > 100 else ("Medium" if $Value > 50 else "Low")'
          }
        }
      ])
    })

    it('should evaluate boolean conditional correctly', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        { fields: { Status: 'Active', Value: 75 } },
        { fields: { Status: 'Inactive', Value: 50 } }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const activeRecord = records.records.find((r) => r.id === recordIds[0])
      expect(activeRecord?.fields.IsActive).toBe(true)

      const inactiveRecord = records.records.find((r) => r.id === recordIds[1])
      expect(inactiveRecord?.fields.IsActive).toBe(false)
    })

    it('should evaluate if-else conditional correctly', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        { fields: { Status: 'Active', Value: 100 } },
        { fields: { Status: 'Inactive', Value: 100 } }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const activeRecord = records.records.find((r) => r.id === recordIds[0])
      expect(activeRecord?.fields.DisplayValue).toBe(100) // Active, show value

      const inactiveRecord = records.records.find((r) => r.id === recordIds[1])
      expect(inactiveRecord?.fields.DisplayValue).toBe(0) // Inactive, show 0
    })

    it('should evaluate nested conditionals correctly', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        { fields: { Status: 'Active', Value: 150 } },
        { fields: { Status: 'Active', Value: 75 } },
        { fields: { Status: 'Active', Value: 25 } }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const highRecord = records.records.find((r) => r.id === recordIds[0])
      expect(highRecord?.fields.Category).toBe('High')

      const mediumRecord = records.records.find((r) => r.id === recordIds[1])
      expect(mediumRecord?.fields.Category).toBe('Medium')

      const lowRecord = records.records.find((r) => r.id === recordIds[2])
      expect(lowRecord?.fields.Category).toBe('Low')
    })
  })

  describe('Text formulas', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'TextFormulas', [
        { id: 'FirstName', fields: { type: 'Text', label: 'First Name' } },
        { id: 'LastName', fields: { type: 'Text', label: 'Last Name' } },
        {
          id: 'FullName',
          fields: {
            type: 'Text',
            label: 'Full Name',
            isFormula: true,
            formula: '$FirstName + " " + $LastName'
          }
        },
        {
          id: 'Initials',
          fields: {
            type: 'Text',
            label: 'Initials',
            isFormula: true,
            formula: '$FirstName[0] + $LastName[0]'
          }
        },
        {
          id: 'NameLength',
          fields: {
            type: 'Int',
            label: 'Name Length',
            isFormula: true,
            formula: 'len($FullName)'
          }
        }
      ])
    })

    it('should concatenate text fields', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        { fields: { FirstName: 'John', LastName: 'Doe' } }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(record?.fields.FullName).toBe('John Doe')
    })

    it('should extract characters from text', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        { fields: { FirstName: 'Alice', LastName: 'Smith' } }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(record?.fields.Initials).toBe('AS')
    })

    it('should calculate text length', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        { fields: { FirstName: 'Bob', LastName: 'Johnson' } }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(record?.fields.NameLength).toBe(11) // "Bob Johnson" = 11 chars
    })
  })

  describe('Reference formulas', () => {
    let customersTableId: TableId
    let ordersTableId: TableId

    beforeAll(async () => {
      // Create Customers table
      customersTableId = await createTestTable(client, docId, 'Customers', [
        { id: 'Name', fields: { type: 'Text', label: 'Name' } },
        { id: 'Discount', fields: { type: 'Numeric', label: 'Discount %' } }
      ])

      // Create Orders table with reference and formula
      ordersTableId = await createTestTable(client, docId, 'Orders', [
        { id: 'Product', fields: { type: 'Text', label: 'Product' } },
        { id: 'Price', fields: { type: 'Numeric', label: 'Price' } },
        {
          id: 'Customer',
          fields: {
            type: 'Ref:Customers',
            label: 'Customer',
            widgetOptions: JSON.stringify({
              table: 'Customers',
              showColumn: 'Name'
            })
          }
        },
        {
          id: 'CustomerName',
          fields: {
            type: 'Text',
            label: 'Customer Name',
            isFormula: true,
            formula: '$Customer.Name'
          }
        },
        {
          id: 'DiscountedPrice',
          fields: {
            type: 'Numeric',
            label: 'Discounted Price',
            isFormula: true,
            formula: '$Price * (1 - $Customer.Discount / 100)'
          }
        }
      ])
    })

    it('should evaluate reference formulas', async () => {
      // Create customer
      const customerIds = await addTestRecords(client, docId, customersTableId, [
        { fields: { Name: 'Acme Corp', Discount: 10 } }
      ])

      // Create order with reference
      // Note: For Ref columns, use plain row ID, not encoded reference
      const orderIds = await addTestRecords(client, docId, ordersTableId, [
        {
          fields: {
            Product: 'Widget',
            Price: 100,
            Customer: customerIds[0]
          }
        }
      ])

      // Verify formula calculated
      const orders = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${ordersTableId}/records`)

      const order = orders.records.find((r) => r.id === orderIds[0])
      expect(order?.fields.CustomerName).toBe('Acme Corp') // Formula: $Customer.Name
      expect(order?.fields.DiscountedPrice).toBe(90) // Formula: 100 * (1 - 10/100)
    })

    it('should recalculate when referenced data changes', async () => {
      // Create customer
      const customerIds = await addTestRecords(client, docId, customersTableId, [
        { fields: { Name: 'TechCo', Discount: 5 } }
      ])

      // Create order
      const orderIds = await addTestRecords(client, docId, ordersTableId, [
        {
          fields: {
            Product: 'Gadget',
            Price: 200,
            Customer: customerIds[0]
          }
        }
      ])

      // Verify initial calculation
      let orders = await client.get<RecordsResponse>(
        `/docs/${docId}/tables/${ordersTableId}/records`
      )
      let order = orders.records.find((r) => r.id === orderIds[0])
      expect(order?.fields.DiscountedPrice).toBe(190) // 200 * 0.95

      // Update customer discount
      await client.patch(`/docs/${docId}/tables/${customersTableId}/records`, {
        records: [
          {
            id: customerIds[0],
            fields: { Discount: 20 }
          }
        ]
      })

      // Verify formula recalculated
      orders = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${ordersTableId}/records`)
      order = orders.records.find((r) => r.id === orderIds[0])
      expect(order?.fields.DiscountedPrice).toBe(160) // 200 * 0.80
    })

    it('should handle null references in formulas', async () => {
      // Create order without customer
      const orderIds = await addTestRecords(client, docId, ordersTableId, [
        {
          fields: {
            Product: 'Thing',
            Price: 50,
            Customer: null
          }
        }
      ])

      const orders = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${ordersTableId}/records`)

      const order = orders.records.find((r) => r.id === orderIds[0])
      // When reference is null, $Customer.Name should be empty
      expect(order?.fields.CustomerName).toBe('')
      // DiscountedPrice formula will fail or return NaN/null
      // This is expected Grist behavior
    })
  })

  describe('Date and DateTime formulas', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'DateFormulas', [
        { id: 'StartDate', fields: { type: 'Date', label: 'Start Date' } },
        { id: 'EndDate', fields: { type: 'Date', label: 'End Date' } },
        {
          id: 'DaysDiff',
          fields: {
            type: 'Numeric',
            label: 'Days Difference',
            isFormula: true,
            // Note: Use DAYS() function for date difference calculation
            formula: 'DAYS($EndDate, $StartDate)'
          }
        }
      ])
    })

    it('should calculate date difference in days', async () => {
      // Dates as Unix timestamps (seconds)
      const day1 = Math.floor(new Date('2024-01-01').getTime() / 1000)
      const day10 = Math.floor(new Date('2024-01-10').getTime() / 1000)

      const recordIds = await addTestRecords(client, docId, tableId, [
        { fields: { StartDate: day1, EndDate: day10 } }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(record?.fields.DaysDiff).toBe(9) // 9 days difference
    })
  })

  describe('Formula column metadata', () => {
    it('should verify formula column has isFormula flag', async () => {
      // Get columns from the columns endpoint
      const columns = await client.get<{
        columns: Array<{ id: string; fields: Record<string, unknown> }>
      }>(`/docs/${docId}/tables/Arithmetic/columns`)

      const sumCol = columns.columns.find((c) => c.id === 'Sum')
      expect(sumCol).toBeDefined()
      expect(sumCol?.fields.isFormula).toBe(true)
      expect(sumCol?.fields.formula).toBe('$A + $B')
      expect(sumCol?.fields.type).toBe('Numeric')
    })

    it('should verify data columns do not have isFormula flag', async () => {
      // Get columns from the columns endpoint
      const columns = await client.get<{
        columns: Array<{ id: string; fields: Record<string, unknown> }>
      }>(`/docs/${docId}/tables/Arithmetic/columns`)

      const colA = columns.columns.find((c) => c.id === 'A')
      expect(colA).toBeDefined()
      expect(colA?.fields.isFormula).toBe(false)
      expect(colA?.fields.formula).toBe('')
    })
  })

  describe('Formula errors', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'FormulaErrors', [
        { id: 'Value', fields: { type: 'Numeric', label: 'Value' } },
        {
          id: 'DivideByZero',
          fields: {
            type: 'Numeric',
            label: 'Divide By Zero',
            isFormula: true,
            formula: '$Value / 0'
          }
        }
      ])
    })

    it('should handle division by zero', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [{ fields: { Value: 100 } }])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      // Grist may return Infinity, NaN, or an error value
      // We just verify the record exists and has the field
      expect(record).toBeDefined()
      expect(record?.fields && 'DivideByZero' in record.fields).toBe(true)
    })
  })
})
