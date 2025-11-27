// Tracks per-session metrics for debugging MCP response sizes

import { SESSION_ANALYTICS_CONFIG, STRICT_MODE } from '../constants.js'
import type { Logger } from '../utils/logger.js'

export interface ToolStats {
  count: number
  totalBytes: number
  totalDuration: number
  maxResponseBytes: number
}

export interface SessionAnalyticsSnapshot {
  sessionId: string
  startTime: Date
  durationSeconds: number
  totalResponseBytes: number
  totalToolCalls: number
  toolStats: Record<string, ToolStats>
  largestResponse: {
    tool: string
    bytes: number
    timestamp: Date
  } | null
  warnings: string[]
  strictMode: boolean
}

export class SessionAnalytics {
  private readonly sessionId: string
  private readonly startTime: Date
  private totalResponseBytes = 0
  private totalToolCalls = 0
  private readonly toolStats = new Map<string, ToolStats>()
  private largestResponse: { tool: string; bytes: number; timestamp: Date } | null = null
  private readonly warnings: string[] = []
  private warningFlags = {
    cumulativeBytesWarning: false,
    toolCallCountWarning: false
  }

  constructor(private readonly logger: Logger) {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 8)
    this.sessionId = `session_${timestamp}_${random}`
    this.startTime = new Date()

    this.logger.info('Session analytics initialized', {
      sessionId: this.sessionId,
      strictMode: STRICT_MODE,
      thresholds: SESSION_ANALYTICS_CONFIG
    })
  }

  recordToolExecution(
    toolName: string,
    responseBytes: number,
    durationMs: number,
    success: boolean
  ): void {
    this.totalResponseBytes += responseBytes
    this.totalToolCalls++

    const existing = this.toolStats.get(toolName) ?? {
      count: 0,
      totalBytes: 0,
      totalDuration: 0,
      maxResponseBytes: 0
    }

    existing.count++
    existing.totalBytes += responseBytes
    existing.totalDuration += durationMs
    existing.maxResponseBytes = Math.max(existing.maxResponseBytes, responseBytes)
    this.toolStats.set(toolName, existing)

    if (!this.largestResponse || responseBytes > this.largestResponse.bytes) {
      this.largestResponse = {
        tool: toolName,
        bytes: responseBytes,
        timestamp: new Date()
      }
    }

    this.logger.info('Tool completed', {
      tool: toolName,
      duration: durationMs,
      success,
      responseBytes,
      cumulativeBytes: this.totalResponseBytes,
      toolCallNumber: this.totalToolCalls
    })

    if (responseBytes > SESSION_ANALYTICS_CONFIG.largeResponseThreshold) {
      this.logger.warn('Large response detected', {
        tool: toolName,
        responseBytes,
        threshold: SESSION_ANALYTICS_CONFIG.largeResponseThreshold
      })
    }

    // Warning uses flag to ensure it only fires once per session
    if (
      !this.warningFlags.cumulativeBytesWarning &&
      this.totalResponseBytes > SESSION_ANALYTICS_CONFIG.cumulativeBytesWarningThreshold
    ) {
      this.warningFlags.cumulativeBytesWarning = true
      const warning = `Cumulative response bytes (${this.formatBytes(this.totalResponseBytes)}) exceeded threshold (${this.formatBytes(SESSION_ANALYTICS_CONFIG.cumulativeBytesWarningThreshold)}). Consider starting a new conversation.`
      this.warnings.push(warning)
      this.logger.warn('Session cumulative bytes threshold exceeded', {
        totalResponseBytes: this.totalResponseBytes,
        threshold: SESSION_ANALYTICS_CONFIG.cumulativeBytesWarningThreshold,
        recommendation: 'Start a new conversation to prevent potential crashes'
      })
    }

    // Warning uses flag to ensure it only fires once per session
    if (
      !this.warningFlags.toolCallCountWarning &&
      this.totalToolCalls > SESSION_ANALYTICS_CONFIG.toolCallCountWarningThreshold
    ) {
      this.warningFlags.toolCallCountWarning = true
      const warning = `Tool call count (${this.totalToolCalls}) exceeded threshold (${SESSION_ANALYTICS_CONFIG.toolCallCountWarningThreshold}). Consider starting a new conversation.`
      this.warnings.push(warning)
      this.logger.warn('Session tool call count threshold exceeded', {
        totalToolCalls: this.totalToolCalls,
        threshold: SESSION_ANALYTICS_CONFIG.toolCallCountWarningThreshold,
        recommendation: 'Start a new conversation to prevent potential crashes'
      })
    }
  }

  getSnapshot(): SessionAnalyticsSnapshot {
    const now = new Date()
    const durationSeconds = Math.floor((now.getTime() - this.startTime.getTime()) / 1000)

    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      durationSeconds,
      totalResponseBytes: this.totalResponseBytes,
      totalToolCalls: this.totalToolCalls,
      toolStats: Object.fromEntries(this.toolStats),
      largestResponse: this.largestResponse,
      warnings: [...this.warnings],
      strictMode: STRICT_MODE
    }
  }

  getSummary(): {
    sessionId: string
    durationMinutes: number
    totalResponseKB: number
    totalToolCalls: number
    warningCount: number
    topTools: Array<{ name: string; calls: number; totalKB: number }>
  } {
    const snapshot = this.getSnapshot()
    const topTools = Array.from(this.toolStats.entries())
      .map(([name, stats]) => ({
        name,
        calls: stats.count,
        totalKB: Math.round((stats.totalBytes / 1024) * 100) / 100
      }))
      .sort((a, b) => b.totalKB - a.totalKB)
      .slice(0, 5)

    return {
      sessionId: this.sessionId,
      durationMinutes: Math.round((snapshot.durationSeconds / 60) * 10) / 10,
      totalResponseKB: Math.round((this.totalResponseBytes / 1024) * 100) / 100,
      totalToolCalls: this.totalToolCalls,
      warningCount: this.warnings.length,
      topTools
    }
  }

  hasWarnings(): boolean {
    return this.warnings.length > 0
  }

  getWarnings(): string[] {
    return [...this.warnings]
  }

  reset(): void {
    this.totalResponseBytes = 0
    this.totalToolCalls = 0
    this.toolStats.clear()
    this.largestResponse = null
    this.warnings.length = 0
    this.warningFlags.cumulativeBytesWarning = false
    this.warningFlags.toolCallCountWarning = false

    this.logger.info('Session analytics reset', { sessionId: this.sessionId })
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
  }
}

/**
 * Session analytics singleton.
 *
 * Initialized once via initSessionAnalytics() at app startup.
 * Accessed via getSessionAnalytics() from GristTool base class.
 * For testing, use resetSessionAnalytics() between tests.
 */
let sessionAnalyticsInstance: SessionAnalytics | null = null

/**
 * Initializes the session analytics singleton.
 * Should only be called once during app initialization.
 */
export function initSessionAnalytics(logger: Logger): SessionAnalytics {
  if (sessionAnalyticsInstance) {
    logger.warn('Session analytics already initialized, returning existing instance')
    return sessionAnalyticsInstance
  }
  sessionAnalyticsInstance = new SessionAnalytics(logger)
  return sessionAnalyticsInstance
}

/**
 * Gets the current session analytics instance.
 * Returns null if not initialized (e.g., during unit tests).
 */
export function getSessionAnalytics(): SessionAnalytics | null {
  return sessionAnalyticsInstance
}

/**
 * Resets session analytics for test isolation.
 * Clears all recorded metrics and destroys the singleton.
 */
export function resetSessionAnalytics(): void {
  if (sessionAnalyticsInstance) {
    sessionAnalyticsInstance.reset()
  }
  sessionAnalyticsInstance = null
}
