import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { ToolContext } from '../../../../src/registry/types.js'
import type { GristClient } from '../../../../src/services/grist-client.js'
import type { SchemaCache } from '../../../../src/services/schema-cache.js'
import { resetSessionAnalytics } from '../../../../src/services/session-analytics.js'
import {
  PaginatedGristTool,
  type PaginatedResponse,
  type PaginationMetadata
} from '../../../../src/tools/base/PaginatedGristTool.js'

// Test item type
interface TestItem {
  id: number
  name: string
  category?: string
  score?: number
}

// Basic paginated tool implementation
class BasicPaginatedTool extends PaginatedGristTool<
  z.ZodObject<{ offset?: z.ZodNumber; limit?: z.ZodNumber }>,
  TestItem
> {
  private items: TestItem[] = []

  constructor(context: ToolContext, items: TestItem[] = []) {
    super(
      context,
      z.object({
        offset: z.number().optional(),
        limit: z.number().optional()
      })
    )
    this.items = items
  }

  protected async fetchItems(_params: z.infer<typeof this.inputSchema>): Promise<TestItem[]> {
    return this.items
  }

  setItems(items: TestItem[]): void {
    this.items = items
  }
}

// Paginated tool with filtering
class FilterablePaginatedTool extends PaginatedGristTool<
  z.ZodObject<{ offset?: z.ZodNumber; limit?: z.ZodNumber; category?: z.ZodString }>,
  TestItem
> {
  private items: TestItem[] = []

  constructor(context: ToolContext, items: TestItem[] = []) {
    super(
      context,
      z.object({
        offset: z.number().optional(),
        limit: z.number().optional(),
        category: z.string().optional()
      })
    )
    this.items = items
  }

  protected async fetchItems(_params: z.infer<typeof this.inputSchema>): Promise<TestItem[]> {
    return this.items
  }

  protected filterItems(items: TestItem[], params: z.infer<typeof this.inputSchema>): TestItem[] {
    if (!params.category) {
      return items
    }
    return items.filter((item) => item.category === params.category)
  }
}

// Paginated tool with sorting
class SortablePaginatedTool extends PaginatedGristTool<
  z.ZodObject<{ offset?: z.ZodNumber; limit?: z.ZodNumber; sortBy?: z.ZodString }>,
  TestItem
> {
  private items: TestItem[] = []

  constructor(context: ToolContext, items: TestItem[] = []) {
    super(
      context,
      z.object({
        offset: z.number().optional(),
        limit: z.number().optional(),
        sortBy: z.string().optional()
      })
    )
    this.items = items
  }

  protected async fetchItems(_params: z.infer<typeof this.inputSchema>): Promise<TestItem[]> {
    return this.items
  }

  protected sortItems(items: TestItem[], params: z.infer<typeof this.inputSchema>): TestItem[] {
    if (params.sortBy === 'name') {
      return [...items].sort((a, b) => a.name.localeCompare(b.name))
    }
    if (params.sortBy === 'score') {
      return [...items].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    }
    return items
  }
}

// Helper to create mock context
const createMockContext = (): ToolContext => ({
  client: {
    get: vi.fn(),
    post: vi.fn()
  } as unknown as GristClient,
  schemaCache: {
    getTableColumns: vi.fn()
  } as unknown as SchemaCache
})

// Helper to create test items
const createTestItems = (count: number): TestItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Item ${i + 1}`,
    category: i % 2 === 0 ? 'even' : 'odd',
    score: (i + 1) * 10
  }))

describe('PaginatedGristTool', () => {
  let context: ToolContext
  let tool: BasicPaginatedTool

  beforeEach(() => {
    resetSessionAnalytics()
    context = createMockContext()
    tool = new BasicPaginatedTool(context)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('paginate()', () => {
    it('paginates items with default offset and limit', () => {
      const items = createTestItems(150)
      const result = tool.paginate(items, {})

      expect(result.items).toHaveLength(100)
      expect(result.pagination.offset).toBe(0)
      expect(result.pagination.limit).toBe(100)
      expect(result.pagination.total).toBe(150)
      expect(result.pagination.hasMore).toBe(true)
      expect(result.pagination.nextOffset).toBe(100)
    })

    it('paginates with custom offset', () => {
      const items = createTestItems(150)
      const result = tool.paginate(items, { offset: 50 })

      expect(result.items).toHaveLength(100)
      expect(result.items[0]?.id).toBe(51) // offset 50 means skip first 50
      expect(result.pagination.offset).toBe(50)
      expect(result.pagination.hasMore).toBe(false)
      expect(result.pagination.nextOffset).toBeNull()
    })

    it('paginates with custom limit', () => {
      const items = createTestItems(150)
      const result = tool.paginate(items, { limit: 25 })

      expect(result.items).toHaveLength(25)
      expect(result.pagination.limit).toBe(25)
      expect(result.pagination.hasMore).toBe(true)
      expect(result.pagination.nextOffset).toBe(25)
    })

    it('paginates with both offset and limit', () => {
      const items = createTestItems(150)
      const result = tool.paginate(items, { offset: 50, limit: 30 })

      expect(result.items).toHaveLength(30)
      expect(result.items[0]?.id).toBe(51)
      expect(result.items[29]?.id).toBe(80)
      expect(result.pagination.offset).toBe(50)
      expect(result.pagination.limit).toBe(30)
      expect(result.pagination.hasMore).toBe(true)
      expect(result.pagination.nextOffset).toBe(80)
    })

    it('handles last page correctly', () => {
      const items = createTestItems(50)
      const result = tool.paginate(items, { offset: 0, limit: 100 })

      expect(result.items).toHaveLength(50)
      expect(result.pagination.hasMore).toBe(false)
      expect(result.pagination.nextOffset).toBeNull()
    })

    it('handles exact page boundary', () => {
      const items = createTestItems(100)
      const result = tool.paginate(items, { offset: 0, limit: 100 })

      expect(result.items).toHaveLength(100)
      expect(result.pagination.hasMore).toBe(false)
      expect(result.pagination.nextOffset).toBeNull()
    })

    it('handles offset beyond items length', () => {
      const items = createTestItems(50)
      const result = tool.paginate(items, { offset: 100 })

      expect(result.items).toHaveLength(0)
      expect(result.pagination.hasMore).toBe(false)
      expect(result.pagination.nextOffset).toBeNull()
    })

    it('handles empty items array', () => {
      const items: TestItem[] = []
      const result = tool.paginate(items, {})

      expect(result.items).toHaveLength(0)
      expect(result.pagination.total).toBe(0)
      expect(result.pagination.hasMore).toBe(false)
      expect(result.pagination.nextOffset).toBeNull()
    })

    it('returns correct pagination metadata', () => {
      const items = createTestItems(250)
      const result = tool.paginate(items, { offset: 100, limit: 50 })

      const metadata: PaginationMetadata = result.pagination
      expect(metadata.total).toBe(250)
      expect(metadata.offset).toBe(100)
      expect(metadata.limit).toBe(50)
      expect(metadata.hasMore).toBe(true)
      expect(metadata.nextOffset).toBe(150)
    })
  })

  describe('getOffset()', () => {
    it('returns 0 by default', () => {
      const offset = tool.getOffset({})
      expect(offset).toBe(0)
    })

    it('returns provided offset', () => {
      const offset = tool.getOffset({ offset: 50 })
      expect(offset).toBe(50)
    })

    it('handles string offset gracefully', () => {
      const offset = tool.getOffset({ offset: '50' as unknown as number })
      expect(offset).toBe(0) // Falls back to default
    })

    it('handles undefined offset', () => {
      const offset = tool.getOffset({ offset: undefined })
      expect(offset).toBe(0)
    })
  })

  describe('getLimit()', () => {
    it('returns 100 by default', () => {
      const limit = tool.getLimit({})
      expect(limit).toBe(100)
    })

    it('returns provided limit', () => {
      const limit = tool.getLimit({ limit: 25 })
      expect(limit).toBe(25)
    })

    it('handles string limit gracefully', () => {
      const limit = tool.getLimit({ limit: '25' as unknown as number })
      expect(limit).toBe(100) // Falls back to default
    })

    it('handles undefined limit', () => {
      const limit = tool.getLimit({ limit: undefined })
      expect(limit).toBe(100)
    })
  })

  describe('filterItems()', () => {
    it('returns all items by default', () => {
      const items = createTestItems(10)
      const filtered = tool.filterItems(items, {})

      expect(filtered).toEqual(items)
      expect(filtered).toHaveLength(10)
    })

    it('can be overridden for custom filtering', () => {
      const filterableTool = new FilterablePaginatedTool(context, createTestItems(10))
      const items = createTestItems(10)
      const filtered = filterableTool.filterItems(items, { category: 'even' })

      expect(filtered).toHaveLength(5)
      expect(filtered.every((item) => item.category === 'even')).toBe(true)
    })

    it('handles empty filter results', () => {
      const filterableTool = new FilterablePaginatedTool(context, createTestItems(10))
      const items = createTestItems(10)
      const filtered = filterableTool.filterItems(items, { category: 'nonexistent' })

      expect(filtered).toHaveLength(0)
    })
  })

  describe('sortItems()', () => {
    it('returns items in original order by default', () => {
      const items = createTestItems(5)
      const sorted = tool.sortItems(items, {})

      expect(sorted).toEqual(items)
    })

    it('can be overridden for custom sorting', () => {
      const sortableTool = new SortablePaginatedTool(context, createTestItems(5))
      const items = [
        { id: 1, name: 'Charlie', score: 30 },
        { id: 2, name: 'Alice', score: 10 },
        { id: 3, name: 'Bob', score: 20 }
      ]
      const sorted = sortableTool.sortItems(items, { sortBy: 'name' })

      expect(sorted[0]?.name).toBe('Alice')
      expect(sorted[1]?.name).toBe('Bob')
      expect(sorted[2]?.name).toBe('Charlie')
    })

    it('does not modify original array', () => {
      const sortableTool = new SortablePaginatedTool(context)
      const items = [
        { id: 1, name: 'Charlie', score: 30 },
        { id: 2, name: 'Alice', score: 10 }
      ]
      const original = [...items]
      sortableTool.sortItems(items, { sortBy: 'name' })

      expect(items).toEqual(original)
    })
  })

  describe('executeInternal()', () => {
    it('executes full pipeline: fetch -> filter -> sort -> paginate', async () => {
      const items = createTestItems(200)
      tool.setItems(items)

      const result = await tool.executeInternal({ offset: 50, limit: 30 })

      expect(result.items).toHaveLength(30)
      expect(result.items[0]?.id).toBe(51)
      expect(result.pagination.total).toBe(200)
      expect(result.pagination.offset).toBe(50)
      expect(result.pagination.limit).toBe(30)
    })

    it('applies filtering before pagination', async () => {
      const items = createTestItems(100)
      const filterableTool = new FilterablePaginatedTool(context, items)

      const result = await filterableTool.executeInternal({ category: 'even', limit: 10 })

      // Should have 50 even items total, return 10
      expect(result.items).toHaveLength(10)
      expect(result.items.every((item) => item.category === 'even')).toBe(true)
      expect(result.pagination.total).toBe(50) // Only even items
    })

    it('applies sorting before pagination', async () => {
      const items = [
        { id: 1, name: 'Zoe', score: 30 },
        { id: 2, name: 'Alice', score: 10 },
        { id: 3, name: 'Mike', score: 20 },
        { id: 4, name: 'Bob', score: 40 }
      ]
      const sortableTool = new SortablePaginatedTool(context, items)

      const result = await sortableTool.executeInternal({ sortBy: 'name', limit: 2 })

      expect(result.items[0]?.name).toBe('Alice')
      expect(result.items[1]?.name).toBe('Bob')
    })

    it('combines filtering, sorting, and pagination', async () => {
      // Create a tool that does all three
      class ComplexPaginatedTool extends PaginatedGristTool<
        z.ZodObject<{
          offset?: z.ZodNumber
          limit?: z.ZodNumber
          category?: z.ZodString
          sortBy?: z.ZodString
        }>,
        TestItem
      > {
        constructor(
          context: ToolContext,
          private items: TestItem[]
        ) {
          super(
            context,
            z.object({
              offset: z.number().optional(),
              limit: z.number().optional(),
              category: z.string().optional(),
              sortBy: z.string().optional()
            })
          )
        }

        protected async fetchItems(): Promise<TestItem[]> {
          return this.items
        }

        protected filterItems(
          items: TestItem[],
          params: z.infer<typeof this.inputSchema>
        ): TestItem[] {
          if (!params.category) return items
          return items.filter((item) => item.category === params.category)
        }

        protected sortItems(
          items: TestItem[],
          params: z.infer<typeof this.inputSchema>
        ): TestItem[] {
          if (params.sortBy === 'name') {
            return [...items].sort((a, b) => a.name.localeCompare(b.name))
          }
          return items
        }
      }

      const items = createTestItems(20)
      const complexTool = new ComplexPaginatedTool(context, items)

      const result = await complexTool.executeInternal({
        category: 'even',
        sortBy: 'name',
        offset: 2,
        limit: 3
      })

      expect(result.items).toHaveLength(3)
      expect(result.items.every((item) => item.category === 'even')).toBe(true)
      // Should be sorted by name
      expect(result.items[0]?.name.localeCompare(result.items[1]?.name ?? '')).toBeLessThan(0)
    })
  })

  describe('supportsFeature()', () => {
    it('returns true for pagination feature', () => {
      expect(tool.supportsFeature('pagination')).toBe(true)
    })

    it('returns false for non-pagination features by default', () => {
      expect(tool.supportsFeature('caching')).toBe(false)
      expect(tool.supportsFeature('filtering')).toBe(false)
    })

    it('can be further overridden by subclasses', () => {
      class ExtendedPaginatedTool extends BasicPaginatedTool {
        protected supportsFeature(feature: 'caching' | 'pagination' | 'filtering'): boolean {
          if (feature === 'filtering') return true
          return super.supportsFeature(feature)
        }
      }

      const extendedTool = new ExtendedPaginatedTool(context)
      expect(extendedTool.supportsFeature('pagination')).toBe(true)
      expect(extendedTool.supportsFeature('filtering')).toBe(true)
      expect(extendedTool.supportsFeature('caching')).toBe(false)
    })
  })

  describe('integration with execute()', () => {
    it('returns properly formatted paginated response', async () => {
      const items = createTestItems(150)
      tool.setItems(items)

      const response = await tool.execute({ offset: 50, limit: 25 })

      expect(response.isError).toBeUndefined()
      expect(response.structuredContent).toBeDefined()
      expect(response.structuredContent).toHaveProperty('items')
      // Pagination fields are flat (total, offset, etc.) for backwards compatibility
      expect(response.structuredContent).toHaveProperty('total')
      expect(response.structuredContent).toHaveProperty('offset')

      const structured = response.structuredContent as {
        items: TestItem[]
        total: number
        offset: number
      }
      expect(structured.items).toHaveLength(25)
      expect(structured.offset).toBe(50)
    })

    it('handles validation errors in pagination params', async () => {
      const response = await tool.execute({ offset: 'invalid' })

      expect(response.isError).toBe(true)
      expect(response.content[0]?.text).toContain('Invalid value for parameter')
    })
  })

  describe('edge cases', () => {
    it('handles very large datasets efficiently', async () => {
      const items = createTestItems(10000)
      tool.setItems(items)

      const start = Date.now()
      const result = await tool.executeInternal({ offset: 5000, limit: 100 })
      const duration = Date.now() - start

      expect(result.items).toHaveLength(100)
      expect(duration).toBeLessThan(100) // Should be fast (array slicing is O(n))
    })

    it('handles single item correctly', async () => {
      const items = createTestItems(1)
      tool.setItems(items)

      const result = await tool.executeInternal({})

      expect(result.items).toHaveLength(1)
      expect(result.pagination.total).toBe(1)
      expect(result.pagination.hasMore).toBe(false)
    })

    it('handles limit larger than dataset', async () => {
      const items = createTestItems(10)
      tool.setItems(items)

      const result = await tool.executeInternal({ limit: 1000 })

      expect(result.items).toHaveLength(10)
      expect(result.pagination.hasMore).toBe(false)
    })

    it('handles offset at exact boundary', async () => {
      const items = createTestItems(100)
      tool.setItems(items)

      const result = await tool.executeInternal({ offset: 100 })

      expect(result.items).toHaveLength(0)
      expect(result.pagination.hasMore).toBe(false)
    })

    it('handles zero limit', async () => {
      const items = createTestItems(100)
      tool.setItems(items)

      const result = await tool.executeInternal({ limit: 0 })

      expect(result.items).toHaveLength(0)
      expect(result.pagination.total).toBe(100)
      expect(result.pagination.hasMore).toBe(true)
    })

    it('handles negative offset gracefully', async () => {
      const items = createTestItems(100)
      tool.setItems(items)

      // Negative offset should be treated as 0 or validated
      const result = await tool.executeInternal({ offset: -10 })

      // Behavior depends on implementation, but should not crash
      expect(result).toBeDefined()
    })
  })

  describe('fetchItems abstract method', () => {
    it('must be implemented by subclasses', () => {
      // This is enforced by TypeScript, but we can verify the pattern
      class CustomFetchTool extends PaginatedGristTool<
        z.ZodObject<Record<string, never>>,
        TestItem
      > {
        private fetchCount = 0

        constructor(context: ToolContext) {
          super(context, z.object({}))
        }

        protected async fetchItems(): Promise<TestItem[]> {
          this.fetchCount++
          return createTestItems(10)
        }

        getFetchCount(): number {
          return this.fetchCount
        }
      }

      const customTool = new CustomFetchTool(context)
      expect(customTool).toBeDefined()
    })

    it('is called once per execute', async () => {
      class TrackingFetchTool extends PaginatedGristTool<
        z.ZodObject<Record<string, never>>,
        TestItem
      > {
        fetchCallCount = 0

        constructor(context: ToolContext) {
          super(context, z.object({}))
        }

        protected async fetchItems(): Promise<TestItem[]> {
          this.fetchCallCount++
          return createTestItems(100)
        }
      }

      const trackingTool = new TrackingFetchTool(context)
      await trackingTool.execute({})

      expect(trackingTool.fetchCallCount).toBe(1)
    })
  })

  describe('type safety', () => {
    it('preserves item type through pipeline', async () => {
      interface CustomItem {
        uuid: string
        data: { nested: number }
      }

      class TypedPaginatedTool extends PaginatedGristTool<
        z.ZodObject<Record<string, never>>,
        CustomItem
      > {
        constructor(context: ToolContext) {
          super(context, z.object({}))
        }

        protected async fetchItems(): Promise<CustomItem[]> {
          return [
            { uuid: 'abc', data: { nested: 123 } },
            { uuid: 'def', data: { nested: 456 } }
          ]
        }
      }

      const typedTool = new TypedPaginatedTool(context)
      const result = await typedTool.executeInternal({})

      expect(result.items[0]?.uuid).toBeDefined()
      expect(result.items[0]?.data.nested).toBeDefined()
    })
  })

  describe('response structure', () => {
    it('returns PaginatedResponse structure', async () => {
      const items = createTestItems(50)
      tool.setItems(items)

      const result: PaginatedResponse<TestItem> = await tool.executeInternal({ limit: 10 })

      expect(result).toHaveProperty('items')
      expect(result).toHaveProperty('pagination')
      expect(Array.isArray(result.items)).toBe(true)
      expect(typeof result.pagination).toBe('object')
    })

    it('includes all pagination metadata fields', async () => {
      const items = createTestItems(50)
      tool.setItems(items)

      const result = await tool.executeInternal({ offset: 10, limit: 15 })

      expect(result.pagination).toHaveProperty('total')
      expect(result.pagination).toHaveProperty('offset')
      expect(result.pagination).toHaveProperty('limit')
      expect(result.pagination).toHaveProperty('hasMore')
      expect(result.pagination).toHaveProperty('nextOffset')
    })
  })
})
