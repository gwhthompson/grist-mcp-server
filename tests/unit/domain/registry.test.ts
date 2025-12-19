import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  getSchemaMetadata,
  gristRegistry,
  isSchemaRegistered,
  registerSchema
} from '../../../src/domain/registry.js'

describe('gristRegistry', () => {
  describe('registerSchema', () => {
    it('registers schema and returns it', () => {
      const TestSchema = z.object({ id: z.number() })
      const registered = registerSchema(TestSchema, {
        endpoint: '/test',
        userAction: 'TestAction',
        verifyFields: ['id']
      })

      expect(registered).toBe(TestSchema)
      expect(gristRegistry.has(TestSchema)).toBe(true)
    })

    it('allows displayName in metadata', () => {
      const NamedSchema = z.object({ name: z.string() })
      registerSchema(NamedSchema, {
        endpoint: '/named',
        userAction: 'AddNamed',
        verifyFields: ['name'],
        displayName: 'Named Entity'
      })

      const metadata = gristRegistry.get(NamedSchema)
      expect(metadata?.displayName).toBe('Named Entity')
    })
  })

  describe('getSchemaMetadata', () => {
    it('returns metadata for registered schema', () => {
      const MetaSchema = z.object({ value: z.string() })
      const expectedMetadata = {
        endpoint: '/docs/{docId}/meta',
        userAction: 'BulkAddMeta',
        verifyFields: ['value']
      }

      registerSchema(MetaSchema, expectedMetadata)
      const metadata = getSchemaMetadata(MetaSchema)

      expect(metadata.endpoint).toBe(expectedMetadata.endpoint)
      expect(metadata.userAction).toBe(expectedMetadata.userAction)
      expect(metadata.verifyFields).toEqual(expectedMetadata.verifyFields)
    })

    it('throws for unregistered schema', () => {
      const UnregisteredSchema = z.object({ unknown: z.boolean() })

      expect(() => getSchemaMetadata(UnregisteredSchema)).toThrow(
        'Schema not registered in gristRegistry'
      )
    })
  })

  describe('isSchemaRegistered', () => {
    it('returns true for registered schema', () => {
      const RegisteredSchema = z.object({ reg: z.number() })
      registerSchema(RegisteredSchema, {
        endpoint: '/reg',
        userAction: 'AddReg',
        verifyFields: []
      })

      expect(isSchemaRegistered(RegisteredSchema)).toBe(true)
    })

    it('returns false for unregistered schema', () => {
      const NotRegisteredSchema = z.object({ notreg: z.string() })

      expect(isSchemaRegistered(NotRegisteredSchema)).toBe(false)
    })
  })
})
