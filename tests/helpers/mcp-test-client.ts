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
import { createGristMcpServer, type ServerInstance } from '../../src/server.js'

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
  // SDK's registerTool() automatically sets up tools/list handler
  await registerToolsBatch(serverInstance.server, serverInstance.context, ALL_TOOLS, silentStrategy)

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

// =============================================================================
// Standardized Test Harness for Data-Driven Tests
// =============================================================================

/**
 * Test case definition for MCP tool tests.
 * Designed to work with Vitest's describe.each/it.each.
 */
export interface MCPToolTestCase<TArgs = Record<string, unknown>> {
  /** Descriptive label for the test case (shown in test name) */
  desc: string
  /** Tool arguments (docId will be injected by harness) */
  args: TArgs
  /** Expected behavior - 'success' or 'error' or specific field check */
  expect: 'success' | 'error' | { field: string; value: unknown }
  /** Optional: additional assertions on the parsed response */
  assertions?: (parsed: Record<string, unknown>) => void
}

/**
 * Result of calling an MCP tool through the test harness.
 */
export interface MCPToolCallResult {
  /** Whether the MCP call itself errored (schema validation failure) */
  isError: boolean
  /** Raw text content from the response */
  text: string
  /** Parsed JSON response (or null if not JSON) */
  parsed: Record<string, unknown> | null
  /** Success status from parsed response */
  success: boolean | null
}

/**
 * Call an MCP tool and return a structured result for assertions.
 *
 * This helper standardizes the common pattern:
 * 1. Call tool via MCP
 * 2. Extract text content
 * 3. Parse JSON
 * 4. Return structured result
 *
 * @example
 * ```typescript
 * const result = await callMCPTool(ctx, 'grist_manage_schema', {
 *   docId: testDocId,
 *   operations: [{ action: 'create_table', name: 'Test', columns: [] }],
 *   response_format: 'json'
 * })
 *
 * expect(result.success).toBe(true)
 * ```
 */
export async function callMCPTool(
  ctx: MCPTestContext,
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolCallResult> {
  const result = await ctx.client.callTool({ name: toolName, arguments: args })

  const isError = result.isError ?? false
  const text = (result.content[0] as { text?: string })?.text ?? ''

  let parsed: Record<string, unknown> | null = null
  let success: boolean | null = null

  if (!isError && text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>
      success = parsed.success as boolean | null
    } catch {
      // Not JSON - that's okay for markdown format
    }
  }

  return { isError, text, parsed, success }
}

/**
 * Factory to create a test runner for a specific tool.
 *
 * Returns a function that can be used in it.each callbacks.
 * Handles common boilerplate: null docId check, calling tool, parsing response.
 *
 * @example
 * ```typescript
 * const runSchemaTest = createToolTestRunner(ctx, 'grist_manage_schema', () => testDocId)
 *
 * it.each(COLUMN_TYPE_CASES)(
 *   'creates column type: $type',
 *   async (testCase) => {
 *     const result = await runSchemaTest({
 *       operations: [{ action: 'add_column', tableId: 'Test', column: testCase }],
 *       response_format: 'json'
 *     })
 *     expect(result.success).toBe(true)
 *   }
 * )
 * ```
 */
export function createToolTestRunner(
  ctx: MCPTestContext,
  toolName: string,
  getDocId: () => string | null
): (args: Omit<Record<string, unknown>, 'docId'>) => Promise<MCPToolCallResult> {
  return async (args) => {
    const docId = getDocId()
    if (!docId) {
      return { isError: true, text: 'No docId available', parsed: null, success: null }
    }
    return callMCPTool(ctx, toolName, { docId, ...args })
  }
}

/**
 * Create test cases from a dataset for use with it.each.
 *
 * This is the most DRY approach - define your test data as simple objects,
 * then let this helper generate the full test cases.
 *
 * @example
 * ```typescript
 * // Define data (minimal, focused on what varies)
 * const COLUMN_TYPES = [
 *   { type: 'Text', colId: 'Name' },
 *   { type: 'Numeric', colId: 'Price' },
 *   { type: 'Bool', colId: 'Active' },
 * ]
 *
 * // Generate test cases with the operation shape
 * const cases = createTestCasesFromData(COLUMN_TYPES, (data) => ({
 *   desc: `column type: ${data.type}`,
 *   args: {
 *     operations: [{ action: 'add_column', tableId: 'Test', column: data }],
 *     response_format: 'json'
 *   },
 *   expect: 'success'
 * }))
 *
 * it.each(cases)('$desc', async ({ args, expect: expected }) => {
 *   const result = await runTest(args)
 *   if (expected === 'success') expect(result.success).toBe(true)
 * })
 * ```
 */
export function createTestCasesFromData<TData, TArgs>(
  data: readonly TData[],
  mapper: (item: TData) => MCPToolTestCase<TArgs>
): MCPToolTestCase<TArgs>[] {
  return data.map(mapper)
}
