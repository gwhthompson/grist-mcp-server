/**
 * Unit tests for ApiError with status 429 (rate limiting)
 *
 * Tests:
 * - Constructor: Sets properties correctly
 * - toUserMessage(): Returns formatted message with retry info
 * - isRetryable(): Returns true for 429
 * - getRetryDelay(): Returns delay in milliseconds
 */

import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../src/errors/ApiError.js'

describe('ApiError (429 rate limit)', () => {
  describe('constructor', () => {
    it('creates error with retryAfter from context', () => {
      const error = new ApiError(429, 'GET', '/docs/abc123/tables', 'Rate limit exceeded', {
        retryAfter: 30,
        operation: 'list'
      })

      expect(error.statusCode).toBe(429)
      expect(error.method).toBe('GET')
      expect(error.path).toBe('/docs/abc123/tables')
      expect(error.retryAfter).toBe(30)
      expect(error.context?.operation).toBe('list')
    })

    it('creates error without retryAfter', () => {
      const error = new ApiError(
        429,
        'POST',
        '/docs/abc123/tables/Table1/records',
        'Rate limit exceeded'
      )

      expect(error.statusCode).toBe(429)
      expect(error.method).toBe('POST')
      expect(error.path).toBe('/docs/abc123/tables/Table1/records')
      expect(error.retryAfter).toBeUndefined()
    })

    it('sets code to API_ERROR_429', () => {
      const error = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded')

      expect(error.code).toBe('API_ERROR_429')
    })

    it('extends Error', () => {
      const error = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded')

      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('toUserMessage', () => {
    it('returns message with rate limit info', () => {
      const error = new ApiError(429, 'GET', '/docs/abc123/tables', 'Rate limit exceeded')

      const message = error.toUserMessage()

      expect(message).toContain('Rate limit exceeded')
      expect(message).toContain('GET /docs/abc123/tables')
    })

    it('includes method and path in message', () => {
      const error = new ApiError(
        429,
        'DELETE',
        '/docs/doc1/tables/Users/records/5',
        'Rate limit exceeded'
      )

      const message = error.toUserMessage()

      expect(message).toContain('DELETE /docs/doc1/tables/Users/records/5')
    })
  })

  describe('isRetryable', () => {
    it('returns true for 429', () => {
      const error = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded')

      expect(error.isRetryable()).toBe(true)
    })

    it('returns true regardless of retryAfter value', () => {
      const withRetry = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded', {
        retryAfter: 120
      })
      const withoutRetry = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded')

      expect(withRetry.isRetryable()).toBe(true)
      expect(withoutRetry.isRetryable()).toBe(true)
    })
  })

  describe('getRetryDelay', () => {
    it('returns retryAfter converted to milliseconds', () => {
      const error = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded', {
        retryAfter: 30
      })

      expect(error.getRetryDelay()).toBe(30000) // 30 * 1000
    })

    it('returns 60000ms when retryAfter is undefined', () => {
      const error = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded')

      expect(error.getRetryDelay()).toBe(60000) // 60 * 1000
    })

    it('handles zero retryAfter', () => {
      const error = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded', {
        retryAfter: 0
      })

      expect(error.getRetryDelay()).toBe(0)
    })

    it('handles large retryAfter values', () => {
      const error = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded', {
        retryAfter: 3600
      })

      expect(error.getRetryDelay()).toBe(3600000) // 1 hour in ms
    })
  })

  describe('inherited from ApiError', () => {
    it('has isClientError returning true for 429', () => {
      const error = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded')

      expect(error.isClientError()).toBe(true)
    })

    it('has isServerError returning false for 429', () => {
      const error = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded')

      expect(error.isServerError()).toBe(false)
    })
  })

  describe('inherited from GristError', () => {
    it('has timestamp set', () => {
      const before = new Date()
      const error = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded')
      const after = new Date()

      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('has isOperational set to true', () => {
      const error = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded')

      expect(error.isOperational).toBe(true)
    })

    it('serializes to JSON', () => {
      const error = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded', {
        retryAfter: 30
      })

      const json = error.toJSON()

      expect(json.code).toBe('API_ERROR_429')
      expect(json.message).toBe('Rate limit exceeded')
      expect(json.context).toHaveProperty('retryAfter', 30)
    })

    it('returns suggestions from ApiError', () => {
      const error = new ApiError(429, 'GET', '/api/test', 'Rate limit exceeded')

      const suggestions = error.getSuggestions()

      expect(suggestions).toContain('Wait 60 seconds before retrying')
      expect(suggestions).toContain('Reduce request frequency')
    })
  })
})
