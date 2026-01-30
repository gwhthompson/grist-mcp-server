/**
 * Unit Tests for Domain Operations Base Utilities
 *
 * Tests pure functions used across all domain operations:
 * - normalizeValue: codec round-trip for canonical form
 * - deepEqual: type-aware comparison
 * - verifyEntities: generic entity verification
 * - verifyDeleted: deletion verification
 * - throwIfFailed: error throwing helper
 */

import { describe, expect, it } from 'vitest'
import {
  deepEqual,
  normalizeValue,
  throwIfFailed,
  verifyDeleted,
  verifyEntities
} from '../../../../src/domain/operations/base.js'
import { VerificationError } from '../../../../src/errors/VerificationError.js'

describe('Domain Operations Base Utilities', () => {
  // ===========================================================================
  // normalizeValue
  // ===========================================================================
  describe('normalizeValue', () => {
    it('returns null as-is', () => {
      expect(normalizeValue(null, 'Text')).toBe(null)
    })

    it('returns undefined as-is', () => {
      expect(normalizeValue(undefined, 'Text')).toBe(undefined)
    })

    it('passes through Text unchanged', () => {
      expect(normalizeValue('hello', 'Text')).toBe('hello')
    })

    it('passes through Numeric unchanged', () => {
      expect(normalizeValue(42, 'Numeric')).toBe(42)
      expect(normalizeValue(3.14, 'Numeric')).toBe(3.14)
    })

    it('passes through Int unchanged', () => {
      expect(normalizeValue(42, 'Int')).toBe(42)
    })

    it('passes through Bool unchanged', () => {
      expect(normalizeValue(true, 'Bool')).toBe(true)
      expect(normalizeValue(false, 'Bool')).toBe(false)
    })

    it('normalizes Date strings', () => {
      // Dates should normalize via codec round-trip
      const result = normalizeValue('2024-12-25', 'Date')
      expect(typeof result).toBe('string')
    })

    it('normalizes DateTime strings', () => {
      // DateTimes should normalize via codec round-trip
      const result = normalizeValue('2024-12-25T10:30:00Z', 'DateTime')
      expect(typeof result).toBe('string')
    })

    it('handles Choice values', () => {
      expect(normalizeValue('Active', 'Choice')).toBe('Active')
    })

    it('handles ChoiceList arrays', () => {
      const result = normalizeValue(['a', 'b'], 'ChoiceList')
      expect(Array.isArray(result)).toBe(true)
    })

    it('handles Ref IDs', () => {
      expect(normalizeValue(5, 'Ref:Table')).toBe(5)
    })

    it('handles RefList arrays', () => {
      const result = normalizeValue([1, 2, 3], 'RefList:Table')
      expect(Array.isArray(result)).toBe(true)
    })
  })

  // ===========================================================================
  // deepEqual
  // ===========================================================================
  describe('deepEqual', () => {
    describe('primitives', () => {
      it('returns true for identical strings', () => {
        expect(deepEqual('hello', 'hello')).toBe(true)
      })

      it('returns true for identical numbers', () => {
        expect(deepEqual(42, 42)).toBe(true)
      })

      it('returns true for identical booleans', () => {
        expect(deepEqual(true, true)).toBe(true)
        expect(deepEqual(false, false)).toBe(true)
      })

      it('returns false for different strings', () => {
        expect(deepEqual('hello', 'world')).toBe(false)
      })

      it('returns false for different numbers', () => {
        expect(deepEqual(42, 43)).toBe(false)
      })

      it('returns false for different booleans', () => {
        expect(deepEqual(true, false)).toBe(false)
      })
    })

    describe('null handling', () => {
      it('returns true for null === null', () => {
        expect(deepEqual(null, null)).toBe(true)
      })

      it('returns false for null vs non-null', () => {
        expect(deepEqual(null, 'hello')).toBe(false)
        expect(deepEqual('hello', null)).toBe(false)
      })

      it('returns false for null vs undefined', () => {
        expect(deepEqual(null, undefined)).toBe(false)
      })
    })

    describe('type mismatch', () => {
      it('returns false for string vs number', () => {
        expect(deepEqual('42', 42)).toBe(false)
      })

      it('returns false for boolean vs number', () => {
        expect(deepEqual(true, 1)).toBe(false)
      })

      it('returns false for array vs non-array-like object', () => {
        // Arrays vs objects with different structure
        expect(deepEqual([1, 2], { a: 1, b: 2 })).toBe(false)
      })
    })

    describe('arrays', () => {
      it('returns true for equal arrays', () => {
        expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true)
      })

      it('returns true for empty arrays', () => {
        expect(deepEqual([], [])).toBe(true)
      })

      it('returns false for different length arrays', () => {
        expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
      })

      it('returns false for different values', () => {
        expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false)
      })

      it('handles nested arrays', () => {
        expect(
          deepEqual(
            [
              [1, 2],
              [3, 4]
            ],
            [
              [1, 2],
              [3, 4]
            ]
          )
        ).toBe(true)
        expect(
          deepEqual(
            [
              [1, 2],
              [3, 4]
            ],
            [
              [1, 2],
              [3, 5]
            ]
          )
        ).toBe(false)
      })

      it('returns false for different order', () => {
        expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false)
      })
    })

    describe('objects', () => {
      it('returns true for equal objects', () => {
        expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
      })

      it('returns true for empty objects', () => {
        expect(deepEqual({}, {})).toBe(true)
      })

      it('returns false for different key counts', () => {
        expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
      })

      it('returns false for different values', () => {
        expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false)
      })

      it('handles nested objects', () => {
        expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true)
        expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false)
      })

      it('handles mixed nesting', () => {
        const obj1 = { arr: [1, 2], nested: { x: 'y' } }
        const obj2 = { arr: [1, 2], nested: { x: 'y' } }
        expect(deepEqual(obj1, obj2)).toBe(true)
      })
    })

    describe('type-aware normalization', () => {
      it('normalizes when columnType is provided', () => {
        // Both should normalize to the same canonical form
        expect(deepEqual('hello', 'hello', 'Text')).toBe(true)
      })

      it('handles numeric comparison with type', () => {
        expect(deepEqual(42, 42, 'Numeric')).toBe(true)
      })
    })
  })

  // ===========================================================================
  // verifyEntities
  // ===========================================================================
  describe('verifyEntities', () => {
    const config = {
      idField: 'id' as const,
      verifyFields: ['name', 'value'] as const,
      entityName: 'Record'
    }

    it('passes when all written entities match read entities', () => {
      const written = [
        { id: 1, name: 'Alice', value: 100 },
        { id: 2, name: 'Bob', value: 200 }
      ]
      const read = [
        { id: 1, name: 'Alice', value: 100 },
        { id: 2, name: 'Bob', value: 200 }
      ]

      const result = verifyEntities(written, read, config)
      expect(result.passed).toBe(true)
      expect(result.checks.every((c) => c.passed)).toBe(true)
    })

    it('fails when entity is missing from read results', () => {
      const written = [{ id: 1, name: 'Alice', value: 100 }]
      const read: typeof written = []

      const result = verifyEntities(written, read, config)
      expect(result.passed).toBe(false)
      expect(result.checks.some((c) => c.description.includes('not found'))).toBe(true)
    })

    it('fails when field value differs', () => {
      const written = [{ id: 1, name: 'Alice', value: 100 }]
      const read = [{ id: 1, name: 'Alice', value: 999 }]

      const result = verifyEntities(written, read, config)
      expect(result.passed).toBe(false)

      const failedCheck = result.checks.find((c) => !c.passed)
      expect(failedCheck?.expected).toBe(100)
      expect(failedCheck?.actual).toBe(999)
    })

    it('handles nested fields (like record.fields)', () => {
      const nestedConfig = {
        idField: 'id' as const,
        verifyFields: ['fields'] as const,
        entityName: 'Record'
      }

      const written = [{ id: 1, fields: { Name: 'Alice', Age: 30 } }]
      const read = [{ id: 1, fields: { Name: 'Alice', Age: 30 } }]

      const result = verifyEntities(written, read, nestedConfig)
      expect(result.passed).toBe(true)
    })

    it('fails when nested field differs', () => {
      const nestedConfig = {
        idField: 'id' as const,
        verifyFields: ['fields'] as const,
        entityName: 'Record'
      }

      const written = [{ id: 1, fields: { Name: 'Alice', Age: 30 } }]
      const read = [{ id: 1, fields: { Name: 'Alice', Age: 99 } }]

      const result = verifyEntities(written, read, nestedConfig)
      expect(result.passed).toBe(false)

      const failedCheck = result.checks.find((c) => !c.passed)
      expect(failedCheck?.field).toBe('fields.Age')
    })

    it('uses columnTypes for type-aware comparison', () => {
      const configWithTypes = {
        ...config,
        columnTypes: new Map([['value', 'Numeric']])
      }

      const written = [{ id: 1, name: 'Alice', value: 100 }]
      const read = [{ id: 1, name: 'Alice', value: 100 }]

      const result = verifyEntities(written, read, configWithTypes)
      expect(result.passed).toBe(true)
    })

    it('returns duration in result', () => {
      const written = [{ id: 1, name: 'Alice', value: 100 }]
      const read = [{ id: 1, name: 'Alice', value: 100 }]

      const result = verifyEntities(written, read, config)
      expect(typeof result.duration).toBe('number')
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it('handles empty arrays', () => {
      const result = verifyEntities([], [], config)
      expect(result.passed).toBe(true)
      expect(result.checks.length).toBe(0)
    })
  })

  // ===========================================================================
  // verifyDeleted
  // ===========================================================================
  describe('verifyDeleted', () => {
    const config = {
      idField: 'id' as const,
      entityName: 'Record'
    }

    it('passes when remaining is empty', () => {
      const result = verifyDeleted([1, 2, 3], [], config)
      expect(result.passed).toBe(true)
      expect(result.checks.length).toBe(3)
      expect(result.checks.every((c) => c.passed)).toBe(true)
    })

    it('fails when entities still exist', () => {
      const remaining = [{ id: 1, name: 'Alice' }]
      const result = verifyDeleted([1, 2], remaining, config)
      expect(result.passed).toBe(false)
    })

    it('includes entity IDs in check descriptions', () => {
      const result = verifyDeleted([42], [], config)
      expect(result.checks[0].description).toContain('42')
      expect(result.checks[0].description).toContain('deleted')
    })

    it('handles empty deletedIds', () => {
      const result = verifyDeleted([], [], config)
      expect(result.passed).toBe(true)
      expect(result.checks.length).toBe(0)
    })
  })

  // ===========================================================================
  // throwIfFailed
  // ===========================================================================
  describe('throwIfFailed', () => {
    const context = {
      operation: 'addRecords',
      entityType: 'Record',
      entityId: 'TestTable'
    }

    it('does not throw for passing result', () => {
      const passingResult = {
        passed: true,
        checks: [{ description: 'Check 1', passed: true }]
      }

      expect(() => throwIfFailed(passingResult, context)).not.toThrow()
    })

    it('throws VerificationError for failing result', () => {
      const failingResult = {
        passed: false,
        checks: [
          { description: 'Check 1', passed: true },
          { description: 'Check 2', passed: false, expected: 'a', actual: 'b' }
        ]
      }

      expect(() => throwIfFailed(failingResult, context)).toThrow(VerificationError)
    })

    it('includes context in error', () => {
      const failingResult = {
        passed: false,
        checks: [{ description: 'Check 1', passed: false }]
      }

      try {
        throwIfFailed(failingResult, context)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(VerificationError)
        const verificationError = error as VerificationError
        expect(verificationError.operation).toBe('addRecords')
        expect(verificationError.entityType).toBe('Record')
        expect(verificationError.entityId).toBe('TestTable')
      }
    })

    it('includes failed checks in error result', () => {
      const failingResult = {
        passed: false,
        checks: [{ description: 'Field match', passed: false, expected: 100, actual: 200 }]
      }

      try {
        throwIfFailed(failingResult, context)
        expect.fail('Should have thrown')
      } catch (error) {
        const verificationError = error as VerificationError
        expect(verificationError.result.checks[0].expected).toBe(100)
        expect(verificationError.result.checks[0].actual).toBe(200)
      }
    })
  })
})
