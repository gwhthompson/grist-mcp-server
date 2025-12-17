import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ValidationError } from '../../../src/errors/index.js'
import {
  assertType,
  createTypeGuard,
  hasProperty,
  isArrayOf,
  isBoolean,
  isDefined,
  isError,
  isNullish,
  isNumber,
  isObject,
  isRecord,
  isString,
  safeParse
} from '../../../src/types/type-guards.js'

describe('Type Guards', () => {
  describe('isString', () => {
    it.each([
      ['hello', true],
      ['', true],
      [123, false],
      [null, false],
      [undefined, false],
      [['a'], false]
    ])('isString(%p) -> %s', (value, expected) => {
      expect(isString(value)).toBe(expected)
    })
  })

  describe('isNumber', () => {
    it.each([
      [42, true],
      [3.14, true],
      [0, true],
      [-1, true],
      [Infinity, true],
      [NaN, false],
      ['42', false],
      [null, false]
    ])('isNumber(%p) -> %s', (value, expected) => {
      expect(isNumber(value)).toBe(expected)
    })
  })

  describe('isBoolean', () => {
    it.each([
      [true, true],
      [false, true],
      [0, false],
      [1, false],
      ['true', false],
      [null, false]
    ])('isBoolean(%p) -> %s', (value, expected) => {
      expect(isBoolean(value)).toBe(expected)
    })
  })

  describe('isNullish', () => {
    it.each([
      [null, true],
      [undefined, true],
      [0, false],
      ['', false],
      [false, false]
    ])('isNullish(%p) -> %s', (value, expected) => {
      expect(isNullish(value)).toBe(expected)
    })
  })

  describe('isDefined', () => {
    it.each([
      [42, true],
      ['', true],
      [0, true],
      [false, true],
      [null, false],
      [undefined, false]
    ])('isDefined(%p) -> %s', (value, expected) => {
      expect(isDefined(value)).toBe(expected)
    })
  })

  describe('isRecord', () => {
    it.each([
      [{}, true],
      [{ a: 1 }, true],
      [[], false],
      [null, false],
      ['{}', false],
      [42, false]
    ])('isRecord(%p) -> %s', (value, expected) => {
      expect(isRecord(value)).toBe(expected)
    })
  })

  describe('isObject', () => {
    it.each([
      [{}, true],
      [[], true],
      [null, false],
      ['object', false],
      [42, false]
    ])('isObject(%p) -> %s', (value, expected) => {
      expect(isObject(value)).toBe(expected)
    })
  })

  describe('isArrayOf', () => {
    it('validates all elements with guard', () => {
      expect(isArrayOf(['a', 'b'], isString)).toBe(true)
      expect(isArrayOf([1, 2], isNumber)).toBe(true)
      expect(isArrayOf([], isString)).toBe(true)
    })

    it('returns false if any element fails guard', () => {
      expect(isArrayOf([1, 'b'], isString)).toBe(false)
      expect(isArrayOf(['a', 2], isNumber)).toBe(false)
    })

    it('returns false for non-arrays', () => {
      expect(isArrayOf('not array', isString)).toBe(false)
      expect(isArrayOf(null, isString)).toBe(false)
    })
  })

  describe('hasProperty', () => {
    it.each([
      [{ name: 'test' }, 'name', true],
      [{ name: 'test' }, 'age', false],
      [{}, 'name', false]
    ])('hasProperty(%p, %s) -> %s', (obj, key, expected) => {
      expect(hasProperty(obj, key)).toBe(expected)
    })

    it('returns false for non-objects', () => {
      expect(hasProperty(null, 'key')).toBe(false)
      expect(hasProperty('string', 'length')).toBe(false)
    })
  })

  describe('isError', () => {
    it.each([
      [new Error('test'), true],
      [new TypeError('type'), true],
      [{ message: 'fake' }, false],
      ['error', false],
      [null, false]
    ])('isError(%p) -> %s', (value, expected) => {
      expect(isError(value)).toBe(expected)
    })
  })

  describe('createTypeGuard', () => {
    const isPositive = createTypeGuard(z.number().positive())

    it('returns true for valid values', () => {
      expect(isPositive(5)).toBe(true)
      expect(isPositive(0.1)).toBe(true)
    })

    it('returns false for invalid values', () => {
      expect(isPositive(-1)).toBe(false)
      expect(isPositive(0)).toBe(false)
      expect(isPositive('5')).toBe(false)
    })
  })

  describe('assertType', () => {
    const schema = z.string().min(1)

    it('passes for valid values', () => {
      expect(() => assertType(schema, 'hello')).not.toThrow()
    })

    it('throws ValidationError for invalid values', () => {
      expect(() => assertType(schema, '')).toThrow(ValidationError)
      expect(() => assertType(schema, 123)).toThrow(ValidationError)
    })

    it('includes custom message in error', () => {
      expect(() => assertType(schema, '', 'Name required')).toThrow('Name required')
    })
  })

  describe('safeParse', () => {
    const schema = z.object({ id: z.number() })

    it('returns success with data for valid values', () => {
      const result = safeParse(schema, { id: 42 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ id: 42 })
      }
    })

    it('returns failure with ValidationError for invalid values', () => {
      const result = safeParse(schema, { id: 'not-number' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ValidationError)
      }
    })
  })
})
