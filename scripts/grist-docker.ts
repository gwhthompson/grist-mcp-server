/**
 * Grist Docker Container Management
 *
 * Single source of truth for managing Grist containers in dev and test environments.
 * Provides a clean class-based API with proper cleanup handling.
 */

import { execFile, execFileSync, type ExecFileException } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Single boot key for all environments (dev + test)
export const BOOT_KEY = 'grist_mcp_boot_key'

// Docker image
export const GRIST_IMAGE = 'gristlabs/grist:latest'

// Container port inside Docker
const CONTAINER_PORT = 8484

export interface ContainerStatus {
  running: boolean
  port?: string
  url?: string
}

export interface ContainerInfo {
  url: string
  port: string
  apiKey: string
}

export interface GristContainerConfig {
  name: string
  webhookDomains?: string[]
}

/**
 * Manages a Grist Docker container lifecycle.
 */
export class GristContainer {
  readonly name: string
  private readonly webhookDomains: string[]
  private started = false

  constructor(config: GristContainerConfig) {
    this.name = config.name
    this.webhookDomains = config.webhookDomains ?? ['webhook.site', 'example.com']
  }

  /**
   * Check if container is running and get its port/URL.
   */
  async getStatus(): Promise<ContainerStatus> {
    try {
      const { stdout: state } = await execFileAsync('docker', [
        'inspect',
        '--format={{.State.Running}}',
        this.name
      ])

      if (state.trim() !== 'true') {
        return { running: false }
      }

      const { stdout: portOutput } = await execFileAsync('docker', [
        'inspect',
        `--format={{(index (index .NetworkSettings.Ports "${CONTAINER_PORT}/tcp") 0).HostPort}}`,
        this.name
      ])

      const port = portOutput.trim()
      return { running: true, port, url: `http://localhost:${port}` }
    } catch {
      return { running: false }
    }
  }

  /**
   * Wait for Grist to be healthy via /status endpoint.
   */
  async waitForHealth(url: string, timeout = 60000): Promise<void> {
    const start = Date.now()
    process.stdout.write('Waiting for Grist')

    while (Date.now() - start < timeout) {
      try {
        const response = await fetch(`${url}/status`)
        if (response.ok) {
          console.log(' ready!')
          return
        }
      } catch {
        // Not ready yet
      }

      process.stdout.write('.')
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    console.log(' timeout!')
    throw new Error(`Grist not ready at ${url} within ${timeout}ms`)
  }

  /**
   * Bootstrap API key via boot key header.
   * Retries on 503 errors (service unavailable during startup).
   */
  async bootstrapApiKey(url: string): Promise<string> {
    const headers = { 'x-boot-key': BOOT_KEY }
    const maxRetries = 5
    const baseDelay = 1000

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Try to get existing API key
        let response: Response
        try {
          response = await fetch(`${url}/api/profile/apiKey`, { headers })
        } catch (error) {
          throw new Error(`Failed to connect to Grist at ${url}: ${error}`)
        }

        // Retry on 503 (service starting up)
        if (response.status === 503) {
          if (attempt < maxRetries) {
            const delay = baseDelay * attempt
            console.log(`API returned 503 (starting up), retrying in ${delay}ms... (${attempt}/${maxRetries})`)
            await new Promise((resolve) => setTimeout(resolve, delay))
            continue
          }
          const text = await response.text()
          throw new Error(`API still unavailable after ${maxRetries} retries: ${response.status} - ${text}`)
        }

        if (response.ok) {
          const key = (await response.text()).replace(/^"|"$/g, '').trim()
          if (key) return key
        }

        // Create new key via POST
        console.log('Creating new API key...')
        response = await fetch(`${url}/api/profile/apiKey`, {
          method: 'POST',
          headers
        })

        // Retry on 503 for POST as well
        if (response.status === 503) {
          if (attempt < maxRetries) {
            const delay = baseDelay * attempt
            console.log(`API returned 503 (starting up), retrying in ${delay}ms... (${attempt}/${maxRetries})`)
            await new Promise((resolve) => setTimeout(resolve, delay))
            continue
          }
          const text = await response.text()
          throw new Error(`API still unavailable after ${maxRetries} retries: ${response.status} - ${text}`)
        }

        if (!response.ok) {
          const text = await response.text()
          throw new Error(`Failed to create API key: ${response.status} - ${text}`)
        }

        const key = (await response.text()).replace(/^"|"$/g, '').trim()
        if (!key) {
          throw new Error('API key creation returned empty response')
        }

        return key
      } catch (error) {
        // Re-throw on last attempt or non-retryable errors
        if (attempt === maxRetries || !(error instanceof Error) || !error.message.includes('503')) {
          throw error
        }
      }
    }

    throw new Error('Unexpected: exhausted retries without returning or throwing')
  }

  /**
   * Start container (or reuse existing), return connection info.
   */
  async start(): Promise<ContainerInfo> {
    const status = await this.getStatus()

    if (status.running && status.url && status.port) {
      console.log(`Grist already running at ${status.url}`)
      // Health check even for existing containers (fixes original bug)
      await this.waitForHealth(status.url, 10000)
      const apiKey = await this.bootstrapApiKey(status.url)
      return { url: status.url, port: status.port, apiKey }
    }

    // Clean up any orphaned container
    await this.remove()

    // Start with ephemeral port (Docker assigns available port)
    console.log('Starting Grist container with ephemeral port...')
    await execFileAsync('docker', [
      'run',
      '-d',
      '--name',
      this.name,
      '-p',
      `0:${CONTAINER_PORT}`,
      '-e',
      `GRIST_BOOT_KEY=${BOOT_KEY}`,
      '-e',
      'GRIST_FORCE_LOGIN=true',
      '-e',
      'GRIST_DEFAULT_EMAIL=test@example.com',
      '-e',
      'GRIST_SINGLE_ORG=example',
      '-e',
      `ALLOWED_WEBHOOK_DOMAINS=${this.webhookDomains.join(',')}`,
      GRIST_IMAGE
    ])
    this.started = true

    // Get assigned port via docker inspect
    const { stdout } = await execFileAsync('docker', [
      'inspect',
      `--format={{(index (index .NetworkSettings.Ports "${CONTAINER_PORT}/tcp") 0).HostPort}}`,
      this.name
    ])

    const port = stdout.trim()
    const url = `http://localhost:${port}`
    console.log(`Container started on port ${port}`)

    // Wait for health
    await this.waitForHealth(url)

    // Bootstrap API key
    console.log('Bootstrapping API key...')
    const apiKey = await this.bootstrapApiKey(url)

    return { url, port, apiKey }
  }

  /**
   * Stop and remove container.
   */
  async stop(): Promise<void> {
    await this.remove()
    this.started = false
    console.log('Container stopped')
  }

  /**
   * Remove container (silent on error).
   */
  private async remove(): Promise<void> {
    try {
      await execFileAsync('docker', ['rm', '-f', this.name])
    } catch {
      // Container might not exist
    }
  }

  /**
   * Synchronous cleanup for signal handlers.
   * Signal handlers can't use async, so we need execFileSync.
   */
  cleanupSync(): void {
    if (this.started) {
      try {
        execFileSync('docker', ['rm', '-f', this.name], { stdio: 'ignore' })
      } catch {
        // Ignore errors during cleanup
      }
    }
  }

  /**
   * Register SIGINT/SIGTERM handlers for cleanup.
   */
  registerCleanupHandlers(): void {
    const cleanup = () => this.cleanupSync()
    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
  }

  /**
   * Get container logs for debugging.
   */
  async getLogs(): Promise<string> {
    try {
      const { stdout } = await execFileAsync('docker', ['logs', this.name])
      return stdout
    } catch (error) {
      return `Failed to get logs: ${error}`
    }
  }
}

// Pre-configured container instances
export const devContainer = new GristContainer({
  name: 'grist-mcp-dev'
})

export const testContainer = new GristContainer({
  name: 'grist-mcp-test'
})
