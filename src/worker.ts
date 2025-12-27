/**
 * Cloudflare Workers entry point for grist-mcp-server.
 *
 * Provides a remote MCP server using streamable-http transport at /mcp endpoint.
 * Uses header-based authentication (X-Grist-API-Key).
 *
 * Architecture notes:
 * - Stateless design: Each request creates a fresh server instance with the user's
 *   credentials. This is intentional - Workers are stateless by default and caching
 *   servers would require Durable Objects, adding complexity. Per-request instantiation
 *   ensures credentials are never shared between requests.
 *
 * - CORS wildcard: The `origin: '*'` is acceptable here because authentication uses
 *   API keys sent via headers (not cookies). This means there's no CSRF risk - an
 *   attacker's site cannot make authenticated requests without the user's API key.
 *   MCP clients connect from various origins (Claude Desktop, Inspector, etc.), so
 *   restrictive CORS would break legitimate use cases.
 *
 * @see https://developers.cloudflare.com/agents/model-context-protocol/transport/
 */

/// <reference types="@cloudflare/workers-types" />

import { createMcpHandler } from 'agents/mcp'
import { ALL_TOOLS } from './registry/tool-definitions.js'
import { registerToolsBatch } from './registry/tool-registry.js'
import { createGristMcpServer } from './server.js'

/**
 * Cloudflare Workers environment bindings.
 */
interface Env {
  /** Optional default Grist API key from environment */
  GRIST_API_KEY?: string
  /** Optional default Grist base URL from environment */
  GRIST_BASE_URL?: string
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Handle CORS preflight (per Cloudflare best practices)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers':
            'Content-Type, Accept, X-Grist-API-Key, X-Grist-Base-URL, Mcp-Session-Id',
          'Access-Control-Expose-Headers': 'Mcp-Session-Id',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin'
        }
      })
    }

    // Route check - return 404 for non-MCP paths before auth
    if (!url.pathname.startsWith('/mcp')) {
      return new Response('Not Found', { status: 404 })
    }

    // Extract credentials from headers (user provides per-request)
    const apiKey = request.headers.get('X-Grist-API-Key') || env.GRIST_API_KEY
    const baseUrl =
      request.headers.get('X-Grist-Base-URL') || env.GRIST_BASE_URL || 'https://docs.getgrist.com'

    if (!apiKey) {
      // Return JSON-RPC 2.0 error format (code -32001 is in application-defined range)
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Missing X-Grist-API-Key header' },
          id: null
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers':
              'Content-Type, Accept, X-Grist-API-Key, X-Grist-Base-URL, Mcp-Session-Id',
            'Access-Control-Expose-Headers': 'Mcp-Session-Id',
            Vary: 'Origin'
          }
        }
      )
    }

    // Create server instance with user's credentials (stateless - new per request)
    const instance = await createGristMcpServer({
      name: 'grist-mcp-server',
      version: '2.0.33',
      gristBaseUrl: baseUrl,
      gristApiKey: apiKey
    })

    await registerToolsBatch(instance.server, instance.context, ALL_TOOLS)

    // Stateless handler - /mcp endpoint (streamable-http transport, MCP spec 2025-03-26)
    // Type assertion needed due to SDK version mismatch between agents (1.23.0) and our SDK (1.24.3)
    // biome-ignore lint/suspicious/noExplicitAny: SDK version mismatch requires type bypass
    const handler = createMcpHandler(instance.server as any, {
      route: '/mcp',
      corsOptions: {
        origin: '*',
        methods: 'GET, POST, DELETE, OPTIONS',
        headers: 'Content-Type, Accept, X-Grist-API-Key, X-Grist-Base-URL, Mcp-Session-Id',
        exposeHeaders: 'Mcp-Session-Id',
        maxAge: 86400
      }
    })

    const response = await handler(request, env, _ctx)

    // Schedule cleanup to run after response is sent (per Cloudflare best practices)
    _ctx.waitUntil(instance.cleanup())

    return response
  }
}
