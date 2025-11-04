#!/usr/bin/env node
import { GristClient } from './src/services/grist-client.js'
import { getDocuments, getTables } from './src/tools/discovery.js'
import { getRecords } from './src/tools/reading.js'

const client = new GristClient('http://localhost:8989', 'test_api_key')

async function debug() {
  console.log('Getting fresh document...\n')

  const docsResult = await getDocuments(client, {
    name_contains: 'Customer',
    limit: 1,
    offset: 0,
    detail_level: 'summary',
    response_format: 'json'
  })

  if (docsResult.isError) {
    console.log('Error:', docsResult.content[0].text)
    return
  }

  console.log('Full docs response:')
  console.log(docsResult.content[0].text)
  console.log('\n---\n')

  const docsData = JSON.parse(docsResult.content[0].text)
  const doc = docsData.items[0]

  console.log(`Using doc: ${doc.name} (${doc.id})\n`)

  const tablesResult = await getTables(client, {
    docId: doc.id,
    detail_level: 'names',
    response_format: 'json'
  })

  if (tablesResult.isError) {
    console.log('Tables Error:', tablesResult.content[0].text)
    return
  }

  console.log('Full tables response:')
  console.log(tablesResult.content[0].text)
  console.log('\n---\n')

  const tablesData = JSON.parse(tablesResult.content[0].text)
  console.log('Tables structure:', Object.keys(tablesData))
  console.log('Tables:', tablesData.tables || tablesData.items)

  // Try get_records without filter
  console.log('\n\nTrying get_records WITHOUT filter...')
  const recordsNoFilter = await getRecords(client, {
    docId: doc.id,
    tableId: 'Contacts',
    limit: 3,
    offset: 0,
    response_format: 'json'
  })

  if (recordsNoFilter.isError) {
    console.log('Error:', recordsNoFilter.content[0].text)
  } else {
    console.log('✅ Success!')
    console.log(recordsNoFilter.content[0].text.substring(0, 300))
  }

  // Try get_records WITH filter
  console.log('\n\nTrying get_records WITH filter...')
  const recordsWithFilter = await getRecords(client, {
    docId: doc.id,
    tableId: 'Contacts',
    filters: { Status: 'Active' },
    limit: 3,
    offset: 0,
    response_format: 'json'
  })

  if (recordsWithFilter.isError) {
    console.log('Error:', recordsWithFilter.content[0].text)
  } else {
    console.log('✅ Success!')
    console.log(recordsWithFilter.content[0].text.substring(0, 300))
  }
}

debug()
