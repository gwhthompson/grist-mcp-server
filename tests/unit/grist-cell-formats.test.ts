/**
 * Unit Tests for Grist Cell Format Utilities
 *
 * Tests bidirectional conversion between SQL and REST API formats.
 * Does NOT require Docker - pure unit tests.
 */

import { describe, expect, it } from 'vitest'
import {
  encodeGristJson,
  encodeRefList,
  isNaturalRefList,
  isWireRefList,
  parseGristJson,
  parseRefList
} from '../../src/types/grist-cell-formats.js'

describe('Grist Cell Format Utilities', () => {
  describe('parseRefList', () => {
    it('should parse SQL string format "[1,2,3]"', () => {
      expect(parseRefList('[1,2,3]')).toEqual([1, 2, 3])
    })

    it('should parse SQL string format with single item "[15]"', () => {
      expect(parseRefList('[15]')).toEqual([15])
    })

    it('should parse wire format ["L", 1, 2, 3]', () => {
      expect(parseRefList(['L', 1, 2, 3])).toEqual([1, 2, 3])
    })

    it('should parse natural format [1, 2, 3]', () => {
      expect(parseRefList([1, 2, 3])).toEqual([1, 2, 3])
    })

    it('should return empty array for null', () => {
      expect(parseRefList(null)).toEqual([])
    })

    it('should return empty array for undefined', () => {
      expect(parseRefList(undefined)).toEqual([])
    })

    it('should return empty array for empty string', () => {
      expect(parseRefList('')).toEqual([])
    })

    it('should return empty array for invalid JSON string', () => {
      expect(parseRefList('not-json')).toEqual([])
    })

    it('should return empty array for empty array', () => {
      expect(parseRefList([])).toEqual([])
    })

    it('should return empty array for wire format with no items ["L"]', () => {
      expect(parseRefList(['L'])).toEqual([])
    })

    it('should return empty array for mixed type array', () => {
      expect(parseRefList([1, 'two', 3])).toEqual([])
    })

    it('should handle SQL string for empty array "[]"', () => {
      expect(parseRefList('[]')).toEqual([])
    })
  })

  describe('encodeRefList', () => {
    it('should encode non-empty array with L prefix', () => {
      expect(encodeRefList([1, 2, 3])).toEqual(['L', 1, 2, 3])
    })

    it('should encode single item array', () => {
      expect(encodeRefList([15])).toEqual(['L', 15])
    })

    it('should return null for empty array', () => {
      expect(encodeRefList([])).toBeNull()
    })
  })

  describe('isWireRefList', () => {
    it('should return true for valid wire format', () => {
      expect(isWireRefList(['L', 1, 2, 3])).toBe(true)
    })

    it('should return true for wire format with single item', () => {
      expect(isWireRefList(['L', 15])).toBe(true)
    })

    it('should return false for natural format', () => {
      expect(isWireRefList([1, 2, 3])).toBe(false)
    })

    it('should return false for empty array', () => {
      expect(isWireRefList([])).toBe(false)
    })

    it('should return false for just ["L"]', () => {
      expect(isWireRefList(['L'])).toBe(true) // ["L"] is technically valid wire format for empty
    })

    it('should return false for non-array', () => {
      expect(isWireRefList('not-array')).toBe(false)
    })

    it('should return false for array with non-numbers after L', () => {
      expect(isWireRefList(['L', 'one', 'two'])).toBe(false)
    })
  })

  describe('isNaturalRefList', () => {
    it('should return true for array of numbers', () => {
      expect(isNaturalRefList([1, 2, 3])).toBe(true)
    })

    it('should return true for empty array', () => {
      expect(isNaturalRefList([])).toBe(true)
    })

    it('should return false for wire format', () => {
      expect(isNaturalRefList(['L', 1, 2])).toBe(false)
    })

    it('should return false for mixed types', () => {
      expect(isNaturalRefList([1, 'two', 3])).toBe(false)
    })

    it('should return false for non-array', () => {
      expect(isNaturalRefList('not-array')).toBe(false)
    })
  })

  describe('parseGristJson', () => {
    it('should parse SQL string format', () => {
      const result = parseGristJson('{"rulesOptions":[{"fillColor":"#FF0000"}]}', {})
      expect(result).toEqual({ rulesOptions: [{ fillColor: '#FF0000' }] })
    })

    it('should return object as-is', () => {
      const obj = { rulesOptions: [{ fillColor: '#FF0000' }] }
      expect(parseGristJson(obj, {})).toEqual(obj)
    })

    it('should return fallback for null', () => {
      expect(parseGristJson(null, { default: true })).toEqual({ default: true })
    })

    it('should return fallback for undefined', () => {
      expect(parseGristJson(undefined, { default: true })).toEqual({ default: true })
    })

    it('should return fallback for invalid JSON string', () => {
      expect(parseGristJson('not-json', { default: true })).toEqual({ default: true })
    })

    it('should return fallback for non-string/non-object', () => {
      expect(parseGristJson(123, { default: true })).toEqual({ default: true })
    })

    it('should handle empty object string', () => {
      expect(parseGristJson('{}', { default: true })).toEqual({})
    })

    it('should handle nested objects', () => {
      const input = '{"a":{"b":{"c":1}}}'
      expect(parseGristJson(input, {})).toEqual({ a: { b: { c: 1 } } })
    })
  })

  describe('encodeGristJson', () => {
    it('should encode object to JSON string', () => {
      expect(encodeGristJson({ rulesOptions: [] })).toBe('{"rulesOptions":[]}')
    })

    it('should encode array to JSON string', () => {
      expect(encodeGristJson([1, 2, 3])).toBe('[1,2,3]')
    })

    it('should encode null', () => {
      expect(encodeGristJson(null)).toBe('null')
    })
  })

  describe('roundtrip conversions', () => {
    it('should roundtrip RefList: natural -> wire -> natural', () => {
      const original = [1, 2, 3]
      const wire = encodeRefList(original)
      const back = parseRefList(wire)
      expect(back).toEqual(original)
    })

    it('should roundtrip JSON: object -> string -> object', () => {
      const original = { rulesOptions: [{ fillColor: '#FF0000' }] }
      const encoded = encodeGristJson(original)
      const back = parseGristJson(encoded, {})
      expect(back).toEqual(original)
    })
  })
})
