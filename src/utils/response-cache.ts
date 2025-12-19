// TTL-based cache for read operations with automatic expiration
import { sharedLogger } from './shared-logger.js'

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export interface CacheStats {
  hits: number
  misses: number
  size: number
  hitRate: number
}

export interface ResponseCacheConfig {
  defaultTTL: number
  maxSize: number
  cleanupInterval: number
}

export class ResponseCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>()
  private config: ResponseCacheConfig
  private cleanupTimer?: NodeJS.Timeout
  private stats = {
    hits: 0,
    misses: 0
  }

  constructor(config: Partial<ResponseCacheConfig> = {}) {
    this.config = {
      defaultTTL: config.defaultTTL ?? 60000,
      maxSize: config.maxSize ?? 1000,
      cleanupInterval: config.cleanupInterval ?? 300000
    }

    this.startCleanup()
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key)

    if (!entry) {
      this.stats.misses++
      return undefined
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this.stats.misses++
      return undefined
    }

    this.stats.hits++
    return entry.value
  }

  set(key: string, value: T, ttl?: number): void {
    if (this.cache.size >= this.config.maxSize) {
      const entriesToRemove = Math.ceil(this.config.maxSize * 0.1)
      const entries = Array.from(this.cache.entries())
      entries
        .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
        .slice(0, entriesToRemove)
        .forEach(([key]) => {
          this.cache.delete(key)
        })
    }

    const expiresAt = Date.now() + (ttl ?? this.config.defaultTTL)
    this.cache.set(key, { value, expiresAt })
  }

  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) {
      return false
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
    this.stats.hits = 0
    this.stats.misses = 0
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0
    }
  }

  cleanup(): number {
    const now = Date.now()
    let removed = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        removed++
      }
    }

    return removed
  }

  private startCleanup(): void {
    if (this.cleanupTimer) {
      return
    }

    this.cleanupTimer = setInterval(() => {
      const removed = this.cleanup()
      if (removed > 0) {
        sharedLogger.debug(`ResponseCache cleaned up ${removed} expired entries`)
      }
    }, this.config.cleanupInterval)

    this.cleanupTimer.unref()
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }

  async getOrSet(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key)
    if (cached !== undefined) {
      return cached
    }

    const value = await fetcher()
    this.set(key, value, ttl)
    return value
  }

  invalidatePattern(pattern: RegExp): number {
    let invalidated = 0

    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key)
        invalidated++
      }
    }

    return invalidated
  }

  get size(): number {
    return this.cache.size
  }
}
