import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResponseCache } from '../../../src/utils/response-cache.js'

describe('ResponseCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('uses default config values when not provided', () => {
      const cache = new ResponseCache()
      cache.set('test', 'value')
      expect(cache.size).toBe(1)
      cache.stopCleanup()
    })

    it('uses custom config values when provided', () => {
      const cache = new ResponseCache({
        defaultTTL: 5000,
        maxSize: 10,
        cleanupInterval: 1000
      })
      cache.set('test', 'value')
      expect(cache.size).toBe(1)
      cache.stopCleanup()
    })
  })

  describe('get', () => {
    it('returns undefined for missing key and increments misses', () => {
      const cache = new ResponseCache()
      const result = cache.get('missing')
      expect(result).toBeUndefined()
      expect(cache.getStats().misses).toBe(1)
      cache.stopCleanup()
    })

    it('returns value for existing key and increments hits', () => {
      const cache = new ResponseCache()
      cache.set('key', 'value')
      const result = cache.get('key')
      expect(result).toBe('value')
      expect(cache.getStats().hits).toBe(1)
      cache.stopCleanup()
    })

    it('returns undefined for expired entry and increments misses', () => {
      const cache = new ResponseCache({ defaultTTL: 1000 })
      cache.set('key', 'value')

      vi.advanceTimersByTime(1001)

      const result = cache.get('key')
      expect(result).toBeUndefined()
      expect(cache.getStats().misses).toBe(1)
      expect(cache.size).toBe(0)
      cache.stopCleanup()
    })
  })

  describe('set', () => {
    it('stores value with default TTL', () => {
      const cache = new ResponseCache({ defaultTTL: 5000 })
      cache.set('key', 'value')

      expect(cache.get('key')).toBe('value')

      vi.advanceTimersByTime(4999)
      expect(cache.get('key')).toBe('value')

      vi.advanceTimersByTime(2)
      expect(cache.get('key')).toBeUndefined()
      cache.stopCleanup()
    })

    it('stores value with custom TTL', () => {
      const cache = new ResponseCache({ defaultTTL: 60000 })
      cache.set('key', 'value', 2000)

      vi.advanceTimersByTime(1999)
      expect(cache.get('key')).toBe('value')

      vi.advanceTimersByTime(2)
      expect(cache.get('key')).toBeUndefined()
      cache.stopCleanup()
    })

    it('evicts oldest entries when maxSize is reached', () => {
      const cache = new ResponseCache({ maxSize: 10, defaultTTL: 60000 })

      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, `value${i}`)
        vi.advanceTimersByTime(10) // Stagger expiration times
      }

      expect(cache.size).toBe(10)

      cache.set('newKey', 'newValue')

      // Should have evicted 10% (1 entry) to make room
      expect(cache.size).toBe(10)
      expect(cache.get('newKey')).toBe('newValue')
      cache.stopCleanup()
    })
  })

  describe('has', () => {
    it('returns false for missing key', () => {
      const cache = new ResponseCache()
      expect(cache.has('missing')).toBe(false)
      cache.stopCleanup()
    })

    it('returns true for existing key', () => {
      const cache = new ResponseCache()
      cache.set('key', 'value')
      expect(cache.has('key')).toBe(true)
      cache.stopCleanup()
    })

    it('returns false and deletes expired entry', () => {
      const cache = new ResponseCache({ defaultTTL: 1000 })
      cache.set('key', 'value')

      vi.advanceTimersByTime(1001)

      expect(cache.has('key')).toBe(false)
      expect(cache.size).toBe(0)
      cache.stopCleanup()
    })
  })

  describe('delete', () => {
    it('returns false for missing key', () => {
      const cache = new ResponseCache()
      expect(cache.delete('missing')).toBe(false)
      cache.stopCleanup()
    })

    it('returns true and removes existing key', () => {
      const cache = new ResponseCache()
      cache.set('key', 'value')
      expect(cache.delete('key')).toBe(true)
      expect(cache.has('key')).toBe(false)
      cache.stopCleanup()
    })
  })

  describe('clear', () => {
    it('removes all entries and resets stats', () => {
      const cache = new ResponseCache()
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.get('key1') // hit
      cache.get('missing') // miss

      cache.clear()

      expect(cache.size).toBe(0)
      expect(cache.getStats()).toEqual({
        hits: 0,
        misses: 0,
        size: 0,
        hitRate: 0
      })
      cache.stopCleanup()
    })
  })

  describe('getStats', () => {
    it('returns correct stats with no operations', () => {
      const cache = new ResponseCache()
      const stats = cache.getStats()
      expect(stats).toEqual({
        hits: 0,
        misses: 0,
        size: 0,
        hitRate: 0
      })
      cache.stopCleanup()
    })

    it('calculates hit rate correctly', () => {
      const cache = new ResponseCache()
      cache.set('key', 'value')
      cache.get('key') // hit
      cache.get('key') // hit
      cache.get('key') // hit
      cache.get('missing') // miss

      const stats = cache.getStats()
      expect(stats.hits).toBe(3)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBe(0.75)
      cache.stopCleanup()
    })
  })

  describe('cleanup', () => {
    it('removes expired entries and returns count', () => {
      const cache = new ResponseCache({ defaultTTL: 1000 })
      cache.set('key1', 'value1', 500)
      cache.set('key2', 'value2', 1500)
      cache.set('key3', 'value3', 2000)

      vi.advanceTimersByTime(1000)

      const removed = cache.cleanup()
      expect(removed).toBe(1)
      expect(cache.size).toBe(2)
      cache.stopCleanup()
    })

    it('returns 0 when no entries expired', () => {
      const cache = new ResponseCache({ defaultTTL: 60000 })
      cache.set('key', 'value')

      const removed = cache.cleanup()
      expect(removed).toBe(0)
      cache.stopCleanup()
    })
  })

  describe('stopCleanup', () => {
    it('stops the cleanup interval', () => {
      const cache = new ResponseCache({ cleanupInterval: 1000 })
      cache.set('key', 'value', 500)

      cache.stopCleanup()

      vi.advanceTimersByTime(5000)
      // Entry should still exist because cleanup was stopped (manual cleanup would remove it)
      // But the automatic interval-based cleanup won't run
    })

    it('handles being called multiple times', () => {
      const cache = new ResponseCache()
      cache.stopCleanup()
      cache.stopCleanup() // Should not throw
    })
  })

  describe('getOrSet', () => {
    it('returns cached value if exists', async () => {
      const cache = new ResponseCache()
      cache.set('key', 'cached')
      const fetcher = vi.fn().mockResolvedValue('fetched')

      const result = await cache.getOrSet('key', fetcher)

      expect(result).toBe('cached')
      expect(fetcher).not.toHaveBeenCalled()
      cache.stopCleanup()
    })

    it('fetches and caches value if not exists', async () => {
      const cache = new ResponseCache()
      const fetcher = vi.fn().mockResolvedValue('fetched')

      const result = await cache.getOrSet('key', fetcher)

      expect(result).toBe('fetched')
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(cache.get('key')).toBe('fetched')
      cache.stopCleanup()
    })

    it('uses custom TTL when provided', async () => {
      const cache = new ResponseCache({ defaultTTL: 60000 })
      const fetcher = vi.fn().mockResolvedValue('fetched')

      await cache.getOrSet('key', fetcher, 1000)

      vi.advanceTimersByTime(1001)
      expect(cache.get('key')).toBeUndefined()
      cache.stopCleanup()
    })
  })

  describe('invalidatePattern', () => {
    it('removes entries matching pattern', () => {
      const cache = new ResponseCache()
      cache.set('doc/123/records', 'data1')
      cache.set('doc/123/tables', 'data2')
      cache.set('doc/456/records', 'data3')
      cache.set('workspace/1', 'data4')

      const invalidated = cache.invalidatePattern(/^doc\/123/)

      expect(invalidated).toBe(2)
      expect(cache.size).toBe(2)
      expect(cache.has('doc/123/records')).toBe(false)
      expect(cache.has('doc/123/tables')).toBe(false)
      expect(cache.has('doc/456/records')).toBe(true)
      expect(cache.has('workspace/1')).toBe(true)
      cache.stopCleanup()
    })

    it('returns 0 when no entries match', () => {
      const cache = new ResponseCache()
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      const invalidated = cache.invalidatePattern(/^notfound/)

      expect(invalidated).toBe(0)
      expect(cache.size).toBe(2)
      cache.stopCleanup()
    })
  })

  describe('size', () => {
    it('returns current cache size', () => {
      const cache = new ResponseCache()
      expect(cache.size).toBe(0)

      cache.set('key1', 'value1')
      expect(cache.size).toBe(1)

      cache.set('key2', 'value2')
      expect(cache.size).toBe(2)

      cache.delete('key1')
      expect(cache.size).toBe(1)
      cache.stopCleanup()
    })
  })

  describe('automatic cleanup', () => {
    it('runs cleanup at configured interval', () => {
      const cache = new ResponseCache({ cleanupInterval: 1000, defaultTTL: 500 })
      cache.set('key', 'value')

      vi.advanceTimersByTime(999)
      expect(cache.size).toBe(1)

      vi.advanceTimersByTime(2)
      // Cleanup should have run and removed expired entry
      expect(cache.size).toBe(0)
      cache.stopCleanup()
    })
  })
})
