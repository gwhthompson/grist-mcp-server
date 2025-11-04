/**
 * Debug document creation
 */

import { GristClient } from './src/services/grist-client.js'
import { createDocument } from './src/tools/documents.js'

const apiKey = 'test_api_key'
const baseUrl = 'http://localhost:8989'
const client = new GristClient(baseUrl, apiKey)

async function testCreateDoc() {
  console.log('Testing document creation...')

  const result = await createDocument(client, {
    name: 'Test Document',
    workspaceId: '3',
    response_format: 'json'
  })

  console.log('Full result:', JSON.stringify(result, null, 2))
  console.log('\nstructuredContent:', result.structuredContent)
}

testCreateDoc().catch((error) => {
  console.error('Error:', error.message)
  console.error('Stack:', error.stack)
})
