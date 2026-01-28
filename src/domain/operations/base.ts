/**
 * Generic Entity Operation Utilities
 *
 * Shared utilities for verification, comparison, and normalization.
 * Used by all entity operations (records, columns, tables, pages, widgets).
 */

import {
  createFailingResult,
  type VerificationCheck,
  VerificationError,
  type VerificationResult
} from '../../errors/VerificationError.js'
import { decodeFromApi, encodeForApi } from '../../schemas/cell-codecs.js'
import type { ColumnMetadata } from '../../services/schema-cache.js'
import type { ColumnTypeMap, ValueNormalizer } from './types.js'

// =============================================================================
// Column Type Utilities
// =============================================================================

/**
 * Build a column type map from column metadata.
 *
 * This pattern appears frequently across read and write operations.
 * Centralizing it ensures consistency and reduces duplication.
 *
 * @param columns - Column metadata from schema cache
 * @returns Map of column ID to column type string
 */
export function buildColumnTypeMap(columns: ColumnMetadata[]): ColumnTypeMap {
  return new Map(columns.map((c) => [c.id, c.fields.type]))
}

// =============================================================================
// Value Normalization
// =============================================================================

/**
 * Normalize a value using codec round-trip.
 *
 * Encodes to API format, then decodes back to ensure canonical form.
 * This leverages existing codecs for DRY normalization.
 *
 * @example
 * ```typescript
 * // DateTime normalization
 * normalizeValue('2024-12-25T10:30:00Z', 'DateTime')
 * // Returns: '2024-12-25T10:30:00.000Z' (canonical form)
 * ```
 */
export function normalizeValue(value: unknown, columnType: string): unknown {
  if (value === null || value === undefined) return value
  const encoded = encodeForApi(value, columnType)
  return decodeFromApi(encoded, columnType)
}

/**
 * Create a normalizer function for a specific column type map.
 */
export function createNormalizer(_columnTypes: ColumnTypeMap): ValueNormalizer {
  return (value: unknown, columnType?: string) => {
    if (columnType) {
      return normalizeValue(value, columnType)
    }
    return value
  }
}

// =============================================================================
// Deep Equality
// =============================================================================

/**
 * Deep equality check with optional type-aware normalization.
 *
 * Uses codec round-trip to ensure values are in canonical form before comparison.
 * This handles cases like DateTime format differences:
 * - '2024-12-25T10:30:00Z' vs '2024-12-25T10:30:00.000Z'
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @param columnType - Optional column type for normalization
 */
export function deepEqual(a: unknown, b: unknown, columnType?: string): boolean {
  // Normalize values if column type is provided
  const valA = columnType ? normalizeValue(a, columnType) : a
  const valB = columnType ? normalizeValue(b, columnType) : b

  // Identity check
  if (valA === valB) return true

  // Null check
  if (valA === null || valB === null) return valA === valB

  // Type check
  if (typeof valA !== typeof valB) return false

  // Array comparison
  if (Array.isArray(valA) && Array.isArray(valB)) {
    if (valA.length !== valB.length) return false
    return valA.every((val, i) => deepEqual(val, valB[i]))
  }

  // Object comparison
  if (typeof valA === 'object' && typeof valB === 'object') {
    const aObj = valA as Record<string, unknown>
    const bObj = valB as Record<string, unknown>
    const keys = Object.keys(aObj)
    if (keys.length !== Object.keys(bObj).length) return false
    return keys.every((key) => deepEqual(aObj[key], bObj[key]))
  }

  return false
}

// =============================================================================
// Generic Verification
// =============================================================================

/**
 * Generic entity verification.
 *
 * Compares written entities against read-back entities.
 * Only compares fields specified in verifyFields (subset comparison).
 *
 * @param written - Entities that were written
 * @param read - Entities read back from the database
 * @param config - Verification configuration
 * @returns Verification result with detailed checks
 *
 * @example
 * ```typescript
 * const result = verifyEntities(
 *   writtenRecords,
 *   readRecords,
 *   {
 *     idField: 'id',
 *     verifyFields: ['fields'],
 *     columnTypes: columnTypeMap,
 *     entityName: 'Record'
 *   }
 * )
 * ```
 */
export function verifyEntities<T extends Record<string, unknown>>(
  written: T[],
  read: T[],
  config: {
    idField: keyof T
    verifyFields: readonly (keyof T)[]
    columnTypes?: ColumnTypeMap
    entityName?: string
  }
): VerificationResult {
  const startTime = Date.now()
  const checks: VerificationCheck[] = []
  const { idField, verifyFields, columnTypes, entityName = 'Entity' } = config

  for (const w of written) {
    const writtenId = w[idField]
    const r = read.find((rec) => rec[idField] === writtenId)

    if (!r) {
      checks.push({
        description: `${entityName} ${String(writtenId)} not found`,
        passed: false,
        expected: w,
        actual: null
      })
      continue
    }

    // Verify each field
    for (const field of verifyFields) {
      const expected = w[field]
      const actual = r[field]

      // For nested objects (like 'fields' in records), compare each property
      if (typeof expected === 'object' && expected !== null && !Array.isArray(expected)) {
        const expectedObj = expected as Record<string, unknown>
        const actualObj = (actual as Record<string, unknown>) ?? {}

        for (const [key, expectedValue] of Object.entries(expectedObj)) {
          const actualValue = actualObj[key]
          const colType = columnTypes?.get(key)
          const passed = deepEqual(expectedValue, actualValue, colType)

          checks.push({
            description: `${entityName} ${String(writtenId)}.${String(field)}.${key}`,
            passed,
            field: `${String(field)}.${key}`,
            expected: expectedValue,
            actual: actualValue
          })
        }
      } else {
        // Direct comparison for simple fields
        const colType = columnTypes?.get(String(field))
        const passed = deepEqual(expected, actual, colType)

        checks.push({
          description: `${entityName} ${String(writtenId)}.${String(field)}`,
          passed,
          field: String(field),
          expected,
          actual
        })
      }
    }
  }

  return {
    passed: checks.every((c) => c.passed),
    checks,
    duration: Date.now() - startTime
  }
}

/**
 * Verify that entities were deleted.
 *
 * Checks that the specified entities no longer exist after deletion.
 *
 * @param deletedIds - IDs that were deleted
 * @param remaining - Entities that still exist (should be empty for success)
 * @param config - Verification configuration
 */
export function verifyDeleted<T extends Record<string, unknown>>(
  deletedIds: unknown[],
  remaining: T[],
  config: {
    idField: keyof T
    entityName?: string
  }
): VerificationResult {
  const { idField, entityName = 'Entity' } = config

  if (remaining.length === 0) {
    return {
      passed: true,
      checks: deletedIds.map((id) => ({
        description: `${entityName} ${String(id)} deleted`,
        passed: true,
        expected: 'deleted',
        actual: 'deleted'
      }))
    }
  }

  const checks: VerificationCheck[] = remaining.map((r) => ({
    description: `${entityName} ${String(r[idField])} still exists after delete`,
    passed: false,
    expected: 'deleted',
    actual: r
  }))

  return createFailingResult(
    checks,
    `${remaining.length} ${entityName.toLowerCase()}(s) still exist after delete: ${remaining.map((r) => r[idField]).join(', ')}`
  )
}

/**
 * Throw a VerificationError if verification failed.
 *
 * @param result - Verification result to check
 * @param context - Error context for the VerificationError
 */
export function throwIfFailed(
  result: VerificationResult,
  context: {
    operation: string
    entityType: string
    entityId: string
  }
): void {
  if (!result.passed) {
    throw new VerificationError(result, context)
  }
}
