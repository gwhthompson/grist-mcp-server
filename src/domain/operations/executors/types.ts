/**
 * Executor Type Definitions
 *
 * Configuration-driven types for the four operation variants:
 * - Add/Create: Write → Extract IDs → Build entity → Verify match
 * - Update/Modify: Write → Read back → Verify changed fields only
 * - Delete/Remove: Write → Verify entity is gone
 * - Rename: Write → Verify old gone AND new exists
 *
 * Each config object contains everything needed to execute and verify an operation.
 * This enables type-safe, testable, composable operations following modern TS patterns.
 */

import type { ToolContext } from '../../../registry/types.js'
import type { ColumnTypeMap, WriteOptions } from '../types.js'

// =============================================================================
// Base Configuration
// =============================================================================

/**
 * Base configuration shared by all operation types.
 */
export interface BaseOperationConfig {
  /** Operation name for error messages (e.g., 'addRecords') */
  readonly name: string
  /** Entity type for error messages (e.g., 'Record') */
  readonly entityType: string
}

// =============================================================================
// Add Operation
// =============================================================================

/**
 * Configuration for add/create operations.
 *
 * Flow: execute → readBack → verify(verifyFields) → buildResult
 *
 * @example
 * ```typescript
 * const addRecordsConfig: AddOperationConfig<AddRecordsInput, DomainRecord, AddRecordsResult> = {
 *   variant: 'add',
 *   name: 'addRecords',
 *   entityType: 'Record',
 *   verifyFields: ['fields'],
 *   execute: async (ctx, docId, input) => { ... },
 *   readBack: async (ctx, docId, written) => { ... },
 *   buildEntityId: (input, written) => `${input.tableId}:[${ids}]`,
 *   buildResult: (entities) => ({ records: entities, count: entities.length })
 * }
 * ```
 */
export interface AddOperationConfig<TInput, TEntity, TResult> extends BaseOperationConfig {
  readonly variant: 'add'

  /** Fields to compare during verification */
  readonly verifyFields: readonly (keyof TEntity)[]

  /**
   * Execute the write operation.
   * Should return the written entities with their assigned IDs.
   */
  execute: (ctx: ToolContext, docId: string, input: TInput) => Promise<TEntity | TEntity[]>

  /**
   * Read back entities for verification.
   * Called with the written entities to fetch their current state.
   */
  readBack: (
    ctx: ToolContext,
    docId: string,
    written: TEntity | TEntity[]
  ) => Promise<(TEntity | null)[]>

  /**
   * Build entity ID string for error messages.
   */
  buildEntityId: (input: TInput, written: TEntity | TEntity[]) => string

  /**
   * Transform verified entities into the final result.
   */
  buildResult: (entities: TEntity[], input: TInput) => TResult

  /**
   * Optional: Get column types for value normalization during verification.
   * Required for record operations where timestamps need normalization.
   */
  getColumnTypes?: (ctx: ToolContext, docId: string, input: TInput) => Promise<ColumnTypeMap>

  /**
   * Optional: Post-execution hook for cache invalidation.
   */
  afterExecute?: (ctx: ToolContext, docId: string, input: TInput) => Promise<void>
}

// =============================================================================
// Update Operation
// =============================================================================

/**
 * Configuration for update/modify operations.
 *
 * Flow: execute → readBack → verify(updatedFields only) → buildResult
 *
 * Only verifies fields that were actually updated (partial verification).
 */
export interface UpdateOperationConfig<TInput, TEntity, TResult> extends BaseOperationConfig {
  readonly variant: 'update'

  /**
   * Execute the update operation.
   * Returns the updated entities.
   */
  execute: (ctx: ToolContext, docId: string, input: TInput) => Promise<TEntity | TEntity[]>

  /**
   * Read back entities for verification.
   */
  readBack: (
    ctx: ToolContext,
    docId: string,
    written: TEntity | TEntity[]
  ) => Promise<(TEntity | null)[]>

  /**
   * Extract the updated fields from input for partial verification.
   * Only these fields will be compared during verification.
   */
  getUpdatedFields: (input: TInput, entity: TEntity) => Partial<TEntity>

  /**
   * Build entity ID string for error messages.
   */
  buildEntityId: (input: TInput, written: TEntity | TEntity[]) => string

  /**
   * Transform verified entities into the final result.
   */
  buildResult: (entities: TEntity[], input: TInput) => TResult

  /**
   * Optional: Get column types for value normalization.
   */
  getColumnTypes?: (ctx: ToolContext, docId: string, input: TInput) => Promise<ColumnTypeMap>

  /**
   * Optional: Post-execution hook for cache invalidation.
   */
  afterExecute?: (ctx: ToolContext, docId: string, input: TInput) => Promise<void>
}

// =============================================================================
// Delete Operation
// =============================================================================

/**
 * Configuration for delete/remove operations.
 *
 * Flow: execute → readBack → verify(none exist) → buildResult
 *
 * Verification passes only if all deleted entities are gone.
 */
export interface DeleteOperationConfig<
  TInput,
  TId,
  TResult,
  TEntity extends Record<string, unknown> = Record<string, unknown>
> extends BaseOperationConfig {
  readonly variant: 'delete'

  /**
   * Execute the delete operation.
   * Returns the IDs of deleted entities.
   */
  execute: (ctx: ToolContext, docId: string, input: TInput) => Promise<TId[]>

  /**
   * Read back to check if entities still exist.
   * Should return only the entities that still exist (ideally empty).
   */
  readBack: (ctx: ToolContext, docId: string, deletedIds: TId[]) => Promise<TEntity[]>

  /**
   * Build entity ID string for error messages.
   */
  buildEntityId: (input: TInput, deletedIds: TId[]) => string

  /**
   * Transform result into the final shape.
   */
  buildResult: (deletedIds: TId[], input: TInput) => TResult

  /**
   * Optional: Post-execution hook for cache invalidation.
   */
  afterExecute?: (ctx: ToolContext, docId: string, input: TInput) => Promise<void>
}

// =============================================================================
// Rename Operation
// =============================================================================

/**
 * Configuration for rename operations.
 *
 * Flow: execute → readOld → readNew → verify(old gone AND new exists) → buildResult
 *
 * A rename is essentially: delete old name + create new name.
 */
export interface RenameOperationConfig<TInput, TEntity, TResult> extends BaseOperationConfig {
  readonly variant: 'rename'

  /**
   * Execute the rename operation.
   */
  execute: (ctx: ToolContext, docId: string, input: TInput) => Promise<void>

  /**
   * Check if old entity still exists (should be null after rename).
   */
  readOld: (ctx: ToolContext, docId: string, input: TInput) => Promise<TEntity | null>

  /**
   * Read the new entity (should exist after rename).
   */
  readNew: (ctx: ToolContext, docId: string, input: TInput) => Promise<TEntity | null>

  /**
   * Build entity ID string for error messages.
   * Should include both old and new IDs (e.g., "OldName → NewName").
   */
  buildEntityId: (input: TInput) => string

  /**
   * Transform result into the final shape.
   */
  buildResult: (entity: TEntity, input: TInput) => TResult

  /**
   * Optional: Post-execution hook for cache invalidation.
   */
  afterExecute?: (ctx: ToolContext, docId: string, input: TInput) => Promise<void>
}

// =============================================================================
// Union Type
// =============================================================================

/**
 * Discriminated union of all operation config types.
 */
export type OperationConfig<
  TInput,
  TEntity extends Record<string, unknown>,
  TResult,
  TId = unknown
> =
  | AddOperationConfig<TInput, TEntity, TResult>
  | UpdateOperationConfig<TInput, TEntity, TResult>
  | DeleteOperationConfig<TInput, TId, TResult, TEntity>
  | RenameOperationConfig<TInput, TEntity, TResult>

// =============================================================================
// Executor Options
// =============================================================================

/**
 * Options passed to executor functions.
 */
export interface ExecutorOptions extends WriteOptions {
  /** Skip verification (default: true = verify) */
  verify?: boolean
}
