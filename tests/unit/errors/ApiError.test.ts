/**
 * Unit tests for ApiError
 *
 * Tests:
 * - Constructor: Sets properties correctly
 * - toUserMessage(): Returns appropriate message for each status code
 * - isRetryable(): Returns true for retryable status codes
 * - getSuggestions(): Returns helpful suggestions per status
 * - isClientError/isServerError: Classifies errors correctly
 */

import { describe, expect, it } from 'vitest'
import type { HttpMethod } from '../../../src/errors/ApiError.js'
import { ApiError } from '../../../src/errors/ApiError.js'

describe('ApiError', () => {
  describe('constructor', () => {
    it('creates error with all parameters', () => {
      const error = new ApiError(404, 'GET', '/docs/abc123/tables', 'Not found', {
        baseUrl: 'https://grist.example.com'
      })

      expect(error.statusCode).toBe(404)
      expect(error.method).toBe('GET')
      expect(error.path).toBe('/docs/abc123/tables')
      expect(error.message).toBe('Not found')
      expect(error.context?.baseUrl).toBe('https://grist.example.com')
    })

    it('sets code to API_ERROR_{statusCode}', () => {
      const error = new ApiError(500, 'POST', '/api/test', 'Server error')

      expect(error.code).toBe('API_ERROR_500')
    })

    it('sets name to ApiError', () => {
      const error = new ApiError(400, 'GET', '/api/test', 'Bad request')

      expect(error.name).toBe('ApiError')
    })

    it('includes statusCode, method, path in context', () => {
      const error = new ApiError(403, 'DELETE', '/docs/xyz', 'Forbidden')

      expect(error.context?.statusCode).toBe(403)
      expect(error.context?.method).toBe('DELETE')
      expect(error.context?.path).toBe('/docs/xyz')
    })

    it('works without context', () => {
      const error = new ApiError(404, 'GET', '/api/test', 'Not found')

      expect(error.context?.statusCode).toBe(404)
    })
  })

  describe('toUserMessage', () => {
    describe('400 Bad Request', () => {
      it('returns malformed request message', () => {
        const error = new ApiError(400, 'POST', '/docs/abc/tables', 'Invalid JSON')

        const message = error.toUserMessage()

        expect(message).toContain('Bad request to POST /docs/abc/tables')
        expect(message).toContain('Invalid JSON')
        expect(message).toContain('check your input parameters')
      })
    })

    describe('401 Unauthorized', () => {
      it('returns authentication failed message', () => {
        const error = new ApiError(401, 'GET', '/api/test', 'Unauthorized')

        const message = error.toUserMessage()

        expect(message).toContain('Authentication failed')
        expect(message).toContain('GRIST_API_KEY')
        expect(message).toContain('Verify the API key')
      })

      it('includes baseUrl if provided', () => {
        const error = new ApiError(401, 'GET', '/api/test', 'Unauthorized', {
          baseUrl: 'https://grist.example.com'
        })

        const message = error.toUserMessage()

        expect(message).toContain('https://grist.example.com/settings/keys')
      })

      it('shows placeholder when no baseUrl', () => {
        const error = new ApiError(401, 'GET', '/api/test', 'Unauthorized')

        const message = error.toUserMessage()

        expect(message).toContain('your Grist instance/settings/keys')
      })
    })

    describe('403 Forbidden', () => {
      it('returns permission denied message', () => {
        const error = new ApiError(403, 'DELETE', '/docs/abc/tables/Table1', 'Forbidden')

        const message = error.toUserMessage()

        expect(message).toContain('Permission denied')
        expect(message).toContain('write permissions')
        expect(message).toContain('grist_get_documents')
      })
    })

    describe('404 Not Found', () => {
      it('returns resource not found message', () => {
        const error = new ApiError(404, 'GET', '/docs/invalid/tables', 'Not found')

        const message = error.toUserMessage()

        expect(message).toContain('Resource not found')
        expect(message).toContain('Invalid resource ID')
        expect(message).toContain('discovery tools')
      })
    })

    describe('429 Rate Limit', () => {
      it('returns rate limit message', () => {
        const error = new ApiError(429, 'POST', '/api/test', 'Too many requests')

        const message = error.toUserMessage()

        expect(message).toContain('Rate limit exceeded')
        expect(message).toContain('Wait 60 seconds')
        expect(message).toContain('batching operations')
      })
    })

    describe('5xx Server Errors', () => {
      const serverCodes = [500, 502, 503, 504]

      for (const code of serverCodes) {
        it(`returns server error message for ${code}`, () => {
          const error = new ApiError(code, 'GET', '/api/test', 'Server unavailable')

          const message = error.toUserMessage()

          expect(message).toContain(`Grist server error (${code})`)
          expect(message).toContain('temporary server issue')
          expect(message).toContain('Try again in a few moments')
        })
      }
    })

    describe('Other Status Codes', () => {
      it('returns generic message for unknown codes', () => {
        const error = new ApiError(418, 'GET', '/api/test', "I'm a teapot")

        const message = error.toUserMessage()

        expect(message).toContain('Request failed')
        expect(message).toContain('Status: 418')
        expect(message).toContain("I'm a teapot")
      })
    })
  })

  describe('isRetryable', () => {
    it('returns true for 429', () => {
      const error = new ApiError(429, 'GET', '/api/test', 'Rate limited')

      expect(error.isRetryable()).toBe(true)
    })

    it('returns true for 502', () => {
      const error = new ApiError(502, 'GET', '/api/test', 'Bad gateway')

      expect(error.isRetryable()).toBe(true)
    })

    it('returns true for 503', () => {
      const error = new ApiError(503, 'GET', '/api/test', 'Service unavailable')

      expect(error.isRetryable()).toBe(true)
    })

    it('returns true for 504', () => {
      const error = new ApiError(504, 'GET', '/api/test', 'Gateway timeout')

      expect(error.isRetryable()).toBe(true)
    })

    it('returns false for 400', () => {
      const error = new ApiError(400, 'GET', '/api/test', 'Bad request')

      expect(error.isRetryable()).toBe(false)
    })

    it('returns false for 401', () => {
      const error = new ApiError(401, 'GET', '/api/test', 'Unauthorized')

      expect(error.isRetryable()).toBe(false)
    })

    it('returns false for 403', () => {
      const error = new ApiError(403, 'GET', '/api/test', 'Forbidden')

      expect(error.isRetryable()).toBe(false)
    })

    it('returns false for 404', () => {
      const error = new ApiError(404, 'GET', '/api/test', 'Not found')

      expect(error.isRetryable()).toBe(false)
    })

    it('returns false for 500', () => {
      const error = new ApiError(500, 'GET', '/api/test', 'Internal error')

      expect(error.isRetryable()).toBe(false)
    })
  })

  describe('getSuggestions', () => {
    it('returns suggestions for 400', () => {
      const error = new ApiError(400, 'POST', '/docs/abc/records', 'Invalid')

      const suggestions = error.getSuggestions()

      expect(suggestions).toContain('Check parameter format matches the schema')
      expect(suggestions).toContain('Call grist_help for parameter documentation')
      expect(suggestions).toContain('Verify record data matches column types')
    })

    it('returns suggestions for 400 without records path', () => {
      const error = new ApiError(400, 'POST', '/docs/abc/tables', 'Invalid')

      const suggestions = error.getSuggestions()

      expect(suggestions).toContain('Check parameter format matches the schema')
      expect(suggestions).not.toContain('Verify record data matches column types')
    })

    it('returns suggestions for 401', () => {
      const error = new ApiError(401, 'GET', '/api/test', 'Unauthorized')

      const suggestions = error.getSuggestions()

      expect(suggestions).toContain('Verify GRIST_API_KEY environment variable is set')
      expect(suggestions).toContain('Check if API key has expired')
    })

    it('returns suggestions for 403', () => {
      const error = new ApiError(403, 'DELETE', '/api/test', 'Forbidden')

      const suggestions = error.getSuggestions()

      expect(suggestions).toContain('Use grist_get_documents to verify access to the document')
      expect(suggestions).toContain('Request editor or owner access from the document owner')
    })

    it('returns suggestions for 403 GET (no write message)', () => {
      const error = new ApiError(403, 'GET', '/api/test', 'Forbidden')

      const suggestions = error.getSuggestions()

      expect(suggestions).not.toContain('Request editor or owner access')
    })

    it('returns suggestions for 404 with docs path', () => {
      const error = new ApiError(404, 'GET', '/docs/abc123', 'Not found')

      const suggestions = error.getSuggestions()

      expect(suggestions).toContain('Use grist_get_documents to find valid document IDs')
    })

    it('returns suggestions for 404 with tables path', () => {
      const error = new ApiError(404, 'GET', '/docs/abc/tables/Invalid', 'Not found')

      const suggestions = error.getSuggestions()

      expect(suggestions).toContain('Use grist_get_tables to list available tables')
    })

    it('returns suggestions for 404 with records path', () => {
      const error = new ApiError(404, 'GET', '/docs/abc/tables/T1/records/999', 'Not found')

      const suggestions = error.getSuggestions()

      expect(suggestions).toContain('Use grist_get_records to verify row IDs exist')
    })

    it('returns suggestions for 429', () => {
      const error = new ApiError(429, 'POST', '/api/test', 'Rate limited')

      const suggestions = error.getSuggestions()

      expect(suggestions).toContain('Wait 60 seconds before retrying')
      expect(suggestions).toContain('Use grist_upsert_records to batch multiple operations')
    })

    it('returns suggestions for 5xx', () => {
      const error = new ApiError(503, 'GET', '/api/test', 'Service unavailable')

      const suggestions = error.getSuggestions()

      expect(suggestions).toContain('Retry the request in a few seconds')
      expect(suggestions).toContain('If persistent, check Grist server status')
    })

    it('returns generic suggestions for unknown codes', () => {
      const error = new ApiError(418, 'GET', '/api/test', 'Teapot')

      const suggestions = error.getSuggestions()

      expect(suggestions).toContain('Review error message for details')
      expect(suggestions).toContain('Call grist_help for operation documentation')
    })
  })

  describe('isClientError', () => {
    it('returns true for 4xx codes', () => {
      expect(new ApiError(400, 'GET', '/', 'e').isClientError()).toBe(true)
      expect(new ApiError(401, 'GET', '/', 'e').isClientError()).toBe(true)
      expect(new ApiError(403, 'GET', '/', 'e').isClientError()).toBe(true)
      expect(new ApiError(404, 'GET', '/', 'e').isClientError()).toBe(true)
      expect(new ApiError(429, 'GET', '/', 'e').isClientError()).toBe(true)
      expect(new ApiError(499, 'GET', '/', 'e').isClientError()).toBe(true)
    })

    it('returns false for 5xx codes', () => {
      expect(new ApiError(500, 'GET', '/', 'e').isClientError()).toBe(false)
      expect(new ApiError(503, 'GET', '/', 'e').isClientError()).toBe(false)
    })

    it('returns false for 2xx codes', () => {
      expect(new ApiError(200, 'GET', '/', 'e').isClientError()).toBe(false)
    })
  })

  describe('isServerError', () => {
    it('returns true for 5xx codes', () => {
      expect(new ApiError(500, 'GET', '/', 'e').isServerError()).toBe(true)
      expect(new ApiError(502, 'GET', '/', 'e').isServerError()).toBe(true)
      expect(new ApiError(503, 'GET', '/', 'e').isServerError()).toBe(true)
      expect(new ApiError(504, 'GET', '/', 'e').isServerError()).toBe(true)
      expect(new ApiError(599, 'GET', '/', 'e').isServerError()).toBe(true)
    })

    it('returns false for 4xx codes', () => {
      expect(new ApiError(400, 'GET', '/', 'e').isServerError()).toBe(false)
      expect(new ApiError(404, 'GET', '/', 'e').isServerError()).toBe(false)
    })

    it('returns false for 2xx codes', () => {
      expect(new ApiError(200, 'GET', '/', 'e').isServerError()).toBe(false)
    })
  })

  describe('HTTP methods', () => {
    const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

    for (const method of methods) {
      it(`accepts ${method} method`, () => {
        const error = new ApiError(200, method, '/api/test', 'OK')

        expect(error.method).toBe(method)
      })
    }
  })
})
