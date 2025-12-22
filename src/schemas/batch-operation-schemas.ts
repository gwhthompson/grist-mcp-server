/**
 * Shared schemas for batch operation tools (manage-records, manage-schema, manage-pages)
 *
 * Provides factory functions to create consistent input/output schemas across all batch tools.
 */

import { z } from 'zod'
import { DocIdSchema, JsonObjectSchema, ResponseFormatSchema } from './common.js'

/**
 * Shared partial failure schema for batch operations.
 * Used when an operation fails partway through a batch.
 */
export const PartialFailureSchema = z.object({
  operationIndex: z.number().describe('Index of the failed operation (0-based)'),
  error: z.string().describe('Error message'),
  completedOperations: z.number().describe('Number of operations completed before failure')
})

/**
 * Base operation result schema with common fields.
 * Individual tools can extend this with operation-specific fields.
 */
export const BaseOperationResultSchema = z.object({
  action: z.string().describe('The action that was performed'),
  success: z.boolean().describe('Whether the operation succeeded'),
  verified: z.boolean().optional().describe('Whether the result was verified post-execution'),
  error: z.string().optional().describe('Error message if operation failed')
})

/**
 * Generic operation result with details as arbitrary JSON.
 * Used by manage-schema and manage-pages.
 */
export const GenericOperationResultSchema = BaseOperationResultSchema.extend({
  details: JsonObjectSchema.describe('Operation-specific details')
})

/**
 * Factory to create batch input schemas with consistent structure.
 *
 * @param operationSchema - Discriminated union schema for operations
 * @param maxOps - Maximum operations allowed (default 20)
 *
 * @example
 * const ManageSchemaSchema = createBatchInputSchema(SchemaOperationSchema, 50)
 */
export function createBatchInputSchema<T extends z.ZodType>(
  operationSchema: T,
  maxOps: number = 20
) {
  return z.strictObject({
    docId: DocIdSchema,
    operations: z
      .array(operationSchema)
      .min(1, { message: 'At least one operation is required' })
      .max(maxOps, { message: `Maximum ${maxOps} operations per request` }),
    response_format: ResponseFormatSchema
  })
}

/**
 * Factory to create batch output schemas with consistent structure.
 *
 * @param resultSchema - Schema for individual operation results
 *
 * @example
 * const ManageSchemaOutputSchema = createBatchOutputSchema(GenericOperationResultSchema)
 */
export function createBatchOutputSchema<TResult extends z.ZodType>(resultSchema: TResult) {
  return z.object({
    success: z.boolean().describe('Whether all operations succeeded'),
    docId: z.string().describe('Document ID'),
    operationsCompleted: z.number().describe('Number of operations completed'),
    results: z.array(resultSchema).describe('Results for each operation'),
    message: z.string().describe('Summary message'),
    partialFailure: PartialFailureSchema.optional().describe('Present if batch failed partway'),
    nextSteps: z.array(z.string()).optional().describe('Suggested follow-up actions')
  })
}

// =============================================================================
// TypeScript Interfaces (mirror Zod schemas for use in tool implementations)
// =============================================================================

/**
 * Partial failure info when a batch operation fails midway.
 */
export interface PartialFailure {
  operationIndex: number
  error: string
  completedOperations: number
}

/**
 * Base operation result - common fields for all batch operations.
 */
export interface BaseOperationResult {
  action: string
  success: boolean
  verified?: boolean
  error?: string
}

/**
 * Generic operation result with flexible details object.
 * Used by manage-schema and manage-pages.
 */
export interface GenericOperationResult extends BaseOperationResult {
  details: Record<string, unknown>
}

/**
 * Base batch response structure.
 * Tools can extend with tool-specific fields.
 */
export interface BaseBatchResponse<TResult extends BaseOperationResult> {
  success: boolean
  docId: string
  operationsCompleted: number
  results: TResult[]
  message: string
  partialFailure?: PartialFailure
  nextSteps?: string[]
}

/**
 * Standard batch response using GenericOperationResult.
 * Used by manage-schema and manage-pages.
 */
export type GenericBatchResponse = BaseBatchResponse<GenericOperationResult>

// =============================================================================
// Records-Specific Types (manage-records has additional fields)
// =============================================================================

/**
 * Records-specific operation result with affected count and IDs.
 */
export interface RecordOperationResult extends BaseOperationResult {
  tableId: string
  recordsAffected: number
  recordIds?: number[]
  filtersUsed?: Record<string, unknown>
}

/**
 * Records-specific partial failure with table context.
 */
export interface RecordPartialFailure extends PartialFailure {
  tableId: string
}

/**
 * Records batch response with table tracking.
 */
export interface RecordsBatchResponse
  extends Omit<BaseBatchResponse<RecordOperationResult>, 'partialFailure'> {
  tablesAffected: string[]
  totalRecordsAffected: number
  partialFailure?: RecordPartialFailure
}
