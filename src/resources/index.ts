/**
 * MCP Resources for Grist.
 *
 * Resources expose schema and structural data following the resource-oriented
 * architecture pattern used by PG-MCP for database schema exposure.
 *
 * URI Scheme:
 *   grist://docs                              - Document index
 *   grist://docs/{docId}                      - Document schema (all tables + columns)
 *   grist://docs/{docId}/tables/{tableId}     - Table schema (detailed)
 *   grist://docs/{docId}/pages                - Page/widget structure
 *
 * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from '../registry/types.js'
import { registerDocumentIndexResource } from './document-index.js'
import { registerDocumentSchemaResource } from './document-schema.js'
import { registerPageStructureResource } from './page-structure.js'
import { registerTableSchemaResource } from './table-schema.js'

/**
 * Register all Grist MCP resources with the server.
 *
 * @param server - MCP server instance
 * @param context - Tool context with Grist client and schema cache
 */
export function registerResources(server: McpServer, context: ToolContext): void {
  console.error('Registering Grist resources...')

  // Static resource: document index
  registerDocumentIndexResource(server, context)

  // Template resource: document schema
  registerDocumentSchemaResource(server, context)

  // Template resource: table schema
  registerTableSchemaResource(server, context)

  // Template resource: page structure
  registerPageStructureResource(server, context)

  console.error('  Registered 4 resources')
}

export { registerDocumentIndexResource } from './document-index.js'
export { registerDocumentSchemaResource } from './document-schema.js'
export { registerPageStructureResource } from './page-structure.js'
export { registerTableSchemaResource } from './table-schema.js'
