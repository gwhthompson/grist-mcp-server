import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLogger, Logger, LogLevel, log } from '../../../src/utils/logger.js'

describe('Logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('constructor', () => {
    it('creates logger with default config', () => {
      const logger = new Logger()
      const config = logger.getConfig()

      expect(config.minLevel).toBe(LogLevel.INFO)
      expect(config.includeStackTraces).toBe(true)
      expect(config.prettyPrint).toBe(false)
    })

    it('respects custom config', () => {
      const logger = new Logger({
        minLevel: LogLevel.ERROR,
        includeStackTraces: false,
        prettyPrint: true
      })
      const config = logger.getConfig()

      expect(config.minLevel).toBe(LogLevel.ERROR)
      expect(config.includeStackTraces).toBe(false)
      expect(config.prettyPrint).toBe(true)
    })

    it('sets debug level when enableDebug is true', () => {
      const logger = new Logger({
        enableDebug: true,
        minLevel: LogLevel.ERROR
      })
      const config = logger.getConfig()

      expect(config.minLevel).toBe(LogLevel.DEBUG)
    })
  })

  describe('error', () => {
    it('logs error messages', () => {
      const logger = new Logger()
      logger.error('Test error')

      expect(consoleSpy).toHaveBeenCalledOnce()
      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(logOutput.level).toBe('error')
      expect(logOutput.message).toBe('Test error')
    })

    it('includes context in log', () => {
      const logger = new Logger()
      logger.error('Test error', { userId: 123, action: 'login' })

      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(logOutput.context).toEqual({ userId: 123, action: 'login' })
    })

    it('includes error details', () => {
      const logger = new Logger()
      const error = new Error('Something went wrong')
      logger.error('Test error', {}, error)

      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(logOutput.error.name).toBe('Error')
      expect(logOutput.error.message).toBe('Something went wrong')
      expect(logOutput.error.stack).toBeDefined()
    })

    it('excludes stack traces when configured', () => {
      const logger = new Logger({ includeStackTraces: false })
      const error = new Error('Something went wrong')
      logger.error('Test error', {}, error)

      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(logOutput.error.stack).toBeUndefined()
    })
  })

  describe('warn', () => {
    it('logs warning messages', () => {
      const logger = new Logger()
      logger.warn('Test warning')

      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(logOutput.level).toBe('warn')
      expect(logOutput.message).toBe('Test warning')
    })

    it('includes context and error', () => {
      const logger = new Logger()
      const error = new Error('Warning cause')
      logger.warn('Test warning', { detail: 'info' }, error)

      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(logOutput.context.detail).toBe('info')
      expect(logOutput.error.message).toBe('Warning cause')
    })
  })

  describe('info', () => {
    it('logs info messages', () => {
      const logger = new Logger()
      logger.info('Test info')

      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(logOutput.level).toBe('info')
      expect(logOutput.message).toBe('Test info')
    })

    it('includes context', () => {
      const logger = new Logger()
      logger.info('Test info', { key: 'value' })

      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(logOutput.context.key).toBe('value')
    })
  })

  describe('debug', () => {
    it('logs debug messages when level is DEBUG', () => {
      const logger = new Logger({ minLevel: LogLevel.DEBUG })
      logger.debug('Test debug')

      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(logOutput.level).toBe('debug')
      expect(logOutput.message).toBe('Test debug')
    })

    it('suppresses debug messages at INFO level', () => {
      const logger = new Logger({ minLevel: LogLevel.INFO })
      logger.debug('Test debug')

      expect(consoleSpy).not.toHaveBeenCalled()
    })

    it('includes context and error', () => {
      const logger = new Logger({ minLevel: LogLevel.DEBUG })
      const error = new Error('Debug error')
      logger.debug('Test debug', { data: 123 }, error)

      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(logOutput.context.data).toBe(123)
      expect(logOutput.error.message).toBe('Debug error')
    })
  })

  describe('log level filtering', () => {
    it('logs at ERROR level only errors', () => {
      const logger = new Logger({ minLevel: LogLevel.ERROR })

      logger.error('error msg')
      logger.warn('warn msg')
      logger.info('info msg')
      logger.debug('debug msg')

      expect(consoleSpy).toHaveBeenCalledOnce()
      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(logOutput.message).toBe('error msg')
    })

    it('logs at WARN level errors and warnings', () => {
      const logger = new Logger({ minLevel: LogLevel.WARN })

      logger.error('error msg')
      logger.warn('warn msg')
      logger.info('info msg')
      logger.debug('debug msg')

      expect(consoleSpy).toHaveBeenCalledTimes(2)
    })

    it('logs at INFO level errors, warnings, and info', () => {
      const logger = new Logger({ minLevel: LogLevel.INFO })

      logger.error('error msg')
      logger.warn('warn msg')
      logger.info('info msg')
      logger.debug('debug msg')

      expect(consoleSpy).toHaveBeenCalledTimes(3)
    })

    it('logs at DEBUG level all messages', () => {
      const logger = new Logger({ minLevel: LogLevel.DEBUG })

      logger.error('error msg')
      logger.warn('warn msg')
      logger.info('info msg')
      logger.debug('debug msg')

      expect(consoleSpy).toHaveBeenCalledTimes(4)
    })
  })

  describe('prettyPrint', () => {
    it('formats output with indentation when enabled', () => {
      const logger = new Logger({ prettyPrint: true })
      logger.info('Test message')

      const output = consoleSpy.mock.calls[0][0]
      expect(output).toContain('\n')
      expect(output).toMatch(/^\{/)
    })

    it('outputs compact JSON when disabled', () => {
      const logger = new Logger({ prettyPrint: false })
      logger.info('Test message')

      const output = consoleSpy.mock.calls[0][0]
      expect(output).not.toContain('\n')
    })
  })

  describe('timestamp', () => {
    it('includes ISO timestamp in log entries', () => {
      const logger = new Logger()
      logger.info('Test')

      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(logOutput.timestamp).toBeDefined()
      expect(() => new Date(logOutput.timestamp)).not.toThrow()
    })
  })

  describe('empty context handling', () => {
    it('excludes context when empty object provided', () => {
      const logger = new Logger()
      logger.info('Test', {})

      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(logOutput.context).toBeUndefined()
    })

    it('excludes context when not provided', () => {
      const logger = new Logger()
      logger.info('Test')

      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(logOutput.context).toBeUndefined()
    })
  })

  describe('setConfig', () => {
    it('updates logger configuration', () => {
      const logger = new Logger()
      expect(logger.getConfig().minLevel).toBe(LogLevel.INFO)

      logger.setConfig({ minLevel: LogLevel.DEBUG })
      expect(logger.getConfig().minLevel).toBe(LogLevel.DEBUG)
    })

    it('merges with existing config', () => {
      const logger = new Logger({
        minLevel: LogLevel.WARN,
        prettyPrint: true
      })

      logger.setConfig({ prettyPrint: false })

      const config = logger.getConfig()
      expect(config.minLevel).toBe(LogLevel.WARN)
      expect(config.prettyPrint).toBe(false)
    })
  })

  describe('getConfig', () => {
    it('returns a copy of config', () => {
      const logger = new Logger()
      const config1 = logger.getConfig()
      const config2 = logger.getConfig()

      expect(config1).not.toBe(config2)
      expect(config1).toEqual(config2)
    })
  })
})

describe('defaultLogger', () => {
  it('is a Logger instance', () => {
    expect(defaultLogger).toBeInstanceOf(Logger)
  })
})

describe('log helper object', () => {
  it('has error, warn, info, debug methods', () => {
    expect(typeof log.error).toBe('function')
    expect(typeof log.warn).toBe('function')
    expect(typeof log.info).toBe('function')
    expect(typeof log.debug).toBe('function')
  })

  it('methods do not throw when called', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => log.error('test error')).not.toThrow()
    expect(() => log.warn('test warn')).not.toThrow()
    expect(() => log.info('test info')).not.toThrow()
    expect(() => log.debug('test debug')).not.toThrow()

    consoleSpy.mockRestore()
  })

  it('methods accept optional context and error params', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('test')

    expect(() => log.error('msg', { k: 'v' }, err)).not.toThrow()
    expect(() => log.warn('msg', { k: 'v' }, err)).not.toThrow()
    expect(() => log.info('msg', { k: 'v' })).not.toThrow()
    expect(() => log.debug('msg', { k: 'v' }, err)).not.toThrow()

    consoleSpy.mockRestore()
  })
})

describe('LogLevel enum', () => {
  it('has correct values', () => {
    expect(LogLevel.ERROR).toBe('error')
    expect(LogLevel.WARN).toBe('warn')
    expect(LogLevel.INFO).toBe('info')
    expect(LogLevel.DEBUG).toBe('debug')
  })
})
