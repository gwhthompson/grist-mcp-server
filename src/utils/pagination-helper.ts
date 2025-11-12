/**
 * PaginationHelper - Reusable pagination utility
 *
 * Provides type-safe pagination logic for array-based data with metadata generation.
 * Eliminates code duplication across tools that implement pagination.
 *
 * Usage:
 * ```typescript
 * const helper = new PaginationHelper(items, { offset: 0, limit: 50 });
 * const page = helper.getPage();
 * const metadata = helper.getMetadata();
 * const response = helper.getResponse('markdown');
 * ```
 */

import { formatToolResponse } from '../services/formatter.js'
import type { PaginationMetadata, PaginationParams, ResponseFormat } from '../types.js'

/**
 * Generic pagination helper for array-based data
 *
 * @template T - The type of items being paginated
 *
 * @example
 * ```typescript
 * interface User {
 *   id: number;
 *   name: string;
 * }
 *
 * const users: User[] = [...];
 * const helper = new PaginationHelper(users, { offset: 0, limit: 20 });
 *
 * // Get paginated slice
 * const page = helper.getPage(); // User[]
 *
 * // Get metadata
 * const meta = helper.getMetadata();
 * // { total: 100, offset: 0, limit: 20, has_more: true, next_offset: 20 }
 *
 * // Get complete response with items and metadata
 * const response = helper.getResponse('json');
 * // { items: User[], total: 100, offset: 0, ... }
 * ```
 */
export class PaginationHelper<T> {
  private readonly items: T[]
  private readonly offset: number
  private readonly limit: number
  private readonly total: number
  private readonly start: number
  private readonly end: number
  private readonly hasMore: boolean
  private readonly nextOffset: number | null

  /**
   * Create a new PaginationHelper instance
   *
   * @param items - Full array of items to paginate
   * @param params - Pagination parameters (offset and limit)
   *
   * @throws {Error} If offset is negative
   * @throws {Error} If limit is less than or equal to 0
   */
  constructor(items: T[], params: Required<PaginationParams>) {
    if (params.offset < 0) {
      throw new Error('Offset must be non-negative')
    }
    if (params.limit <= 0) {
      throw new Error('Limit must be greater than 0')
    }

    this.items = items
    this.offset = params.offset
    this.limit = params.limit
    this.total = items.length

    // Calculate pagination boundaries
    this.start = this.offset
    this.end = Math.min(this.start + this.limit, this.total)

    // Calculate pagination state
    this.hasMore = this.end < this.total
    this.nextOffset = this.hasMore ? this.end : null
  }

  /**
   * Get the paginated slice of items
   *
   * @returns Array slice for the current page
   *
   * @example
   * ```typescript
   * const helper = new PaginationHelper([1, 2, 3, 4, 5], { offset: 1, limit: 2 });
   * const page = helper.getPage(); // [2, 3]
   * ```
   */
  getPage(): T[] {
    return this.items.slice(this.start, this.end)
  }

  /**
   * Get pagination metadata
   *
   * @returns Pagination metadata object
   *
   * @example
   * ```typescript
   * const helper = new PaginationHelper([1, 2, 3, 4, 5], { offset: 0, limit: 2 });
   * const meta = helper.getMetadata();
   * // {
   * //   total: 5,
   * //   offset: 0,
   * //   limit: 2,
   * //   has_more: true,
   * //   next_offset: 2
   * // }
   * ```
   */
  getMetadata(): PaginationMetadata {
    return {
      total: this.total,
      offset: this.offset,
      limit: this.limit,
      has_more: this.hasMore,
      next_offset: this.nextOffset
    }
  }

  /**
   * Get complete paginated response with items and metadata
   *
   * Returns an object combining:
   * - Paginated items array
   * - Pagination metadata (total, offset, limit, has_more, next_offset)
   * - Any additional data provided
   *
   * @param additionalData - Optional additional data to include in response
   * @returns Object with items, pagination metadata, and additional data
   *
   * @example
   * ```typescript
   * const helper = new PaginationHelper(users, { offset: 0, limit: 20 });
   * const response = helper.getPaginatedData({
   *   document_id: 'doc123',
   *   table_id: 'Users'
   * });
   * // {
   * //   items: [...],
   * //   total: 100,
   * //   offset: 0,
   * //   limit: 20,
   * //   has_more: true,
   * //   next_offset: 20,
   * //   document_id: 'doc123',
   * //   table_id: 'Users'
   * // }
   * ```
   */
  getPaginatedData<D extends Record<string, unknown>>(
    additionalData?: D
  ): { items: T[] } & PaginationMetadata & D {
    return {
      items: this.getPage(),
      ...this.getMetadata(),
      ...(additionalData || ({} as D))
    }
  }

  /**
   * Get formatted MCP tool response
   *
   * Combines pagination with formatting to produce a complete MCP response.
   * Uses the existing formatter service to handle JSON/Markdown conversion.
   *
   * @param format - Response format ('json' or 'markdown')
   * @param additionalData - Optional additional data to include in response
   * @returns Formatted MCP tool response
   *
   * @example
   * ```typescript
   * const helper = new PaginationHelper(workspaces, { offset: 0, limit: 50 });
   * return helper.getFormattedResponse('markdown', {
   *   detail_level: 'summary',
   *   mode: 'browse_all'
   * });
   * ```
   */
  getFormattedResponse<D extends Record<string, unknown>>(
    format: ResponseFormat,
    additionalData?: D
  ) {
    const data = this.getPaginatedData(additionalData)
    return formatToolResponse(data, format)
  }

  /**
   * Check if there are more items beyond the current page
   *
   * @returns True if there are more items after the current page
   */
  hasMoreItems(): boolean {
    return this.hasMore
  }

  /**
   * Get the total number of items (before pagination)
   *
   * @returns Total item count
   */
  getTotalCount(): number {
    return this.total
  }

  /**
   * Get the number of items in the current page
   *
   * @returns Number of items returned in current page
   */
  getPageSize(): number {
    return this.end - this.start
  }

  /**
   * Check if the current page is empty
   *
   * @returns True if the page contains no items
   */
  isEmpty(): boolean {
    return this.getPageSize() === 0
  }

  /**
   * Get the index of the first item in the current page (0-based)
   *
   * @returns Starting index of the current page
   */
  getStartIndex(): number {
    return this.start
  }

  /**
   * Get the index of the last item in the current page (exclusive, 0-based)
   *
   * @returns Ending index of the current page
   */
  getEndIndex(): number {
    return this.end
  }
}

/**
 * Factory function to create a PaginationHelper with default parameters
 *
 * Applies default values for offset (0) and limit (100) if not provided.
 *
 * @template T - The type of items being paginated
 * @param items - Full array of items to paginate
 * @param params - Pagination parameters (offset and limit)
 * @returns New PaginationHelper instance
 *
 * @example
 * ```typescript
 * const helper = createPaginationHelper(documents, { limit: 50 });
 * // offset defaults to 0
 * ```
 */
export function createPaginationHelper<T>(
  items: T[],
  params: PaginationParams
): PaginationHelper<T> {
  const defaultedParams: Required<PaginationParams> = {
    offset: params.offset ?? 0,
    limit: params.limit ?? 100
  }

  return new PaginationHelper(items, defaultedParams)
}
