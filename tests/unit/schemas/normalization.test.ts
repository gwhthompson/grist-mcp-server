import { describe, expect, it } from 'vitest'
import { normalizeSchemaOperation } from '../../../src/schemas/normalization.js'

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

    it('passes through add_column unchanged', () => {
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
