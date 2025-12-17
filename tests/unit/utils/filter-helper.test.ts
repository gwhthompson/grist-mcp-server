import { describe, expect, it } from 'vitest'
import {
  composeFiltersAnd,
  composeFiltersOr,
  filterByName,
  filterByPredicate,
  filterByProperty,
  filterWithAnd,
  filterWithOr,
  searchAcrossProperties
} from '../../../src/utils/filter-helper.js'

interface Person {
  name: string
  age: number
  active: boolean
}

const people: Person[] = [
  { name: 'Alice', age: 30, active: true },
  { name: 'Bob', age: 25, active: false },
  { name: 'Charlie', age: 35, active: true }
]

describe('Filter Helpers', () => {
  describe('filterByName', () => {
    it.each([
      ['Alice', 1],
      ['alice', 1],
      ['LIC', 1],
      ['', 3],
      [undefined, 3],
      ['  ', 3],
      ['xyz', 0],
      ['a', 2]
    ])('filterByName(people, %p) -> length %d', (search, expectedLength) => {
      expect(filterByName(people, search)).toHaveLength(expectedLength)
    })
  })

  describe('filterByProperty', () => {
    it.each([
      ['age', 30, 1],
      ['age', 25, 1],
      ['active', true, 2],
      ['active', false, 1],
      ['name', 'Bob', 1],
      ['name', 'BOB', 1],
      ['age', undefined, 3],
      ['age', null, 3]
    ])('filterByProperty(people, %s, %p) -> length %d', (prop, value, expectedLength) => {
      expect(
        filterByProperty(people, prop as keyof Person, value as Person[keyof Person])
      ).toHaveLength(expectedLength)
    })
  })

  describe('filterByPredicate', () => {
    it('filters by custom predicate', () => {
      expect(filterByPredicate(people, (p) => p.age > 28)).toHaveLength(2)
    })

    it('returns empty array unchanged', () => {
      const empty: Person[] = []
      expect(filterByPredicate(empty, () => true)).toBe(empty)
    })
  })

  describe('filterWithAnd', () => {
    it('applies all filters (AND logic)', () => {
      const filters = [(p: Person) => p.age > 30, (p: Person) => p.active]
      expect(filterWithAnd(people, filters)).toHaveLength(1)
      expect(filterWithAnd(people, filters)[0]?.name).toBe('Charlie')
    })

    it('returns all items with empty filters', () => {
      expect(filterWithAnd(people, [])).toHaveLength(3)
    })
  })

  describe('filterWithOr', () => {
    it('applies any filter (OR logic)', () => {
      const filters = [(p: Person) => p.name === 'Alice', (p: Person) => p.age === 25]
      expect(filterWithOr(people, filters)).toHaveLength(2)
    })

    it('returns all items with empty filters', () => {
      expect(filterWithOr(people, [])).toHaveLength(3)
    })
  })

  describe('composeFiltersAnd', () => {
    it('creates composed AND filter', () => {
      const composed = composeFiltersAnd<Person>([(p) => p.age > 30, (p) => p.active])
      expect(people.filter(composed)).toHaveLength(1)
    })
  })

  describe('composeFiltersOr', () => {
    it('creates composed OR filter', () => {
      const composed = composeFiltersOr<Person>([(p) => p.name === 'Bob', (p) => p.active])
      expect(people.filter(composed)).toHaveLength(3)
    })
  })

  describe('searchAcrossProperties', () => {
    it.each([
      ['alice', ['name'], 1],
      ['ALICE', ['name'], 1],
      ['a', ['name'], 2],
      ['', ['name'], 3],
      [undefined, ['name'], 3],
      ['  ', ['name'], 3],
      ['xyz', ['name'], 0]
    ])('searchAcrossProperties(people, %p, %j) -> length %d', (search, props, expectedLength) => {
      expect(searchAcrossProperties(people, search, props as (keyof Person)[])).toHaveLength(
        expectedLength
      )
    })

    it('searches multiple properties', () => {
      const items = [
        { title: 'Hello', description: 'World' },
        { title: 'Foo', description: 'Bar' }
      ]
      expect(searchAcrossProperties(items, 'world', ['title', 'description'])).toHaveLength(1)
      expect(searchAcrossProperties(items, 'o', ['title', 'description'])).toHaveLength(2)
    })

    it('skips non-string properties', () => {
      expect(searchAcrossProperties(people, '30', ['age' as keyof Person])).toHaveLength(0)
    })
  })
})
