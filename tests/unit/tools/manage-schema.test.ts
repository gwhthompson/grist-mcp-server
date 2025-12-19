/**
 * Unit tests for manage-schema.ts tools - schemas and exports
 */

import { describe, expect, it } from 'vitest'
import { MANAGE_SCHEMA_TOOL, ManageSchemaSchema } from '../../../src/tools/manage-schema.js'

// Valid Base58 22-char doc ID
const VALID_DOC_ID = 'aaaaaaaaaaaaaaaaaaaaaa'

describe('ManageSchemaSchema', () => {
  describe('basic validation', () => {
    it('requires docId and operations', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [{ action: 'create_table', name: 'NewTable' }]
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing docId', () => {
      const result = ManageSchemaSchema.safeParse({
        operations: [{ action: 'create_table', name: 'NewTable' }]
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty operations array', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: []
      })
      expect(result.success).toBe(false)
    })

    it('rejects invalid docId', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: 'short',
        operations: [{ action: 'create_table', name: 'NewTable' }]
      })
      expect(result.success).toBe(false)
    })
  })

  describe('create_table operation', () => {
    it('accepts basic create_table', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'create_table',
            name: 'NewTable'
          }
        ]
      })
      expect(result.success).toBe(true)
    })

    it('accepts create_table with columns', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'create_table',
            name: 'NewTable',
            columns: [
              { colId: 'Name', type: 'Text' },
              { colId: 'Age', type: 'Int' }
            ]
          }
        ]
      })
      expect(result.success).toBe(true)
    })

    it('rejects create_table with empty name', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'create_table',
            name: ''
          }
        ]
      })
      expect(result.success).toBe(false)
    })
  })

  describe('rename_table operation', () => {
    it('accepts valid rename_table', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'rename_table',
            tableId: 'OldTable',
            newTableId: 'NewTable'
          }
        ]
      })
      expect(result.success).toBe(true)
    })

    it('rejects rename_table without newTableId', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'rename_table',
            tableId: 'OldTable'
          }
        ]
      })
      expect(result.success).toBe(false)
    })
  })

  describe('delete_table operation', () => {
    it('accepts valid delete_table', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'delete_table',
            tableId: 'OldTable'
          }
        ]
      })
      expect(result.success).toBe(true)
    })
  })

  describe('update_table operation', () => {
    it('accepts update_table with rowRules', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'update_table',
            tableId: 'MyTable',
            rowRules: [{ formula: '$Status == "Overdue"', style: { fillColor: '#FFCCCC' } }]
          }
        ]
      })
      expect(result.success).toBe(true)
    })
  })

  describe('add_column operation', () => {
    it('accepts basic add_column', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'add_column',
            tableId: 'MyTable',
            column: { colId: 'NewColumn', type: 'Text' }
          }
        ]
      })
      expect(result.success).toBe(true)
    })

    it('accepts add_column with formula', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'add_column',
            tableId: 'MyTable',
            column: {
              colId: 'Computed',
              type: 'Numeric',
              formula: '$Price * $Quantity'
            }
          }
        ]
      })
      expect(result.success).toBe(true)
    })

    it('accepts add_column with Ref type', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'add_column',
            tableId: 'Orders',
            column: {
              colId: 'Customer',
              type: 'Ref',
              refTable: 'Customers'
            }
          }
        ]
      })
      expect(result.success).toBe(true)
    })

    it('rejects add_column without column', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'add_column',
            tableId: 'MyTable'
          }
        ]
      })
      expect(result.success).toBe(false)
    })
  })

  describe('modify_column operation', () => {
    it('accepts modify_column', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'modify_column',
            tableId: 'MyTable',
            colId: 'ExistingColumn',
            updates: { type: 'Numeric' }
          }
        ]
      })
      expect(result.success).toBe(true)
    })

    it('accepts modify_column with widget options', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'modify_column',
            tableId: 'MyTable',
            colId: 'ExistingColumn',
            updates: { widget: 'Spinner', decimals: 2 }
          }
        ]
      })
      expect(result.success).toBe(true)
    })
  })

  describe('remove_column operation', () => {
    it('accepts valid remove_column', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'remove_column',
            tableId: 'MyTable',
            colId: 'OldColumn'
          }
        ]
      })
      expect(result.success).toBe(true)
    })
  })

  describe('rename_column operation', () => {
    it('accepts valid rename_column', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'rename_column',
            tableId: 'MyTable',
            colId: 'OldColumn',
            newColId: 'NewColumn'
          }
        ]
      })
      expect(result.success).toBe(true)
    })

    it('rejects rename_column without newColId', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'rename_column',
            tableId: 'MyTable',
            colId: 'OldColumn'
          }
        ]
      })
      expect(result.success).toBe(false)
    })
  })

  describe('create_summary operation', () => {
    it('accepts valid create_summary', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'create_summary',
            sourceTable: 'Orders',
            groupByColumns: ['Category', 'Year']
          }
        ]
      })
      expect(result.success).toBe(true)
    })

    it('rejects create_summary with empty groupByColumns', () => {
      // Schema requires min(1) for groupByColumns
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'create_summary',
            sourceTable: 'Orders',
            groupByColumns: []
          }
        ]
      })
      expect(result.success).toBe(false)
    })
  })

  describe('multiple operations', () => {
    it('accepts multiple operations in sequence', () => {
      const result = ManageSchemaSchema.safeParse({
        docId: VALID_DOC_ID,
        operations: [
          { action: 'create_table', name: 'NewTable' },
          { action: 'add_column', tableId: 'NewTable', column: { colId: 'Name', type: 'Text' } },
          { action: 'add_column', tableId: 'NewTable', column: { colId: 'Age', type: 'Int' } }
        ]
      })
      expect(result.success).toBe(true)
    })
  })
})

describe('MANAGE_SCHEMA_TOOL', () => {
  it('exports tool definition', () => {
    expect(MANAGE_SCHEMA_TOOL).toBeDefined()
  })

  it('has correct name', () => {
    expect(MANAGE_SCHEMA_TOOL.name).toBe('grist_manage_schema')
  })

  it('has correct category', () => {
    expect(MANAGE_SCHEMA_TOOL.category).toBe('tables')
  })

  it('has complete documentation', () => {
    expect(MANAGE_SCHEMA_TOOL.docs.overview).toBeDefined()
    expect(MANAGE_SCHEMA_TOOL.docs.examples.length).toBeGreaterThan(0)
    expect(MANAGE_SCHEMA_TOOL.docs.errors.length).toBeGreaterThan(0)
  })

  it('has handler function', () => {
    expect(typeof MANAGE_SCHEMA_TOOL.handler).toBe('function')
  })

  it('has inputSchema', () => {
    expect(MANAGE_SCHEMA_TOOL.inputSchema).toBeDefined()
  })

  it('has outputSchema', () => {
    expect(MANAGE_SCHEMA_TOOL.outputSchema).toBeDefined()
  })
})
