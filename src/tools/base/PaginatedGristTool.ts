/**
 * Specialized Base Class for Paginated Grist MCP Tools
 *
 * Extends GristTool with built-in pagination support for list operations
 * Automatically handles offset/limit parameters and metadata
 */

import type { z } from 'zod'
import { GristTool } from './GristTool.js'

/**
 * Pagination metadata included in responses
 */
export interface PaginationMetadata {
  total: number
  offset: number
  limit: number
  has_more: boolean
  next_offset: number | null
}

/**
 * Standard paginated response structure
 */
export interface PaginatedResponse<TItem> {
  items: TItem[]
  pagination: PaginationMetadata
}

/**
 * Abstract base class for paginated tools
 * Automatically handles pagination logic
 *
 * @template TInput - Input schema type (must include offset/limit fields)
 * @template TItem - Type of individual items in the list
 * @template TOutput - Output type (defaults to PaginatedResponse<TItem>)
 *
 * @example
 * ```typescript
 * class GetDocumentsTool extends PaginatedGristTool<
 *   typeof GetDocumentsSchema,
 *   DocumentInfo,
 *   PaginatedResponse<DocumentInfo>
 * > {
 *   constructor(client: GristClient) {
 *     super(client, GetDocumentsSchema)
 *   }
 *
 *   protected async fetchItems(params: z.infer<typeof GetDocumentsSchema>): Promise<DocumentInfo[]> {
 *     return await this.client.get('/docs')
 *   }
 *
 *   protected async executeInternal(params: z.infer<typeof GetDocumentsSchema>) {
 *     const items = await this.fetchItems(params)
 *     return this.paginate(items, params)
 *   }
 * }
 * ```
 */
export abstract class PaginatedGristTool<
  TInput extends z.ZodTypeAny,
  TItem,
  TOutput = PaginatedResponse<TItem>
> extends GristTool<TInput, TOutput> {
  /**
   * Fetch all items (subclass implements the actual fetching logic)
   * This method should return the complete list of items before pagination
   *
   * @param params - Validated parameters
   * @returns Array of all items
   */
  protected abstract fetchItems(params: z.infer<TInput>): Promise<TItem[]>

  /**
   * Apply pagination to items
   * Automatically extracts offset/limit from params and applies pagination
   *
   * @param items - Complete list of items
   * @param params - Validated parameters (must include offset/limit)
   * @returns Paginated response with metadata
   */
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

  /**
   * Extract offset from parameters
   * Defaults to 0 if not specified
   *
   * @param params - Validated parameters
   * @returns Offset value
   */
  protected getOffset(params: z.infer<TInput>): number {
    const paramsRecord = params as Record<string, unknown>
    const offset = paramsRecord.offset
    return typeof offset === 'number' ? offset : 0
  }

  /**
   * Extract limit from parameters
   * Defaults to 100 if not specified
   *
   * @param params - Validated parameters
   * @returns Limit value
   */
  protected getLimit(params: z.infer<TInput>): number {
    const paramsRecord = params as Record<string, unknown>
    const limit = paramsRecord.limit
    return typeof limit === 'number' ? limit : 100
  }

  /**
   * Filter items based on search criteria
   * Override in subclasses for custom filtering logic
   *
   * @param items - Items to filter
   * @param params - Validated parameters
   * @returns Filtered items
   */
  protected filterItems(items: TItem[], _params: z.infer<TInput>): TItem[] {
    // Default: no filtering
    // Subclasses can override for custom filtering
    return items
  }

  /**
   * Sort items based on sort criteria
   * Override in subclasses for custom sorting logic
   *
   * @param items - Items to sort
   * @param params - Validated parameters
   * @returns Sorted items
   */
  protected sortItems(items: TItem[], _params: z.infer<TInput>): TItem[] {
    // Default: no sorting
    // Subclasses can override for custom sorting
    return items
  }

  /**
   * Standard execution flow for paginated tools:
   * 1. Fetch all items
   * 2. Apply filtering
   * 3. Apply sorting
   * 4. Apply pagination
   *
   * Most subclasses won't need to override this
   */
  protected async executeInternal(params: z.infer<TInput>): Promise<TOutput> {
    // Fetch all items
    let items = await this.fetchItems(params)

    // Apply filtering if needed
    items = this.filterItems(items, params)

    // Apply sorting if needed
    items = this.sortItems(items, params)

    // Apply pagination
    return this.paginate(items, params) as TOutput
  }

  /**
   * Check if this tool supports pagination (always true)
   */
  protected supportsFeature(feature: 'caching' | 'pagination' | 'filtering'): boolean {
    if (feature === 'pagination') return true
    return super.supportsFeature(feature)
  }
}

/**
 * Type helper to extract item type from PaginatedGristTool
 */
export type PaginatedToolItem<T extends PaginatedGristTool<z.ZodTypeAny, unknown, unknown>> =
  T extends PaginatedGristTool<z.ZodTypeAny, infer TItem, unknown> ? TItem : never
