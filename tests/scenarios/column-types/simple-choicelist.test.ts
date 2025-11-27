/**
 * Simple ChoiceList Format Integration Test
 *
 * Tests that users can provide plain string arrays for ChoiceList columns
 * without needing to remember the ["L", ...] encoding.
 *
 * Tests automatic conversion: ["item1", "item2"] → ["L", "item1", "item2"]
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { updateRecords } from '../../../src/tools/records.js'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  addTestRecords,
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../../helpers/grist-api.js'
import type { RawApiRecordsResponse } from '../../helpers/test-types.js'
import type { TestContext } from '../../helpers/types.js'

describe('Simple ChoiceList Format (Auto-Conversion)', () => {
  let context: TestContext
  let client: ReturnType<typeof createTestClient>

  beforeAll(async () => {
    await ensureGristReady()
    client = createTestClient()

    // Create test document with ChoiceList column
    context = await createFullTestContext(client, {
      docName: 'ChoiceListSimpleTest',
      tableName: 'Employees',
      columns: [
        { id: 'Name', fields: { type: 'Text' } },
        {
          id: 'Skills',
          fields: {
            type: 'ChoiceList',
            widgetOptions: JSON.stringify({
              choices: ['Python', 'JavaScript', 'SQL', 'Docker', 'AWS']
            })
          }
        },
        {
          id: 'Roles',
          fields: {
            type: 'ChoiceList',
            widgetOptions: JSON.stringify({
              choices: ['Developer', 'Designer', 'Manager', 'Analyst']
            })
          }
        }
      ]
    })
  })

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  describe('Add Records with Simple ChoiceList Format', () => {
    it('should accept plain string array for ChoiceList (auto-converts to Grist encoding)', async () => {
      // Use SIMPLE format: ["Python", "SQL"]
      const recordIds = await addTestRecords(client, context.docId, 'Employees', [
        {
          fields: {
            Name: 'Alice Johnson',
            Skills: ['Python', 'SQL', 'Docker'], // Plain array - NO "L" prefix
            Roles: ['Developer', 'Manager']
          }
        }
      ])

      expect(recordIds).toHaveLength(1)

      // Verify data was stored correctly (should have "L" encoding internally)
      const response = await client.get<RawApiRecordsResponse>(
        `/docs/${context.docId}/tables/Employees/records`
      )
      const record = response.records.find((r) => r.id === recordIds[0])

      expect(record?.fields.Skills).toEqual(['L', 'Python', 'SQL', 'Docker'])
      expect(record?.fields.Roles).toEqual(['L', 'Developer', 'Manager'])
    })

    it('should handle empty ChoiceList', async () => {
      const recordIds = await addTestRecords(client, context.docId, 'Employees', [
        {
          fields: {
            Name: 'Bob Williams',
            Skills: [], // Empty array
            Roles: []
          }
        }
      ])

      expect(recordIds).toHaveLength(1)

      const response = await client.get<RawApiRecordsResponse>(
        `/docs/${context.docId}/tables/Employees/records`
      )
      const record = response.records.find((r) => r.id === recordIds[0])

      // Grist normalizes empty arrays to null
      expect(record?.fields.Skills).toBeNull()
      expect(record?.fields.Roles).toBeNull()
    })

    it('should handle single item ChoiceList', async () => {
      const recordIds = await addTestRecords(client, context.docId, 'Employees', [
        {
          fields: {
            Name: 'Carol Davis',
            Skills: ['JavaScript'], // Single item
            Roles: ['Analyst']
          }
        }
      ])

      expect(recordIds).toHaveLength(1)

      const response = await client.get<RawApiRecordsResponse>(
        `/docs/${context.docId}/tables/Employees/records`
      )
      const record = response.records.find((r) => r.id === recordIds[0])

      expect(record?.fields.Skills).toEqual(['L', 'JavaScript'])
      expect(record?.fields.Roles).toEqual(['L', 'Analyst'])
    })
  })

  describe('Update Records with Simple ChoiceList Format', () => {
    it('should update ChoiceList column with plain array', async () => {
      // Add initial record
      const recordIds = await addTestRecords(client, context.docId, 'Employees', [
        {
          fields: {
            Name: 'David Lee',
            Skills: ['Python'],
            Roles: ['Developer']
          }
        }
      ])

      // Update with new skills using simple format
      await updateRecords(context.toolContext, {
        docId: context.docId,
        tableId: 'Employees',
        rowIds: recordIds,
        updates: {
          Skills: ['Python', 'AWS', 'Docker'] // Plain array - auto-converted
        },
        response_format: 'json'
      })

      // Verify update worked
      const response = await client.get<RawApiRecordsResponse>(
        `/docs/${context.docId}/tables/Employees/records`
      )
      const record = response.records.find((r) => r.id === recordIds[0])

      expect(record?.fields.Skills).toEqual(['L', 'Python', 'AWS', 'Docker'])
    })
  })

  describe('Error Cases', () => {
    it('should reject non-string items in ChoiceList array', async () => {
      await expect(
        addTestRecords(client, context.docId, 'Employees', [
          {
            fields: {
              Name: 'Invalid',
              // biome-ignore lint/suspicious/noExplicitAny: Testing runtime validation with invalid data
              Skills: [123, 'Python'] as any, // Numbers not allowed
              Roles: []
            }
          }
        ])
      ).rejects.toThrow()
    })

    it('should reject single string (not array) for ChoiceList', async () => {
      await expect(
        addTestRecords(client, context.docId, 'Employees', [
          {
            fields: {
              Name: 'Invalid',
              // biome-ignore lint/suspicious/noExplicitAny: Testing runtime validation with invalid data
              Skills: 'Python' as any, // String not allowed - must be array
              Roles: []
            }
          }
        ])
      ).rejects.toThrow()
    })
  })
})
