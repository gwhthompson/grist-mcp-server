/**
 * Test Grist Upsert API Directly
 * Investigate why upsert returns null
 */

import { ensureGristReady } from '../helpers/docker.js'
import {
  addTestRecords,
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../helpers/grist-api.js'

async function main() {
  await ensureGristReady()
  const client = createTestClient()

  const context = await createFullTestContext(client, {
    docName: 'UpsertAPITest',
    tableName: 'Contacts',
    columns: [
      { id: 'Name', fields: { type: 'Text' } },
      { id: 'Email', fields: { type: 'Text' } }
    ]
  })

  if (!context.docId) {
    throw new Error('Failed to create document - docId is missing')
  }

  // Add initial record
  const ids = await addTestRecords(client, context.docId, 'Contacts', [
    { fields: { Name: 'Alice', Email: 'alice@test.com' } }
  ])

  console.log('Initial record ID:', ids[0])

  // Test upsert API directly
  console.log('\n=== Testing Grist Upsert API ===')

  const requestBody = {
    records: [
      {
        require: { Email: 'alice@test.com' },
        fields: { Name: 'Alice Updated' }
      }
    ]
  }

  console.log('Request body:', JSON.stringify(requestBody, null, 2))

  try {
    const response = await client.put(`/docs/${context.docId}/tables/Contacts/records`, requestBody)

    console.log('\n✅ Upsert succeeded!')
    console.log('Response:', JSON.stringify(response, null, 2))
  } catch (error) {
    console.log('\n❌ Upsert failed!')
    console.log('Error:', error instanceof Error ? error.message : String(error))
  }

  await cleanupTestContext(context)
}

main().catch(console.error)
