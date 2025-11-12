#!/usr/bin/env node
/**
 * Grist MCP Server - Refactored Entry Point
 *
 * Production-ready Model Context Protocol server for Grist API integration.
 * Enables AI assistants to naturally interact with Grist documents, tables, and records.
 *
 * Architecture:
 * - Modular tool registration via registry system
 * - Type-safe tool definitions with Zod validation
 * - Centralized configuration and error handling
 * - Separation of concerns: initialization, registration, and tool logic
 *
 * Features:
 * - 15 workflow-oriented tools covering all common Grist operations
 * - Dual format support (JSON and Markdown responses)
 * - Progressive detail levels (summary/detailed, names/columns/full_schema)
 * - Smart context management (25K character limits with intelligent truncation)
 * - Comprehensive error messages with actionable guidance
 * - Full type safety with Zod validation and TypeScript generics
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { DEFAULT_BASE_URL } from './constants.js'
import { GristClient } from './services/grist-client.js'
import { ALL_TOOLS } from './registry/tool-definitions.js'
import {
  registerToolsBatch,
  consoleLoggingStrategy,
  validateToolNames,
  getToolStatsByCategory
} from './registry/tool-registry.js'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Server configuration options
 * Centralized configuration for maintainability
 */
interface ServerConfig {
  readonly name: string
  readonly version: string
  readonly gristBaseUrl: string
  readonly gristApiKey: string
}

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Validate and extract server configuration from environment
 *
 * Validates required environment variables and provides helpful error messages
 * for missing or invalid configuration.
 *
 * @param env - Environment variables (typically process.env)
 * @returns Validated server configuration
 * @throws Error if required configuration is missing
 */
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
    version: '1.0.0',
    gristBaseUrl: baseUrl,
    gristApiKey: apiKey
  }
}

// ============================================================================
// Server Initialization
// ============================================================================

/**
 * Initialize MCP server instance
 *
 * Creates and configures the MCP server with proper metadata.
 *
 * @param config - Server configuration
 * @returns Configured MCP server instance
 */
function initializeServer(config: ServerConfig): McpServer {
  return new McpServer({
    name: config.name,
    version: config.version
  })
}

/**
 * Initialize Grist API client
 *
 * Creates an authenticated client for interacting with the Grist API.
 *
 * @param config - Server configuration with API credentials
 * @returns Configured Grist client instance
 */
function initializeGristClient(config: ServerConfig): GristClient {
  return new GristClient(config.gristBaseUrl, config.gristApiKey)
}

/**
 * Connect MCP server to stdio transport
 *
 * Establishes the communication channel between the MCP server and clients.
 * Uses stdio for standard MCP server communication.
 *
 * @param server - Initialized MCP server
 * @returns Promise that resolves when connection is established
 */
async function connectServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register all tools with the MCP server
 *
 * Performs comprehensive tool registration with validation and error handling:
 * 1. Validates tool definitions (unique names, valid schemas)
 * 2. Registers all tools in batch
 * 3. Reports registration statistics
 * 4. Handles errors gracefully
 *
 * @param server - MCP server instance
 * @param client - Grist API client
 * @returns Promise that resolves when all tools are registered
 * @throws Error if tool validation fails or critical registration errors occur
 */
async function registerTools(
  server: McpServer,
  client: GristClient
): Promise<void> {
  // Validate tool definitions before registration
  const validation = validateToolNames(ALL_TOOLS)
  if (!validation.valid) {
    throw new Error(
      `Tool registration failed: Duplicate tool names detected:\n` +
      validation.duplicates.map((name) => `  - ${name}`).join('\n')
    )
  }

  // Get statistics for logging
  const stats = getToolStatsByCategory(ALL_TOOLS)
  const totalTools = ALL_TOOLS.length

  console.error(`Registering ${totalTools} Grist tools...`)
  console.error('')

  // Register all tools with console logging
  const summary = await registerToolsBatch(
    server,
    client,
    ALL_TOOLS,
    consoleLoggingStrategy
  )

  // Check for registration failures
  if (summary.failed > 0) {
    const failedTools = summary.results
      .filter((r) => !r.success)
      .map((r) => `  - ${r.toolName}: ${r.error?.message}`)
      .join('\n')

    console.error('')
    console.error('WARNING: Some tools failed to register:')
    console.error(failedTools)
    console.error('')

    // In production, you might want to fail completely
    // For now, we continue with successfully registered tools
  }

  // Log final status
  if (summary.successful === totalTools) {
    console.error('✓ All tools registered successfully!')
  } else {
    console.error(`⚠ Registered ${summary.successful}/${totalTools} tools`)
  }
}

// ============================================================================
// Startup Diagnostics
// ============================================================================

/**
 * Log server startup information
 *
 * Provides diagnostic information useful for debugging and monitoring.
 *
 * @param config - Server configuration
 */
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

// ============================================================================
// Main Application
// ============================================================================

/**
 * Main application entry point
 *
 * Orchestrates the complete server initialization sequence:
 * 1. Validate environment configuration
 * 2. Initialize MCP server
 * 3. Initialize Grist client
 * 4. Register all tools
 * 5. Connect to transport
 * 6. Log startup information
 *
 * Uses a clean, functional approach with proper error propagation.
 */
async function main(): Promise<void> {
  // Step 1: Validate environment and build configuration
  const config = validateEnvironment(process.env)

  // Step 2: Initialize MCP server
  const server = initializeServer(config)

  // Step 3: Initialize Grist API client
  const client = initializeGristClient(config)

  // Step 4: Register all tools with the server
  await registerTools(server, client)

  // Step 5: Connect server to stdio transport
  await connectServer(server)

  // Step 6: Log startup information
  logStartupInfo(config)
}

// ============================================================================
// Application Entry
// ============================================================================

/**
 * Run the server with comprehensive error handling
 *
 * Catches and reports all errors, ensuring proper exit codes.
 * In production, errors are logged to stderr and the process exits with code 1.
 */
main().catch((error: unknown) => {
  // Log error with context
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

  // Exit with error code
  process.exit(1)
})

// ============================================================================
// Process Signal Handling
// ============================================================================

/**
 * Handle graceful shutdown on process signals
 *
 * Ensures clean shutdown when receiving SIGINT (Ctrl+C) or SIGTERM.
 * This prevents resource leaks and allows for cleanup operations.
 */
function setupSignalHandlers(): void {
  const shutdown = (signal: string) => {
    console.error('')
    console.error(`Received ${signal}, shutting down gracefully...`)
    console.error('')
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

setupSignalHandlers()

// ============================================================================
// Public API Exports (for programmatic usage)
// ============================================================================

/**
 * Export encoding utilities for library users
 *
 * These helpers are designed for developers who want to programmatically
 * create Grist records with proper CellValue encoding.
 */
export {
  // Encoding helpers
  createList,
  createDate,
  createDateTime,
  createReference,
  createReferenceList,
  createDict,
  createCensored,
  createException,
  createPending,
  createUnmarshallable,

  // Type guards
  isList,
  isDate,
  isDateTime,
  isReference,
  isReferenceList,
  isDict,
  isCensored,
  isException,
  isPending,
  isUnmarshallable,
  isPrimitive,

  // Extractors
  extractListItems,
  extractDateTime,
  extractDate,
  extractReference,
  extractReferenceList,
  extractDict,

  // Utilities
  validateCellValue,
  getCellValueType,
  SAMPLE_CELL_VALUES,

  // GristObjCode enum
  GristObjCode
} from './encoding/cell-value-helpers.js'

// Export branded ID types (simple, useful for developers)
export {
  toDocId,
  toTableId,
  toWorkspaceId,
  toRowId,
  toColId,
  toOrgId,
  safeToDocId,
  safeToTableId,
  fromBranded,
  type DocId,
  type TableId,
  type WorkspaceId,
  type RowId,
  type ColId,
  type OrgId
} from './types/advanced.js'
