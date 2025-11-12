/**
 * Tool Middleware System
 *
 * Composable middleware for cross-cutting concerns
 * Follows Open/Closed Principle - open for extension, closed for modification
 */

import type { z } from 'zod'
import type { ResponseCache } from '../../utils/response-cache.js'
import type { GristTool } from '../base/GristTool.js'

/**
 * Middleware function signature
 * Wraps tool execution with additional functionality
 */
export type ToolMiddleware<TResult = unknown> = (
  tool: GristTool<z.ZodTypeAny, unknown>,
  next: () => Promise<TResult>,
  params: unknown
) => Promise<TResult>

/**
 * Caching middleware
 * Caches tool responses to reduce API calls
 *
 * @param cache - Response cache instance
 * @param ttl - Time to live in milliseconds
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * const middleware = withCaching(cache, 60000)
 * ```
 */
export function withCaching(cache: ResponseCache, ttl: number = 60000): ToolMiddleware {
  return async (tool, next, params) => {
    // Generate cache key from tool name and params
    const cacheKey = JSON.stringify({ tool: tool.constructor.name, params })

    // Check cache
    const cached = cache.get(cacheKey)
    if (cached !== null) {
      return cached
    }

    // Execute and cache result
    const result = await next()
    cache.set(cacheKey, result, ttl)
    return result
  }
}

/**
 * Metrics middleware
 * Logs execution time and success/failure
 *
 * @param toolName - Name of the tool for logging
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * const middleware = withMetrics('get_documents')
 * ```
 */
export function withMetrics(toolName: string): ToolMiddleware {
  return async (_tool, next, _params) => {
    const start = Date.now()
    try {
      const result = await next()
      const duration = Date.now() - start
      console.error(`[METRIC] ${toolName}: ${duration}ms (success)`)
      return result
    } catch (error) {
      const duration = Date.now() - start
      console.error(`[METRIC] ${toolName}: ${duration}ms (failed)`)
      throw error
    }
  }
}

/**
 * Logging middleware
 * Logs tool execution details
 *
 * @param logLevel - Log level ('info' | 'debug')
 * @returns Middleware function
 */
export function withLogging(logLevel: 'info' | 'debug' = 'info'): ToolMiddleware {
  return async (tool, next, params) => {
    const toolName = tool.constructor.name

    if (logLevel === 'debug') {
      console.error(`[DEBUG] ${toolName} executing with params:`, JSON.stringify(params, null, 2))
    } else {
      console.error(`[INFO] ${toolName} executing`)
    }

    try {
      const result = await next()
      console.error(`[INFO] ${toolName} completed successfully`)
      return result
    } catch (error) {
      console.error(
        `[ERROR] ${toolName} failed:`,
        error instanceof Error ? error.message : String(error)
      )
      throw error
    }
  }
}

/**
 * Validation middleware
 * Pre-validates parameters before execution
 *
 * @param validator - Validation function
 * @returns Middleware function
 */
export function withValidation<_T>(
  validator: (params: unknown) => { valid: boolean; errors?: string[] }
): ToolMiddleware {
  return async (_tool, next, params) => {
    const validation = validator(params)
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors?.join(', ')}`)
    }
    return next()
  }
}

/**
 * Compose multiple middleware functions
 * Executes middleware in order (left to right)
 *
 * @param middlewares - Middleware functions to compose
 * @returns Composed middleware function
 *
 * @example
 * ```typescript
 * const composed = composeMiddleware(
 *   withLogging('info'),
 *   withCaching(cache, 60000),
 *   withMetrics('my_tool')
 * )
 * ```
 */
export function composeMiddleware(...middlewares: ToolMiddleware[]): ToolMiddleware {
  return async (tool, next, params) => {
    const _index = 0

    async function dispatch(i: number): Promise<unknown> {
      if (i >= middlewares.length) {
        return next()
      }

      const middleware = middlewares[i]
      return middleware(tool, () => dispatch(i + 1), params)
    }

    return dispatch(0)
  }
}

/**
 * Conditional middleware
 * Only applies middleware if condition is met
 *
 * @param condition - Condition function
 * @param middleware - Middleware to apply if condition is true
 * @returns Conditional middleware
 *
 * @example
 * ```typescript
 * const conditional = withCondition(
 *   (params) => params.useCache === true,
 *   withCaching(cache)
 * )
 * ```
 */
export function withCondition(
  condition: (params: unknown) => boolean,
  middleware: ToolMiddleware
): ToolMiddleware {
  return async (tool, next, params) => {
    if (condition(params)) {
      return middleware(tool, next, params)
    }
    return next()
  }
}
