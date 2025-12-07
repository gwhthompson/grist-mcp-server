import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { z } from 'zod'
import { log } from '../utils/shared-logger.js'
import type { ToolCategory, ToolContext, ToolDefinition } from './tool-definitions.js'

interface McpToolOptions {
  readonly title: string
  readonly description: string
  readonly inputSchema: z.ZodRawShape
  readonly outputSchema?: z.ZodRawShape
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

export async function registerTool<TSchema extends z.ZodTypeAny>(
  server: McpServer,
  context: ToolContext,
  definition: ToolDefinition<TSchema>
): Promise<ToolRegistrationResult> {
  const _startTime = Date.now()

  try {
    const mcpOptions: McpToolOptions = {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema as unknown as z.ZodRawShape,
      ...(definition.outputSchema && {
        outputSchema: definition.outputSchema as unknown as z.ZodRawShape
      }),
      annotations: definition.annotations
    }

    const wrappedHandler = async (params: unknown) => {
      const shouldLogCalls =
        process.env.GRIST_MCP_DEBUG_MODE === 'true' ||
        process.env.GRIST_MCP_LOG_TOOL_CALLS === 'true'
      const shouldLogParams =
        process.env.GRIST_MCP_DEBUG_MODE === 'true' ||
        process.env.GRIST_MCP_LOG_TOOL_PARAMS === 'true' ||
        process.env.DEBUG_MCP_PARAMS === 'true'
      const startTime = Date.now()

      if (shouldLogCalls) {
        log.info('Tool invoked', {
          tool: definition.name,
          params: shouldLogParams ? params : undefined
        })
      }

      if (process.env.DEBUG_MCP_PARAMS === 'true') {
        console.warn(`[MCP] Tool called: ${definition.name}`)
        console.warn('[MCP] Raw parameters:', JSON.stringify(params, null, 2))

        const paramsRecord = params as Record<string, unknown>
        if (paramsRecord?.widgetOptions !== undefined) {
          console.warn('[MCP] widgetOptions detected:', {
            type: typeof paramsRecord.widgetOptions,
            value: paramsRecord.widgetOptions,
            isString: typeof paramsRecord.widgetOptions === 'string',
            isObject: typeof paramsRecord.widgetOptions === 'object'
          })
        }
      }

      try {
        const result = await definition.handler(context, params)

        if (shouldLogCalls) {
          const duration = Date.now() - startTime
          log.info('Tool completed', {
            tool: definition.name,
            duration,
            success: true
          })
        }

        return result
      } catch (error) {
        const duration = Date.now() - startTime
        log.error(
          'Tool failed',
          {
            tool: definition.name,
            duration,
            error: error instanceof Error ? error.message : String(error)
          },
          error instanceof Error ? error : undefined
        )

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

export async function registerToolsBatch(
  server: McpServer,
  context: ToolContext,
  tools: ReadonlyArray<ToolDefinition>,
  strategy?: RegistrationStrategy
): Promise<BatchRegistrationSummary> {
  const startTime = Date.now()
  const results: ToolRegistrationResult[] = []
  const categoryCounts = new Map<ToolCategory, number>()

  strategy?.beforeBatch?.(tools.length)

  for (const tool of tools) {
    strategy?.beforeTool?.(tool.name)

    const result = await registerTool(server, context, tool)
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

export async function registerToolsByCategory(
  server: McpServer,
  context: ToolContext,
  tools: ReadonlyArray<ToolDefinition>,
  categories: ReadonlyArray<ToolCategory>,
  strategy?: RegistrationStrategy
): Promise<BatchRegistrationSummary> {
  const categorySet = new Set(categories)
  const filteredTools = tools.filter((tool) => categorySet.has(tool.category))

  return registerToolsBatch(server, context, filteredTools, strategy)
}

export async function registerToolsExcept(
  server: McpServer,
  context: ToolContext,
  tools: ReadonlyArray<ToolDefinition>,
  excludedNames: ReadonlyArray<string>,
  strategy?: RegistrationStrategy
): Promise<BatchRegistrationSummary> {
  const excludedSet = new Set(excludedNames)
  const filteredTools = tools.filter((tool) => !excludedSet.has(tool.name))

  return registerToolsBatch(server, context, filteredTools, strategy)
}

export async function registerReadOnlyTools(
  server: McpServer,
  context: ToolContext,
  tools: ReadonlyArray<ToolDefinition>,
  strategy?: RegistrationStrategy
): Promise<BatchRegistrationSummary> {
  const readOnlyTools = tools.filter((tool) => tool.annotations.readOnlyHint === true)

  return registerToolsBatch(server, context, readOnlyTools, strategy)
}

export async function registerNonDestructiveTools(
  server: McpServer,
  context: ToolContext,
  tools: ReadonlyArray<ToolDefinition>,
  strategy?: RegistrationStrategy
): Promise<BatchRegistrationSummary> {
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
      strategies.forEach((s) => {
        s.beforeBatch?.(toolCount)
      })
    },

    beforeTool: (toolName: string) => {
      strategies.forEach((s) => {
        s.beforeTool?.(toolName)
      })
    },

    afterTool: (result: ToolRegistrationResult) => {
      strategies.forEach((s) => {
        s.afterTool?.(result)
      })
    },

    afterBatch: (summary: BatchRegistrationSummary) => {
      strategies.forEach((s) => {
        s.afterBatch?.(summary)
      })
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
