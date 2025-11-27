/**
 * ISO 8601 Date String Preprocessing Tests
 *
 * Tests that the MCP server correctly accepts and converts ISO 8601 date strings
 * to Grist's internal encoding format (Unix timestamps in seconds).
 *
 * This addresses user feedback about OverflowError when using milliseconds,
 * by making ISO 8601 strings the recommended format.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  addTestRecords,
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../../helpers/grist-api.js'
import type { RawApiRecordsResponse } from '../../helpers/test-types.js'
import type { TestContext } from '../../helpers/types.js'

describe('ISO 8601 Date String Preprocessing', () => {
  let context: TestContext
  let client: ReturnType<typeof createTestClient>

  beforeAll(async () => {
    await ensureGristReady()
    client = createTestClient()

    // Create test document with Date and DateTime columns
    context = await createFullTestContext(client, {
      docName: 'ISO8601DateTest',
      tableName: 'Events',
      columns: [
        { id: 'Name', fields: { type: 'Text' } },
        { id: 'EventDate', fields: { type: 'Date' } },
        { id: 'CreatedAt', fields: { type: 'DateTime' } }
      ]
    })
  })

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  describe('Date Column - ISO 8601 Strings', () => {
    it('should accept ISO 8601 date string (YYYY-MM-DD)', async () => {
      const recordIds = await addTestRecords(client, context.docId, 'Events', [
        {
          fields: {
            Name: 'Test Event 1',
            EventDate: '2021-01-01' // ISO 8601 string
          }
        }
      ])

      expect(recordIds).toHaveLength(1)

      // Verify the date was stored correctly
      const response = await client.get<RawApiRecordsResponse>(
        `/docs/${context.docId}/tables/Events/records`
      )
      const record = response.records.find((r) => r.id === recordIds[0])

      // Grist returns Date as plain timestamp (seconds since epoch)
      expect(record?.fields.EventDate).toBe(1609459200)
    })

    it('should accept ISO 8601 date string with different dates', async () => {
      const recordIds = await addTestRecords(client, context.docId, 'Events', [
        {
          fields: {
            Name: 'Test Event 2',
            EventDate: '2024-01-15' // Different date
          }
        }
      ])

      expect(recordIds).toHaveLength(1)

      const response = await client.get<RawApiRecordsResponse>(
        `/docs/${context.docId}/tables/Events/records`
      )
      const record = response.records.find((r) => r.id === recordIds[0])

      // Grist returns plain timestamp (seconds, not milliseconds)
      expect(record?.fields.EventDate).toBe(Math.floor(Date.parse('2024-01-15') / 1000))
    })

    it('should still accept Unix timestamp in seconds (backward compatibility)', async () => {
      const timestamp = 1609459200 // Jan 1, 2021 in seconds

      const recordIds = await addTestRecords(client, context.docId, 'Events', [
        {
          fields: {
            Name: 'Test Event 3',
            EventDate: timestamp
          }
        }
      ])

      expect(recordIds).toHaveLength(1)

      const response = await client.get<RawApiRecordsResponse>(
        `/docs/${context.docId}/tables/Events/records`
      )
      const record = response.records.find((r) => r.id === recordIds[0])

      // Grist returns plain timestamp
      expect(record?.fields.EventDate).toBe(timestamp)
    })
  })

  describe('DateTime Column - ISO 8601 Strings', () => {
    it('should accept ISO 8601 datetime string with UTC timezone', async () => {
      const recordIds = await addTestRecords(client, context.docId, 'Events', [
        {
          fields: {
            Name: 'Event with DateTime',
            CreatedAt: '2024-01-15T10:30:00Z' // ISO 8601 with UTC
          }
        }
      ])

      expect(recordIds).toHaveLength(1)

      const response = await client.get<RawApiRecordsResponse>(
        `/docs/${context.docId}/tables/Events/records`
      )
      const record = response.records.find((r) => r.id === recordIds[0])

      // Grist returns DateTime as plain timestamp (seconds since epoch)
      const expectedTimestamp = Math.floor(Date.parse('2024-01-15T10:30:00Z') / 1000)
      expect(record?.fields.CreatedAt).toBe(expectedTimestamp)
    })

    it('should accept ISO 8601 datetime string with timezone offset', async () => {
      const recordIds = await addTestRecords(client, context.docId, 'Events', [
        {
          fields: {
            Name: 'Event with Timezone',
            CreatedAt: '2024-01-15T10:30:00-05:00' // EST timezone
          }
        }
      ])

      expect(recordIds).toHaveLength(1)

      const response = await client.get<RawApiRecordsResponse>(
        `/docs/${context.docId}/tables/Events/records`
      )
      const record = response.records.find((r) => r.id === recordIds[0])

      // Grist returns plain timestamp (timezone info not preserved in return value)
      const expectedTimestamp = Math.floor(Date.parse('2024-01-15T10:30:00-05:00') / 1000)
      expect(record?.fields.CreatedAt).toBe(expectedTimestamp)
    })
  })

  describe('Error Prevention - Milliseconds vs Seconds', () => {
    it('should prevent OverflowError by using seconds not milliseconds', async () => {
      // This test verifies the bug fix for the user's reported issue
      // User tried: ["d", 1609459200000] (milliseconds) → OverflowError
      // Should work: ["d", 1609459200] (seconds) or "2021-01-01" (ISO string)

      const isoString = '2021-01-01'
      const correctSeconds = 1609459200
      const _incorrectMilliseconds = 1609459200000

      // ISO string should work
      const recordIds1 = await addTestRecords(client, context.docId, 'Events', [
        {
          fields: {
            Name: 'ISO String Works',
            EventDate: isoString
          }
        }
      ])
      expect(recordIds1).toHaveLength(1)

      // Correct seconds should work
      const recordIds2 = await addTestRecords(client, context.docId, 'Events', [
        {
          fields: {
            Name: 'Seconds Work',
            EventDate: correctSeconds
          }
        }
      ])
      expect(recordIds2).toHaveLength(1)

      // Milliseconds encoding would fail with Grist (we don't test this as it's Grist's behavior)
      // The point is that ISO strings prevent this user error entirely
    })
  })
})
