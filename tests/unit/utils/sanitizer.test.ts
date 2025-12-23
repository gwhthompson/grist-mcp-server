import { describe, expect, it } from 'vitest'
import { sanitizeMessage } from '../../../src/utils/sanitizer.js'

describe('sanitizeMessage', () => {
  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeMessage('')).toBe('')
    })

    it('returns undefined for undefined input', () => {
      expect(sanitizeMessage(undefined as unknown as string)).toBeUndefined()
    })

    it('returns null for null input', () => {
      expect(sanitizeMessage(null as unknown as string)).toBeNull()
    })

    it('returns message unchanged if no sensitive data', () => {
      const message = 'Normal log message without sensitive data'
      expect(sanitizeMessage(message)).toBe(message)
    })
  })

  describe('Bearer token sanitization', () => {
    it('redacts Bearer tokens', () => {
      const message = 'Token: Bearer abc123def456ghi789jkl012mno'
      expect(sanitizeMessage(message)).toContain('Bearer ***')
      expect(sanitizeMessage(message)).not.toContain('abc123')
    })

    it('handles multiple Bearer tokens', () => {
      const message =
        'Token1: Bearer abc123def456ghi789jkl012mno, Token2: Bearer xyz789abc456def123ghi012mno'
      const result = sanitizeMessage(message)
      expect(result.match(/Bearer \*\*\*/g)?.length).toBe(2)
    })
  })

  describe('API key sanitization', () => {
    it('redacts api_key values', () => {
      const message = 'api_key=test_abc123def456ghi789jkl012mno345'
      expect(sanitizeMessage(message)).toContain('api_key=***')
      expect(sanitizeMessage(message)).not.toContain('test_abc')
    })

    it('redacts api-key values', () => {
      const message = 'api-key: test_abc123def456ghi789jkl012mno345'
      expect(sanitizeMessage(message)).toContain('api_key=***')
    })
  })

  describe('token sanitization', () => {
    it('redacts token values', () => {
      const message = 'token=abc123def456ghi789jkl012mno345678'
      expect(sanitizeMessage(message)).toContain('token=***')
      expect(sanitizeMessage(message)).not.toContain('abc123')
    })
  })

  describe('email sanitization', () => {
    it('preserves email domain but redacts username', () => {
      const message = 'User email: john.doe@example.com'
      const result = sanitizeMessage(message)
      expect(result).toContain('@example.com')
      expect(result).not.toContain('john.doe')
      expect(result).toContain('***@example.com')
    })
  })

  describe('password sanitization', () => {
    it('redacts password in key=value format', () => {
      const message = 'password=mysecretpass123'
      expect(sanitizeMessage(message)).toContain('password=***')
      expect(sanitizeMessage(message)).not.toContain('mysecretpass')
    })

    it('redacts password in JSON format', () => {
      const message = '{"username":"user","password":"secret123"}'
      const result = sanitizeMessage(message)
      expect(result).toContain('"password":"***"')
      expect(result).not.toContain('secret123')
    })
  })

  describe('Authorization header sanitization', () => {
    it('redacts Authorization header values', () => {
      const message = 'Headers: Authorization: Basic dXNlcjpwYXNz'
      expect(sanitizeMessage(message)).toContain('Authorization: ***')
      expect(sanitizeMessage(message)).not.toContain('Basic')
    })
  })

  describe('URL query parameter sanitization', () => {
    it('redacts api_key in query string', () => {
      const message = 'GET /docs?api_key=abc123def456ghi789jkl012'
      const result = sanitizeMessage(message)
      expect(result).toContain('?api_key=***')
      expect(result).not.toContain('abc123')
    })

    it('redacts token in query string', () => {
      const message = 'GET /docs?token=xyz789abc456def123ghi012'
      const result = sanitizeMessage(message)
      expect(result).not.toContain('xyz789')
    })
  })

  describe('path sanitization', () => {
    it('redacts Unix home directory paths', () => {
      const message = 'Error in /Users/johndoe/projects/app'
      const result = sanitizeMessage(message)
      expect(result).toContain('/Users/***')
      expect(result).not.toContain('johndoe')
    })

    it('redacts Linux home directory paths', () => {
      const message = 'Error in /home/johndoe/projects/app'
      const result = sanitizeMessage(message)
      expect(result).toContain('/home/***')
      expect(result).not.toContain('johndoe')
    })

    it('redacts Windows user paths', () => {
      const message = 'Error in C:\\Users\\johndoe\\Documents'
      const result = sanitizeMessage(message)
      expect(result).toContain('C:\\Users\\***')
      expect(result).not.toContain('johndoe')
    })
  })

  describe('docId sanitization', () => {
    it('redacts docId values', () => {
      const message = 'docId="abc123def456ghi789jkl"'
      const result = sanitizeMessage(message)
      expect(result).toContain('docId=***')
      expect(result).not.toContain('abc123def456')
    })
  })

  describe('long token sanitization', () => {
    it('redacts long alphanumeric strings (40+ chars)', () => {
      const longToken = 'a'.repeat(50)
      const message = `Token: ${longToken}`
      const result = sanitizeMessage(message)
      expect(result).toContain('***')
      expect(result).not.toContain(longToken)
    })
  })

  describe('x-boot-key sanitization', () => {
    it('redacts x-boot-key header', () => {
      const message = 'x-boot-key: some-secret-boot-key-value'
      const result = sanitizeMessage(message)
      expect(result).toContain('x-boot-key: ***')
      expect(result).not.toContain('some-secret')
    })
  })
})
