import type { z } from 'zod'
import { truncateIfNeeded } from '../../services/formatter.js'
import type { MCPToolResponse, ResponseFormat } from '../../types.js'
import { GristTool } from './GristTool.js'

export interface PaginationMetadata {
  total: number
  offset: number
  limit: number
  hasMore: boolean
  nextOffset: number | null
}

export interface PaginatedResponse<TItem> {
  items: TItem[]
  pagination: PaginationMetadata
}

/** Response type with optional nextSteps from afterExecute */
export type PaginatedResponseWithNextSteps<TItem> = PaginatedResponse<TItem> & {
  nextSteps?: string[]
}

/**
 * Base class for tools that return paginated lists.
 * Handles pagination, truncation, and nextSteps preservation automatically.
 *
 * TOutput removed (was unsafe `as TOutput` cast) - now locked to PaginatedResponseWithNextSteps<TItem>
 */
export abstract class PaginatedGristTool<
  TInput extends z.ZodType<any, any>,
  TItem
> extends GristTool<TInput, PaginatedResponseWithNextSteps<TItem>> {
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
        hasMore: hasMore,
        nextOffset: hasMore ? offset + limit : null
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

  protected async executeInternal(params: z.infer<TInput>): Promise<PaginatedResponse<TItem>> {
    let items = await this.fetchItems(params)
    items = this.filterItems(items, params)
    items = this.sortItems(items, params)
    return this.paginate(items, params)
  }

  /**
   * Auto-truncates response if it exceeds character limit.
   * Flattens pagination fields at top level for backwards compatibility.
   * Preserves nextSteps through truncation.
   */
  protected formatResponse(
    data: PaginatedResponseWithNextSteps<TItem>,
    format: ResponseFormat
  ): MCPToolResponse {
    // Pass pagination fields flat (truncateIfNeeded spreads additionalData at top level)
    const { data: truncatedData } = truncateIfNeeded(data.items, format, {
      total: data.pagination.total,
      offset: data.pagination.offset,
      limit: data.pagination.limit,
      hasMore: data.pagination.hasMore,
      nextOffset: data.pagination.nextOffset
    })

    // Preserve nextSteps through truncation
    // Note: truncatedData has flat pagination fields (total, offset, etc.) plus items
    const responseData = {
      ...truncatedData,
      nextSteps: data.nextSteps
    }

    return super.formatResponse(
      responseData as unknown as PaginatedResponseWithNextSteps<TItem>,
      format
    )
  }

  protected supportsFeature(feature: 'caching' | 'pagination' | 'filtering'): boolean {
    if (feature === 'pagination') return true
    return super.supportsFeature(feature)
  }
}

export type PaginatedToolItem<T extends PaginatedGristTool<z.ZodType<any, any>, unknown>> =
  T extends PaginatedGristTool<z.ZodType<any, any>, infer TItem> ? TItem : never
