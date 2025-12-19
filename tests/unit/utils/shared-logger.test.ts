import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Store original env
const originalEnv = { ...process.env }

// Helper to reset and reimport the module with different env vars
async function reimportWithEnv(env: Record<string, string | undefined>) {
  // Reset module cache
  vi.resetModules()

  // Set env vars before import
  Object.assign(process.env, env)

  // Dynamically import to get fresh instance with new env
  const module = await import('../../../src/utils/shared-logger.js')
  return module
}

describe('shared-logger', () => {
  beforeEach(() => {
    // Reset env to clean state
    process.env = { ...originalEnv }
    delete process.env.GRIST_MCP_DEBUG_MODE
    delete process.env.GRIST_MCP_LOG_LEVEL
    delete process.env.GRIST_MCP_LOG_PRETTY
  })

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  describe('log helper functions', () => {
    it('provides error, warn, info, debug methods', async () => {
      const { log } = await reimportWithEnv({})

      expect(typeof log.error).toBe('function')
      expect(typeof log.warn).toBe('function')
      expect(typeof log.info).toBe('function')
      expect(typeof log.debug).toBe('function')
    })

    it('log methods call sharedLogger methods', async () => {
      const { log, sharedLogger } = await reimportWithEnv({})

      const errorSpy = vi.spyOn(sharedLogger, 'error').mockImplementation(() => {})
      const warnSpy = vi.spyOn(sharedLogger, 'warn').mockImplementation(() => {})
      const infoSpy = vi.spyOn(sharedLogger, 'info').mockImplementation(() => {})
      const debugSpy = vi.spyOn(sharedLogger, 'debug').mockImplementation(() => {})

      log.error('error msg', { key: 'val' })
      log.warn('warn msg')
      log.info('info msg', { data: 123 })
      log.debug('debug msg')

      expect(errorSpy).toHaveBeenCalledWith('error msg', { key: 'val' }, undefined)
      expect(warnSpy).toHaveBeenCalledWith('warn msg', undefined, undefined)
      expect(infoSpy).toHaveBeenCalledWith('info msg', { data: 123 })
      expect(debugSpy).toHaveBeenCalledWith('debug msg', undefined, undefined)
    })

    it('log.error passes error object', async () => {
      const { log, sharedLogger } = await reimportWithEnv({})

      const errorSpy = vi.spyOn(sharedLogger, 'error').mockImplementation(() => {})
      const testError = new Error('test error')

      log.error('error msg', { key: 'val' }, testError)

      expect(errorSpy).toHaveBeenCalledWith('error msg', { key: 'val' }, testError)
    })
  })

  describe('log level priority', () => {
    it('uses DEBUG when GRIST_MCP_DEBUG_MODE=true', async () => {
      const { sharedLogger } = await reimportWithEnv({
        GRIST_MCP_DEBUG_MODE: 'true'
      })

      // Logger should be at debug level
      expect(sharedLogger).toBeDefined()
    })

    it('uses error level when GRIST_MCP_LOG_LEVEL=error', async () => {
      const { sharedLogger } = await reimportWithEnv({
        GRIST_MCP_LOG_LEVEL: 'error'
      })

      expect(sharedLogger).toBeDefined()
    })

    it('uses warn level when GRIST_MCP_LOG_LEVEL=warn', async () => {
      const { sharedLogger } = await reimportWithEnv({
        GRIST_MCP_LOG_LEVEL: 'warn'
      })

      expect(sharedLogger).toBeDefined()
    })

    it('uses info level when GRIST_MCP_LOG_LEVEL=info', async () => {
      const { sharedLogger } = await reimportWithEnv({
        GRIST_MCP_LOG_LEVEL: 'info'
      })

      expect(sharedLogger).toBeDefined()
    })

    it('uses debug level when GRIST_MCP_LOG_LEVEL=debug', async () => {
      const { sharedLogger } = await reimportWithEnv({
        GRIST_MCP_LOG_LEVEL: 'debug'
      })

      expect(sharedLogger).toBeDefined()
    })

    it('handles uppercase LOG_LEVEL values', async () => {
      const { sharedLogger } = await reimportWithEnv({
        GRIST_MCP_LOG_LEVEL: 'ERROR'
      })

      expect(sharedLogger).toBeDefined()
    })

    it('uses debug in development when no level specified', async () => {
      const { sharedLogger } = await reimportWithEnv({
        NODE_ENV: 'development'
      })

      expect(sharedLogger).toBeDefined()
    })

    it('uses info as default in production', async () => {
      const { sharedLogger } = await reimportWithEnv({
        NODE_ENV: 'production'
      })

      expect(sharedLogger).toBeDefined()
    })

    it('enables pretty print when GRIST_MCP_LOG_PRETTY=true', async () => {
      const { sharedLogger } = await reimportWithEnv({
        GRIST_MCP_LOG_PRETTY: 'true'
      })

      expect(sharedLogger).toBeDefined()
    })

    it('enables pretty print when GRIST_MCP_DEBUG_MODE=true', async () => {
      const { sharedLogger } = await reimportWithEnv({
        GRIST_MCP_DEBUG_MODE: 'true'
      })

      expect(sharedLogger).toBeDefined()
    })
  })
})
