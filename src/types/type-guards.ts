/**
 * Type Guards and Assertion Functions
 *
 * Provides runtime type checking using Zod schemas
 * Leverages TypeScript's type predicates for type narrowing
 */

import type { z } from 'zod'
import { ValidationError } from '../errors/index.js'

/**
 * Generic type guard factory from Zod schema
 * Creates runtime type guards that work with discriminated unions
 *
 * @template T - Zod schema type
 * @param schema - Zod schema to validate against
 * @returns Type predicate function
 *
 * @example
 * const isWorkspaceInfo = createTypeGuard(WorkspaceInfoSchema)
 * if (isWorkspaceInfo(data)) {
 *   // TypeScript knows data is WorkspaceInfo
 *   console.log(data.name)
 * }
 */
export function createTypeGuard<T extends z.ZodTypeAny>(
  schema: T
): (value: unknown) => value is z.infer<T> {
  return (value: unknown): value is z.infer<T> => {
    return schema.safeParse(value).success
  }
}

/**
 * Assertion function that validates and narrows type
 * Throws ValidationError if validation fails
 *
 * @template T - Zod schema type
 * @param schema - Zod schema to validate against
 * @param value - Value to validate
 * @param errorMessage - Optional custom error message
 * @throws {ValidationError} If validation fails
 *
 * @example
 * assertType(WorkspaceInfoSchema, data, 'Invalid workspace data')
 * // TypeScript knows data is WorkspaceInfo after this line
 * console.log(data.name)
 */
export function assertType<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
  errorMessage?: string
): asserts value is z.infer<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw ValidationError.fromZodError(result.error, errorMessage ?? 'Type assertion failed')
  }
}

/**
 * Safe parse with typed result
 * Returns discriminated union for type-safe error handling
 *
 * @template T - Zod schema type
 * @param schema - Zod schema to validate against
 * @param value - Value to parse
 * @returns Success result with data or failure result with error
 *
 * @example
 * const result = safeParse(WorkspaceInfoSchema, data)
 * if (result.success) {
 *   console.log(result.data.name)
 * } else {
 *   console.error(result.error.message)
 * }
 */
export function safeParse<T extends z.ZodTypeAny>(
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

/**
 * Check if value is an array of specific type
 *
 * @template T - Element type
 * @param value - Value to check
 * @param guard - Type guard for elements
 * @returns True if value is array of T
 *
 * @example
 * if (isArrayOf(data, isWorkspaceInfo)) {
 *   // TypeScript knows data is WorkspaceInfo[]
 *   data.forEach(ws => console.log(ws.name))
 * }
 */
export function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard)
}

/**
 * Check if value is a record (plain object)
 *
 * @param value - Value to check
 * @returns True if value is a plain object
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Check if value is a non-null object
 *
 * @param value - Value to check
 * @returns True if value is non-null object
 */
export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/**
 * Check if value is a string
 *
 * @param value - Value to check
 * @returns True if value is string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * Check if value is a number
 *
 * @param value - Value to check
 * @returns True if value is number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

/**
 * Check if value is a boolean
 *
 * @param value - Value to check
 * @returns True if value is boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/**
 * Check if value is null or undefined
 *
 * @param value - Value to check
 * @returns True if value is null or undefined
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined
}

/**
 * Narrow type by excluding null and undefined
 *
 * @template T - Original type
 * @param value - Value to check
 * @returns True if value is not null or undefined
 *
 * @example
 * const value: string | null = getData()
 * if (isDefined(value)) {
 *   // TypeScript knows value is string
 *   console.log(value.toUpperCase())
 * }
 */
export function isDefined<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined
}

/**
 * Check if value has a specific property
 *
 * @template K - Property key type
 * @param value - Value to check
 * @param key - Property key to check for
 * @returns True if value has the property
 *
 * @example
 * if (hasProperty(data, 'name')) {
 *   // TypeScript knows data has 'name' property
 *   console.log(data.name)
 * }
 */
export function hasProperty<K extends PropertyKey>(
  value: unknown,
  key: K
): value is Record<K, unknown> {
  return isRecord(value) && key in value
}

/**
 * Check if value is an Error
 *
 * @param value - Value to check
 * @returns True if value is Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error
}
