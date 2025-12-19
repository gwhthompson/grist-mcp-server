import { describe, expect, it } from 'vitest'
import { getPaginationMeta, paginate } from '../../../../src/tools/utils/pagination.js'

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1)

  it('returns first page correctly', () => {
    const result = paginate(items, { offset: 0, limit: 10 })
    expect(result.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(result.total).toBe(25)
    expect(result.offset).toBe(0)
    expect(result.limit).toBe(10)
    expect(result.hasMore).toBe(true)
    expect(result.nextOffset).toBe(10)
  })

  it('returns middle page correctly', () => {
    const result = paginate(items, { offset: 10, limit: 10 })
    expect(result.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(result.hasMore).toBe(true)
    expect(result.nextOffset).toBe(20)
  })

  it('returns last partial page correctly', () => {
    const result = paginate(items, { offset: 20, limit: 10 })
    expect(result.items).toEqual([21, 22, 23, 24, 25])
    expect(result.hasMore).toBe(false)
    expect(result.nextOffset).toBe(null)
  })

  it('calculates hasMore correctly at boundary', () => {
    const result = paginate(items, { offset: 0, limit: 25 })
    expect(result.items).toEqual(items)
    expect(result.hasMore).toBe(false)
    expect(result.nextOffset).toBe(null)
  })

  it('handles empty arrays', () => {
    const result = paginate([], { offset: 0, limit: 10 })
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
    expect(result.nextOffset).toBe(null)
  })

  it('respects custom default limit', () => {
    const result = paginate(items, {}, 5)
    expect(result.items).toEqual([1, 2, 3, 4, 5])
    expect(result.limit).toBe(5)
    expect(result.hasMore).toBe(true)
    expect(result.nextOffset).toBe(5)
  })

  it('uses default offset 0 when not provided', () => {
    const result = paginate(items, { limit: 5 })
    expect(result.offset).toBe(0)
    expect(result.items).toEqual([1, 2, 3, 4, 5])
  })

  it('uses default limit 100 when not provided', () => {
    const result = paginate(items, {})
    expect(result.limit).toBe(100)
    expect(result.items).toEqual(items) // All 25 items fit in 100
  })

  it('handles offset beyond array length', () => {
    const result = paginate(items, { offset: 100, limit: 10 })
    expect(result.items).toEqual([])
    expect(result.total).toBe(25)
    expect(result.hasMore).toBe(false)
    expect(result.nextOffset).toBe(null)
  })
})

describe('getPaginationMeta', () => {
  it('returns metadata without items', () => {
    const meta = getPaginationMeta(25, { offset: 10, limit: 10 })
    expect(meta.total).toBe(25)
    expect(meta.offset).toBe(10)
    expect(meta.limit).toBe(10)
    expect(meta.hasMore).toBe(true)
    expect(meta.nextOffset).toBe(20)
  })

  it('respects custom default limit', () => {
    const meta = getPaginationMeta(25, {}, 5)
    expect(meta.limit).toBe(5)
  })

  it('calculates hasMore correctly for last page', () => {
    const meta = getPaginationMeta(25, { offset: 20, limit: 10 })
    expect(meta.hasMore).toBe(false)
    expect(meta.nextOffset).toBe(null)
  })
})
