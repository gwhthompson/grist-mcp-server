/**
 * Unit tests for RateLimitError
 *
 * Tests:
 * - Constructor: Sets properties correctly
 * - toUserMessage(): Returns formatted message with retry info
 * - isRetryable(): Always returns true
 * - getRetryDelay(): Returns delay in milliseconds
 */

import { describe, expect, it } from 'vitest'
import { RateLimitError } from '../../../src/errors/RateLimitError.js'

describe('RateLimitError', () => {
  describe('constructor', () => {
    it('creates error with all parameters', () => {
      const error = new RateLimitError('GET', '/docs/abc123/tables', 30, { operation: 'list' })

      expect(error.statusCode).toBe(429)
      expect(error.method).toBe('GET')
      expect(error.path).toBe('/docs/abc123/tables')
      expect(error.retryAfter).toBe(30)
      expect(error.context?.operation).toBe('list')
      expect(error.context?.retryAfter).toBe(30)
    })

    it('creates error without retryAfter', () => {
      const error = new RateLimitError('POST', '/docs/abc123/tables/Table1/records')

      expect(error.statusCode).toBe(429)
      expect(error.method).toBe('POST')
      expect(error.path).toBe('/docs/abc123/tables/Table1/records')
      expect(error.retryAfter).toBeUndefined()
    })

    it('creates error without context', () => {
      const error = new RateLimitError('DELETE', '/docs/abc123/tables/Table1', 60)

      expect(error.context?.retryAfter).toBe(60)
      expect(Object.keys(error.context ?? {})).toContain('retryAfter')
    })

    it('sets message to Rate limit exceeded', () => {
      const error = new RateLimitError('GET', '/api/test')

      expect(error.message).toBe('Rate limit exceeded')
    })

    it('sets name to RateLimitError', () => {
      const error = new RateLimitError('GET', '/api/test')

      expect(error.name).toBe('RateLimitError')
    })

    it('extends Error', () => {
      const error = new RateLimitError('GET', '/api/test')

      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('toUserMessage', () => {
    it('returns message with custom retry time', () => {
      const error = new RateLimitError('GET', '/docs/abc123/tables', 45)

      const message = error.toUserMessage()

      expect(message).toContain('Rate limit exceeded for GET /docs/abc123/tables')
      expect(message).toContain('Wait 45 seconds')
      expect(message).toContain('Add delays between requests')
      expect(message).toContain('Batch operations when possible')
      expect(message).toContain('Use pagination with smaller page sizes')
    })

    it('defaults to 60 seconds when retryAfter is undefined', () => {
      const error = new RateLimitError('POST', '/api/records')

      const message = error.toUserMessage()

      expect(message).toContain('Wait 60 seconds')
    })

    it('includes method and path in message', () => {
      const error = new RateLimitError('DELETE', '/docs/doc1/tables/Users/records/5')

      const message = error.toUserMessage()

      expect(message).toContain('DELETE /docs/doc1/tables/Users/records/5')
    })
  })

  describe('isRetryable', () => {
    it('always returns true', () => {
      const error = new RateLimitError('GET', '/api/test')

      expect(error.isRetryable()).toBe(true)
    })

    it('returns true regardless of retryAfter value', () => {
      const withRetry = new RateLimitError('GET', '/api/test', 120)
      const withoutRetry = new RateLimitError('GET', '/api/test')

      expect(withRetry.isRetryable()).toBe(true)
      expect(withoutRetry.isRetryable()).toBe(true)
    })
  })

  describe('getRetryDelay', () => {
    it('returns retryAfter converted to milliseconds', () => {
      const error = new RateLimitError('GET', '/api/test', 30)

      expect(error.getRetryDelay()).toBe(30000) // 30 * 1000
    })

    it('returns 60000ms when retryAfter is undefined', () => {
      const error = new RateLimitError('GET', '/api/test')

      expect(error.getRetryDelay()).toBe(60000) // 60 * 1000
    })

    it('handles zero retryAfter', () => {
      const error = new RateLimitError('GET', '/api/test', 0)

      expect(error.getRetryDelay()).toBe(0)
    })

    it('handles large retryAfter values', () => {
      const error = new RateLimitError('GET', '/api/test', 3600)

      expect(error.getRetryDelay()).toBe(3600000) // 1 hour in ms
    })
  })

  describe('inherited from ApiError', () => {
    it('has isClientError returning true for 429', () => {
      const error = new RateLimitError('GET', '/api/test')

      expect(error.isClientError()).toBe(true)
    })

    it('has isServerError returning false for 429', () => {
      const error = new RateLimitError('GET', '/api/test')

      expect(error.isServerError()).toBe(false)
    })

    it('has code set to API_ERROR_429', () => {
      const error = new RateLimitError('GET', '/api/test')

      expect(error.code).toBe('API_ERROR_429')
    })
  })

  describe('inherited from GristError', () => {
    it('has timestamp set', () => {
      const before = new Date()
      const error = new RateLimitError('GET', '/api/test')
      const after = new Date()

      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('has isOperational set to true', () => {
      const error = new RateLimitError('GET', '/api/test')

      expect(error.isOperational).toBe(true)
    })

    it('serializes to JSON', () => {
      const error = new RateLimitError('GET', '/api/test', 30)

      const json = error.toJSON()

      expect(json.name).toBe('RateLimitError')
      expect(json.code).toBe('API_ERROR_429')
      expect(json.message).toBe('Rate limit exceeded')
      expect(json.context).toHaveProperty('retryAfter', 30)
    })

    it('returns suggestions from ApiError', () => {
      const error = new RateLimitError('GET', '/api/test')

      const suggestions = error.getSuggestions()

      expect(suggestions).toContain('Wait 60 seconds before retrying')
      expect(suggestions).toContain('Reduce request frequency')
    })
  })
})
