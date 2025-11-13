/**
 * Structured Logger - Context-aware logging for debugging and monitoring
 *
 * Provides structured logging with:
 * - Log levels (error, warn, info, debug)
 * - Context objects for rich debugging information
 * - Stack trace capture for errors
 * - Timestamp and log level metadata
 * - JSON-formatted output to stderr
 */

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  error?: {
    name: string
    message: string
    stack?: string
  }
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level to output (default: INFO) */
  minLevel: LogLevel
  /** Include stack traces in error logs (default: true) */
  includeStackTraces: boolean
  /** Pretty-print JSON output (default: false for production) */
  prettyPrint: boolean
  /** Enable debug logging - overrides minLevel to DEBUG when true (default: false) */
  enableDebug?: boolean
}

/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.ERROR]: 0,
  [LogLevel.WARN]: 1,
  [LogLevel.INFO]: 2,
  [LogLevel.DEBUG]: 3
}

/**
 * Structured logger for the Grist MCP Server
 *
 * Outputs structured JSON logs to stderr for easy parsing and monitoring.
 * All logs include timestamp, level, message, and optional context.
 *
 * @example
 * ```typescript
 * const logger = new Logger({ minLevel: LogLevel.DEBUG })
 *
 * logger.info('Server started', { port: 3000, version: '1.0.0' })
 * logger.error('Request failed', { path: '/api/docs', status: 500 }, error)
 * ```
 */
export class Logger {
  private config: LoggerConfig

  /**
   * Create a new logger
   *
   * @param config - Optional logger configuration
   */
  constructor(config: Partial<LoggerConfig> = {}) {
    // If enableDebug is explicitly set to true, override minLevel to DEBUG
    const minLevel =
      config.enableDebug === true ? LogLevel.DEBUG : config.minLevel ?? LogLevel.INFO

    this.config = {
      minLevel,
      includeStackTraces: config.includeStackTraces ?? true,
      prettyPrint: config.prettyPrint ?? false,
      enableDebug: config.enableDebug
    }
  }

  /**
   * Log an error message
   *
   * @param message - Error message
   * @param context - Optional context object
   * @param error - Optional Error object
   */
  error(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error)
  }

  /**
   * Log a warning message
   *
   * @param message - Warning message
   * @param context - Optional context object
   * @param error - Optional Error object
   */
  warn(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log(LogLevel.WARN, message, context, error)
  }

  /**
   * Log an info message
   *
   * @param message - Info message
   * @param context - Optional context object
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context)
  }

  /**
   * Log a debug message
   *
   * @param message - Debug message
   * @param context - Optional context object
   * @param error - Optional Error object
   */
  debug(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log(LogLevel.DEBUG, message, context, error)
  }

  /**
   * Core logging method
   *
   * @private
   * @param level - Log level
   * @param message - Log message
   * @param context - Optional context object
   * @param error - Optional Error object
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    // Check if log level should be output
    if (LOG_LEVEL_PRIORITY[level] > LOG_LEVEL_PRIORITY[this.config.minLevel]) {
      return
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message
    }

    // Add context if provided
    if (context && Object.keys(context).length > 0) {
      entry.context = context
    }

    // Add error details if provided
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message
      }

      if (this.config.includeStackTraces && error.stack) {
        entry.error.stack = error.stack
      }
    }

    // Output to stderr as JSON
    const output = this.config.prettyPrint ? JSON.stringify(entry, null, 2) : JSON.stringify(entry)

    console.error(output)
  }

  /**
   * Update logger configuration
   *
   * @param config - Partial configuration to update
   */
  setConfig(config: Partial<LoggerConfig>): void {
    this.config = {
      ...this.config,
      ...config
    }
  }

  /**
   * Get current configuration
   *
   * @returns Current logger configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config }
  }
}

/**
 * Default logger instance
 *
 * Use this for simple logging without creating a logger instance.
 */
export const defaultLogger = new Logger()

/**
 * Convenience logging functions using default logger
 */
export const log = {
  error: (message: string, context?: Record<string, unknown>, error?: Error) =>
    defaultLogger.error(message, context, error),
  warn: (message: string, context?: Record<string, unknown>, error?: Error) =>
    defaultLogger.warn(message, context, error),
  info: (message: string, context?: Record<string, unknown>) =>
    defaultLogger.info(message, context),
  debug: (message: string, context?: Record<string, unknown>, error?: Error) =>
    defaultLogger.debug(message, context, error)
}
