import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { z } from 'zod'
import { log } from '../utils/shared-logger.js'
import type { ToolCategory, ToolContext, ToolDefinition } from './tool-definitions.js'

interface McpToolOptions {
  readonly title: string
  readonly description: string
  readonly inputSchema: z.ZodRawShape
  readonly outputSchema?: z.ZodTypeAny
  readonly annotations?: {
    readonly readOnlyHint?: boolean
    readonly destructiveHint?: boolean
    readonly idempotentHint?: boolean
    readonly openWorldHint?: boolean
  }
}

export interface ToolRegistrationResult {
  readonly toolName: string
  readonly success: boolean
  readonly error?: Error
  readonly registeredAt: Date
}

export interface BatchRegistrationSummary {
  readonly total: number
  readonly successful: number
  readonly failed: number
  readonly results: ReadonlyArray<ToolRegistrationResult>
  readonly categories: ReadonlyMap<ToolCategory, number>
  readonly duration: number
}

export interface RegistrationStrategy {
  beforeBatch?: (toolCount: number) => void
  beforeTool?: (toolName: string) => void
  afterTool?: (result: ToolRegistrationResult) => void
  afterBatch?: (summary: BatchRegistrationSummary) => void
  onError?: (error: Error, toolName: string) => boolean
}

// Logging context for tool invocation
interface ToolLogContext {
  shouldLogCalls: boolean
  shouldLogParams: boolean
}

/** Create logging context from environment variables */
function createLogContext(): ToolLogContext {
  const debugMode = process.env.GRIST_MCP_DEBUG_MODE === 'true'
  return {
    shouldLogCalls: debugMode || process.env.GRIST_MCP_LOG_TOOL_CALLS === 'true',
    shouldLogParams:
      debugMode ||
      process.env.GRIST_MCP_LOG_TOOL_PARAMS === 'true' ||
      process.env.DEBUG_MCP_PARAMS === 'true'
  }
}

/** Log tool invocation if logging is enabled */
function logToolInvocation(toolName: string, params: unknown, ctx: ToolLogContext): void {
  if (ctx.shouldLogCalls) {
    log.info('Tool invoked', {
      tool: toolName,
      params: ctx.shouldLogParams ? params : undefined
    })
  }
  log.debug(`Tool called: ${toolName}`, { params })
}

/** Validate output against schema in development mode */
function validateOutputSchema(
  toolName: string,
  result: { structuredContent?: unknown },
  outputSchema?: z.ZodTypeAny
): void {
  if (process.env.NODE_ENV !== 'development') return
  if (!outputSchema || !result.structuredContent) return

  const validation = outputSchema.safeParse(result.structuredContent)
  if (!validation.success) {
    log.warn('Output schema validation failed', {
      tool: toolName,
      issues: validation.error.issues.slice(0, 3),
      hint: 'Output does not match outputSchema - update schema or handler'
    })
  }
}

/** Log tool completion if logging is enabled */
function logToolCompletion(toolName: string, duration: number, ctx: ToolLogContext): void {
  if (ctx.shouldLogCalls) {
    log.info('Tool completed', { tool: toolName, duration, success: true })
  }
}

/** Log tool error */
function logToolError(toolName: string, duration: number, error: unknown): void {
  log.error(
    'Tool failed',
    { tool: toolName, duration, error: error instanceof Error ? error.message : String(error) },
    error instanceof Error ? error : undefined
  )
}

export function registerTool<TSchema extends z.ZodTypeAny>(
  server: McpServer,
  context: ToolContext,
  definition: ToolDefinition<TSchema>
): ToolRegistrationResult {
  const _startTime = Date.now()

  try {
    const mcpOptions: McpToolOptions = {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema as unknown as z.ZodRawShape,
      ...(definition.outputSchema && {
        outputSchema: definition.outputSchema
      }),
      annotations: definition.annotations
    }

    const wrappedHandler = async (params: unknown) => {
      const logCtx = createLogContext()
      const startTime = Date.now()

      logToolInvocation(definition.name, params, logCtx)

      try {
        const result = await definition.handler(context, params as z.infer<TSchema>)
        validateOutputSchema(definition.name, result, definition.outputSchema)
        logToolCompletion(definition.name, Date.now() - startTime, logCtx)
        return result
      } catch (error) {
        logToolError(definition.name, Date.now() - startTime, error)
        throw error
      }
    }

    server.registerTool(definition.name, mcpOptions, wrappedHandler)

    return {
      toolName: definition.name,
      success: true,
      registeredAt: new Date()
    }
  } catch (error) {
    return {
      toolName: definition.name,
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      registeredAt: new Date()
    }
  }
}

export function registerToolsBatch(
  server: McpServer,
  context: ToolContext,
  tools: ReadonlyArray<ToolDefinition>,
  strategy?: RegistrationStrategy
): BatchRegistrationSummary {
  const startTime = Date.now()
  const results: ToolRegistrationResult[] = []
  const categoryCounts = new Map<ToolCategory, number>()

  strategy?.beforeBatch?.(tools.length)

  for (const tool of tools) {
    strategy?.beforeTool?.(tool.name)

    const result = registerTool(server, context, tool)
    results.push(result)

    if (result.success) {
      const currentCount = categoryCounts.get(tool.category) || 0
      categoryCounts.set(tool.category, currentCount + 1)
    }

    strategy?.afterTool?.(result)

    if (!result.success && result.error) {
      const shouldContinue = strategy?.onError?.(result.error, tool.name)
      if (shouldContinue === false) {
        break
      }
    }
  }

  const endTime = Date.now()
  const successful = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length

  const summary: BatchRegistrationSummary = {
    total: tools.length,
    successful,
    failed,
    results,
    categories: categoryCounts,
    duration: endTime - startTime
  }

  strategy?.afterBatch?.(summary)

  return summary
}

export function registerToolsByCategory(
  server: McpServer,
  context: ToolContext,
  tools: ReadonlyArray<ToolDefinition>,
  categories: ReadonlyArray<ToolCategory>,
  strategy?: RegistrationStrategy
): BatchRegistrationSummary {
  const categorySet = new Set(categories)
  const filteredTools = tools.filter((tool) => categorySet.has(tool.category))

  return registerToolsBatch(server, context, filteredTools, strategy)
}

export function registerToolsExcept(
  server: McpServer,
  context: ToolContext,
  tools: ReadonlyArray<ToolDefinition>,
  excludedNames: ReadonlyArray<string>,
  strategy?: RegistrationStrategy
): BatchRegistrationSummary {
  const excludedSet = new Set(excludedNames)
  const filteredTools = tools.filter((tool) => !excludedSet.has(tool.name))

  return registerToolsBatch(server, context, filteredTools, strategy)
}

export function registerReadOnlyTools(
  server: McpServer,
  context: ToolContext,
  tools: ReadonlyArray<ToolDefinition>,
  strategy?: RegistrationStrategy
): BatchRegistrationSummary {
  const readOnlyTools = tools.filter((tool) => tool.annotations.readOnlyHint === true)

  return registerToolsBatch(server, context, readOnlyTools, strategy)
}

export function registerNonDestructiveTools(
  server: McpServer,
  context: ToolContext,
  tools: ReadonlyArray<ToolDefinition>,
  strategy?: RegistrationStrategy
): BatchRegistrationSummary {
  const safeTools = tools.filter((tool) => tool.annotations.destructiveHint !== true)

  return registerToolsBatch(server, context, safeTools, strategy)
}

export const consoleLoggingStrategy: RegistrationStrategy = {
  beforeBatch: (toolCount: number) => {
    console.error(`Starting registration of ${toolCount} tools...`)
  },

  beforeTool: (toolName: string) => {
    console.error(`  Registering: ${toolName}`)
  },

  afterTool: (result: ToolRegistrationResult) => {
    if (result.success) {
      console.error(`    ✓ ${result.toolName} registered successfully`)
    } else {
      console.error(`    ✗ ${result.toolName} failed: ${result.error?.message}`)
    }
  },

  afterBatch: (summary: BatchRegistrationSummary) => {
    console.error('')
    console.error('Registration Summary:')
    console.error(`  Total: ${summary.total}`)
    console.error(`  Successful: ${summary.successful}`)
    console.error(`  Failed: ${summary.failed}`)
    console.error(`  Duration: ${summary.duration}ms`)
    console.error('')
    console.error('Tools by category:')
    summary.categories.forEach((count, category) => {
      console.error(`  ${category}: ${count}`)
    })
  },

  onError: (error: Error, toolName: string) => {
    console.error(`ERROR registering ${toolName}:`, error)
    return true
  }
}

export const silentStrategy: RegistrationStrategy = {}

export const failFastStrategy: RegistrationStrategy = {
  onError: (_error: Error, _toolName: string) => {
    return false
  }
}

export function createMetricsStrategy(): {
  strategy: RegistrationStrategy
  getMetrics: () => RegistrationMetrics
} {
  const metrics: RegistrationMetrics = {
    toolTimings: new Map(),
    errorsByTool: new Map(),
    totalDuration: 0
  }

  let currentToolStartTime = 0

  return {
    strategy: {
      beforeTool: (_toolName: string) => {
        currentToolStartTime = Date.now()
      },
      afterTool: (result: ToolRegistrationResult) => {
        const duration = Date.now() - currentToolStartTime
        metrics.toolTimings.set(result.toolName, duration)

        if (!result.success && result.error) {
          metrics.errorsByTool.set(result.toolName, result.error)
        }
      },
      afterBatch: (summary: BatchRegistrationSummary) => {
        metrics.totalDuration = summary.duration
      }
    },
    getMetrics: () => metrics
  }
}

export interface RegistrationMetrics {
  toolTimings: Map<string, number>
  errorsByTool: Map<string, Error>
  totalDuration: number
}

export function validateToolNames(tools: ReadonlyArray<ToolDefinition>): {
  valid: boolean
  duplicates: string[]
} {
  const names = new Set<string>()
  const duplicates: string[] = []

  for (const tool of tools) {
    if (names.has(tool.name)) {
      duplicates.push(tool.name)
    } else {
      names.add(tool.name)
    }
  }

  return {
    valid: duplicates.length === 0,
    duplicates
  }
}

export function getToolStatsByCategory(
  tools: ReadonlyArray<ToolDefinition>
): Map<ToolCategory, number> {
  const stats = new Map<ToolCategory, number>()

  for (const tool of tools) {
    const current = stats.get(tool.category) || 0
    stats.set(tool.category, current + 1)
  }

  return stats
}

export function getToolsByAnnotations(
  tools: ReadonlyArray<ToolDefinition>,
  filters: {
    readOnly?: boolean
    destructive?: boolean
    idempotent?: boolean
    openWorld?: boolean
  }
): ReadonlyArray<ToolDefinition> {
  return tools.filter((tool) => {
    if (filters.readOnly !== undefined && tool.annotations.readOnlyHint !== filters.readOnly) {
      return false
    }
    if (
      filters.destructive !== undefined &&
      tool.annotations.destructiveHint !== filters.destructive
    ) {
      return false
    }
    if (
      filters.idempotent !== undefined &&
      tool.annotations.idempotentHint !== filters.idempotent
    ) {
      return false
    }
    if (filters.openWorld !== undefined && tool.annotations.openWorldHint !== filters.openWorld) {
      return false
    }
    return true
  })
}

export function composeStrategies(...strategies: RegistrationStrategy[]): RegistrationStrategy {
  return {
    beforeBatch: (toolCount: number) => {
      for (const s of strategies) {
        s.beforeBatch?.(toolCount)
      }
    },

    beforeTool: (toolName: string) => {
      for (const s of strategies) {
        s.beforeTool?.(toolName)
      }
    },

    afterTool: (result: ToolRegistrationResult) => {
      for (const s of strategies) {
        s.afterTool?.(result)
      }
    },

    afterBatch: (summary: BatchRegistrationSummary) => {
      for (const s of strategies) {
        s.afterBatch?.(summary)
      }
    },

    onError: (error: Error, toolName: string) => {
      for (const strategy of strategies) {
        if (strategy.onError) {
          const shouldContinue = strategy.onError(error, toolName)
          if (shouldContinue === false) {
            return false
          }
        }
      }
      return true
    }
  }
}
