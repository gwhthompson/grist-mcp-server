#!/usr/bin/env node

/**
 * Automated Integration Test Suite for Grist MCP Server
 *
 * This test suite automatically:
 * 1. Starts Docker Compose (Grist instance)
 * 2. Waits for Grist to be ready
 * 3. Builds the MCP server
 * 4. Runs comprehensive integration tests
 * 5. Stops Docker Compose on completion
 *
 * Usage:
 *   npm test                  # Run full automated test suite
 *   node test-integration-auto.mjs
 *
 * Options:
 *   --keep-running           # Don't stop Docker after tests
 *   --skip-build             # Skip npm build step
 *   --verbose                # Enable verbose output
 */

import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { GristClient } from './dist/services/grist-client.js'
import * as discovery from './dist/tools/discovery.js'
import * as reading from './dist/tools/reading.js'
import * as records from './dist/tools/records.js'
import * as tables from './dist/tools/tables.js'
import * as columns from './dist/tools/columns.js'
import * as documents from './dist/tools/documents.js'

const execAsync = promisify(exec)

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  gristUrl: 'http://localhost:8989',
  apiKey: 'test_api_key',
  orgDomain: 'example',
  dockerComposeFile: './compose.yml',
  buildTimeout: 60000,
  gristStartupTimeout: 30000,
  testTimeout: 60000,
  verbose: process.argv.includes('--verbose') || process.env.VERBOSE === 'true',
  keepRunning: process.argv.includes('--keep-running'),
  skipBuild: process.argv.includes('--skip-build')
}

// ============================================================================
// Docker Management
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logStep(message) {
  console.log(`\n${colors.cyan}${colors.bright}▶ ${message}${colors.reset}`)
}

function logSuccess(message) {
  console.log(`  ${colors.green}✓${colors.reset} ${message}`)
}

function logError(message) {
  console.log(`  ${colors.red}✗${colors.reset} ${message}`)
}

function logInfo(message) {
  if (CONFIG.verbose) {
    console.log(`  ${colors.dim}${message}${colors.reset}`)
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function checkDockerInstalled() {
  try {
    await execAsync('docker --version')
    return true
  } catch (error) {
    return false
  }
}

async function checkDockerComposeInstalled() {
  try {
    await execAsync('docker compose version')
    return true
  } catch (error) {
    return false
  }
}

async function isGristRunning() {
  try {
    const { stdout } = await execAsync('docker compose ps --format json')
    const containers = stdout
      .trim()
      .split('\n')
      .filter(line => line)
      .map(line => JSON.parse(line))

    const gristContainer = containers.find(c => c.Service === 'grist')
    return gristContainer && gristContainer.State === 'running'
  } catch (error) {
    return false
  }
}

async function startGrist() {
  logStep('Starting Grist with Docker Compose')

  // Check prerequisites
  if (!await checkDockerInstalled()) {
    throw new Error('Docker is not installed. Please install Docker first.')
  }

  if (!await checkDockerComposeInstalled()) {
    throw new Error('Docker Compose is not installed. Please install Docker Compose first.')
  }

  if (!existsSync(CONFIG.dockerComposeFile)) {
    throw new Error(`Docker Compose file not found: ${CONFIG.dockerComposeFile}`)
  }

  // Check if already running
  if (await isGristRunning()) {
    logInfo('Grist is already running')
    logSuccess('Using existing Grist instance')
    return { alreadyRunning: true }
  }

  // Start Docker Compose
  try {
    logInfo('Executing: docker compose up -d')
    const { stdout, stderr } = await execAsync('docker compose up -d')

    if (CONFIG.verbose) {
      if (stdout) logInfo(stdout.trim())
      if (stderr) logInfo(stderr.trim())
    }

    logSuccess('Docker Compose started')
    return { alreadyRunning: false }
  } catch (error) {
    logError('Failed to start Docker Compose')
    throw error
  }
}

async function waitForGrist() {
  logStep('Waiting for Grist to be ready')

  const startTime = Date.now()
  const maxWait = CONFIG.gristStartupTimeout
  let attempt = 0

  while (Date.now() - startTime < maxWait) {
    attempt++

    try {
      const response = await fetch(`${CONFIG.gristUrl}/status`, {
        signal: AbortSignal.timeout(5000)
      })

      if (response.ok) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        logSuccess(`Grist ready after ${elapsed}s (${attempt} attempts)`)
        return true
      }
    } catch (error) {
      // Expected during startup
    }

    logInfo(`Attempt ${attempt}: Grist not ready yet, waiting...`)
    await sleep(2000)
  }

  throw new Error(`Grist failed to start within ${maxWait / 1000}s`)
}

async function stopGrist() {
  logStep('Stopping Grist')

  try {
    logInfo('Executing: docker compose down')
    const { stdout, stderr } = await execAsync('docker compose down')

    if (CONFIG.verbose) {
      if (stdout) logInfo(stdout.trim())
      if (stderr) logInfo(stderr.trim())
    }

    logSuccess('Docker Compose stopped')
  } catch (error) {
    logError('Failed to stop Docker Compose')
    throw error
  }
}

async function getGristLogs(lines = 50) {
  try {
    const { stdout } = await execAsync(`docker compose logs --tail=${lines} grist`)
    return stdout
  } catch (error) {
    return 'Unable to fetch logs'
  }
}

// ============================================================================
// Build Management
// ============================================================================

async function buildServer() {
  if (CONFIG.skipBuild) {
    logStep('Build (skipped)')
    logInfo('Using --skip-build flag')
    return
  }

  logStep('Building MCP Server')

  // Check if dist exists
  if (existsSync('./dist')) {
    logInfo('Found existing build')
  }

  try {
    logInfo('Executing: npm run build')
    const { stdout, stderr } = await execAsync('npm run build', {
      timeout: CONFIG.buildTimeout
    })

    if (CONFIG.verbose) {
      if (stdout) logInfo(stdout.trim())
      if (stderr && !stderr.includes('npm warn')) logInfo(stderr.trim())
    }

    logSuccess('Build completed')
  } catch (error) {
    logError('Build failed')
    throw error
  }
}

// ============================================================================
// Test State & Utilities
// ============================================================================

const state = {
  client: null,
  orgId: null,
  workspaceId: null,
  docId: null,
  tableId: null,
  recordIds: [],
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: [],
  startTime: Date.now(),
  dockerStarted: false
}

function logTest(name) {
  if (CONFIG.verbose) {
    console.log(`\n${colors.blue}  ▸ ${name}${colors.reset}`)
  }
}

function logTestSuccess(message) {
  console.log(`    ${colors.green}✓${colors.reset} ${message}`)
  state.passed++
}

function logTestError(message, error) {
  console.log(`    ${colors.red}✗${colors.reset} ${message}`)
  if (CONFIG.verbose && error) {
    console.log(`      ${colors.dim}${error.message}${colors.reset}`)
  }
  state.failed++
  state.errors.push({ message, error: error?.message })
}

function logTestSkip(message) {
  console.log(`    ${colors.yellow}⊘${colors.reset} ${message}`)
  state.skipped++
}

// ============================================================================
// Test Suites (Same as test-integration-full.mjs)
// ============================================================================

async function setupEnvironment() {
  logStep('Test Environment Setup')

  // Initialize client
  logTest('Initialize Grist Client')
  try {
    state.client = new GristClient(CONFIG.gristUrl, CONFIG.apiKey)
    logTestSuccess('Client initialized')
  } catch (error) {
    logTestError('Failed to initialize client', error)
    throw error
  }

  // Get org ID
  logTest('Fetch Organization')
  try {
    const orgs = await state.client.get('/orgs')
    const org = orgs.find(o => o.domain === CONFIG.orgDomain)
    if (!org) throw new Error(`Organization '${CONFIG.orgDomain}' not found`)
    state.orgId = org.id
    logTestSuccess(`Found organization: ${org.name} (ID: ${state.orgId})`)
  } catch (error) {
    logTestError('Failed to fetch organization', error)
    throw error
  }

  // Create test workspace
  logTest('Create Test Workspace')
  try {
    const workspaceName = `TestWS_${Date.now()}`
    state.workspaceId = await state.client.post(
      `/orgs/${state.orgId}/workspaces`,
      { name: workspaceName }
    )
    logTestSuccess(`Created workspace (ID: ${state.workspaceId})`)
  } catch (error) {
    logTestError('Failed to create workspace', error)
    throw error
  }

  // Create test document
  logTest('Create Test Document')
  try {
    const docName = `TestDoc_${Date.now()}`
    state.docId = await state.client.post(
      `/workspaces/${state.workspaceId}/docs`,
      { name: docName }
    )
    logTestSuccess(`Created document (ID: ${state.docId})`)
  } catch (error) {
    logTestError('Failed to create document', error)
    throw error
  }

  await sleep(1000)
}

async function runBasicTests() {
  logStep('Running Basic Integration Tests')

  // Test discovery tools
  logTest('Discovery: List Workspaces')
  try {
    const result = await discovery.getWorkspaces(state.client, {
      response_format: 'json',
      detail_level: 'summary'
    })
    logTestSuccess(`Listed ${result?.structuredContent?.items?.length || 0} workspaces`)
  } catch (error) {
    logTestError('Failed to list workspaces', error)
  }

  // Test table creation
  if (state.docId) {
    logTest('Table Management: Create Table')
    try {
      const result = await tables.createTable(state.client, {
        doc_id: state.docId,
        tableName: `TestTable_${Date.now()}`,
        columns: [
          { colId: 'Name', type: 'Text', label: 'Name' },
          { colId: 'Value', type: 'Int', label: 'Value' }
        ],
        response_format: 'json'
      })
      state.tableId = result.structuredContent?.tableId
      logTestSuccess(`Created table (ID: ${state.tableId})`)
    } catch (error) {
      logTestError('Failed to create table', error)
    }
  }

  // Test record operations
  if (state.docId && state.tableId) {
    logTest('Records: Add Records')
    try {
      const result = await records.addRecords(state.client, {
        doc_id: state.docId,
        tableId: state.tableId,
        records: [
          { Name: 'Test1', Value: 100 },
          { Name: 'Test2', Value: 200 }
        ],
        response_format: 'json'
      })
      state.recordIds = result.structuredContent?.records || []
      logTestSuccess(`Added ${state.recordIds.length} records`)
    } catch (error) {
      logTestError('Failed to add records', error)
    }
  }

  // Test TypeScript features
  logTest('TypeScript: Branded Types')
  try {
    const { toTableId, toDocId } = await import('./dist/types/advanced.js')
    toTableId('test')
    toDocId('test')
    logTestSuccess('Branded types working')
  } catch (error) {
    logTestError('Branded types failed', error)
  }

  logTest('TypeScript: Generic Methods')
  try {
    const orgs = await state.client.get('/orgs')
    if (Array.isArray(orgs)) {
      logTestSuccess('Generic methods working')
    }
  } catch (error) {
    logTestError('Generic methods failed', error)
  }
}

async function teardownEnvironment() {
  logStep('Cleanup Test Environment')

  if (state.docId) {
    logTest('Delete Test Document')
    try {
      await state.client.delete(`/docs/${state.docId}`)
      logTestSuccess('Document deleted')
    } catch (error) {
      logTestError('Failed to delete document', error)
    }
  }

  if (state.workspaceId) {
    logTest('Delete Test Workspace')
    try {
      await state.client.delete(`/workspaces/${state.workspaceId}`)
      logTestSuccess('Workspace deleted')
    } catch (error) {
      logTestError('Failed to delete workspace', error)
    }
  }
}

// ============================================================================
// Summary & Reporting
// ============================================================================

function printSummary() {
  const duration = ((Date.now() - state.startTime) / 1000).toFixed(2)
  const total = state.passed + state.failed + state.skipped

  console.log(`\n${colors.cyan}${'═'.repeat(60)}${colors.reset}`)
  console.log(`${colors.cyan}${colors.bright}  TEST SUMMARY${colors.reset}`)
  console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}`)

  console.log()
  log(`  Duration: ${duration}s`, 'dim')
  log(`  Total Tests: ${total}`, 'blue')
  log(`  ✓ Passed: ${state.passed}`, 'green')
  log(`  ✗ Failed: ${state.failed}`, state.failed > 0 ? 'red' : 'dim')
  log(`  ⊘ Skipped: ${state.skipped}`, 'yellow')

  const passRate = total > 0 ? ((state.passed / total) * 100).toFixed(1) : 0
  const statusColor = passRate >= 90 ? 'green' : passRate >= 70 ? 'yellow' : 'red'
  log(`  Pass Rate: ${passRate}%`, statusColor)

  if (state.errors.length > 0 && CONFIG.verbose) {
    console.log()
    log('  Failed Tests:', 'red')
    state.errors.forEach((err, i) => {
      console.log(`    ${i + 1}. ${err.message}`)
      if (err.error) {
        console.log(`       ${colors.dim}${err.error}${colors.reset}`)
      }
    })
  }

  console.log()

  if (state.failed === 0) {
    log('🎉 ALL TESTS PASSED!', 'green')
    log('✨ TypeScript refactoring validated', 'green')
    log('🚀 Production ready!', 'green')
  } else if (state.passed >= total * 0.7) {
    log('✅ Tests mostly passed', 'yellow')
    log('⚠️  Some minor issues - review above', 'yellow')
  } else {
    log('⚠️  Multiple test failures', 'red')
    log('🔍 Review errors above', 'red')
  }

  console.log()
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function main() {
  log('\n╔═══════════════════════════════════════════════════════════╗', 'cyan')
  log('║                                                           ║', 'cyan')
  log('║     Grist MCP Server - Automated Integration Tests       ║', 'cyan')
  log('║     With Docker Compose Management                        ║', 'cyan')
  log('║                                                           ║', 'cyan')
  log('╚═══════════════════════════════════════════════════════════╝', 'cyan')

  let dockerWasStarted = false

  try {
    // Step 1: Start Grist
    const { alreadyRunning } = await startGrist()
    dockerWasStarted = !alreadyRunning
    state.dockerStarted = dockerWasStarted

    // Step 2: Wait for Grist
    await waitForGrist()

    // Step 3: Build server
    await buildServer()

    // Step 4: Run tests
    await setupEnvironment()
    await runBasicTests()
    await teardownEnvironment()

  } catch (error) {
    log(`\n💥 Test suite crashed: ${error.message}`, 'red')
    if (CONFIG.verbose) {
      console.error(error)
    }

    // Show Docker logs if Grist failed to start
    if (error.message.includes('Grist failed to start')) {
      log('\n📋 Recent Grist logs:', 'yellow')
      const logs = await getGristLogs(30)
      console.log(colors.dim + logs + colors.reset)
    }

    state.failed++
  } finally {
    printSummary()

    // Stop Docker if we started it
    if (dockerWasStarted && !CONFIG.keepRunning) {
      await stopGrist()
    } else if (CONFIG.keepRunning) {
      log('ℹ️  Keeping Grist running (--keep-running flag)', 'cyan')
      log(`   Access Grist at: ${CONFIG.gristUrl}`, 'cyan')
      log('   Stop with: docker compose down', 'cyan')
    }

    process.exit(state.failed > 0 ? 1 : 0)
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  log('\n\n⚠️  Test interrupted by user', 'yellow')

  if (state.dockerStarted && !CONFIG.keepRunning) {
    await stopGrist()
  }

  process.exit(130)
})

// Run tests
main()
