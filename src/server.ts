/**
 * Server factory for creating Grist MCP server instances.
 *
 * Provides explicit dependency injection and declarative cleanup,
 * eliminating hidden global state.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from './registry/types.js'
import { GristClient } from './services/grist-client.js'
import type { MetricsCollector } from './services/metrics-collector.js'
import { SchemaCache } from './services/schema-cache.js'
import { sharedLogger } from './utils/shared-logger.js'

/**
 * Server instructions for LLMs using this MCP server.
 * Provides workflow guidance, tool relationships, and constraints.
 *
 * Reference: https://blog.modelcontextprotocol.io/2025-11-03-using-server-instructions
 */
const SERVER_INSTRUCTIONS = `## Grist MCP Server

11 tools for Grist relational spreadsheets. Use grist_help for full documentation.

### Workflow
1. grist_get_workspaces → grist_get_documents → grist_get_tables (follow order)
2. grist_query_sql for JOINs/aggregations, grist_get_records for simple filters
3. grist_manage_records (CRUD), grist_manage_schema (tables/columns), grist_manage_pages (UI)

### Parameters
- response_format: json (programmatic), markdown (display), concise (IDs only)
- detail_level: summary (basic), detailed (+permissions/timestamps), full_schema (+types)
- docId: 22-char Base58 (excludes 0OIl)
- tableId: Uppercase start, Python identifier
- colId: Python identifier, no gristHelper_ prefix

### Batching
- Use operations arrays for related changes (max 500 records, 10 operations)
- Summary tables: "Source_summary_GroupBy1_GroupBy2"
- Partial failures persist completed ops - check operationIndex to resume`

/**
 * Configuration for creating a Grist MCP server.
 */
export interface ServerConfig {
  /** Server name for MCP protocol */
  readonly name: string
  /** Server version */
  readonly version: string
  /** Grist instance base URL */
  readonly gristBaseUrl: string
  /** Grist API key */
  readonly gristApiKey: string
  /** Enable metrics collection */
  readonly enableMetrics?: boolean
  /** Metrics reporting interval in ms (default: 60000) */
  readonly metricsInterval?: number
}

/**
 * Optional dependencies that can be injected for testing.
 */
export interface ServerDependencies {
  /** Pre-configured Grist client */
  client?: GristClient
  /** Pre-configured schema cache */
  schemaCache?: SchemaCache
  /** Pre-configured metrics collector */
  metrics?: MetricsCollector
}

/**
 * Result of creating a Grist MCP server.
 */
export interface ServerInstance {
  /** The MCP server instance */
  readonly server: McpServer
  /** The Grist client for API calls */
  readonly client: GristClient
  /** The schema cache for column metadata */
  readonly schemaCache: SchemaCache
  /** The tool context for dependency injection */
  readonly context: ToolContext
  /** Optional metrics collector */
  readonly metrics?: MetricsCollector
  /** Cleanup function to call on shutdown */
  readonly cleanup: () => Promise<void>
}

/**
 * Creates a Grist MCP server with all dependencies.
 *
 * This factory function provides:
 * - Explicit dependency creation (no hidden globals)
 * - Optional dependency injection for testing
 * - Declarative cleanup via returned function
 *
 * @example
 * ```typescript
 * const { server, client, cleanup } = await createGristMcpServer({
 *   name: 'grist-mcp-server',
 *   version: '1.0.0',
 *   gristBaseUrl: 'https://docs.getgrist.com',
 *   gristApiKey: 'your-api-key'
 * })
 *
 * // ... use server ...
 *
 * // On shutdown:
 * await cleanup()
 * ```
 */
export async function createGristMcpServer(
  config: ServerConfig,
  deps?: ServerDependencies
): Promise<ServerInstance> {
  // Create or use injected client
  const client = deps?.client ?? new GristClient(config.gristBaseUrl, config.gristApiKey)

  // Create or use injected schema cache
  const schemaCache = deps?.schemaCache ?? new SchemaCache(client)

  // Create MCP server with instructions for LLMs
  const server = new McpServer(
    {
      name: config.name,
      version: config.version
    },
    {
      instructions: SERVER_INSTRUCTIONS
    }
  )

  // Setup metrics if enabled
  let metricsCollector: MetricsCollector | undefined = deps?.metrics

  if (!metricsCollector && config.enableMetrics) {
    const { MetricsCollector: MetricsCollectorClass } = await import(
      './services/metrics-collector.js'
    )

    metricsCollector = new MetricsCollectorClass(
      client.getRateLimiter(),
      client.getResponseCache(),
      sharedLogger,
      { interval: config.metricsInterval ?? 60000 }
    )

    metricsCollector.start()
  }

  // Create tool context for dependency injection
  const context: ToolContext = { client, schemaCache }

  // Return server instance with cleanup function
  return {
    server,
    client,
    schemaCache,
    context,
    metrics: metricsCollector,
    // biome-ignore lint/suspicious/useAwait: Matches interface Promise<void> for await compatibility
    cleanup: async () => {
      // Stop metrics collection
      if (metricsCollector) {
        metricsCollector.stop()
      }

      // Stop and clear schema cache
      schemaCache.stopCleanup()
      schemaCache.clearAll()

      // Stop response cache cleanup
      const responseCache = client.getResponseCache()
      responseCache.stopCleanup()
    }
  }
}
