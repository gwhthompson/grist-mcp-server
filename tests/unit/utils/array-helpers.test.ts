import { describe, expect, it } from 'vitest'
import {
  at,
  atOrUndefined,
  first,
  firstOrUndefined,
  isNonEmpty,
  last,
  lastOrUndefined
} from '../../../src/utils/array-helpers.js'

describe('Array Helpers', () => {
  describe('first', () => {
    it.each([
      [[1, 2, 3], 1],
      [['a'], 'a'],
      [[{ id: 1 }], { id: 1 }]
    ])('first(%j) -> %p', (arr, expected) => {
      expect(first(arr)).toEqual(expected)
    })

    it('throws on empty array', () => {
      expect(() => first([])).toThrow('Array is empty')
    })

    it('includes context in error message', () => {
      expect(() => first([], 'Getting widget')).toThrow('Getting widget: Array is empty')
    })
  })

  describe('firstOrUndefined', () => {
    it.each([
      [[1, 2], 1],
      [['a', 'b'], 'a'],
      [[], undefined]
    ])('firstOrUndefined(%j) -> %p', (arr, expected) => {
      expect(firstOrUndefined(arr)).toBe(expected)
    })
  })

  describe('at', () => {
    it.each([
      [[1, 2, 3], 0, 1],
      [[1, 2, 3], 1, 2],
      [[1, 2, 3], 2, 3],
      [['a', 'b'], 0, 'a'],
      [['a', 'b'], 1, 'b']
    ])('at(%j, %d) -> %p', (arr, idx, expected) => {
      expect(at(arr, idx)).toBe(expected)
    })

    it.each([
      [[1, 2], -1, 'Index -1 out of bounds'],
      [[1, 2], 2, 'Index 2 out of bounds'],
      [[1, 2], 100, 'Index 100 out of bounds'],
      [[], 0, 'Index 0 out of bounds']
    ])('throws RangeError: at(%j, %d)', (arr, idx, errorMsg) => {
      expect(() => at(arr, idx)).toThrow(RangeError)
      expect(() => at(arr, idx)).toThrow(errorMsg)
    })

    it('includes context in error message', () => {
      expect(() => at([1], 5, 'Getting page')).toThrow('Getting page: Index 5 out of bounds')
    })
  })

  describe('atOrUndefined', () => {
    it.each([
      [[1, 2, 3], 0, 1],
      [[1, 2, 3], 2, 3],
      [[1, 2], -1, undefined],
      [[1, 2], 2, undefined],
      [[], 0, undefined]
    ])('atOrUndefined(%j, %d) -> %p', (arr, idx, expected) => {
      expect(atOrUndefined(arr, idx)).toBe(expected)
    })
  })

  describe('last', () => {
    it.each([
      [[1, 2, 3], 3],
      [['a'], 'a'],
      [[{ id: 1 }, { id: 2 }], { id: 2 }]
    ])('last(%j) -> %p', (arr, expected) => {
      expect(last(arr)).toEqual(expected)
    })

    it('throws on empty array', () => {
      expect(() => last([])).toThrow('Array is empty')
    })

    it('includes context in error message', () => {
      expect(() => last([], 'Getting record')).toThrow('Getting record: Array is empty')
    })
  })

  describe('lastOrUndefined', () => {
    it.each([
      [[1, 2, 3], 3],
      [['only'], 'only'],
      [[], undefined]
    ])('lastOrUndefined(%j) -> %p', (arr, expected) => {
      expect(lastOrUndefined(arr)).toBe(expected)
    })
  })

  describe('isNonEmpty', () => {
    it.each([
      [[1], true],
      [[1, 2, 3], true],
      [[], false]
    ])('isNonEmpty(%j) -> %s', (arr, expected) => {
      expect(isNonEmpty(arr)).toBe(expected)
    })

    it('narrows type when true', () => {
      const arr: number[] = [1, 2, 3]
      if (isNonEmpty(arr)) {
        // TypeScript knows arr[0] is number, not number | undefined
        const first: number = arr[0]
        expect(first).toBe(1)
      }
    })
  })
})
