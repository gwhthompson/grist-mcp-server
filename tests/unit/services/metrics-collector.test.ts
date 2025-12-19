import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '../../../src/utils/logger.js'
import type { RateLimiter } from '../../../src/utils/rate-limiter.js'
import type { ResponseCache } from '../../../src/utils/response-cache.js'

// Mock session-analytics before importing MetricsCollector
vi.mock('../../../src/services/session-analytics.js', () => ({
  getSessionAnalytics: vi.fn()
}))

import { MetricsCollector } from '../../../src/services/metrics-collector.js'
import { getSessionAnalytics } from '../../../src/services/session-analytics.js'

describe('MetricsCollector', () => {
  let mockRateLimiter: {
    getStats: ReturnType<typeof vi.fn>
  }
  let mockCache: {
    getStats: ReturnType<typeof vi.fn>
  }
  let mockLogger: {
    info: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
    debug: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()

    mockRateLimiter = {
      getStats: vi.fn().mockReturnValue({
        queueLength: 5,
        activeCount: 2,
        maxConcurrent: 10
      })
    }

    mockCache = {
      getStats: vi.fn().mockReturnValue({
        hits: 100,
        misses: 20,
        size: 50,
        hitRate: 0.833
      })
    }

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    }

    vi.mocked(getSessionAnalytics).mockReturnValue({
      getSummary: () => ({
        sessionId: 'test-session',
        durationMinutes: 5,
        totalResponseKB: 10,
        totalToolCalls: 25,
        warningCount: 1,
        topTools: [{ name: 'grist_get_records', count: 10, avgDuration: 200 }]
      })
    } as ReturnType<typeof getSessionAnalytics>)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('uses default config values when not provided', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger
      )

      const config = collector.getConfig()
      expect(config.interval).toBe(60000)
      expect(config.includeRateLimiter).toBe(true)
      expect(config.includeCache).toBe(true)
      expect(config.includeSessionAnalytics).toBe(true)
      expect(config.isRunning).toBe(false)
    })

    it('uses custom config values when provided', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger,
        {
          interval: 30000,
          includeRateLimiter: false,
          includeCache: false,
          includeSessionAnalytics: false
        }
      )

      const config = collector.getConfig()
      expect(config.interval).toBe(30000)
      expect(config.includeRateLimiter).toBe(false)
      expect(config.includeCache).toBe(false)
      expect(config.includeSessionAnalytics).toBe(false)
    })
  })

  describe('start', () => {
    it('starts collecting metrics and logs start message', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger
      )

      collector.start()

      expect(mockLogger.info).toHaveBeenCalledWith('Metrics collector started', {
        interval: 60000,
        includeRateLimiter: true,
        includeCache: true,
        includeSessionAnalytics: true
      })
      expect(collector.isCollecting()).toBe(true)
    })

    it('warns if already running', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger
      )

      collector.start()
      collector.start()

      expect(mockLogger.warn).toHaveBeenCalledWith('Metrics collector already running')
    })

    it('collects metrics immediately on start', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger
      )

      collector.start()

      // First call is 'started', second is 'Periodic metrics'
      expect(mockLogger.info).toHaveBeenCalledTimes(2)
      expect(mockLogger.info).toHaveBeenLastCalledWith('Periodic metrics', expect.any(Object))
    })

    it('collects metrics at the configured interval', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger,
        { interval: 1000 }
      )

      collector.start()
      const initialCalls = mockLogger.info.mock.calls.length

      vi.advanceTimersByTime(1000)
      expect(mockLogger.info.mock.calls.length).toBe(initialCalls + 1)

      vi.advanceTimersByTime(1000)
      expect(mockLogger.info.mock.calls.length).toBe(initialCalls + 2)

      collector.stop()
    })
  })

  describe('stop', () => {
    it('stops collecting metrics and logs stop message', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger
      )

      collector.start()
      collector.stop()

      expect(mockLogger.info).toHaveBeenCalledWith('Metrics collector stopped')
      expect(collector.isCollecting()).toBe(false)
    })

    it('does nothing if not running', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger
      )

      collector.stop()

      expect(mockLogger.info).not.toHaveBeenCalledWith('Metrics collector stopped')
    })

    it('stops interval from firing', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger,
        { interval: 1000 }
      )

      collector.start()
      const callsBeforeStop = mockLogger.info.mock.calls.length

      collector.stop()
      vi.advanceTimersByTime(5000)

      // Only one more call for 'stopped', no more periodic calls
      expect(mockLogger.info.mock.calls.length).toBe(callsBeforeStop + 1)
    })
  })

  describe('metrics collection', () => {
    it('includes rate limiter stats when enabled', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger,
        { includeRateLimiter: true, includeCache: false, includeSessionAnalytics: false }
      )

      collector.start()

      expect(mockRateLimiter.getStats).toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Periodic metrics',
        expect.objectContaining({
          rateLimiter: expect.objectContaining({
            queueLength: 5,
            activeCount: 2,
            maxConcurrent: 10,
            utilization: 20
          })
        })
      )

      collector.stop()
    })

    it('excludes rate limiter stats when disabled', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger,
        { includeRateLimiter: false, includeCache: false, includeSessionAnalytics: false }
      )

      collector.start()

      expect(mockRateLimiter.getStats).not.toHaveBeenCalled()

      collector.stop()
    })

    it('includes cache stats when enabled', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger,
        { includeRateLimiter: false, includeCache: true, includeSessionAnalytics: false }
      )

      collector.start()

      expect(mockCache.getStats).toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Periodic metrics',
        expect.objectContaining({
          cache: expect.objectContaining({
            hits: 100,
            misses: 20,
            size: 50,
            hitRate: '83.30%',
            total: 120
          })
        })
      )

      collector.stop()
    })

    it('includes session analytics when enabled and available', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger,
        { includeRateLimiter: false, includeCache: false, includeSessionAnalytics: true }
      )

      collector.start()

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Periodic metrics',
        expect.objectContaining({
          session: expect.objectContaining({
            sessionId: 'test-session',
            durationMinutes: 5,
            totalToolCalls: 25
          })
        })
      )

      collector.stop()
    })

    it('handles missing session analytics gracefully', () => {
      vi.mocked(getSessionAnalytics).mockReturnValue(null)

      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger,
        { includeRateLimiter: false, includeCache: false, includeSessionAnalytics: true }
      )

      collector.start()

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Periodic metrics',
        expect.not.objectContaining({
          session: expect.anything()
        })
      )

      collector.stop()
    })

    it('handles zero maxConcurrent in rate limiter', () => {
      mockRateLimiter.getStats.mockReturnValue({
        queueLength: 0,
        activeCount: 0,
        maxConcurrent: 0
      })

      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger,
        { includeRateLimiter: true, includeCache: false, includeSessionAnalytics: false }
      )

      collector.start()

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Periodic metrics',
        expect.objectContaining({
          rateLimiter: expect.objectContaining({
            utilization: 0
          })
        })
      )

      collector.stop()
    })
  })

  describe('isCollecting', () => {
    it('returns false initially', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger
      )

      expect(collector.isCollecting()).toBe(false)
    })

    it('returns true after start', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger
      )

      collector.start()
      expect(collector.isCollecting()).toBe(true)

      collector.stop()
    })

    it('returns false after stop', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger
      )

      collector.start()
      collector.stop()
      expect(collector.isCollecting()).toBe(false)
    })
  })

  describe('getConfig', () => {
    it('returns current configuration', () => {
      const collector = new MetricsCollector(
        mockRateLimiter as unknown as RateLimiter,
        mockCache as unknown as ResponseCache,
        mockLogger as unknown as Logger,
        {
          interval: 5000,
          includeRateLimiter: true,
          includeCache: false,
          includeSessionAnalytics: true
        }
      )

      const config = collector.getConfig()

      expect(config).toEqual({
        interval: 5000,
        includeRateLimiter: true,
        includeCache: false,
        includeSessionAnalytics: true,
        isRunning: false
      })
    })
  })
})
