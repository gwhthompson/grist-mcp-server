import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { jsonSafeArray, parseJsonString } from '../../../src/schemas/common.js'

describe('parseJsonString', () => {
  it('parses valid JSON string to object', () => {
    expect(parseJsonString('{"key": "value"}')).toEqual({ key: 'value' })
  })

  it('parses valid JSON string to array', () => {
    expect(parseJsonString('[1, 2, 3]')).toEqual([1, 2, 3])
  })

  it('returns non-string values unchanged', () => {
    expect(parseJsonString({ key: 'value' })).toEqual({ key: 'value' })
    expect(parseJsonString([1, 2, 3])).toEqual([1, 2, 3])
    expect(parseJsonString(123)).toBe(123)
    expect(parseJsonString(null)).toBe(null)
  })

  it('returns invalid JSON strings unchanged', () => {
    expect(parseJsonString('not json')).toBe('not json')
    expect(parseJsonString('{invalid}')).toBe('{invalid}')
  })
})

describe('jsonSafeArray', () => {
  const ElementSchema = z.object({
    action: z.string(),
    value: z.number()
  })
  const TestArraySchema = jsonSafeArray(ElementSchema, { min: 1, max: 3 })

  describe('native array input', () => {
    it('accepts native array with objects', () => {
      const input = [
        { action: 'add', value: 1 },
        { action: 'update', value: 2 }
      ]
      expect(TestArraySchema.parse(input)).toEqual(input)
    })

    it('enforces min constraint', () => {
      expect(() => TestArraySchema.parse([])).toThrow()
    })

    it('enforces max constraint', () => {
      const input = Array(4).fill({ action: 'test', value: 1 })
      expect(() => TestArraySchema.parse(input)).toThrow()
    })
  })

  describe('JSON string array input (array-level preprocessing)', () => {
    it('parses JSON string to array', () => {
      const input = '[{"action":"add","value":1}]'
      expect(TestArraySchema.parse(input)).toEqual([{ action: 'add', value: 1 }])
    })

    it('parses JSON string with multiple elements', () => {
      const input = '[{"action":"add","value":1},{"action":"update","value":2}]'
      expect(TestArraySchema.parse(input)).toEqual([
        { action: 'add', value: 1 },
        { action: 'update', value: 2 }
      ])
    })

    it('enforces constraints on parsed array', () => {
      // Empty array
      expect(() => TestArraySchema.parse('[]')).toThrow()
      // Too many elements
      const tooMany = JSON.stringify(Array(4).fill({ action: 'test', value: 1 }))
      expect(() => TestArraySchema.parse(tooMany)).toThrow()
    })
  })

  describe('stringified elements input (element-level preprocessing)', () => {
    it('parses array with stringified object elements', () => {
      const input = ['{"action":"add","value":1}', '{"action":"update","value":2}']
      expect(TestArraySchema.parse(input)).toEqual([
        { action: 'add', value: 1 },
        { action: 'update', value: 2 }
      ])
    })

    it('handles mixed native and stringified elements', () => {
      const input = [{ action: 'add', value: 1 }, '{"action":"update","value":2}']
      expect(TestArraySchema.parse(input)).toEqual([
        { action: 'add', value: 1 },
        { action: 'update', value: 2 }
      ])
    })
  })

  describe('double-stringified input (both levels)', () => {
    it('parses JSON string containing stringified elements', () => {
      // This is what happens when MCP clients double-serialize
      const inner = ['{"action":"add","value":1}', '{"action":"update","value":2}']
      const input = JSON.stringify(inner)
      expect(TestArraySchema.parse(input)).toEqual([
        { action: 'add', value: 1 },
        { action: 'update', value: 2 }
      ])
    })
  })

  describe('error cases', () => {
    it('rejects non-array non-string values', () => {
      expect(() => TestArraySchema.parse(123)).toThrow()
      expect(() => TestArraySchema.parse({ key: 'value' })).toThrow()
      expect(() => TestArraySchema.parse(null)).toThrow()
    })

    it('rejects invalid JSON strings', () => {
      expect(() => TestArraySchema.parse('not json')).toThrow()
      expect(() => TestArraySchema.parse('{invalid}')).toThrow()
    })

    it('rejects arrays with invalid elements', () => {
      const input = [{ action: 'add', value: 'not a number' }]
      expect(() => TestArraySchema.parse(input)).toThrow()
    })
  })

  describe('options', () => {
    it('respects description option', () => {
      const schema = jsonSafeArray(ElementSchema, { description: 'Test description' })
      // The description is applied to the inner array schema
      expect(schema).toBeDefined()
    })

    it('works without options', () => {
      const schema = jsonSafeArray(ElementSchema)
      expect(schema.parse([{ action: 'test', value: 1 }])).toEqual([{ action: 'test', value: 1 }])
    })
  })
})

describe('jsonSafeArray with discriminatedUnion', () => {
  const AddSchema = z.object({ action: z.literal('add'), tableId: z.string() })
  const UpdateSchema = z.object({ action: z.literal('update'), rowId: z.number() })
  const OperationSchema = z.discriminatedUnion('action', [AddSchema, UpdateSchema])
  const OperationsSchema = jsonSafeArray(OperationSchema, { min: 1, max: 10 })

  it('parses native discriminatedUnion array', () => {
    const input = [
      { action: 'add', tableId: 'Table1' },
      { action: 'update', rowId: 123 }
    ]
    expect(OperationsSchema.parse(input)).toEqual(input)
  })

  it('parses JSON string discriminatedUnion array', () => {
    const input = '[{"action":"add","tableId":"Table1"},{"action":"update","rowId":123}]'
    expect(OperationsSchema.parse(input)).toEqual([
      { action: 'add', tableId: 'Table1' },
      { action: 'update', rowId: 123 }
    ])
  })

  it('parses stringified elements in discriminatedUnion array', () => {
    const input = ['{"action":"add","tableId":"Table1"}', '{"action":"update","rowId":123}']
    expect(OperationsSchema.parse(input)).toEqual([
      { action: 'add', tableId: 'Table1' },
      { action: 'update', rowId: 123 }
    ])
  })

  it('rejects invalid discriminator value', () => {
    const input = [{ action: 'invalid', tableId: 'Table1' }]
    expect(() => OperationsSchema.parse(input)).toThrow()
  })
})
