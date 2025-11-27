import { DEFAULT_LIMIT, DEFAULT_OFFSET, MAX_LIMIT } from '../constants.js'
import { ValidationError } from '../errors/index.js'
import type { CellValue } from '../types.js'

export class PaginationParams {
  private constructor(
    public readonly offset: number,
    public readonly limit: number
  ) {}

  static create(params?: { offset?: number; limit?: number }): PaginationParams {
    const offset = params?.offset ?? DEFAULT_OFFSET
    const limit = params?.limit ?? DEFAULT_LIMIT
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

  static fromObject(obj: unknown): PaginationParams {
    if (typeof obj !== 'object' || obj === null) {
      throw new ValidationError('obj', obj, 'Must be an object')
    }
    const record = obj as Record<string, unknown>
    return PaginationParams.create({
      offset: typeof record.offset === 'number' ? record.offset : undefined,
      limit: typeof record.limit === 'number' ? record.limit : undefined
    })
  }

  toJSON(): { offset: number; limit: number } {
    return {
      offset: this.offset,
      limit: this.limit
    }
  }

  nextPage(): PaginationParams {
    return new PaginationParams(this.offset + this.limit, this.limit)
  }

  previousPage(): PaginationParams {
    const newOffset = Math.max(0, this.offset - this.limit)
    return new PaginationParams(newOffset, this.limit)
  }

  isFirstPage(): boolean {
    return this.offset === 0
  }

  getPageNumber(): number {
    return Math.floor(this.offset / this.limit) + 1
  }
}

export class FilterCriteria {
  private constructor(public readonly filters: ReadonlyMap<string, readonly CellValue[]>) {}

  static create(filters?: Record<string, CellValue | CellValue[]>): FilterCriteria {
    if (!filters || Object.keys(filters).length === 0) {
      return new FilterCriteria(new Map())
    }

    const filterMap = new Map<string, readonly CellValue[]>()

    for (const [key, value] of Object.entries(filters)) {
      if (!key || key.trim() === '') {
        throw new ValidationError('filter key', key, 'Filter key must not be empty')
      }

      // GOTCHA: CellValue can itself be an array like ['L', ...], so check first element
      const arrayValue: CellValue[] =
        Array.isArray(value) && value.length > 0 && typeof value[0] !== 'string'
          ? (value as CellValue[]) // Array of CellValues
          : [value as CellValue] // Single CellValue wrapped in array

      filterMap.set(key, Object.freeze(arrayValue))
    }

    return new FilterCriteria(filterMap)
  }

  toGristFormat(): Record<string, CellValue[]> {
    const result: Record<string, CellValue[]> = {}
    for (const [key, value] of this.filters.entries()) {
      result[key] = [...value] // Copy array
    }
    return result
  }

  isEmpty(): boolean {
    return this.filters.size === 0
  }

  getFilter(columnId: string): readonly CellValue[] | undefined {
    return this.filters.get(columnId)
  }

  toJSON(): Record<string, CellValue[]> {
    return this.toGristFormat()
  }
}

export class ColumnSelection {
  private constructor(public readonly columns: readonly string[] | null) {}

  static create(columns?: string[]): ColumnSelection {
    if (!columns || columns.length === 0) {
      return new ColumnSelection(null)
    }
    for (const col of columns) {
      if (!col || col.trim() === '') {
        throw new ValidationError('column', col, 'Column ID must not be empty')
      }
    }

    return new ColumnSelection(Object.freeze([...columns]))
  }

  isAllColumns(): boolean {
    return this.columns === null
  }

  includes(columnId: string): boolean {
    if (this.isAllColumns()) {
      return true
    }
    return this.columns?.includes(columnId) ?? false
  }

  getCount(): number | null {
    return this.columns?.length ?? null
  }

  toArray(): string[] {
    return this.columns ? [...this.columns] : []
  }

  toJSON(): string[] | string {
    return this.columns ? [...this.columns] : 'all'
  }
}

export class OperationResult<T = unknown> {
  private constructor(
    public readonly success: boolean,
    public readonly data: T | null,
    public readonly error: Error | null,
    public readonly message: string
  ) {}

  static ok<T>(data: T, message: string = 'Operation successful'): OperationResult<T> {
    return new OperationResult(true, data, null, message)
  }

  static fail<T = never>(error: Error, message?: string): OperationResult<T> {
    return new OperationResult<T>(false, null as T | null, error, message || error.message)
  }

  isSuccess(): this is { success: true; data: T; error: null } {
    return this.success
  }

  isFailure(): this is { success: false; data: null; error: Error } {
    return !this.success
  }

  unwrap(): T {
    if (this.isFailure()) {
      throw this.error
    }
    if (this.data === null) {
      throw new Error('Data is null despite success status')
    }
    return this.data
  }

  unwrapOr(defaultValue: T): T {
    return this.isSuccess() ? this.data : defaultValue
  }

  map<U>(fn: (data: T) => U): OperationResult<U> {
    if (this.isFailure()) {
      return OperationResult.fail(this.error)
    }
    if (this.data === null) {
      return OperationResult.fail(new Error('Data is null despite success status'))
    }

    try {
      return OperationResult.ok(fn(this.data))
    } catch (error) {
      return OperationResult.fail(error instanceof Error ? error : new Error(String(error)))
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      success: this.success,
      data: this.data,
      error: this.error?.message,
      message: this.message
    }
  }
}
