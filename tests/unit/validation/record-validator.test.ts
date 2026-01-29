import { describe, expect, it } from 'vitest'
import type { ColumnMetadata } from '../../../src/services/schema-cache.js'
import {
  validateRecord,
  validateRecords,
  validateUpsertRecords
} from '../../../src/validators/data-integrity-validators.js'

// Helper to create minimal column metadata for testing
function createColumn(id: string, type: string, isFormula = false): ColumnMetadata {
  return {
    id,
    fields: {
      colId: id,
      label: id,
      type,
      isFormula,
      parentId: 1,
      parentPos: 1
    }
  }
}

describe('Record Validator', () => {
  const columns: ColumnMetadata[] = [
    createColumn('Name', 'Text'),
    createColumn('Age', 'Int'),
    createColumn('Active', 'Bool'),
    createColumn('Computed', 'Numeric', true) // formula column
  ]

  describe('validateRecord', () => {
    it('should pass for valid record', () => {
      const record = { Name: 'John', Age: 30, Active: true }
      expect(() => validateRecord(record, columns)).not.toThrow()
    })

    it('should pass for empty record', () => {
      expect(() => validateRecord({}, columns)).not.toThrow()
    })

    it('should pass for unknown columns (lenient)', () => {
      const record = { Name: 'John', UnknownCol: 'value' }
      expect(() => validateRecord(record, columns)).not.toThrow()
    })

    it('should throw for formula column writes', () => {
      const record = { Name: 'John', Computed: 100 }
      expect(() => validateRecord(record, columns)).toThrow(/formula column/i)
    })

    it('should throw for type mismatches', () => {
      const record = { Age: 'not a number' }
      expect(() => validateRecord(record, columns)).toThrow()
    })
  })

  describe('validateRecords', () => {
    it('should pass for valid records array', () => {
      const records = [
        { Name: 'John', Age: 30 },
        { Name: 'Jane', Age: 25 }
      ]
      expect(() => validateRecords(records, columns)).not.toThrow()
    })

    it('should pass for empty array', () => {
      expect(() => validateRecords([], columns)).not.toThrow()
    })

    it('should fail fast on first invalid record', () => {
      const records = [
        { Name: 'Valid' },
        { Computed: 100 }, // formula column - should fail
        { Name: 'Never reached' }
      ]
      expect(() => validateRecords(records, columns)).toThrow(/formula column/i)
    })
  })

  describe('validateUpsertRecords', () => {
    it('should pass for valid upsert records', () => {
      const records = [
        { require: { Name: 'John' }, fields: { Age: 30 } },
        { require: { Name: 'Jane' }, fields: { Active: true } }
      ]
      expect(() => validateUpsertRecords(records, columns)).not.toThrow()
    })

    it('should pass when fields is undefined', () => {
      const records = [{ require: { Name: 'John' } }, { require: { Name: 'Jane' } }]
      expect(() => validateUpsertRecords(records, columns)).not.toThrow()
    })

    it('should pass for empty records array', () => {
      expect(() => validateUpsertRecords([], columns)).not.toThrow()
    })

    it('should validate only fields, not require', () => {
      // require contains formula column - should pass because we only validate fields
      const records = [{ require: { Computed: 100 }, fields: { Name: 'John' } }]
      expect(() => validateUpsertRecords(records, columns)).not.toThrow()
    })

    it('should throw when fields contains formula column', () => {
      const records = [{ require: { Name: 'John' }, fields: { Computed: 100 } }]
      expect(() => validateUpsertRecords(records, columns)).toThrow(/formula column/i)
    })
  })
})
