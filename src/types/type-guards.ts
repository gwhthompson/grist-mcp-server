import type { z } from 'zod'
import { ValidationError } from '../errors/index.js'

export function createTypeGuard<T extends z.ZodType<any, any>>(
  schema: T
): (value: unknown) => value is z.infer<T> {
  return (value: unknown): value is z.infer<T> => {
    return schema.safeParse(value).success
  }
}

export function assertType<T extends z.ZodType<any, any>>(
  schema: T,
  value: unknown,
  errorMessage?: string
): asserts value is z.infer<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw ValidationError.fromZodError(result.error, errorMessage ?? 'Type assertion failed')
  }
}

export function safeParse<T extends z.ZodType<any, any>>(
  schema: T,
  value: unknown
): { success: true; data: z.infer<T> } | { success: false; error: ValidationError } {
  const result = schema.safeParse(value)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    error: ValidationError.fromZodError(result.error)
  }
}

export function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined
}

export function isDefined<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined
}

export function hasProperty<K extends PropertyKey>(
  value: unknown,
  key: K
): value is Record<K, unknown> {
  return isRecord(value) && key in value
}

export function isError(value: unknown): value is Error {
  return value instanceof Error
}
