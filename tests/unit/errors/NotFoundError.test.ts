/**
 * Unit tests for NotFoundError
 *
 * Tests:
 * - Constructor: Sets properties for all resource types
 * - toUserMessage(): Returns formatted message with causes and next steps
 * - isRetryable(): Always returns false
 * - getSuggestions(): Returns actionable steps
 */

import { describe, expect, it } from 'vitest'
import type { ResourceType } from '../../../src/errors/NotFoundError.js'
import { NotFoundError } from '../../../src/errors/NotFoundError.js'

describe('NotFoundError', () => {
  describe('constructor', () => {
    it('creates error with document resource type', () => {
      const error = new NotFoundError('document', 'abc123xyz')

      expect(error.resourceType).toBe('document')
      expect(error.resourceId).toBe('abc123xyz')
      expect(error.message).toBe('document not found: abc123xyz')
      expect(error.code).toBe('NOT_FOUND')
    })

    it('creates error with table resource type', () => {
      const error = new NotFoundError('table', 'Users')

      expect(error.resourceType).toBe('table')
      expect(error.resourceId).toBe('Users')
      expect(error.message).toBe('table not found: Users')
    })

    it('creates error with workspace resource type', () => {
      const error = new NotFoundError('workspace', '12345')

      expect(error.resourceType).toBe('workspace')
      expect(error.resourceId).toBe('12345')
    })

    it('creates error with column resource type', () => {
      const error = new NotFoundError('column', 'Name')

      expect(error.resourceType).toBe('column')
      expect(error.resourceId).toBe('Name')
    })

    it('creates error with record resource type', () => {
      const error = new NotFoundError('record', '42')

      expect(error.resourceType).toBe('record')
      expect(error.resourceId).toBe('42')
    })

    it('creates error with organization resource type', () => {
      const error = new NotFoundError('organization', 'org-123')

      expect(error.resourceType).toBe('organization')
      expect(error.resourceId).toBe('org-123')
    })

    it('includes context when provided', () => {
      const error = new NotFoundError('table', 'Users', { docId: 'abc123' })

      expect(error.context?.docId).toBe('abc123')
    })

    it('sets name to NotFoundError', () => {
      const error = new NotFoundError('document', 'abc')

      expect(error.name).toBe('NotFoundError')
    })

    it('extends Error', () => {
      const error = new NotFoundError('document', 'abc')

      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('toUserMessage', () => {
    it('returns formatted message for document', () => {
      const error = new NotFoundError('document', 'doc123')

      const message = error.toUserMessage()

      expect(message).toContain("document not found (ID: 'doc123')")
      expect(message).toContain('Possible causes:')
      expect(message).toContain('Invalid document ID')
      expect(message).toContain('No access permission')
      expect(message).toContain('Next steps:')
      expect(message).toContain('grist_get_documents')
    })

    it('returns formatted message for table', () => {
      const error = new NotFoundError('table', 'Users')

      const message = error.toUserMessage()

      expect(message).toContain("table not found (ID: 'Users')")
      expect(message).toContain('Invalid table ID')
      expect(message).toContain('Table was deleted or renamed')
      expect(message).toContain('grist_get_tables')
    })

    it('returns formatted message for workspace', () => {
      const error = new NotFoundError('workspace', '123')

      const message = error.toUserMessage()

      expect(message).toContain("workspace not found (ID: '123')")
      expect(message).toContain('grist_get_workspaces')
    })

    it('returns formatted message for column', () => {
      const error = new NotFoundError('column', 'Email')

      const message = error.toUserMessage()

      expect(message).toContain("column not found (ID: 'Email')")
      expect(message).toContain('Wrong table specified')
      expect(message).toContain('grist_get_tables')
    })

    it('returns formatted message for record', () => {
      const error = new NotFoundError('record', '999')

      const message = error.toUserMessage()

      expect(message).toContain("record not found (ID: '999')")
      expect(message).toContain('Record was deleted')
      expect(message).toContain('grist_read_records')
    })

    it('returns formatted message for organization', () => {
      const error = new NotFoundError('organization', 'org-abc')

      const message = error.toUserMessage()

      expect(message).toContain("organization not found (ID: 'org-abc')")
      expect(message).toContain('No access to this organization')
    })
  })

  describe('isRetryable', () => {
    it('returns false for all resource types', () => {
      const resourceTypes: ResourceType[] = [
        'document',
        'table',
        'workspace',
        'column',
        'record',
        'organization'
      ]

      for (const resourceType of resourceTypes) {
        const error = new NotFoundError(resourceType, 'test-id')
        expect(error.isRetryable()).toBe(false)
      }
    })
  })

  describe('getSuggestions', () => {
    it('returns suggestions for document', () => {
      const error = new NotFoundError('document', 'abc')

      const suggestions = error.getSuggestions()

      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions.some((s) => s.includes('grist_get_documents'))).toBe(true)
      expect(suggestions.some((s) => s.includes('document ID'))).toBe(true)
    })

    it('returns suggestions for table', () => {
      const error = new NotFoundError('table', 'Users')

      const suggestions = error.getSuggestions()

      expect(suggestions.some((s) => s.includes('grist_get_tables'))).toBe(true)
    })

    it('returns suggestions for workspace', () => {
      const error = new NotFoundError('workspace', '123')

      const suggestions = error.getSuggestions()

      expect(suggestions.some((s) => s.includes('grist_get_workspaces'))).toBe(true)
    })

    it('returns suggestions for column', () => {
      const error = new NotFoundError('column', 'Name')

      const suggestions = error.getSuggestions()

      expect(suggestions.some((s) => s.includes('grist_get_tables'))).toBe(true)
    })

    it('returns suggestions for record', () => {
      const error = new NotFoundError('record', '42')

      const suggestions = error.getSuggestions()

      expect(suggestions.some((s) => s.includes('grist_read_records'))).toBe(true)
    })

    it('returns suggestions for organization', () => {
      const error = new NotFoundError('organization', 'org')

      const suggestions = error.getSuggestions()

      expect(suggestions.some((s) => s.includes('grist_get_workspaces'))).toBe(true)
    })

    it('removes numeric prefixes from suggestions', () => {
      const error = new NotFoundError('document', 'abc')

      const suggestions = error.getSuggestions()

      // None of the suggestions should start with "1. ", "2. ", etc.
      for (const suggestion of suggestions) {
        expect(suggestion).not.toMatch(/^\d+\.\s/)
      }
    })
  })

  describe('inherited from GristError', () => {
    it('has timestamp set', () => {
      const before = new Date()
      const error = new NotFoundError('document', 'abc')
      const after = new Date()

      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('has isOperational set to true', () => {
      const error = new NotFoundError('document', 'abc')

      expect(error.isOperational).toBe(true)
    })

    it('serializes to JSON', () => {
      const error = new NotFoundError('table', 'Users', { docId: 'doc123' })

      const json = error.toJSON()

      expect(json.name).toBe('NotFoundError')
      expect(json.code).toBe('NOT_FOUND')
      expect(json.message).toBe('table not found: Users')
      expect(json.context).toHaveProperty('docId', 'doc123')
    })
  })
})
