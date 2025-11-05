/**
 * Tool Registry System
 *
 * Provides a type-safe, generic registration system for MCP tools.
 * This module handles the mechanical process of registering tools with the MCP server,
 * separating concerns between tool definitions and server initialization.
 *
 * Key Features:
 * - Generic registration with Zod schema inference
 * - Batch registration with error handling
 * - Type-safe parameter passing to handlers
 * - Automatic schema conversion for MCP compatibility
 * - Comprehensive logging and diagnostics
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { z } from 'zod'
import type { GristClient } from '../services/grist-client.js'
import type {
  ToolDefinition,
  CategorizedToolDefinition,
  ToolCategory
} from './tool-definitions.js'

// ============================================================================
// Advanced Generic Types for Registration
// ============================================================================

/**
 * MCP tool registration options
 * Mirrors the MCP SDK's tool registration interface
 */
interface McpToolOptions {
  readonly title: string
  readonly description: string
  readonly inputSchema: any // MCP SDK requires `any` type for JSON Schema
  readonly annotations?: {
    readonly readOnlyHint?: boolean
    readonly destructiveHint?: boolean
    readonly idempotentHint?: boolean
    readonly openWorldHint?: boolean
  }
}

/**
 * Registration result for a single tool
 * Tracks success/failure and provides diagnostic information
 */
export interface ToolRegistrationResult {
  readonly toolName: string
  readonly success: boolean
  readonly error?: Error
  readonly registeredAt: Date
}

/**
 * Batch registration summary
 * Aggregates results from multiple tool registrations
 */
export interface BatchRegistrationSummary {
  readonly total: number
  readonly successful: number
  readonly failed: number
  readonly results: ReadonlyArray<ToolRegistrationResult>
  readonly categories: ReadonlyMap<ToolCategory, number>
  readonly duration: number // milliseconds
}

/**
 * Registration strategy pattern
 * Allows customization of how tools are registered
 */
export interface RegistrationStrategy {
  /**
   * Called before batch registration starts
   */
  beforeBatch?: (toolCount: number) => void

  /**
   * Called before each individual tool registration
   */
  beforeTool?: (toolName: string) => void

  /**
   * Called after each individual tool registration
   */
  afterTool?: (result: ToolRegistrationResult) => void

  /**
   * Called after batch registration completes
   */
  afterBatch?: (summary: BatchRegistrationSummary) => void

  /**
   * Called when a tool registration fails
   * Return true to continue, false to abort batch
   */
  onError?: (error: Error, toolName: string) => boolean
}

// ============================================================================
// Core Registration Functions
// ============================================================================

/**
 * Register a single tool with the MCP server
 *
 * This function handles the low-level mechanics of tool registration:
 * 1. Converts Zod schema to JSON Schema (for MCP compatibility)
 * 2. Creates a type-safe handler wrapper
 * 3. Registers with the MCP server
 * 4. Returns registration result for diagnostics
 *
 * @template TSchema - Zod schema type for compile-time type inference
 * @param server - MCP server instance
 * @param client - Grist API client
 * @param definition - Tool definition with schema and handler
 * @returns Promise resolving to registration result
 */
export async function registerTool<TSchema extends z.ZodTypeAny>(
  server: McpServer,
  client: GristClient,
  definition: ToolDefinition<TSchema>
): Promise<ToolRegistrationResult> {
  const startTime = Date.now()

  try {
    // Convert Zod schema to JSON Schema for MCP compatibility
    // MCP SDK requires `any` type, but we maintain type safety internally
    const mcpOptions: McpToolOptions = {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema as any,
      annotations: definition.annotations
    }

    // Create type-safe handler wrapper
    // The outer function signature matches MCP's expectations (params: any)
    // The inner call maintains full type safety via Zod inference
    const wrappedHandler = async (params: any) => {
      // Zod validation happens inside the tool handler
      // This maintains separation of concerns
      return definition.handler(client, params)
    }

    // Register with MCP server
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

/**
 * Register multiple tools in batch
 *
 * Provides efficient bulk registration with comprehensive error handling
 * and progress tracking. Supports custom registration strategies for
 * logging, monitoring, and error recovery.
 *
 * @param server - MCP server instance
 * @param client - Grist API client
 * @param tools - Array of tool definitions to register
 * @param strategy - Optional registration strategy for hooks and error handling
 * @returns Promise resolving to batch registration summary
 */
export async function registerToolsBatch(
  server: McpServer,
  client: GristClient,
  tools: ReadonlyArray<CategorizedToolDefinition>,
  strategy?: RegistrationStrategy
): Promise<BatchRegistrationSummary> {
  const startTime = Date.now()
  const results: ToolRegistrationResult[] = []
  const categoryCounts = new Map<ToolCategory, number>()

  // Invoke beforeBatch hook
  strategy?.beforeBatch?.(tools.length)

  for (const tool of tools) {
    // Invoke beforeTool hook
    strategy?.beforeTool?.(tool.name)

    // Register the tool
    const result = await registerTool(server, client, tool)
    results.push(result)

    // Track category statistics
    if (result.success) {
      const currentCount = categoryCounts.get(tool.category) || 0
      categoryCounts.set(tool.category, currentCount + 1)
    }

    // Invoke afterTool hook
    strategy?.afterTool?.(result)

    // Handle registration failures
    if (!result.success && result.error) {
      const shouldContinue = strategy?.onError?.(result.error, tool.name)
      if (shouldContinue === false) {
        // Abort batch registration
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

  // Invoke afterBatch hook
  strategy?.afterBatch?.(summary)

  return summary
}

/**
 * Register tools filtered by category
 *
 * Useful for selective tool registration based on feature flags,
 * permissions, or environment configuration.
 *
 * @param server - MCP server instance
 * @param client - Grist API client
 * @param tools - All available tools
 * @param categories - Categories to register
 * @param strategy - Optional registration strategy
 * @returns Promise resolving to batch registration summary
 */
export async function registerToolsByCategory(
  server: McpServer,
  client: GristClient,
  tools: ReadonlyArray<CategorizedToolDefinition>,
  categories: ReadonlyArray<ToolCategory>,
  strategy?: RegistrationStrategy
): Promise<BatchRegistrationSummary> {
  const categorySet = new Set(categories)
  const filteredTools = tools.filter((tool) => categorySet.has(tool.category))

  return registerToolsBatch(server, client, filteredTools, strategy)
}

/**
 * Register tools with selective exclusion
 *
 * Useful for disabling specific tools without modifying the main registry.
 * Common use cases:
 * - Disable destructive operations in production
 * - Remove experimental tools
 * - Exclude tools based on permissions
 *
 * @param server - MCP server instance
 * @param client - Grist API client
 * @param tools - All available tools
 * @param excludedNames - Tool names to exclude from registration
 * @param strategy - Optional registration strategy
 * @returns Promise resolving to batch registration summary
 */
export async function registerToolsExcept(
  server: McpServer,
  client: GristClient,
  tools: ReadonlyArray<CategorizedToolDefinition>,
  excludedNames: ReadonlyArray<string>,
  strategy?: RegistrationStrategy
): Promise<BatchRegistrationSummary> {
  const excludedSet = new Set(excludedNames)
  const filteredTools = tools.filter((tool) => !excludedSet.has(tool.name))

  return registerToolsBatch(server, client, filteredTools, strategy)
}

/**
 * Register only read-only tools
 *
 * Useful for read-only API keys or restricted environments.
 * Only registers tools with readOnlyHint: true.
 *
 * @param server - MCP server instance
 * @param client - Grist API client
 * @param tools - All available tools
 * @param strategy - Optional registration strategy
 * @returns Promise resolving to batch registration summary
 */
export async function registerReadOnlyTools(
  server: McpServer,
  client: GristClient,
  tools: ReadonlyArray<CategorizedToolDefinition>,
  strategy?: RegistrationStrategy
): Promise<BatchRegistrationSummary> {
  const readOnlyTools = tools.filter((tool) => tool.annotations.readOnlyHint === true)

  return registerToolsBatch(server, client, readOnlyTools, strategy)
}

/**
 * Register only non-destructive tools
 *
 * Useful for production environments where data safety is critical.
 * Excludes tools with destructiveHint: true.
 *
 * @param server - MCP server instance
 * @param client - Grist API client
 * @param tools - All available tools
 * @param strategy - Optional registration strategy
 * @returns Promise resolving to batch registration summary
 */
export async function registerNonDestructiveTools(
  server: McpServer,
  client: GristClient,
  tools: ReadonlyArray<CategorizedToolDefinition>,
  strategy?: RegistrationStrategy
): Promise<BatchRegistrationSummary> {
  const safeTools = tools.filter((tool) => tool.annotations.destructiveHint !== true)

  return registerToolsBatch(server, client, safeTools, strategy)
}

// ============================================================================
// Built-in Registration Strategies
// ============================================================================

/**
 * Console logging strategy
 * Logs registration progress to stderr for debugging
 */
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
    // Continue with remaining tools
    return true
  }
}

/**
 * Silent strategy
 * No logging, suitable for production environments
 */
export const silentStrategy: RegistrationStrategy = {
  // No hooks - completely silent
}

/**
 * Fail-fast strategy
 * Aborts batch registration on first error
 */
export const failFastStrategy: RegistrationStrategy = {
  onError: (_error: Error, _toolName: string) => {
    // Abort on first error
    return false
  }
}

/**
 * Statistics collection strategy
 * Tracks detailed metrics without logging
 */
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

/**
 * Registration metrics interface
 */
export interface RegistrationMetrics {
  toolTimings: Map<string, number>
  errorsByTool: Map<string, Error>
  totalDuration: number
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate that all tools have unique names
 * Should be called before registration to catch configuration errors
 *
 * @param tools - Tools to validate
 * @returns Validation result with any duplicate names
 */
export function validateToolNames(
  tools: ReadonlyArray<CategorizedToolDefinition>
): { valid: boolean; duplicates: string[] } {
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

/**
 * Get tool statistics by category
 * Useful for documentation and monitoring
 *
 * @param tools - Tools to analyze
 * @returns Map of category to tool count
 */
export function getToolStatsByCategory(
  tools: ReadonlyArray<CategorizedToolDefinition>
): Map<ToolCategory, number> {
  const stats = new Map<ToolCategory, number>()

  for (const tool of tools) {
    const current = stats.get(tool.category) || 0
    stats.set(tool.category, current + 1)
  }

  return stats
}

/**
 * Get tools by annotation characteristics
 * Useful for filtering tools by capabilities
 *
 * @param tools - All tools
 * @param filters - Annotation filters to apply
 * @returns Filtered tool list
 */
export function getToolsByAnnotations(
  tools: ReadonlyArray<CategorizedToolDefinition>,
  filters: {
    readOnly?: boolean
    destructive?: boolean
    idempotent?: boolean
    openWorld?: boolean
  }
): ReadonlyArray<CategorizedToolDefinition> {
  return tools.filter((tool) => {
    if (filters.readOnly !== undefined && tool.annotations.readOnlyHint !== filters.readOnly) {
      return false
    }
    if (filters.destructive !== undefined && tool.annotations.destructiveHint !== filters.destructive) {
      return false
    }
    if (filters.idempotent !== undefined && tool.annotations.idempotentHint !== filters.idempotent) {
      return false
    }
    if (filters.openWorld !== undefined && tool.annotations.openWorldHint !== filters.openWorld) {
      return false
    }
    return true
  })
}

/**
 * Create a custom registration strategy by composing multiple strategies
 * Later strategies override earlier ones for shared hooks
 *
 * @param strategies - Strategies to compose (right-to-left precedence)
 * @returns Composed strategy
 */
export function composeStrategies(
  ...strategies: RegistrationStrategy[]
): RegistrationStrategy {
  return {
    beforeBatch: (toolCount: number) => {
      strategies.forEach((s) => s.beforeBatch?.(toolCount))
    },

    beforeTool: (toolName: string) => {
      strategies.forEach((s) => s.beforeTool?.(toolName))
    },

    afterTool: (result: ToolRegistrationResult) => {
      strategies.forEach((s) => s.afterTool?.(result))
    },

    afterBatch: (summary: BatchRegistrationSummary) => {
      strategies.forEach((s) => s.afterBatch?.(summary))
    },

    onError: (error: Error, toolName: string) => {
      // Chain error handlers - if any returns false, abort
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
