/**
 * Response Cache - TTL-based caching for read operations
 *
 * Implements a simple but effective TTL (time-to-live) cache to:
 * - Reduce repeated API calls for the same data
 * - Improve response times for frequently accessed data
 * - Reduce load on Grist servers
 *
 * Features:
 * - Time-based expiration (TTL)
 * - Automatic cleanup of expired entries
 * - Cache statistics for monitoring
 * - Type-safe generic implementation
 */

/**
 * Cache entry with value and expiration time
 */
interface CacheEntry<T> {
  value: T
  expiresAt: number
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  hits: number
  misses: number
  size: number
  hitRate: number
}

/**
 * Configuration for response cache
 */
export interface ResponseCacheConfig {
  /** Default TTL in milliseconds (default: 60000 = 1 minute) */
  defaultTTL: number
  /** Maximum cache size (number of entries, default: 1000) */
  maxSize: number
  /** Cleanup interval in milliseconds (default: 300000 = 5 minutes) */
  cleanupInterval: number
}

/**
 * TTL-based response cache for read operations
 *
 * Caches responses with automatic expiration and cleanup.
 * Thread-safe for concurrent Node.js operations.
 *
 * @template T - Type of cached values
 *
 * @example
 * ```typescript
 * const cache = new ResponseCache<WorkspaceInfo[]>({ defaultTTL: 60000 })
 *
 * // Try to get from cache
 * const cached = cache.get('/api/workspaces')
 * if (cached) {
 *   return cached
 * }
 *
 * // Fetch and cache
 * const data = await fetchWorkspaces()
 * cache.set('/api/workspaces', data, 120000) // 2 minute TTL
 * return data
 * ```
 */
export class ResponseCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>()
  private config: ResponseCacheConfig
  private cleanupTimer?: NodeJS.Timeout
  private stats = {
    hits: 0,
    misses: 0
  }

  /**
   * Create a new response cache
   *
   * @param config - Optional cache configuration
   */
  constructor(config: Partial<ResponseCacheConfig> = {}) {
    this.config = {
      defaultTTL: config.defaultTTL ?? 60000, // 1 minute default
      maxSize: config.maxSize ?? 1000,
      cleanupInterval: config.cleanupInterval ?? 300000 // 5 minutes
    }

    // Start automatic cleanup
    this.startCleanup()
  }

  /**
   * Get value from cache if not expired
   *
   * @param key - Cache key
   * @returns Cached value or undefined if not found/expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key)

    if (!entry) {
      this.stats.misses++
      return undefined
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this.stats.misses++
      return undefined
    }

    this.stats.hits++
    return entry.value
  }

  /**
   * Set value in cache with TTL
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Optional TTL in milliseconds (uses default if not specified)
   */
  set(key: string, value: T, ttl?: number): void {
    // Enforce max size by removing oldest entries
    if (this.cache.size >= this.config.maxSize) {
      // Remove 10% oldest entries to make room
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

  /**
   * Check if key exists and is not expired
   *
   * @param key - Cache key
   * @returns True if key exists and is valid
   */
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

  /**
   * Delete specific key from cache
   *
   * @param key - Cache key to delete
   * @returns True if key was deleted
   */
  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear()
    this.stats.hits = 0
    this.stats.misses = 0
  }

  /**
   * Get cache statistics
   *
   * @returns Cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0
    }
  }

  /**
   * Remove all expired entries
   *
   * Called automatically on cleanup interval, but can be called manually.
   *
   * @returns Number of entries removed
   */
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

  /**
   * Start automatic cleanup timer
   *
   * @private
   */
  private startCleanup(): void {
    if (this.cleanupTimer) {
      return
    }

    this.cleanupTimer = setInterval(() => {
      const removed = this.cleanup()
      if (removed > 0) {
        // Log cleanup to stderr for debugging
        console.error(`[ResponseCache] Cleaned up ${removed} expired entries`)
      }
    }, this.config.cleanupInterval)

    // Don't keep process alive if only cleanup timer is running
    this.cleanupTimer.unref()
  }

  /**
   * Stop automatic cleanup timer
   *
   * Call this when shutting down to clean up resources.
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }

  /**
   * Get or set pattern (fetch-or-cache)
   *
   * Common pattern: try cache first, fetch if miss, then cache result.
   *
   * @param key - Cache key
   * @param fetcher - Function to fetch value if not cached
   * @param ttl - Optional TTL in milliseconds
   * @returns Cached or freshly fetched value
   *
   * @example
   * ```typescript
   * const data = await cache.getOrSet(
   *   '/api/workspaces',
   *   () => client.get('/workspaces'),
   *   120000 // 2 minute TTL
   * )
   * ```
   */
  async getOrSet(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    // Try cache first
    const cached = this.get(key)
    if (cached !== undefined) {
      return cached
    }

    // Fetch and cache
    const value = await fetcher()
    this.set(key, value, ttl)
    return value
  }

  /**
   * Invalidate cache entries matching a pattern
   *
   * Useful for invalidating related cache entries.
   *
   * @param pattern - RegExp pattern to match keys
   * @returns Number of entries invalidated
   *
   * @example
   * ```typescript
   * // Invalidate all workspace-related cache entries
   * cache.invalidatePattern(/^\/api\/workspaces/)
   * ```
   */
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

  /**
   * Get current cache size (number of entries)
   *
   * @returns Number of cached entries
   */
  get size(): number {
    return this.cache.size
  }
}

/**
 * Create a response cache with default configuration
 *
 * @param config - Optional cache configuration
 * @returns New ResponseCache instance
 */
export function createResponseCache<T = unknown>(
  config?: Partial<ResponseCacheConfig>
): ResponseCache<T> {
  return new ResponseCache<T>(config)
}
