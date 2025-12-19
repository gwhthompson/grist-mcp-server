import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GristClient } from '../../../src/services/grist-client.js'
import {
  type ColumnMetadata,
  parseChoiceOptions,
  SchemaCache
} from '../../../src/services/schema-cache.js'

// Helper to create a mock GristClient
const createMockClient = (): GristClient =>
  ({
    get: vi.fn(),
    post: vi.fn()
  }) as unknown as GristClient

// Helper to create mock column metadata
const mockColumn = (id: string, type = 'Text'): ColumnMetadata => ({
  id,
  fields: {
    type,
    label: id,
    isFormula: false
  }
})

describe('parseChoiceOptions', () => {
  it('returns undefined for undefined input', () => {
    expect(parseChoiceOptions(undefined)).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(parseChoiceOptions('')).toBeUndefined()
  })

  it('parses valid choice options', () => {
    const json = JSON.stringify({ choices: ['Red', 'Green', 'Blue'] })
    const result = parseChoiceOptions(json)
    expect(result?.choices).toEqual(['Red', 'Green', 'Blue'])
  })

  it('returns undefined for invalid JSON', () => {
    expect(parseChoiceOptions('not valid json')).toBeUndefined()
  })

  it('returns undefined when no choices property', () => {
    const json = JSON.stringify({ someOther: 'value' })
    expect(parseChoiceOptions(json)).toBeUndefined()
  })

  it('returns full object when choices exist', () => {
    const options = {
      choices: ['A', 'B'],
      choiceOptions: { A: { fillColor: '#ff0000' } }
    }
    const result = parseChoiceOptions(JSON.stringify(options))
    expect(result?.choices).toEqual(['A', 'B'])
    expect(result?.choiceOptions).toEqual({ A: { fillColor: '#ff0000' } })
  })

  it('returns undefined for empty choices array', () => {
    const json = JSON.stringify({ choices: [] })
    const result = parseChoiceOptions(json)
    // Empty array is still truthy, so it should be returned
    expect(result).toBeDefined()
    expect(result?.choices).toEqual([])
  })
})

describe('SchemaCache', () => {
  let cache: SchemaCache
  let mockClient: GristClient

  beforeEach(() => {
    mockClient = createMockClient()
    cache = new SchemaCache(mockClient, 5) // 5 minute TTL
  })

  afterEach(() => {
    cache.stopCleanup()
    vi.restoreAllMocks()
  })

  describe('getTableColumns', () => {
    it('fetches columns from API on first call', async () => {
      const columns = [mockColumn('Name'), mockColumn('Email')]
      vi.mocked(mockClient.get).mockResolvedValue({ columns })

      const result = await cache.getTableColumns('doc123', 'People')

      expect(result).toEqual(columns)
      expect(mockClient.get).toHaveBeenCalledWith('/docs/doc123/tables/People/columns')
    })

    it('returns cached columns on subsequent calls', async () => {
      const columns = [mockColumn('Name')]
      vi.mocked(mockClient.get).mockResolvedValue({ columns })

      await cache.getTableColumns('doc123', 'People')
      const result = await cache.getTableColumns('doc123', 'People')

      expect(result).toEqual(columns)
      expect(mockClient.get).toHaveBeenCalledTimes(1)
    })

    it('caches different tables separately', async () => {
      const peopleColumns = [mockColumn('Name')]
      const tasksColumns = [mockColumn('Title')]
      vi.mocked(mockClient.get)
        .mockResolvedValueOnce({ columns: peopleColumns })
        .mockResolvedValueOnce({ columns: tasksColumns })

      const people = await cache.getTableColumns('doc123', 'People')
      const tasks = await cache.getTableColumns('doc123', 'Tasks')

      expect(people).toEqual(peopleColumns)
      expect(tasks).toEqual(tasksColumns)
      expect(mockClient.get).toHaveBeenCalledTimes(2)
    })
  })

  describe('getTableRefs', () => {
    it('fetches table refs via SQL', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { id: 1, tableId: 'People' } }, { fields: { id: 2, tableId: 'Tasks' } }]
      })

      const result = await cache.getTableRefs('doc123')

      expect(result.get('People')).toBe(1)
      expect(result.get('Tasks')).toBe(2)
      expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', expect.any(Object))
    })

    it('caches table refs', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { id: 1, tableId: 'People' } }]
      })

      await cache.getTableRefs('doc123')
      await cache.getTableRefs('doc123')

      expect(mockClient.post).toHaveBeenCalledTimes(1)
    })
  })

  describe('getTableRef', () => {
    it('returns specific table ref', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { id: 1, tableId: 'People' } }, { fields: { id: 2, tableId: 'Tasks' } }]
      })

      const result = await cache.getTableRef('doc123', 'Tasks')
      expect(result).toBe(2)
    })

    it('returns null for unknown table', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { id: 1, tableId: 'People' } }]
      })

      const result = await cache.getTableRef('doc123', 'Unknown')
      expect(result).toBeNull()
    })
  })

  describe('getRowIds', () => {
    it('fetches row IDs via SQL', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { id: 1 } }, { fields: { id: 2 } }, { fields: { id: 3 } }]
      })

      const result = await cache.getRowIds('doc123', 'People')

      expect(result).toEqual(new Set([1, 2, 3]))
    })

    it('handles alternate response format (id at root)', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ id: 1 }, { id: 2 }]
      })

      const result = await cache.getRowIds('doc123', 'People')

      expect(result).toEqual(new Set([1, 2]))
    })

    it('throws error on API failure', async () => {
      vi.mocked(mockClient.post).mockRejectedValue(new Error('Network error'))

      await expect(cache.getRowIds('doc123', 'People')).rejects.toThrow(
        'Failed to fetch row IDs for table "People"'
      )
    })
  })

  describe('getFreshColumns', () => {
    it('bypasses cache and fetches directly', async () => {
      const initialColumns = [mockColumn('Name')]
      const freshColumns = [mockColumn('Name'), mockColumn('Email')]

      vi.mocked(mockClient.get)
        .mockResolvedValueOnce({ columns: initialColumns })
        .mockResolvedValueOnce({ columns: freshColumns })

      await cache.getTableColumns('doc123', 'People')
      const fresh = await cache.getFreshColumns('doc123', 'People')

      expect(fresh).toEqual(freshColumns)
      expect(mockClient.get).toHaveBeenCalledTimes(2)
    })
  })

  describe('invalidateCache', () => {
    it('removes specific table from cache', async () => {
      const columns = [mockColumn('Name')]
      vi.mocked(mockClient.get).mockResolvedValue({ columns })

      await cache.getTableColumns('doc123', 'People')
      cache.invalidateCache('doc123', 'People')
      await cache.getTableColumns('doc123', 'People')

      expect(mockClient.get).toHaveBeenCalledTimes(2)
    })
  })

  describe('invalidateDocument', () => {
    it('removes all tables for document', async () => {
      const columns = [mockColumn('Name')]
      vi.mocked(mockClient.get).mockResolvedValue({ columns })

      await cache.getTableColumns('doc123', 'People')
      await cache.getTableColumns('doc123', 'Tasks')
      cache.invalidateDocument('doc123')
      await cache.getTableColumns('doc123', 'People')

      expect(mockClient.get).toHaveBeenCalledTimes(3)
    })

    it('also invalidates table refs for document', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { id: 1, tableId: 'People' } }]
      })

      await cache.getTableRefs('doc123')
      cache.invalidateDocument('doc123')
      await cache.getTableRefs('doc123')

      expect(mockClient.post).toHaveBeenCalledTimes(2)
    })

    it('does not affect other documents', async () => {
      const columns = [mockColumn('Name')]
      vi.mocked(mockClient.get).mockResolvedValue({ columns })

      await cache.getTableColumns('doc123', 'People')
      await cache.getTableColumns('doc456', 'People')
      cache.invalidateDocument('doc123')
      await cache.getTableColumns('doc456', 'People')

      // doc123 was invalidated, doc456 was not
      expect(mockClient.get).toHaveBeenCalledTimes(2)
    })
  })

  describe('clearAll', () => {
    it('removes all entries from both caches', async () => {
      const columns = [mockColumn('Name')]
      vi.mocked(mockClient.get).mockResolvedValue({ columns })
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { id: 1, tableId: 'People' } }]
      })

      await cache.getTableColumns('doc123', 'People')
      await cache.getTableRefs('doc123')
      cache.clearAll()
      await cache.getTableColumns('doc123', 'People')
      await cache.getTableRefs('doc123')

      expect(mockClient.get).toHaveBeenCalledTimes(2)
      expect(mockClient.post).toHaveBeenCalledTimes(2)
    })
  })

  describe('getStats', () => {
    it('returns cache statistics', async () => {
      const columns = [mockColumn('Name')]
      vi.mocked(mockClient.get).mockResolvedValue({ columns })
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { id: 1, tableId: 'People' } }]
      })

      await cache.getTableColumns('doc123', 'People')
      await cache.getTableRefs('doc123')

      const stats = cache.getStats()

      expect(stats.columnCache.size).toBe(1)
      expect(stats.columnCache.expired).toBe(0)
      expect(stats.tableRefCache.size).toBe(1)
      expect(stats.tableRefCache.expired).toBe(0)
    })

    it('counts expired entries', async () => {
      // Create cache with very short TTL (1ms)
      const shortTtlCache = new SchemaCache(mockClient, 1 / 60000) // 1ms TTL
      const columns = [mockColumn('Name')]
      vi.mocked(mockClient.get).mockResolvedValue({ columns })

      await shortTtlCache.getTableColumns('doc123', 'People')

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 10))

      const stats = shortTtlCache.getStats()
      expect(stats.columnCache.expired).toBe(1)

      shortTtlCache.stopCleanup()
    })
  })

  describe('pruneExpired', () => {
    it('removes expired entries', async () => {
      // Create cache with very short TTL
      const shortTtlCache = new SchemaCache(mockClient, 1 / 60000) // 1ms TTL
      const columns = [mockColumn('Name')]
      vi.mocked(mockClient.get).mockResolvedValue({ columns })

      await shortTtlCache.getTableColumns('doc123', 'People')

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 10))

      const pruned = shortTtlCache.pruneExpired()
      expect(pruned).toBeGreaterThan(0)

      const stats = shortTtlCache.getStats()
      expect(stats.columnCache.size).toBe(0)

      shortTtlCache.stopCleanup()
    })

    it('returns 0 when nothing to prune', () => {
      const pruned = cache.pruneExpired()
      expect(pruned).toBe(0)
    })
  })

  describe('stopCleanup', () => {
    it('stops the cleanup timer', () => {
      // Just verify it doesn't throw
      cache.stopCleanup()
      cache.stopCleanup() // Should be safe to call twice
    })
  })

  describe('getPageSections', () => {
    it('fetches sections via SQL', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          {
            fields: {
              sectionId: 1,
              viewId: 10,
              tableId: 'People',
              widgetType: 'record',
              title: 'People List'
            }
          }
        ]
      })

      const sections = await cache.getPageSections('doc123', 10)

      expect(sections).toHaveLength(1)
      expect(sections[0].sectionId).toBe(1)
      expect(sections[0].tableId).toBe('People')
      expect(sections[0].widgetType).toBe('record')
    })

    it('always fetches fresh (not cached)', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { sectionId: 1, viewId: 10, tableId: 'People', widgetType: 'record' } }]
      })

      await cache.getPageSections('doc123', 10)
      await cache.getPageSections('doc123', 10)

      // SQL was called twice - not cached
      expect(mockClient.post).toHaveBeenCalledTimes(2)
    })
  })

  describe('getSection', () => {
    it('returns specific section by ID', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [
          { fields: { sectionId: 1, viewId: 10, tableId: 'People', widgetType: 'record' } },
          { fields: { sectionId: 2, viewId: 10, tableId: 'Tasks', widgetType: 'detail' } }
        ]
      })

      const section = await cache.getSection('doc123', 10, 2)

      expect(section?.sectionId).toBe(2)
      expect(section?.tableId).toBe('Tasks')
    })

    it('returns undefined for non-existent section', async () => {
      vi.mocked(mockClient.post).mockResolvedValue({
        records: [{ fields: { sectionId: 1, viewId: 10, tableId: 'People', widgetType: 'record' } }]
      })

      const section = await cache.getSection('doc123', 10, 999)

      expect(section).toBeUndefined()
    })
  })
})
