import { describe, expect, it } from 'vitest'
import { cleanAndValidateSchema } from '../../../src/schemas/schema-utils.js'

// Helper to create a base schema object
const baseSchema = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'object',
  ...overrides
})

describe('cleanAndValidateSchema', () => {
  describe('id field removal', () => {
    it('removes id field from root schema', () => {
      const schema = baseSchema({ id: 'mySchema' })
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.id).toBeUndefined()
    })

    it('removes id field from nested properties', () => {
      const schema = baseSchema({
        properties: {
          name: { type: 'string', id: 'nameField' }
        }
      })
      const result = cleanAndValidateSchema(schema, 'test')
      expect((result.properties as Record<string, unknown>).name).not.toHaveProperty('id')
    })
  })

  describe('type removal when const is present', () => {
    it('removes type when const is present at root level', () => {
      const schema = { const: 'fixed-value', type: 'string' }
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.const).toBe('fixed-value')
      expect(result.type).toBeUndefined()
    })

    it('removes type when const is present in nested property', () => {
      const schema = baseSchema({
        properties: {
          status: { const: 'active', type: 'string' }
        }
      })
      const result = cleanAndValidateSchema(schema, 'test')
      const status = (result.properties as Record<string, Record<string, unknown>>).status
      expect(status.const).toBe('active')
      expect(status.type).toBeUndefined()
    })

    it('keeps type when const is not present', () => {
      const schema = baseSchema({ type: 'string' })
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.type).toBe('string')
    })

    it('handles const with null value (type removed)', () => {
      const schema = { const: null, type: 'null' }
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.const).toBeNull()
      expect(result.type).toBeUndefined()
    })
  })

  describe('minLength/maxLength removal when pattern enforces exact length', () => {
    it('removes minLength/maxLength when they match and pattern exists', () => {
      const schema = {
        type: 'string',
        pattern: '^[a-z]{5}$',
        minLength: 5,
        maxLength: 5
      }
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.pattern).toBe('^[a-z]{5}$')
      expect(result.minLength).toBeUndefined()
      expect(result.maxLength).toBeUndefined()
    })

    it('keeps minLength/maxLength when they differ', () => {
      const schema = {
        type: 'string',
        pattern: '^[a-z]+$',
        minLength: 1,
        maxLength: 10
      }
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.minLength).toBe(1)
      expect(result.maxLength).toBe(10)
    })

    it('keeps minLength/maxLength when pattern is absent', () => {
      const schema = {
        type: 'string',
        minLength: 5,
        maxLength: 5
      }
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.minLength).toBe(5)
      expect(result.maxLength).toBe(5)
    })

    it('handles zero-length pattern with matching bounds', () => {
      const schema = {
        type: 'string',
        pattern: '^$',
        minLength: 0,
        maxLength: 0
      }
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.minLength).toBeUndefined()
      expect(result.maxLength).toBeUndefined()
    })
  })

  describe('pattern removal when format is uuid', () => {
    it('removes pattern when format is uuid', () => {
      const schema = {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      }
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.format).toBe('uuid')
      expect(result.pattern).toBeUndefined()
    })

    it('keeps pattern when format is not uuid', () => {
      const schema = {
        type: 'string',
        format: 'email',
        pattern: '^[a-z]+@[a-z]+\\.[a-z]+$'
      }
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.pattern).toBeDefined()
    })

    it('keeps pattern when no format is present', () => {
      const schema = {
        type: 'string',
        pattern: '^test-.*$'
      }
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.pattern).toBe('^test-.*$')
    })
  })

  describe('empty required array removal', () => {
    it('removes empty required array', () => {
      const schema = baseSchema({ required: [] })
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.required).toBeUndefined()
    })

    it('keeps non-empty required array', () => {
      const schema = baseSchema({ required: ['name', 'email'] })
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.required).toEqual(['name', 'email'])
    })

    it('removes empty required in nested objects', () => {
      const schema = baseSchema({
        properties: {
          nested: { type: 'object', required: [] }
        }
      })
      const result = cleanAndValidateSchema(schema, 'test')
      const nested = (result.properties as Record<string, Record<string, unknown>>).nested
      expect(nested.required).toBeUndefined()
    })
  })

  describe('additionalProperties: false removal', () => {
    it('removes additionalProperties: false', () => {
      const schema = baseSchema({ additionalProperties: false })
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.additionalProperties).toBeUndefined()
    })

    it('keeps additionalProperties when true', () => {
      const schema = baseSchema({ additionalProperties: true })
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.additionalProperties).toBe(true)
    })

    it('keeps additionalProperties when it is a schema object', () => {
      const schema = baseSchema({ additionalProperties: { type: 'string' } })
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.additionalProperties).toEqual({ type: 'string' })
    })
  })

  describe('recursive cleaning', () => {
    it('cleans nested properties recursively', () => {
      const schema = baseSchema({
        properties: {
          outer: {
            type: 'object',
            id: 'outerProp',
            additionalProperties: false,
            properties: {
              inner: {
                type: 'string',
                id: 'innerProp',
                required: []
              }
            }
          }
        }
      })
      const result = cleanAndValidateSchema(schema, 'test')
      const outer = (result.properties as Record<string, Record<string, unknown>>).outer
      const inner = (outer.properties as Record<string, Record<string, unknown>>).inner
      expect(outer.id).toBeUndefined()
      expect(outer.additionalProperties).toBeUndefined()
      expect(inner.id).toBeUndefined()
      expect(inner.required).toBeUndefined()
    })

    it('cleans array items schema', () => {
      const schema = baseSchema({
        items: {
          type: 'object',
          id: 'itemSchema',
          additionalProperties: false,
          required: []
        }
      })
      const result = cleanAndValidateSchema(schema, 'test')
      const items = result.items as Record<string, unknown>
      expect(items.id).toBeUndefined()
      expect(items.additionalProperties).toBeUndefined()
      expect(items.required).toBeUndefined()
    })

    it('cleans anyOf schemas', () => {
      const schema = baseSchema({
        anyOf: [
          { type: 'string', id: 'stringType' },
          { type: 'number', id: 'numberType', additionalProperties: false }
        ]
      })
      const result = cleanAndValidateSchema(schema, 'test')
      const anyOf = result.anyOf as Record<string, unknown>[]
      expect(anyOf[0].id).toBeUndefined()
      expect(anyOf[1].id).toBeUndefined()
      expect(anyOf[1].additionalProperties).toBeUndefined()
    })

    it('cleans oneOf schemas', () => {
      const schema = baseSchema({
        oneOf: [
          { const: 'A', type: 'string' },
          { const: 'B', type: 'string' }
        ]
      })
      const result = cleanAndValidateSchema(schema, 'test')
      const oneOf = result.oneOf as Record<string, unknown>[]
      expect(oneOf[0].type).toBeUndefined()
      expect(oneOf[1].type).toBeUndefined()
    })

    it('cleans allOf schemas', () => {
      const schema = baseSchema({
        allOf: [
          { id: 'base', type: 'object' },
          { id: 'extension', required: [] }
        ]
      })
      const result = cleanAndValidateSchema(schema, 'test')
      const allOf = result.allOf as Record<string, unknown>[]
      expect(allOf[0].id).toBeUndefined()
      expect(allOf[1].id).toBeUndefined()
      expect(allOf[1].required).toBeUndefined()
    })
  })

  describe('$defs handling', () => {
    it('cleans schemas inside $defs', () => {
      const schema = baseSchema({
        $defs: {
          PersonSchema: {
            type: 'object',
            id: 'person',
            additionalProperties: false,
            required: []
          }
        }
      })
      const result = cleanAndValidateSchema(schema, 'test')
      const defs = result.$defs as Record<string, Record<string, unknown>>
      expect(defs.PersonSchema.id).toBeUndefined()
      expect(defs.PersonSchema.additionalProperties).toBeUndefined()
      expect(defs.PersonSchema.required).toBeUndefined()
    })

    it('throws error for unnamed schemas (__schema prefix)', () => {
      const schema = baseSchema({
        $defs: {
          __schema0: { type: 'object' }
        }
      })
      expect(() => cleanAndValidateSchema(schema, 'grist_help inputSchema')).toThrow(
        'Unnamed schema "__schema0" in grist_help inputSchema'
      )
    })

    it('throws error for any __schema* pattern', () => {
      const schema = baseSchema({
        $defs: {
          __schema123: { type: 'string' }
        }
      })
      expect(() => cleanAndValidateSchema(schema, 'test context')).toThrow(
        'Unnamed schema "__schema123" in test context'
      )
    })

    it('accepts properly named schemas in $defs', () => {
      const schema = baseSchema({
        $defs: {
          ValidName: { type: 'string' },
          AnotherValid: { type: 'number' }
        }
      })
      expect(() => cleanAndValidateSchema(schema, 'test')).not.toThrow()
    })
  })

  describe('edge cases', () => {
    it('handles empty schema', () => {
      const schema = {}
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result).toEqual({})
    })

    it('handles schema with no cleanable fields', () => {
      const schema = {
        type: 'string',
        description: 'A simple string',
        minLength: 1,
        maxLength: 100
      }
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result).toEqual(schema)
    })

    it('handles deeply nested structure', () => {
      const schema = baseSchema({
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: {
                    type: 'string',
                    id: 'deepId',
                    additionalProperties: false
                  }
                }
              }
            }
          }
        }
      })
      const result = cleanAndValidateSchema(schema, 'test')
      const level1 = (result.properties as Record<string, Record<string, unknown>>).level1
      const level2 = (level1.properties as Record<string, Record<string, unknown>>).level2
      const level3 = (level2.properties as Record<string, Record<string, unknown>>).level3
      expect(level3.id).toBeUndefined()
      expect(level3.additionalProperties).toBeUndefined()
    })

    it('handles null values in properties gracefully', () => {
      const schema = baseSchema({
        properties: {
          nullProp: null
        }
      })
      // Should not throw
      expect(() => cleanAndValidateSchema(schema, 'test')).not.toThrow()
    })

    it('handles non-object items in anyOf gracefully', () => {
      const schema = baseSchema({
        anyOf: [null, { type: 'string' }]
      })
      expect(() => cleanAndValidateSchema(schema, 'test')).not.toThrow()
    })

    it('returns the same schema object (mutates in place)', () => {
      const schema = baseSchema({ id: 'test' })
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result).toBe(schema)
    })

    it('preserves other fields that should not be cleaned', () => {
      const schema = {
        type: 'object',
        title: 'My Schema',
        description: 'A test schema',
        $schema: 'http://json-schema.org/draft-07/schema#',
        examples: [{ name: 'test' }],
        default: {}
      }
      const result = cleanAndValidateSchema(schema, 'test')
      expect(result.title).toBe('My Schema')
      expect(result.description).toBe('A test schema')
      expect(result.$schema).toBe('http://json-schema.org/draft-07/schema#')
      expect(result.examples).toEqual([{ name: 'test' }])
      expect(result.default).toEqual({})
    })
  })

  describe('combined cleaning scenarios', () => {
    it('applies multiple cleaning rules to same schema', () => {
      const schema = {
        type: 'object',
        id: 'combinedSchema',
        additionalProperties: false,
        required: [],
        properties: {
          uuid: {
            type: 'string',
            format: 'uuid',
            pattern: '^[0-9a-f-]+$',
            id: 'uuidField'
          },
          fixed: {
            const: 'value',
            type: 'string'
          }
        }
      }
      const result = cleanAndValidateSchema(schema, 'test')

      expect(result.id).toBeUndefined()
      expect(result.additionalProperties).toBeUndefined()
      expect(result.required).toBeUndefined()

      const props = result.properties as Record<string, Record<string, unknown>>
      expect(props.uuid.id).toBeUndefined()
      expect(props.uuid.pattern).toBeUndefined()
      expect(props.uuid.format).toBe('uuid')

      expect(props.fixed.type).toBeUndefined()
      expect(props.fixed.const).toBe('value')
    })
  })
})
