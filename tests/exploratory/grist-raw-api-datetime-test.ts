/**
 * Direct Grist API Test for Date/DateTime columns
 * What does Grist actually accept and return?
 */

import { ensureGristReady } from '../helpers/docker.js'
import {
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../helpers/grist-api.js'
import type { RawApiRecordsResponse } from '../helpers/test-types.js'

async function main() {
  await ensureGristReady()
  const client = createTestClient()

  const context = await createFullTestContext(client, {
    docName: 'DateTimeAPITest',
    tableName: 'Events',
    columns: [
      { id: 'Name', fields: { type: 'Text' } },
      { id: 'EventDate', fields: { type: 'Date' } },
      { id: 'CreatedAt', fields: { type: 'DateTime' } }
    ]
  })

  console.log('Created Events table\n')

  // TEST 1: What does Grist ACCEPT for Date column?
  console.log('=== TEST 1: Plain timestamp for Date ===')
  try {
    await client.post(`/docs/${context.docId}/tables/Events/records`, {
      records: [{ fields: { Name: 'Event1', EventDate: 1705276800 } }]
    })
    console.log('✅ Grist ACCEPTS plain timestamp for Date\n')
  } catch (e) {
    console.log('❌ Grist REJECTS:', e instanceof Error ? e.message.substring(0, 100) : e, '\n')
  }

  // TEST 2: Encoded Date format
  console.log("=== TEST 2: ['d', timestamp] for Date ===")
  try {
    await client.post(`/docs/${context.docId}/tables/Events/records`, {
      records: [{ fields: { Name: 'Event2', EventDate: ['d', 1705276800] } }]
    })
    console.log("✅ Grist ACCEPTS ['d', timestamp] for Date\n")
  } catch (e) {
    console.log('❌ Grist REJECTS:', e instanceof Error ? e.message.substring(0, 100) : e, '\n')
  }

  // TEST 3: What does Grist ACCEPT for DateTime?
  console.log('=== TEST 3: Plain timestamp for DateTime ===')
  try {
    await client.post(`/docs/${context.docId}/tables/Events/records`, {
      records: [{ fields: { Name: 'Event3', CreatedAt: 1705320600 } }]
    })
    console.log('✅ Grist ACCEPTS plain timestamp for DateTime\n')
  } catch (e) {
    console.log('❌ Grist REJECTS:', e instanceof Error ? e.message.substring(0, 100) : e, '\n')
  }

  // TEST 4: Encoded DateTime format
  console.log("=== TEST 4: ['D', timestamp, timezone] for DateTime ===")
  try {
    await client.post(`/docs/${context.docId}/tables/Events/records`, {
      records: [{ fields: { Name: 'Event4', CreatedAt: ['D', 1705320600, 'UTC'] } }]
    })
    console.log("✅ Grist ACCEPTS ['D', timestamp, tz] for DateTime\n")
  } catch (e) {
    console.log('❌ Grist REJECTS:', e instanceof Error ? e.message.substring(0, 100) : e, '\n')
  }

  // TEST 5: What does Grist RETURN?
  console.log('=== TEST 5: What formats does Grist RETURN? ===')
  const events = await client.get<RawApiRecordsResponse>(
    `/docs/${context.docId}/tables/Events/records`
  )

  events.records.forEach((record) => {
    console.log(`\n${record.fields.Name}:`)
    console.log(
      '  EventDate:',
      JSON.stringify(record.fields.EventDate),
      `(type: ${typeof record.fields.EventDate})`
    )
    console.log(
      '  CreatedAt:',
      JSON.stringify(record.fields.CreatedAt),
      `(type: ${typeof record.fields.CreatedAt})`
    )
  })

  await cleanupTestContext(context)
}

main().catch(console.error)
