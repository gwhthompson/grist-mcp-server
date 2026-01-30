/**
 * Tool factory functions for declarative tool definition.
 *
 * Reduces boilerplate by converting configuration objects into ToolDefinitions.
 * Each factory function is specialized per tool kind for optimal type inference.
 */

import type { z } from 'zod'
import { isGristError, ValidationError } from '../../errors/index.js'
import type { ToolContext, ToolDefinition, ToolHandler } from '../../registry/types.js'
import type {
  BaseBatchResponse,
  BaseOperationResult
} from '../../schemas/batch-operation-schemas.js'
import { formatErrorResponse, formatToolResponse } from '../../services/formatter.js'
import type { MCPToolResponse, ResponseFormat } from '../../types.js'
import type {
  BatchToolConfig,
  PaginatedResponse,
  PaginatedToolConfig,
  StandardToolConfig,
  ToolInputSchema,
  ToolMetadata
} from './types.js'

// =============================================================================
// Helper Functions
// =============================================================================

function getResponseFormat(params: unknown): ResponseFormat {
  if (typeof params === 'object' && params !== null && 'response_format' in params) {
    const record = params as Record<string, unknown>
    const format = record.response_format
    if (format === 'json' || format === 'markdown' || format === 'concise') {
      return format
    }
  }
  return 'json'
}

function validateInput<TInput extends ToolInputSchema>(
  schema: TInput,
  params: unknown,
  toolName: string
): z.infer<TInput> {
  const result = schema.safeParse(params)
  if (!result.success) {
    throw ValidationError.fromZodError(result.error, 'Invalid tool parameters', toolName)
  }
  return result.data
}

function handleError(error: unknown): MCPToolResponse {
  if (isGristError(error)) {
    return formatErrorResponse(error.toUserMessage(), {
      errorCode: error.code,
      retryable: error.isRetryable(),
      suggestions: error.getSuggestions(),
      context: error.context
    })
  }
  if (error instanceof Error) {
    return formatErrorResponse(error.message)
  }
  return formatErrorResponse(String(error))
}

/** Execute core logic with error handling */
async function executeWithErrorHandling(
  execute: () => Promise<MCPToolResponse>
): Promise<MCPToolResponse> {
  try {
    return await execute()
  } catch (error) {
    return handleError(error)
  }
}

// =============================================================================
// Standard Tool Factory
// =============================================================================

/**
 * Create a standard tool definition.
 * Best for simple tools that execute once and return a result.
 *
 * @example
 * ```ts
 * const CREATE_DOC_TOOL = defineStandardTool({
 *   name: 'grist_create_document',
 *   inputSchema: CreateDocumentSchema,
 *   // ... metadata
 *   async execute(ctx, params) {
 *     const docId = await ctx.client.post(...)
 *     return { success: true, docId }
 *   }
 * })
 * ```
 */
export function defineStandardTool<TInput extends ToolInputSchema, TOutput>(
  config: Omit<StandardToolConfig<TInput, TOutput>, 'kind'>
): ToolDefinition<TInput> {
  const handler: ToolHandler<TInput> = async (context: ToolContext, rawParams: unknown) => {
    return await executeWithErrorHandling(async () => {
      const params = validateInput(config.inputSchema, rawParams, config.name)

      if (config.beforeExecute) {
        await config.beforeExecute(context, params)
      }

      let result = await config.execute(context, params)

      if (config.afterExecute) {
        result = await config.afterExecute(result, params, context)
      }

      return formatToolResponse(result, getResponseFormat(params))
    })
  }

  return createToolDefinition(config, handler)
}

// =============================================================================
// Paginated Tool Factory
// =============================================================================

const DEFAULT_PAGE_SIZE = 100

/**
 * Create a paginated tool definition.
 * Handles fetching, filtering, sorting, and pagination of items.
 *
 * @example
 * ```ts
 * const GET_WORKSPACES_TOOL = definePaginatedTool({
 *   name: 'grist_get_workspaces',
 *   inputSchema: GetWorkspacesSchema,
 *   // ... metadata
 *   async fetchItems(ctx) {
 *     return ctx.client.get('/orgs/current/workspaces')
 *   },
 *   filterItems(items, params) {
 *     return params.name ? items.filter(w => w.name.includes(params.name)) : items
 *   }
 * })
 * ```
 */
/** Apply optional filter and sort to items */
function processItems<TItem, TParams>(
  items: TItem[],
  params: TParams,
  filterItems?: (items: TItem[], params: TParams) => TItem[],
  sortItems?: (items: TItem[], params: TParams) => TItem[]
): TItem[] {
  let result = items
  if (filterItems) result = filterItems(result, params)
  if (sortItems) result = sortItems(result, params)
  return result
}

/** Build paginated response from items */
function buildPaginatedResponse<TItem>(
  items: TItem[],
  offset: number,
  limit: number
): PaginatedResponse<TItem> {
  const paginatedItems = items.slice(offset, offset + limit)
  const hasMore = offset + limit < items.length
  return {
    items: paginatedItems,
    total: items.length,
    offset,
    limit,
    hasMore,
    nextOffset: hasMore ? offset + limit : null
  }
}

export function definePaginatedTool<TInput extends ToolInputSchema, TItem>(
  config: Omit<PaginatedToolConfig<TInput, TItem>, 'kind'>
): ToolDefinition<TInput> {
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE

  const handler: ToolHandler<TInput> = async (context: ToolContext, rawParams: unknown) => {
    return await executeWithErrorHandling(async () => {
      const params = validateInput(config.inputSchema, rawParams, config.name)

      if (config.beforeExecute) {
        await config.beforeExecute(context, params)
      }

      const rawItems = await config.fetchItems(context, params)
      const items = processItems(rawItems, params, config.filterItems, config.sortItems)

      const offset = getOffset(params) ?? 0
      const limit = getLimit(params) ?? pageSize
      let result: PaginatedResponse<TItem> & { nextSteps?: string[] } = buildPaginatedResponse(
        items,
        offset,
        limit
      )

      if (config.afterExecute) {
        result = await config.afterExecute(result, params, context)
      }

      return formatToolResponse(result, getResponseFormat(params))
    })
  }

  return createToolDefinition(config, handler)
}

function getOffset(params: unknown): number | undefined {
  if (typeof params === 'object' && params !== null && 'offset' in params) {
    const val = (params as Record<string, unknown>).offset
    return typeof val === 'number' ? val : undefined
  }
  return undefined
}

function getLimit(params: unknown): number | undefined {
  if (typeof params === 'object' && params !== null && 'limit' in params) {
    const val = (params as Record<string, unknown>).limit
    return typeof val === 'number' ? val : undefined
  }
  return undefined
}

// =============================================================================
// Batch Tool Factory
// =============================================================================

/**
 * Create a batch operation tool definition.
 * Executes multiple operations sequentially with partial failure support.
 *
 * @example
 * ```ts
 * const MANAGE_RECORDS_TOOL = defineBatchTool({
 *   name: 'grist_manage_records',
 *   inputSchema: ManageRecordsSchema,
 *   // ... metadata
 *   getOperations: (params) => params.operations,
 *   getDocId: (params) => params.docId,
 *   async executeOperation(ctx, docId, op, index) {
 *     // Execute single operation
 *   },
 *   buildSuccessResponse(docId, results, params) {
 *     return { success: true, ... }
 *   },
 *   buildFailureResponse(docId, failedIndex, op, completed, error) {
 *     return { success: false, partialFailure: { ... } }
 *   }
 * })
 * ```
 */
/** Result of batch execution - either success with all results or failure at specific index */
type BatchExecutionResult<TResult, TOperation> =
  | { success: true; results: TResult[] }
  | {
      success: false
      failedIndex: number
      operation: TOperation
      results: TResult[]
      error: string
    }

/** Execute batch operations sequentially, capturing partial failures */
async function executeBatchOperations<TOperation, TResult>(
  operations: TOperation[],
  executeOne: (op: TOperation, index: number) => Promise<TResult>
): Promise<BatchExecutionResult<TResult, TOperation>> {
  const results: TResult[] = []

  for (const [i, operation] of operations.entries()) {
    try {
      results.push(await executeOne(operation, i))
    } catch (error) {
      return {
        success: false,
        failedIndex: i,
        operation,
        results,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  return { success: true, results }
}

export function defineBatchTool<
  TInput extends ToolInputSchema,
  TOperation,
  TResult extends BaseOperationResult,
  TResponse extends BaseBatchResponse<TResult>
>(
  config: Omit<BatchToolConfig<TInput, TOperation, TResult, TResponse>, 'kind'>
): ToolDefinition<TInput> {
  const handler: ToolHandler<TInput> = async (context: ToolContext, rawParams: unknown) => {
    return await executeWithErrorHandling(async () => {
      const params = validateInput(config.inputSchema, rawParams, config.name)

      if (config.beforeExecute) {
        await config.beforeExecute(context, params)
      }

      const operations = config.getOperations(params)
      const docId = config.getDocId(params)

      const batchResult = await executeBatchOperations(operations, (op, i) =>
        config.executeOperation(context, docId, op, i)
      )

      let result: TResponse
      if (batchResult.success) {
        result = config.buildSuccessResponse(docId, batchResult.results, params)
      } else {
        result = config.buildFailureResponse(
          docId,
          batchResult.failedIndex,
          batchResult.operation,
          batchResult.results,
          batchResult.error,
          params
        )
      }

      if (config.afterExecute) {
        result = await config.afterExecute(result, params, context)
      }

      return formatToolResponse(result, getResponseFormat(params))
    })
  }

  return createToolDefinition(config, handler)
}

// =============================================================================
// Common Definition Builder
// =============================================================================

function createToolDefinition<TInput extends ToolInputSchema>(
  config: ToolMetadata & { inputSchema: TInput; outputSchema?: z.ZodType<unknown> },
  handler: ToolHandler<TInput>
): ToolDefinition<TInput> {
  return {
    name: config.name,
    title: config.title,
    description: config.description,
    purpose: config.purpose,
    category: config.category,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    annotations: config.annotations,
    handler,
    docs: config.docs,
    core: config.core
  }
}
