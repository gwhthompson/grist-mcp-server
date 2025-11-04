/**
 * Deep Content Exploration - Following mcp-builder Evaluation Guide
 *
 * Explores seeded data to understand what evaluation questions can be asked
 */

import { GristClient } from './src/services/grist-client.js'
import { getTables } from './src/tools/discovery.js'
import { getRecords, querySql } from './src/tools/reading.js'

const apiKey = 'test_api_key'
const baseUrl = 'http://localhost:8989'
const client = new GristClient(baseUrl, apiKey)

const CRM_DOC_ID = 'qBbArddFDSrKd2jpv3uZTj'
const PROJECT_DOC_ID = 'e2EfGnf8sLLzncHPis8fNq'

async function exploreDeep() {
  console.log('=== DEEP CONTENT EXPLORATION ===\n')

  // Explore Customer CRM
  console.log('--- CUSTOMER CRM DOCUMENT ---')

  // Get tables with full schema
  const crmTables = await getTables(client, {
    docId: CRM_DOC_ID,
    detail_level: 'full_schema',
    response_format: 'json'
  })
  if (crmTables.isError) {
    console.log('ERROR:', crmTables.content[0].text)
  } else {
    console.log('Tables:', JSON.stringify(crmTables.structuredContent, null, 2))
  }
  console.log('')

  // Sample Contacts records (limit: 5)
  console.log('Contacts records (limit: 5):')
  const contacts = await getRecords(client, {
    docId: CRM_DOC_ID,
    tableId: 'Contacts',
    response_format: 'json',
    offset: 0,
    limit: 5
  })
  if (contacts.isError) {
    console.log('ERROR:', contacts.content[0].text)
  } else {
    console.log(JSON.stringify(contacts.structuredContent, null, 2))
  }
  console.log('')

  // Sample Deals records (limit: 5)
  console.log('Deals records (limit: 5):')
  const deals = await getRecords(client, {
    docId: CRM_DOC_ID,
    tableId: 'Deals',
    response_format: 'json',
    offset: 0,
    limit: 5
  })
  if (deals.isError) {
    console.log('ERROR:', deals.content[0].text)
  } else {
    console.log(JSON.stringify(deals.structuredContent, null, 2))
  }
  console.log('')

  // Test SQL query
  console.log('SQL: Count Active contacts by Region:')
  const sqlResult = await querySql(client, {
    docId: CRM_DOC_ID,
    sql: 'SELECT Region, COUNT(*) as Count FROM Contacts WHERE Status = "Active" GROUP BY Region',
    response_format: 'json',
    offset: 0,
    limit: 10
  })
  if (sqlResult.isError) {
    console.log('ERROR:', sqlResult.content[0].text)
  } else {
    console.log(JSON.stringify(sqlResult.structuredContent, null, 2))
  }
  console.log('')

  // Explore Project Tracker
  console.log('\n--- PROJECT TRACKER DOCUMENT ---')

  // Get tables with full schema
  const projectTables = await getTables(client, {
    docId: PROJECT_DOC_ID,
    detail_level: 'full_schema',
    response_format: 'json'
  })
  if (projectTables.isError) {
    console.log('ERROR:', projectTables.content[0].text)
  } else {
    console.log(JSON.stringify(projectTables.structuredContent, null, 2))
  }
  console.log('')

  // Sample Projects records
  console.log('Projects records (limit: 5):')
  const projects = await getRecords(client, {
    docId: PROJECT_DOC_ID,
    tableId: 'Projects',
    response_format: 'json',
    offset: 0,
    limit: 5
  })
  if (projects.isError) {
    console.log('ERROR:', projects.content[0].text)
  } else {
    console.log(JSON.stringify(projects.structuredContent, null, 2))
  }
  console.log('')

  // Sample Tasks records
  console.log('Tasks records (limit: 5):')
  const tasks = await getRecords(client, {
    docId: PROJECT_DOC_ID,
    tableId: 'Tasks',
    response_format: 'json',
    offset: 0,
    limit: 5
  })
  if (tasks.isError) {
    console.log('ERROR:', tasks.content[0].text)
  } else {
    console.log(JSON.stringify(tasks.structuredContent, null, 2))
  }
  console.log('')

  console.log('=== EXPLORATION COMPLETE ===')
}

exploreDeep().catch((error) => {
  console.error('Exploration error:', error.message)
  process.exit(1)
})
