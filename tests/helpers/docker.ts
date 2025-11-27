/**
 * Docker Helpers for Tests
 *
 * Provides utilities to verify Grist connectivity and get container logs.
 * Container lifecycle is managed by globalSetup.ts - these are read-only helpers.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

// Container name (matches globalSetup.ts)
const CONTAINER_NAME = 'grist-mcp-test'

export interface DockerConfig {
  url: string
  apiKey: string
  startupTimeout?: number
  healthCheckInterval?: number
}

export const DEFAULT_DOCKER_CONFIG: DockerConfig = {
  url: process.env.GRIST_URL || 'http://localhost:8989',
  apiKey: process.env.GRIST_API_KEY || '',
  startupTimeout: 30000,
  healthCheckInterval: 1000
}

/**
 * Check if Docker is installed and running
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker --version')
    return true
  } catch {
    return false
  }
}

/**
 * Check if the Grist container is running
 */
export async function isContainerRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `docker inspect --format='{{.State.Running}}' ${CONTAINER_NAME}`
    )
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

/**
 * Verify Grist is accessible with the configured API key
 * This is a read-only check - does NOT start containers
 */
export async function ensureGristReady(
  config: DockerConfig = DEFAULT_DOCKER_CONFIG
): Promise<void> {
  const apiKey = config.apiKey || process.env.GRIST_API_KEY
  const url = config.url || process.env.GRIST_URL

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

  // Verify connectivity
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
 * Wait for Grist to be ready (with retries)
 */
export async function waitForGrist(config: DockerConfig = DEFAULT_DOCKER_CONFIG): Promise<boolean> {
  const startTime = Date.now()
  const timeout = config.startupTimeout || 30000
  const interval = config.healthCheckInterval || 1000
  const apiKey = config.apiKey || process.env.GRIST_API_KEY
  const url = config.url || process.env.GRIST_URL

  if (!apiKey || !url) {
    throw new Error('No API key or URL available. Ensure globalSetup.ts ran successfully.')
  }

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${url}/api/orgs`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })

      if (response.ok) {
        return true
      }
    } catch {
      // Grist not ready yet
    }

    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  throw new Error(`Grist did not become ready within ${timeout}ms`)
}

/**
 * Get container logs for debugging
 */
export async function getContainerLogs(): Promise<string> {
  try {
    const { stdout } = await execAsync(`docker logs ${CONTAINER_NAME}`)
    return stdout
  } catch (error) {
    return `Failed to get logs: ${error}`
  }
}
