/**
 * Unit Tests for Formatter
 *
 * Tests the formatter functionality including:
 * - Error message size limiting
 * - Error message truncation
 * - No emoji characters in error messages
 */

import { describe, expect, it } from 'vitest'
import { MAX_ERROR_LENGTH } from '../../../src/constants.js'
import { formatErrorResponse } from '../../../src/services/formatter.js'

describe('Formatter - Error Message Constraints', () => {
  describe('Error Message Size Limiting', () => {
    it('should not truncate short error messages', () => {
      const shortError = 'This is a short error message.'
      const response = formatErrorResponse(shortError)

      expect(response.content[0].text).toBe(shortError)
      expect(response.structuredContent.error).toBe(shortError)
      expect(response.isError).toBe(true)
    })

    it('should truncate error messages exceeding MAX_ERROR_LENGTH', () => {
      // Create an error message longer than MAX_ERROR_LENGTH
      const longError = 'A'.repeat(MAX_ERROR_LENGTH + 100)
      const response = formatErrorResponse(longError)

      const expectedTruncated = `${'A'.repeat(MAX_ERROR_LENGTH)}\n\n[Error message truncated - exceeded maximum length]`

      expect(response.content[0].text).toBe(expectedTruncated)
      expect(response.structuredContent.error).toBe(expectedTruncated)
      expect(response.content[0].text.length).toBeLessThan(longError.length)
    })

    it('should handle error messages exactly at MAX_ERROR_LENGTH', () => {
      const exactLengthError = 'X'.repeat(MAX_ERROR_LENGTH)
      const response = formatErrorResponse(exactLengthError)

      // Should not be truncated since it's exactly at the limit
      expect(response.content[0].text).toBe(exactLengthError)
      expect(response.structuredContent.error).toBe(exactLengthError)
    })

    it('should truncate multi-line error messages', () => {
      const longMultilineError = 'Line 1\n'.repeat(100) + 'This should be truncated\n'.repeat(100)
      const response = formatErrorResponse(longMultilineError)

      expect(response.content[0].text.length).toBeLessThanOrEqual(
        MAX_ERROR_LENGTH + '\n\n[Error message truncated - exceeded maximum length]'.length
      )
      expect(response.content[0].text).toContain('[Error message truncated')
    })
  })

  describe('Error Message Content Validation', () => {
    it('should not contain emoji characters in error messages', () => {
      // Test common emoji that were in old error messages
      const errorWithoutEmoji = formatErrorResponse('Error: Invalid data format')

      expect(errorWithoutEmoji.content[0].text).not.toContain('❌')
      expect(errorWithoutEmoji.content[0].text).not.toContain('✅')
      expect(errorWithoutEmoji.content[0].text).not.toContain('💡')
      expect(errorWithoutEmoji.content[0].text).not.toContain('📖')
    })

    it('should preserve error metadata in structured response', () => {
      const errorMessage = 'Test error'
      const options = {
        error_code: 'TEST_ERROR',
        context: { detail: 'Additional context' },
        retryable: true
      }

      const response = formatErrorResponse(errorMessage, options)

      expect(response.structuredContent.success).toBe(false)
      expect(response.structuredContent.error).toBe(errorMessage)
      expect(response.structuredContent.error_code).toBe('TEST_ERROR')
      expect(response.structuredContent.context).toEqual({ detail: 'Additional context' })
      expect(response.structuredContent.retryable).toBe(true)
    })

    it('should handle error messages with special characters', () => {
      const errorWithSpecialChars =
        'Error: Invalid character in column "Name" at line 42: unexpected token "&"'
      const response = formatErrorResponse(errorWithSpecialChars)

      expect(response.content[0].text).toBe(errorWithSpecialChars)
      expect(response.structuredContent.error).toBe(errorWithSpecialChars)
    })
  })

  describe('Error Response Structure', () => {
    it('should always have isError flag set to true', () => {
      const response = formatErrorResponse('Any error message')

      expect(response.isError).toBe(true)
    })

    it('should always have content array with text type', () => {
      const response = formatErrorResponse('Error message')

      expect(response.content).toBeInstanceOf(Array)
      expect(response.content).toHaveLength(1)
      expect(response.content[0].type).toBe('text')
      expect(response.content[0].text).toBeTruthy()
    })

    it('should always have structuredContent with success: false', () => {
      const response = formatErrorResponse('Error message')

      expect(response.structuredContent).toBeTruthy()
      expect(response.structuredContent.success).toBe(false)
      expect(response.structuredContent.error).toBeTruthy()
    })
  })

  describe('Truncation Edge Cases', () => {
    it('should handle empty error messages', () => {
      const response = formatErrorResponse('')

      expect(response.content[0].text).toBe('')
      expect(response.structuredContent.error).toBe('')
    })

    it('should handle error messages with only whitespace', () => {
      const whitespaceError = '   \n\n   '
      const response = formatErrorResponse(whitespaceError)

      expect(response.content[0].text).toBe(whitespaceError)
    })

    it('should preserve newlines in non-truncated messages', () => {
      const multilineError = 'Line 1\nLine 2\nLine 3'
      const response = formatErrorResponse(multilineError)

      expect(response.content[0].text).toBe(multilineError)
      expect(response.content[0].text).toContain('\n')
    })
  })
})
