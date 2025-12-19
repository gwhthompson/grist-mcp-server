import { describe, expect, it, vi } from 'vitest'
import {
  type BatchRegistrationSummary,
  composeStrategies,
  createMetricsStrategy,
  failFastStrategy,
  getToolStatsByCategory,
  getToolsByAnnotations,
  silentStrategy,
  type ToolRegistrationResult,
  validateToolNames
} from '../../../src/registry/tool-registry.js'
import {
  DESTRUCTIVE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  type ToolAnnotations,
  type ToolCategory,
  type ToolDefinition,
  WRITE_IDEMPOTENT_ANNOTATIONS,
  WRITE_SAFE_ANNOTATIONS
} from '../../../src/registry/types.js'

// Helper to create minimal mock tool definitions
const mockTool = (
  name: string,
  category: ToolCategory = 'reading',
  annotations: ToolAnnotations = READ_ONLY_ANNOTATIONS
): ToolDefinition =>
  ({
    name,
    title: `Mock ${name}`,
    description: `Description for ${name}`,
    purpose: `Purpose for ${name}`,
    category,
    inputSchema: {},
    annotations,
    handler: vi.fn(),
    docs: { overview: '', examples: [], errors: [] }
  }) as unknown as ToolDefinition

describe('tool-registry utility functions', () => {
  describe('validateToolNames', () => {
    it('returns valid for unique names', () => {
      const tools = [mockTool('tool_a'), mockTool('tool_b'), mockTool('tool_c')]
      const result = validateToolNames(tools)
      expect(result.valid).toBe(true)
      expect(result.duplicates).toEqual([])
    })

    it('returns invalid with duplicates', () => {
      const tools = [mockTool('tool_a'), mockTool('tool_b'), mockTool('tool_a')]
      const result = validateToolNames(tools)
      expect(result.valid).toBe(false)
      expect(result.duplicates).toEqual(['tool_a'])
    })

    it('detects multiple duplicates', () => {
      const tools = [
        mockTool('tool_a'),
        mockTool('tool_b'),
        mockTool('tool_a'),
        mockTool('tool_b'),
        mockTool('tool_c')
      ]
      const result = validateToolNames(tools)
      expect(result.valid).toBe(false)
      expect(result.duplicates).toContain('tool_a')
      expect(result.duplicates).toContain('tool_b')
    })

    it('handles empty array', () => {
      const result = validateToolNames([])
      expect(result.valid).toBe(true)
      expect(result.duplicates).toEqual([])
    })

    it('handles single tool', () => {
      const result = validateToolNames([mockTool('only_tool')])
      expect(result.valid).toBe(true)
    })
  })

  describe('getToolStatsByCategory', () => {
    it('counts tools by category', () => {
      const tools = [
        mockTool('tool_1', 'reading'),
        mockTool('tool_2', 'reading'),
        mockTool('tool_3', 'records'),
        mockTool('tool_4', 'discovery')
      ]
      const stats = getToolStatsByCategory(tools)
      expect(stats.get('reading')).toBe(2)
      expect(stats.get('records')).toBe(1)
      expect(stats.get('discovery')).toBe(1)
    })

    it('returns empty map for empty array', () => {
      const stats = getToolStatsByCategory([])
      expect(stats.size).toBe(0)
    })

    it('counts all tools in same category', () => {
      const tools = [mockTool('a', 'utility'), mockTool('b', 'utility'), mockTool('c', 'utility')]
      const stats = getToolStatsByCategory(tools)
      expect(stats.get('utility')).toBe(3)
      expect(stats.size).toBe(1)
    })
  })

  describe('getToolsByAnnotations', () => {
    const tools = [
      mockTool('readonly_tool', 'reading', READ_ONLY_ANNOTATIONS),
      mockTool('write_tool', 'records', WRITE_SAFE_ANNOTATIONS),
      mockTool('idempotent_tool', 'records', WRITE_IDEMPOTENT_ANNOTATIONS),
      mockTool('destructive_tool', 'tables', DESTRUCTIVE_ANNOTATIONS)
    ]

    it('filters by readOnly', () => {
      const readOnly = getToolsByAnnotations(tools, { readOnly: true })
      expect(readOnly.length).toBe(1)
      expect(readOnly[0].name).toBe('readonly_tool')
    })

    it('filters by non-readOnly', () => {
      const writable = getToolsByAnnotations(tools, { readOnly: false })
      expect(writable.length).toBe(3)
    })

    it('filters by destructive', () => {
      const destructive = getToolsByAnnotations(tools, { destructive: true })
      expect(destructive.length).toBe(1)
      expect(destructive[0].name).toBe('destructive_tool')
    })

    it('filters by non-destructive', () => {
      const safe = getToolsByAnnotations(tools, { destructive: false })
      expect(safe.length).toBe(3)
    })

    it('filters by idempotent', () => {
      const idempotent = getToolsByAnnotations(tools, { idempotent: true })
      expect(idempotent.length).toBe(3) // readonly, idempotent, destructive
    })

    it('filters by non-idempotent', () => {
      const nonIdempotent = getToolsByAnnotations(tools, { idempotent: false })
      expect(nonIdempotent.length).toBe(1)
      expect(nonIdempotent[0].name).toBe('write_tool')
    })

    it('combines multiple filters (AND logic)', () => {
      const result = getToolsByAnnotations(tools, {
        readOnly: false,
        destructive: false,
        idempotent: true
      })
      expect(result.length).toBe(1)
      expect(result[0].name).toBe('idempotent_tool')
    })

    it('returns all tools with empty filter', () => {
      const result = getToolsByAnnotations(tools, {})
      expect(result.length).toBe(4)
    })

    it('returns empty array when no tools match', () => {
      const result = getToolsByAnnotations(tools, {
        readOnly: true,
        destructive: true
      })
      expect(result.length).toBe(0)
    })
  })
})

describe('Registration Strategies', () => {
  describe('silentStrategy', () => {
    it('has no callbacks defined', () => {
      expect(silentStrategy.beforeBatch).toBeUndefined()
      expect(silentStrategy.afterBatch).toBeUndefined()
      expect(silentStrategy.beforeTool).toBeUndefined()
      expect(silentStrategy.afterTool).toBeUndefined()
      expect(silentStrategy.onError).toBeUndefined()
    })
  })

  describe('failFastStrategy', () => {
    it('returns false on error (stop processing)', () => {
      const result = failFastStrategy.onError?.(new Error('test'), 'tool_name')
      expect(result).toBe(false)
    })
  })

  describe('createMetricsStrategy', () => {
    it('creates strategy with getMetrics function', () => {
      const { strategy, getMetrics } = createMetricsStrategy()
      expect(strategy).toBeDefined()
      expect(getMetrics).toBeDefined()
    })

    it('tracks tool timings', () => {
      const { strategy, getMetrics } = createMetricsStrategy()

      // Simulate beforeTool
      strategy.beforeTool?.('test_tool')

      // Simulate afterTool with success
      const result: ToolRegistrationResult = {
        toolName: 'test_tool',
        success: true,
        registeredAt: new Date()
      }
      strategy.afterTool?.(result)

      const metrics = getMetrics()
      expect(metrics.toolTimings.has('test_tool')).toBe(true)
      expect(metrics.toolTimings.get('test_tool')).toBeGreaterThanOrEqual(0)
    })

    it('tracks errors by tool', () => {
      const { strategy, getMetrics } = createMetricsStrategy()

      strategy.beforeTool?.('failing_tool')

      const error = new Error('Registration failed')
      const result: ToolRegistrationResult = {
        toolName: 'failing_tool',
        success: false,
        error,
        registeredAt: new Date()
      }
      strategy.afterTool?.(result)

      const metrics = getMetrics()
      expect(metrics.errorsByTool.has('failing_tool')).toBe(true)
      expect(metrics.errorsByTool.get('failing_tool')).toBe(error)
    })

    it('tracks total duration from batch summary', () => {
      const { strategy, getMetrics } = createMetricsStrategy()

      const summary: BatchRegistrationSummary = {
        total: 5,
        successful: 4,
        failed: 1,
        results: [],
        categories: new Map(),
        duration: 150
      }
      strategy.afterBatch?.(summary)

      const metrics = getMetrics()
      expect(metrics.totalDuration).toBe(150)
    })

    it('initializes with empty metrics', () => {
      const { getMetrics } = createMetricsStrategy()
      const metrics = getMetrics()
      expect(metrics.toolTimings.size).toBe(0)
      expect(metrics.errorsByTool.size).toBe(0)
      expect(metrics.totalDuration).toBe(0)
    })
  })

  describe('composeStrategies', () => {
    it('calls beforeBatch on all strategies', () => {
      const fn1 = vi.fn()
      const fn2 = vi.fn()
      const composed = composeStrategies({ beforeBatch: fn1 }, { beforeBatch: fn2 })

      composed.beforeBatch?.(5)

      expect(fn1).toHaveBeenCalledWith(5)
      expect(fn2).toHaveBeenCalledWith(5)
    })

    it('calls beforeTool on all strategies', () => {
      const fn1 = vi.fn()
      const fn2 = vi.fn()
      const composed = composeStrategies({ beforeTool: fn1 }, { beforeTool: fn2 })

      composed.beforeTool?.('my_tool')

      expect(fn1).toHaveBeenCalledWith('my_tool')
      expect(fn2).toHaveBeenCalledWith('my_tool')
    })

    it('calls afterTool on all strategies', () => {
      const fn1 = vi.fn()
      const fn2 = vi.fn()
      const composed = composeStrategies({ afterTool: fn1 }, { afterTool: fn2 })

      const result: ToolRegistrationResult = {
        toolName: 'test',
        success: true,
        registeredAt: new Date()
      }
      composed.afterTool?.(result)

      expect(fn1).toHaveBeenCalledWith(result)
      expect(fn2).toHaveBeenCalledWith(result)
    })

    it('calls afterBatch on all strategies', () => {
      const fn1 = vi.fn()
      const fn2 = vi.fn()
      const composed = composeStrategies({ afterBatch: fn1 }, { afterBatch: fn2 })

      const summary: BatchRegistrationSummary = {
        total: 3,
        successful: 3,
        failed: 0,
        results: [],
        categories: new Map(),
        duration: 100
      }
      composed.afterBatch?.(summary)

      expect(fn1).toHaveBeenCalledWith(summary)
      expect(fn2).toHaveBeenCalledWith(summary)
    })

    it('stops on first onError returning false', () => {
      const fn1 = vi.fn(() => false)
      const fn2 = vi.fn(() => true)
      const composed = composeStrategies({ onError: fn1 }, { onError: fn2 })

      const result = composed.onError?.(new Error('test'), 'tool')

      expect(result).toBe(false)
      expect(fn1).toHaveBeenCalled()
      expect(fn2).not.toHaveBeenCalled()
    })

    it('continues when all onError return true', () => {
      const fn1 = vi.fn(() => true)
      const fn2 = vi.fn(() => true)
      const composed = composeStrategies({ onError: fn1 }, { onError: fn2 })

      const result = composed.onError?.(new Error('test'), 'tool')

      expect(result).toBe(true)
      expect(fn1).toHaveBeenCalled()
      expect(fn2).toHaveBeenCalled()
    })

    it('returns true when no strategies have onError', () => {
      const composed = composeStrategies({ beforeBatch: vi.fn() }, { afterBatch: vi.fn() })
      const result = composed.onError?.(new Error('test'), 'tool')
      expect(result).toBe(true)
    })

    it('handles empty strategies array', () => {
      const composed = composeStrategies()
      expect(() => composed.beforeBatch?.(5)).not.toThrow()
      expect(() => composed.beforeTool?.('tool')).not.toThrow()
    })

    it('handles strategies with missing callbacks', () => {
      const composed = composeStrategies({}, { beforeBatch: vi.fn() }, {})
      expect(() => composed.beforeBatch?.(5)).not.toThrow()
    })
  })
})

describe('Annotation presets', () => {
  it('READ_ONLY_ANNOTATIONS has correct values', () => {
    expect(READ_ONLY_ANNOTATIONS.readOnlyHint).toBe(true)
    expect(READ_ONLY_ANNOTATIONS.destructiveHint).toBe(false)
    expect(READ_ONLY_ANNOTATIONS.idempotentHint).toBe(true)
    expect(READ_ONLY_ANNOTATIONS.openWorldHint).toBe(true)
  })

  it('WRITE_SAFE_ANNOTATIONS has correct values', () => {
    expect(WRITE_SAFE_ANNOTATIONS.readOnlyHint).toBe(false)
    expect(WRITE_SAFE_ANNOTATIONS.destructiveHint).toBe(false)
    expect(WRITE_SAFE_ANNOTATIONS.idempotentHint).toBe(false)
    expect(WRITE_SAFE_ANNOTATIONS.openWorldHint).toBe(true)
  })

  it('WRITE_IDEMPOTENT_ANNOTATIONS has correct values', () => {
    expect(WRITE_IDEMPOTENT_ANNOTATIONS.readOnlyHint).toBe(false)
    expect(WRITE_IDEMPOTENT_ANNOTATIONS.destructiveHint).toBe(false)
    expect(WRITE_IDEMPOTENT_ANNOTATIONS.idempotentHint).toBe(true)
    expect(WRITE_IDEMPOTENT_ANNOTATIONS.openWorldHint).toBe(true)
  })

  it('DESTRUCTIVE_ANNOTATIONS has correct values', () => {
    expect(DESTRUCTIVE_ANNOTATIONS.readOnlyHint).toBe(false)
    expect(DESTRUCTIVE_ANNOTATIONS.destructiveHint).toBe(true)
    expect(DESTRUCTIVE_ANNOTATIONS.idempotentHint).toBe(true)
    expect(DESTRUCTIVE_ANNOTATIONS.openWorldHint).toBe(true)
  })
})
