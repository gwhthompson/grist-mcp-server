/**
 * Unit tests for GristError base class
 *
 * Tests:
 * - Constructor: Sets properties correctly
 * - Abstract methods: Verified through concrete implementation
 * - toJSON: Serializes to JSON correctly
 * - isGristError: Type guard function
 */

import { describe, expect, it } from 'vitest'
import { GristError, isGristError } from '../../../src/errors/GristError.js'

// Concrete implementation for testing
class TestGristError extends GristError {
  toUserMessage(): string {
    return `User message: ${this.message}`
  }

  isRetryable(): boolean {
    return this.code.includes('RETRY')
  }

  getSuggestions(): string[] {
    return ['Test suggestion']
  }
}

describe('GristError', () => {
  describe('constructor', () => {
    it('sets message from parameter', () => {
      const error = new TestGristError('Test error message', 'TEST_CODE')

      expect(error.message).toBe('Test error message')
    })

    it('sets code from parameter', () => {
      const error = new TestGristError('Test', 'MY_ERROR_CODE')

      expect(error.code).toBe('MY_ERROR_CODE')
    })

    it('sets name to class name', () => {
      const error = new TestGristError('Test', 'CODE')

      expect(error.name).toBe('TestGristError')
    })

    it('sets isOperational to true', () => {
      const error = new TestGristError('Test', 'CODE')

      expect(error.isOperational).toBe(true)
    })

    it('sets timestamp to current time', () => {
      const before = new Date()
      const error = new TestGristError('Test', 'CODE')
      const after = new Date()

      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('sets context from parameter', () => {
      const context = { docId: 'abc123', tableId: 'Users' }
      const error = new TestGristError('Test', 'CODE', context)

      expect(error.context).toEqual(context)
    })

    it('handles undefined context', () => {
      const error = new TestGristError('Test', 'CODE')

      expect(error.context).toBeUndefined()
    })

    it('extends Error', () => {
      const error = new TestGristError('Test', 'CODE')

      expect(error).toBeInstanceOf(Error)
    })

    it('has stack trace', () => {
      const error = new TestGristError('Test', 'CODE')

      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('TestGristError')
    })
  })

  describe('toJSON', () => {
    it('serializes basic properties', () => {
      const error = new TestGristError('Test message', 'TEST_CODE')

      const json = error.toJSON()

      expect(json.name).toBe('TestGristError')
      expect(json.code).toBe('TEST_CODE')
      expect(json.message).toBe('Test message')
      expect(json.isOperational).toBe(true)
    })

    it('includes context when present', () => {
      const error = new TestGristError('Test', 'CODE', { foo: 'bar', num: 42 })

      const json = error.toJSON()

      expect(json.context).toEqual({ foo: 'bar', num: 42 })
    })

    it('serializes timestamp as ISO string', () => {
      const error = new TestGristError('Test', 'CODE')

      const json = error.toJSON()

      expect(typeof json.timestamp).toBe('string')
      expect(new Date(json.timestamp as string).toISOString()).toBe(json.timestamp)
    })

    it('returns JSON-serializable object', () => {
      const error = new TestGristError('Test', 'CODE', { nested: { value: true } })

      // Should not throw
      const jsonStr = JSON.stringify(error.toJSON())
      const parsed = JSON.parse(jsonStr)

      expect(parsed.name).toBe('TestGristError')
    })
  })

  describe('getSuggestions', () => {
    it('returns suggestions from subclass', () => {
      const error = new TestGristError('Test', 'CODE')

      expect(error.getSuggestions()).toEqual(['Test suggestion'])
    })
  })

  describe('abstract methods through subclass', () => {
    it('calls toUserMessage from subclass', () => {
      const error = new TestGristError('Hello', 'CODE')

      expect(error.toUserMessage()).toBe('User message: Hello')
    })

    it('calls isRetryable from subclass', () => {
      const retryable = new TestGristError('Test', 'CAN_RETRY_THIS')
      const notRetryable = new TestGristError('Test', 'NO_CAN_DO')

      expect(retryable.isRetryable()).toBe(true)
      expect(notRetryable.isRetryable()).toBe(false)
    })
  })
})

describe('isGristError', () => {
  it('returns true for GristError subclass', () => {
    const error = new TestGristError('Test', 'CODE')

    expect(isGristError(error)).toBe(true)
  })

  it('returns false for regular Error', () => {
    const error = new Error('Test')

    expect(isGristError(error)).toBe(false)
  })

  it('returns false for TypeError', () => {
    const error = new TypeError('Test')

    expect(isGristError(error)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isGristError(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isGristError(undefined)).toBe(false)
  })

  it('returns false for plain object with similar shape', () => {
    const obj = {
      name: 'GristError',
      code: 'TEST',
      message: 'Test',
      isOperational: true,
      timestamp: new Date(),
      toUserMessage: () => 'User message',
      isRetryable: () => false,
      getSuggestions: () => [],
      toJSON: () => ({})
    }

    expect(isGristError(obj)).toBe(false)
  })

  it('returns false for string', () => {
    expect(isGristError('GristError')).toBe(false)
  })

  it('returns false for number', () => {
    expect(isGristError(500)).toBe(false)
  })

  it('returns false for empty object', () => {
    expect(isGristError({})).toBe(false)
  })

  it('returns false for array', () => {
    expect(isGristError([])).toBe(false)
  })
})
