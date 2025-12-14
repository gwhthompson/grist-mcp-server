/**
 * Docker Helpers for Tests
 *
 * Provides utilities to verify Grist connectivity and get container logs.
 * Container lifecycle is managed by globalSetup.ts via testContainer.
 */

import { testContainer } from '../../scripts/grist-docker.js'

export interface DockerConfig {
  url: string
  apiKey: string
}

/**
 * Check if the Grist test container is running.
 */
export async function isContainerRunning(): Promise<boolean> {
  return (await testContainer.getStatus()).running
}

/**
 * Verify Grist is accessible with the configured API key.
 * This is a read-only check - does NOT start containers.
 */
export async function ensureGristReady(config?: DockerConfig): Promise<void> {
  const apiKey = config?.apiKey || process.env.GRIST_API_KEY
  const url = config?.url || process.env.GRIST_URL

  if (!apiKey) {
    throw new Error(
      'No API key available. Ensure globalSetup.ts ran successfully and inject() is working.'
    )
  }

  if (!url) {
    throw new Error(
      'No Grist URL available. Ensure globalSetup.ts ran successfully and inject() is working.'
    )
  }

  // Verify connectivity with API key
  try {
    const response = await fetch(`${url}/api/orgs`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })

    if (!response.ok) {
      throw new Error(`Grist returned ${response.status}: ${await response.text()}`)
    }
  } catch (error) {
    throw new Error(
      `Cannot connect to Grist at ${url}. ` +
        `Ensure globalSetup.ts ran successfully. Error: ${error}`
    )
  }
}

/**
 * Get container logs for debugging.
 */
export async function getContainerLogs(): Promise<string> {
  return testContainer.getLogs()
}
