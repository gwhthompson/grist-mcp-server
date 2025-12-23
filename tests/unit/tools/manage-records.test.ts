/**
 * Unit tests for manage-records.ts - schemas, operations, and tool definition
 */

import { describe, expect, it } from 'vitest'
import {
  MANAGE_RECORDS_TOOL,
  ManageRecordsSchema,
  RecordDataSchema
} from '../../../src/tools/manage-records.js'

// Valid Base58 22-char doc ID
const VALID_DOC_ID = 'aaaaaaaaaaaaaaaaaaaaaa'

describe('RecordDataSchema', () => {
  it('accepts empty object', () => {
    const result = RecordDataSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts string values', () => {
    const result = RecordDataSchema.safeParse({ Name: 'Alice', Email: 'alice@example.com' })
    expect(result.success).toBe(true)
  })

  it('accepts numeric values', () => {
    const result = RecordDataSchema.safeParse({ Price: 29.99, Quantity: 100 })
    expect(result.success).toBe(true)
  })

  it('accepts boolean values', () => {
    const result = RecordDataSchema.safeParse({ Active: true, Archived: false })
    expect(result.success).toBe(true)
  })

  it('accepts null values', () => {
    const result = RecordDataSchema.safeParse({ Name: 'Alice', Email: null })
    expect(result.success).toBe(true)
  })

  it('accepts array values (ChoiceList/RefList)', () => {
    const result = RecordDataSchema.safeParse({
      Tags: ['urgent', 'feature'],
      Assignees: [1, 2, 3]
    })
    expect(result.success).toBe(true)
  })

  it('accepts mixed value types', () => {
    const result = RecordDataSchema.safeParse({
      Name: 'Product',
      Price: 49.99,
      InStock: true,
      Tags: ['sale', 'new'],
      Description: null
    })
    expect(result.success).toBe(true)
  })
})

describe('ManageRecordsSchema - Add Operation', () => {
  it('accepts valid add operation', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'add',
          tableId: 'Contacts',
          records: [{ Name: 'Alice', Email: 'alice@example.com' }]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts add with multiple records', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'add',
          tableId: 'Products',
          records: [
            { Name: 'Widget', Price: 29.99 },
            { Name: 'Gadget', Price: 49.99 },
            { Name: 'Gizmo', Price: 19.99 }
          ]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects add with empty records array', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'add',
          tableId: 'Contacts',
          records: []
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects add with invalid tableId (lowercase)', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'add',
          tableId: 'contacts', // Invalid: must start with uppercase
          records: [{ Name: 'Alice' }]
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('accepts add with records containing list formats', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'add',
          tableId: 'Tasks',
          records: [
            {
              Title: 'Fix bug',
              Tags: ['urgent', 'bug'], // ChoiceList format
              Assignees: [1, 2] // RefList format
            }
          ]
        }
      ]
    })
    expect(result.success).toBe(true)
  })
})

describe('ManageRecordsSchema - Update Operation', () => {
  it('accepts valid update operation', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'update',
          tableId: 'Contacts',
          records: [{ id: 1, fields: { Name: 'Alice Updated' } }]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts update with multiple records', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'update',
          tableId: 'Tasks',
          records: [
            { id: 1, fields: { Status: 'Done' } },
            { id: 2, fields: { Status: 'Done' } },
            { id: 3, fields: { Status: 'Done' } }
          ]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects update without id', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'update',
          tableId: 'Contacts',
          records: [{ fields: { Name: 'Alice' } }] // Missing id
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects update with non-positive id', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'update',
          tableId: 'Contacts',
          records: [{ id: 0, fields: { Name: 'Alice' } }]
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects update with negative id', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'update',
          tableId: 'Contacts',
          records: [{ id: -1, fields: { Name: 'Alice' } }]
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects update with empty records array', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'update',
          tableId: 'Contacts',
          records: []
        }
      ]
    })
    expect(result.success).toBe(false)
  })
})

describe('ManageRecordsSchema - Delete Operation', () => {
  it('accepts delete with rowIds', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'delete',
          tableId: 'Contacts',
          rowIds: [1, 2, 3]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts delete with filters', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'delete',
          tableId: 'Logs',
          filters: { Status: 'Archived' }
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts delete with complex filters', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'delete',
          tableId: 'Orders',
          filters: { Status: 'Cancelled', Year: 2023 }
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects delete without rowIds or filters', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'delete',
          tableId: 'Contacts'
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects delete with both rowIds and filters', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'delete',
          tableId: 'Contacts',
          rowIds: [1, 2],
          filters: { Status: 'Archived' }
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects delete with empty rowIds array', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'delete',
          tableId: 'Contacts',
          rowIds: []
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects delete with non-positive rowIds', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'delete',
          tableId: 'Contacts',
          rowIds: [1, 0, 3] // 0 is not positive
        }
      ]
    })
    expect(result.success).toBe(false)
  })
})

describe('ManageRecordsSchema - Upsert Operation', () => {
  it('accepts valid upsert operation', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'upsert',
          tableId: 'Users',
          records: [
            { require: { Email: 'alice@example.com' }, fields: { Name: 'Alice', Active: true } }
          ]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts upsert without fields (match-only)', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'upsert',
          tableId: 'Users',
          records: [{ require: { Email: 'alice@example.com' } }]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts upsert with onMany option', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'upsert',
          tableId: 'Users',
          records: [{ require: { Status: 'Active' }, fields: { LastSeen: '2024-01-01' } }],
          onMany: 'all'
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts all onMany values', () => {
    for (const onMany of ['first', 'none', 'all'] as const) {
      const result = ManageRecordsSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'upsert',
            tableId: 'Users',
            records: [{ require: { Email: 'test@test.com' } }],
            onMany
          }
        ]
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid onMany value', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'upsert',
          tableId: 'Users',
          records: [{ require: { Email: 'test@test.com' } }],
          onMany: 'invalid'
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('accepts upsert with allowEmptyRequire', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'upsert',
          tableId: 'Users',
          records: [{ require: {}, fields: { Status: 'Updated' } }],
          allowEmptyRequire: true
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts upsert with add/update flags', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'upsert',
          tableId: 'Users',
          records: [{ require: { Email: 'test@test.com' }, fields: { Name: 'Test' } }],
          add: false, // Only update, don't insert
          update: true
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts upsert with multiple records', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'upsert',
          tableId: 'Users',
          records: [
            { require: { Email: 'alice@example.com' }, fields: { Name: 'Alice' } },
            { require: { Email: 'bob@example.com' }, fields: { Name: 'Bob' } },
            { require: { Email: 'carol@example.com' }, fields: { Name: 'Carol' } }
          ]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects upsert with empty records array', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'upsert',
          tableId: 'Users',
          records: []
        }
      ]
    })
    expect(result.success).toBe(false)
  })
})

describe('ManageRecordsSchema - Multiple Operations', () => {
  it('accepts multiple operations of same type', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        { action: 'add', tableId: 'Products', records: [{ Name: 'Widget' }] },
        { action: 'add', tableId: 'Products', records: [{ Name: 'Gadget' }] }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts mixed operations', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        { action: 'add', tableId: 'Companies', records: [{ Name: 'Acme Corp' }] },
        { action: 'add', tableId: 'Contacts', records: [{ Name: 'John', Company: 1 }] },
        { action: 'update', tableId: 'Companies', records: [{ id: 1, fields: { Active: true } }] }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts operations on different tables', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        { action: 'add', tableId: 'Table1', records: [{ Name: 'A' }] },
        { action: 'update', tableId: 'Table2', records: [{ id: 1, fields: { Status: 'Done' } }] },
        { action: 'delete', tableId: 'Table3', rowIds: [1] }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty operations array', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: []
    })
    expect(result.success).toBe(false)
  })

  it('rejects more than 10 operations', () => {
    const operations = Array.from({ length: 11 }, (_, i) => ({
      action: 'add' as const,
      tableId: 'Products',
      records: [{ Name: `Product ${i}` }]
    }))

    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations
    })
    expect(result.success).toBe(false)
  })

  it('accepts exactly 10 operations', () => {
    const operations = Array.from({ length: 10 }, (_, i) => ({
      action: 'add' as const,
      tableId: 'Products',
      records: [{ Name: `Product ${i}` }]
    }))

    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations
    })
    expect(result.success).toBe(true)
  })
})

describe('ManageRecordsSchema - DocId Validation', () => {
  it('rejects missing docId', () => {
    const result = ManageRecordsSchema.safeParse({
      operations: [{ action: 'add', tableId: 'Contacts', records: [{ Name: 'Alice' }] }]
    })
    expect(result.success).toBe(false)
  })

  it('rejects short docId', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: 'short',
      operations: [{ action: 'add', tableId: 'Contacts', records: [{ Name: 'Alice' }] }]
    })
    expect(result.success).toBe(false)
  })

  it('rejects docId with invalid characters', () => {
    // Base58 excludes 0, O, I, l
    const result = ManageRecordsSchema.safeParse({
      docId: 'OOOOOOOOOOOOOOOOOOOOOO', // Contains O which is invalid in Base58
      operations: [{ action: 'add', tableId: 'Contacts', records: [{ Name: 'Alice' }] }]
    })
    expect(result.success).toBe(false)
  })
})

describe('ManageRecordsSchema - Response Format', () => {
  it('accepts response_format json', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [{ action: 'add', tableId: 'Contacts', records: [{ Name: 'Alice' }] }],
      response_format: 'json'
    })
    expect(result.success).toBe(true)
  })

  it('accepts response_format markdown', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [{ action: 'add', tableId: 'Contacts', records: [{ Name: 'Alice' }] }],
      response_format: 'markdown'
    })
    expect(result.success).toBe(true)
  })

  it('defaults response_format when not provided', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [{ action: 'add', tableId: 'Contacts', records: [{ Name: 'Alice' }] }]
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.response_format).toBeDefined()
    }
  })

  it('rejects invalid response_format', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [{ action: 'add', tableId: 'Contacts', records: [{ Name: 'Alice' }] }],
      response_format: 'xml'
    })
    expect(result.success).toBe(false)
  })
})

describe('ManageRecordsSchema - Invalid Action', () => {
  it('rejects unknown action type', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'unknown',
          tableId: 'Contacts',
          records: [{ Name: 'Alice' }]
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects operation without action', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          tableId: 'Contacts',
          records: [{ Name: 'Alice' }]
        }
      ]
    })
    expect(result.success).toBe(false)
  })
})

describe('MANAGE_RECORDS_TOOL definition', () => {
  it('has correct name', () => {
    expect(MANAGE_RECORDS_TOOL.name).toBe('grist_manage_records')
  })

  it('has correct category', () => {
    expect(MANAGE_RECORDS_TOOL.category).toBe('records')
  })

  it('has handler function', () => {
    expect(typeof MANAGE_RECORDS_TOOL.handler).toBe('function')
  })

  it('has inputSchema', () => {
    expect(MANAGE_RECORDS_TOOL.inputSchema).toBeDefined()
  })

  it('has outputSchema', () => {
    expect(MANAGE_RECORDS_TOOL.outputSchema).toBeDefined()
  })

  it('has documentation', () => {
    expect(MANAGE_RECORDS_TOOL.docs).toBeDefined()
    expect(MANAGE_RECORDS_TOOL.docs.overview).toBeDefined()
    expect(MANAGE_RECORDS_TOOL.docs.examples).toBeDefined()
    expect(MANAGE_RECORDS_TOOL.docs.errors).toBeDefined()
  })

  it('has examples covering key patterns', () => {
    const examples = MANAGE_RECORDS_TOOL.docs.examples
    expect(examples.length).toBeGreaterThanOrEqual(2)

    // Check that examples cover key patterns (add, cross-table, upsert)
    // Update/delete are simple and discoverable from schema
    const exampleDescriptions = examples.map((e) => e.desc.toLowerCase())
    expect(exampleDescriptions.some((d) => d.includes('add'))).toBe(true)
    expect(exampleDescriptions.some((d) => d.includes('upsert'))).toBe(true)
  })

  it('has annotations', () => {
    expect(MANAGE_RECORDS_TOOL.annotations).toBeDefined()
    expect(MANAGE_RECORDS_TOOL.annotations?.readOnlyHint).toBe(false)
    expect(MANAGE_RECORDS_TOOL.annotations?.destructiveHint).toBe(true)
  })

  it('has error documentation', () => {
    const errors = MANAGE_RECORDS_TOOL.docs.errors
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.error.includes('Column'))).toBe(true)
    expect(errors.some((e) => e.error.includes('Row ID'))).toBe(true)
  })
})

describe('ManageRecordsSchema - Edge Cases', () => {
  it('handles records with special characters in column names', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'add',
          tableId: 'Data',
          records: [{ Column_With_Underscores: 'value' }]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('handles records with numeric column values as strings', () => {
    // Some users might pass numbers as strings
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'add',
          tableId: 'Data',
          records: [{ Price: '29.99' }] // String instead of number
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('handles Date column values as ISO strings', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'add',
          tableId: 'Events',
          records: [{ EventDate: '2024-03-15' }]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('handles DateTime column values as ISO strings', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'add',
          tableId: 'Events',
          records: [{ CreatedAt: '2024-03-15T14:30:00Z' }]
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('handles nested arrays for RefList', () => {
    const result = ManageRecordsSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'add',
          tableId: 'Projects',
          records: [{ Assignees: [1, 2, 3] }]
        }
      ]
    })
    expect(result.success).toBe(true)
  })
})
