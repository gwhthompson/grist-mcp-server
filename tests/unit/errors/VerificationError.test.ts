/**
 * Unit tests for VerificationError
 *
 * Tests:
 * - VerificationError class: All methods and properties
 * - isVerificationError: Type guard function
 * - createPassingResult: Helper function
 * - createFailingResult: Helper function
 */

import { describe, expect, it } from 'vitest'
import type {
  VerificationCheck,
  VerificationResult
} from '../../../src/errors/VerificationError.js'
import {
  createFailingResult,
  createPassingResult,
  isVerificationError,
  VerificationError
} from '../../../src/errors/VerificationError.js'

describe('VerificationError', () => {
  const failedCheck: VerificationCheck = {
    description: 'Name field update',
    passed: false,
    expected: 'John',
    actual: 'Jane',
    field: 'Name'
  }

  const passingCheck: VerificationCheck = {
    description: 'Email field update',
    passed: true,
    expected: 'john@example.com',
    actual: 'john@example.com',
    field: 'Email'
  }

  const failingResult: VerificationResult = {
    passed: false,
    checks: [failedCheck, passingCheck],
    duration: 150
  }

  describe('constructor', () => {
    it('creates error with failing result', () => {
      const error = new VerificationError(failingResult)

      expect(error.result).toBe(failingResult)
      expect(error.message).toBe('Verification failed: 1 check(s) failed')
      expect(error.code).toBe('VERIFICATION_FAILED')
    })

    it('creates error with context', () => {
      const error = new VerificationError(failingResult, {
        operation: 'update',
        entityType: 'record',
        entityId: 5
      })

      expect(error.operation).toBe('update')
      expect(error.entityType).toBe('record')
      expect(error.entityId).toBe(5)
    })

    it('uses error message from result if provided', () => {
      const resultWithError: VerificationResult = {
        passed: false,
        checks: [],
        error: 'Custom verification error message'
      }

      const error = new VerificationError(resultWithError)

      expect(error.message).toBe('Custom verification error message')
    })

    it('counts multiple failed checks correctly', () => {
      const multipleFailures: VerificationResult = {
        passed: false,
        checks: [
          { description: 'Check 1', passed: false },
          { description: 'Check 2', passed: false },
          { description: 'Check 3', passed: false }
        ]
      }

      const error = new VerificationError(multipleFailures)

      expect(error.message).toBe('Verification failed: 3 check(s) failed')
    })

    it('sets name to VerificationError', () => {
      const error = new VerificationError(failingResult)

      expect(error.name).toBe('VerificationError')
    })

    it('extends Error', () => {
      const error = new VerificationError(failingResult)

      expect(error).toBeInstanceOf(Error)
    })

    it('includes context in parent context', () => {
      const error = new VerificationError(failingResult, {
        operation: 'insert',
        entityType: 'row'
      })

      expect(error.context?.result).toBe(failingResult)
      expect(error.context?.operation).toBe('insert')
      expect(error.context?.entityType).toBe('row')
    })
  })

  describe('toUserMessage', () => {
    it('returns formatted message with failed check details', () => {
      const error = new VerificationError(failingResult)

      const message = error.toUserMessage()

      expect(message).toContain('Write operation succeeded but verification failed')
      expect(message).toContain('Name field update')
      expect(message).toContain('expected "John"')
      expect(message).toContain('got "Jane"')
    })

    it('returns result.error when no failed checks', () => {
      const resultWithError: VerificationResult = {
        passed: false,
        checks: [{ description: 'Check', passed: true }],
        error: 'Verification timed out'
      }

      const error = new VerificationError(resultWithError)

      expect(error.toUserMessage()).toBe('Verification timed out')
    })

    it('limits output to 3 failed checks', () => {
      const manyFailures: VerificationResult = {
        passed: false,
        checks: [
          { description: 'Check 1', passed: false },
          { description: 'Check 2', passed: false },
          { description: 'Check 3', passed: false },
          { description: 'Check 4', passed: false },
          { description: 'Check 5', passed: false }
        ]
      }

      const error = new VerificationError(manyFailures)
      const message = error.toUserMessage()

      expect(message).toContain('Check 1')
      expect(message).toContain('Check 2')
      expect(message).toContain('Check 3')
      expect(message).not.toContain('Check 4')
      expect(message).not.toContain('Check 5')
      expect(message).toContain('... and 2 more')
    })

    it('handles checks without expected/actual values', () => {
      const simpleFailure: VerificationResult = {
        passed: false,
        checks: [{ description: 'Row was not created', passed: false }]
      }

      const error = new VerificationError(simpleFailure)
      const message = error.toUserMessage()

      expect(message).toContain('Row was not created')
      expect(message).not.toContain('expected')
      expect(message).not.toContain('got')
    })
  })

  describe('isRetryable', () => {
    it('returns false', () => {
      const error = new VerificationError(failingResult)

      expect(error.isRetryable()).toBe(false)
    })
  })

  describe('getSuggestions', () => {
    it('returns array of suggestions', () => {
      const error = new VerificationError(failingResult)

      const suggestions = error.getSuggestions()

      expect(suggestions).toHaveLength(4)
      expect(suggestions).toContain('Check if ACL rules are blocking the write')
      expect(suggestions).toContain('Verify the column is not a formula column')
      expect(suggestions).toContain('Check if another user/process modified the data')
      expect(suggestions).toContain('Retry the operation to rule out transient issues')
    })
  })

  describe('getFailedChecks', () => {
    it('returns only failed checks', () => {
      const error = new VerificationError(failingResult)

      const failed = error.getFailedChecks()

      expect(failed).toHaveLength(1)
      expect(failed[0].description).toBe('Name field update')
    })

    it('returns empty array when all checks pass', () => {
      const allPassing: VerificationResult = {
        passed: false, // Contradictory but possible
        checks: [passingCheck]
      }

      const error = new VerificationError(allPassing)

      expect(error.getFailedChecks()).toHaveLength(0)
    })

    it('returns all failed checks from multiple failures', () => {
      const multipleFailures: VerificationResult = {
        passed: false,
        checks: [
          { description: 'Check 1', passed: false },
          { description: 'Check 2', passed: true },
          { description: 'Check 3', passed: false }
        ]
      }

      const error = new VerificationError(multipleFailures)

      expect(error.getFailedChecks()).toHaveLength(2)
    })
  })

  describe('hasFieldFailure', () => {
    it('returns true for field that failed', () => {
      const error = new VerificationError(failingResult)

      expect(error.hasFieldFailure('Name')).toBe(true)
    })

    it('returns false for field that passed', () => {
      const error = new VerificationError(failingResult)

      expect(error.hasFieldFailure('Email')).toBe(false)
    })

    it('returns false for unknown field', () => {
      const error = new VerificationError(failingResult)

      expect(error.hasFieldFailure('UnknownField')).toBe(false)
    })

    it('returns false for checks without field property', () => {
      const noField: VerificationResult = {
        passed: false,
        checks: [{ description: 'Row count check', passed: false }]
      }

      const error = new VerificationError(noField)

      expect(error.hasFieldFailure('Name')).toBe(false)
    })
  })

  describe('inherited from GristError', () => {
    it('has timestamp set', () => {
      const before = new Date()
      const error = new VerificationError(failingResult)
      const after = new Date()

      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('has isOperational set to true', () => {
      const error = new VerificationError(failingResult)

      expect(error.isOperational).toBe(true)
    })

    it('serializes to JSON', () => {
      const error = new VerificationError(failingResult, {
        operation: 'update',
        entityId: 10
      })

      const json = error.toJSON()

      expect(json.name).toBe('VerificationError')
      expect(json.code).toBe('VERIFICATION_FAILED')
      expect(json.context).toHaveProperty('result')
      expect(json.context).toHaveProperty('operation', 'update')
    })
  })
})

describe('isVerificationError', () => {
  it('returns true for VerificationError instance', () => {
    const error = new VerificationError({
      passed: false,
      checks: []
    })

    expect(isVerificationError(error)).toBe(true)
  })

  it('returns false for regular Error', () => {
    const error = new Error('Some error')

    expect(isVerificationError(error)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isVerificationError(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isVerificationError(undefined)).toBe(false)
  })

  it('returns false for plain object', () => {
    expect(isVerificationError({ name: 'VerificationError' })).toBe(false)
  })

  it('returns false for string', () => {
    expect(isVerificationError('VerificationError')).toBe(false)
  })
})

describe('createPassingResult', () => {
  it('creates result with passed true', () => {
    const checks: VerificationCheck[] = [
      { description: 'Check 1', passed: true },
      { description: 'Check 2', passed: true }
    ]

    const result = createPassingResult(checks)

    expect(result.passed).toBe(true)
    expect(result.checks).toBe(checks)
    expect(result.error).toBeUndefined()
  })

  it('creates result with duration', () => {
    const result = createPassingResult([], 100)

    expect(result.duration).toBe(100)
  })

  it('creates result without duration', () => {
    const result = createPassingResult([])

    expect(result.duration).toBeUndefined()
  })

  it('creates result with empty checks array', () => {
    const result = createPassingResult([])

    expect(result.checks).toEqual([])
  })
})

describe('createFailingResult', () => {
  it('creates result with passed false', () => {
    const checks: VerificationCheck[] = [{ description: 'Check 1', passed: false }]

    const result = createFailingResult(checks)

    expect(result.passed).toBe(false)
    expect(result.checks).toBe(checks)
  })

  it('creates result with error message', () => {
    const result = createFailingResult([], 'Verification timed out')

    expect(result.error).toBe('Verification timed out')
  })

  it('creates result with duration', () => {
    const result = createFailingResult([], 'Error', 250)

    expect(result.duration).toBe(250)
  })

  it('creates result without optional parameters', () => {
    const result = createFailingResult([])

    expect(result.error).toBeUndefined()
    expect(result.duration).toBeUndefined()
  })

  it('creates result with all parameters', () => {
    const checks: VerificationCheck[] = [
      { description: 'Failed check', passed: false, field: 'Name', expected: 'A', actual: 'B' }
    ]

    const result = createFailingResult(checks, 'Multiple fields failed', 500)

    expect(result.passed).toBe(false)
    expect(result.checks).toBe(checks)
    expect(result.error).toBe('Multiple fields failed')
    expect(result.duration).toBe(500)
  })
})
