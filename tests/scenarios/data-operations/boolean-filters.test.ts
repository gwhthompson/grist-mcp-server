/**
 * Boolean Column Filtering Integration Test
 *
 * Tests that boolean filters work correctly with true/false values,
 * not "__YES__"/"__NO__" strings.
 *
 * Addresses user feedback: "Stored with IsActive: true, tried to filter
 * with IsActive: '__YES__' per documentation, got zero results."
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getRecords } from '../../../src/tools/reading.js'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  addTestRecords,
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../../helpers/grist-api.js'
import type { TestGetRecordsResponse } from '../../helpers/test-types.js'
import type { TestContext } from '../../helpers/types.js'

describe('Boolean Column Filtering', () => {
  let context: TestContext
  let client: ReturnType<typeof createTestClient>

  beforeAll(async () => {
    await ensureGristReady()
    client = createTestClient()

    // Create test document with boolean column
    context = await createFullTestContext(client, {
      docName: 'BooleanFilterTest',
      tableName: 'Contacts',
      columns: [
        { id: 'Name', fields: { type: 'Text' } },
        { id: 'Email', fields: { type: 'Text' } },
        { id: 'IsActive', fields: { type: 'Bool' } },
        { id: 'IsDeleted', fields: { type: 'Bool' } }
      ]
    })

    // Add test records with boolean values
    await addTestRecords(client, context.docId, 'Contacts', [
      {
        fields: {
          Name: 'Alice Johnson',
          Email: 'alice@example.com',
          IsActive: true,
          IsDeleted: false
        }
      },
      {
        fields: {
          Name: 'Bob Williams',
          Email: 'bob@example.com',
          IsActive: false,
          IsDeleted: false
        }
      },
      {
        fields: {
          Name: 'Carol Davis',
          Email: 'carol@example.com',
          IsActive: true,
          IsDeleted: true
        }
      },
      {
        fields: {
          Name: 'David Lee',
          Email: 'david@example.com',
          IsActive: false,
          IsDeleted: true
        }
      }
    ])
  })

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  describe('Filter by Boolean True', () => {
    it('should return only active contacts when filtering by IsActive=true', async () => {
      const result = await getRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        filters: { IsActive: true },
        response_format: 'json'
      })

      // Check for errors
      if (result.isError) {
        throw new Error(`getRecords failed: ${result.content[0].text}`)
      }

      const response = result.structuredContent as TestGetRecordsResponse

      // Should return Alice and Carol (both have IsActive: true)
      expect(response.items).toHaveLength(2)
      expect(response.items.map((r) => r.Name).sort()).toEqual(['Alice Johnson', 'Carol Davis'])
    })

    it('should return only non-deleted contacts when filtering by IsDeleted=false', async () => {
      const result = await getRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        filters: { IsDeleted: false },
        response_format: 'json'
      })

      const response = result.structuredContent as TestGetRecordsResponse

      // Should return Alice and Bob (both have IsDeleted: false)
      expect(response.items).toHaveLength(2)
      expect(response.items.map((r) => r.Name).sort()).toEqual(['Alice Johnson', 'Bob Williams'])
    })
  })

  describe('Filter by Boolean False', () => {
    it('should return only inactive contacts when filtering by IsActive=false', async () => {
      const result = await getRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        filters: { IsActive: false },
        response_format: 'json'
      })

      const response = result.structuredContent as TestGetRecordsResponse

      // Should return Bob and David (both have IsActive: false)
      expect(response.items).toHaveLength(2)
      expect(response.items.map((r) => r.Name).sort()).toEqual(['Bob Williams', 'David Lee'])
    })
  })

  describe('Combined Boolean Filters (AND logic)', () => {
    it('should filter by multiple boolean columns', async () => {
      const result = await getRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Contacts',
        filters: { IsActive: true, IsDeleted: false },
        response_format: 'json'
      })

      const response = result.structuredContent as TestGetRecordsResponse

      // Should return only Alice (IsActive=true AND IsDeleted=false)
      expect(response.items).toHaveLength(1)
      expect(response.items[0].Name).toBe('Alice Johnson')
    })
  })
})
