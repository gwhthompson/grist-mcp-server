/**
 * Abstract Base Class for Grist MCP Tools
 *
 * Provides common functionality for all tools including:
 * - Automatic input validation using Zod schemas
 * - Standardized error handling
 * - Response formatting
 * - Pre/post execution hooks for middleware
 *
 * This eliminates ~800+ lines of duplicate code across tool implementations
 */

import type { z } from 'zod'
import { isGristError, ValidationError } from '../../errors/index.js'
import { formatErrorResponse, formatToolResponse } from '../../services/formatter.js'
import type { GristClient } from '../../services/grist-client.js'
import type { MCPToolResponse, ResponseFormat } from '../../types.js'

/**
 * Abstract base class for all Grist MCP tools
 *
 * @template TInput - Input schema type (inferred from Zod schema)
 * @template TOutput - Output data type returned by the tool
 *
 * @example
 * ```typescript
 * class GetDocumentsTool extends GristTool<typeof GetDocumentsSchema, DocumentInfo[]> {
 *   constructor(client: GristClient) {
 *     super(client, GetDocumentsSchema)
 *   }
 *
 *   protected async executeInternal(params: z.infer<typeof GetDocumentsSchema>): Promise<DocumentInfo[]> {
 *     return await this.client.get(`/docs`)
 *   }
 * }
 * ```
 */
export abstract class GristTool<TInput extends z.ZodTypeAny, TOutput = unknown> {
  constructor(
    protected readonly client: GristClient,
    protected readonly inputSchema: TInput
  ) {}

  /**
   * Execute the tool with automatic validation and error handling
   * This is the main entry point called by the tool registry
   *
   * @param params - Raw parameters from MCP client
   * @returns Formatted MCPToolResponse
   */
  async execute(params: unknown): Promise<MCPToolResponse> {
    try {
      // Automatic validation using Zod
      const validated = this.validateInput(params)

      // Pre-execution hook (for middleware like caching, metrics)
      await this.beforeExecute(validated)

      // Execute the tool-specific logic
      const result = await this.executeInternal(validated)

      // Post-execution hook (for post-processing)
      const processed = await this.afterExecute(result, validated)

      // Format response according to requested format
      return this.formatResponse(processed, this.getResponseFormat(validated))
    } catch (error) {
      return this.handleError(error)
    }
  }

  /**
   * Validate input parameters using Zod schema
   * Throws ValidationError if validation fails
   *
   * @param params - Raw parameters to validate
   * @returns Validated and typed parameters
   * @throws {ValidationError} If validation fails
   */
  protected validateInput(params: unknown): z.infer<TInput> {
    const result = this.inputSchema.safeParse(params)
    if (!result.success) {
      throw ValidationError.fromZodError(result.error, 'Invalid tool parameters')
    }
    return result.data
  }

  /**
   * Tool-specific logic (must be implemented by subclasses)
   * This method contains the core business logic of the tool
   *
   * @param params - Validated parameters
   * @returns Tool output data
   */
  protected abstract executeInternal(params: z.infer<TInput>): Promise<TOutput>

  /**
   * Hook: Before execution
   * Override in subclasses for middleware functionality like caching or metrics
   *
   * @param params - Validated parameters
   */
  protected async beforeExecute(_params: z.infer<TInput>): Promise<void> {
    // Default implementation: no-op
    // Subclasses can override for custom pre-execution logic
  }

  /**
   * Hook: After execution
   * Override in subclasses for post-processing like filtering or transformation
   *
   * @param result - Raw result from executeInternal
   * @param params - Validated parameters (for context)
   * @returns Processed result
   */
  protected async afterExecute(result: TOutput, _params: z.infer<TInput>): Promise<TOutput> {
    // Default implementation: return result as-is
    return result
  }

  /**
   * Extract response format from parameters
   * Assumes params have a response_format field (standard for Grist tools)
   *
   * @param params - Validated parameters
   * @returns Response format (defaults to 'markdown')
   */
  protected getResponseFormat(params: z.infer<TInput>): ResponseFormat {
    // Type-safe extraction of response_format
    if (typeof params === 'object' && params !== null && 'response_format' in params) {
      const record = params as Record<string, unknown>
      const format = record.response_format
      if (format === 'json' || format === 'markdown') {
        return format
      }
    }
    return 'markdown'
  }

  /**
   * Format successful response
   * Converts tool output to MCPToolResponse
   *
   * @param data - Tool output data
   * @param format - Desired output format
   * @returns Formatted MCP response
   */
  protected formatResponse(data: TOutput, format: ResponseFormat): MCPToolResponse {
    return formatToolResponse(data, format)
  }

  /**
   * Handle errors with structured error messages
   * Converts exceptions to user-friendly MCP responses
   *
   * @param error - Error that occurred during execution
   * @returns Error response for MCP
   */
  protected handleError(error: unknown): MCPToolResponse {
    // Use structured error messages if available
    if (isGristError(error)) {
      return formatErrorResponse(error.toUserMessage())
    }

    // Handle standard Error objects
    if (error instanceof Error) {
      return formatErrorResponse(error.message)
    }

    // Fallback for unknown error types
    return formatErrorResponse(String(error))
  }

  /**
   * Get cache key for this tool execution
   * Override in subclasses to enable caching
   *
   * @param params - Validated parameters
   * @returns Cache key string or null if caching disabled
   */
  protected getCacheKey(_params: z.infer<TInput>): string | null {
    // Default: no caching
    // Subclasses can override to enable caching
    return null
  }

  /**
   * Check if this tool supports a specific feature
   * Used for capability detection
   *
   * @param feature - Feature name to check
   * @returns True if feature is supported
   */
  protected supportsFeature(_feature: 'caching' | 'pagination' | 'filtering'): boolean {
    // Default: no special features
    return false
  }
}

/**
 * Type helper to extract input type from GristTool
 */
export type ToolInput<T extends GristTool<z.ZodTypeAny, unknown>> = T extends GristTool<
  infer TInput,
  unknown
>
  ? z.infer<TInput>
  : never

/**
 * Type helper to extract output type from GristTool
 */
export type ToolOutput<T extends GristTool<z.ZodTypeAny, unknown>> = T extends GristTool<
  z.ZodTypeAny,
  infer TOutput
>
  ? TOutput
  : never
