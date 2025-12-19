/**
 * Unit tests for widget-options.ts schema helpers
 *
 * Tests utility functions:
 * - getWidgetOptionsSchema: Returns correct schema for column type
 * - parseWidgetOptions: Parses widget options from string/object
 * - stringifyWidgetOptions: Serializes options to JSON string
 * - validateWidgetOptions: Validates options against schema
 */

import { describe, expect, it } from 'vitest'
import {
  AttachmentsWidgetOptionsSchema,
  BoolWidgetOptionsSchema,
  ChoiceWidgetOptionsSchema,
  DateTimeWidgetOptionsSchema,
  DateWidgetOptionsSchema,
  getWidgetOptionsSchema,
  NumericWidgetOptionsSchema,
  parseWidgetOptions,
  RefWidgetOptionsSchema,
  stringifyWidgetOptions,
  TextWidgetOptionsSchema,
  validateWidgetOptions
} from '../../../src/schemas/widget-options.js'

describe('widget-options schema helpers', () => {
  describe('getWidgetOptionsSchema', () => {
    it('returns TextWidgetOptionsSchema for Text', () => {
      const schema = getWidgetOptionsSchema('Text')
      expect(schema).toBe(TextWidgetOptionsSchema)
    })

    it('returns NumericWidgetOptionsSchema for Numeric', () => {
      const schema = getWidgetOptionsSchema('Numeric')
      expect(schema).toBe(NumericWidgetOptionsSchema)
    })

    it('returns NumericWidgetOptionsSchema for Int', () => {
      const schema = getWidgetOptionsSchema('Int')
      expect(schema).toBe(NumericWidgetOptionsSchema)
    })

    it('returns BoolWidgetOptionsSchema for Bool', () => {
      const schema = getWidgetOptionsSchema('Bool')
      expect(schema).toBe(BoolWidgetOptionsSchema)
    })

    it('returns DateWidgetOptionsSchema for Date', () => {
      const schema = getWidgetOptionsSchema('Date')
      expect(schema).toBe(DateWidgetOptionsSchema)
    })

    it('returns DateTimeWidgetOptionsSchema for DateTime', () => {
      const schema = getWidgetOptionsSchema('DateTime')
      expect(schema).toBe(DateTimeWidgetOptionsSchema)
    })

    it('returns ChoiceWidgetOptionsSchema for Choice', () => {
      const schema = getWidgetOptionsSchema('Choice')
      expect(schema).toBe(ChoiceWidgetOptionsSchema)
    })

    it('returns ChoiceWidgetOptionsSchema for ChoiceList', () => {
      const schema = getWidgetOptionsSchema('ChoiceList')
      expect(schema).toBe(ChoiceWidgetOptionsSchema)
    })

    it('returns RefWidgetOptionsSchema for Ref', () => {
      const schema = getWidgetOptionsSchema('Ref')
      expect(schema).toBe(RefWidgetOptionsSchema)
    })

    it('returns RefWidgetOptionsSchema for RefList', () => {
      const schema = getWidgetOptionsSchema('RefList')
      expect(schema).toBe(RefWidgetOptionsSchema)
    })

    it('returns AttachmentsWidgetOptionsSchema for Attachments', () => {
      const schema = getWidgetOptionsSchema('Attachments')
      expect(schema).toBe(AttachmentsWidgetOptionsSchema)
    })

    it('returns looseObject for unknown column types', () => {
      const schema = getWidgetOptionsSchema('UnknownType')
      // Should be a loose object that accepts anything
      const result = schema.safeParse({ anyProp: 'value' })
      expect(result.success).toBe(true)
    })

    it('extracts base type from Ref:TableName format', () => {
      const schema = getWidgetOptionsSchema('Ref:People')
      expect(schema).toBe(RefWidgetOptionsSchema)
    })

    it('extracts base type from RefList:TableName format', () => {
      const schema = getWidgetOptionsSchema('RefList:Tags')
      expect(schema).toBe(RefWidgetOptionsSchema)
    })
  })

  describe('parseWidgetOptions', () => {
    it('returns null for empty string', () => {
      const result = parseWidgetOptions('')
      expect(result).toBeNull()
    })

    it('returns null for null input', () => {
      const result = parseWidgetOptions(null)
      expect(result).toBeNull()
    })

    it('returns null for undefined input', () => {
      const result = parseWidgetOptions(undefined)
      expect(result).toBeNull()
    })

    it('parses valid JSON string', () => {
      const result = parseWidgetOptions('{"alignment": "left"}')
      expect(result).toEqual({ alignment: 'left' })
    })

    it('parses empty object JSON', () => {
      const result = parseWidgetOptions('{}')
      expect(result).toEqual({})
    })

    it('returns null for invalid JSON string', () => {
      const result = parseWidgetOptions('not valid json')
      expect(result).toBeNull()
    })

    it('returns null for malformed JSON', () => {
      const result = parseWidgetOptions('{invalid: json}')
      expect(result).toBeNull()
    })

    it('validates against schema when columnType provided', () => {
      const result = parseWidgetOptions('{"alignment": "left"}', 'Text')
      expect(result).toEqual({ alignment: 'left' })
    })

    it('returns null when validation fails', () => {
      // Invalid alignment value
      const result = parseWidgetOptions('{"alignment": "invalid"}', 'Text')
      expect(result).toBeNull()
    })

    it('handles Python-style dict strings', () => {
      // Python uses single quotes, this should be converted
      const result = parseWidgetOptions("{'alignment': 'left'}")
      expect(result).toEqual({ alignment: 'left' })
    })

    it('returns preprocessed object when no columnType', () => {
      const result = parseWidgetOptions('{"custom": "value"}')
      expect(result).toEqual({ custom: 'value' })
    })
  })

  describe('stringifyWidgetOptions', () => {
    it('returns {} for null input', () => {
      const result = stringifyWidgetOptions(null)
      expect(result).toBe('{}')
    })

    it('returns {} for undefined input', () => {
      const result = stringifyWidgetOptions(undefined)
      expect(result).toBe('{}')
    })

    it('returns {} for empty object', () => {
      const result = stringifyWidgetOptions({})
      expect(result).toBe('{}')
    })

    it('serializes options to JSON', () => {
      const result = stringifyWidgetOptions({ alignment: 'left' })
      expect(result).toBe('{"alignment":"left"}')
    })

    it('filters out undefined values', () => {
      const result = stringifyWidgetOptions({
        alignment: 'left',
        wrap: undefined
      } as { alignment: 'left'; wrap?: boolean })
      expect(result).toBe('{"alignment":"left"}')
    })

    it('preserves null values', () => {
      const result = stringifyWidgetOptions({
        alignment: 'left',
        numSign: null
      } as { alignment: 'left'; numSign: null })
      expect(result).toBe('{"alignment":"left","numSign":null}')
    })

    it('handles complex nested options', () => {
      const result = stringifyWidgetOptions({
        alignment: 'center',
        decimals: 2,
        wrap: true
      } as { alignment: 'center'; decimals: number; wrap: boolean })
      const parsed = JSON.parse(result)
      expect(parsed.alignment).toBe('center')
      expect(parsed.decimals).toBe(2)
      expect(parsed.wrap).toBe(true)
    })
  })

  describe('validateWidgetOptions', () => {
    it('returns valid: true for valid Text options', () => {
      const result = validateWidgetOptions({ alignment: 'left' }, 'Text')
      expect(result.valid).toBe(true)
      expect(result.errors).toBeUndefined()
    })

    it('returns valid: true for valid Numeric options', () => {
      const result = validateWidgetOptions({ decimals: 2 }, 'Numeric')
      expect(result.valid).toBe(true)
    })

    it('returns valid: true for valid Date options', () => {
      const result = validateWidgetOptions({ dateFormat: 'YYYY-MM-DD' }, 'Date')
      expect(result.valid).toBe(true)
    })

    it('returns valid: false with errors for invalid alignment', () => {
      const result = validateWidgetOptions({ alignment: 'invalid' }, 'Text')
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors?.length).toBeGreaterThan(0)
    })

    it('returns valid: false with errors for out-of-range decimals', () => {
      const result = validateWidgetOptions({ decimals: 25 }, 'Numeric')
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('returns valid: true for empty options', () => {
      const result = validateWidgetOptions({}, 'Text')
      expect(result.valid).toBe(true)
    })

    it('returns valid: false for unknown properties (strict mode)', () => {
      const result = validateWidgetOptions({ unknownProp: true }, 'Text')
      expect(result.valid).toBe(false)
    })

    it('validates Ref type correctly', () => {
      const result = validateWidgetOptions({ alignment: 'center' }, 'Ref:People')
      expect(result.valid).toBe(true)
    })

    it('validates Int same as Numeric', () => {
      const result = validateWidgetOptions({ decimals: 2, numMode: 'decimal' }, 'Int')
      expect(result.valid).toBe(true)
    })

    it('includes path in error messages', () => {
      const result = validateWidgetOptions({ decimals: 'not a number' }, 'Numeric')
      expect(result.valid).toBe(false)
      expect(result.errors?.some((e) => e.includes('decimals'))).toBe(true)
    })
  })
})
