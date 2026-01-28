/**
 * Operation Executors
 *
 * Generic executor functions for the four operation variants.
 * Each executor encapsulates the write-read-verify pattern:
 *
 * 1. Execute the write operation
 * 2. Read back for verification (if enabled)
 * 3. Verify the result matches expectations
 * 4. Throw VerificationError on mismatch
 * 5. Return the result
 */

import { VerificationError, type VerificationResult } from '../../../errors/VerificationError.js'
import type { ToolContext } from '../../../registry/types.js'
import { deepEqual, throwIfFailed, verifyDeleted, verifyEntities } from '../base.js'
import type {
  AddOperationConfig,
  DeleteOperationConfig,
  ExecutorOptions,
  RenameOperationConfig,
  UpdateOperationConfig
} from './types.js'

// =============================================================================
// Add Executor
// =============================================================================

/**
 * Execute an add/create operation with verification.
 *
 * @param config - Operation configuration
 * @param ctx - Tool context with client and schema cache
 * @param docId - Document ID
 * @param input - Operation input
 * @param options - Executor options (verify: boolean)
 * @returns The operation result
 * @throws VerificationError if verification fails
 */
export async function executeAdd<TInput, TEntity extends { id: unknown }, TResult>(
  config: AddOperationConfig<TInput, TEntity, TResult>,
  ctx: ToolContext,
  docId: string,
  input: TInput,
  options: ExecutorOptions = {}
): Promise<TResult> {
  const { verify = true } = options

  // 1. Execute write
  const written = await config.execute(ctx, docId, input)
  const entities = Array.isArray(written) ? written : [written]

  // 2. Post-execute hook (cache invalidation)
  if (config.afterExecute) {
    await config.afterExecute(ctx, docId, input)
  }

  // 3. Verify if requested
  if (verify) {
    const columnTypes = config.getColumnTypes
      ? await config.getColumnTypes(ctx, docId, input)
      : undefined

    const readEntities = await config.readBack(ctx, docId, written)

    // Filter out nulls for verification
    const nonNullRead = readEntities.filter((e): e is TEntity => e !== null)

    const verification = verifyEntities(entities, nonNullRead, {
      idField: 'id' as keyof TEntity,
      verifyFields: config.verifyFields,
      columnTypes,
      entityName: config.entityType
    })

    throwIfFailed(verification, {
      operation: config.name,
      entityType: config.entityType,
      entityId: config.buildEntityId(input, written)
    })
  }

  // 4. Build and return result
  return config.buildResult(entities, input)
}

// =============================================================================
// Update Executor
// =============================================================================

/** Verification check for update operations */
interface UpdateCheck {
  description: string
  passed: boolean
  field?: string
  expected: unknown
  actual: unknown
}

/** Build verification checks for a single entity's updated fields */
function buildEntityUpdateChecks<TInput, TEntity extends { id: unknown }>(
  entity: TEntity,
  readEntity: TEntity | null | undefined,
  input: TInput,
  entityType: string,
  getUpdatedFields: (input: TInput, entity: TEntity) => Record<string, unknown>,
  columnTypes: Map<string, string> | undefined
): UpdateCheck[] {
  if (!readEntity) {
    return [
      {
        description: `${entityType} ${String(entity.id)} not found after update`,
        passed: false,
        expected: entity,
        actual: null
      }
    ]
  }

  const checks: UpdateCheck[] = []
  const updatedFields = getUpdatedFields(input, entity)

  for (const [field, expected] of Object.entries(updatedFields)) {
    if (expected === undefined) continue

    const actual = (readEntity as Record<string, unknown>)[field]
    const colType = columnTypes?.get(field)
    const passed = deepEqual(expected, actual, colType)

    checks.push({
      description: `${entityType} ${String(entity.id)}.${field}`,
      passed,
      field,
      expected,
      actual
    })
  }

  return checks
}

/**
 * Execute an update/modify operation with verification.
 *
 * Only verifies fields that were actually updated (partial verification).
 */
export async function executeUpdate<TInput, TEntity extends { id: unknown }, TResult>(
  config: UpdateOperationConfig<TInput, TEntity, TResult>,
  ctx: ToolContext,
  docId: string,
  input: TInput,
  options: ExecutorOptions = {}
): Promise<TResult> {
  const { verify = true } = options

  // 1. Execute update
  const written = await config.execute(ctx, docId, input)
  const entities = Array.isArray(written) ? written : [written]

  // 2. Post-execute hook (cache invalidation)
  if (config.afterExecute) {
    await config.afterExecute(ctx, docId, input)
  }

  // 3. Verify if requested
  if (verify) {
    const columnTypes = config.getColumnTypes
      ? await config.getColumnTypes(ctx, docId, input)
      : undefined

    const readEntities = await config.readBack(ctx, docId, written)

    // Build verification checks for all entities
    const checks = entities.flatMap((entity, index) =>
      buildEntityUpdateChecks(
        entity,
        readEntities[index],
        input,
        config.entityType,
        config.getUpdatedFields,
        columnTypes
      )
    )

    const verification: VerificationResult = {
      passed: checks.every((c) => c.passed),
      checks
    }

    throwIfFailed(verification, {
      operation: config.name,
      entityType: config.entityType,
      entityId: config.buildEntityId(input, written)
    })
  }

  // 4. Build and return result
  return config.buildResult(entities, input)
}

// =============================================================================
// Delete Executor
// =============================================================================

/**
 * Execute a delete/remove operation with verification.
 *
 * Verification passes only if all deleted entities are gone.
 */
export async function executeDelete<TInput, TId, TResult, TEntity extends Record<string, unknown>>(
  config: DeleteOperationConfig<TInput, TId, TResult, TEntity>,
  ctx: ToolContext,
  docId: string,
  input: TInput,
  options: ExecutorOptions = {}
): Promise<TResult> {
  const { verify = true } = options

  // 1. Execute delete
  const deletedIds = await config.execute(ctx, docId, input)

  // 2. Post-execute hook (cache invalidation)
  if (config.afterExecute) {
    await config.afterExecute(ctx, docId, input)
  }

  // 3. Verify if requested
  if (verify) {
    const remaining = await config.readBack(ctx, docId, deletedIds)

    const verification = verifyDeleted<TEntity>(deletedIds, remaining, {
      idField: 'id' as keyof TEntity,
      entityName: config.entityType
    })

    throwIfFailed(verification, {
      operation: config.name,
      entityType: config.entityType,
      entityId: config.buildEntityId(input, deletedIds)
    })
  }

  // 4. Build and return result
  return config.buildResult(deletedIds, input)
}

// =============================================================================
// Rename Executor
// =============================================================================

/**
 * Execute a rename operation with verification.
 *
 * Verification checks that:
 * 1. Old entity no longer exists
 * 2. New entity exists
 */
export async function executeRename<TInput, TEntity, TResult>(
  config: RenameOperationConfig<TInput, TEntity, TResult>,
  ctx: ToolContext,
  docId: string,
  input: TInput,
  options: ExecutorOptions = {}
): Promise<TResult> {
  const { verify = true } = options

  // 1. Execute rename
  await config.execute(ctx, docId, input)

  // 2. Post-execute hook (cache invalidation)
  if (config.afterExecute) {
    await config.afterExecute(ctx, docId, input)
  }

  // 3. Verify if requested
  if (verify) {
    const [oldEntity, newEntity] = await Promise.all([
      config.readOld(ctx, docId, input),
      config.readNew(ctx, docId, input)
    ])

    const checks: Array<{
      description: string
      passed: boolean
      expected: unknown
      actual: unknown
    }> = []

    // Old entity should not exist
    checks.push({
      description: `Old ${config.entityType} should not exist`,
      passed: oldEntity === null,
      expected: 'deleted',
      actual: oldEntity === null ? 'deleted' : oldEntity
    })

    // New entity should exist
    checks.push({
      description: `New ${config.entityType} should exist`,
      passed: newEntity !== null,
      expected: 'exists',
      actual: newEntity === null ? null : 'exists'
    })

    const verification: VerificationResult = {
      passed: checks.every((c) => c.passed),
      checks
    }

    if (!verification.passed) {
      throw new VerificationError(verification, {
        operation: config.name,
        entityType: config.entityType,
        entityId: config.buildEntityId(input)
      })
    }

    if (newEntity === null) {
      throw new Error(`${config.entityType} not found after ${config.name} operation`)
    }

    return config.buildResult(newEntity, input)
  }

  // Without verification, still need to read new entity for result
  const newEntity = await config.readNew(ctx, docId, input)
  if (newEntity === null) {
    throw new Error(`${config.entityType} not found after ${config.name} operation`)
  }
  return config.buildResult(newEntity, input)
}

// =============================================================================
// Utility: Build Column Type Map
// =============================================================================

/**
 * Build a column type map from column metadata.
 *
 * This utility is used by configs that need column type normalization.
 * Exported here for reuse across config files.
 */
export function buildColumnTypeMap(
  columns: Array<{ id: string; fields: { type: string } }>
): Map<string, string> {
  return new Map(columns.map((c) => [c.id, c.fields.type]))
}

// Re-export types for convenience
export * from './types.js'
