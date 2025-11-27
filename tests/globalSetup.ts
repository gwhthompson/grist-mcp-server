/**
 * Vitest Global Setup
 *
 * Runs ONCE before all tests start (across all workers).
 * - Starts Docker container with ephemeral port
 * - Bootstraps API key via boot key
 * - Provides values to test workers via Vitest's provide/inject
 */

import { exec, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import type { GlobalSetupContext } from 'vitest/node'

const execAsync = promisify(exec)

// Container configuration
const CONTAINER_NAME = 'grist-mcp-test'
const GRIST_IMAGE = 'gristlabs/grist:latest'
const BOOT_KEY = 'test_boot_key'
const CONTAINER_PORT = 8484

// Track container state for cleanup
let containerStarted = false

/**
 * Synchronous cleanup for signal handlers
 */
const cleanup = () => {
  if (containerStarted) {
    try {
      execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' })
    } catch {
      // Ignore errors during cleanup
    }
  }
}

/**
 * Wait for Grist to be healthy using boot key
 */
async function waitForGristHealth(baseUrl: string, timeout = 60000): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${baseUrl}/api/orgs`, {
        headers: { 'x-boot-key': BOOT_KEY }
      })

      if (response.ok) {
        return
      }
    } catch {
      // Not ready yet
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(`[globalSetup] Grist did not become ready within ${timeout}ms`)
}

/**
 * Use boot key to get/create a real API key via /api/profile/apiKey
 */
async function bootstrapApiKey(baseUrl: string): Promise<string> {
  // First try to get existing API key
  let response = await fetch(`${baseUrl}/api/profile/apiKey`, {
    headers: { 'x-boot-key': BOOT_KEY }
  })

  if (response.ok) {
    const apiKey = (await response.text()).replace(/^"|"$/g, '').trim()
    if (apiKey) {
      return apiKey
    }
  }

  // If no key exists, create one via POST
  console.log('[globalSetup] No existing API key, creating new one...')
  response = await fetch(`${baseUrl}/api/profile/apiKey`, {
    method: 'POST',
    headers: { 'x-boot-key': BOOT_KEY }
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`[globalSetup] Failed to create API key: ${response.status} - ${text}`)
  }

  const apiKey = (await response.text()).replace(/^"|"$/g, '').trim()
  if (!apiKey) {
    throw new Error('[globalSetup] API key creation returned empty response')
  }

  return apiKey
}

/**
 * Global setup - runs once before all tests
 */
export async function setup({ provide }: GlobalSetupContext): Promise<void> {
  console.log('[globalSetup] Initializing test environment...')

  // Register cleanup handlers for unexpected termination
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  // Check if external Grist is configured and accessible
  if (process.env.GRIST_URL && process.env.GRIST_API_KEY) {
    try {
      const response = await fetch(`${process.env.GRIST_URL}/api/orgs`, {
        headers: { Authorization: `Bearer ${process.env.GRIST_API_KEY}` }
      })

      if (response.ok) {
        console.log('[globalSetup] Using externally configured Grist instance')
        provide('GRIST_API_KEY', process.env.GRIST_API_KEY)
        provide('GRIST_BASE_URL', process.env.GRIST_URL)
        return
      }
    } catch {
      // External instance not accessible, fall through to Docker
    }
  }

  // Check if Docker is available
  try {
    await execAsync('docker --version')
  } catch {
    throw new Error('[globalSetup] Docker is not accessible. Please ensure Docker is running.')
  }

  // Clean up any orphaned container from previous run
  console.log('[globalSetup] Cleaning up any orphaned containers...')
  await execAsync(`docker rm -f ${CONTAINER_NAME}`).catch(() => {})

  // Start container with ephemeral port (Docker assigns available port)
  console.log('[globalSetup] Starting Grist container with ephemeral port...')
  await execAsync(
    `docker run -d --name ${CONTAINER_NAME} -p 0:${CONTAINER_PORT} ` +
      `-e GRIST_BOOT_KEY=${BOOT_KEY} ` +
      `-e GRIST_FORCE_LOGIN=true ` +
      `-e GRIST_DEFAULT_EMAIL=test@example.com ` +
      `-e GRIST_SINGLE_ORG=example ` +
      `-e ALLOWED_WEBHOOK_DOMAINS=webhook.site,example.com ` +
      GRIST_IMAGE
  )
  containerStarted = true

  // Get assigned port via docker inspect
  const { stdout } = await execAsync(
    `docker inspect --format='{{(index (index .NetworkSettings.Ports "${CONTAINER_PORT}/tcp") 0).HostPort}}' ${CONTAINER_NAME}`
  )
  const hostPort = stdout.trim()
  const baseUrl = `http://localhost:${hostPort}`
  console.log(`[globalSetup] Container started on port ${hostPort}`)

  // Wait for Grist to be healthy
  console.log('[globalSetup] Waiting for Grist to be healthy...')
  await waitForGristHealth(baseUrl)

  // Bootstrap API key
  console.log('[globalSetup] Bootstrapping API key...')
  const apiKey = await bootstrapApiKey(baseUrl)
  console.log(`[globalSetup] Got API key (length: ${apiKey.length})`)

  // Provide values to test workers via Vitest's provide/inject
  provide('GRIST_API_KEY', apiKey)
  provide('GRIST_BASE_URL', baseUrl)

  console.log('[globalSetup] Test environment ready!')
}

/**
 * Global teardown - runs once after all tests
 */
export async function teardown(): Promise<void> {
  // Don't stop the container if SKIP_CLEANUP is set (for debugging)
  if (process.env.SKIP_CLEANUP === 'true') {
    console.log('[globalTeardown] SKIP_CLEANUP=true, leaving container running')
    return
  }

  console.log('[globalTeardown] Stopping Grist container...')
  await execAsync(`docker rm -f ${CONTAINER_NAME}`).catch(() => {})
  containerStarted = false
}

// Type declarations for Vitest provide/inject
declare module 'vitest' {
  export interface ProvidedContext {
    GRIST_API_KEY: string
    GRIST_BASE_URL: string
  }
}
