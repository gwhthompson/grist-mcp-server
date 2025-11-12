/**
 * Filter Helper - Reusable filtering utilities for common patterns
 *
 * Provides type-safe filtering functions for common use cases:
 * - Name/text searching (case-insensitive substring matching)
 * - Generic property filtering
 * - Complex filter predicates
 */

/**
 * Interface for objects with a name property
 */
export interface Nameable {
  name: string
}

/**
 * Filter items by name using case-insensitive substring matching
 *
 * Common use case for searching workspaces, documents, tables, etc.
 * If searchTerm is undefined/empty, returns all items unchanged.
 *
 * @template T - Item type (must have a name property)
 * @param items - Array of items to filter
 * @param searchTerm - Optional search term (case-insensitive)
 * @returns Filtered array of items
 *
 * @example
 * ```typescript
 * const workspaces = [{name: "Sales Team"}, {name: "Engineering"}]
 * const result = filterByName(workspaces, "sales")
 * // Returns [{name: "Sales Team"}]
 * ```
 */
export function filterByName<T extends Nameable>(items: T[], searchTerm?: string): T[] {
  if (!searchTerm || searchTerm.trim() === '') {
    return items
  }

  const lowerSearch = searchTerm.toLowerCase()
  return items.filter((item) => item.name.toLowerCase().includes(lowerSearch))
}

/**
 * Filter items by a specific property value (case-insensitive for strings)
 *
 * @template T - Item type
 * @template K - Property key of T
 * @param items - Array of items to filter
 * @param property - Property key to filter by
 * @param value - Value to match (case-insensitive for strings)
 * @returns Filtered array of items
 *
 * @example
 * ```typescript
 * const docs = [{id: "1", status: "Active"}, {id: "2", status: "Archived"}]
 * const active = filterByProperty(docs, "status", "active")
 * // Returns [{id: "1", status: "Active"}]
 * ```
 */
export function filterByProperty<T, K extends keyof T>(items: T[], property: K, value: T[K]): T[] {
  if (value === undefined || value === null) {
    return items
  }

  // Case-insensitive string comparison
  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase()
    return items.filter((item) => {
      const itemValue = item[property]
      if (typeof itemValue === 'string') {
        return itemValue.toLowerCase() === lowerValue
      }
      return itemValue === value
    })
  }

  // Exact comparison for non-strings
  return items.filter((item) => item[property] === value)
}

/**
 * Filter items using a custom predicate function
 *
 * Convenience wrapper that handles empty arrays and provides type safety.
 *
 * @template T - Item type
 * @param items - Array of items to filter
 * @param predicate - Filter function (return true to keep item)
 * @returns Filtered array of items
 *
 * @example
 * ```typescript
 * const numbers = [1, 2, 3, 4, 5]
 * const evens = filterByPredicate(numbers, n => n % 2 === 0)
 * // Returns [2, 4]
 * ```
 */
export function filterByPredicate<T>(items: T[], predicate: (item: T) => boolean): T[] {
  if (items.length === 0) {
    return items
  }

  return items.filter(predicate)
}

/**
 * Filter items using multiple criteria (AND logic)
 *
 * All filters must match for an item to be included.
 *
 * @template T - Item type
 * @param items - Array of items to filter
 * @param filters - Array of filter functions
 * @returns Filtered array of items
 *
 * @example
 * ```typescript
 * const users = [
 *   {name: "John", age: 25, active: true},
 *   {name: "Jane", age: 30, active: false},
 *   {name: "Bob", age: 35, active: true}
 * ]
 *
 * const result = filterWithAnd(users, [
 *   u => u.age > 26,
 *   u => u.active
 * ])
 * // Returns [{name: "Bob", age: 35, active: true}]
 * ```
 */
export function filterWithAnd<T>(items: T[], filters: Array<(item: T) => boolean>): T[] {
  if (filters.length === 0) {
    return items
  }

  return items.filter((item) => filters.every((filter) => filter(item)))
}

/**
 * Filter items using multiple criteria (OR logic)
 *
 * Any filter matching includes the item.
 *
 * @template T - Item type
 * @param items - Array of items to filter
 * @param filters - Array of filter functions
 * @returns Filtered array of items
 *
 * @example
 * ```typescript
 * const users = [
 *   {name: "John", age: 25, role: "admin"},
 *   {name: "Jane", age: 30, role: "user"},
 *   {name: "Bob", age: 35, role: "admin"}
 * ]
 *
 * const result = filterWithOr(users, [
 *   u => u.age < 26,
 *   u => u.role === "admin"
 * ])
 * // Returns [{name: "John", ...}, {name: "Bob", ...}]
 * ```
 */
export function filterWithOr<T>(items: T[], filters: Array<(item: T) => boolean>): T[] {
  if (filters.length === 0) {
    return items
  }

  return items.filter((item) => filters.some((filter) => filter(item)))
}

/**
 * Create a composite filter from multiple filters with AND logic
 *
 * Returns a single predicate function that applies all filters.
 * Useful for building complex filters programmatically.
 *
 * @template T - Item type
 * @param filters - Array of filter functions
 * @returns Single composite filter function
 *
 * @example
 * ```typescript
 * const isActive = (u: User) => u.active
 * const isAdmin = (u: User) => u.role === "admin"
 * const isOver25 = (u: User) => u.age > 25
 *
 * const compositeFilter = composeFiltersAnd([isActive, isAdmin, isOver25])
 * const result = users.filter(compositeFilter)
 * ```
 */
export function composeFiltersAnd<T>(filters: Array<(item: T) => boolean>): (item: T) => boolean {
  return (item: T) => filters.every((filter) => filter(item))
}

/**
 * Create a composite filter from multiple filters with OR logic
 *
 * Returns a single predicate function that applies any filter.
 * Useful for building complex filters programmatically.
 *
 * @template T - Item type
 * @param filters - Array of filter functions
 * @returns Single composite filter function
 *
 * @example
 * ```typescript
 * const isVIP = (u: User) => u.role === "vip"
 * const isFreeTrial = (u: User) => u.subscription === "trial"
 *
 * const compositeFilter = composeFiltersOr([isVIP, isFreeTrial])
 * const specialUsers = users.filter(compositeFilter)
 * ```
 */
export function composeFiltersOr<T>(filters: Array<(item: T) => boolean>): (item: T) => boolean {
  return (item: T) => filters.some((filter) => filter(item))
}

/**
 * Case-insensitive search across multiple string properties
 *
 * Useful for implementing "search anywhere" functionality.
 *
 * @template T - Item type
 * @param items - Array of items to search
 * @param searchTerm - Search term (case-insensitive)
 * @param properties - Array of property keys to search in
 * @returns Filtered array of items
 *
 * @example
 * ```typescript
 * const users = [
 *   {name: "John Doe", email: "john@example.com", bio: "Developer"},
 *   {name: "Jane Smith", email: "jane@example.com", bio: "Designer"}
 * ]
 *
 * const result = searchAcrossProperties(users, "dev", ["name", "bio"])
 * // Returns [{name: "John Doe", ...}]
 * ```
 */
export function searchAcrossProperties<T>(
  items: T[],
  searchTerm: string | undefined,
  properties: Array<keyof T>
): T[] {
  if (!searchTerm || searchTerm.trim() === '') {
    return items
  }

  const lowerSearch = searchTerm.toLowerCase()

  return items.filter((item) => {
    return properties.some((prop) => {
      const value = item[prop]
      if (typeof value === 'string') {
        return value.toLowerCase().includes(lowerSearch)
      }
      return false
    })
  })
}
