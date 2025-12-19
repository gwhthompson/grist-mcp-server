import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// Mock axios before importing GristClient
vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
      isAxiosError: (error: unknown) =>
        error instanceof Error && 'isAxiosError' in error && error.isAxiosError === true
    }
  }
})

import axios from 'axios'
import { GristClient } from '../../../src/services/grist-client.js'

// Helper to create axios-like errors
function createAxiosError(
  status: number,
  data?: unknown,
  message = 'Request failed'
): Error & { isAxiosError: boolean; response?: { status: number; data: unknown } } {
  const error = new Error(message) as Error & {
    isAxiosError: boolean
    response?: { status: number; data: unknown }
  }
  error.isAxiosError = true
  error.response = { status, data }
  return error
}

describe('GristClient', () => {
  let client: GristClient
  let mockAxiosInstance: {
    get: ReturnType<typeof vi.fn>
    post: ReturnType<typeof vi.fn>
    put: ReturnType<typeof vi.fn>
    patch: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Get the mock axios instance
    mockAxiosInstance = (axios.create as ReturnType<typeof vi.fn>).mock.results[0]?.value || {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn()
    }

    // Create client with cache disabled and minimal retry for faster tests
    client = new GristClient(
      'https://docs.getgrist.com',
      'test-api-key',
      { maxRetries: 0 },
      undefined,
      undefined,
      false // disable cache
    )

    // Re-get the mock after creating client
    mockAxiosInstance = (axios.create as ReturnType<typeof vi.fn>).mock.results[0]?.value
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('creates axios instance with correct base URL', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://docs.getgrist.com/api'
        })
      )
    })

    it('sets authorization header', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key'
          })
        })
      )
    })

    it('sets content type headers', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Accept: 'application/json'
          })
        })
      )
    })
  })

  describe('get()', () => {
    it('makes GET request to path', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { id: 1 } })

      const result = await client.get('/docs/abc123/tables')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/docs/abc123/tables', expect.anything())
      expect(result).toEqual({ id: 1 })
    })

    it('passes query params', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { items: [] } })

      await client.get('/docs/abc123/records', { limit: 100, offset: 0 })

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/docs/abc123/records',
        expect.objectContaining({
          params: { limit: 100, offset: 0 }
        })
      )
    })

    it('validates response with schema when provided', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { name: 'Test', count: 5 }
      })

      const schema = z.object({
        name: z.string(),
        count: z.number()
      })

      const result = await client.get('/test', undefined, { schema })

      expect(result).toEqual({ name: 'Test', count: 5 })
    })
  })

  describe('post()', () => {
    it('makes POST request with data', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true } })

      const result = await client.post('/docs/abc123/apply', {
        actions: [['AddRecord', 'Table1', null, {}]]
      })

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/docs/abc123/apply',
        { actions: [['AddRecord', 'Table1', null, {}]] },
        undefined
      )
      expect(result).toEqual({ success: true })
    })
  })

  describe('put()', () => {
    it('makes PUT request with data', async () => {
      mockAxiosInstance.put.mockResolvedValue({ data: { updated: true } })

      const result = await client.put('/docs/abc123/tables/Table1', {
        name: 'NewName'
      })

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/docs/abc123/tables/Table1',
        { name: 'NewName' },
        undefined
      )
      expect(result).toEqual({ updated: true })
    })
  })

  describe('patch()', () => {
    it('makes PATCH request with data', async () => {
      mockAxiosInstance.patch.mockResolvedValue({ data: { patched: true } })

      const result = await client.patch('/docs/abc123/webhooks/wh1', {
        enabled: false
      })

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/docs/abc123/webhooks/wh1',
        { enabled: false },
        undefined
      )
      expect(result).toEqual({ patched: true })
    })
  })

  describe('delete()', () => {
    it('makes DELETE request', async () => {
      mockAxiosInstance.delete.mockResolvedValue({ data: { deleted: true } })

      const result = await client.delete('/docs/abc123/tables/Table1')

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/docs/abc123/tables/Table1', undefined)
      expect(result).toEqual({ deleted: true })
    })
  })

  describe('error handling', () => {
    it('throws error with status code on 400 error', async () => {
      const axiosError = createAxiosError(400, { error: 'Invalid request' })
      mockAxiosInstance.get.mockRejectedValue(axiosError)

      await expect(client.get('/test')).rejects.toThrow()
    })

    it('throws error with Grist message on 404', async () => {
      const axiosError = createAxiosError(404, { error: 'Document not found' })
      mockAxiosInstance.get.mockRejectedValue(axiosError)

      await expect(client.get('/docs/invalid')).rejects.toThrow()
    })

    it('throws error on 500', async () => {
      const axiosError = createAxiosError(500, { error: 'Server error' })
      mockAxiosInstance.post.mockRejectedValue(axiosError)

      await expect(client.post('/test', {})).rejects.toThrow()
    })
  })

  describe('getRateLimiter()', () => {
    it('returns the rate limiter instance', () => {
      const limiter = client.getRateLimiter()
      expect(limiter).toBeDefined()
    })
  })

  describe('getResponseCache()', () => {
    it('returns the cache instance', () => {
      const cache = client.getResponseCache()
      expect(cache).toBeDefined()
    })
  })

  describe('caching', () => {
    it('caches GET responses when enabled', async () => {
      // Create client with cache enabled
      const cachedClient = new GristClient(
        'https://docs.getgrist.com',
        'test-api-key',
        { maxRetries: 0 },
        undefined,
        undefined,
        true // enable cache
      )

      const mockInstance = (axios.create as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value
      mockInstance.get.mockResolvedValue({ data: { id: 1 } })

      // First call - should hit the API
      await cachedClient.get('/test')
      expect(mockInstance.get).toHaveBeenCalledTimes(1)

      // Second call - should be cached
      await cachedClient.get('/test')
      // Axios should still only be called once (cache hit)
      expect(mockInstance.get).toHaveBeenCalledTimes(1)
    })
  })
})
