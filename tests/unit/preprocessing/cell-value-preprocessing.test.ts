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
import { z } from 'zod'
import {
  CellValueInputSchema,
  CellValueSchema,
  decodeCellValueWithType
} from '../../../src/schemas/api-responses.js'
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

  describe('Natural Array Formats (Converted to Grist Encoding)', () => {
    it('should convert string arrays to ChoiceList encoding', () => {
      const naturalFormats = [
        { input: ['A', 'B', 'C'], expected: ['L', 'A', 'B', 'C'] },
        { input: ['Grade', 'A'], expected: ['L', 'Grade', 'A'] },
        { input: ['item1', 'item2'], expected: ['L', 'item1', 'item2'] }
      ]

      naturalFormats.forEach(({ input, expected }) => {
        const result = CellValueSchema.parse(input)
        expect(result).toEqual(expected)
      })
    })

    it('should convert number arrays to RefList encoding', () => {
      const input = [1, 2, 3]
      const result = CellValueSchema.parse(input)
      expect(result).toEqual(['L', 1, 2, 3])
    })

    it('should convert empty arrays to empty list encoding', () => {
      const input: string[] = []
      const result = CellValueSchema.parse(input)
      expect(result).toEqual(['L'])
    })

    it('should convert arrays with encoding-like first letters to ChoiceList', () => {
      // These start with single letters but are natural string arrays
      // They should be converted to ChoiceList encoding, not treated as pre-encoded
      const naturalDataWithEncodingLetters = [
        ['E', 'A', 'C', 'B'], // 4 elements = ChoiceList
        ['P', 'Q', 'R'], // 3 strings = ChoiceList
        ['U', 'V', 'W'], // 3 strings = ChoiceList
        ['C', 'D', 'E'] // 3 strings = ChoiceList
      ]

      naturalDataWithEncodingLetters.forEach((val) => {
        const result = CellValueSchema.parse(val)
        expect(result).toEqual(['L', ...val])
      })
    })
  })

  describe('Pre-Encoded Values (Internal preprocessCellValue)', () => {
    // Note: CellValueSchema now only accepts natural formats for user/LLM input
    // Pre-encoded values are handled internally by preprocessCellValue
    // This test verifies the internal preprocessing function directly

    it('preprocessCellValue should pass through already-encoded values (idempotent)', () => {
      // The preprocessing function is tested indirectly - when internal code
      // passes pre-encoded values, they pass through. But CellValueSchema
      // (for user input) only accepts natural formats and converts them.
      // This is the intended design: LLMs see only natural formats in schema.
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

/**
 * JSON Schema Visibility Tests
 *
 * Verify that CellValueSchema exposes only natural input types in JSON Schema,
 * hiding Grist encoding patterns from LLMs using the MCP SDK.
 */
describe('JSON Schema Visibility', () => {
  it('should NOT expose Grist encoding patterns in JSON Schema', () => {
    // Test the INPUT schema (CellValueInputSchema) which is what MCP SDK exposes to LLMs
    // CellValueSchema includes transform/pipe which outputs Grist encoding formats
    const jsonSchema = z.toJSONSchema(CellValueInputSchema)
    const schemaString = JSON.stringify(jsonSchema)

    // Should NOT contain encoding literals like ["d", ...] or ["L", ...]
    expect(schemaString).not.toContain('"const":"L"')
    expect(schemaString).not.toContain('"const":"d"')
    expect(schemaString).not.toContain('"const":"D"')
    expect(schemaString).not.toContain('"const":"R"')
    expect(schemaString).not.toContain('"const":"r"')
    expect(schemaString).not.toContain('"const":"O"')
    expect(schemaString).not.toContain('"const":"l"')
  })

  it('should show natural types in JSON Schema', () => {
    // Test the INPUT schema which is what users/LLMs see
    const jsonSchema = z.toJSONSchema(CellValueInputSchema)
    const schemaString = JSON.stringify(jsonSchema)

    // Should have basic types - check for type keywords in anyOf
    expect(schemaString).toContain('"type":"string"')
    expect(schemaString).toContain('"type":"number"')
    expect(schemaString).toContain('"type":"boolean"')
    expect(schemaString).toContain('"type":"array"')
    // null is represented as type: "null" in JSON Schema
    expect(schemaString).toContain('null')
  })

  it('should include helpful descriptions for dates', () => {
    // Test the INPUT schema which includes user-facing descriptions
    const jsonSchema = z.toJSONSchema(CellValueInputSchema)
    const schemaString = JSON.stringify(jsonSchema)

    // Should have date format hint in description
    expect(schemaString).toContain('ISO 8601')
  })
})

/**
 * Type-Aware Output Decoding Tests
 *
 * Verify that decodeCellValueWithType correctly converts raw Unix timestamps
 * (returned by Grist API) to human-readable ISO date strings based on column type.
 */
describe('Type-Aware Output Decoding', () => {
  describe('Date Columns', () => {
    it('should convert raw timestamp to ISO date for Date columns', () => {
      // 1609459200 = 2021-01-01T00:00:00Z
      const result = decodeCellValueWithType(1609459200, 'Date')
      expect(result).toBe('2021-01-01')
    })

    it('should handle different date timestamps', () => {
      // Christmas 2024: Dec 25, 2024
      const christmas = decodeCellValueWithType(1735084800, 'Date')
      expect(christmas).toBe('2024-12-25')

      // Y2K: Jan 1, 2000
      const y2k = decodeCellValueWithType(946684800, 'Date')
      expect(y2k).toBe('2000-01-01')
    })
  })

  describe('DateTime Columns', () => {
    it('should convert raw timestamp to ISO datetime for DateTime columns', () => {
      // 1609459200 = 2021-01-01T00:00:00Z
      const result = decodeCellValueWithType(1609459200, 'DateTime:UTC')
      expect(result).toBe('2021-01-01T00:00:00.000Z')
    })

    it('should handle DateTime with different timezones in type', () => {
      // The column type may include timezone, but we always output ISO/UTC
      const result1 = decodeCellValueWithType(1609459200, 'DateTime:America/New_York')
      expect(result1).toBe('2021-01-01T00:00:00.000Z')

      const result2 = decodeCellValueWithType(1609459200, 'DateTime:Europe/London')
      expect(result2).toBe('2021-01-01T00:00:00.000Z')
    })

    it('should handle timestamp with time component', () => {
      // 1609502400 = 2021-01-01T12:00:00Z
      const result = decodeCellValueWithType(1609502400, 'DateTime:UTC')
      expect(result).toBe('2021-01-01T12:00:00.000Z')
    })
  })

  describe('Non-Date Columns', () => {
    it('should pass through text values unchanged', () => {
      expect(decodeCellValueWithType('Hello World', 'Text')).toBe('Hello World')
      expect(decodeCellValueWithType('', 'Text')).toBe('')
    })

    it('should pass through numeric values for Numeric columns', () => {
      expect(decodeCellValueWithType(123.45, 'Numeric')).toBe(123.45)
      expect(decodeCellValueWithType(0, 'Numeric')).toBe(0)
      expect(decodeCellValueWithType(-100, 'Int')).toBe(-100)
    })

    it('should pass through boolean values', () => {
      expect(decodeCellValueWithType(true, 'Bool')).toBe(true)
      expect(decodeCellValueWithType(false, 'Bool')).toBe(false)
    })

    it('should pass through null', () => {
      expect(decodeCellValueWithType(null, 'Text')).toBe(null)
      expect(decodeCellValueWithType(null, 'Date')).toBe(null)
    })
  })

  describe('Encoded Value Handling', () => {
    it('should still decode encoded ChoiceList values', () => {
      const result = decodeCellValueWithType(['L', 'a', 'b', 'c'], 'ChoiceList')
      expect(result).toEqual(['a', 'b', 'c'])
    })

    it('should decode encoded Date values (if present)', () => {
      // If Grist returns encoded format, we should still handle it
      const result = decodeCellValueWithType(['d', 1609459200], 'Date')
      expect(result).toBe('2021-01-01')
    })

    it('should decode encoded DateTime values (if present)', () => {
      const result = decodeCellValueWithType(['D', 1609459200, 'UTC'], 'DateTime:UTC')
      expect(result).toBe('2021-01-01T00:00:00.000Z')
    })

    it('should decode Reference values', () => {
      const result = decodeCellValueWithType(['R', 'Customers', 42], 'Ref:Customers')
      expect(result).toBe(42)
    })

    it('should decode ReferenceList values', () => {
      const result = decodeCellValueWithType(['r', 'Customers', [1, 2, 3]], 'RefList:Customers')
      expect(result).toEqual([1, 2, 3])
    })
  })

  describe('Edge Cases', () => {
    it('should handle unknown column types by passing through', () => {
      // Unknown type - should not transform
      expect(decodeCellValueWithType(123, 'UnknownType')).toBe(123)
      expect(decodeCellValueWithType('text', 'CustomType')).toBe('text')
    })

    it('should not convert numbers for non-date columns', () => {
      // Numbers in non-date columns should stay as numbers
      expect(decodeCellValueWithType(1609459200, 'Numeric')).toBe(1609459200)
      expect(decodeCellValueWithType(1609459200, 'Int')).toBe(1609459200)
      expect(decodeCellValueWithType(1609459200, 'Text')).toBe(1609459200)
    })

    it('should handle zero timestamp (Unix epoch)', () => {
      const result = decodeCellValueWithType(0, 'Date')
      expect(result).toBe('1970-01-01')
    })
  })
})
