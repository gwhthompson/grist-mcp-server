/**
 * Generic Entity Operations Types
 *
 * Defines the common interface that all entity operations implement.
 * This ensures consistent CRUD + verification pattern across:
 * - Records
 * - Columns
 * - Tables
 * - Pages
 * - Widgets
 */

import type { z } from 'zod'

// =============================================================================
// Result Types
// =============================================================================

/**
 * Result of a verified write operation.
 * The `verified` field is always true if the result is returned
 * (verification failure throws VerificationError instead).
 */
export interface VerifiedResult<T> {
  entity: T
  verified: true
}

/**
 * Result of a verified batch write operation.
 */
export interface VerifiedBatchResult<T> {
  entities: T[]
  count: number
  verified: true
}

/**
 * Result of a verified delete operation.
 */
export interface VerifiedDeleteResult {
  deleted: true
  verified: true
}

/**
 * Result of a verified batch delete operation.
 */
export interface VerifiedBatchDeleteResult {
  deletedIds: number[]
  count: number
  verified: true
}

// =============================================================================
// Operation Options
// =============================================================================

/**
 * Common options for write operations.
 */
export interface WriteOptions {
  /** Skip verification read-back (default: true = verify) */
  verify?: boolean
}

// =============================================================================
// Entity Filter Types
// =============================================================================

/**
 * Filter for querying entities.
 * Specific to each entity type.
 */
export interface EntityFilter {
  ids?: number[]
  [key: string]: unknown
}

// =============================================================================
// Core Entity Operations Interface
// =============================================================================

/**
 * Generic interface for entity operations.
 *
 * All entity modules implement this interface to ensure:
 * 1. Consistent CRUD method signatures
 * 2. Built-in verification for all write operations
 * 3. Type-safe entity handling
 *
 * Entity-specific operations (rename, link, configure) extend this interface.
 *
 * @example
 * ```typescript
 * // Records implementation
 * const recordOps: EntityOperations<DomainRecord, RecordLocator> = {
 *   schema: DomainRecordSchema,
 *   verifyFields: ['fields'],
 *   get: async (ctx, docId, tableId, id) => ...,
 *   getAll: async (ctx, docId, filter) => ...,
 *   add: async (ctx, docId, input, options) => ...,
 *   update: async (ctx, docId, tableId, id, updates, options) => ...,
 *   delete: async (ctx, docId, tableId, id, options) => ...,
 * }
 * ```
 */
export interface EntityOperations<
  TEntity,
  TSchema extends z.ZodType<TEntity> = z.ZodType<TEntity>
> {
  /** Zod schema for validation and type derivation */
  readonly schema: TSchema

  /** Fields to compare during verification */
  readonly verifyFields: readonly (keyof TEntity)[]

  /** Human-readable entity name for error messages */
  readonly entityName: string
}

// =============================================================================
// Specific Entity Locator Types
// =============================================================================

/**
 * Locator for records: (tableId, rowId)
 */
export interface RecordLocator {
  tableId: string
  id: number
}

/**
 * Locator for columns: (tableId, colId)
 */
export interface ColumnLocator {
  tableId: string
  colId: string
}

/**
 * Locator for tables: (tableId)
 */
export interface TableLocator {
  tableId: string
}

/**
 * Locator for pages: (viewId)
 */
export interface PageLocator {
  viewId: number
}

/**
 * Locator for widgets: (sectionId)
 */
export interface WidgetLocator {
  sectionId: number
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Extract the ID field value from an entity.
 */
export type EntityId<T> = T extends { id: infer ID } ? ID : never

/**
 * Input type for adding an entity (entity without ID).
 */
export type AddInput<T> = Omit<T, 'id'>

/**
 * Input type for updating an entity (partial fields).
 */
export type UpdateInput<T> = Partial<T>

/**
 * Type for column type map used in normalization.
 */
export type ColumnTypeMap = Map<string, string>

/**
 * Normalizer function for value comparison.
 */
export type ValueNormalizer = (value: unknown, columnType?: string) => unknown
