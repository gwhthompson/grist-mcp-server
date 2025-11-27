/**
 * Direct Grist API Test - NO MCP LAYER
 *
 * This tests Grist's RAW API behavior to understand:
 * - What formats does Grist ACCEPT for Reference/RefList?
 * - What formats does Grist RETURN for Reference/RefList?
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
    docName: 'RawAPITest',
    tableName: 'People',
    columns: [{ id: 'Name', fields: { type: 'Text' } }]
  })

  console.log('Created People table')

  // Add people using RAW GRIST API (not MCP tools)
  const peopleResponse = await client.post<RawApiRecordsResponse>(
    `/docs/${context.docId}/tables/People/records`,
    {
      records: [
        { fields: { Name: 'Alice' } },
        { fields: { Name: 'Bob' } },
        { fields: { Name: 'Carol' } }
      ]
    }
  )

  const ids = peopleResponse.records.map((r) => r.id)
  console.log('Person IDs:', ids)

  // Add Tasks table using RAW API
  await client.post(`/docs/${context.docId}/apply`, [
    [
      'AddTable',
      'Tasks',
      [
        { id: 'Title', type: 'Text' },
        { id: 'AssignedTo', type: 'Ref:People' },
        { id: 'Reviewers', type: 'RefList:People' }
      ]
    ]
  ])

  console.log('Created Tasks table\n')

  // TEST 1: What does Grist ACCEPT for Reference?
  console.log('=== TEST 1: Plain number for Ref ===')
  try {
    await client.post(`/docs/${context.docId}/tables/Tasks/records`, {
      records: [{ fields: { Title: 'Test 1', AssignedTo: ids[0] } }]
    })
    console.log('✅ Grist ACCEPTS plain number for Ref\n')
  } catch (e) {
    console.log('❌ Grist REJECTS plain number:', e instanceof Error ? e.message : e, '\n')
  }

  // TEST 2: What does Grist ACCEPT for RefList?
  console.log('=== TEST 2: Plain array for RefList ===')
  try {
    await client.post(`/docs/${context.docId}/tables/Tasks/records`, {
      records: [{ fields: { Title: 'Test 2', Reviewers: [ids[0], ids[1]] } }]
    })
    console.log('✅ Grist ACCEPTS plain array for RefList\n')
  } catch (e) {
    console.log('❌ Grist REJECTS plain array:', e instanceof Error ? e.message : e, '\n')
  }

  // TEST 3: What does Grist ACCEPT for RefList with 'L' format?
  console.log("=== TEST 3: ['L', ...] format for RefList ===")
  try {
    await client.post(`/docs/${context.docId}/tables/Tasks/records`, {
      records: [{ fields: { Title: 'Test 3', Reviewers: ['L', ids[0], ids[2]] } }]
    })
    console.log("✅ Grist ACCEPTS ['L', ...] format for RefList\n")
  } catch (e) {
    console.log("❌ Grist REJECTS ['L', ...] format:", e instanceof Error ? e.message : e, '\n')
  }

  // TEST 4: What does Grist RETURN?
  console.log('=== TEST 4: What does Grist RETURN? ===')
  const tasks = await client.get<RawApiRecordsResponse>(
    `/docs/${context.docId}/tables/Tasks/records`
  )
  console.log('Total tasks:', tasks.records.length)

  tasks.records.forEach((record, index) => {
    console.log(`\nTask ${index + 1}: "${record.fields.Title}"`)
    console.log(
      '  AssignedTo:',
      JSON.stringify(record.fields.AssignedTo),
      `(type: ${typeof record.fields.AssignedTo})`
    )
    console.log('  Reviewers:', JSON.stringify(record.fields.Reviewers))
  })

  await cleanupTestContext(context)
}

main().catch(console.error)
