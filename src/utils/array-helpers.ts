/**
 * Type-safe array helper functions for accessing array elements
 * with compile-time guarantees when used with noUncheckedIndexedAccess.
 *
 * These functions centralize the safety logic for array access,
 * making violations compiler errors rather than runtime risks.
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
 * Get the first element of an array, or undefined if empty.
 * Use this when an empty array is a valid case.
 * @param arr - The array to get the first element from
 * @returns The first element or undefined
 */
export function firstOrUndefined<T>(arr: readonly T[]): T | undefined {
	return arr[0] // Already T | undefined with noUncheckedIndexedAccess
}

/**
 * Get an element at a specific index with bounds checking.
 * @param arr - The array to access
 * @param index - The index to access (0-based)
 * @param context - Optional context for error message
 * @throws RangeError if index is out of bounds
 * @returns The element at the specified index
 */
export function at<T>(arr: readonly T[], index: number, context?: string): T {
	if (index < 0 || index >= arr.length) {
		const message = `Index ${index} out of bounds [0, ${arr.length})`
		throw new RangeError(context ? `${context}: ${message}` : message)
	}
	return arr[index] as T // Safe: bounds check above
}

/**
 * Get an element at a specific index, or undefined if out of bounds.
 * Use this when out-of-bounds access is a valid case.
 * @param arr - The array to access
 * @param index - The index to access (0-based)
 * @returns The element at the index or undefined
 */
export function atOrUndefined<T>(arr: readonly T[], index: number): T | undefined {
	if (index < 0 || index >= arr.length) {
		return undefined
	}
	return arr[index] as T // Safe: bounds check above
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

/**
 * Get the last element of an array with compile-time guarantee it exists.
 * @param arr - The array to get the last element from
 * @param context - Optional context for error message
 * @throws Error if array is empty
 * @returns The last element of the array
 */
export function last<T>(arr: readonly T[], context?: string): T {
	if (arr.length === 0) {
		throw new Error(context ? `${context}: Array is empty` : 'Array is empty')
	}
	return arr[arr.length - 1] as T // Safe: length check above
}

/**
 * Get the last element of an array, or undefined if empty.
 * @param arr - The array to get the last element from
 * @returns The last element or undefined
 */
export function lastOrUndefined<T>(arr: readonly T[]): T | undefined {
	if (arr.length === 0) {
		return undefined
	}
	return arr[arr.length - 1] as T // Safe: length check above
}
