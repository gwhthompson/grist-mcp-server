/**
 * Vitest Global Setup
 *
 * Runs ONCE before all tests start (across all workers).
 * - Starts Docker container with ephemeral port
 * - Bootstraps API key via boot key
 * - Provides values to test workers via Vitest's provide/inject
 * - Tracks workspace count for leak detection
 */

import type { GlobalSetupContext } from 'vitest/node'
import { testContainer } from '../scripts/grist-docker.js'

// Track initial workspace count for leak detection
let initialWorkspaceCount = 0
let gristUrl: string | undefined
let gristApiKey: string | undefined

/**
 * Global setup - runs once before all tests
 */
export async function setup({ provide }: GlobalSetupContext): Promise<void> {
  console.log('[globalSetup] Initializing test environment...')

  // Register cleanup handlers for unexpected termination
  testContainer.registerCleanupHandlers()

  // Check if external Grist is configured and accessible
  if (process.env.GRIST_URL && process.env.GRIST_API_KEY) {
    try {
      const response = await fetch(`${process.env.GRIST_URL}/api/orgs`, {
        headers: { Authorization: `Bearer ${process.env.GRIST_API_KEY}` }
      })

      if (response.ok) {
        console.log('[globalSetup] Using externally configured Grist instance')
        gristUrl = process.env.GRIST_URL
        gristApiKey = process.env.GRIST_API_KEY
        provide('GRIST_API_KEY', gristApiKey)
        provide('GRIST_BASE_URL', gristUrl)

        // Record initial workspace count for leak detection
        await recordInitialWorkspaceCount()
        return
      }
    } catch {
      // External instance not accessible, fall through to Docker
    }
  }

  // Start container (handles Docker availability check internally)
  const { url, apiKey } = await testContainer.start()
  console.log(`[globalSetup] Got API key (length: ${apiKey.length})`)

  // Store for teardown leak detection
  gristUrl = url
  gristApiKey = apiKey

  // Provide values to test workers via Vitest's provide/inject
  provide('GRIST_API_KEY', apiKey)
  provide('GRIST_BASE_URL', url)

  // Record initial workspace count for leak detection
  await recordInitialWorkspaceCount()

  console.log('[globalSetup] Test environment ready!')
}

/**
 * Record the initial workspace count for leak detection.
 * Called after container is ready but before tests run.
 */
async function recordInitialWorkspaceCount(): Promise<void> {
  if (!gristUrl || !gristApiKey) return

  try {
    // Get workspaces in the example org (id=3 in Docker setup)
    const response = await fetch(`${gristUrl}/api/orgs/3/workspaces`, {
      headers: { Authorization: `Bearer ${gristApiKey}` }
    })

    if (response.ok) {
      const workspaces = (await response.json()) as Array<{ id: number }>
      initialWorkspaceCount = workspaces.length
      console.log(`[globalSetup] Initial workspace count: ${initialWorkspaceCount}`)
    }
  } catch {
    // Non-fatal: leak detection is best-effort
    console.log('[globalSetup] Could not record initial workspace count')
  }
}

/**
 * Check for leaked workspaces (resources not cleaned up by tests).
 * Called during teardown to detect cleanup failures.
 */
async function checkForLeakedWorkspaces(): Promise<void> {
  if (!gristUrl || !gristApiKey) return

  try {
    const response = await fetch(`${gristUrl}/api/orgs/3/workspaces`, {
      headers: { Authorization: `Bearer ${gristApiKey}` }
    })

    if (response.ok) {
      const workspaces = (await response.json()) as Array<{ id: number; name: string }>
      const finalCount = workspaces.length
      const leaked = finalCount - initialWorkspaceCount

      if (leaked > 0) {
        console.warn(`\n⚠️  Resource leak detected: ${leaked} orphaned workspace(s)`)
        console.warn('   Leaked workspaces:')
        for (const ws of workspaces.slice(initialWorkspaceCount)) {
          console.warn(`   - ${ws.name} (id: ${ws.id})`)
        }
        console.warn('')
      } else {
        console.log(`[globalTeardown] No resource leaks detected (${finalCount} workspaces)`)
      }
    }
  } catch {
    // Non-fatal: leak detection is best-effort
  }
}

/**
 * Global teardown - runs once after all tests
 */
export async function teardown(): Promise<void> {
  // Check for leaked resources before stopping container
  await checkForLeakedWorkspaces()

  // Don't stop the container if SKIP_CLEANUP is set (for debugging)
  if (process.env.SKIP_CLEANUP === 'true') {
    console.log('[globalTeardown] SKIP_CLEANUP=true, leaving container running')
    return
  }

  console.log('[globalTeardown] Stopping Grist container...')
  await testContainer.stop()
}

// Type declarations for Vitest provide/inject
declare module 'vitest' {
  export interface ProvidedContext {
    GRIST_API_KEY: string
    GRIST_BASE_URL: string
  }
}
