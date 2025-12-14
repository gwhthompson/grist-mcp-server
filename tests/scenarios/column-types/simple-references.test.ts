/**
 * Simple Reference Format Integration Test
 *
 * Tests that users can provide plain numeric row IDs for Reference/RefList columns
 * without needing to use Grist's ["R", id] or ["r", [ids]] encoding.
 *
 * Tests automatic conversion:
 * - Reference: 456 → ["R", 456]
 * - RefList: [10, 11, 12] → ["r", [10, 11, 12]]
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { updateRecords } from '../../../src/tools/records.js'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  addTestRecords,
  cleanupTestContext,
  createFullTestContext,
  createTestClient,
  createTestTable
} from '../../helpers/grist-api.js'
import type { RawApiRecord } from '../../helpers/test-types.js'
import type { TestContext } from '../../helpers/types.js'

describe('Simple Reference Format (Auto-Conversion)', () => {
  let context: TestContext
  let client: ReturnType<typeof createTestClient>
  let personIds: number[]

  beforeAll(async () => {
    await ensureGristReady()
    client = createTestClient()

    // Create test document with People table (Tasks table will be created separately)
    context = await createFullTestContext(client, {
      docName: 'ReferenceSimpleTest',
      tableName: 'People',
      columns: [
        { id: 'Name', fields: { type: 'Text' } },
        { id: 'Email', fields: { type: 'Text' } }
      ]
    })

    // Create Tasks table with reference columns
    await createTestTable(client, context.docId, 'Tasks', [
      { id: 'Title', fields: { type: 'Text' } },
      { id: 'AssignedTo', fields: { type: 'Ref:People' } },
      { id: 'Reviewers', fields: { type: 'RefList:People' } }
    ])

    // Add test people
    personIds = await addTestRecords(client, context.docId, 'People', [
      { fields: { Name: 'Alice', Email: 'alice@example.com' } },
      { fields: { Name: 'Bob', Email: 'bob@example.com' } },
      { fields: { Name: 'Carol', Email: 'carol@example.com' } }
    ])
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  }, 60000)

  describe('Reference Column - Simple Numeric Format', () => {
    it('should accept plain row ID for Reference column (auto-converts)', async () => {
      // Use SIMPLE format: 456 (just the number)
      const taskIds = await addTestRecords(client, context.docId, 'Tasks', [
        {
          fields: {
            Title: 'Fix authentication bug',
            AssignedTo: personIds[0], // Plain number - NO ["R", ...] encoding
            Reviewers: [personIds[1], personIds[2]] // Plain array - NO ["r", [...]] encoding
          }
        }
      ])

      expect(taskIds).toHaveLength(1)

      // Verify data was stored correctly
      const response = await client.get(`/docs/${context.docId}/tables/Tasks/records`)
      const record = response.records.find((r: RawApiRecord) => r.id === taskIds[0])

      // Grist returns Reference as plain number (not encoded ['R', ...])
      expect(record?.fields.AssignedTo).toBe(personIds[0])
      // Grist returns RefList using 'L' format (same as ChoiceList)
      expect(record?.fields.Reviewers).toEqual(['L', personIds[1], personIds[2]])
    })

    it('should handle null values for Reference columns', async () => {
      const taskIds = await addTestRecords(client, context.docId, 'Tasks', [
        {
          fields: {
            Title: 'Unassigned task',
            AssignedTo: null, // Null reference
            Reviewers: [] // Empty RefList
          }
        }
      ])

      expect(taskIds).toHaveLength(1)

      const response = await client.get(`/docs/${context.docId}/tables/Tasks/records`)
      const record = response.records.find((r: RawApiRecord) => r.id === taskIds[0])

      // Grist returns 0 for null Reference (not null)
      expect(record?.fields.AssignedTo).toBe(0)
      // Grist returns null for empty RefList (not ['L'] or ['r', []])
      expect(record?.fields.Reviewers).toBeNull()
    })
  })

  describe('RefList Column - Simple Array Format', () => {
    it('should accept plain array of row IDs for RefList column', async () => {
      const taskIds = await addTestRecords(client, context.docId, 'Tasks', [
        {
          fields: {
            Title: 'Code review task',
            AssignedTo: personIds[0],
            Reviewers: [personIds[0], personIds[1], personIds[2]] // All three people
          }
        }
      ])

      expect(taskIds).toHaveLength(1)

      const response = await client.get(`/docs/${context.docId}/tables/Tasks/records`)
      const record = response.records.find((r: RawApiRecord) => r.id === taskIds[0])

      // Grist returns RefList using 'L' format (same as ChoiceList)
      expect(record?.fields.Reviewers).toEqual(['L', personIds[0], personIds[1], personIds[2]])
    })

    it('should handle single-item RefList', async () => {
      const taskIds = await addTestRecords(client, context.docId, 'Tasks', [
        {
          fields: {
            Title: 'Solo review',
            AssignedTo: personIds[0],
            Reviewers: [personIds[0]] // Single reviewer
          }
        }
      ])

      expect(taskIds).toHaveLength(1)

      const response = await client.get(`/docs/${context.docId}/tables/Tasks/records`)
      const record = response.records.find((r: RawApiRecord) => r.id === taskIds[0])

      // Grist returns RefList using 'L' format
      expect(record?.fields.Reviewers).toEqual(['L', personIds[0]])
    })
  })

  describe('Update References with Simple Format', () => {
    it('should update Reference column with plain number', async () => {
      // Add task assigned to Alice
      const taskIds = await addTestRecords(client, context.docId, 'Tasks', [
        {
          fields: {
            Title: 'Reassignable task',
            AssignedTo: personIds[0] // Alice
          }
        }
      ])

      // Reassign to Bob using simple format
      await updateRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Tasks',
        rowIds: taskIds,
        updates: {
          AssignedTo: personIds[1] // Plain number
        },
        response_format: 'json'
      })

      // Verify reassignment
      const response = await client.get(`/docs/${context.docId}/tables/Tasks/records`)
      const record = response.records.find((r: RawApiRecord) => r.id === taskIds[0])

      // Grist returns Ref as plain number
      expect(record?.fields.AssignedTo).toBe(personIds[1])
    })
  })
})
