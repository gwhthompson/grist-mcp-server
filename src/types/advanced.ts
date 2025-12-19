import {
  type ColId,
  ColIdSchema,
  type DocId,
  DocIdSchema,
  type TableId,
  TableIdSchema
} from '../schemas/common.js'
import type {
  DetailLevelTable,
  DetailLevelWorkspace,
  PaginationMetadata,
  TableInfo,
  WorkspaceInfo
} from '../types.js'

// Re-export branded types from schemas (single source of truth)
export type { ColId, DocId, TableId }

// Brand helper for types that don't have Zod schemas
declare const brand: unique symbol
type Brand<T, TBrand extends string> = T & { [brand]: TBrand }

export type WorkspaceId = Brand<number, 'WorkspaceId'>
export type RowId = Brand<number, 'RowId'>
export type OrgId = Brand<number, 'OrgId'>
export type WebhookId = Brand<string, 'WebhookId'>
export type Timestamp = Brand<number, 'Timestamp'>
export type ViewId = Brand<number, 'ViewId'>
export type SectionId = Brand<number, 'SectionId'>
export type PageId = Brand<number, 'PageId'>

/** Parse and validate a DocId - uses Zod schema for full validation */
export function toDocId(raw: string): DocId {
  return DocIdSchema.parse(raw)
}

/** Parse and validate a TableId - uses Zod schema for full validation */
export function toTableId(raw: string): TableId {
  return TableIdSchema.parse(raw)
}

/** Safe DocId parse - returns null on invalid input */
export function safeToDocId(raw: string): DocId | null {
  const result = DocIdSchema.safeParse(raw)
  return result.success ? result.data : null
}

/** Safe TableId parse - returns null on invalid input */
export function safeToTableId(raw: string): TableId | null {
  const result = TableIdSchema.safeParse(raw)
  return result.success ? result.data : null
}

/** Safe ColId parse - returns null on invalid input */
export function safeToColId(raw: string): ColId | null {
  const result = ColIdSchema.safeParse(raw)
  return result.success ? result.data : null
}

export function toWorkspaceId(raw: number): WorkspaceId {
  return raw as WorkspaceId
}

export function toRowId(raw: number): RowId {
  return raw as RowId
}

/** Parse and validate a ColId - uses Zod schema for full validation (blocks gristHelper_ prefix) */
export function toColId(raw: string): ColId {
  return ColIdSchema.parse(raw)
}

export function toOrgId(raw: number): OrgId {
  return raw as OrgId
}

export function toWebhookId(raw: string): WebhookId {
  if (!raw || raw.trim().length === 0) {
    throw new TypeError('WebhookId cannot be empty')
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(raw)) {
    throw new TypeError(
      `Invalid WebhookId format: "${raw}". Must be a valid UUID (e.g., "a1b2c3d4-e5f6-7890-abcd-ef1234567890")`
    )
  }
  return raw as WebhookId
}

export function safeToWebhookId(raw: string): WebhookId | null {
  try {
    return toWebhookId(raw)
  } catch {
    return null
  }
}

export function toTimestamp(raw: number): Timestamp {
  if (!Number.isInteger(raw) || raw < 0) {
    throw new TypeError('Timestamp must be a non-negative integer')
  }
  return raw as Timestamp
}

export function safeToTimestamp(raw: number): Timestamp | null {
  try {
    return toTimestamp(raw)
  } catch {
    return null
  }
}

export function toViewId(raw: number): ViewId {
  return raw as ViewId
}

export function toSectionId(raw: number): SectionId {
  return raw as SectionId
}

export function toPageId(raw: number): PageId {
  return raw as PageId
}

export function fromBranded<T>(branded: Brand<T, string>): T {
  return branded as T
}

export type SummaryWorkspace = Pick<WorkspaceInfo, 'id' | 'name' | 'org' | 'access'>
export type DetailedWorkspace = WorkspaceInfo

export type WorkspaceResult<D extends DetailLevelWorkspace> = D extends 'detailed'
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
 */
export type TableResult<D extends DetailLevelTable> = D extends 'full_schema'
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
 */
export type ApiPath =
  | `/api/orgs/${number}`
  | `/api/orgs/${number}/workspaces`
  | `/api/orgs/${number}/access`
  | `/api/workspaces/${number}`
  | `/api/workspaces/${number}/docs`
  | `/api/workspaces/${number}/access`
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
  | `/api/docs/${string}/attachments`
  | `/api/docs/${string}/attachments/${number}`

/**
 * Helper type to build type-safe API paths
 */
export type BuildPath<TBase extends string, TParam extends string | number = never> = [
  TParam
] extends [never]
  ? TBase
  : `${TBase}/${TParam}`

// ============================================================================
// Generic Response Wrappers
// ============================================================================

/**
 * Generic tool response wrapper
 */
export interface ToolResponse<T> {
  content: Array<{
    type: 'text'
    text: string
  }>
  structuredContent: T
  isError?: boolean
}

/**
 * Generic paginated response wrapper
 */
export interface PaginatedResponse<T> {
  items: T[]
  pagination: PaginationMetadata
}

/**
 * Result type for operations that can succeed or fail
 */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E }
