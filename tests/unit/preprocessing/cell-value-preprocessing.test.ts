/**
 * Unit Tests for CellValue Codec Transformations
 *
 * Tests the column-type-aware bidirectional transformation using Zod 4 codecs.
 *
 * Architecture:
 * - CellValueInputSchema: Validates structure only (no transformation at schema level)
 * - encodeForApi(): User value → API format (ISO dates → timestamps, arrays → ["L", ...])
 * - decodeFromApi(): API value → User format (timestamps → ISO dates, ["L", ...] → arrays)
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CellValueInputSchema, CellValueSchema } from '../../../src/schemas/api-responses.js'
import {
  DateCodec,
  DateTimeCodec,
  decodeFromApi,
  encodeForApi,
  NumberListCodec,
  StringListCodec
} from '../../../src/schemas/cell-codecs.js'

describe('CellValue Schema Validation', () => {
  describe('Validates structure only (no transformation)', () => {
    it('should accept null', () => {
      const result = CellValueSchema.parse(null)
      expect(result).toBeNull()
    })

    it('should accept strings', () => {
      const result = CellValueSchema.parse('Hello World')
      expect(result).toBe('Hello World')
    })

    it('should accept numbers', () => {
      const result = CellValueSchema.parse(42)
      expect(result).toBe(42)
    })

    it('should accept booleans', () => {
      expect(CellValueSchema.parse(true)).toBe(true)
      expect(CellValueSchema.parse(false)).toBe(false)
    })

    it('should accept string arrays (for ChoiceList)', () => {
      const input = ['Python', 'SQL', 'JavaScript']
      const result = CellValueSchema.parse(input)
      // No transformation - input passes through
      expect(result).toEqual(['Python', 'SQL', 'JavaScript'])
    })

    it('should accept number arrays (for RefList)', () => {
      const input = [10, 20, 30]
      const result = CellValueSchema.parse(input)
      // No transformation - input passes through
      expect(result).toEqual([10, 20, 30])
    })

    it('should accept ISO date strings without transformation', () => {
      const input = '2024-01-15'
      const result = CellValueSchema.parse(input)
      // No transformation - ISO date string passes through
      expect(result).toBe('2024-01-15')
    })

    it('should accept ISO datetime strings without transformation', () => {
      const input = '2024-01-15T10:30:00Z'
      const result = CellValueSchema.parse(input)
      // No transformation - ISO datetime string passes through
      expect(result).toBe('2024-01-15T10:30:00Z')
    })
  })
})

describe('Zod 4 Codecs', () => {
  describe('DateCodec (ISO date string ↔ Unix timestamp)', () => {
    it('should transform ISO date to timestamp (encode: user → API)', () => {
      const result = DateCodec.parse('2024-01-15')
      // Should be Unix timestamp in seconds
      expect(typeof result).toBe('number')
      expect(result).toBe(1705276800)
    })

    it('should transform timestamp to ISO date (decode: API → user)', () => {
      const result = z.encode(DateCodec, 1705276800)
      expect(result).toBe('2024-01-15')
    })

    it('should handle epoch date', () => {
      expect(z.encode(DateCodec, 0)).toBe('1970-01-01')
    })

    it('should round-trip correctly', () => {
      const original = '2024-06-15'
      const encoded = DateCodec.parse(original)
      const decoded = z.encode(DateCodec, encoded)
      expect(decoded).toBe(original)
    })
  })

  describe('DateTimeCodec (ISO datetime string ↔ Unix timestamp)', () => {
    it('should transform ISO datetime to timestamp (encode: user → API)', () => {
      const result = DateTimeCodec.parse('2024-01-15T10:30:00Z')
      expect(typeof result).toBe('number')
      expect(result).toBe(1705314600)
    })

    it('should transform timestamp to ISO datetime (decode: API → user)', () => {
      const result = z.encode(DateTimeCodec, 1705314600)
      expect(result).toBe('2024-01-15T10:30:00.000Z')
    })

    it('should handle different timezone offsets in input', () => {
      // Both should give same timestamp since they represent same moment
      const utc = DateTimeCodec.parse('2024-01-15T10:30:00Z')
      const withOffset = DateTimeCodec.parse('2024-01-15T05:30:00-05:00')
      expect(utc).toBe(withOffset)
    })

    it('should round-trip correctly', () => {
      const original = '2024-01-15T10:30:00.000Z'
      const encoded = DateTimeCodec.parse(original)
      const decoded = z.encode(DateTimeCodec, encoded)
      expect(decoded).toBe(original)
    })
  })

  describe('StringListCodec (string array ↔ ["L", ...strings])', () => {
    it('should transform array to L-format (encode: user → API)', () => {
      const result = StringListCodec.parse(['Python', 'SQL', 'JavaScript'])
      expect(result).toEqual(['L', 'Python', 'SQL', 'JavaScript'])
    })

    it('should transform L-format to array (decode: API → user)', () => {
      const result = z.encode(StringListCodec, ['L', 'Python', 'SQL', 'JavaScript'])
      expect(result).toEqual(['Python', 'SQL', 'JavaScript'])
    })

    it('should handle empty array', () => {
      const encoded = StringListCodec.parse([])
      expect(encoded).toEqual(['L'])

      const decoded = z.encode(StringListCodec, ['L'])
      expect(decoded).toEqual([])
    })

    it('should handle single item', () => {
      const encoded = StringListCodec.parse(['Solo'])
      expect(encoded).toEqual(['L', 'Solo'])
    })
  })

  describe('NumberListCodec (number array ↔ ["L", ...numbers])', () => {
    it('should transform array to L-format (encode: user → API)', () => {
      const result = NumberListCodec.parse([1, 2, 3])
      expect(result).toEqual(['L', 1, 2, 3])
    })

    it('should transform L-format to array (decode: API → user)', () => {
      const result = z.encode(NumberListCodec, ['L', 1, 2, 3])
      expect(result).toEqual([1, 2, 3])
    })

    it('should handle zero and negative numbers', () => {
      const encoded = NumberListCodec.parse([0, -1, 100])
      expect(encoded).toEqual(['L', 0, -1, 100])
    })
  })
})

describe('encodeForApi (User → API transformation)', () => {
  describe('Date columns', () => {
    it('should convert ISO date to timestamp for Date columns', () => {
      const result = encodeForApi('2024-01-15', 'Date')
      expect(result).toBe(1705276800)
    })

    it('should pass through timestamps for Date columns', () => {
      const result = encodeForApi(1705276800, 'Date')
      expect(result).toBe(1705276800)
    })

    it('should pass through null', () => {
      const result = encodeForApi(null, 'Date')
      expect(result).toBeNull()
    })
  })

  describe('DateTime columns', () => {
    it('should convert ISO datetime to timestamp', () => {
      const result = encodeForApi('2024-01-15T10:30:00Z', 'DateTime:UTC')
      expect(result).toBe(1705314600)
    })

    it('should convert date-only string to timestamp for DateTime', () => {
      const result = encodeForApi('2024-01-15', 'DateTime:UTC')
      expect(result).toBe(1705276800)
    })
  })

  describe('ChoiceList columns', () => {
    it('should convert string array to L-format', () => {
      const result = encodeForApi(['A', 'B', 'C'], 'ChoiceList')
      expect(result).toEqual(['L', 'A', 'B', 'C'])
    })
  })

  describe('RefList columns', () => {
    it('should convert number array to L-format', () => {
      const result = encodeForApi([1, 2, 3], 'RefList:Customers')
      expect(result).toEqual(['L', 1, 2, 3])
    })
  })

  describe('Attachments columns', () => {
    it('should convert number array to L-format', () => {
      const result = encodeForApi([10, 20], 'Attachments')
      expect(result).toEqual(['L', 10, 20])
    })
  })

  describe('Passthrough columns', () => {
    it('should pass through Text values', () => {
      const result = encodeForApi('Hello World', 'Text')
      expect(result).toBe('Hello World')
    })

    it('should pass through Numeric values', () => {
      const result = encodeForApi(123.45, 'Numeric')
      expect(result).toBe(123.45)
    })

    it('should pass through Bool values', () => {
      const result = encodeForApi(true, 'Bool')
      expect(result).toBe(true)
    })

    it('should pass through Ref values (just row IDs)', () => {
      const result = encodeForApi(42, 'Ref:Customers')
      expect(result).toBe(42)
    })

    it('should pass through Choice values', () => {
      const result = encodeForApi('Option A', 'Choice')
      expect(result).toBe('Option A')
    })
  })
})

describe('decodeFromApi (API → User transformation)', () => {
  describe('Date columns', () => {
    it('should convert timestamp to ISO date for Date columns', () => {
      const result = decodeFromApi(1705276800, 'Date')
      expect(result).toBe('2024-01-15')
    })

    it('should handle epoch timestamp', () => {
      const result = decodeFromApi(0, 'Date')
      expect(result).toBe('1970-01-01')
    })

    it('should pass through null', () => {
      const result = decodeFromApi(null, 'Date')
      expect(result).toBeNull()
    })
  })

  describe('DateTime columns', () => {
    it('should convert timestamp to ISO datetime', () => {
      const result = decodeFromApi(1705314600, 'DateTime:UTC')
      expect(result).toBe('2024-01-15T10:30:00.000Z')
    })

    it('should handle different timezone in column type', () => {
      // Output is always ISO UTC regardless of column timezone setting
      const result = decodeFromApi(1705314600, 'DateTime:America/New_York')
      expect(result).toBe('2024-01-15T10:30:00.000Z')
    })
  })

  describe('ChoiceList columns', () => {
    it('should strip L-marker from arrays', () => {
      const result = decodeFromApi(['L', 'A', 'B', 'C'], 'ChoiceList')
      expect(result).toEqual(['A', 'B', 'C'])
    })

    it('should handle empty ChoiceList', () => {
      const result = decodeFromApi(['L'], 'ChoiceList')
      expect(result).toEqual([])
    })
  })

  describe('RefList columns', () => {
    it('should strip L-marker from number arrays', () => {
      const result = decodeFromApi(['L', 1, 2, 3], 'RefList:Customers')
      expect(result).toEqual([1, 2, 3])
    })
  })

  describe('Attachments columns', () => {
    it('should strip L-marker from attachment IDs', () => {
      const result = decodeFromApi(['L', 10, 20], 'Attachments')
      expect(result).toEqual([10, 20])
    })
  })

  describe('Passthrough values', () => {
    it('should pass through text', () => {
      const result = decodeFromApi('Hello World', 'Text')
      expect(result).toBe('Hello World')
    })

    it('should pass through numbers for non-date columns', () => {
      // Important: timestamps in non-date columns should NOT be converted
      const result = decodeFromApi(1705276800, 'Numeric')
      expect(result).toBe(1705276800)
    })

    it('should pass through booleans', () => {
      const result = decodeFromApi(true, 'Bool')
      expect(result).toBe(true)
    })

    it('should pass through row IDs for Ref columns', () => {
      const result = decodeFromApi(42, 'Ref:Customers')
      expect(result).toBe(42)
    })
  })

  describe('Generic list handling', () => {
    it('should strip L-marker for unknown list types', () => {
      // If we encounter L-format in an unknown column type, still strip it
      const result = decodeFromApi(['L', 'x', 'y'], 'UnknownType')
      expect(result).toEqual(['x', 'y'])
    })
  })
})

describe('JSON Schema Visibility', () => {
  it('should NOT expose Grist encoding patterns in JSON Schema', () => {
    const jsonSchema = z.toJSONSchema(CellValueInputSchema)
    const schemaString = JSON.stringify(jsonSchema)

    // Should NOT contain encoding literals
    expect(schemaString).not.toContain('"const":"L"')
    expect(schemaString).not.toContain('"const":"d"')
    expect(schemaString).not.toContain('"const":"D"')
  })

  it('should show natural types in JSON Schema', () => {
    const jsonSchema = z.toJSONSchema(CellValueInputSchema)
    const schemaString = JSON.stringify(jsonSchema)

    // Should have basic types
    expect(schemaString).toContain('"type":"string"')
    expect(schemaString).toContain('"type":"number"')
    expect(schemaString).toContain('"type":"boolean"')
    expect(schemaString).toContain('"type":"array"')
    expect(schemaString).toContain('null')
  })
})

describe('Round-trip correctness', () => {
  it('should round-trip Date values correctly', () => {
    const original = '2024-06-15'
    const encoded = encodeForApi(original, 'Date')
    const decoded = decodeFromApi(encoded, 'Date')
    expect(decoded).toBe(original)
  })

  it('should round-trip DateTime values correctly', () => {
    const original = '2024-06-15T14:30:00.000Z'
    const encoded = encodeForApi(original, 'DateTime:UTC')
    const decoded = decodeFromApi(encoded, 'DateTime:UTC')
    expect(decoded).toBe(original)
  })

  it('should round-trip ChoiceList values correctly', () => {
    const original = ['Red', 'Green', 'Blue']
    const encoded = encodeForApi(original, 'ChoiceList')
    const decoded = decodeFromApi(encoded, 'ChoiceList')
    expect(decoded).toEqual(original)
  })

  it('should round-trip RefList values correctly', () => {
    const original = [1, 2, 3]
    const encoded = encodeForApi(original, 'RefList:Items')
    const decoded = decodeFromApi(encoded, 'RefList:Items')
    expect(decoded).toEqual(original)
  })
})
