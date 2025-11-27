import type { z } from 'zod'
import { GristTool } from './GristTool.js'

export interface PaginationMetadata {
  total: number
  offset: number
  limit: number
  has_more: boolean
  next_offset: number | null
}

export interface PaginatedResponse<TItem> {
  items: TItem[]
  pagination: PaginationMetadata
}

export abstract class PaginatedGristTool<
  TInput extends z.ZodTypeAny,
  TItem,
  TOutput = PaginatedResponse<TItem>
> extends GristTool<TInput, TOutput> {
  protected abstract fetchItems(params: z.infer<TInput>): Promise<TItem[]>

  protected paginate(items: TItem[], params: z.infer<TInput>): PaginatedResponse<TItem> {
    const offset = this.getOffset(params)
    const limit = this.getLimit(params)
    const total = items.length

    const paginatedItems = items.slice(offset, offset + limit)
    const hasMore = offset + limit < total

    return {
      items: paginatedItems,
      pagination: {
        total,
        offset,
        limit,
        has_more: hasMore,
        next_offset: hasMore ? offset + limit : null
      }
    }
  }

  protected getOffset(params: z.infer<TInput>): number {
    const paramsRecord = params as Record<string, unknown>
    const offset = paramsRecord.offset
    return typeof offset === 'number' ? offset : 0
  }

  protected getLimit(params: z.infer<TInput>): number {
    const paramsRecord = params as Record<string, unknown>
    const limit = paramsRecord.limit
    return typeof limit === 'number' ? limit : 100
  }

  protected filterItems(items: TItem[], _params: z.infer<TInput>): TItem[] {
    return items
  }

  protected sortItems(items: TItem[], _params: z.infer<TInput>): TItem[] {
    return items
  }

  protected async executeInternal(params: z.infer<TInput>): Promise<TOutput> {
    let items = await this.fetchItems(params)
    items = this.filterItems(items, params)
    items = this.sortItems(items, params)
    return this.paginate(items, params) as TOutput
  }

  protected supportsFeature(feature: 'caching' | 'pagination' | 'filtering'): boolean {
    if (feature === 'pagination') return true
    return super.supportsFeature(feature)
  }
}

export type PaginatedToolItem<T extends PaginatedGristTool<z.ZodTypeAny, unknown, unknown>> =
  T extends PaginatedGristTool<z.ZodTypeAny, infer TItem, unknown> ? TItem : never
