/**
 * Unit Tests for CellValue Preprocessing
 *
 * Tests the automatic conversion of natural formats to Grist encoding.
 * This is a UNIT test - fast, no external dependencies.
 *
 * Philosophy: Test IMPLEMENTATION (the preprocessing logic itself)
 * Integration tests verify BEHAVIOR (MCP tools work with natural formats)
 */

import { describe, expect, it } from 'vitest'
import { CellValueSchema } from '../../../src/schemas/api-responses.js'
import { isDateEncoding, isDateTimeEncoding } from '../../helpers/type-guards.js'

describe('CellValue Preprocessing', () => {
  describe('Plain Arrays → ChoiceList Encoding', () => {
    it('should convert string array to ChoiceList', () => {
      const input = ['Python', 'SQL', 'JavaScript']
      const result = CellValueSchema.parse(input)
      expect(result).toEqual(['L', 'Python', 'SQL', 'JavaScript'])
    })

    it('should convert single-item array to ChoiceList', () => {
      const input = ['Solo']
      const result = CellValueSchema.parse(input)
      expect(result).toEqual(['L', 'Solo'])
    })

    it('should convert empty array to empty ChoiceList', () => {
      const input: string[] = []
      const result = CellValueSchema.parse(input)
      expect(result).toEqual(['L'])
    })

    it('should handle ChoiceList with special characters', () => {
      const input = ['Option #1', 'Value: $100', 'Test-Case']
      const result = CellValueSchema.parse(input)
      expect(result).toEqual(['L', 'Option #1', 'Value: $100', 'Test-Case'])
    })

    it('should handle ChoiceList with unicode characters', () => {
      const input = ['日本語', 'Español', 'Français']
      const result = CellValueSchema.parse(input)
      expect(result).toEqual(['L', '日本語', 'Español', 'Français'])
    })
  })

  describe('Number Arrays → RefList Encoding', () => {
    it('should convert number array to RefList (uses L format like ChoiceList)', () => {
      const input = [10, 20, 30]
      const result = CellValueSchema.parse(input)
      // Grist uses 'L' format for RefList, not 'r'!
      expect(result).toEqual(['L', 10, 20, 30])
    })

    it('should convert single number array to RefList', () => {
      const input = [42]
      const result = CellValueSchema.parse(input)
      expect(result).toEqual(['L', 42])
    })

    it('should handle zero in RefList', () => {
      const input = [0, 1, 2]
      const result = CellValueSchema.parse(input)
      expect(result).toEqual(['L', 0, 1, 2])
    })

    it('should handle negative numbers in RefList', () => {
      const input = [-1, -2, -3]
      const result = CellValueSchema.parse(input)
      expect(result).toEqual(['L', -1, -2, -3])
    })
  })

  describe('ISO Date Strings → Date Encoding', () => {
    it('should convert ISO date string to Date encoding', () => {
      const input = '2024-01-15'
      const result = CellValueSchema.parse(input)

      // Check it's a date tuple using type guard
      expect(isDateEncoding(result)).toBe(true)
      if (isDateEncoding(result)) {
        // Type guard narrows type to ['d', number]
        expect(result[0]).toBe('d')
        expect(typeof result[1]).toBe('number')

        // Verify timestamp is in seconds (not milliseconds) and reasonable (Jan 15, 2024)
        const timestamp = result[1]
        expect(timestamp).toBeGreaterThanOrEqual(1705276800) // ~Jan 15, 2024 00:00 UTC (seconds)
        expect(timestamp).toBeLessThan(1705363200) // ~Jan 16, 2024 00:00 UTC (seconds)
      }
    })

    it('should convert different date formats', () => {
      const dates = [
        '2024-12-25', // Christmas
        '2000-01-01', // Y2K
        '2024-02-29' // Leap year
      ]

      for (const date of dates) {
        const result = CellValueSchema.parse(date)
        expect(isDateEncoding(result)).toBe(true)
      }
    })

    it('should handle ISO date with timezone', () => {
      // Note: Date.parse() handles timezone, but our preprocessing
      // converts to 'd' (date only) if no 'T' present
      const input = '2024-01-15' // No time component
      const result = CellValueSchema.parse(input)
      expect(isDateEncoding(result)).toBe(true)
    })
  })

  describe('ISO DateTime Strings → DateTime Encoding', () => {
    it('should convert ISO datetime string to DateTime encoding', () => {
      const input = '2024-01-15T10:30:00Z'
      const result = CellValueSchema.parse(input)

      expect(isDateTimeEncoding(result)).toBe(true)
      if (isDateTimeEncoding(result)) {
        // Type guard narrows type to ['D', number, string]
        expect(result[0]).toBe('D')
        expect(typeof result[1]).toBe('number')
        expect(result[2]).toBe('UTC')
      }
    })

    it('should convert datetime with timezone offset', () => {
      const input = '2024-01-15T10:30:00-05:00'
      const result = CellValueSchema.parse(input)

      expect(isDateTimeEncoding(result)).toBe(true)
      if (isDateTimeEncoding(result)) {
        expect(result[0]).toBe('D')
        expect(typeof result[1]).toBe('number')
        expect(result[2]).toBe('UTC')
      }
    })

    it('should handle datetime without timezone (Z)', () => {
      const input = '2024-01-15T10:30:00'
      const result = CellValueSchema.parse(input)

      // Has 'T' so should be DateTime
      expect(isDateTimeEncoding(result)).toBe(true)
    })

    it('should handle ISO 8601 with milliseconds', () => {
      const input = '2024-01-15T10:30:00.500Z'
      const result = CellValueSchema.parse(input)

      expect(isDateTimeEncoding(result)).toBe(true)
      if (isDateTimeEncoding(result)) {
        expect(result[0]).toBe('D')
        expect(typeof result[1]).toBe('number')
      }
    })
  })

  describe('Pre-Encoded Values (Idempotent - Pass Through)', () => {
    it('should accept already-encoded Date (idempotent)', () => {
      const input = ['d', 1705276800]
      const result = CellValueSchema.parse(input)
      // Should return unchanged (idempotent)
      expect(result).toEqual(input)
    })

    it('should accept already-encoded DateTime (idempotent)', () => {
      const input = ['D', 1705276800, 'America/New_York']
      const result = CellValueSchema.parse(input)
      // Should return unchanged (idempotent)
      expect(result).toEqual(input)
    })

    it('should accept all valid Grist encodings (idempotent)', () => {
      // These match valid Grist encoding STRUCTURES - pass through unchanged
      const validEncodings = [
        ['d', 1705276800], // Date: ['d', number]
        ['D', 1705276800, 'UTC'], // DateTime: ['D', number, string]
        ['L', 'item1', 'item2'], // List: ['L', ...]
        ['L'], // Empty list
        ['R', 'Table', 123], // Reference: ['R', any, any] (3 elements)
        ['r', 'Table', [1, 2, 3]], // ReferenceList: ['r', any, array]
        ['O', { key: 'value' }], // Dict: ['O', object]
        ['l', [1, 2], { col: 'name' }] // Lookup: ['l', ...] (2+ elements)
      ]

      validEncodings.forEach((val) => {
        const result = CellValueSchema.parse(val)
        expect(result).toEqual(val) // Idempotent - returned unchanged
      })
    })

    it('should still convert natural formats (not already encoded)', () => {
      // These should still be converted
      const naturalFormats = [
        { input: ['A', 'B', 'C'], expected: ['L', 'A', 'B', 'C'] }, // String array → ChoiceList
        { input: [1, 2, 3], expected: ['L', 1, 2, 3] }, // Number array → RefList
        { input: ['Grade', 'A'], expected: ['L', 'Grade', 'A'] } // Ambiguous but not encoded
      ]

      naturalFormats.forEach(({ input, expected }) => {
        const result = CellValueSchema.parse(input)
        expect(result).toEqual(expected)
      })
    })

    it('should convert arrays with encoding-like first letters that lack valid structure', () => {
      // These start with encoding letters but don't match valid encoding STRUCTURES
      // So they're treated as natural ChoiceList data and converted
      const naturalDataWithEncodingLetters = [
        ['E', 'A', 'C', 'B'], // 4 elements = ChoiceList (Error encoding has different structure)
        ['P', 'Q', 'R'], // 3 elements but all strings = ChoiceList (not Pending)
        ['U', 'V', 'W'], // 3 elements but all strings = ChoiceList (not Unmarshallable)
        ['C', 'D', 'E'] // 3 elements but all strings = ChoiceList (not Censored)
      ]

      naturalDataWithEncodingLetters.forEach((val) => {
        const result = CellValueSchema.parse(val)
        // Should be converted to ChoiceList encoding
        expect(result).toEqual(['L', ...val])
      })
    })
  })

  describe('Primitive Values (No Transformation)', () => {
    it('should pass through null', () => {
      const result = CellValueSchema.parse(null)
      expect(result).toBeNull()
    })

    it('should pass through string', () => {
      const result = CellValueSchema.parse('Hello World')
      expect(result).toBe('Hello World')
    })

    it('should pass through number', () => {
      const result = CellValueSchema.parse(42)
      expect(result).toBe(42)
    })

    it('should pass through boolean true', () => {
      const result = CellValueSchema.parse(true)
      expect(result).toBe(true)
    })

    it('should pass through boolean false', () => {
      const result = CellValueSchema.parse(false)
      expect(result).toBe(false)
    })

    it('should pass through zero', () => {
      const result = CellValueSchema.parse(0)
      expect(result).toBe(0)
    })

    it('should pass through empty string', () => {
      const result = CellValueSchema.parse('')
      expect(result).toBe('')
    })
  })

  describe('Edge Cases', () => {
    it('should reject mixed-type arrays', () => {
      // Mixed string/number - Zod will reject as invalid
      const input = ['text', 123, 'more']

      // Should throw ZodError - not a valid CellValue
      expect(() => CellValueSchema.parse(input)).toThrow()
    })

    it('should not convert date-like strings that are invalid', () => {
      const invalid = 'not-a-date-at-all'
      const result = CellValueSchema.parse(invalid)

      // Should pass through as string
      expect(result).toBe('not-a-date-at-all')
    })

    it('should NOT convert numeric strings (regex protects against Date.parse quirk)', () => {
      // Date.parse('12345') would parse as year 12345, but our regex prevents this
      const input = '12345'
      const result = CellValueSchema.parse(input)

      // Should pass through as string (regex rejects non-ISO 8601 format)
      expect(result).toBe('12345')
    })

    it('should handle very large numbers', () => {
      const large = Number.MAX_SAFE_INTEGER
      const result = CellValueSchema.parse(large)
      expect(result).toBe(large)
    })

    it('should handle very small numbers', () => {
      const small = Number.MIN_SAFE_INTEGER
      const result = CellValueSchema.parse(small)
      expect(result).toBe(small)
    })

    it('should handle negative zero', () => {
      const result = CellValueSchema.parse(-0)
      // JavaScript quirk: -0 !== 0 in Object.is
      // But functionally equivalent, so we accept either
      expect(result === 0 || result === 0).toBe(true)
    })
  })

  describe('Real-World Examples', () => {
    it('should handle product tags', () => {
      const tags = ['New', 'Featured', 'Sale', 'Clearance']
      const result = CellValueSchema.parse(tags)
      expect(result).toEqual(['L', 'New', 'Featured', 'Sale', 'Clearance'])
    })

    it('should handle employee hire date', () => {
      const hireDate = '2023-06-15'
      const result = CellValueSchema.parse(hireDate)
      expect(isDateEncoding(result)).toBe(true)
    })

    it('should handle event timestamp', () => {
      const timestamp = '2024-03-21T14:30:00Z'
      const result = CellValueSchema.parse(timestamp)
      expect(isDateTimeEncoding(result)).toBe(true)
      if (isDateTimeEncoding(result)) {
        expect(result[0]).toBe('D')
        expect(result[2]).toBe('UTC')
      }
    })

    it('should handle project team member IDs (RefList)', () => {
      const memberIds = [101, 102, 103, 104]
      const result = CellValueSchema.parse(memberIds)
      // RefList uses 'L' format like ChoiceList
      expect(result).toEqual(['L', 101, 102, 103, 104])
    })

    it('should handle task status as plain string', () => {
      const status = 'In Progress'
      const result = CellValueSchema.parse(status)
      expect(result).toBe('In Progress')
    })

    it('should handle priority as number', () => {
      const priority = 5
      const result = CellValueSchema.parse(priority)
      expect(result).toBe(5)
    })

    it('should handle completed flag as boolean', () => {
      const completed = true
      const result = CellValueSchema.parse(completed)
      expect(result).toBe(true)
    })
  })
})
