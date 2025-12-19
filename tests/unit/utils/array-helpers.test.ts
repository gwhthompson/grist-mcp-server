import { describe, expect, it } from 'vitest'
import { first, isNonEmpty } from '../../../src/utils/array-helpers.js'

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
