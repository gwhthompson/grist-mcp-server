/**
 * Type-safe array helper functions for accessing array elements
 * with compile-time guarantees when used with noUncheckedIndexedAccess.
 */

/**
 * Get the first element of an array with compile-time guarantee it exists.
 * @param arr - The array to get the first element from
 * @param context - Optional context for error message (e.g., "Creating master widget")
 * @throws Error if array is empty
 * @returns The first element of the array
 */
export function first<T>(arr: readonly T[], context?: string): T {
  if (arr.length === 0) {
    throw new Error(context ? `${context}: Array is empty` : 'Array is empty')
  }
  return arr[0] as T // Safe: length check above
}

/**
 * Type guard for non-empty arrays.
 * When this returns true, TypeScript knows the array has at least one element.
 * @param arr - The array to check
 * @returns True if the array is non-empty
 *
 * @example
 * ```typescript
 * if (isNonEmpty(results)) {
 *   // TypeScript knows results[0] is T, not T | undefined
 *   const firstResult = results[0]
 * }
 * ```
 */
export function isNonEmpty<T>(arr: readonly T[]): arr is readonly [T, ...T[]] {
  return arr.length > 0
}
