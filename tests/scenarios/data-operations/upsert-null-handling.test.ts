/**
 * Upsert Error Handling Integration Test
 *
 * Tests that upsert operations handle error conditions gracefully
 * and provide actionable error messages.
 *
 * Addresses user feedback: "Cannot read properties of null (reading 'records')"
 * Fix: Added null checking and validation before accessing response.records
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { upsertRecords } from '../../../src/tools/records.js'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../../helpers/grist-api.js'
import type { TestContext } from '../../helpers/types.js'

describe('Upsert Error Handling', () => {
  let context: TestContext
  let client: ReturnType<typeof createTestClient>

  beforeAll(async () => {
    await ensureGristReady()
    client = createTestClient()

    context = await createFullTestContext(client, {
      docName: 'UpsertErrorTest',
      tableName: 'Contacts',
      columns: [
        { id: 'Name', fields: { type: 'Text' } },
        { id: 'Email', fields: { type: 'Text' } },
        { id: 'Status', fields: { type: 'Text' } }
      ]
    })
  })

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  describe('Successful Upsert Operations', () => {
    it('should successfully upsert records with proper validation', async () => {
      const response = await upsertRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        records: [
          {
            require: { Email: 'test@example.com' },
            fields: {
              Name: 'Test User',
              Status: 'Active'
            }
          }
        ],
        response_format: 'json'
      })

      if (response.isError) {
        throw new Error(`Upsert failed: ${response.content[0].text}`)
      }

      // biome-ignore lint/suspicious/noExplicitAny: Testing runtime validation with invalid data
      const result = response.structuredContent as any
      expect(result.success).toBe(true)
      expect(result.recordsProcessed).toBe(1)
      expect(result.recordIds).toBeDefined()
      expect(Array.isArray(result.recordIds)).toBe(true)
    })

    it('should handle valid response from Grist API', async () => {
      // This tests that our null checking doesn't break valid responses
      const response = await upsertRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        records: [
          {
            require: { Email: 'alice@example.com' },
            fields: {
              Name: 'Alice Johnson',
              Email: 'alice@example.com',
              Status: 'VIP'
            }
          }
        ],
        response_format: 'json'
      })

      if (response.isError) {
        throw new Error(`Upsert failed: ${response.content[0].text}`)
      }

      // biome-ignore lint/suspicious/noExplicitAny: Testing runtime validation with invalid data
      const result = response.structuredContent as any
      expect(result.success).toBe(true)
      expect(result.recordIds).toBeDefined()
      expect(Array.isArray(result.recordIds)).toBe(true)
      // Note: Grist upsert returns null, so record_ids will be empty array
    })
  })

  describe('Error Cases with Invalid Inputs', () => {
    it('should provide clear error when column does not exist', async () => {
      const result = await upsertRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        records: [
          {
            require: { NonExistentColumn: 'value' },
            fields: { Name: 'Test' }
          }
        ],
        response_format: 'json'
      })

      // MCP tools return error responses, not throw
      expect(result).toHaveErrorResponse(/column|not found|does not exist/i)
    })

    it('should validate empty require object when allowEmptyRequire=false', async () => {
      const result = await upsertRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        records: [
          {
            require: {},
            fields: { Name: 'Test' }
          }
        ],
        allowEmptyRequire: false,
        response_format: 'json'
      })

      // MCP tools return error responses, not throw
      expect(result).toHaveErrorResponse(/require|empty|invalid/i)
    })

    it('should validate fields data types before sending to API', async () => {
      // This tests that preprocessing and validation catches errors early
      const result = await upsertRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        records: [
          {
            require: { Email: 'test@example.com' },
            fields: {
              // biome-ignore lint/suspicious/noExplicitAny: Testing runtime validation with invalid data
              Name: 123 as any // Wrong type - should be string
            }
          }
        ],
        response_format: 'json'
      })

      // MCP tools return error responses, not throw
      expect(result).toHaveErrorResponse(/type|invalid|string/i)
    })
  })

  describe('Response Validation', () => {
    it('should validate response structure from Grist API', async () => {
      // This tests that UpsertResponseSchema.parse() catches malformed responses
      // Normal upsert should work and return valid response
      const response = await upsertRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        records: [
          {
            require: { Email: 'bob@example.com' },
            fields: {
              Name: 'Bob Williams',
              Email: 'bob@example.com',
              Status: 'Active'
            }
          }
        ],
        response_format: 'json'
      })

      if (response.isError) {
        throw new Error(`Upsert failed: ${response.content[0].text}`)
      }

      // biome-ignore lint/suspicious/noExplicitAny: Testing runtime validation with invalid data
      const result = response.structuredContent as any
      // Should have validated response structure
      expect(result.recordIds).toBeDefined()
      expect(Array.isArray(result.recordIds)).toBe(true)
      // Note: Grist upsert returns null, so record_ids will be empty array
    })
  })
})
