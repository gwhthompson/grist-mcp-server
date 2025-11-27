// Structured logging with configurable levels and context

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

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

export interface LoggerConfig {
  minLevel: LogLevel
  includeStackTraces: boolean
  prettyPrint: boolean
  enableDebug?: boolean
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.ERROR]: 0,
  [LogLevel.WARN]: 1,
  [LogLevel.INFO]: 2,
  [LogLevel.DEBUG]: 3
}

export class Logger {
  private config: LoggerConfig

  constructor(config: Partial<LoggerConfig> = {}) {
    const minLevel =
      config.enableDebug === true ? LogLevel.DEBUG : (config.minLevel ?? LogLevel.INFO)

    this.config = {
      minLevel,
      includeStackTraces: config.includeStackTraces ?? true,
      prettyPrint: config.prettyPrint ?? false,
      enableDebug: config.enableDebug
    }
  }

  error(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error)
  }

  warn(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log(LogLevel.WARN, message, context, error)
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context)
  }

  debug(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log(LogLevel.DEBUG, message, context, error)
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    if (LOG_LEVEL_PRIORITY[level] > LOG_LEVEL_PRIORITY[this.config.minLevel]) {
      return
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message
    }

    if (context && Object.keys(context).length > 0) {
      entry.context = context
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message
      }

      if (this.config.includeStackTraces && error.stack) {
        entry.error.stack = error.stack
      }
    }

    const output = this.config.prettyPrint ? JSON.stringify(entry, null, 2) : JSON.stringify(entry)

    console.error(output)
  }

  setConfig(config: Partial<LoggerConfig>): void {
    this.config = {
      ...this.config,
      ...config
    }
  }

  getConfig(): LoggerConfig {
    return { ...this.config }
  }
}

export const defaultLogger = new Logger()

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
