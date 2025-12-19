/**
 * Unit Tests for Apply Response Validators
 *
 * Tests validation of Grist API ApplyResponse objects,
 * ensuring retValues arrays are present, valid, and error-free.
 */

import { describe, expect, it } from 'vitest'
import type { ApplyResponse } from '../../../src/types.js'
import {
  ApplyResponseValidationError,
  extractFirstRetValue,
  validateRetValues
} from '../../../src/validators/apply-response.js'

// =============================================================================
// ApplyResponseValidationError
// =============================================================================

describe('ApplyResponseValidationError', () => {
  it('creates error with message', () => {
    const error = new ApplyResponseValidationError('Invalid response')
    expect(error.message).toBe('Invalid response')
    expect(error.name).toBe('ApplyResponseValidationError')
    expect(error.context).toBeUndefined()
  })

  it('creates error with context', () => {
    const error = new ApplyResponseValidationError('Invalid response', 'adding records')
    expect(error.message).toBe('Invalid response')
    expect(error.context).toBe('adding records')
  })

  it('is an instance of Error', () => {
    const error = new ApplyResponseValidationError('Test error')
    expect(error).toBeInstanceOf(Error)
  })
})

// =============================================================================
// validateRetValues - Success Cases
// =============================================================================

describe('validateRetValues - Success Cases', () => {
  it('accepts response with single retValue', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [42],
      isModification: true
    }

    const result = validateRetValues(response)
    expect(result).toEqual([42])
  })

  it('accepts response with multiple retValues', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [1, 2, 3],
      isModification: true
    }

    const result = validateRetValues(response)
    expect(result).toEqual([1, 2, 3])
  })

  it('accepts retValue with array', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [[1, 2, 3]],
      isModification: true
    }

    const result = validateRetValues(response)
    expect(result).toEqual([[1, 2, 3]])
  })

  it('accepts retValue with null', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [null],
      isModification: true
    }

    const result = validateRetValues(response)
    expect(result).toEqual([null])
  })

  it('accepts retValue with string', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: ['success'],
      isModification: true
    }

    const result = validateRetValues(response)
    expect(result).toEqual(['success'])
  })

  it('accepts retValue with object (non-error)', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [{ id: 1, name: 'test' }],
      isModification: true
    }

    const result = validateRetValues(response)
    expect(result).toEqual([{ id: 1, name: 'test' }])
  })
})

// =============================================================================
// validateRetValues - Missing/Empty retValues
// =============================================================================

describe('validateRetValues - Missing/Empty retValues', () => {
  it('throws for missing retValues', () => {
    const response = {
      actionNum: 1,
      actionHash: 'abc123',
      isModification: true
    } as ApplyResponse

    expect(() => validateRetValues(response)).toThrow(ApplyResponseValidationError)
    expect(() => validateRetValues(response)).toThrow('missing retValues array')
  })

  it('throws for null retValues', () => {
    const response = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: null,
      isModification: true
    } as unknown as ApplyResponse

    expect(() => validateRetValues(response)).toThrow(ApplyResponseValidationError)
    expect(() => validateRetValues(response)).toThrow('missing retValues array')
  })

  it('throws for empty retValues array', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [],
      isModification: true
    }

    expect(() => validateRetValues(response)).toThrow(ApplyResponseValidationError)
    expect(() => validateRetValues(response)).toThrow('missing retValues array')
  })

  it('throws for non-array retValues', () => {
    const response = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: 'not an array',
      isModification: true
    } as unknown as ApplyResponse

    expect(() => validateRetValues(response)).toThrow(ApplyResponseValidationError)
  })
})

// =============================================================================
// validateRetValues - Error Objects in retValues
// =============================================================================

describe('validateRetValues - Error Objects', () => {
  it('throws for error object in first position', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [{ error: 'Something went wrong' }],
      isModification: true
    }

    expect(() => validateRetValues(response)).toThrow(ApplyResponseValidationError)
    expect(() => validateRetValues(response)).toThrow('action 1 failed')
    expect(() => validateRetValues(response)).toThrow('Something went wrong')
  })

  it('throws for error object in second position', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [42, { error: 'Failed operation' }],
      isModification: true
    }

    expect(() => validateRetValues(response)).toThrow(ApplyResponseValidationError)
    expect(() => validateRetValues(response)).toThrow('action 2 failed')
    expect(() => validateRetValues(response)).toThrow('Failed operation')
  })

  it('throws for error object in third position', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [1, 2, { error: 'Third action failed' }],
      isModification: true
    }

    expect(() => validateRetValues(response)).toThrow(ApplyResponseValidationError)
    expect(() => validateRetValues(response)).toThrow('action 3 failed')
  })

  it('does not throw for object without error property', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [{ success: true, data: 'value' }],
      isModification: true
    }

    expect(() => validateRetValues(response)).not.toThrow()
  })

  it('ignores error property in arrays', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [[1, 2, 3]],
      isModification: true
    }

    expect(() => validateRetValues(response)).not.toThrow()
  })

  it('ignores error in nested objects', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [{ nested: { error: 'nested error' } }],
      isModification: true
    }

    // Only top-level error properties are checked
    expect(() => validateRetValues(response)).not.toThrow()
  })
})

// =============================================================================
// validateRetValues - Expected Count Validation
// =============================================================================

describe('validateRetValues - Expected Count', () => {
  it('validates correct count', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [1, 2, 3],
      isModification: true
    }

    expect(() => validateRetValues(response, { expectedCount: 3 })).not.toThrow()
  })

  it('throws when count is less than expected', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [1, 2],
      isModification: true
    }

    expect(() => validateRetValues(response, { expectedCount: 3 })).toThrow(
      ApplyResponseValidationError
    )
    expect(() => validateRetValues(response, { expectedCount: 3 })).toThrow(
      'returned 2 retValues but expected 3'
    )
  })

  it('throws when count is more than expected', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [1, 2, 3, 4],
      isModification: true
    }

    expect(() => validateRetValues(response, { expectedCount: 2 })).toThrow(
      ApplyResponseValidationError
    )
    expect(() => validateRetValues(response, { expectedCount: 2 })).toThrow(
      'returned 4 retValues but expected 2'
    )
  })

  it('validates expectedCount of 1', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [42],
      isModification: true
    }

    expect(() => validateRetValues(response, { expectedCount: 1 })).not.toThrow()
  })

  it('allows any count when expectedCount not specified', () => {
    const response1: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [1],
      isModification: true
    }

    const response5: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [1, 2, 3, 4, 5],
      isModification: true
    }

    expect(() => validateRetValues(response1)).not.toThrow()
    expect(() => validateRetValues(response5)).not.toThrow()
  })
})

// =============================================================================
// validateRetValues - Context Parameter
// =============================================================================

describe('validateRetValues - Context', () => {
  it('includes context in error for missing retValues', () => {
    const response = {
      actionNum: 1,
      actionHash: 'abc123',
      isModification: true
    } as ApplyResponse

    expect(() => validateRetValues(response, { context: 'adding table' })).toThrow(
      'Context: adding table'
    )
  })

  it('includes context in error for error object', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [{ error: 'Failed' }],
      isModification: true
    }

    expect(() => validateRetValues(response, { context: 'bulk update' })).toThrow(
      'Context: bulk update'
    )
  })

  it('includes context in error for count mismatch', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [1, 2],
      isModification: true
    }

    expect(() =>
      validateRetValues(response, { expectedCount: 3, context: 'creating records' })
    ).toThrow('Context: creating records')
  })

  it('does not include context when not provided', () => {
    const response = {
      actionNum: 1,
      actionHash: 'abc123',
      isModification: true
    } as ApplyResponse

    try {
      validateRetValues(response)
    } catch (error) {
      expect((error as Error).message).not.toContain('Context:')
    }
  })

  it('stores context in error object', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [{ error: 'Test' }],
      isModification: true
    }

    try {
      validateRetValues(response, { context: 'test operation' })
    } catch (error) {
      expect((error as ApplyResponseValidationError).context).toBe('test operation')
    }
  })
})

// =============================================================================
// validateRetValues - Combined Options
// =============================================================================

describe('validateRetValues - Combined Options', () => {
  it('validates with both expectedCount and context', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [1, 2, 3],
      isModification: true
    }

    expect(() => validateRetValues(response, { expectedCount: 3, context: 'test' })).not.toThrow()
  })

  it('throws with both expectedCount and context on failure', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [1, 2],
      isModification: true
    }

    expect(() => validateRetValues(response, { expectedCount: 3, context: 'test' })).toThrow(
      'returned 2 retValues but expected 3. Context: test'
    )
  })
})

// =============================================================================
// extractFirstRetValue
// =============================================================================

describe('extractFirstRetValue', () => {
  it('extracts first retValue', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [42, 43, 44],
      isModification: true
    }

    const result = extractFirstRetValue<number>(response)
    expect(result).toBe(42)
  })

  it('extracts array retValue', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [[1, 2, 3]],
      isModification: true
    }

    const result = extractFirstRetValue<number[]>(response)
    expect(result).toEqual([1, 2, 3])
  })

  it('extracts object retValue', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [{ id: 1, name: 'test' }],
      isModification: true
    }

    const result = extractFirstRetValue<{ id: number; name: string }>(response)
    expect(result).toEqual({ id: 1, name: 'test' })
  })

  it('extracts null retValue', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [null],
      isModification: true
    }

    const result = extractFirstRetValue(response)
    expect(result).toBeNull()
  })

  it('throws for missing retValues', () => {
    const response = {
      actionNum: 1,
      actionHash: 'abc123',
      isModification: true
    } as ApplyResponse

    expect(() => extractFirstRetValue(response)).toThrow(ApplyResponseValidationError)
  })

  it('throws for error in retValues', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [{ error: 'Failed' }],
      isModification: true
    }

    expect(() => extractFirstRetValue(response)).toThrow(ApplyResponseValidationError)
  })

  it('includes context in error message', () => {
    const response = {
      actionNum: 1,
      actionHash: 'abc123',
      isModification: true
    } as ApplyResponse

    expect(() => extractFirstRetValue(response, 'delete operation')).toThrow(
      'Context: delete operation'
    )
  })

  it('passes context to validateRetValues', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [{ error: 'Test error' }],
      isModification: true
    }

    try {
      extractFirstRetValue(response, 'my context')
    } catch (error) {
      expect((error as ApplyResponseValidationError).context).toBe('my context')
      expect((error as Error).message).toContain('Context: my context')
    }
  })

  it('returns first element even when multiple retValues exist', () => {
    const response: ApplyResponse = {
      actionNum: 1,
      actionHash: 'abc123',
      retValues: [1, 2, 3, 4, 5],
      isModification: true
    }

    const result = extractFirstRetValue<number>(response)
    expect(result).toBe(1)
  })
})
