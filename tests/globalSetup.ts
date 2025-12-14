/**
 * Vitest Global Setup
 *
 * Runs ONCE before all tests start (across all workers).
 * - Starts Docker container with ephemeral port
 * - Bootstraps API key via boot key
 * - Provides values to test workers via Vitest's provide/inject
 */

import type { GlobalSetupContext } from 'vitest/node'
import { testContainer } from '../scripts/grist-docker.js'

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
        provide('GRIST_API_KEY', process.env.GRIST_API_KEY)
        provide('GRIST_BASE_URL', process.env.GRIST_URL)
        return
      }
    } catch {
      // External instance not accessible, fall through to Docker
    }
  }

  // Start container (handles Docker availability check internally)
  const { url, apiKey } = await testContainer.start()
  console.log(`[globalSetup] Got API key (length: ${apiKey.length})`)

  // Provide values to test workers via Vitest's provide/inject
  provide('GRIST_API_KEY', apiKey)
  provide('GRIST_BASE_URL', url)

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
  await testContainer.stop()
}

// Type declarations for Vitest provide/inject
declare module 'vitest' {
  export interface ProvidedContext {
    GRIST_API_KEY: string
    GRIST_BASE_URL: string
  }
}
