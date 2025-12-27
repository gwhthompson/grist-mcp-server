/**
 * Unit tests for Cloudflare Workers entry point.
 *
 * Tests CORS handling, authentication, routing, and MCP handler integration.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Use vi.hoisted to declare mocks that will be available in vi.mock factories
const { mockHandler, mockCreateMcpHandler, mockCreateGristMcpServer, mockRegisterToolsBatch } =
  vi.hoisted(() => {
    const mockHandler = vi.fn(() => new Response('OK', { status: 200 }))
    const mockCreateMcpHandler = vi.fn(() => mockHandler)
    const mockCreateGristMcpServer = vi.fn(() =>
      Promise.resolve({
        server: { mockServer: true },
        context: { mockContext: true },
        cleanup: vi.fn(() => Promise.resolve())
      })
    )
    const mockRegisterToolsBatch = vi.fn(() => Promise.resolve())
    return { mockHandler, mockCreateMcpHandler, mockCreateGristMcpServer, mockRegisterToolsBatch }
  })

// Mock dependencies
vi.mock('agents/mcp', () => ({
  createMcpHandler: mockCreateMcpHandler
}))

vi.mock('../../src/server.js', () => ({
  createGristMcpServer: mockCreateGristMcpServer
}))

vi.mock('../../src/registry/tool-registry.js', () => ({
  registerToolsBatch: mockRegisterToolsBatch
}))

vi.mock('../../src/registry/tool-definitions.js', () => ({
  ALL_TOOLS: []
}))

// Import after mocks are set up
import worker from '../../src/worker.js'

describe('worker', () => {
  const mockEnv = {
    GRIST_API_KEY: undefined as string | undefined,
    GRIST_BASE_URL: undefined as string | undefined
  }

  const mockCtx: ExecutionContext = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('CORS preflight', () => {
    it('returns CORS headers for OPTIONS request', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'OPTIONS'
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.status).toBe(200)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
        'GET, POST, DELETE, OPTIONS'
      )
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Grist-API-Key')
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Grist-Base-URL')
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Mcp-Session-Id')
      expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Mcp-Session-Id')
      expect(response.headers.get('Access-Control-Max-Age')).toBe('86400')
      expect(response.headers.get('Vary')).toBe('Origin')
    })

    it('returns CORS headers for OPTIONS on any path', async () => {
      const request = new Request('https://example.com/other-path', {
        method: 'OPTIONS'
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.status).toBe(200)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('route handling', () => {
    it('returns 404 for non-/mcp paths', async () => {
      const request = new Request('https://example.com/other-path', {
        method: 'GET',
        headers: { 'X-Grist-API-Key': 'test-key' }
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.status).toBe(404)
      expect(await response.text()).toBe('Not Found')
    })

    it('returns 404 for root path', async () => {
      const request = new Request('https://example.com/', {
        method: 'GET',
        headers: { 'X-Grist-API-Key': 'test-key' }
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.status).toBe(404)
    })

    it('accepts /mcp path', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: { 'X-Grist-API-Key': 'test-key' }
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      // Should not be 404 - will proceed to handler
      expect(response.status).not.toBe(404)
    })

    it('accepts /mcp/subpath', async () => {
      const request = new Request('https://example.com/mcp/message', {
        method: 'POST',
        headers: { 'X-Grist-API-Key': 'test-key' }
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.status).not.toBe(404)
    })
  })

  describe('authentication', () => {
    it('returns 401 when API key is missing', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST'
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.status).toBe(401)
      expect(response.headers.get('Content-Type')).toBe('application/json')

      const body = await response.json()
      expect(body).toEqual({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Missing X-Grist-API-Key header' },
        id: null
      })
    })

    it('returns CORS headers with 401 response', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST'
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.status).toBe(401)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Grist-API-Key')
      expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Mcp-Session-Id')
      expect(response.headers.get('Vary')).toBe('Origin')
    })

    it('extracts API key from X-Grist-API-Key header', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: { 'X-Grist-API-Key': 'user-provided-key' }
      })

      await worker.fetch(request, mockEnv, mockCtx)

      expect(mockCreateGristMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({
          gristApiKey: 'user-provided-key'
        })
      )
    })

    it('falls back to env API key when header is missing', async () => {
      const envWithKey = { GRIST_API_KEY: 'env-api-key', GRIST_BASE_URL: undefined }
      const request = new Request('https://example.com/mcp', {
        method: 'POST'
      })

      await worker.fetch(request, envWithKey, mockCtx)

      expect(mockCreateGristMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({
          gristApiKey: 'env-api-key'
        })
      )
    })

    it('prefers header API key over env API key', async () => {
      const envWithKey = { GRIST_API_KEY: 'env-api-key', GRIST_BASE_URL: undefined }
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: { 'X-Grist-API-Key': 'header-api-key' }
      })

      await worker.fetch(request, envWithKey, mockCtx)

      expect(mockCreateGristMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({
          gristApiKey: 'header-api-key'
        })
      )
    })
  })

  describe('base URL handling', () => {
    it('extracts base URL from X-Grist-Base-URL header', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'X-Grist-API-Key': 'test-key',
          'X-Grist-Base-URL': 'https://custom.grist.com'
        }
      })

      await worker.fetch(request, mockEnv, mockCtx)

      expect(mockCreateGristMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({
          gristBaseUrl: 'https://custom.grist.com'
        })
      )
    })

    it('falls back to env base URL', async () => {
      const envWithUrl = { GRIST_API_KEY: 'test-key', GRIST_BASE_URL: 'https://env.grist.com' }
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: { 'X-Grist-API-Key': 'test-key' }
      })

      await worker.fetch(request, envWithUrl, mockCtx)

      expect(mockCreateGristMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({
          gristBaseUrl: 'https://env.grist.com'
        })
      )
    })

    it('uses default base URL when not specified', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: { 'X-Grist-API-Key': 'test-key' }
      })

      await worker.fetch(request, mockEnv, mockCtx)

      expect(mockCreateGristMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({
          gristBaseUrl: 'https://docs.getgrist.com'
        })
      )
    })
  })

  describe('MCP handler', () => {
    it('creates server with correct configuration', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: { 'X-Grist-API-Key': 'test-key' }
      })

      await worker.fetch(request, mockEnv, mockCtx)

      expect(mockCreateGristMcpServer).toHaveBeenCalledWith({
        name: 'grist-mcp-server',
        version: expect.any(String),
        gristBaseUrl: 'https://docs.getgrist.com',
        gristApiKey: 'test-key'
      })
    })

    it('registers all tools', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: { 'X-Grist-API-Key': 'test-key' }
      })

      await worker.fetch(request, mockEnv, mockCtx)

      expect(mockRegisterToolsBatch).toHaveBeenCalledWith(
        expect.objectContaining({ mockServer: true }),
        expect.objectContaining({ mockContext: true }),
        expect.any(Array)
      )
    })

    it('creates MCP handler with correct options', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: { 'X-Grist-API-Key': 'test-key' }
      })

      await worker.fetch(request, mockEnv, mockCtx)

      expect(mockCreateMcpHandler).toHaveBeenCalledWith(
        expect.objectContaining({ mockServer: true }),
        expect.objectContaining({
          route: '/mcp',
          corsOptions: expect.objectContaining({
            origin: '*',
            methods: 'GET, POST, DELETE, OPTIONS'
          })
        })
      )
    })

    it('passes request to handler', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: { 'X-Grist-API-Key': 'test-key' }
      })

      await worker.fetch(request, mockEnv, mockCtx)

      expect(mockHandler).toHaveBeenCalledWith(request, mockEnv, mockCtx)
    })

    it('schedules cleanup via waitUntil', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: { 'X-Grist-API-Key': 'test-key' }
      })

      await worker.fetch(request, mockEnv, mockCtx)

      // Verify waitUntil was called with a promise (cleanup)
      expect(mockCtx.waitUntil).toHaveBeenCalledTimes(1)
      expect(mockCtx.waitUntil).toHaveBeenCalledWith(expect.any(Promise))
    })
  })
})
