/**
 * Unit tests for ValidationError
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ValidationError } from '../../../src/errors/ValidationError.js'

describe('ValidationError', () => {
  describe('constructor', () => {
    it('creates error with field, value, and constraint', () => {
      const error = new ValidationError('docId', 'invalid', 'must be 22 characters')

      expect(error.field).toBe('docId')
      expect(error.value).toBe('invalid')
      expect(error.constraint).toBe('must be 22 characters')
      expect(error.message).toBe('Validation failed for docId: must be 22 characters')
      expect(error.code).toBe('VALIDATION_ERROR')
    })

    it('includes context with field, value, constraint', () => {
      const error = new ValidationError('tableId', 'lowercase', 'must start uppercase')

      expect(error.context?.field).toBe('tableId')
      expect(error.context?.value).toBe('lowercase')
      expect(error.context?.constraint).toBe('must start uppercase')
    })

    it('merges additional context', () => {
      const error = new ValidationError('colId', '123', 'invalid identifier', {
        tool: 'manage_schema'
      })

      expect(error.context?.tool).toBe('manage_schema')
    })
  })

  describe('toUserMessage', () => {
    it('formats string value with quotes', () => {
      const error = new ValidationError('docId', 'abc', 'must be 22 chars')

      const message = error.toUserMessage()

      expect(message).toContain('"abc"')
      expect(message).toContain("Invalid value for parameter 'docId'")
    })

    it('formats non-string values as JSON', () => {
      const error = new ValidationError('rowId', -5, 'must be positive')

      const message = error.toUserMessage()

      expect(message).toContain('-5')
    })

    it('formats object values as JSON', () => {
      const error = new ValidationError('options', { invalid: true }, 'wrong schema')

      const message = error.toUserMessage()

      expect(message).toContain('{"invalid":true}')
    })

    it('includes constraint message', () => {
      const error = new ValidationError('type', 'Invalid', 'must be valid column type')

      const message = error.toUserMessage()

      expect(message).toContain('Constraint: must be valid column type')
    })
  })

  describe('isRetryable', () => {
    it('returns false', () => {
      const error = new ValidationError('field', 'value', 'constraint')

      expect(error.isRetryable()).toBe(false)
    })
  })

  describe('getSuggestions', () => {
    it('returns docId suggestions', () => {
      const error = new ValidationError('docId', 'abc', 'invalid')

      const suggestions = error.getSuggestions()

      expect(suggestions.some((s) => s.includes('grist_get_documents'))).toBe(true)
      expect(suggestions.some((s) => s.includes('Base58'))).toBe(true)
    })

    it('returns tableId suggestions', () => {
      const error = new ValidationError('tableId', 'invalid', 'must start uppercase')

      const suggestions = error.getSuggestions()

      expect(suggestions.some((s) => s.includes('grist_get_tables'))).toBe(true)
    })

    it('returns colId suggestions', () => {
      const error = new ValidationError('colId', '123', 'invalid identifier')

      const suggestions = error.getSuggestions()

      expect(suggestions.some((s) => s.includes('column names'))).toBe(true)
    })

    it('returns rowId suggestions', () => {
      const error = new ValidationError('rowIds', [-1], 'must be positive')

      const suggestions = error.getSuggestions()

      expect(suggestions.some((s) => s.includes('grist_get_records'))).toBe(true)
    })

    it('returns workspaceId suggestions', () => {
      const error = new ValidationError('workspaceId', 'abc', 'must be integer')

      const suggestions = error.getSuggestions()

      expect(suggestions.some((s) => s.includes('grist_get_workspaces'))).toBe(true)
    })

    it('returns widgetOptions suggestions', () => {
      const error = new ValidationError('widgetOptions', {}, 'invalid schema')

      const suggestions = error.getSuggestions()

      expect(suggestions.some((s) => s.includes('full_schema'))).toBe(true)
    })

    it('returns type suggestions', () => {
      const error = new ValidationError('type', 'Invalid', 'unknown type')

      const suggestions = error.getSuggestions()

      expect(suggestions.some((s) => s.includes('Valid column types'))).toBe(true)
    })

    it('returns generic suggestion for unknown fields', () => {
      const error = new ValidationError('unknownField', 'value', 'invalid')

      const suggestions = error.getSuggestions()

      expect(suggestions.some((s) => s.includes('grist_help'))).toBe(true)
    })
  })

  describe('fromZodError', () => {
    it('creates from Zod error with path', () => {
      const schema = z.object({ name: z.string().min(1) })
      const result = schema.safeParse({ name: '' })

      if (!result.success) {
        const error = ValidationError.fromZodError(result.error, 'input')

        expect(error.field).toBe('name')
        expect(error.constraint).toBeDefined()
      }
    })

    it('creates from Zod error without path', () => {
      const schema = z.string().min(5)
      const result = schema.safeParse('ab')

      if (!result.success) {
        const error = ValidationError.fromZodError(result.error, 'value')

        expect(error.field).toBe('value')
      }
    })

    it('handles empty issues array', () => {
      const fakeError = { issues: [], message: 'Validation failed' } as z.ZodError

      const error = ValidationError.fromZodError(fakeError, 'field')

      expect(error.field).toBe('field')
      expect(error.constraint).toBe('Validation failed')
    })

    it('includes zodIssues in context', () => {
      const schema = z.number().positive()
      const result = schema.safeParse(-5)

      if (!result.success) {
        const error = ValidationError.fromZodError(result.error)

        expect(error.context?.zodIssues).toBeDefined()
      }
    })
  })
})
