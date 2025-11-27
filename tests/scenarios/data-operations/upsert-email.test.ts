/**
 * Upsert by Email Integration Test
 *
 * Tests that grist_upsert_records correctly updates existing records
 * instead of creating duplicates when matching by unique field (email).
 *
 * This addresses user feedback: "Upsert created duplicate (id=5) instead
 * of updating existing (id=1)" when using email as unique key.
 *
 * The fix was changing POST to PUT in records.ts:220
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { upsertRecords } from '../../../src/tools/records.js'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  addTestRecords,
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../../helpers/grist-api.js'
import type { RawApiRecord } from '../../helpers/test-types.js'
import type { TestContext } from '../../helpers/types.js'

describe('Upsert by Email - Prevent Duplicates', () => {
  let context: TestContext
  let client: ReturnType<typeof createTestClient>

  beforeAll(async () => {
    await ensureGristReady()
    client = createTestClient()

    // Create test document with Contacts table
    context = await createFullTestContext(client, {
      docName: 'UpsertEmailTest',
      tableName: 'Contacts',
      columns: [
        { id: 'Name', fields: { type: 'Text' } },
        { id: 'Email', fields: { type: 'Text' } },
        { id: 'Status', fields: { type: 'Text' } },
        { id: 'LastSync', fields: { type: 'Text' } }
      ]
    })
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  }, 30000)

  describe('Upsert Updates Existing Records', () => {
    it('should update existing record by email instead of creating duplicate', async () => {
      // SETUP: Add initial record
      const initialIds = await addTestRecords(client, context.docId, 'Contacts', [
        {
          fields: {
            Name: 'Alice Johnson',
            Email: 'alice@example.com',
            Status: 'Active',
            LastSync: 'January 1, 2024' // Use non-ISO format for Text column
          }
        }
      ])

      expect(initialIds).toHaveLength(1)
      const initialId = initialIds[0]

      // Get initial record count
      const initialRecords = await client.get(`/docs/${context.docId}/tables/Contacts/records`)
      const initialCount = initialRecords.records.length

      // ACT: Upsert with same email but different data
      const upsertResponse = await upsertRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        records: [
          {
            require: { Email: 'alice@example.com' }, // Match on email
            fields: {
              Name: 'Alice Smith', // Changed name
              Status: 'VIP', // Changed status
              LastSync: 'January 15, 2024' // Updated sync time
            }
          }
        ],
        add: true,
        update: true,
        response_format: 'json'
      })

      // ASSERT: Should have updated, not created duplicate
      if (upsertResponse.isError) {
        throw new Error(`Upsert failed: ${upsertResponse.content[0].text}`)
      }

      // biome-ignore lint/suspicious/noExplicitAny: Testing runtime validation with invalid data
      const upsertResult = upsertResponse.structuredContent as any
      expect(upsertResult.success).toBe(true)

      // Verify record count didn't increase
      const finalRecords = await client.get(`/docs/${context.docId}/tables/Contacts/records`)
      expect(finalRecords.records).toHaveLength(initialCount)

      // Verify the original record was updated
      const updatedRecord = finalRecords.records.find((r: RawApiRecord) => r.id === initialId)
      expect(updatedRecord).toBeDefined()
      expect(updatedRecord?.fields.Name).toBe('Alice Smith') // Updated
      expect(updatedRecord?.fields.Email).toBe('alice@example.com') // Unchanged
      expect(updatedRecord?.fields.Status).toBe('VIP') // Updated
      expect(updatedRecord?.fields.LastSync).toBe('January 15, 2024') // Updated

      // Verify NO duplicate was created
      const duplicates = finalRecords.records.filter(
        (r: RawApiRecord) => r.fields.Email === 'alice@example.com'
      )
      expect(duplicates).toHaveLength(1) // Only ONE record with this email
    })

    it('should add new record when email does not exist', async () => {
      // Get initial count
      const initialRecords = await client.get(`/docs/${context.docId}/tables/Contacts/records`)
      const initialCount = initialRecords.records.length

      // Upsert with new email
      const upsertResponse = await upsertRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        records: [
          {
            require: { Email: 'bob@example.com' }, // New email
            fields: {
              Name: 'Bob Williams',
              Status: 'Active',
              LastSync: 'January 15, 2024'
            }
          }
        ],
        add: true,
        update: true,
        response_format: 'json'
      })

      if (upsertResponse.isError) {
        throw new Error(`Upsert failed: ${upsertResponse.content[0].text}`)
      }

      // biome-ignore lint/suspicious/noExplicitAny: Testing runtime validation with invalid data
      const upsertResult = upsertResponse.structuredContent as any
      expect(upsertResult.success).toBe(true)

      // Verify record count increased by 1
      const finalRecords = await client.get(`/docs/${context.docId}/tables/Contacts/records`)
      expect(finalRecords.records).toHaveLength(initialCount + 1)

      // Verify new record was created
      const newRecord = finalRecords.records.find(
        (r: RawApiRecord) => r.fields.Email === 'bob@example.com'
      )
      expect(newRecord).toBeDefined()
      expect(newRecord.fields.Name).toBe('Bob Williams')
    })

    it('should handle multiple upserts idempotently', async () => {
      // Add initial record
      await addTestRecords(client, context.docId, 'Contacts', [
        {
          fields: {
            Name: 'Carol Davis',
            Email: 'carol@example.com',
            Status: 'Active',
            LastSync: 'January 1, 2024'
          }
        }
      ])

      // Upsert same email multiple times
      for (let i = 1; i <= 3; i++) {
        await upsertRecords(context.toolContext, {
          docId: context.docId,
          tableId: 'Contacts',
          records: [
            {
              require: { Email: 'carol@example.com' },
              fields: {
                Name: 'Carol Davis',
                Status: 'Active',
                LastSync: `Jan ${10 + i}, 2024` // Different each time, non-ISO format
              }
            }
          ],
          add: true,
          update: true
        })
      }

      // Verify only ONE record exists for this email
      const records = await client.get(`/docs/${context.docId}/tables/Contacts/records`)
      const carolRecords = records.records.filter(
        (r: RawApiRecord) => r.fields.Email === 'carol@example.com'
      )
      expect(carolRecords).toHaveLength(1)

      // Verify last sync was updated to latest
      expect(carolRecords[0].fields.LastSync).toBe('Jan 13, 2024')
    })
  })

  describe('Case Sensitivity and Whitespace', () => {
    it('should respect case-sensitivity in email matching', async () => {
      // Add record with lowercase email
      await addTestRecords(client, context.docId, 'Contacts', [
        {
          fields: {
            Name: 'David Lee',
            Email: 'david@example.com',
            Status: 'Active'
          }
        }
      ])

      const initialRecords = await client.get(`/docs/${context.docId}/tables/Contacts/records`)
      const initialCount = initialRecords.records.length

      // Upsert with UPPERCASE email (different case)
      await upsertRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        records: [
          {
            require: { Email: 'DAVID@example.com' }, // Different case
            fields: {
              Name: 'David Lee Updated',
              Status: 'VIP'
            }
          }
        ],
        add: true,
        update: true
      })

      const finalRecords = await client.get(`/docs/${context.docId}/tables/Contacts/records`)

      // Case-sensitive match should create NEW record (not update)
      expect(finalRecords.records.length).toBeGreaterThan(initialCount)

      // Should have both lowercase and uppercase email records
      const lowercaseRecord = finalRecords.records.find(
        (r: RawApiRecord) => r.fields.Email === 'david@example.com'
      )
      const uppercaseRecord = finalRecords.records.find(
        (r: RawApiRecord) => r.fields.Email === 'DAVID@example.com'
      )

      expect(lowercaseRecord).toBeDefined()
      expect(uppercaseRecord).toBeDefined()
    })

    it('should detect whitespace differences in matching', async () => {
      // Add record
      await addTestRecords(client, context.docId, 'Contacts', [
        {
          fields: {
            Name: 'Emma Wilson',
            Email: 'emma@example.com',
            Status: 'Active'
          }
        }
      ])

      const initialRecords = await client.get(`/docs/${context.docId}/tables/Contacts/records`)
      const initialCount = initialRecords.records.length

      // Upsert with trailing whitespace
      await upsertRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        records: [
          {
            require: { Email: 'emma@example.com ' }, // Trailing space
            fields: {
              Name: 'Emma Wilson Updated',
              Status: 'VIP'
            }
          }
        ],
        add: true,
        update: true
      })

      const finalRecords = await client.get(`/docs/${context.docId}/tables/Contacts/records`)

      // Whitespace difference should create NEW record (not update)
      expect(finalRecords.records.length).toBeGreaterThan(initialCount)
    })
  })

  describe('Upsert Parameter Control (add/update flags)', () => {
    it('should respect add=false flag (update-only mode, no inserts)', async () => {
      // Add existing record
      await addTestRecords(client, context.docId, 'Contacts', [
        {
          fields: {
            Name: 'Existing User',
            Email: 'existing@example.com',
            Status: 'Active'
          }
        }
      ])

      const initialRecords = await client.get(`/docs/${context.docId}/tables/Contacts/records`)
      const initialCount = initialRecords.records.length

      // Try to upsert with NEW email AND add=false
      await upsertRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        records: [
          {
            require: { Email: 'newuser@example.com' }, // Email doesn't exist
            fields: {
              Name: 'Should Not Be Added',
              Status: 'Active'
            }
          }
        ],
        add: false, // Prohibit adding new records
        update: true,
        response_format: 'json'
      })

      // Verify NO new record was added (add=false respected)
      const finalRecords = await client.get(`/docs/${context.docId}/tables/Contacts/records`)
      expect(finalRecords.records.length).toBe(initialCount)

      // Verify the new email does NOT exist
      const newUserRecord = finalRecords.records.find(
        (r: RawApiRecord) => r.fields.Email === 'newuser@example.com'
      )
      expect(newUserRecord).toBeUndefined()
    })

    it('should respect update=false flag (insert-only mode, no updates)', async () => {
      // Add existing record
      const existingIds = await addTestRecords(client, context.docId, 'Contacts', [
        {
          fields: {
            Name: 'Original Name',
            Email: 'update-test@example.com',
            Status: 'Active'
          }
        }
      ])

      // Try to upsert with SAME email AND update=false
      await upsertRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        records: [
          {
            require: { Email: 'update-test@example.com' }, // Email exists
            fields: {
              Name: 'Should Not Update', // Try to change name
              Status: 'VIP' // Try to change status
            }
          }
        ],
        add: true,
        update: false, // Prohibit updates
        response_format: 'json'
      })

      // Verify record was NOT updated (update=false respected)
      const finalRecords = await client.get(`/docs/${context.docId}/tables/Contacts/records`)
      const record = finalRecords.records.find((r: RawApiRecord) => r.id === existingIds[0])

      // Name and Status should be unchanged
      expect(record?.fields.Name).toBe('Original Name')
      expect(record?.fields.Status).toBe('Active')
    })
  })

  describe('Error Cases', () => {
    it('should fail gracefully when require field column does not exist', async () => {
      const result = await upsertRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        records: [
          {
            require: { NonExistentColumn: 'test' },
            fields: { Name: 'Test' }
          }
        ],
        response_format: 'json'
      })

      // MCP tools return error responses, not throw
      expect(result).toHaveErrorResponse(/column|not found|does not exist/i)
    })

    it('should handle empty require object', async () => {
      // Empty require should be rejected
      const result = await upsertRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        records: [
          {
            require: {},
            fields: { Name: 'Test' }
          }
        ],
        response_format: 'json'
      })

      // MCP tools return error responses, not throw
      expect(result).toHaveErrorResponse(/require|empty|invalid/i)
    })
  })
})
