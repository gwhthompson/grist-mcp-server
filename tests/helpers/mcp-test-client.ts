/**
 * MCP Test Client Helper
 *
 * Creates an in-memory MCP client connected to the Grist MCP server.
 * Uses InMemoryTransport for fast, reliable protocol testing without
 * process spawning overhead.
 *
 * Still hits real Docker Grist instance via GristClient.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { inject } from 'vitest'
import { ALL_TOOLS } from '../../src/registry/tool-definitions.js'
import { registerToolsBatch, silentStrategy } from '../../src/registry/tool-registry.js'
import { registerResources } from '../../src/resources/index.js'
import { registerSchemas } from '../../src/schemas/registry.js'
import { setupToolsListHandler } from '../../src/schemas/schema-utils.js'
import { createGristMcpServer, type ServerInstance } from '../../src/server.js'

// Register schemas once at module load - mirrors production behavior in src/index.ts
registerSchemas()

/**
 * Test context containing MCP client and server instance.
 */
export interface MCPTestContext {
  /** MCP client for making protocol calls */
  readonly client: Client
  /** Server instance (for access to Grist client if needed) */
  readonly serverInstance: ServerInstance
  /** Cleanup function - call in afterAll/afterEach */
  readonly cleanup: () => Promise<void>
}

/**
 * Options for creating an MCP test client.
 */
export interface MCPTestClientOptions {
  /** Override Grist URL (default: from globalSetup) */
  gristBaseUrl?: string
  /** Override Grist API key (default: from globalSetup) */
  gristApiKey?: string
  /** Skip resource registration (default: false) */
  skipResources?: boolean
}

/**
 * Create an in-memory MCP client connected to the Grist MCP server.
 *
 * This function:
 * 1. Creates a linked transport pair (in-process, no network)
 * 2. Creates a Grist MCP server with real Grist client
 * 3. Registers all tools and resources
 * 4. Connects server and client via the transport
 *
 * The client can then make MCP protocol calls (listTools, callTool, etc.)
 * which go through the full MCP protocol stack but still hit the real
 * Docker Grist instance.
 *
 * @example
 * ```typescript
 * let ctx: MCPTestContext
 *
 * beforeAll(async () => {
 *   ctx = await createMCPTestClient()
 * })
 *
 * afterAll(async () => {
 *   await ctx.cleanup()
 * })
 *
 * it('should list all tools', async () => {
 *   const result = await ctx.client.listTools()
 *   expect(result.tools).toHaveLength(12)
 * })
 * ```
 */
export async function createMCPTestClient(
  options: MCPTestClientOptions = {}
): Promise<MCPTestContext> {
  // Get Docker Grist credentials from globalSetup (same as existing tests)
  const gristUrl = options.gristBaseUrl ?? inject('GRIST_BASE_URL')
  const gristApiKey = options.gristApiKey ?? inject('GRIST_API_KEY')

  if (!gristUrl || !gristApiKey) {
    throw new Error('Grist credentials not available. Ensure globalSetup ran or provide options.')
  }

  // Create linked transport pair (in-process, fast)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  // Create MCP server with REAL Grist client
  const serverInstance = await createGristMcpServer({
    name: 'grist-mcp-server-test',
    version: '1.0.0-test',
    gristBaseUrl: gristUrl,
    gristApiKey: gristApiKey
  })

  // Register all tools (silently - no console output)
  await registerToolsBatch(serverInstance.server, serverInstance.context, ALL_TOOLS, silentStrategy)

  // Setup tools/list handler - uses SAME function as production (no duplication)
  setupToolsListHandler(serverInstance.server, ALL_TOOLS)

  // Register resources (unless skipped)
  if (!options.skipResources) {
    registerResources(serverInstance.server, serverInstance.context)
  }

  // Connect server to transport
  await serverInstance.server.connect(serverTransport)

  // Create and connect MCP client
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} })
  await client.connect(clientTransport)

  return {
    client,
    serverInstance,
    cleanup: async () => {
      // Close client first
      await client.close()

      // Then cleanup server resources
      await serverInstance.cleanup()
    }
  }
}

/**
 * Type helper for tool call results.
 */
export interface ToolCallResult {
  content: Array<{ type: string; text?: string }>
  structuredContent?: unknown
  isError?: boolean
}
