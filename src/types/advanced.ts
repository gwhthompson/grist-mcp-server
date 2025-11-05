/**
 * Advanced TypeScript type system for Grist MCP Server
 *
 * This file contains:
 * - Branded types for type-safe IDs
 * - Conditional types for detail-level-dependent responses
 * - Template literal types for API paths
 * - Type guards for runtime validation
 * - Generic response wrappers
 */

import type {
  WorkspaceInfo,
  DocumentInfo,
  TableInfo,
  DetailLevelWorkspace,
  DetailLevelTable,
  CellValue,
  Record as GristRecord,
  PaginationMetadata
} from '../types.js'

// ============================================================================
// Branded Types (Nominal Typing)
// ============================================================================

/**
 * Branded type pattern for creating nominal types
 * These types are structurally identical to their base type at runtime
 * but are treated as distinct types at compile time
 */
declare const brand: unique symbol

type Brand<T, TBrand extends string> = T & { [brand]: TBrand }

/**
 * Document ID - branded string to prevent mixing with other IDs
 * @example const docId: DocId = 'abc123' as DocId
 */
export type DocId = Brand<string, 'DocId'>

/**
 * Table ID - branded string to prevent mixing with doc IDs
 * @example const tableId: TableId = 'Table1' as TableId
 */
export type TableId = Brand<string, 'TableId'>

/**
 * Workspace ID - branded number to prevent mixing with row IDs
 * @example const workspaceId: WorkspaceId = 42 as WorkspaceId
 */
export type WorkspaceId = Brand<number, 'WorkspaceId'>

/**
 * Row ID - branded number to prevent mixing with workspace IDs
 * @example const rowId: RowId = 123 as RowId
 */
export type RowId = Brand<number, 'RowId'>

/**
 * Column ID - branded string for column identifiers
 * @example const colId: ColId = 'firstName' as ColId
 */
export type ColId = Brand<string, 'ColId'>

/**
 * Organization ID - branded number for org identifiers
 * @example const orgId: OrgId = 1 as OrgId
 */
export type OrgId = Brand<number, 'OrgId'>

// ============================================================================
// Branded Type Conversion Helpers
// ============================================================================

/**
 * Convert a raw string to a DocId
 * Use this when receiving data from external APIs
 */
export function toDocId(raw: string): DocId {
  return raw as DocId
}

/**
 * Convert a raw string to a TableId
 */
export function toTableId(raw: string): TableId {
  return raw as TableId
}

/**
 * Convert a raw number to a WorkspaceId
 */
export function toWorkspaceId(raw: number): WorkspaceId {
  return raw as WorkspaceId
}

/**
 * Convert a raw number to a RowId
 */
export function toRowId(raw: number): RowId {
  return raw as RowId
}

/**
 * Convert a raw string to a ColId
 */
export function toColId(raw: string): ColId {
  return raw as ColId
}

/**
 * Convert a raw number to an OrgId
 */
export function toOrgId(raw: number): OrgId {
  return raw as OrgId
}

/**
 * Extract raw value from branded type
 * Useful when you need to pass to external APIs
 */
export function fromBranded<T>(branded: Brand<T, string>): T {
  return branded as T
}

// ============================================================================
// Conditional Types for Detail Levels
// ============================================================================

/**
 * Summary workspace - contains only essential fields
 */
export type SummaryWorkspace = Pick<
  WorkspaceInfo,
  'id' | 'name' | 'org' | 'access'
>

/**
 * Detailed workspace - contains all fields including nested docs
 */
export type DetailedWorkspace = WorkspaceInfo

/**
 * Conditional type that returns different workspace types based on detail level
 *
 * @example
 * type Result = WorkspaceResult<'summary'> // SummaryWorkspace
 * type Result = WorkspaceResult<'detailed'> // DetailedWorkspace
 */
export type WorkspaceResult<D extends DetailLevelWorkspace> =
  D extends 'detailed'
    ? DetailedWorkspace
    : D extends 'summary'
    ? SummaryWorkspace
    : never

/**
 * Table with only name information
 */
export type TableNames = Pick<TableInfo, 'id'>

/**
 * Table with column information
 */
export type TableColumns = Pick<TableInfo, 'id' | 'fields'>

/**
 * Table with full schema information
 */
export type TableFullSchema = TableInfo

/**
 * Conditional type that returns different table types based on detail level
 *
 * @example
 * type Result = TableResult<'names'> // TableNames
 * type Result = TableResult<'columns'> // TableColumns
 */
export type TableResult<D extends DetailLevelTable> =
  D extends 'full_schema'
    ? TableFullSchema
    : D extends 'columns'
    ? TableColumns
    : D extends 'names'
    ? TableNames
    : never

// ============================================================================
// Template Literal Types for API Paths
// ============================================================================

/**
 * Type-safe API path construction using template literal types
 * Prevents typos and ensures correct path structure
 */
export type ApiPath =
  // Organization endpoints
  | `/api/orgs/${number}`
  | `/api/orgs/${number}/workspaces`
  | `/api/orgs/${number}/access`

  // Workspace endpoints
  | `/api/workspaces/${number}`
  | `/api/workspaces/${number}/docs`
  | `/api/workspaces/${number}/access`

  // Document endpoints
  | `/api/docs/${string}`
  | `/api/docs/${string}/tables`
  | `/api/docs/${string}/tables/${string}`
  | `/api/docs/${string}/tables/${string}/columns`
  | `/api/docs/${string}/tables/${string}/columns/${string}`
  | `/api/docs/${string}/tables/${string}/records`
  | `/api/docs/${string}/tables/${string}/data`
  | `/api/docs/${string}/apply`
  | `/api/docs/${string}/sql`
  | `/api/docs/${string}/access`
  | `/api/docs/${string}/compare`

  // Attachment endpoints
  | `/api/docs/${string}/attachments`
  | `/api/docs/${string}/attachments/${number}`

/**
 * Helper type to build type-safe API paths
 */
export type BuildPath<
  TBase extends string,
  TParam extends string | number = never
> = [TParam] extends [never]
  ? TBase
  : `${TBase}/${TParam}`

// ============================================================================
// Generic Response Wrappers
// ============================================================================

/**
 * Generic tool response wrapper
 * Provides consistent structure for all tool responses
 *
 * @template T - The type of structured content being returned
 */
export interface ToolResponse<T> {
  content: Array<{
    type: 'text'
    text: string // Markdown or JSON string based on response_format
  }>
  structuredContent: T // Always include - machine-readable data
  isError?: boolean // True for error responses
}

/**
 * Generic paginated response wrapper
 * Used for any endpoint that returns paginated data
 *
 * @template T - The type of items in the array
 */
export interface PaginatedResponse<T> {
  items: T[]
  pagination: PaginationMetadata
}

/**
 * Generic async state wrapper for handling loading, success, and error states
 * Useful for client-side state management
 *
 * @template T - The type of data when successful
 * @template E - The type of error (defaults to Error)
 */
export type AsyncState<T, E = Error> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: E }

/**
 * Result type for operations that can succeed or fail
 * Alternative to throwing exceptions
 *
 * @template T - The type of data when successful
 * @template E - The type of error (defaults to Error)
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E }

// ============================================================================
// Advanced Type Utilities
// ============================================================================

/**
 * Deep readonly - makes all nested properties readonly
 * Prevents accidental mutations of nested objects
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object
    ? T[P] extends (...args: any[]) => any
      ? T[P]
      : DeepReadonly<T[P]>
    : T[P]
}

/**
 * Deep partial - makes all nested properties optional
 * Useful for partial updates of nested structures
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? T[P] extends Array<infer U>
      ? Array<DeepPartial<U>>
      : DeepPartial<T[P]>
    : T[P]
}

/**
 * Pick properties by type
 * Extract only properties of a certain type from an interface
 *
 * @example
 * interface User { id: number; name: string; age: number }
 * type Numbers = PickByType<User, number> // { id: number; age: number }
 */
export type PickByType<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K]
}

/**
 * Required properties - makes all properties required (removes optional modifier)
 */
export type RequiredProperties<T> = {
  [K in keyof T]-?: T[K]
}

/**
 * Mutable - removes readonly modifier from all properties
 */
export type Mutable<T> = {
  -readonly [K in keyof T]: T[K]
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid CellValue
 */
export function isCellValue(value: unknown): value is CellValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string')
  )
}

/**
 * Type guard to check if a value is a WorkspaceInfo object
 */
export function isWorkspaceInfo(value: unknown): value is WorkspaceInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as any).id === 'number' &&
    'name' in value &&
    typeof (value as any).name === 'string' &&
    'org' in value &&
    typeof (value as any).org === 'string' &&
    'access' in value &&
    typeof (value as any).access === 'string'
  )
}

/**
 * Type guard to check if a value is a DocumentInfo object
 */
export function isDocumentInfo(value: unknown): value is DocumentInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as any).id === 'string' &&
    'name' in value &&
    typeof (value as any).name === 'string' &&
    'access' in value &&
    typeof (value as any).access === 'string'
  )
}

/**
 * Type guard to check if a value is a TableInfo object
 */
export function isTableInfo(value: unknown): value is TableInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as any).id === 'string' &&
    'fields' in value &&
    Array.isArray((value as any).fields)
  )
}

/**
 * Type guard to check if a value is a GristRecord object
 */
export function isGristRecord(value: unknown): value is GristRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as any).id === 'number' &&
    'fields' in value &&
    typeof (value as any).fields === 'object'
  )
}

/**
 * Generic type guard factory for array validation
 * Creates a type guard that validates all items in an array
 *
 * @example
 * const isWorkspaceArray = isArrayOf(isWorkspaceInfo)
 * if (isWorkspaceArray(data)) {
 *   // data is WorkspaceInfo[]
 * }
 */
export function isArrayOf<T>(
  guard: (value: unknown) => value is T
): (value: unknown) => value is T[] {
  return (value: unknown): value is T[] => {
    return Array.isArray(value) && value.every(guard)
  }
}

/**
 * Type guard to check if a value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Assertion function that throws if value doesn't match the guard
 * Useful for validating external API responses
 *
 * @throws {TypeError} if the value doesn't match the type
 */
export function assertType<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
  message?: string
): asserts value is T {
  if (!guard(value)) {
    throw new TypeError(message || 'Type assertion failed')
  }
}

// ============================================================================
// Inference Helpers
// ============================================================================

/**
 * Extract element type from an array type
 */
export type ElementType<T> = T extends (infer U)[] ? U : never

/**
 * Extract promise type
 */
export type PromiseType<T> = T extends Promise<infer U> ? U : never

/**
 * Extract function return type
 */
export type ReturnTypeOf<T> = T extends (...args: any[]) => infer R ? R : never

/**
 * Extract function parameters as tuple
 */
export type ParametersOf<T> = T extends (...args: infer P) => any ? P : never

// ============================================================================
// Type Testing Utilities
// ============================================================================

/**
 * Assert that two types are equal
 * Used for compile-time type testing
 */
export type AssertEqual<T, U> =
  [T] extends [U]
    ? [U] extends [T]
      ? true
      : false
    : false

/**
 * Assert that T extends U
 */
export type AssertExtends<T, U> = T extends U ? true : false

/**
 * Assert that T does not extend U
 */
export type AssertNotExtends<T, U> = T extends U ? false : true
