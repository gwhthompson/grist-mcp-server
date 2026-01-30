import type { DocId, TableId } from '../types/advanced.js'
import type { SQLQueryResponse } from '../types.js'
import type { GristClient } from './grist-client.js'

/**
 * Detect Cloudflare Workers runtime (stateless - timers don't make sense).
 * Workers create fresh instances per request, so cleanup timers are wasteful.
 */
function isWorkersRuntime(): boolean {
  // Workers don't have process.versions; Node.js does
  return typeof process === 'undefined' || !('versions' in process)
}

export interface ColumnMetadata {
  id: string
  fields: {
    type: string
    label: string
    isFormula: boolean
    formula?: string
    recalcWhen?: number
    /** Widget options as JSON string (e.g., contains choices for Choice columns) */
    widgetOptions?: string
    /** Numeric column reference for visibleCol lookups */
    visibleCol?: number
  }
}

/**
 * Parsed widget options for Choice/ChoiceList columns.
 * Extracted from widgetOptions JSON string.
 */
export interface ParsedChoiceOptions {
  choices?: string[]
  choiceOptions?: Record<string, unknown>
}

/**
 * Parses widgetOptions JSON string to extract choice values.
 * @returns ParsedChoiceOptions or undefined if parsing fails or no choices
 */
export function parseChoiceOptions(
  widgetOptions: string | undefined
): ParsedChoiceOptions | undefined {
  if (!widgetOptions) return undefined
  try {
    const parsed = JSON.parse(widgetOptions) as ParsedChoiceOptions
    return parsed.choices ? parsed : undefined
  } catch {
    return undefined
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

/**
 * Section/widget metadata for link validation.
 * Fetched fresh each time (not cached) - Grist query latency is
 * negligible compared to LLM round-trip time.
 */
export interface SectionInfo {
  /** Section ID (unique widget identifier) */
  sectionId: number
  /** Parent view ID (page) */
  viewId: number
  /** Table this widget displays */
  tableId: string
  /** Widget type: record, detail, chart, custom, form */
  widgetType: string
  /** Widget title (may be empty) */
  title: string
  /** For summary widgets: the source table ref */
  summarySourceTable?: number
  /** Link source section ID (if linked) */
  linkSrcSectionRef?: number
  /** Link source column ID (if linked) */
  linkSrcColRef?: number
  /** Link target column ID (if linked) */
  linkTargetColRef?: number
}

export class SchemaCache {
  private cache: Map<string, CacheEntry> = new Map()
  private tableRefCache: Map<string, TableRefCacheEntry> = new Map()
  private readonly ttl: number
  private readonly maxSize: number = 500
  private cleanupTimer?: ReturnType<typeof setInterval>

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

  /**
   * Gets sections (widgets) on a specific page.
   * Always fetches fresh - Grist query latency (~20-50ms) is negligible
   * compared to LLM round-trip time (1-5s).
   */
  getPageSections(docId: DocId, viewId: number): Promise<SectionInfo[]> {
    return this.fetchPageSections(docId, viewId)
  }

  /**
   * Gets a specific section by ID, checking if it exists on the given page.
   * Returns undefined if section doesn't exist on this page.
   */
  async getSection(
    docId: DocId,
    viewId: number,
    sectionId: number
  ): Promise<SectionInfo | undefined> {
    const sections = await this.getPageSections(docId, viewId)
    return sections.find((s) => s.sectionId === sectionId)
  }

  /**
   * Fetches row IDs from a table for Ref validation.
   * Uses SQL for performance (10x faster than records API at scale).
   * Does NOT cache - always returns fresh data for validation accuracy.
   */
  async getRowIds(docId: DocId, tableId: TableId): Promise<Set<number>> {
    try {
      const response = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
        sql: `SELECT id FROM "${tableId}"`,
        args: []
      })

      const rowIds = new Set<number>()
      for (const record of response.records) {
        const rec = record as Record<string, unknown>
        const fields = rec.fields as Record<string, unknown> | undefined
        const id = (fields?.id ?? rec.id) as number | undefined
        if (typeof id === 'number') {
          rowIds.add(id)
        }
      }

      return rowIds
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Failed to fetch row IDs for table "${tableId}" in document "${docId}": ${errorMessage}`
      )
    }
  }

  /**
   * Fetches fresh column metadata directly from API (bypasses cache).
   * Use for validation when you need the latest widgetOptions.
   */
  getFreshColumns(docId: DocId, tableId: TableId): Promise<ColumnMetadata[]> {
    return this.fetchColumns(docId, tableId)
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

    const allEntries: Array<{ key: string; timestamp: number; cacheType: 'column' | 'tableRef' }> =
      []

    for (const [key, entry] of this.cache.entries()) {
      allEntries.push({ key, timestamp: entry.timestamp, cacheType: 'column' })
    }

    for (const [key, entry] of this.tableRefCache.entries()) {
      allEntries.push({ key, timestamp: entry.timestamp, cacheType: 'tableRef' })
    }

    allEntries.sort((a, b) => a.timestamp - b.timestamp)

    for (let i = 0; i < entriesToRemove && i < allEntries.length; i++) {
      const entry = allEntries[i] as {
        key: string
        timestamp: number
        cacheType: 'column' | 'tableRef'
      }
      switch (entry.cacheType) {
        case 'column':
          this.cache.delete(entry.key)
          break
        case 'tableRef':
          this.tableRefCache.delete(entry.key)
          break
      }
    }
  }

  private startAutoCleanup(): void {
    // Skip timer in Workers - stateless runtime creates fresh instances per request
    if (isWorkersRuntime()) {
      return
    }

    this.cleanupTimer = setInterval(() => {
      this.pruneExpired()
    }, 60000)

    // unref() prevents timer from keeping Node.js process alive
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref()
    }
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

  /**
   * Fetches sections (widgets) on a specific page via SQL.
   * Joins with _grist_Tables to get tableId string.
   */
  private async fetchPageSections(docId: DocId, viewId: number): Promise<SectionInfo[]> {
    try {
      const response = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
        sql: `
          SELECT
            s.id as sectionId,
            s.parentId as viewId,
            t.tableId as tableId,
            s.parentKey as widgetType,
            s.title as title,
            s.summarySourceTable as summarySourceTable,
            s.linkSrcSectionRef as linkSrcSectionRef,
            s.linkSrcColRef as linkSrcColRef,
            s.linkTargetColRef as linkTargetColRef
          FROM _grist_Views_section s
          LEFT JOIN _grist_Tables t ON s.tableRef = t.id
          WHERE s.parentId = ?
          ORDER BY s.id
        `,
        args: [viewId]
      })

      const sections: SectionInfo[] = []
      for (const record of response.records) {
        const rec = record as Record<string, unknown>
        const fields = (rec.fields as Record<string, unknown> | undefined) ?? rec

        sections.push({
          sectionId: fields.sectionId as number,
          viewId: fields.viewId as number,
          tableId: (fields.tableId as string) ?? '',
          widgetType: (fields.widgetType as string) ?? 'record',
          title: (fields.title as string) ?? '',
          summarySourceTable: fields.summarySourceTable as number | undefined,
          linkSrcSectionRef: fields.linkSrcSectionRef as number | undefined,
          linkSrcColRef: fields.linkSrcColRef as number | undefined,
          linkTargetColRef: fields.linkTargetColRef as number | undefined
        })
      }

      return sections
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Failed to fetch sections for page ${viewId} in document "${docId}": ${errorMessage}`
      )
    }
  }
}
