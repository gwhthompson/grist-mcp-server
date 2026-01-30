/**
 * Unit tests for WidgetRegistry
 *
 * Tests the registry that tracks local ID → section ID mappings
 * during declarative layout creation.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { WidgetRegistry } from '../../../../src/services/declarative-layout/widget-registry.js'

describe('WidgetRegistry', () => {
  let registry: WidgetRegistry

  beforeEach(() => {
    registry = new WidgetRegistry()
  })

  describe('register', () => {
    it('registers a widget with local ID', () => {
      registry.register(100, 'list')
      expect(registry.resolve('list')).toBe(100)
    })

    it('registers a widget without local ID', () => {
      registry.register(100)
      // Should not throw, just not register any local ID
      expect(() => registry.resolve('any')).toThrow()
    })

    it('registers multiple widgets with different local IDs', () => {
      registry.register(100, 'list')
      registry.register(101, 'detail')
      registry.register(102, 'chart')

      expect(registry.resolve('list')).toBe(100)
      expect(registry.resolve('detail')).toBe(101)
      expect(registry.resolve('chart')).toBe(102)
    })

    it('throws on duplicate local ID', () => {
      registry.register(100, 'list')

      expect(() => registry.register(101, 'list')).toThrow('Duplicate local widget ID: "list"')
    })

    it('allows registering different section IDs without local ID', () => {
      registry.register(100)
      registry.register(101)
      registry.register(102)
      // Should not throw
      expect(true).toBe(true)
    })
  })

  describe('resolve', () => {
    it('resolves local ID to section ID', () => {
      registry.register(100, 'list')
      expect(registry.resolve('list')).toBe(100)
    })

    it('passes through numeric section IDs unchanged', () => {
      expect(registry.resolve(200)).toBe(200)
    })

    it('throws for unregistered local ID', () => {
      expect(() => registry.resolve('unknown')).toThrow('Widget reference "unknown" not found')
    })

    it('includes helpful error message for unregistered ID', () => {
      expect(() => registry.resolve('myWidget')).toThrow(
        'Ensure the widget with id="myWidget" is defined before being referenced'
      )
    })

    it('resolves multiple local IDs correctly', () => {
      registry.register(100, 'list')
      registry.register(101, 'detail')
      registry.register(102, 'chart')

      expect(registry.resolve('list')).toBe(100)
      expect(registry.resolve('detail')).toBe(101)
      expect(registry.resolve('chart')).toBe(102)
    })
  })
})
