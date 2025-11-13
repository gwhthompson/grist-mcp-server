import type { DocId, TableId } from '../types/advanced.js'
import type { GristClient } from './grist-client.js'

/**
 * Column metadata from Grist API
 */
export interface ColumnMetadata {
  id: string
  fields: {
    type: string
    label: string
    isFormula: boolean
    formula?: string
    recalcWhen?: number
    // Add other fields as needed
  }
}

/**
 * Cache entry structure
 */
interface CacheEntry {
  columns: ColumnMetadata[]
  timestamp: number
}

/**
 * Schema Cache Service
 *
 * Caches table column metadata to reduce API calls during validation.
 * Automatically invalidates cache after TTL or on explicit invalidation.
 *
 * Usage:
 * ```typescript
 * const cache = new SchemaCache(client)
 * const columns = await cache.getTableColumns(docId, tableId)
 * await cache.invalidateCache(docId, tableId)
 * ```
 */
export class SchemaCache {
  private cache: Map<string, CacheEntry> = new Map()
  private readonly ttl: number

  /**
   * Creates a new schema cache
   *
   * @param client - Grist client for API calls
   * @param ttlMinutes - Cache TTL in minutes (default: 5)
   */
  constructor(
    private readonly client: GristClient,
    ttlMinutes: number = 5
  ) {
    this.ttl = ttlMinutes * 60 * 1000 // Convert to milliseconds
  }

  /**
   * Gets table columns from cache or fetches from API
   *
   * @param docId - Document ID
   * @param tableId - Table ID
   * @returns Array of column metadata
   */
  async getTableColumns(docId: DocId, tableId: TableId): Promise<ColumnMetadata[]> {
    const key = this.createKey(docId, tableId)

    // Check cache
    const entry = this.cache.get(key)
    if (entry && !this.isExpired(entry)) {
      return entry.columns
    }

    // Fetch from API
    const columns = await this.fetchColumns(docId, tableId)

    // Store in cache
    this.cache.set(key, {
      columns,
      timestamp: Date.now()
    })

    return columns
  }

  /**
   * Invalidates cache for a specific table
   *
   * @param docId - Document ID
   * @param tableId - Table ID
   */
  invalidateCache(docId: DocId, tableId: TableId): void {
    const key = this.createKey(docId, tableId)
    this.cache.delete(key)
  }

  /**
   * Invalidates all cached schemas for a document
   *
   * @param docId - Document ID
   */
  invalidateDocument(docId: DocId): void {
    const keysToDelete: string[] = []

    for (const key of this.cache.keys()) {
      if (key.startsWith(`${docId}:`)) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key)
    }
  }

  /**
   * Clears entire cache
   */
  clearAll(): void {
    this.cache.clear()
  }

  /**
   * Gets cache statistics
   *
   * @returns Cache size and expired entry count
   */
  getStats(): { size: number; expired: number } {
    let expired = 0

    for (const entry of this.cache.values()) {
      if (this.isExpired(entry)) {
        expired++
      }
    }

    return {
      size: this.cache.size,
      expired
    }
  }

  /**
   * Removes expired entries from cache
   *
   * @returns Number of entries removed
   */
  pruneExpired(): number {
    const keysToDelete: string[] = []

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key)
    }
    return keysToDelete.length
  }

  /**
   * Creates cache key from doc and table IDs
   */
  private createKey(docId: DocId, tableId: TableId): string {
    return `${docId}:${tableId}`
  }

  /**
   * Checks if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.ttl
  }

  /**
   * Fetches columns from Grist API
   */
  private async fetchColumns(docId: DocId, tableId: TableId): Promise<ColumnMetadata[]> {
    try {
      const response = await this.client.get<{ columns: ColumnMetadata[] }>(
        `/docs/${docId}/tables/${tableId}/columns`
      )

      return response.columns
    } catch (error) {
      // If table doesn't exist or other API error, throw with context
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Failed to fetch columns for table "${tableId}" in document "${docId}": ${errorMessage}`
      )
    }
  }
}

/**
 * Global schema cache instance
 * Can be replaced with dependency injection in tests
 */
let globalCache: SchemaCache | null = null

/**
 * Gets or creates the global schema cache instance
 *
 * @param client - Grist client
 * @returns Global cache instance
 */
export function getSchemaCache(client: GristClient): SchemaCache {
  if (!globalCache) {
    globalCache = new SchemaCache(client)
  }
  return globalCache
}

/**
 * Sets the global schema cache instance (for testing)
 *
 * @param cache - Cache instance or null to reset
 */
export function setSchemaCache(cache: SchemaCache | null): void {
  globalCache = cache
}
