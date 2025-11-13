#!/usr/bin/env node
/**
 * Test filter format for get_records
 */

import { GristClient } from './src/services/grist-client.js'

const client = new GristClient('http://localhost:8989', 'test_api_key')

async function testFilters() {
  const docId = 'qBbArddFDSrKd2jpv3uZTj'

  console.log('Testing filter formats...\n')

  // Test 1: No filter
  try {
    const result = await client.get(`/docs/${docId}/tables/Contacts/records`, { limit: 3 })
    console.log('✅ No filter works')
    console.log(`   Records: ${result.records?.length || 0}`)
  } catch (error: unknown) {
    const err = error as { message: string }
    console.log('❌ No filter failed:', err.message)
  }

  // Test 2: Filter as JSON string
  try {
    const result = await client.get(`/docs/${docId}/tables/Contacts/records`, {
      limit: 3,
      filter: JSON.stringify({ Status: 'Active' })
    })
    console.log('✅ Filter as JSON string works')
    console.log(`   Records: ${result.records?.length || 0}`)
  } catch (error: unknown) {
    const err = error as { message: string }
    console.log('❌ Filter as JSON string failed:', err.message)
  }

  // Test 3: Check what Grist API actually expects
  console.log('\nChecking Grist API docs pattern...')
  console.log('Grist typically uses filter parameter with JSON object')
}

testFilters()
