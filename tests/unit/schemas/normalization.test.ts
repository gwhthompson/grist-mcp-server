import { describe, expect, it } from 'vitest'
import {
  normalizeRecordOperation,
  normalizeSchemaOperation
} from '../../../src/schemas/normalization.js'

describe('normalizeSchemaOperation', () => {
  describe('create_table operation', () => {
    it('converts tableId alias to name', () => {
      const input = { action: 'create_table', tableId: 'Tasks', columns: [] }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({ action: 'create_table', name: 'Tasks', columns: [] })
    })

    it('preserves name when both tableId and name are present', () => {
      const input = { action: 'create_table', tableId: 'Alias', name: 'Canonical', columns: [] }
      const result = normalizeSchemaOperation(input)

      // name takes precedence, tableId remains but is ignored
      expect(result).toEqual({
        action: 'create_table',
        tableId: 'Alias',
        name: 'Canonical',
        columns: []
      })
    })

    it('preserves name when only name is present', () => {
      const input = { action: 'create_table', name: 'Tasks', columns: [] }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({ action: 'create_table', name: 'Tasks', columns: [] })
    })

    it('converts id to colId in column definitions', () => {
      const input = {
        action: 'create_table',
        name: 'Tasks',
        columns: [
          { id: 'Name', type: 'Text' },
          { id: 'Status', type: 'Choice' }
        ]
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({
        action: 'create_table',
        name: 'Tasks',
        columns: [
          { colId: 'Name', type: 'Text' },
          { colId: 'Status', type: 'Choice' }
        ]
      })
    })

    it('preserves colId when both id and colId are present', () => {
      const input = {
        action: 'create_table',
        name: 'Tasks',
        columns: [{ id: 'Wrong', colId: 'Right', type: 'Text' }]
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({
        action: 'create_table',
        name: 'Tasks',
        columns: [{ id: 'Wrong', colId: 'Right', type: 'Text' }]
      })
    })

    it('preserves columns that already use colId', () => {
      const input = {
        action: 'create_table',
        name: 'Tasks',
        columns: [{ colId: 'Name', type: 'Text' }]
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({
        action: 'create_table',
        name: 'Tasks',
        columns: [{ colId: 'Name', type: 'Text' }]
      })
    })
  })

  describe('widgetOptions hoisting in create_table', () => {
    it('hoists choices from widgetOptions to root', () => {
      const input = {
        action: 'create_table',
        name: 'Tasks',
        columns: [{ colId: 'Status', type: 'Choice', widgetOptions: { choices: ['A', 'B'] } }]
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({
        action: 'create_table',
        name: 'Tasks',
        columns: [{ colId: 'Status', type: 'Choice', choices: ['A', 'B'] }]
      })
    })

    it('root-level key takes precedence over widgetOptions key', () => {
      const input = {
        action: 'create_table',
        name: 'Tasks',
        columns: [
          {
            colId: 'Status',
            type: 'Choice',
            choices: ['X', 'Y'],
            widgetOptions: { choices: ['A', 'B'] }
          }
        ]
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({
        action: 'create_table',
        name: 'Tasks',
        columns: [{ colId: 'Status', type: 'Choice', choices: ['X', 'Y'] }]
      })
    })

    it('discards non-type-specific keys from widgetOptions', () => {
      const input = {
        action: 'create_table',
        name: 'Tasks',
        columns: [
          {
            colId: 'Status',
            type: 'Choice',
            widgetOptions: { choices: ['A'], unknownProp: 42 }
          }
        ]
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({
        action: 'create_table',
        name: 'Tasks',
        columns: [{ colId: 'Status', type: 'Choice', choices: ['A'] }]
      })
    })

    it('combines id → colId AND widgetOptions hoisting', () => {
      const input = {
        action: 'create_table',
        name: 'Tasks',
        columns: [
          { id: 'Priority', type: 'Choice', widgetOptions: { choices: ['Low', 'Medium', 'High'] } }
        ]
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({
        action: 'create_table',
        name: 'Tasks',
        columns: [{ colId: 'Priority', type: 'Choice', choices: ['Low', 'Medium', 'High'] }]
      })
    })

    it('parses widgetOptions from JSON string', () => {
      const input = {
        action: 'create_table',
        name: 'Tasks',
        columns: [
          {
            colId: 'Status',
            type: 'Choice',
            widgetOptions: JSON.stringify({ choices: ['A', 'B'] })
          }
        ]
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({
        action: 'create_table',
        name: 'Tasks',
        columns: [{ colId: 'Status', type: 'Choice', choices: ['A', 'B'] }]
      })
    })

    it('strips empty widgetOptions (no-op)', () => {
      const input = {
        action: 'create_table',
        name: 'Tasks',
        columns: [{ colId: 'Name', type: 'Text', widgetOptions: {} }]
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({
        action: 'create_table',
        name: 'Tasks',
        columns: [{ colId: 'Name', type: 'Text' }]
      })
    })

    it('hoists multiple type-specific keys from widgetOptions', () => {
      const input = {
        action: 'create_table',
        name: 'Tasks',
        columns: [
          {
            colId: 'Price',
            type: 'Numeric',
            widgetOptions: { numMode: 'currency', currency: 'USD', decimals: 2 }
          }
        ]
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({
        action: 'create_table',
        name: 'Tasks',
        columns: [
          { colId: 'Price', type: 'Numeric', numMode: 'currency', currency: 'USD', decimals: 2 }
        ]
      })
    })
  })

  describe('widgetOptions hoisting in add_column', () => {
    it('hoists choices from widgetOptions to root', () => {
      const input = {
        action: 'add_column',
        tableId: 'Tasks',
        column: {
          colId: 'Status',
          type: 'Choice',
          widgetOptions: { choices: ['A', 'B'] }
        }
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({
        action: 'add_column',
        tableId: 'Tasks',
        column: { colId: 'Status', type: 'Choice', choices: ['A', 'B'] }
      })
    })

    it('root-level key takes precedence over widgetOptions key', () => {
      const input = {
        action: 'add_column',
        tableId: 'Tasks',
        column: {
          colId: 'Status',
          type: 'Choice',
          choices: ['X'],
          widgetOptions: { choices: ['A', 'B'] }
        }
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({
        action: 'add_column',
        tableId: 'Tasks',
        column: { colId: 'Status', type: 'Choice', choices: ['X'] }
      })
    })
  })

  describe('add_column operation', () => {
    it('converts id to colId in column definition', () => {
      const input = {
        action: 'add_column',
        tableId: 'Tasks',
        column: { id: 'Name', type: 'Text' }
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({
        action: 'add_column',
        tableId: 'Tasks',
        column: { colId: 'Name', type: 'Text' }
      })
    })

    it('preserves colId when already present', () => {
      const input = {
        action: 'add_column',
        tableId: 'Tasks',
        column: { colId: 'Name', type: 'Text' }
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual(input)
    })

    it('preserves colId when both id and colId are present', () => {
      const input = {
        action: 'add_column',
        tableId: 'Tasks',
        column: { id: 'Wrong', colId: 'Right', type: 'Text' }
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual({
        action: 'add_column',
        tableId: 'Tasks',
        column: { id: 'Wrong', colId: 'Right', type: 'Text' }
      })
    })
  })

  describe('other operations', () => {
    it('passes through rename_table unchanged', () => {
      const input = { action: 'rename_table', tableId: 'Old', newTableId: 'New' }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual(input)
    })

    it('passes through delete_table unchanged', () => {
      const input = { action: 'delete_table', tableId: 'Tasks' }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual(input)
    })

    it('passes through add_column with colId unchanged', () => {
      const input = {
        action: 'add_column',
        tableId: 'Tasks',
        column: { colId: 'Name', type: 'Text' }
      }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual(input)
    })
  })

  describe('edge cases', () => {
    it('returns null for null input', () => {
      expect(normalizeSchemaOperation(null)).toBeNull()
    })

    it('returns undefined for undefined input', () => {
      expect(normalizeSchemaOperation(undefined)).toBeUndefined()
    })

    it('returns primitives unchanged', () => {
      expect(normalizeSchemaOperation('string')).toBe('string')
      expect(normalizeSchemaOperation(42)).toBe(42)
      expect(normalizeSchemaOperation(true)).toBe(true)
    })

    it('returns objects without action unchanged', () => {
      const input = { foo: 'bar' }
      const result = normalizeSchemaOperation(input)

      expect(result).toEqual(input)
    })
  })
})

describe('normalizeRecordOperation', () => {
  describe('flat update records', () => {
    it('converts flat update record to canonical shape', () => {
      const input = {
        action: 'update',
        tableId: 'Tasks',
        records: [{ id: 1, Name: 'Alice', Status: 'Done' }]
      }
      const result = normalizeRecordOperation(input)

      expect(result).toEqual({
        action: 'update',
        tableId: 'Tasks',
        records: [{ id: 1, fields: { Name: 'Alice', Status: 'Done' } }]
      })
    })

    it('converts multiple flat records', () => {
      const input = {
        action: 'update',
        tableId: 'Tasks',
        records: [
          { id: 1, Name: 'Alice' },
          { id: 2, Name: 'Bob' }
        ]
      }
      const result = normalizeRecordOperation(input)

      expect(result).toEqual({
        action: 'update',
        tableId: 'Tasks',
        records: [
          { id: 1, fields: { Name: 'Alice' } },
          { id: 2, fields: { Name: 'Bob' } }
        ]
      })
    })

    it('passes through already-correct records', () => {
      const input = {
        action: 'update',
        tableId: 'Tasks',
        records: [{ id: 1, fields: { Name: 'Alice' } }]
      }
      const result = normalizeRecordOperation(input)

      expect(result).toEqual(input)
    })

    it('merges leaked keys into existing fields (mixed case)', () => {
      const input = {
        action: 'update',
        tableId: 'Tasks',
        records: [{ id: 1, fields: { Name: 'Alice' }, Status: 'Done' }]
      }
      const result = normalizeRecordOperation(input)

      expect(result).toEqual({
        action: 'update',
        tableId: 'Tasks',
        records: [{ id: 1, fields: { Name: 'Alice', Status: 'Done' } }]
      })
    })

    it('treats fields as column name when it is a primitive', () => {
      const input = {
        action: 'update',
        tableId: 'Tasks',
        records: [{ id: 1, fields: 'some value', Name: 'Alice' }]
      }
      const result = normalizeRecordOperation(input)

      expect(result).toEqual({
        action: 'update',
        tableId: 'Tasks',
        records: [{ id: 1, fields: { fields: 'some value', Name: 'Alice' } }]
      })
    })

    it('treats fields as column name when it is an array', () => {
      const input = {
        action: 'update',
        tableId: 'Tasks',
        records: [{ id: 1, fields: ['a', 'b'], Name: 'Alice' }]
      }
      const result = normalizeRecordOperation(input)

      expect(result).toEqual({
        action: 'update',
        tableId: 'Tasks',
        records: [{ id: 1, fields: { fields: ['a', 'b'], Name: 'Alice' } }]
      })
    })
  })

  describe('non-update operations pass through', () => {
    it('passes through add operations', () => {
      const input = {
        action: 'add',
        tableId: 'Tasks',
        records: [{ Name: 'Alice' }]
      }
      const result = normalizeRecordOperation(input)

      expect(result).toEqual(input)
    })

    it('passes through delete operations', () => {
      const input = {
        action: 'delete',
        tableId: 'Tasks',
        rowIds: [1, 2]
      }
      const result = normalizeRecordOperation(input)

      expect(result).toEqual(input)
    })

    it('passes through upsert operations', () => {
      const input = {
        action: 'upsert',
        tableId: 'Tasks',
        records: [{ require: { Email: 'a@b.com' }, fields: { Name: 'Alice' } }]
      }
      const result = normalizeRecordOperation(input)

      expect(result).toEqual(input)
    })
  })

  describe('edge cases', () => {
    it('returns null for null input', () => {
      expect(normalizeRecordOperation(null)).toBeNull()
    })

    it('returns undefined for undefined input', () => {
      expect(normalizeRecordOperation(undefined)).toBeUndefined()
    })

    it('returns non-object input unchanged', () => {
      expect(normalizeRecordOperation('string')).toBe('string')
      expect(normalizeRecordOperation(42)).toBe(42)
    })

    it('returns update with missing records array unchanged', () => {
      const input = { action: 'update', tableId: 'Tasks' }
      const result = normalizeRecordOperation(input)

      expect(result).toEqual(input)
    })

    it('handles record with non-numeric id (passes through for Zod to reject)', () => {
      const input = {
        action: 'update',
        tableId: 'Tasks',
        records: [{ id: 'not-a-number', Name: 'Alice' }]
      }
      const result = normalizeRecordOperation(input)

      // Non-numeric id means we don't normalize — let Zod catch it
      expect(result).toEqual(input)
    })

    it('handles record without id (passes through for Zod to reject)', () => {
      const input = {
        action: 'update',
        tableId: 'Tasks',
        records: [{ Name: 'Alice' }]
      }
      const result = normalizeRecordOperation(input)

      expect(result).toEqual(input)
    })

    it('handles null record in array', () => {
      const input = {
        action: 'update',
        tableId: 'Tasks',
        records: [null]
      }
      const result = normalizeRecordOperation(input)

      expect(result).toEqual(input)
    })
  })
})
