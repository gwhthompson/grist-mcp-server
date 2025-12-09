import type { z } from 'zod'
import { isGristError, ValidationError } from '../../errors/index.js'
import type { ToolContext } from '../../registry/types.js'
import { formatErrorResponse, formatToolResponse } from '../../services/formatter.js'
import type { GristClient } from '../../services/grist-client.js'
import type { SchemaCache } from '../../services/schema-cache.js'
import { getSessionAnalytics } from '../../services/session-analytics.js'
import type { MCPToolResponse, ResponseFormat } from '../../types.js'

export abstract class GristTool<TInput extends z.ZodType<any, any>, TOutput = unknown> {
  protected readonly client: GristClient
  protected readonly schemaCache: SchemaCache

  constructor(
    protected readonly context: ToolContext,
    protected readonly inputSchema: TInput
  ) {
    this.client = context.client
    this.schemaCache = context.schemaCache
  }

  async execute(params: unknown): Promise<MCPToolResponse> {
    const startTime = Date.now()
    let success = false
    let response: MCPToolResponse | undefined

    try {
      const validated = this.validateInput(params)
      await this.beforeExecute(validated)
      const result = await this.executeInternal(validated)
      const processed = await this.afterExecute(result, validated)
      response = this.formatResponse(processed, this.getResponseFormat(validated))
      success = true
      return response
    } catch (error) {
      response = this.handleError(error)
      return response
    } finally {
      const durationMs = Date.now() - startTime
      const responseBytes = response ? this.calculateResponseBytes(response) : 0
      this.recordExecution(responseBytes, durationMs, success)
    }
  }

  private calculateResponseBytes(response: MCPToolResponse): number {
    try {
      return JSON.stringify(response).length
    } catch {
      return 0
    }
  }

  private recordExecution(responseBytes: number, durationMs: number, success: boolean): void {
    const analytics = getSessionAnalytics()
    if (analytics) {
      const toolName = this.getToolName()
      analytics.recordToolExecution(toolName, responseBytes, durationMs, success)
    }
  }

  protected getToolName(): string {
    const className = this.constructor.name
    return className
      .replace(/Tool$/, '')
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
  }

  protected validateInput(params: unknown): z.infer<TInput> {
    const result = this.inputSchema.safeParse(params)
    if (!result.success) {
      throw ValidationError.fromZodError(result.error, 'Invalid tool parameters')
    }
    return result.data
  }

  // Return raw data only - NOT MCPToolResponse (formatResponse handles that)
  protected abstract executeInternal(params: z.infer<TInput>): Promise<TOutput>

  protected async beforeExecute(_params: z.infer<TInput>): Promise<void> {}

  protected async afterExecute(result: TOutput, _params: z.infer<TInput>): Promise<TOutput> {
    return result
  }

  protected getResponseFormat(params: z.infer<TInput>): ResponseFormat {
    if (typeof params === 'object' && params !== null && 'response_format' in params) {
      const record = params as Record<string, unknown>
      const format = record.response_format
      if (format === 'json' || format === 'markdown') {
        return format
      }
    }
    return 'markdown'
  }

  protected formatResponse(data: TOutput, format: ResponseFormat): MCPToolResponse {
    return formatToolResponse(data, format)
  }

  protected handleError(error: unknown): MCPToolResponse {
    if (isGristError(error)) {
      return formatErrorResponse(error.toUserMessage(), {
        error_code: error.code,
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

  protected getCacheKey(_params: z.infer<TInput>): string | null {
    return null
  }

  protected supportsFeature(_feature: 'caching' | 'pagination' | 'filtering'): boolean {
    return false
  }
}

export type ToolInput<T extends GristTool<z.ZodType<any, any>, unknown>> =
  T extends GristTool<infer TInput, unknown> ? z.infer<TInput> : never

export type ToolOutput<T extends GristTool<z.ZodType<any, any>, unknown>> =
  T extends GristTool<z.ZodType<any, any>, infer TOutput> ? TOutput : never
