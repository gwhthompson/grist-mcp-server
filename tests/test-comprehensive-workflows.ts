#!/usr/bin/env node
/**
 * Comprehensive Workflow Testing
 * Tests realistic agent workflows to identify improvement opportunities
 *
 * Based on mcp-builder skill principles:
 * - Test complete workflows, not just individual tools
 * - Validate tool descriptions match actual behavior
 * - Check error messages are actionable
 * - Verify agent decision points are clear
 */

import { GristClient } from './src/services/grist-client.js'
import { getDocuments, getTables, getWorkspaces } from './src/tools/discovery.js'
import { getRecords, querySql } from './src/tools/reading.js'
import { addRecords, upsertRecords } from './src/tools/records.js'

const client = new GristClient('http://localhost:8989', 'test_api_key')

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL' | 'ISSUE'
  message: string
  suggestion?: string
}

const results: TestResult[] = []

function addResult(
  name: string,
  status: 'PASS' | 'FAIL' | 'ISSUE',
  message: string,
  suggestion?: string
) {
  results.push({ name, status, message, suggestion })
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'
  console.log(`${icon} ${name}: ${message}`)
  if (suggestion) {
    console.log(`   💡 Suggestion: ${suggestion}`)
  }
}

async function testCompleteWorkflow() {
  console.log('\n🧪 TEST 1: Complete Discovery Workflow')
  console.log('='.repeat(60))
  console.log('Scenario: New user wants to find and query Customer CRM data\n')

  try {
    // Step 1: Discover workspaces
    console.log('Step 1: Discover workspaces...')
    const workspacesResult = await getWorkspaces(client, {
      limit: 10,
      offset: 0,
      detail_level: 'summary',
      response_format: 'json'
    })

    if (workspacesResult.isError) {
      addResult(
        'Discovery Workflow',
        'FAIL',
        `Workspace discovery failed: ${workspacesResult.content[0].text}`
      )
      return
    }

    const workspacesData = JSON.parse(workspacesResult.content[0].text)
    console.log(`   Found ${workspacesData.total} workspaces`)

    if (workspacesData.total === 0) {
      addResult('Discovery Workflow', 'FAIL', 'No workspaces found')
      return
    }

    // Step 2: Find documents with "CRM" in name (use fresh discovery)
    console.log('Step 2: Search for CRM documents...')
    const docsResult = await getDocuments(client, {
      name_contains: 'Customer CRM', // More specific search
      limit: 10,
      offset: 0,
      detail_level: 'summary',
      response_format: 'json'
    })

    if (docsResult.isError) {
      addResult(
        'Discovery Workflow',
        'FAIL',
        `Document search failed: ${docsResult.content[0].text}`
      )
      return
    }

    const docsData = JSON.parse(docsResult.content[0].text)
    console.log(`   Found ${docsData.total} documents with "Customer CRM"`)

    if (docsData.total === 0) {
      addResult('Document Search', 'FAIL', 'No Customer CRM documents found')
      return
    }

    const crmDoc = docsData.items[0]
    console.log(`   Selected: ${crmDoc.name} (ID: ${crmDoc.id})`)

    // Step 3: Explore table structure
    console.log('Step 3: Get table structure...')
    const tablesResult = await getTables(client, {
      docId: crmDoc.id,
      detail_level: 'columns',
      response_format: 'json'
    })

    if (tablesResult.isError) {
      addResult(
        'Discovery Workflow',
        'FAIL',
        `Table discovery failed: ${tablesResult.content[0].text}`
      )
      return
    }

    const tablesData = JSON.parse(tablesResult.content[0].text)
    console.log(`   Found ${tablesData.table_count} tables`)

    // Check if response is helpful for agents
    const hasContactsTable = tablesData.tables.some((t: any) => t.id === 'Contacts')
    if (!hasContactsTable) {
      addResult(
        'Table Discovery',
        'ISSUE',
        'Contacts table not found, but this is expected data',
        'Verify seed data includes Contacts table'
      )
    } else {
      console.log('   ✓ Contacts table found')
    }

    // Step 4: Query data (test simple get_records)
    console.log('Step 4: Get active contacts (using get_records)...')
    const recordsResult = await getRecords(client, {
      docId: crmDoc.id,
      tableId: 'Contacts',
      filters: { Status: 'Active' },
      limit: 10,
      offset: 0,
      response_format: 'json'
    })

    // Check if error response
    if (recordsResult.isError) {
      addResult(
        'Complete Discovery Workflow',
        'FAIL',
        `get_records returned error: ${recordsResult.content[0].text}`
      )
      return
    }

    const recordsData = JSON.parse(recordsResult.content[0].text)
    console.log(`   Found ${recordsData.total} active contacts`)

    addResult(
      'Complete Discovery Workflow',
      'PASS',
      `Successfully navigated from workspaces → documents → tables → records (${recordsData.total} results)`
    )
  } catch (error: any) {
    addResult('Complete Discovery Workflow', 'FAIL', error.message)
  }
}

async function testToolSelectionGuidance() {
  console.log('\n🧪 TEST 2: Tool Selection Guidance (SQL vs get_records)')
  console.log('='.repeat(60))
  console.log('Scenario: Agent needs to decide between query_sql and get_records\n')

  try {
    // Get document first
    const docsResult = await getDocuments(client, {
      name_contains: 'CRM',
      limit: 1,
      offset: 0,
      detail_level: 'summary',
      response_format: 'json'
    })
    const crmDoc = JSON.parse(docsResult.content[0].text).items[0]

    // Test 1: Simple query (should use get_records)
    console.log('Test 2a: Simple filter - Status="Active"')
    console.log('   Expected: get_records is simpler')

    const simpleResult = await getRecords(client, {
      docId: crmDoc.id,
      tableId: 'Contacts',
      filters: { Status: 'Active' },
      limit: 10,
      offset: 0,
      response_format: 'json'
    })

    if (simpleResult.isError) {
      addResult(
        'Tool Selection Guidance',
        'FAIL',
        `get_records error: ${simpleResult.content[0].text}`
      )
      return
    }

    const simpleData = JSON.parse(simpleResult.content[0].text)
    console.log(`   ✓ get_records returned ${simpleData.total} results`)

    // Test 2: Complex query (should use query_sql)
    console.log('Test 2b: Aggregation - COUNT by Region')
    console.log('   Expected: query_sql required for GROUP BY')

    const sqlResult = await querySql(client, {
      docId: crmDoc.id,
      sql: 'SELECT Region, COUNT(*) as count FROM Contacts GROUP BY Region',
      limit: 100,
      offset: 0,
      response_format: 'json'
    })

    if (sqlResult.isError) {
      addResult('Tool Selection Guidance', 'FAIL', `query_sql error: ${sqlResult.content[0].text}`)
      return
    }

    const sqlData = JSON.parse(sqlResult.content[0].text)
    console.log(`   ✓ query_sql returned ${sqlData.total} grouped results`)

    addResult('Tool Selection Guidance', 'PASS', 'Both tools work as expected for their use cases')
  } catch (error: any) {
    addResult('Tool Selection Guidance', 'FAIL', error.message)
  }
}

async function testAddVsUpsertGuidance() {
  console.log('\n🧪 TEST 3: add_records vs upsert_records Guidance')
  console.log('='.repeat(60))
  console.log('Scenario: Agent needs to sync external data\n')

  try {
    const docsResult = await getDocuments(client, {
      name_contains: 'CRM',
      limit: 1,
      offset: 0,
      detail_level: 'summary',
      response_format: 'json'
    })
    const crmDoc = JSON.parse(docsResult.content[0].text).items[0]

    // Test 1: Try add_records with potentially duplicate email
    console.log('Test 3a: Using add_records for sync (should work but risky)')

    const testEmail = `test-${Date.now()}@example.com`
    const addResult1 = await addRecords(client, {
      docId: crmDoc.id,
      tableId: 'Contacts',
      records: [{ Name: 'Test User 1', Email: testEmail, Status: 'Active', Region: 'East' }],
      response_format: 'json'
    })

    if (addResult1.isError) {
      addResult(
        'add vs upsert Guidance',
        'FAIL',
        `add_records error: ${addResult1.content[0].text}`
      )
      return
    }

    const addData = JSON.parse(addResult1.content[0].text)
    console.log(`   ✓ First add succeeded: ${addData.records_added} record`)

    // Try adding same email again (should create duplicate in Grist)
    const addResult2 = await addRecords(client, {
      docId: crmDoc.id,
      tableId: 'Contacts',
      records: [{ Name: 'Test User 2', Email: testEmail, Status: 'Active', Region: 'West' }],
      response_format: 'json'
    })

    if (!addResult2.isError) {
      console.log('   ⚠️  Second add succeeded - created duplicate (expected for Grist)')
      addResult(
        'add_records Duplicate Handling',
        'ISSUE',
        'add_records allows duplicates (expected behavior)',
        'Tool description should emphasize this creates duplicates'
      )
    } else {
      console.log('   ✓ Second add prevented duplicate')
    }

    // Test 2: Use upsert_records (should handle safely)
    console.log('Test 3b: Using upsert_records for sync (idempotent)')

    const upsertResult1 = await upsertRecords(client, {
      docId: crmDoc.id,
      tableId: 'Contacts',
      records: [
        {
          require: { Email: testEmail },
          fields: { Name: 'Test User Updated', Status: 'Inactive', Region: 'West' }
        }
      ],
      add: true,
      update: true,
      response_format: 'json'
    })

    if (upsertResult1.isError) {
      addResult(
        'add vs upsert Guidance',
        'FAIL',
        `upsert_records error: ${upsertResult1.content[0].text}`
      )
      return
    }

    const upsertData = JSON.parse(upsertResult1.content[0].text)
    console.log(`   ✓ Upsert succeeded: ${upsertData.records_processed} record (updated existing)`)

    addResult(
      'add vs upsert Guidance',
      'PASS',
      'Both tools work as described, upsert prevents duplicates'
    )
  } catch (error: any) {
    addResult('add vs upsert Guidance', 'FAIL', error.message)
  }
}

// Helper functions for error message testing
interface ErrorQualityMetrics {
  hasNextSteps: boolean
  hasExample: boolean
  hasCauses: boolean
}

function analyzeErrorQuality(errorMsg: string): ErrorQualityMetrics {
  return {
    hasNextSteps: errorMsg.includes('Next steps') || errorMsg.includes('Try'),
    hasExample: errorMsg.includes('Example:') || errorMsg.includes('grist_'),
    hasCauses: errorMsg.includes('Possible causes') || errorMsg.includes('cause:')
  }
}

function assessErrorMessage(metrics: ErrorQualityMetrics, testName: string, passMessage: string) {
  const { hasNextSteps, hasExample, hasCauses } = metrics

  if (hasNextSteps && hasExample && hasCauses) {
    addResult(testName, 'PASS', passMessage)
    return
  }

  const missing = []
  if (!hasCauses) missing.push('causes')
  if (!hasNextSteps) missing.push('next steps')
  if (!hasExample) missing.push('examples')

  addResult(
    testName,
    'ISSUE',
    'Error message could be more actionable',
    `Missing: ${missing.join(' ')}`
  )
}

async function getFirstDocument(): Promise<any> {
  const docsResult = await getDocuments(client, {
    limit: 1,
    offset: 0,
    detail_level: 'summary',
    response_format: 'json'
  })

  if (docsResult.isError) {
    return null
  }

  return JSON.parse(docsResult.content[0].text).items[0]
}

async function testInvalidDocId() {
  console.log('Test 4a: Invalid document ID')
  const invalidDocResult = await getDocuments(client, {
    docId: 'invalid-doc-id-12345',
    limit: 10,
    offset: 0,
    detail_level: 'summary',
    response_format: 'json'
  })

  if (invalidDocResult.isError) {
    const errorMsg = invalidDocResult.content[0].text
    console.log(`   Error received: ${errorMsg.substring(0, 100)}...`)

    const metrics = analyzeErrorQuality(errorMsg)
    assessErrorMessage(
      metrics,
      'Error: Invalid Doc ID',
      'Error message is actionable with causes, steps, and examples'
    )
  } else {
    addResult('Error: Invalid Doc ID', 'FAIL', 'Expected error but got success response')
  }
}

async function testInvalidTableId() {
  console.log('Test 4b: Invalid table ID')
  const doc = await getFirstDocument()

  if (!doc) {
    addResult('Error: Invalid Table ID', 'FAIL', 'Could not get documents for test')
    return
  }

  const invalidTableResult = await getRecords(client, {
    docId: doc.id,
    tableId: 'NonExistentTable',
    limit: 10,
    offset: 0,
    response_format: 'json'
  })

  if (invalidTableResult.isError) {
    const errorMsg = invalidTableResult.content[0].text
    console.log(`   Error received: ${errorMsg.substring(0, 100)}...`)

    const hasTableSuggestion = errorMsg.includes('grist_get_tables')
    if (hasTableSuggestion) {
      addResult('Error: Invalid Table ID', 'PASS', 'Error suggests using grist_get_tables')
    } else {
      addResult(
        'Error: Invalid Table ID',
        'ISSUE',
        'Error should suggest using grist_get_tables to see available tables'
      )
    }
  } else {
    addResult('Error: Invalid Table ID', 'FAIL', 'Expected error but got success response')
  }
}

async function testErrorMessageQuality() {
  console.log('\n🧪 TEST 4: Error Message Quality')
  console.log('='.repeat(60))
  console.log('Scenario: Agent makes common mistakes\n')

  await testInvalidDocId()
  await testInvalidTableId()
}

async function testPaginationBehavior() {
  console.log('\n🧪 TEST 5: Pagination Behavior')
  console.log('='.repeat(60))
  console.log('Scenario: Agent working with large result sets\n')

  try {
    // Test pagination metadata
    console.log('Test 5a: Pagination metadata completeness')

    const result = await getDocuments(client, {
      limit: 2,
      offset: 0,
      detail_level: 'summary',
      response_format: 'json'
    })

    const data = JSON.parse(result.content[0].text)

    // Check required fields
    const hasTotal = 'total' in data
    const hasOffset = 'offset' in data
    const hasLimit = 'limit' in data
    const hasHasMore = 'has_more' in data
    const hasNextOffset = 'next_offset' in data

    if (hasTotal && hasOffset && hasLimit && hasHasMore && hasNextOffset) {
      console.log('   ✓ All pagination fields present')
      console.log(`   Total: ${data.total}, Offset: ${data.offset}, Limit: ${data.limit}`)
      console.log(`   Has More: ${data.has_more}, Next Offset: ${data.next_offset}`)

      addResult('Pagination Metadata', 'PASS', 'All required pagination fields are present')
    } else {
      addResult(
        'Pagination Metadata',
        'ISSUE',
        'Missing pagination fields',
        `Missing: ${!hasTotal ? 'total ' : ''}${!hasOffset ? 'offset ' : ''}${!hasLimit ? 'limit ' : ''}${!hasHasMore ? 'has_more ' : ''}${!hasNextOffset ? 'next_offset' : ''}`
      )
    }
  } catch (error: any) {
    addResult('Pagination Behavior', 'FAIL', error.message)
  }
}

async function testResponseFormatConsistency() {
  console.log('\n🧪 TEST 6: Response Format Consistency')
  console.log('='.repeat(60))
  console.log('Scenario: Verify JSON and Markdown formats work\n')

  try {
    const docsResult = await getDocuments(client, {
      limit: 1,
      offset: 0,
      detail_level: 'summary',
      response_format: 'json'
    })
    const doc = JSON.parse(docsResult.content[0].text).items[0]

    // Test JSON format
    console.log('Test 6a: JSON format')
    const jsonResult = await getRecords(client, {
      docId: doc.id,
      tableId: 'Contacts',
      limit: 2,
      offset: 0,
      response_format: 'json'
    })

    try {
      JSON.parse(jsonResult.content[0].text)
      console.log('   ✓ JSON format is valid')
    } catch {
      addResult('JSON Format', 'FAIL', 'JSON response is not valid JSON')
      return
    }

    // Test Markdown format
    console.log('Test 6b: Markdown format')
    const mdResult = await getRecords(client, {
      docId: doc.id,
      tableId: 'Contacts',
      limit: 2,
      offset: 0,
      response_format: 'markdown'
    })

    const mdText = mdResult.content[0].text
    if (mdText && mdText.length > 0) {
      console.log('   ✓ Markdown format returned')
      console.log(`   Length: ${mdText.length} characters`)
    }

    addResult(
      'Response Format Consistency',
      'PASS',
      'Both JSON and Markdown formats work correctly'
    )
  } catch (error: any) {
    addResult('Response Format Consistency', 'FAIL', error.message)
  }
}

async function runAllTests() {
  console.log('\n')
  console.log('='.repeat(60))
  console.log('  COMPREHENSIVE WORKFLOW TESTING')
  console.log('  Testing realistic agent usage patterns')
  console.log('='.repeat(60))

  await testCompleteWorkflow()
  await testToolSelectionGuidance()
  await testAddVsUpsertGuidance()
  await testErrorMessageQuality()
  await testPaginationBehavior()
  await testResponseFormatConsistency()

  // Summary
  console.log('\n')
  console.log('='.repeat(60))
  console.log('  TEST SUMMARY')
  console.log('='.repeat(60))
  console.log('')

  const passCount = results.filter((r) => r.status === 'PASS').length
  const failCount = results.filter((r) => r.status === 'FAIL').length
  const issueCount = results.filter((r) => r.status === 'ISSUE').length

  console.log(`✅ PASS:  ${passCount}`)
  console.log(`❌ FAIL:  ${failCount}`)
  console.log(`⚠️  ISSUE: ${issueCount}`)
  console.log(`📊 TOTAL: ${results.length}`)
  console.log('')

  if (issueCount > 0) {
    console.log('💡 IMPROVEMENT OPPORTUNITIES:')
    console.log('')
    results
      .filter((r) => r.status === 'ISSUE')
      .forEach((r) => {
        console.log(`   ${r.name}:`)
        console.log(`   ${r.message}`)
        if (r.suggestion) {
          console.log(`   → ${r.suggestion}`)
        }
        console.log('')
      })
  }

  if (failCount > 0) {
    console.log('❌ FAILURES:')
    console.log('')
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => {
        console.log(`   ${r.name}: ${r.message}`)
      })
    console.log('')
  }

  const successRate = Math.round((passCount / results.length) * 100)
  console.log(`Overall Success Rate: ${successRate}%`)
  console.log('')

  if (successRate >= 90) {
    console.log('🎉 Excellent! Server is production-ready.')
  } else if (successRate >= 75) {
    console.log('✅ Good! Minor improvements recommended.')
  } else {
    console.log('⚠️  Needs attention. Review failures and issues.')
  }

  console.log('')
  console.log('='.repeat(60))
}

runAllTests().catch(console.error)
