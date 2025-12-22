/**
 * Tool factory type definitions.
 *
 * Uses discriminated unions with 'kind' literal for type-safe tool configuration.
 * Separate factory functions per tool kind provide better type inference.
 */

import type { z } from 'zod'
import type {
  ToolAnnotations,
  ToolCategory,
  ToolContext,
  ToolDocumentation
} from '../../registry/types.js'
import type {
  BaseBatchResponse,
  BaseOperationResult
} from '../../schemas/batch-operation-schemas.js'
import type { PaginatedResponse } from '../base/PaginatedGristTool.js'

/**
 * Constraint: all tool input schemas must be Zod object types.
 */
export type ToolInputSchema = z.ZodObject<z.ZodRawShape>

/**
 * Common metadata shared by all tool configurations.
 */
export interface ToolMetadata {
  /** Tool name (grist_verb_noun) */
  readonly name: string
  /** Human-readable title */
  readonly title: string
  /** Short description for MCP tool listing */
  readonly description: string
  /** One-line purpose for README table */
  readonly purpose: string
  /** Tool category */
  readonly category: ToolCategory
  /** MCP behavior annotations */
  readonly annotations: ToolAnnotations
  /** Structured documentation for help */
  readonly docs: ToolDocumentation
  /** Core tool flag for progressive disclosure */
  readonly core?: boolean
}

/**
 * Base tool configuration shared by all tool kinds.
 */
export interface BaseToolConfig<TInput extends ToolInputSchema> extends ToolMetadata {
  /** Zod schema for input validation */
  readonly inputSchema: TInput
  /** Zod schema for output validation (optional) */
  readonly outputSchema?: z.ZodType<unknown>
  /** Hook called before execution (validation, setup) */
  readonly beforeExecute?: (ctx: ToolContext, params: z.infer<TInput>) => Promise<void>
}

// =============================================================================
// Standard Tool
// =============================================================================

/**
 * Configuration for a standard (non-paginated, non-batch) tool.
 */
export interface StandardToolConfig<TInput extends ToolInputSchema, TOutput>
  extends BaseToolConfig<TInput> {
  readonly kind: 'standard'
  /** Execute the tool business logic */
  readonly execute: (ctx: ToolContext, params: z.infer<TInput>) => Promise<TOutput>
  /** Hook to modify result after execution (e.g., add nextSteps) */
  readonly afterExecute?: (
    result: TOutput,
    params: z.infer<TInput>,
    ctx: ToolContext
  ) => Promise<TOutput>
}

// =============================================================================
// Paginated Tool
// =============================================================================

/**
 * Configuration for a paginated tool that fetches, filters, and sorts items.
 */
export interface PaginatedToolConfig<TInput extends ToolInputSchema, TItem>
  extends BaseToolConfig<TInput> {
  readonly kind: 'paginated'
  /** Fetch items from the API */
  readonly fetchItems: (ctx: ToolContext, params: z.infer<TInput>) => Promise<TItem[]>
  /** Filter items based on params (optional) */
  readonly filterItems?: (items: TItem[], params: z.infer<TInput>) => TItem[]
  /** Sort items based on params (optional) */
  readonly sortItems?: (items: TItem[], params: z.infer<TInput>) => TItem[]
  /** Items per page (default: 100) */
  readonly pageSize?: number
  /** Hook to modify result after execution */
  readonly afterExecute?: (
    result: PaginatedResponse<TItem>,
    params: z.infer<TInput>,
    ctx: ToolContext
  ) => Promise<PaginatedResponse<TItem> & { nextSteps?: string[] }>
}

// =============================================================================
// Batch Tool
// =============================================================================

/**
 * Configuration for a batch operation tool that processes multiple operations.
 */
export interface BatchToolConfig<
  TInput extends ToolInputSchema,
  TOperation,
  TResult extends BaseOperationResult,
  TResponse extends BaseBatchResponse<TResult>
> extends BaseToolConfig<TInput> {
  readonly kind: 'batch'
  /** Extract operations from params */
  readonly getOperations: (params: z.infer<TInput>) => TOperation[]
  /** Extract document ID from params */
  readonly getDocId: (params: z.infer<TInput>) => string
  /** Get human-readable action name for an operation */
  readonly getActionName: (operation: TOperation) => string
  /** Execute a single operation */
  readonly executeOperation: (
    ctx: ToolContext,
    docId: string,
    operation: TOperation,
    index: number
  ) => Promise<TResult>
  /** Build success response from completed operations */
  readonly buildSuccessResponse: (
    docId: string,
    results: TResult[],
    params: z.infer<TInput>
  ) => TResponse
  /** Build failure response when an operation fails */
  readonly buildFailureResponse: (
    docId: string,
    failedIndex: number,
    failedOperation: TOperation,
    completedResults: TResult[],
    errorMessage: string,
    params: z.infer<TInput>
  ) => TResponse
  /** Hook to modify result after execution */
  readonly afterExecute?: (
    result: TResponse,
    params: z.infer<TInput>,
    ctx: ToolContext
  ) => Promise<TResponse>
}

// =============================================================================
// Discriminated Union
// =============================================================================

/**
 * Union of all tool configuration types.
 * The 'kind' field discriminates between variants for exhaustive type checking.
 */
export type ToolConfig<TInput extends ToolInputSchema> =
  | StandardToolConfig<TInput, unknown>
  | PaginatedToolConfig<TInput, unknown>
  | BatchToolConfig<TInput, unknown, BaseOperationResult, BaseBatchResponse<BaseOperationResult>>
