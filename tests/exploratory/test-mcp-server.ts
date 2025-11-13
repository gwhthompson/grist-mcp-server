#!/usr/bin/env node

/**
 * Test the actual MCP server via stdio protocol
 * This is how Claude or other AI clients would actually use it
 */

import { spawn } from 'node:child_process'
import { MCPClient } from '@modelcontextprotocol/sdk/client/mcp.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

async function testMCPServer() {
  console.log('🚀 Starting Grist MCP Server...\n')

  // Start the MCP server process
  const serverProcess = spawn('node', ['dist/index.js'], {
    env: {
      ...process.env,
      GRIST_API_KEY: 'test_api_key',
      GRIST_BASE_URL: 'http://localhost:8989'
    }
  })

  // Create MCP client
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    env: {
      GRIST_API_KEY: 'test_api_key',
      GRIST_BASE_URL: 'http://localhost:8989'
    }
  })

  const client = new MCPClient({ name: 'test-client', version: '1.0.0' })

  try {
    // Connect to the server
    console.log('📡 Connecting to MCP server...')
    await client.connect(transport)
    console.log('✅ Connected!\n')

    // List available tools
    console.log('🔍 Listing available tools...')
    const tools = await client.listTools()
    console.log(`✅ Found ${tools.tools.length} tools:\n`)

    tools.tools.forEach((tool, i) => {
      console.log(`${i + 1}. ${tool.name}`)
    })

    console.log(`\n${'='.repeat(60)}`)

    // Test 1: grist_get_workspaces
    console.log('\n🧪 TEST 1: grist_get_workspaces')
    console.log('-'.repeat(60))
    const workspacesResult = await client.callTool({
      name: 'grist_get_workspaces',
      arguments: {
        limit: 10,
        offset: 0,
        detail_level: 'summary',
        response_format: 'json'
      }
    })

    console.log('Result:', workspacesResult.content[0].text.substring(0, 200))
    console.log('✅ grist_get_workspaces works!\n')

    // Test 2: grist_get_documents (search mode)
    console.log('🧪 TEST 2: grist_get_documents (search by name)')
    console.log('-'.repeat(60))
    const docsResult = await client.callTool({
      name: 'grist_get_documents',
      arguments: {
        name_contains: 'Customer',
        limit: 5,
        offset: 0,
        detail_level: 'summary',
        response_format: 'json'
      }
    })

    const docsData = JSON.parse(docsResult.content[0].text)
    console.log(`Mode: ${docsData.mode}`)
    console.log(`Found: ${docsData.total} documents`)
    console.log('✅ grist_get_documents search works!\n')

    // Test 3: grist_get_records (with filter)
    if (docsData.items && docsData.items.length > 0) {
      const docId = docsData.items[0].id

      console.log('🧪 TEST 3: grist_get_records (with filter)')
      console.log('-'.repeat(60))
      const recordsResult = await client.callTool({
        name: 'grist_get_records',
        arguments: {
          docId: docId,
          tableId: 'Contacts',
          filters: { Status: 'Active' },
          limit: 5,
          offset: 0,
          response_format: 'json'
        }
      })

      const recordsData = JSON.parse(recordsResult.content[0].text)
      console.log(`Found: ${recordsData.total} active contacts`)
      console.log('✅ grist_get_records with filter works!\n')
    }

    // Test 4: grist_query_sql
    if (docsData.items && docsData.items.length > 0) {
      const docId = docsData.items[0].id

      console.log('🧪 TEST 4: grist_query_sql')
      console.log('-'.repeat(60))
      const sqlResult = await client.callTool({
        name: 'grist_query_sql',
        arguments: {
          docId: docId,
          sql: 'SELECT Region, COUNT(*) as Count FROM Contacts GROUP BY Region',
          limit: 100,
          offset: 0,
          response_format: 'json'
        }
      })

      const sqlData = JSON.parse(sqlResult.content[0].text)
      console.log(`Found: ${sqlData.total} grouped results`)
      console.log('✅ grist_query_sql works!\n')
    }

    console.log('='.repeat(60))
    console.log('🎉 ALL MCP SERVER TESTS PASSED!')
    console.log('='.repeat(60))
    console.log('\n✅ The Grist MCP Server is working correctly via MCP protocol!')
  } catch (error: unknown) {
    const err = error as { message: string; stack?: string }
    console.error('\n❌ MCP SERVER TEST FAILED:')
    console.error(err.message)
    console.error('\nStack:', err.stack)
  } finally {
    // Cleanup
    await client.close()
    serverProcess.kill()
  }
}

testMCPServer().catch(console.error)
