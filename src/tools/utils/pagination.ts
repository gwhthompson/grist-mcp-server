/**
 * Pagination utilities for tool responses.
 *
 * Provides consistent pagination calculation and metadata across all tools.
 */

import { DEFAULT_LIMIT, DEFAULT_OFFSET } from '../../constants.js'
import type { PaginationParams } from '../../types.js'

export type { PaginationParams }

export interface PaginationMeta {
  total: number
  offset: number
  limit: number
  hasMore: boolean
  nextOffset: number | null
}

export interface PaginatedResult<T> extends PaginationMeta {
  items: T[]
}

/**
 * Paginate an array of items.
 *
 * @param items - Full array to paginate
 * @param params - Pagination parameters (offset, limit)
 * @param defaultLimit - Override default limit (100)
 * @returns Paginated result with metadata
 *
 * @example
 * ```typescript
 * const result = paginate(allRecords, { offset: 10, limit: 20 })
 * // result.items = records 10-29
 * // result.hasMore = true if more than 30 total
 * // result.nextOffset = 30 if hasMore
 * ```
 */
export function paginate<T>(
  items: T[],
  params: PaginationParams,
  defaultLimit = DEFAULT_LIMIT
): PaginatedResult<T> {
  const offset = params.offset ?? DEFAULT_OFFSET
  const limit = params.limit ?? defaultLimit
  const total = items.length
  const paginatedItems = items.slice(offset, offset + limit)
  const hasMore = offset + limit < total
  const nextOffset = hasMore ? offset + limit : null

  return {
    items: paginatedItems,
    total,
    offset,
    limit,
    hasMore,
    nextOffset
  }
}

/**
 * Extract pagination metadata without items.
 * Useful when items are processed separately.
 *
 * @param total - Total number of items
 * @param params - Pagination parameters (offset, limit)
 * @param defaultLimit - Override default limit (100)
 * @returns Pagination metadata
 */
export function getPaginationMeta(
  total: number,
  params: PaginationParams,
  defaultLimit = DEFAULT_LIMIT
): PaginationMeta {
  const offset = params.offset ?? DEFAULT_OFFSET
  const limit = params.limit ?? defaultLimit
  const hasMore = offset + limit < total
  const nextOffset = hasMore ? offset + limit : null

  return { total, offset, limit, hasMore, nextOffset }
}
