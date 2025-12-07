import type { DocId, TableId } from '../types/advanced.js'
import type { SQLQueryResponse } from '../types.js'
import type { GristClient } from './grist-client.js'

export interface ColumnMetadata {
  id: string
  fields: {
    type: string
    label: string
    isFormula: boolean
    formula?: string
    recalcWhen?: number
  }
}

interface CacheEntry {
  columns: ColumnMetadata[]
  timestamp: number
}

interface TableRefCacheEntry {
  tableRefs: Map<string, number>
  timestamp: number
}

export class SchemaCache {
  private cache: Map<string, CacheEntry> = new Map()
  private tableRefCache: Map<string, TableRefCacheEntry> = new Map()
  private readonly ttl: number
  private readonly maxSize: number = 500
  private cleanupTimer?: NodeJS.Timeout

  constructor(
    private readonly client: GristClient,
    ttlMinutes: number = 5
  ) {
    this.ttl = ttlMinutes * 60 * 1000
    this.startAutoCleanup()
  }

  async getTableColumns(docId: DocId, tableId: TableId): Promise<ColumnMetadata[]> {
    const key = this.createKey(docId, tableId)

    const entry = this.cache.get(key)
    if (entry && !this.isExpired(entry)) {
      return entry.columns
    }

    const columns = await this.fetchColumns(docId, tableId)

    if (this.cache.size >= this.maxSize) {
      this.evictOldest()
    }

    this.cache.set(key, {
      columns,
      timestamp: Date.now()
    })

    return columns
  }

  async getTableRefs(docId: DocId): Promise<Map<string, number>> {
    const cacheKey = `tablerefs:${docId}`

    const entry = this.tableRefCache.get(cacheKey)
    if (entry && !this.isTableRefExpired(entry)) {
      return entry.tableRefs
    }

    const tableRefs = await this.fetchTableRefs(docId)

    const totalSize = this.cache.size + this.tableRefCache.size
    if (totalSize >= this.maxSize) {
      this.evictOldest()
    }

    this.tableRefCache.set(cacheKey, {
      tableRefs,
      timestamp: Date.now()
    })

    return tableRefs
  }

  async getTableRef(docId: DocId, tableName: string): Promise<number | null> {
    const tableRefs = await this.getTableRefs(docId)
    return tableRefs.get(tableName) ?? null
  }

  invalidateCache(docId: DocId, tableId: TableId): void {
    const key = this.createKey(docId, tableId)
    this.cache.delete(key)
  }

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

    this.tableRefCache.delete(`tablerefs:${docId}`)
  }

  clearAll(): void {
    this.cache.clear()
    this.tableRefCache.clear()
  }

  getStats(): {
    columnCache: { size: number; expired: number }
    tableRefCache: { size: number; expired: number }
  } {
    let columnExpired = 0
    for (const entry of this.cache.values()) {
      if (this.isExpired(entry)) {
        columnExpired++
      }
    }

    let tableRefExpired = 0
    for (const entry of this.tableRefCache.values()) {
      if (this.isTableRefExpired(entry)) {
        tableRefExpired++
      }
    }

    return {
      columnCache: {
        size: this.cache.size,
        expired: columnExpired
      },
      tableRefCache: {
        size: this.tableRefCache.size,
        expired: tableRefExpired
      }
    }
  }

  pruneExpired(): number {
    let count = 0

    const columnKeysToDelete: string[] = []
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        columnKeysToDelete.push(key)
      }
    }
    for (const key of columnKeysToDelete) {
      this.cache.delete(key)
      count++
    }

    const tableRefKeysToDelete: string[] = []
    for (const [key, entry] of this.tableRefCache.entries()) {
      if (this.isTableRefExpired(entry)) {
        tableRefKeysToDelete.push(key)
      }
    }
    for (const key of tableRefKeysToDelete) {
      this.tableRefCache.delete(key)
      count++
    }

    return count
  }

  private evictOldest(): void {
    const totalSize = this.cache.size + this.tableRefCache.size
    const entriesToRemove = Math.ceil(totalSize * 0.1)

    const allEntries: Array<{ key: string; timestamp: number; isTableRef: boolean }> = []

    for (const [key, entry] of this.cache.entries()) {
      allEntries.push({ key, timestamp: entry.timestamp, isTableRef: false })
    }

    for (const [key, entry] of this.tableRefCache.entries()) {
      allEntries.push({ key, timestamp: entry.timestamp, isTableRef: true })
    }

    allEntries.sort((a, b) => a.timestamp - b.timestamp)

    for (let i = 0; i < entriesToRemove && i < allEntries.length; i++) {
      const entry = allEntries[i]
      if (entry.isTableRef) {
        this.tableRefCache.delete(entry.key)
      } else {
        this.cache.delete(entry.key)
      }
    }
  }

  private startAutoCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.pruneExpired()
    }, 60000)

    this.cleanupTimer.unref()
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }

  private createKey(docId: DocId, tableId: TableId): string {
    return `${docId}:${tableId}`
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.ttl
  }

  private isTableRefExpired(entry: TableRefCacheEntry): boolean {
    return Date.now() - entry.timestamp > this.ttl
  }

  private async fetchColumns(docId: DocId, tableId: TableId): Promise<ColumnMetadata[]> {
    try {
      const response = await this.client.get<{ columns: ColumnMetadata[] }>(
        `/docs/${docId}/tables/${tableId}/columns`
      )

      return response.columns
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Failed to fetch columns for table "${tableId}" in document "${docId}": ${errorMessage}`
      )
    }
  }

  private async fetchTableRefs(docId: DocId): Promise<Map<string, number>> {
    try {
      const response = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
        sql: 'SELECT id, tableId FROM _grist_Tables ORDER BY tableId',
        args: []
      })

      const tableRefs = new Map<string, number>()
      for (const record of response.records) {
        const rec = record as Record<string, unknown>
        const fields = rec.fields as Record<string, unknown> | undefined
        const tableId = (fields?.tableId || rec.tableId) as string
        const id = (fields?.id || rec.id) as number
        if (tableId && id) {
          tableRefs.set(tableId, id)
        }
      }

      return tableRefs
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch table references for document "${docId}": ${errorMessage}`)
    }
  }
}
