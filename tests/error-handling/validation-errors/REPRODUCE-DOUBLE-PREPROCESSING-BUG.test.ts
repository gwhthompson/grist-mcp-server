/**
 * MINIMAL REPRODUCTION TEST - Double Preprocessing Bug
 *
 * Reported Issue: User sends "2024-01-15" and gets error:
 * "Pre-encoded Grist Date format detected. Received: ["d",1705276800]"
 *
 * This test calls the MCP tool DIRECTLY to reproduce the exact user scenario.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addRecords } from '../../../src/tools/records.js'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  cleanupTestContext,
  createFullTestContext,
  createTestClient,
  type TestContext
} from '../../helpers/grist-api.js'
import type { TestAddRecordsResponse } from '../../helpers/test-types.js'

describe('REPRODUCE: Double Preprocessing Bug', () => {
  let context: TestContext
  const client = createTestClient()

  beforeAll(async () => {
    await ensureGristReady()

    context = await createFullTestContext(client, {
      docName: 'BugRepro',
      tableName: 'Events',
      columns: [
        { id: 'Name', fields: { type: 'Text' } },
        { id: 'EventDate', fields: { type: 'Date' } },
        { id: 'Tags', fields: { type: 'ChoiceList' } }
      ]
    })
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  it('REPRO TEST: Send natural date format through MCP tool', async () => {
    console.log('\n🔍 REPRODUCTION TEST: Sending natural date format...')
    console.log('   DocId:', context.docId)
    console.log('   TableId: Events')
    console.log('   Input: { Name: "Test", EventDate: "2024-01-15" }')

    // Call MCP tool EXACTLY like a user would
    const result = await addRecords(context.toolContext, {
      docId: context.docId,
      tableId: 'Events',
      records: [
        {
          Name: 'Test Event',
          EventDate: '2024-01-15' // Natural format - should work!
        }
      ],
      response_format: 'json'
    })

    console.log('   Result:', JSON.stringify(result, null, 2))

    // If bug exists, we'll get:
    // Error: "Pre-encoded Grist Date format detected. Received: ["d",1705276800]"
    //   → result.isError will be true

    // Success responses don't set isError (it's undefined)
    // Check structuredContent instead
    const data = result.structuredContent as TestAddRecordsResponse

    if (result.isError) {
      console.log('   ❌ BUG CONFIRMED: Got preprocessing error!')
      console.log('   Error:', result.content[0].text)
      throw new Error(`Bug reproduced: ${result.content[0].text}`)
    }

    expect(data.success).toBe(true)
    expect(data.recordsAdded).toBe(1)
    console.log('   ✅ SUCCESS: Date accepted without error')
  })

  it('REPRO TEST: Send natural ChoiceList format through MCP tool', async () => {
    console.log('\n🔍 REPRODUCTION TEST: Sending natural ChoiceList format...')
    console.log('   Input: { Name: "Test", Tags: ["Python", "SQL"] }')

    const result = await addRecords(context.toolContext, {
      docId: context.docId,
      tableId: 'Events',
      records: [
        {
          Name: 'Test Event 2',
          Tags: ['Python', 'SQL'] // Natural array format
        }
      ],
      response_format: 'json'
    })

    console.log('   Result:', JSON.stringify(result, null, 2))

    const data = result.structuredContent as TestAddRecordsResponse

    if (result.isError) {
      console.log('   ❌ BUG CONFIRMED: Got preprocessing error!')
      console.log('   Error:', result.content[0].text)
      throw new Error(`Bug reproduced: ${result.content[0].text}`)
    }

    expect(data.success).toBe(true)
    expect(data.recordsAdded).toBe(1)
    console.log('   ✅ SUCCESS: ChoiceList accepted without error')
  })

  it('REPRO TEST: Send BOTH date and ChoiceList together', async () => {
    console.log('\n🔍 REPRODUCTION TEST: Sending BOTH date AND ChoiceList...')
    console.log('   Input: { Name: "Test", EventDate: "2024-01-15", Tags: ["A", "B"] }')

    const result = await addRecords(context.toolContext, {
      docId: context.docId,
      tableId: 'Events',
      records: [
        {
          Name: 'Test Event 3',
          EventDate: '2024-01-15', // Date
          Tags: ['Feature', 'Bug'] // ChoiceList
        }
      ],
      response_format: 'json'
    })

    console.log('   Result:', JSON.stringify(result, null, 2))

    const data = result.structuredContent as TestAddRecordsResponse

    if (result.isError) {
      console.log('   ❌ BUG CONFIRMED: Got preprocessing error!')
      console.log('   Error:', result.content[0].text)
      throw new Error(`Bug reproduced: ${result.content[0].text}`)
    }

    expect(data.success).toBe(true)
    expect(data.recordsAdded).toBe(1)
    console.log('   ✅ SUCCESS: Both formats accepted without error')
  })
})
