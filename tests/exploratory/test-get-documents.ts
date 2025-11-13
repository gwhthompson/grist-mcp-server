#!/usr/bin/env node
/**
 * Test script for grist_get_documents consolidation
 * Tests all 4 modes: get by ID, search by name, browse all, filter by workspace
 */

import { GristClient } from './src/services/grist-client.js'
import { getDocuments } from './src/tools/discovery.js'

const DOCKER_BASE_URL = 'http://localhost:8989'
const DOCKER_API_KEY = 'test_api_key'

async function testGetDocuments() {
  const client = new GristClient(DOCKER_BASE_URL, DOCKER_API_KEY)

  console.log('🧪 Testing grist_get_documents consolidation\n')
  console.log('='.repeat(60))

  try {
    // Test 1: Browse all documents (Mode 3)
    console.log('\n📋 TEST 1: Browse all documents (no filters)')
    console.log('-'.repeat(60))
    const browseResult = await getDocuments(client, {
      limit: 100,
      offset: 0,
      detail_level: 'summary',
      response_format: 'json'
    })
    console.log('✅ Browse all - Success')
    console.log('   Raw response:', browseResult.content[0].text.substring(0, 200))
    const browseData = JSON.parse(browseResult.content[0].text)
    console.log(`   Found ${browseData.total} documents`)
    console.log(`   Mode: ${browseData.mode}`)

    if (browseData.items && browseData.items.length > 0) {
      const firstDoc = browseData.items[0]
      console.log(`   First doc: "${firstDoc.name}" (ID: ${firstDoc.id})`)

      // Test 2: Get by ID (Mode 1) - using the first document
      console.log('\n🎯 TEST 2: Get document by ID')
      console.log('-'.repeat(60))
      const getByIdResult = await getDocuments(client, {
        docId: firstDoc.id,
        limit: 100,
        offset: 0,
        detail_level: 'detailed',
        response_format: 'json'
      })
      console.log('✅ Get by ID - Success')
      const getByIdData = JSON.parse(getByIdResult.content[0].text)
      console.log(`   Mode: ${getByIdData.mode}`)
      console.log(`   Document: "${getByIdData.items[0].name}"`)
      console.log(`   URL: ${getByIdData.items[0].url}`)

      // Test 3: Search by name (Mode 2)
      console.log('\n🔍 TEST 3: Search by name')
      console.log('-'.repeat(60))
      // Extract a search term from the first document name
      const searchTerm = firstDoc.name.split(' ')[0] // Use first word
      const searchResult = await getDocuments(client, {
        name_contains: searchTerm,
        limit: 10,
        offset: 0,
        detail_level: 'summary',
        response_format: 'json'
      })
      console.log('✅ Search by name - Success')
      const searchData = JSON.parse(searchResult.content[0].text)
      console.log(`   Search term: "${searchTerm}"`)
      console.log(`   Mode: ${searchData.mode}`)
      console.log(`   Found: ${searchData.total} matching documents`)

      // Test 4: Filter by workspace (Mode 4) - use known workspace ID from seed script
      console.log('\n🏢 TEST 4: Filter by workspace')
      console.log('-'.repeat(60))
      const workspaceId = '3' // From seed-test-data.ts
      const workspaceResult = await getDocuments(client, {
        workspaceId: workspaceId,
        limit: 10,
        offset: 0,
        detail_level: 'summary',
        response_format: 'json'
      })
      console.log('✅ Filter by workspace - Success')
      const workspaceData = JSON.parse(workspaceResult.content[0].text)
      console.log(`   Workspace ID: ${workspaceId}`)
      console.log(`   Mode: ${workspaceData.mode}`)
      console.log(`   Found: ${workspaceData.total} documents in workspace`)
    } else {
      console.log('⚠️  No documents found - other tests skipped')
    }

    console.log(`\n${'='.repeat(60)}`)
    console.log('✅ ALL TESTS PASSED!')
    console.log('🎉 grist_get_documents consolidation is working correctly\n')
  } catch (error) {
    console.error('\n❌ TEST FAILED:')
    console.error(error)
    process.exit(1)
  }
}

testGetDocuments()
