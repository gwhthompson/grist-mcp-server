#!/usr/bin/env node

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import packageJson from '../package.json' with { type: 'json' }
import { DEFAULT_BASE_URL, STRICT_MODE } from './constants.js'
import { ALL_TOOLS, type ToolDefinition } from './registry/tool-definitions.js'
import {
  consoleLoggingStrategy,
  getToolStatsByCategory,
  registerToolsBatch,
  validateToolNames
} from './registry/tool-registry.js'
import type { ToolContext } from './registry/types.js'
import { createGristMcpServer, type ServerConfig, type ServerInstance } from './server.js'
import { initSessionAnalytics } from './services/session-analytics.js'
import { sharedLogger } from './utils/shared-logger.js'

function validateEnvironment(env: NodeJS.ProcessEnv): ServerConfig {
  const apiKey = env.GRIST_API_KEY

  if (!apiKey || apiKey.trim() === '') {
    throw new Error(
      'GRIST_API_KEY environment variable is required.\n\n' +
        'To get your API key:\n' +
        '  1. Visit: https://docs.getgrist.com/settings/keys\n' +
        '  2. Generate a new API key\n' +
        '  3. Set environment variable: export GRIST_API_KEY="your-key-here"\n\n' +
        'For self-hosted Grist, also set GRIST_BASE_URL:\n' +
        '  export GRIST_BASE_URL="https://your-grist-instance.com"'
    )
  }

  const baseUrl = env.GRIST_BASE_URL || DEFAULT_BASE_URL

  return {
    name: 'grist-mcp-server',
    version: packageJson.version,
    gristBaseUrl: baseUrl,
    gristApiKey: apiKey,
    enableMetrics: env.GRIST_MCP_ENABLE_METRICS === 'true',
    metricsInterval: parseInt(env.GRIST_MCP_METRICS_INTERVAL || '60000', 10)
  }
}

async function connectServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

async function registerTools(server: McpServer, context: ToolContext): Promise<void> {
  const validation = validateToolNames(ALL_TOOLS)
  if (!validation.valid) {
    throw new Error(
      `Tool registration failed: Duplicate tool names detected:\n` +
        validation.duplicates.map((name) => `  - ${name}`).join('\n')
    )
  }
  const _stats = getToolStatsByCategory(ALL_TOOLS)
  const totalTools = ALL_TOOLS.length

  console.error(`Registering ${totalTools} Grist tools...`)
  console.error('')
  const summary = await registerToolsBatch(server, context, ALL_TOOLS, consoleLoggingStrategy)
  if (summary.failed > 0) {
    const failedTools = summary.results
      .filter((r) => !r.success)
      .map((r) => `  - ${r.toolName}: ${r.error?.message}`)
      .join('\n')

    console.error('')
    console.error('WARNING: Some tools failed to register:')
    console.error(failedTools)
    console.error('')
  }
  if (summary.successful === totalTools) {
    console.error('✓ All tools registered successfully!')
  } else {
    console.error(`⚠ Registered ${summary.successful}/${totalTools} tools`)
  }
}

function logStartupInfo(config: ServerConfig): void {
  console.error('')
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.error(`  ${config.name} v${config.version}`)
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.error('')
  console.error(`Connected to Grist: ${config.gristBaseUrl}`)
  console.error(`Transport: stdio`)
  console.error(`Environment: ${process.env.NODE_ENV || 'production'}`)
  console.error('')
  console.error('Server is ready to receive requests')
  console.error('')
}

// Server instance for cleanup during shutdown
let serverInstance: ServerInstance | null = null

/**
 * Build rich description for tools/list that includes quick examples.
 * This helps agents use tools without needing to call grist_help first.
 */
function buildRichDescription(tool: ToolDefinition): string {
  const overview = tool.docs.overview.slice(0, 150)
  const firstExample = tool.docs.examples[0]

  if (firstExample) {
    const exampleJson = JSON.stringify(firstExample.input)
    // Keep description under ~300 chars for conciseness
    if (overview.length + exampleJson.length < 280) {
      return `${overview}\n\nExample: ${exampleJson}\n\nUse grist_help({tools:"${tool.name}"}) for full schema.`
    }
  }

  return `${overview}\n\nUse grist_help({tools:"${tool.name}"}) for full schema.`
}

/**
 * Override tools/list with minimal schemas for progressive disclosure.
 *
 * This reduces upfront token usage by ~90% (from ~52KB to ~5KB).
 * Full schemas are available on-demand via grist_help({tools: "tool_name"}).
 *
 * MCP spec allows minimal inputSchema with just {type: "object"}.
 */
function overrideToolsList(server: McpServer): void {
  // Access the underlying Server instance to override the handler
  // The SDK's McpServer exposes server.server (readonly Server)
  // biome-ignore lint/complexity/noBannedTypes: SDK internal type not exported
  const internalServer = (server as unknown as { server: { setRequestHandler: Function } }).server

  internalServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: ALL_TOOLS.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: buildRichDescription(tool),
        inputSchema: { type: 'object' as const }, // Minimal MCP-compliant schema
        annotations: {
          readOnlyHint: tool.annotations.readOnlyHint,
          destructiveHint: tool.annotations.destructiveHint,
          idempotentHint: tool.annotations.idempotentHint,
          openWorldHint: tool.annotations.openWorldHint
        }
      }))
    }
  })
}

async function main(): Promise<void> {
  const config = validateEnvironment(process.env)
  initSessionAnalytics(sharedLogger)

  if (STRICT_MODE) {
    console.error('⚠ STRICT_MODE enabled: Response size limits reduced for debugging')
  }

  // Create server with all dependencies via factory
  serverInstance = await createGristMcpServer(config)

  await registerTools(serverInstance.server, serverInstance.context)

  // Override tools/list with minimal schemas for progressive disclosure
  // Full schemas are available via grist_help({tools: "tool_name"})
  overrideToolsList(serverInstance.server)

  await connectServer(serverInstance.server)
  logStartupInfo(config)
}

main().catch((error: unknown) => {
  console.error('')
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.error('  FATAL ERROR')
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.error('')

  if (error instanceof Error) {
    console.error(`Error: ${error.message}`)
    if (error.stack) {
      console.error('')
      console.error('Stack trace:')
      console.error(error.stack)
    }
  } else {
    console.error('Unknown error:', error)
  }

  console.error('')
  process.exit(1)
})

function setupSignalHandlers(): void {
  const shutdown = async (signal: string) => {
    console.error('')
    console.error(`Received ${signal}, shutting down gracefully...`)

    if (serverInstance) {
      await serverInstance.cleanup()
    }

    console.error('')
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

setupSignalHandlers()

// Re-export server factory for programmatic use
export {
  createGristMcpServer,
  type ServerConfig,
  type ServerDependencies,
  type ServerInstance
} from './server.js'
export {
  type ColId,
  type DocId,
  fromBranded,
  type OrgId,
  type RowId,
  safeToDocId,
  safeToTableId,
  type TableId,
  toColId,
  toDocId,
  toOrgId,
  toRowId,
  toTableId,
  toWorkspaceId,
  type WorkspaceId
} from './types/advanced.js'
