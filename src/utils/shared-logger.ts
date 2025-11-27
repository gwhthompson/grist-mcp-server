import { Logger, LogLevel } from './logger.js'

// Priority: GRIST_MCP_DEBUG_MODE > GRIST_MCP_LOG_LEVEL > NODE_ENV > INFO
function getLogLevel(): LogLevel {
  if (process.env.GRIST_MCP_DEBUG_MODE === 'true') {
    return LogLevel.DEBUG
  }

  const level = process.env.GRIST_MCP_LOG_LEVEL?.toLowerCase()

  switch (level) {
    case 'error':
      return LogLevel.ERROR
    case 'warn':
      return LogLevel.WARN
    case 'info':
      return LogLevel.INFO
    case 'debug':
      return LogLevel.DEBUG
    default:
      return process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
  }
}

export const sharedLogger = new Logger({
  minLevel: getLogLevel(),
  includeStackTraces: true,
  prettyPrint:
    process.env.GRIST_MCP_DEBUG_MODE === 'true' || process.env.GRIST_MCP_LOG_PRETTY === 'true'
})

export const log = {
  error: (msg: string, ctx?: Record<string, unknown>, err?: Error) =>
    sharedLogger.error(msg, ctx, err),
  warn: (msg: string, ctx?: Record<string, unknown>, err?: Error) =>
    sharedLogger.warn(msg, ctx, err),
  info: (msg: string, ctx?: Record<string, unknown>) => sharedLogger.info(msg, ctx),
  debug: (msg: string, ctx?: Record<string, unknown>, err?: Error) =>
    sharedLogger.debug(msg, ctx, err)
}
