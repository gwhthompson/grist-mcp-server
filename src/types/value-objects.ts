/**
 * Value Objects
 *
 * Immutable domain objects with encapsulated validation
 * Follows Value Object pattern from Domain-Driven Design
 */

import { DEFAULT_LIMIT, DEFAULT_OFFSET, MAX_LIMIT } from '../constants.js'
import { ValidationError } from '../errors/index.js'

/**
 * Pagination parameters value object
 * Encapsulates validation for offset and limit
 */
export class PaginationParams {
  private constructor(
    public readonly offset: number,
    public readonly limit: number
  ) {}

  /**
   * Create pagination params with validation
   *
   * @throws {ValidationError} If parameters are invalid
   */
  static create(params?: { offset?: number; limit?: number }): PaginationParams {
    const offset = params?.offset ?? DEFAULT_OFFSET
    const limit = params?.limit ?? DEFAULT_LIMIT

    // Validation
    if (offset < 0) {
      throw new ValidationError('offset', offset, 'Offset must be non-negative')
    }

    if (limit < 1) {
      throw new ValidationError('limit', limit, 'Limit must be at least 1')
    }

    if (limit > MAX_LIMIT) {
      throw new ValidationError('limit', limit, `Limit must not exceed ${MAX_LIMIT}`)
    }

    return new PaginationParams(offset, limit)
  }

  /**
   * Create from plain object (convenience method)
   */
  static fromObject(obj: any): PaginationParams {
    return PaginationParams.create({
      offset: obj?.offset,
      limit: obj?.limit
    })
  }

  /**
   * Convert to plain object
   */
  toJSON(): { offset: number; limit: number } {
    return {
      offset: this.offset,
      limit: this.limit
    }
  }

  /**
   * Get next page pagination
   */
  nextPage(): PaginationParams {
    return new PaginationParams(this.offset + this.limit, this.limit)
  }

  /**
   * Get previous page pagination
   */
  previousPage(): PaginationParams {
    const newOffset = Math.max(0, this.offset - this.limit)
    return new PaginationParams(newOffset, this.limit)
  }

  /**
   * Check if this is the first page
   */
  isFirstPage(): boolean {
    return this.offset === 0
  }

  /**
   * Calculate page number (1-indexed)
   */
  getPageNumber(): number {
    return Math.floor(this.offset / this.limit) + 1
  }
}

/**
 * Filter criteria value object
 * Encapsulates filter validation and conversion
 */
export class FilterCriteria {
  private constructor(
    public readonly filters: ReadonlyMap<string, readonly any[]>
  ) {}

  /**
   * Create filter criteria with validation
   */
  static create(filters?: Record<string, any>): FilterCriteria {
    if (!filters || Object.keys(filters).length === 0) {
      return new FilterCriteria(new Map())
    }

    const filterMap = new Map<string, readonly any[]>()

    for (const [key, value] of Object.entries(filters)) {
      if (!key || key.trim() === '') {
        throw new ValidationError('filter key', key, 'Filter key must not be empty')
      }

      // Convert single value to array
      const arrayValue = Array.isArray(value) ? value : [value]
      filterMap.set(key, Object.freeze(arrayValue))
    }

    return new FilterCriteria(filterMap)
  }

  /**
   * Convert to Grist filter format
   */
  toGristFormat(): Record<string, any[]> {
    const result: Record<string, any[]> = {}
    for (const [key, value] of this.filters.entries()) {
      result[key] = [...value]  // Copy array
    }
    return result
  }

  /**
   * Check if filters are empty
   */
  isEmpty(): boolean {
    return this.filters.size === 0
  }

  /**
   * Get filter for specific column
   */
  getFilter(columnId: string): readonly any[] | undefined {
    return this.filters.get(columnId)
  }

  /**
   * Convert to JSON
   */
  toJSON(): Record<string, any[]> {
    return this.toGristFormat()
  }
}

/**
 * Column selection value object
 * Encapsulates column selection logic
 */
export class ColumnSelection {
  private constructor(
    public readonly columns: readonly string[] | null
  ) {}

  /**
   * Create column selection
   * Null means "all columns"
   */
  static create(columns?: string[]): ColumnSelection {
    if (!columns || columns.length === 0) {
      return new ColumnSelection(null)
    }

    // Validate column IDs
    for (const col of columns) {
      if (!col || col.trim() === '') {
        throw new ValidationError('column', col, 'Column ID must not be empty')
      }
    }

    return new ColumnSelection(Object.freeze([...columns]))
  }

  /**
   * Check if all columns are selected
   */
  isAllColumns(): boolean {
    return this.columns === null
  }

  /**
   * Check if specific column is selected
   */
  includes(columnId: string): boolean {
    if (this.isAllColumns()) {
      return true
    }
    return this.columns!.includes(columnId)
  }

  /**
   * Get column count (null if all columns)
   */
  getCount(): number | null {
    return this.columns?.length ?? null
  }

  /**
   * Convert to array (empty array means all columns)
   */
  toArray(): string[] {
    return this.columns ? [...this.columns] : []
  }

  /**
   * Convert to JSON
   */
  toJSON(): string[] | string {
    return this.columns ? [...this.columns] : 'all'
  }
}

/**
 * Result value object for operations
 * Provides type-safe operation results
 */
export class OperationResult<T = unknown> {
  private constructor(
    public readonly success: boolean,
    public readonly data: T | null,
    public readonly error: Error | null,
    public readonly message: string
  ) {}

  /**
   * Create successful result
   */
  static ok<T>(data: T, message: string = 'Operation successful'): OperationResult<T> {
    return new OperationResult(true, data, null, message)
  }

  /**
   * Create failure result
   */
  static fail<T = never>(error: Error, message?: string): OperationResult<T> {
    return new OperationResult<T>(false, null as T | null, error, message || error.message)
  }

  /**
   * Check if operation was successful
   */
  isSuccess(): this is { success: true; data: T; error: null } {
    return this.success
  }

  /**
   * Check if operation failed
   */
  isFailure(): this is { success: false; data: null; error: Error } {
    return !this.success
  }

  /**
   * Get data or throw error
   */
  unwrap(): T {
    if (this.isFailure()) {
      throw this.error
    }
    return this.data!
  }

  /**
   * Get data or return default value
   */
  unwrapOr(defaultValue: T): T {
    return this.isSuccess() ? this.data : defaultValue
  }

  /**
   * Map successful result to new value
   */
  map<U>(fn: (data: T) => U): OperationResult<U> {
    if (this.isFailure()) {
      return OperationResult.fail(this.error)
    }
    try {
      return OperationResult.ok(fn(this.data!))
    } catch (error) {
      return OperationResult.fail(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Convert to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      success: this.success,
      data: this.data,
      error: this.error?.message,
      message: this.message
    }
  }
}
