/**
 * Abstract base class for tools that execute batches of operations sequentially.
 *
 * Eliminates duplicated batch operation loop pattern across:
 * - manage-records.ts
 * - manage-schema.ts
 * - manage-pages.ts
 *
 * Subclasses implement:
 * - getOperations(): Extract operations array from params
 * - getDocId(): Extract docId from params
 * - executeOperation(): Execute a single operation
 * - getActionName(): Get action name for error messages
 * - buildSuccessResponse(): Build the final success response
 * - buildFailureResponse(): Build the partial failure response
 */

import type { z } from 'zod'
import { GristTool } from './GristTool.js'

/**
 * Generic batch result with partial failure support.
 */
export interface BatchResult<TResult> {
  success: boolean
  docId: string
  operationsCompleted: number
  results: TResult[]
  message?: string
  partialFailure?: {
    operationIndex: number
    action: string
    error: string
    completedOperations: number
  }
}

/**
 * Abstract base class for batch operation tools.
 *
 * @typeParam TInput - Zod schema type for input validation
 * @typeParam TOperation - Type of individual operation in the batch
 * @typeParam TResult - Type of result from each operation
 * @typeParam TResponse - Type of the complete tool response
 */
export abstract class BatchOperationTool<
  TInput extends z.ZodType,
  TOperation,
  TResult,
  TResponse
> extends GristTool<TInput, TResponse> {
  /**
   * Extract the operations array from validated params.
   */
  protected abstract getOperations(params: z.infer<TInput>): TOperation[]

  /**
   * Extract the docId from validated params.
   */
  protected abstract getDocId(params: z.infer<TInput>): string

  /**
   * Execute a single operation and return its result.
   */
  protected abstract executeOperation(
    docId: string,
    operation: TOperation,
    index: number
  ): Promise<TResult>

  /**
   * Get the action name from an operation (for error messages).
   */
  protected abstract getActionName(operation: TOperation): string

  /**
   * Build the success response after all operations complete.
   */
  protected abstract buildSuccessResponse(
    docId: string,
    results: TResult[],
    params: z.infer<TInput>
  ): TResponse

  /**
   * Build the failure response when an operation fails.
   */
  protected abstract buildFailureResponse(
    docId: string,
    failedIndex: number,
    failedOperation: TOperation,
    completedResults: TResult[],
    errorMessage: string,
    params: z.infer<TInput>
  ): TResponse

  /**
   * Execute all operations in sequence, stopping on first failure.
   */
  protected async executeInternal(params: z.infer<TInput>): Promise<TResponse> {
    const docId = this.getDocId(params)
    const operations = this.getOperations(params)
    const results: TResult[] = []

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i]
      if (!op) continue

      try {
        const result = await this.executeOperation(docId, op, i)
        results.push(result)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return this.buildFailureResponse(docId, i, op, results, errorMessage, params)
      }
    }

    return this.buildSuccessResponse(docId, results, params)
  }
}
