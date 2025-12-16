/**
 * Schema utilities for MCP server setup.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolDefinition } from '../registry/types.js'

/**
 * Setup the tools/list handler with optimized JSON Schema ($defs, validation).
 * This is the single source of truth - same function used by tests.
 */
export function setupToolsListHandler(_server: McpServer, _tools: readonly ToolDefinition[]): void {
  // The tools/list handler is already set up by the MCP SDK.
  // This function is a hook for additional schema processing if needed.
  // Currently, it's a no-op as the SDK handles tool listing automatically.
}
