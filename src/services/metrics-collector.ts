import type { Logger } from '../utils/logger.js'
import type { RateLimiter } from '../utils/rate-limiter.js'
import type { ResponseCache } from '../utils/response-cache.js'
import { getSessionAnalytics } from './session-analytics.js'

export interface MetricsCollectorConfig {
  interval?: number
  includeRateLimiter?: boolean
  includeCache?: boolean
  includeSessionAnalytics?: boolean
}

export class MetricsCollector {
  private intervalId: NodeJS.Timeout | null = null
  private readonly interval: number
  private readonly includeRateLimiter: boolean
  private readonly includeCache: boolean
  private readonly includeSessionAnalytics: boolean
  private isRunning = false

  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly cache: ResponseCache,
    private readonly logger: Logger,
    config?: MetricsCollectorConfig
  ) {
    this.interval = config?.interval ?? 60000
    this.includeRateLimiter = config?.includeRateLimiter ?? true
    this.includeCache = config?.includeCache ?? true
    this.includeSessionAnalytics = config?.includeSessionAnalytics ?? true
  }

  start(): void {
    if (this.isRunning) {
      this.logger.warn('Metrics collector already running')
      return
    }

    this.logger.info('Metrics collector started', {
      interval: this.interval,
      includeRateLimiter: this.includeRateLimiter,
      includeCache: this.includeCache,
      includeSessionAnalytics: this.includeSessionAnalytics
    })

    this.collectMetrics()

    this.intervalId = setInterval(() => {
      this.collectMetrics()
    }, this.interval)

    this.isRunning = true
  }

  stop(): void {
    if (!this.isRunning) {
      return
    }

    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.logger.info('Metrics collector stopped')
    this.isRunning = false
  }

  private collectMetrics(): void {
    const metrics: Record<string, unknown> = {
      timestamp: new Date().toISOString()
    }

    if (this.includeRateLimiter) {
      const rateLimiterStats = this.rateLimiter.getStats()
      metrics.rateLimiter = {
        queueLength: rateLimiterStats.queueLength,
        activeCount: rateLimiterStats.activeCount,
        maxConcurrent: rateLimiterStats.maxConcurrent,
        utilization:
          rateLimiterStats.maxConcurrent > 0
            ? (rateLimiterStats.activeCount / rateLimiterStats.maxConcurrent) * 100
            : 0
      }
    }

    if (this.includeCache) {
      const cacheStats = this.cache.getStats()
      metrics.cache = {
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        size: cacheStats.size,
        hitRate: `${(cacheStats.hitRate * 100).toFixed(2)}%`,
        total: cacheStats.hits + cacheStats.misses
      }
    }

    if (this.includeSessionAnalytics) {
      const sessionAnalytics = getSessionAnalytics()
      if (sessionAnalytics) {
        const summary = sessionAnalytics.getSummary()
        metrics.session = {
          sessionId: summary.sessionId,
          durationMinutes: summary.durationMinutes,
          totalResponseKB: summary.totalResponseKB,
          totalToolCalls: summary.totalToolCalls,
          warningCount: summary.warningCount,
          topTools: summary.topTools
        }
      }
    }

    this.logger.info('Periodic metrics', metrics)
  }

  isCollecting(): boolean {
    return this.isRunning
  }

  getConfig(): {
    interval: number
    includeRateLimiter: boolean
    includeCache: boolean
    includeSessionAnalytics: boolean
    isRunning: boolean
  } {
    return {
      interval: this.interval,
      includeRateLimiter: this.includeRateLimiter,
      includeCache: this.includeCache,
      includeSessionAnalytics: this.includeSessionAnalytics,
      isRunning: this.isRunning
    }
  }
}
