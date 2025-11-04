#!/usr/bin/env tsx

/**
 * User Experience Test for Grist MCP Server
 *
 * This script simulates realistic user workflows to identify:
 * - Usability issues
 * - Missing features
 * - Error handling quality
 * - Response format effectiveness
 * - Tool discoverability
 */

import { formatToolResponse } from './src/services/formatter.js'
import { GristClient } from './src/services/grist-client.js'

const API_KEY = process.env.GRIST_API_KEY || 'test_api_key'
const BASE_URL = process.env.GRIST_BASE_URL || 'http://localhost:8989'

interface TestResult {
  workflow: string
  scenario: string
  success: boolean
  issues: string[]
  strengths: string[]
  suggestions: string[]
}

const results: TestResult[] = []

function logTest(workflow: string, scenario: string) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`Testing: ${workflow} - ${scenario}`)
  console.log('='.repeat(80))
}

function addResult(result: TestResult) {
  results.push(result)
  console.log(`\n✓ ${result.success ? 'SUCCESS' : 'ISSUES FOUND'}`)
  if (result.issues.length > 0) {
    console.log('\nIssues:')
    result.issues.forEach((i) => {
      console.log(`  - ${i}`)
    })
  }
  if (result.suggestions.length > 0) {
    console.log('\nSuggestions:')
    result.suggestions.forEach((s) => {
      console.log(`  - ${s}`)
    })
  }
}

// Common helper functions to reduce duplication
async function getFirstAvailableDocument(client: GristClient): Promise<string | null> {
  const orgsResponse = await client.get('/api/orgs')
  const orgId = orgsResponse[0]?.id
  if (!orgId) return null

  const workspacesResponse = await client.get(`/api/orgs/${orgId}/workspaces`)
  const workspaceId = workspacesResponse[0]?.id
  if (!workspaceId) return null

  const docsResponse = await client.get(`/api/workspaces/${workspaceId}/docs`)
  return docsResponse[0]?.id || null
}

async function getTablesForDocument(client: GristClient, docId: string) {
  return await client.get(`/api/docs/${docId}/tables`)
}

async function getColumnsForTable(client: GristClient, docId: string, tableId: string) {
  return await client.get(`/api/docs/${docId}/tables/${tableId}/columns`)
}

async function testWorkflow1_Discovery() {
  const workflow = 'Discovery & Navigation'
  logTest(workflow, 'New user finding their documents')

  const issues: string[] = []
  const strengths: string[] = []
  const suggestions: string[] = []

  const client = new GristClient(BASE_URL, API_KEY)

  try {
    // Scenario: User asks "What documents do I have access to?"
    console.log('\n1. Listing workspaces...')
    const orgsResponse = await client.get('/api/orgs')
    console.log(`Found ${orgsResponse.length} organizations`)

    // Issue: User needs to understand org -> workspace -> document hierarchy
    if (orgsResponse.length > 0) {
      strengths.push('Organizations listed successfully')
    } else {
      issues.push('No organizations found - unclear what to do next')
    }

    console.log('\n2. Getting workspaces from first org...')
    const orgId = orgsResponse[0]?.id
    if (!orgId) {
      issues.push('Cannot proceed without org ID')
      return
    }

    const workspacesResponse = await client.get(`/api/orgs/${orgId}/workspaces`)
    console.log(`Found ${workspacesResponse.length} workspaces`)

    if (workspacesResponse.length === 0) {
      issues.push("Empty workspace list - user doesn't know if this is normal or an error")
      suggestions.push("Add guidance: 'No workspaces found. Create one at [URL]'")
    }

    console.log('\n3. Listing documents in first workspace...')
    const workspaceId = workspacesResponse[0]?.id
    const docsResponse = await client.get(`/api/workspaces/${workspaceId}/docs`)
    console.log(`Found ${docsResponse.length} documents`)

    if (docsResponse.length > 0) {
      strengths.push(`Successfully discovered ${docsResponse.length} documents`)
    }

    addResult({
      workflow,
      scenario: 'Discovery workflow',
      success: true,
      issues,
      strengths,
      suggestions
    })
  } catch (error) {
    issues.push(`Error during discovery: ${error.message}`)
    addResult({
      workflow,
      scenario: 'Discovery workflow',
      success: false,
      issues,
      strengths,
      suggestions
    })
  }
}

function validateChoiceColumns(columns: any[], issues: string[], suggestions: string[]) {
  const choiceColumns = columns.filter(
    (col: any) => col.fields?.type === 'Choice' || col.fields?.type === 'ChoiceList'
  )

  if (choiceColumns.length > 0) {
    console.log('\n3. Checking Choice column widgetOptions...')
    choiceColumns.forEach((col: any) => {
      console.log(`  - ${col.id}: ${JSON.stringify(col.fields?.widgetOptions)}`)

      if (col.fields?.widgetOptions === '') {
        issues.push(
          `Empty widgetOptions string for Choice column ${col.id} - may cause parsing errors`
        )
        suggestions.push('Handle empty widgetOptions strings before JSON.parse()')
      }
    })
  }
}

async function testWorkflow2_SchemaUnderstanding() {
  const workflow = 'Schema Understanding'
  logTest(workflow, 'User wants to understand table structure')

  const issues: string[] = []
  const strengths: string[] = []
  const suggestions: string[] = []
  const client = new GristClient(BASE_URL, API_KEY)

  try {
    const docId = await getFirstAvailableDocument(client)
    if (!docId) {
      issues.push('No documents available for testing')
      addResult({
        workflow,
        scenario: 'Schema understanding',
        success: false,
        issues,
        strengths,
        suggestions
      })
      return
    }

    // Test table listing
    console.log(`\n1. Getting tables for document: ${docId}`)
    const tablesResponse = await getTablesForDocument(client, docId)
    console.log(`Found ${tablesResponse.tables?.length || 0} tables`)

    if (!tablesResponse.tables || tablesResponse.tables.length === 0) {
      issues.push('No table information returned')
    } else {
      console.log('\nTables found:')
      tablesResponse.tables.forEach((t: any) => {
        console.log(`  - ${t.id}`)
      })
      strengths.push('Tables listed successfully')
    }

    // Test column details
    const tableId = tablesResponse.tables?.[0]?.id
    if (tableId) {
      console.log(`\n2. Getting columns for table: ${tableId}`)
      try {
        const columnsResponse = await getColumnsForTable(client, docId, tableId)
        console.log(`Found ${columnsResponse.columns?.length || 0} columns`)

        if (columnsResponse.columns && columnsResponse.columns.length > 0) {
          console.log('\nColumns:')
          columnsResponse.columns.forEach((col: any) => {
            console.log(`  - ${col.id} (${col.fields?.type || 'unknown type'})`)
          })
          strengths.push('Column details retrieved successfully')
          validateChoiceColumns(columnsResponse.columns, issues, suggestions)
        } else {
          issues.push('No columns returned for table')
          suggestions.push('Verify /tables/{tableId}/columns endpoint returns data')
        }
      } catch (error) {
        issues.push(`Failed to get columns: ${error.message}`)
      }
    }

    addResult({
      workflow,
      scenario: 'Schema understanding',
      success: issues.length === 0,
      issues,
      strengths,
      suggestions
    })
  } catch (error) {
    issues.push(`Error during schema exploration: ${error.message}`)
    addResult({
      workflow,
      scenario: 'Schema understanding',
      success: false,
      issues,
      strengths,
      suggestions
    })
  }
}

async function testWorkflow3_DataQuery() {
  const workflow = 'Data Querying'
  logTest(workflow, 'User wants to query and filter data')

  const issues: string[] = []
  const strengths: string[] = []
  const suggestions: string[] = []

  const client = new GristClient(BASE_URL, API_KEY)

  try {
    // Get document and table
    const orgsResponse = await client.get('/api/orgs')
    const orgId = orgsResponse[0]?.id
    const workspacesResponse = await client.get(`/api/orgs/${orgId}/workspaces`)
    const workspaceId = workspacesResponse[0]?.id
    const docsResponse = await client.get(`/api/workspaces/${workspaceId}/docs`)
    const docId = docsResponse.find((d: any) => d.name === 'Customer CRM')?.id

    if (!docId) {
      issues.push('Cannot find test document')
      addResult({
        workflow,
        scenario: 'Data querying',
        success: false,
        issues,
        strengths,
        suggestions
      })
      return
    }

    console.log('\n1. Testing simple SQL query...')
    try {
      const sqlResult = await client.post(`/api/docs/${docId}/sql`, {
        sql: 'SELECT * FROM Contacts LIMIT 3'
      })

      console.log(`Query returned ${sqlResult.length} records`)
      if (sqlResult.length > 0) {
        console.log('\nSample record structure:')
        console.log(JSON.stringify(sqlResult[0], null, 2))
        strengths.push('SQL queries work correctly')
      }

      // Check if response is user-friendly
      if (sqlResult[0]?.fields) {
        issues.push("SQL response uses nested 'fields' structure - not intuitive")
        suggestions.push(
          "Flatten SQL response to direct field access: {Name: 'Alice'} instead of {fields: {Name: 'Alice'}}"
        )
      }
    } catch (error) {
      issues.push(`SQL query failed: ${error.message}`)
    }

    console.log('\n2. Testing get_records endpoint...')
    try {
      const recordsResult = await client.get(`/api/docs/${docId}/tables/Contacts/records`)
      console.log(`GET /records returned ${recordsResult.records?.length || 0} records`)

      if (recordsResult.records && recordsResult.records.length > 0) {
        strengths.push('GET /records endpoint works')
        console.log('\nRecord structure:')
        console.log(JSON.stringify(recordsResult.records[0], null, 2))
      }
    } catch (error) {
      issues.push(`GET /records failed: ${error.message}`)
    }

    console.log('\n3. Testing filtered query...')
    try {
      const filteredResult = await client.post(`/api/docs/${docId}/sql`, {
        sql: 'SELECT * FROM Contacts WHERE Status = ?',
        args: ['Active']
      })

      console.log(`Filtered query returned ${filteredResult.length} records`)
      if (filteredResult.length > 0) {
        strengths.push('Parameterized queries work correctly')
      }
    } catch (error) {
      issues.push(`Filtered query failed: ${error.message}`)
    }

    addResult({
      workflow,
      scenario: 'Data querying',
      success: issues.length === 0,
      issues,
      strengths,
      suggestions
    })
  } catch (error) {
    issues.push(`Error during data query test: ${error.message}`)
    addResult({
      workflow,
      scenario: 'Data querying',
      success: false,
      issues,
      strengths,
      suggestions
    })
  }
}

async function testInvalidDocError(
  client: GristClient,
  issues: string[],
  strengths: string[],
  suggestions: string[]
) {
  console.log('\n1. Testing invalid document ID...')
  try {
    await client.get('/api/docs/invalid_doc_id_12345/tables')
    issues.push('Should have thrown error for invalid doc ID')
  } catch (error) {
    console.log(`Error message: ${error.message}`)

    if (error.message.includes('Try') || error.message.includes('try')) {
      strengths.push('Error message includes actionable guidance')
    } else {
      issues.push('Error message lacks actionable next steps')
      suggestions.push("Add 'Try grist_list_documents to find valid document IDs'")
    }

    if (error.message.toLowerCase().includes('docs not found')) {
      issues.push("Error says 'docs not found' instead of 'document not found'")
      suggestions.push("Fix grammar: 'docs' → 'document'")
    }
  }
}

async function testInvalidTableError(
  client: GristClient,
  issues: string[],
  strengths: string[],
  suggestions: string[]
) {
  console.log('\n2. Testing invalid table ID...')
  try {
    const docId = await getFirstAvailableDocument(client)
    if (!docId) return

    await client.get(`/api/docs/${docId}/tables/NonExistentTable/records`)
    issues.push('Should have thrown error for invalid table ID')
  } catch (error) {
    console.log(`Error message: ${error.message}`)

    if (error.message.includes('grist_get_tables')) {
      strengths.push('Error suggests using grist_get_tables to discover tables')
    } else {
      suggestions.push("Suggest 'Use grist_get_tables to see available tables'")
    }
  }
}

async function testMalformedSQLError(
  client: GristClient,
  issues: string[],
  strengths: string[],
  suggestions: string[]
) {
  console.log('\n3. Testing malformed SQL...')
  try {
    const docId = await getFirstAvailableDocument(client)
    if (!docId) return

    await client.post(`/api/docs/${docId}/sql`, { sql: 'SELECT * FROM WHERE' })
    issues.push('Should have thrown error for malformed SQL')
  } catch (error) {
    console.log(`Error message: ${error.message}`)

    if (error.message.includes('syntax')) {
      strengths.push('SQL syntax errors are reported clearly')
    }

    if (!error.message.includes('example') && !error.message.includes('Example')) {
      suggestions.push(
        "Include SQL example in error: 'Example: SELECT * FROM TableName WHERE column = value'"
      )
    }
  }
}

async function testWorkflow4_ErrorHandling() {
  const workflow = 'Error Handling'
  logTest(workflow, 'Testing error messages and guidance')

  const issues: string[] = []
  const strengths: string[] = []
  const suggestions: string[] = []
  const client = new GristClient(BASE_URL, API_KEY)

  await testInvalidDocError(client, issues, strengths, suggestions)
  await testInvalidTableError(client, issues, strengths, suggestions)
  await testMalformedSQLError(client, issues, strengths, suggestions)

  addResult({ workflow, scenario: 'Error handling', success: true, issues, strengths, suggestions })
}

async function testWorkflow5_ResponseFormats() {
  const workflow = 'Response Formats'
  logTest(workflow, 'Testing JSON vs Markdown readability')

  const issues: string[] = []
  const strengths: string[] = []
  const suggestions: string[] = []

  const client = new GristClient(BASE_URL, API_KEY)

  try {
    const orgsResponse = await client.get('/api/orgs')
    const orgId = orgsResponse[0]?.id
    const workspacesResponse = await client.get(`/api/orgs/${orgId}/workspaces`)
    const workspaceId = workspacesResponse[0]?.id
    const docsResponse = await client.get(`/api/workspaces/${workspaceId}/docs`)

    console.log('\n1. Testing JSON format...')
    const jsonFormat = formatToolResponse(docsResponse, 'json')
    console.log(`JSON response length: ${jsonFormat.content[0].text.length} chars`)

    if (jsonFormat.structuredContent) {
      strengths.push('structuredContent included for programmatic access')
    } else {
      issues.push('Missing structuredContent in response')
    }

    console.log('\n2. Testing Markdown format...')
    const markdownFormat = formatToolResponse(docsResponse, 'markdown')
    console.log(`Markdown response length: ${markdownFormat.content[0].text.length} chars`)
    console.log('\nMarkdown preview:')
    console.log(`${markdownFormat.content[0].text.substring(0, 300)}...`)

    // Check markdown quality
    const mdText = markdownFormat.content[0].text
    if (mdText.includes('# ') || mdText.includes('## ')) {
      strengths.push('Markdown uses proper headers')
    } else {
      issues.push('Markdown lacks clear structure with headers')
      suggestions.push("Add headers like '# Documents', '## Document Details'")
    }

    if (mdText.includes('**') || mdText.includes('*')) {
      strengths.push('Markdown uses emphasis for important fields')
    } else {
      suggestions.push('Use bold (**) for key fields like document names')
    }

    if (mdText.includes('```')) {
      strengths.push('Code blocks used appropriately')
    }

    console.log('\n3. Comparing readability...')
    const jsonLines = jsonFormat.content[0].text.split('\n').length
    const markdownLines = markdownFormat.content[0].text.split('\n').length

    console.log(`JSON: ${jsonLines} lines, Markdown: ${markdownLines} lines`)

    if (markdownLines < jsonLines * 0.7) {
      strengths.push('Markdown is more concise than JSON')
    } else {
      suggestions.push('Consider making Markdown more concise for better readability')
    }

    addResult({
      workflow,
      scenario: 'Response format testing',
      success: issues.length === 0,
      issues,
      strengths,
      suggestions
    })
  } catch (error) {
    issues.push(`Error during format testing: ${error.message}`)
    addResult({
      workflow,
      scenario: 'Response format testing',
      success: false,
      issues,
      strengths,
      suggestions
    })
  }
}

// Main test execution
async function main() {
  console.log(`\n${'='.repeat(80)}`)
  console.log('GRIST MCP SERVER - USER EXPERIENCE TEST')
  console.log('='.repeat(80))
  console.log(`\nBase URL: ${BASE_URL}`)
  console.log(`API Key: ${API_KEY.substring(0, 8)}...`)

  await testWorkflow1_Discovery()
  await testWorkflow2_SchemaUnderstanding()
  await testWorkflow3_DataQuery()
  await testWorkflow4_ErrorHandling()
  await testWorkflow5_ResponseFormats()

  // Summary Report
  console.log(`\n\n${'='.repeat(80)}`)
  console.log('SUMMARY REPORT')
  console.log('='.repeat(80))

  console.log(`\nTests Run: ${results.length}`)
  console.log(`Successful: ${results.filter((r) => r.success).length}`)
  console.log(`Issues Found: ${results.filter((r) => r.issues.length > 0).length}`)

  console.log('\n\n--- ALL ISSUES ---')
  const allIssues = results.flatMap((r) => r.issues.map((i) => `[${r.workflow}] ${i}`))
  allIssues.forEach((issue, i) => {
    console.log(`${i + 1}. ${issue}`)
  })

  console.log('\n\n--- ALL SUGGESTIONS ---')
  const allSuggestions = results.flatMap((r) => r.suggestions.map((s) => `[${r.workflow}] ${s}`))
  allSuggestions.forEach((sugg, i) => {
    console.log(`${i + 1}. ${sugg}`)
  })

  console.log('\n\n--- STRENGTHS ---')
  const allStrengths = results.flatMap((r) => r.strengths)
  const uniqueStrengths = [...new Set(allStrengths)]
  uniqueStrengths.forEach((strength, i) => {
    console.log(`${i + 1}. ${strength}`)
  })

  console.log(`\n\n${'='.repeat(80)}`)
  console.log('TEST COMPLETE')
  console.log('='.repeat(80))
  console.log('\nResults saved for mcp-builder skill analysis.\n')
}

main().catch(console.error)
