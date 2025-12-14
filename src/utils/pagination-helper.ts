import { formatToolResponse } from '../services/formatter.js'
import type { PaginationMetadata, PaginationParams, ResponseFormat } from '../types.js'

export class PaginationHelper<T> {
  private readonly items: T[]
  private readonly offset: number
  private readonly limit: number
  private readonly total: number
  private readonly start: number
  private readonly end: number
  private readonly hasMore: boolean
  private readonly nextOffset: number | null

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

    this.start = this.offset
    this.end = Math.min(this.start + this.limit, this.total)

    this.hasMore = this.end < this.total
    this.nextOffset = this.hasMore ? this.end : null
  }

  getPage(): T[] {
    return this.items.slice(this.start, this.end)
  }

  getMetadata(): PaginationMetadata {
    const itemsInPage = this.end - this.start
    const pageNumber = Math.floor(this.offset / this.limit) + 1
    const totalPages = Math.ceil(this.total / this.limit)

    return {
      total: this.total,
      offset: this.offset,
      limit: this.limit,
      hasMore: this.hasMore,
      nextOffset: this.nextOffset,
      pageNumber,
      totalPages,
      itemsInPage
    }
  }

  getPaginatedData<D extends Record<string, unknown>>(
    additionalData?: D
  ): { items: T[] } & PaginationMetadata & D {
    return {
      items: this.getPage(),
      ...this.getMetadata(),
      ...(additionalData || ({} as D))
    }
  }

  getFormattedResponse<D extends Record<string, unknown>>(
    format: ResponseFormat,
    additionalData?: D
  ) {
    const data = this.getPaginatedData(additionalData)
    return formatToolResponse(data, format)
  }

  hasMoreItems(): boolean {
    return this.hasMore
  }

  getTotalCount(): number {
    return this.total
  }

  getPageSize(): number {
    return this.end - this.start
  }

  isEmpty(): boolean {
    return this.getPageSize() === 0
  }

  getStartIndex(): number {
    return this.start
  }

  getEndIndex(): number {
    return this.end
  }
}

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
