import { describe, expect, it } from 'vitest'
import { createPaginationHelper, PaginationHelper } from '../../../src/utils/pagination-helper.js'

describe('PaginationHelper', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1)

  describe('constructor validation', () => {
    it.each([
      [{ offset: -1, limit: 10 }, 'Offset must be non-negative'],
      [{ offset: 0, limit: 0 }, 'Limit must be greater than 0'],
      [{ offset: 0, limit: -5 }, 'Limit must be greater than 0']
    ])('throws for invalid params: %j', (params, errorMsg) => {
      expect(() => new PaginationHelper(items, params)).toThrow(errorMsg)
    })
  })

  describe('pagination behavior', () => {
    it.each([
      [{ offset: 0, limit: 10 }, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], true, 10],
      [{ offset: 10, limit: 10 }, [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], true, 20],
      [{ offset: 20, limit: 10 }, [21, 22, 23, 24, 25], false, null],
      [{ offset: 0, limit: 100 }, items, false, null],
      [{ offset: 25, limit: 10 }, [], false, null]
    ])('params %j -> page length %d, hasMore=%s, nextOffset=%s', (params, expectedPage, hasMore, nextOffset) => {
      const helper = new PaginationHelper(items, params)
      expect(helper.getPage()).toEqual(expectedPage)
      expect(helper.hasMoreItems()).toBe(hasMore)
      expect(helper.getMetadata().nextOffset).toBe(nextOffset)
    })
  })

  describe('metadata calculations', () => {
    it('calculates page numbers correctly', () => {
      const helper = new PaginationHelper(items, { offset: 10, limit: 5 })
      const meta = helper.getMetadata()
      expect(meta.pageNumber).toBe(3)
      expect(meta.totalPages).toBe(5)
      expect(meta.itemsInPage).toBe(5)
      expect(meta.total).toBe(25)
    })

    it('handles partial last page', () => {
      const helper = new PaginationHelper(items, { offset: 20, limit: 10 })
      const meta = helper.getMetadata()
      expect(meta.pageNumber).toBe(3)
      expect(meta.itemsInPage).toBe(5)
      expect(meta.hasMore).toBe(false)
    })
  })

  describe('utility methods', () => {
    it('getTotalCount returns total items', () => {
      const helper = new PaginationHelper(items, { offset: 0, limit: 10 })
      expect(helper.getTotalCount()).toBe(25)
    })

    it('getPageSize returns items in current page', () => {
      expect(new PaginationHelper(items, { offset: 0, limit: 10 }).getPageSize()).toBe(10)
      expect(new PaginationHelper(items, { offset: 20, limit: 10 }).getPageSize()).toBe(5)
    })

    it('isEmpty returns true when page is empty', () => {
      expect(new PaginationHelper([], { offset: 0, limit: 10 }).isEmpty()).toBe(true)
      expect(new PaginationHelper(items, { offset: 0, limit: 10 }).isEmpty()).toBe(false)
    })

    it('getStartIndex and getEndIndex', () => {
      const helper = new PaginationHelper(items, { offset: 10, limit: 5 })
      expect(helper.getStartIndex()).toBe(10)
      expect(helper.getEndIndex()).toBe(15)
    })
  })

  describe('getPaginatedData', () => {
    it('combines items with metadata', () => {
      const helper = new PaginationHelper([1, 2, 3], { offset: 0, limit: 10 })
      const data = helper.getPaginatedData()
      expect(data.items).toEqual([1, 2, 3])
      expect(data.total).toBe(3)
      expect(data.hasMore).toBe(false)
    })

    it('includes additional data', () => {
      const helper = new PaginationHelper([1, 2], { offset: 0, limit: 10 })
      const data = helper.getPaginatedData({ docId: 'abc123' })
      expect(data.items).toEqual([1, 2])
      expect(data.docId).toBe('abc123')
    })
  })

  describe('createPaginationHelper', () => {
    it('applies default offset=0', () => {
      const helper = createPaginationHelper(items, { limit: 5 })
      expect(helper.getMetadata().offset).toBe(0)
    })

    it('applies default limit=100', () => {
      const helper = createPaginationHelper(items, {})
      expect(helper.getMetadata().limit).toBe(100)
    })

    it('uses provided values', () => {
      const helper = createPaginationHelper(items, { offset: 5, limit: 10 })
      expect(helper.getMetadata().offset).toBe(5)
      expect(helper.getMetadata().limit).toBe(10)
    })
  })
})
