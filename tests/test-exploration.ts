/**
 * Content Exploration Script
 *
 * Following mcp-builder Evaluation Guide Step 4:
 * - Use READ-ONLY operations only
 * - Make incremental, small, targeted tool calls
 * - Use limit parameter (<10)
 * - Explore what content exists for creating realistic evaluation questions
 */

import { GristClient } from './src/services/grist-client.js'
import { getTables, listDocuments, listWorkspaces } from './src/tools/discovery.js'
import { getRecords as getRecordsRead } from './src/tools/reading.js'

const apiKey = 'test_api_key'
const baseUrl = 'http://localhost:8989'

const client = new GristClient(baseUrl, apiKey)

async function exploreContent() {
  console.log('=== STEP 4: READ-ONLY CONTENT EXPLORATION ===\n')

  // 1. List workspaces with limit
  console.log('1. Exploring Workspaces (summary, limit: 5)')
  const workspaces = await listWorkspaces(client, {
    detail_level: 'summary',
    response_format: 'json',
    offset: 0,
    limit: 5
  })
  console.log(JSON.stringify(workspaces.structuredContent, null, 2))
  console.log('')

  // 2. List documents with limit
  console.log('2. Exploring Documents (summary, limit: 5)')
  const documents = await listDocuments(client, {
    detail_level: 'summary',
    response_format: 'json',
    offset: 0,
    limit: 5
  })
  console.log(JSON.stringify(documents.structuredContent, null, 2))
  console.log('')

  // 3. If documents exist, explore first document's tables
  if (documents.structuredContent?.documents?.length > 0) {
    const firstDoc = documents.structuredContent.documents[0]
    console.log(`3. Exploring Tables in Document: ${firstDoc.name} (${firstDoc.id})`)

    const tables = await getTables(client, {
      docId: firstDoc.id,
      detail_level: 'columns',
      response_format: 'json'
    })
    console.log(JSON.stringify(tables.structuredContent, null, 2))
    console.log('')

    // 4. If tables exist, sample first table's records (limit: 5)
    if (tables.structuredContent?.tables?.length > 0) {
      const firstTable = tables.structuredContent.tables[0]
      console.log(`4. Sampling Records from Table: ${firstTable.id} (limit: 5)`)

      const records = await getRecordsRead(client, {
        docId: firstDoc.id,
        tableId: firstTable.id,
        response_format: 'json',
        offset: 0,
        limit: 5
      })
      console.log(JSON.stringify(records.structuredContent, null, 2))
    }
  }

  console.log('\n=== EXPLORATION COMPLETE ===')
}

// Run exploration
exploreContent().catch((error) => {
  console.error('Exploration error:', error.message)
  process.exit(1)
})
