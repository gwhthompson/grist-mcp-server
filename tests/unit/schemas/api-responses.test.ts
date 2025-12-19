import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  CellValueSchema,
  createPaginatedSchema,
  DocumentInfoSchema,
  decodeCellValue,
  decodeRecord,
  decodeRecords,
  isValidApiResponse,
  RecordSchema,
  safeValidate,
  validateApiResponse,
  WorkspaceInfoSchema
} from '../../../src/schemas/api-responses.js'

describe('decodeCellValue', () => {
  it('returns primitive values unchanged', () => {
    expect(decodeCellValue('hello')).toBe('hello')
    expect(decodeCellValue(42)).toBe(42)
    expect(decodeCellValue(true)).toBe(true)
    expect(decodeCellValue(null)).toBeNull()
    expect(decodeCellValue(undefined)).toBeUndefined()
  })

  it('strips L marker from lists', () => {
    expect(decodeCellValue(['L', 'a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    expect(decodeCellValue(['L', 1, 2, 3])).toEqual([1, 2, 3])
    expect(decodeCellValue(['L'])).toEqual([])
  })

  it('handles legacy lowercase l lookup format', () => {
    expect(decodeCellValue(['l', [1, 2, 3]])).toEqual([1, 2, 3])
    expect(decodeCellValue(['l', 5])).toEqual([5])
  })

  it('handles r reference list format', () => {
    expect(decodeCellValue(['r', 'Table1', [1, 2, 3]])).toEqual([1, 2, 3])
  })

  it('handles R single reference format', () => {
    expect(decodeCellValue(['R', 'Table1', 5])).toBe(5)
  })

  it('handles O object/dict format', () => {
    const obj = { key: 'value' }
    expect(decodeCellValue(['O', obj])).toEqual(obj)
  })

  it('returns arrays without markers unchanged', () => {
    expect(decodeCellValue([1, 2, 3])).toEqual([1, 2, 3])
    expect(decodeCellValue(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('handles empty arrays', () => {
    expect(decodeCellValue([])).toEqual([])
  })

  it('handles known codes without warning', () => {
    // Known codes that don't transform should pass through
    expect(decodeCellValue(['D', '2023-01-01'])).toEqual(['D', '2023-01-01'])
    expect(decodeCellValue(['E', 'error message'])).toEqual(['E', 'error message'])
  })
})

describe('decodeRecord', () => {
  it('decodes record fields', () => {
    const record = {
      id: 1,
      fields: {
        name: 'test',
        tags: ['L', 'a', 'b']
      }
    }

    const result = decodeRecord(record)

    expect(result.id).toBe(1)
    expect(result.fields.name).toBe('test')
    expect(result.fields.tags).toEqual(['a', 'b'])
  })

  it('preserves errors if present', () => {
    const record = {
      id: 1,
      fields: { name: 'test' },
      errors: { formula: 'NameError' }
    }

    const result = decodeRecord(record)

    expect(result.errors).toEqual({ formula: 'NameError' })
  })

  it('excludes errors if not present', () => {
    const record = {
      id: 1,
      fields: { name: 'test' }
    }

    const result = decodeRecord(record)

    expect(result).not.toHaveProperty('errors')
  })
})

describe('decodeRecords', () => {
  it('decodes multiple records', () => {
    const records = [
      { id: 1, fields: { tags: ['L', 'a'] } },
      { id: 2, fields: { tags: ['L', 'b'] } }
    ]

    const result = decodeRecords(records)

    expect(result).toHaveLength(2)
    expect(result[0].fields.tags).toEqual(['a'])
    expect(result[1].fields.tags).toEqual(['b'])
  })

  it('handles empty array', () => {
    expect(decodeRecords([])).toEqual([])
  })
})

describe('createPaginatedSchema', () => {
  it('creates schema with items and pagination', () => {
    const ItemSchema = z.object({ id: z.number() })
    const PaginatedSchema = createPaginatedSchema(z.array(ItemSchema))

    const data = {
      items: [{ id: 1 }, { id: 2 }],
      pagination: {
        total: 10,
        offset: 0,
        limit: 2,
        has_more: true,
        next_offset: 2
      }
    }

    expect(PaginatedSchema.parse(data)).toEqual(data)
  })

  it('rejects invalid pagination', () => {
    const ItemSchema = z.object({ id: z.number() })
    const PaginatedSchema = createPaginatedSchema(z.array(ItemSchema))

    const data = {
      items: [],
      pagination: {
        total: 'invalid'
      }
    }

    expect(PaginatedSchema.safeParse(data).success).toBe(false)
  })
})

describe('validateApiResponse', () => {
  it('returns valid data unchanged', () => {
    const schema = z.object({ id: z.number() })
    const data = { id: 42 }

    const result = validateApiResponse(schema, data)

    expect(result).toEqual(data)
  })

  it('throws descriptive error for invalid data', () => {
    const schema = z.object({ id: z.number() })
    const data = { id: 'not a number' }

    expect(() => validateApiResponse(schema, data)).toThrow('API Response Validation Failed')
  })

  it('includes context in error message', () => {
    const schema = z.object({ id: z.number() })
    const data = { id: 'invalid' }

    expect(() => validateApiResponse(schema, data, 'Testing context')).toThrow(
      'Context: Testing context'
    )
  })

  it('rethrows non-Zod errors', () => {
    const schema = z.object({ id: z.number() }).transform(() => {
      throw new Error('Custom error')
    })

    expect(() => validateApiResponse(schema, { id: 1 })).toThrow('Custom error')
  })
})

describe('safeValidate', () => {
  it('returns success with data for valid input', () => {
    const schema = z.object({ name: z.string() })
    const data = { name: 'test' }

    const result = safeValidate(schema, data)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(data)
    }
  })

  it('returns failure with error for invalid input', () => {
    const schema = z.object({ name: z.string() })
    const data = { name: 123 }

    const result = safeValidate(schema, data)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(z.ZodError)
    }
  })
})

describe('isValidApiResponse', () => {
  it('returns true for valid data', () => {
    const schema = z.object({ id: z.number() })
    const data = { id: 1 }

    expect(isValidApiResponse(schema, data)).toBe(true)
  })

  it('returns false for invalid data', () => {
    const schema = z.object({ id: z.number() })
    const data = { id: 'invalid' }

    expect(isValidApiResponse(schema, data)).toBe(false)
  })
})

describe('Schema validations', () => {
  describe('WorkspaceInfoSchema', () => {
    it('validates complete workspace info', () => {
      const data = {
        id: 1,
        name: 'Test Workspace',
        org: 'test-org',
        access: 'owner'
      }

      expect(WorkspaceInfoSchema.parse(data)).toEqual(data)
    })

    it('validates workspace with optional fields', () => {
      const data = {
        id: 1,
        name: 'Test',
        org: 'test',
        access: 'viewer',
        orgDomain: 'test.getgrist.com',
        createdAt: '2023-01-01T00:00:00Z'
      }

      const result = WorkspaceInfoSchema.parse(data)
      expect(result.orgDomain).toBe('test.getgrist.com')
    })
  })

  describe('DocumentInfoSchema', () => {
    it('validates document info', () => {
      const data = {
        id: 'abc123',
        name: 'Test Doc',
        access: 'editor'
      }

      expect(DocumentInfoSchema.parse(data)).toEqual(data)
    })

    it('validates document with workspace', () => {
      const data = {
        id: 'abc123',
        name: 'Test Doc',
        access: 'owner',
        workspace: { id: 1, name: 'Workspace' }
      }

      const result = DocumentInfoSchema.parse(data)
      expect(result.workspace).toEqual({ id: 1, name: 'Workspace' })
    })
  })

  describe('RecordSchema', () => {
    it('validates record with fields', () => {
      const data = {
        id: 1,
        fields: {
          name: 'test',
          count: 42
        }
      }

      expect(RecordSchema.parse(data)).toEqual(data)
    })

    it('validates record with errors', () => {
      const data = {
        id: 1,
        fields: { value: 10 },
        errors: { formula: 'ZeroDivisionError' }
      }

      const result = RecordSchema.parse(data)
      expect(result.errors).toEqual({ formula: 'ZeroDivisionError' })
    })
  })

  describe('CellValueSchema', () => {
    it('validates null', () => {
      expect(CellValueSchema.parse(null)).toBeNull()
    })

    it('validates string', () => {
      expect(CellValueSchema.parse('hello')).toBe('hello')
    })

    it('validates number', () => {
      expect(CellValueSchema.parse(42)).toBe(42)
    })

    it('validates boolean', () => {
      expect(CellValueSchema.parse(true)).toBe(true)
    })

    it('validates array of strings', () => {
      expect(CellValueSchema.parse(['a', 'b'])).toEqual(['a', 'b'])
    })

    it('validates array of numbers', () => {
      expect(CellValueSchema.parse([1, 2, 3])).toEqual([1, 2, 3])
    })
  })
})
