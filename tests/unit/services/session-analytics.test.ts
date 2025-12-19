/**
 * Unit tests for SessionAnalytics
 *
 * Tests session metric tracking, thresholds, and singleton management.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSessionAnalytics,
  initSessionAnalytics,
  resetSessionAnalytics
} from '../../../src/services/session-analytics.js'
import type { Logger } from '../../../src/utils/logger.js'

// Mock logger that captures calls
const createMockLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
})

describe('SessionAnalytics', () => {
  let mockLogger: Logger

  beforeEach(() => {
    mockLogger = createMockLogger()
    resetSessionAnalytics() // Ensure clean state
  })

  afterEach(() => {
    resetSessionAnalytics()
  })

  describe('initialization', () => {
    it('initializes with unique session ID', () => {
      const analytics = initSessionAnalytics(mockLogger)
      const snapshot = analytics.getSnapshot()

      expect(snapshot.sessionId).toMatch(/^session_[a-z0-9]+_[a-z0-9]+$/)
    })

    it('logs initialization message', () => {
      initSessionAnalytics(mockLogger)

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Session analytics initialized',
        expect.objectContaining({ sessionId: expect.any(String) })
      )
    })

    it('returns existing instance on duplicate initialization', () => {
      const first = initSessionAnalytics(mockLogger)
      const second = initSessionAnalytics(mockLogger)

      expect(first).toBe(second)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Session analytics already initialized, returning existing instance'
      )
    })
  })

  describe('singleton management', () => {
    it('getSessionAnalytics returns null when not initialized', () => {
      expect(getSessionAnalytics()).toBeNull()
    })

    it('getSessionAnalytics returns instance after initialization', () => {
      const analytics = initSessionAnalytics(mockLogger)
      expect(getSessionAnalytics()).toBe(analytics)
    })

    it('resetSessionAnalytics clears the instance', () => {
      initSessionAnalytics(mockLogger)
      resetSessionAnalytics()
      expect(getSessionAnalytics()).toBeNull()
    })

    it('resetSessionAnalytics is safe to call when not initialized', () => {
      expect(() => resetSessionAnalytics()).not.toThrow()
    })
  })

  describe('recordToolExecution', () => {
    it('tracks tool execution metrics', () => {
      const analytics = initSessionAnalytics(mockLogger)

      analytics.recordToolExecution('grist_get_tables', 1024, 150, true)

      const snapshot = analytics.getSnapshot()
      expect(snapshot.totalToolCalls).toBe(1)
      expect(snapshot.totalResponseBytes).toBe(1024)
      expect(snapshot.toolStats.grist_get_tables).toEqual({
        count: 1,
        totalBytes: 1024,
        totalDuration: 150,
        maxResponseBytes: 1024
      })
    })

    it('accumulates metrics across multiple executions', () => {
      const analytics = initSessionAnalytics(mockLogger)

      analytics.recordToolExecution('grist_get_tables', 1000, 100, true)
      analytics.recordToolExecution('grist_get_tables', 2000, 200, true)
      analytics.recordToolExecution('grist_get_records', 500, 50, true)

      const snapshot = analytics.getSnapshot()
      expect(snapshot.totalToolCalls).toBe(3)
      expect(snapshot.totalResponseBytes).toBe(3500)
      expect(snapshot.toolStats.grist_get_tables.count).toBe(2)
      expect(snapshot.toolStats.grist_get_tables.totalBytes).toBe(3000)
      expect(snapshot.toolStats.grist_get_tables.maxResponseBytes).toBe(2000)
    })

    it('tracks largest response', () => {
      const analytics = initSessionAnalytics(mockLogger)

      analytics.recordToolExecution('small_tool', 100, 10, true)
      analytics.recordToolExecution('large_tool', 5000, 50, true)
      analytics.recordToolExecution('medium_tool', 1000, 30, true)

      const snapshot = analytics.getSnapshot()
      expect(snapshot.largestResponse?.tool).toBe('large_tool')
      expect(snapshot.largestResponse?.bytes).toBe(5000)
    })

    it('logs tool completion', () => {
      const analytics = initSessionAnalytics(mockLogger)

      analytics.recordToolExecution('grist_help', 256, 25, true)

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Tool completed',
        expect.objectContaining({
          tool: 'grist_help',
          duration: 25,
          success: true,
          responseBytes: 256
        })
      )
    })
  })

  describe('threshold warnings', () => {
    it('warns on large response', () => {
      const analytics = initSessionAnalytics(mockLogger)

      // Default threshold is 100KB (102400 bytes)
      analytics.recordToolExecution('big_response', 200000, 100, true)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Large response detected',
        expect.objectContaining({
          tool: 'big_response',
          responseBytes: 200000
        })
      )
    })

    it('adds warning for cumulative bytes threshold', () => {
      const analytics = initSessionAnalytics(mockLogger)

      // Exceed 5MB cumulative threshold (5242880 bytes)
      for (let i = 0; i < 60; i++) {
        analytics.recordToolExecution(`tool_${i}`, 100000, 10, true)
      }

      expect(analytics.hasWarnings()).toBe(true)
      const warnings = analytics.getWarnings()
      expect(warnings.some((w) => w.includes('Cumulative response bytes'))).toBe(true)
    })

    it('adds warning for tool call count threshold', () => {
      const analytics = initSessionAnalytics(mockLogger)

      // Exceed 100 tool call threshold
      for (let i = 0; i < 105; i++) {
        analytics.recordToolExecution(`tool_${i % 5}`, 100, 10, true)
      }

      expect(analytics.hasWarnings()).toBe(true)
      const warnings = analytics.getWarnings()
      expect(warnings.some((w) => w.includes('Tool call count'))).toBe(true)
    })

    it('only adds each warning type once', () => {
      const analytics = initSessionAnalytics(mockLogger)

      // Exceed threshold multiple times
      for (let i = 0; i < 150; i++) {
        analytics.recordToolExecution(`tool_${i % 5}`, 100, 10, true)
      }

      const warnings = analytics.getWarnings()
      const callCountWarnings = warnings.filter((w) => w.includes('Tool call count'))
      expect(callCountWarnings.length).toBe(1)
    })
  })

  describe('getSnapshot', () => {
    it('returns complete snapshot data', () => {
      const analytics = initSessionAnalytics(mockLogger)

      analytics.recordToolExecution('test_tool', 500, 50, true)

      const snapshot = analytics.getSnapshot()

      expect(snapshot).toMatchObject({
        sessionId: expect.any(String),
        startTime: expect.any(Date),
        durationSeconds: expect.any(Number),
        totalResponseBytes: 500,
        totalToolCalls: 1,
        toolStats: expect.any(Object),
        largestResponse: expect.any(Object),
        warnings: expect.any(Array),
        strictMode: expect.any(Boolean)
      })
    })

    it('calculates duration correctly', async () => {
      const analytics = initSessionAnalytics(mockLogger)

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100))

      const snapshot = analytics.getSnapshot()
      expect(snapshot.durationSeconds).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getSummary', () => {
    it('returns formatted summary', () => {
      const analytics = initSessionAnalytics(mockLogger)

      analytics.recordToolExecution('tool_a', 2048, 100, true)
      analytics.recordToolExecution('tool_a', 1024, 50, true)
      analytics.recordToolExecution('tool_b', 512, 25, true)

      const summary = analytics.getSummary()

      expect(summary.sessionId).toMatch(/^session_/)
      expect(summary.durationMinutes).toBeGreaterThanOrEqual(0)
      expect(summary.totalResponseKB).toBeCloseTo(3.5, 1) // ~3584 bytes / 1024
      expect(summary.totalToolCalls).toBe(3)
      expect(summary.warningCount).toBe(0)
      expect(summary.topTools.length).toBeLessThanOrEqual(5)
    })

    it('returns top 5 tools by bytes', () => {
      const analytics = initSessionAnalytics(mockLogger)

      // Create 7 tools with varying byte counts
      analytics.recordToolExecution('tool_1', 1000, 10, true)
      analytics.recordToolExecution('tool_2', 2000, 10, true)
      analytics.recordToolExecution('tool_3', 3000, 10, true)
      analytics.recordToolExecution('tool_4', 4000, 10, true)
      analytics.recordToolExecution('tool_5', 5000, 10, true)
      analytics.recordToolExecution('tool_6', 6000, 10, true)
      analytics.recordToolExecution('tool_7', 7000, 10, true)

      const summary = analytics.getSummary()

      expect(summary.topTools.length).toBe(5)
      expect(summary.topTools[0].name).toBe('tool_7') // Highest bytes
      expect(summary.topTools[4].name).toBe('tool_3') // 5th highest
    })
  })

  describe('reset', () => {
    it('clears all metrics', () => {
      const analytics = initSessionAnalytics(mockLogger)

      analytics.recordToolExecution('tool', 1000, 100, true)
      analytics.reset()

      const snapshot = analytics.getSnapshot()
      expect(snapshot.totalToolCalls).toBe(0)
      expect(snapshot.totalResponseBytes).toBe(0)
      expect(Object.keys(snapshot.toolStats).length).toBe(0)
      expect(snapshot.largestResponse).toBeNull()
      expect(snapshot.warnings.length).toBe(0)
    })

    it('logs reset message', () => {
      const analytics = initSessionAnalytics(mockLogger)
      analytics.reset()

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Session analytics reset',
        expect.objectContaining({ sessionId: expect.any(String) })
      )
    })

    it('resets warning flags (allows warnings again)', () => {
      const analytics = initSessionAnalytics(mockLogger)

      // Trigger warning
      for (let i = 0; i < 105; i++) {
        analytics.recordToolExecution(`tool_${i % 5}`, 100, 10, true)
      }

      expect(analytics.hasWarnings()).toBe(true)

      analytics.reset()

      expect(analytics.hasWarnings()).toBe(false)

      // Can trigger warning again after reset
      for (let i = 0; i < 105; i++) {
        analytics.recordToolExecution(`tool_${i % 5}`, 100, 10, true)
      }

      expect(analytics.hasWarnings()).toBe(true)
    })
  })

  describe('hasWarnings and getWarnings', () => {
    it('hasWarnings returns false when no warnings', () => {
      const analytics = initSessionAnalytics(mockLogger)
      expect(analytics.hasWarnings()).toBe(false)
    })

    it('getWarnings returns copy of warnings array', () => {
      const analytics = initSessionAnalytics(mockLogger)

      // Trigger warning
      for (let i = 0; i < 105; i++) {
        analytics.recordToolExecution(`tool_${i % 5}`, 100, 10, true)
      }

      const warnings1 = analytics.getWarnings()
      const warnings2 = analytics.getWarnings()

      expect(warnings1).toEqual(warnings2)
      expect(warnings1).not.toBe(warnings2) // Different array instances
    })
  })
})
