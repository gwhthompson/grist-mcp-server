import { describe, expect, it } from 'vitest'
import {
  extractField,
  extractFields,
  extractFieldWithDefault,
  extractNullableNumber,
  extractNumber,
  extractString,
  hasField
} from '../../../src/utils/grist-field-extractor.js'

describe('extractFields', () => {
  it('returns fields from nested structure', () => {
    const record = { fields: { id: 1, name: 'test' } }
    const result = extractFields(record)
    expect(result).toEqual({ id: 1, name: 'test' })
  })

  it('returns record directly for flat structure', () => {
    const record = { id: 1, name: 'test' }
    const result = extractFields(record)
    expect(result).toEqual({ id: 1, name: 'test' })
  })

  it('handles empty record', () => {
    const result = extractFields({})
    expect(result).toEqual({})
  })

  it('handles empty nested fields', () => {
    const record = { fields: {} }
    const result = extractFields(record)
    expect(result).toEqual({})
  })
})

describe('extractField', () => {
  it('extracts field from flat record', () => {
    const record = { id: 42, name: 'test' }
    expect(extractField(record, 'id')).toBe(42)
    expect(extractField(record, 'name')).toBe('test')
  })

  it('extracts field from nested record', () => {
    const record = { fields: { id: 42, name: 'test' } }
    expect(extractField(record, 'id')).toBe(42)
    expect(extractField(record, 'name')).toBe('test')
  })

  it('returns undefined for missing field', () => {
    const record = { id: 1 }
    expect(extractField(record, 'missing')).toBeUndefined()
  })

  it('handles null field value', () => {
    const record = { value: null }
    expect(extractField(record, 'value')).toBeNull()
  })
})

describe('extractFieldWithDefault', () => {
  it('returns field value when present', () => {
    const record = { count: 10 }
    expect(extractFieldWithDefault(record, 'count', 0)).toBe(10)
  })

  it('returns default value when field is missing', () => {
    const record = {}
    expect(extractFieldWithDefault(record, 'count', 42)).toBe(42)
  })

  it('returns field value even if falsy (but not undefined)', () => {
    expect(extractFieldWithDefault({ value: 0 }, 'value', 100)).toBe(0)
    expect(extractFieldWithDefault({ value: '' }, 'value', 'default')).toBe('')
    expect(extractFieldWithDefault({ value: false }, 'value', true)).toBe(false)
    expect(extractFieldWithDefault({ value: null }, 'value', 'default')).toBeNull()
  })
})

describe('hasField', () => {
  it('returns true for existing field in flat record', () => {
    const record = { id: 1, name: 'test' }
    expect(hasField(record, 'id')).toBe(true)
    expect(hasField(record, 'name')).toBe(true)
  })

  it('returns true for existing field in nested record', () => {
    const record = { fields: { id: 1 } }
    expect(hasField(record, 'id')).toBe(true)
  })

  it('returns false for missing field', () => {
    const record = { id: 1 }
    expect(hasField(record, 'missing')).toBe(false)
  })

  it('returns true for field with undefined value', () => {
    const record = { value: undefined }
    expect(hasField(record, 'value')).toBe(true)
  })

  it('returns true for field with null value', () => {
    const record = { value: null }
    expect(hasField(record, 'value')).toBe(true)
  })
})

describe('extractString', () => {
  it('extracts string field', () => {
    const record = { name: 'hello' }
    expect(extractString(record, 'name')).toBe('hello')
  })

  it('returns empty string for missing field', () => {
    const record = {}
    expect(extractString(record, 'name')).toBe('')
  })

  it('returns empty string for non-string field', () => {
    expect(extractString({ value: 123 }, 'value')).toBe('')
    expect(extractString({ value: true }, 'value')).toBe('')
    expect(extractString({ value: null }, 'value')).toBe('')
    expect(extractString({ value: {} }, 'value')).toBe('')
  })

  it('handles nested fields', () => {
    const record = { fields: { name: 'nested' } }
    expect(extractString(record, 'name')).toBe('nested')
  })
})

describe('extractNumber', () => {
  it('extracts number field', () => {
    const record = { count: 42 }
    expect(extractNumber(record, 'count')).toBe(42)
  })

  it('handles float numbers', () => {
    const record = { value: 3.14 }
    expect(extractNumber(record, 'value')).toBe(3.14)
  })

  it('returns 0 for missing field', () => {
    const record = {}
    expect(extractNumber(record, 'count')).toBe(0)
  })

  it('returns 0 for non-number field', () => {
    expect(extractNumber({ value: 'string' }, 'value')).toBe(0)
    expect(extractNumber({ value: true }, 'value')).toBe(0)
    expect(extractNumber({ value: null }, 'value')).toBe(0)
    expect(extractNumber({ value: {} }, 'value')).toBe(0)
  })

  it('handles nested fields', () => {
    const record = { fields: { count: 100 } }
    expect(extractNumber(record, 'count')).toBe(100)
  })
})

describe('extractNullableNumber', () => {
  it('extracts number field', () => {
    const record = { refId: 5 }
    expect(extractNullableNumber(record, 'refId')).toBe(5)
  })

  it('returns null for null field value', () => {
    const record = { refId: null }
    expect(extractNullableNumber(record, 'refId')).toBeNull()
  })

  it('returns 0 for missing field', () => {
    const record = {}
    expect(extractNullableNumber(record, 'refId')).toBe(0)
  })

  it('returns 0 for non-number field', () => {
    expect(extractNullableNumber({ value: 'string' }, 'value')).toBe(0)
    expect(extractNullableNumber({ value: true }, 'value')).toBe(0)
    expect(extractNullableNumber({ value: {} }, 'value')).toBe(0)
  })

  it('handles nested fields', () => {
    const record = { fields: { refId: null } }
    expect(extractNullableNumber(record, 'refId')).toBeNull()
  })
})
