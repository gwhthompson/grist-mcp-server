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
import { getSessionAnalytics } from '../../services/session-analytics.js'
import type { MCPToolResponse, ResponseFormat } from '../../types.js'
import type { PaginatedResponse } from '../base/PaginatedGristTool.js'
import type {
  BatchToolConfig,
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
    if (format === 'json' || format === 'markdown') {
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

function recordExecution(
  toolName: string,
  responseBytes: number,
  durationMs: number,
  success: boolean
): void {
  const analytics = getSessionAnalytics()
  if (analytics) {
    analytics.recordToolExecution(toolName, responseBytes, durationMs, success)
  }
}

function calculateResponseBytes(response: MCPToolResponse): number {
  try {
    return JSON.stringify(response).length
  } catch {
    return 0
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
    const startTime = Date.now()
    let success = false
    let response: MCPToolResponse | undefined

    try {
      const params = validateInput(config.inputSchema, rawParams, config.name)

      if (config.beforeExecute) {
        await config.beforeExecute(context, params)
      }

      let result = await config.execute(context, params)

      if (config.afterExecute) {
        result = await config.afterExecute(result, params, context)
      }

      const format = getResponseFormat(params)
      response = formatToolResponse(result, format)
      success = true
      return response
    } catch (error) {
      response = handleError(error)
      return response
    } finally {
      const durationMs = Date.now() - startTime
      const responseBytes = response ? calculateResponseBytes(response) : 0
      recordExecution(config.name, responseBytes, durationMs, success)
    }
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
export function definePaginatedTool<TInput extends ToolInputSchema, TItem>(
  config: Omit<PaginatedToolConfig<TInput, TItem>, 'kind'>
): ToolDefinition<TInput> {
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE

  const handler: ToolHandler<TInput> = async (context: ToolContext, rawParams: unknown) => {
    const startTime = Date.now()
    let success = false
    let response: MCPToolResponse | undefined

    try {
      const params = validateInput(config.inputSchema, rawParams, config.name)

      if (config.beforeExecute) {
        await config.beforeExecute(context, params)
      }

      // Fetch items
      let items = await config.fetchItems(context, params)

      // Filter if provided
      if (config.filterItems) {
        items = config.filterItems(items, params)
      }

      // Sort if provided
      if (config.sortItems) {
        items = config.sortItems(items, params)
      }

      // Paginate
      const offset = getOffset(params) ?? 0
      const limit = getLimit(params) ?? pageSize
      const paginatedItems = items.slice(offset, offset + limit)

      let result: PaginatedResponse<TItem> & { nextSteps?: string[] } = {
        items: paginatedItems,
        pagination: {
          total: items.length,
          offset,
          limit,
          hasMore: offset + limit < items.length,
          nextOffset: offset + limit < items.length ? offset + limit : null
        }
      }

      if (config.afterExecute) {
        result = await config.afterExecute(result, params, context)
      }

      const format = getResponseFormat(params)
      response = formatToolResponse(result, format)
      success = true
      return response
    } catch (error) {
      response = handleError(error)
      return response
    } finally {
      const durationMs = Date.now() - startTime
      const responseBytes = response ? calculateResponseBytes(response) : 0
      recordExecution(config.name, responseBytes, durationMs, success)
    }
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
export function defineBatchTool<
  TInput extends ToolInputSchema,
  TOperation,
  TResult extends BaseOperationResult,
  TResponse extends BaseBatchResponse<TResult>
>(
  config: Omit<BatchToolConfig<TInput, TOperation, TResult, TResponse>, 'kind'>
): ToolDefinition<TInput> {
  const handler: ToolHandler<TInput> = async (context: ToolContext, rawParams: unknown) => {
    const startTime = Date.now()
    let success = false
    let response: MCPToolResponse | undefined

    try {
      const params = validateInput(config.inputSchema, rawParams, config.name)

      if (config.beforeExecute) {
        await config.beforeExecute(context, params)
      }

      const operations = config.getOperations(params)
      const docId = config.getDocId(params)
      const completedResults: TResult[] = []

      // Execute operations sequentially
      for (const [i, operation] of operations.entries()) {
        try {
          const opResult = await config.executeOperation(context, docId, operation, i)
          completedResults.push(opResult)
        } catch (error) {
          // Build failure response with partial results
          const errorMessage = error instanceof Error ? error.message : String(error)
          let result = config.buildFailureResponse(
            docId,
            i,
            operation,
            completedResults,
            errorMessage,
            params
          )

          if (config.afterExecute) {
            result = await config.afterExecute(result, params, context)
          }

          const format = getResponseFormat(params)
          response = formatToolResponse(result, format)
          return response
        }
      }

      // All operations succeeded
      let result = config.buildSuccessResponse(docId, completedResults, params)

      if (config.afterExecute) {
        result = await config.afterExecute(result, params, context)
      }

      const format = getResponseFormat(params)
      response = formatToolResponse(result, format)
      success = true
      return response
    } catch (error) {
      response = handleError(error)
      return response
    } finally {
      const durationMs = Date.now() - startTime
      const responseBytes = response ? calculateResponseBytes(response) : 0
      recordExecution(config.name, responseBytes, durationMs, success)
    }
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
