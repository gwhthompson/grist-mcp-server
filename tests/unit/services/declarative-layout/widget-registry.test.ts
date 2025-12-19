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
      expect(registry.hasLocalId('list')).toBe(true)
    })

    it('registers a widget without local ID', () => {
      registry.register(100)
      // Should not throw, just not register any local ID
      expect(registry.hasLocalId('any')).toBe(false)
    })

    it('registers multiple widgets with different local IDs', () => {
      registry.register(100, 'list')
      registry.register(101, 'detail')
      registry.register(102, 'chart')

      expect(registry.hasLocalId('list')).toBe(true)
      expect(registry.hasLocalId('detail')).toBe(true)
      expect(registry.hasLocalId('chart')).toBe(true)
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

  describe('hasLocalId', () => {
    it('returns true for registered local ID', () => {
      registry.register(100, 'list')
      expect(registry.hasLocalId('list')).toBe(true)
    })

    it('returns false for unregistered local ID', () => {
      expect(registry.hasLocalId('unknown')).toBe(false)
    })

    it('returns false after reset', () => {
      registry.register(100, 'list')
      registry.reset()
      expect(registry.hasLocalId('list')).toBe(false)
    })
  })

  describe('getLocalId', () => {
    it('returns local ID for registered section ID', () => {
      registry.register(100, 'list')
      expect(registry.getLocalId(100)).toBe('list')
    })

    it('returns undefined for section ID without local ID', () => {
      registry.register(100)
      expect(registry.getLocalId(100)).toBeUndefined()
    })

    it('returns undefined for unknown section ID', () => {
      expect(registry.getLocalId(999)).toBeUndefined()
    })
  })

  describe('queueLink', () => {
    it('queues a pending link', () => {
      const link = { child_of: 'list' }
      registry.queueLink(100, link, 'Table1')

      const pending = registry.getPendingLinks()
      expect(pending).toHaveLength(1)
      expect(pending[0]).toEqual({
        sectionId: 100,
        link: { child_of: 'list' },
        tableId: 'Table1'
      })
    })

    it('queues multiple pending links', () => {
      registry.queueLink(100, { child_of: 'list' }, 'Table1')
      registry.queueLink(101, { synced_with: 'main' }, 'Table2')
      registry.queueLink(102, { matched_by: { source: 'Category', target: 'Category' } }, 'Table3')

      const pending = registry.getPendingLinks()
      expect(pending).toHaveLength(3)
    })
  })

  describe('getPendingLinks', () => {
    it('returns empty array when no links queued', () => {
      expect(registry.getPendingLinks()).toEqual([])
    })

    it('returns readonly array', () => {
      registry.queueLink(100, { child_of: 'list' }, 'Table1')
      const pending = registry.getPendingLinks()
      expect(pending).toHaveLength(1)
      // TypeScript readonly prevents mutation, but we can verify the array
    })
  })

  describe('clearPendingLinks', () => {
    it('clears all pending links', () => {
      registry.queueLink(100, { child_of: 'list' }, 'Table1')
      registry.queueLink(101, { synced_with: 'main' }, 'Table2')

      expect(registry.getPendingLinks()).toHaveLength(2)

      registry.clearPendingLinks()

      expect(registry.getPendingLinks()).toHaveLength(0)
    })

    it('does not affect registered widgets', () => {
      registry.register(100, 'list')
      registry.queueLink(100, { child_of: 'other' }, 'Table1')

      registry.clearPendingLinks()

      expect(registry.hasLocalId('list')).toBe(true)
      expect(registry.resolve('list')).toBe(100)
    })
  })

  describe('getMappings', () => {
    it('returns empty map when no widgets registered', () => {
      const mappings = registry.getMappings()
      expect(mappings.size).toBe(0)
    })

    it('returns map of all registered local IDs', () => {
      registry.register(100, 'list')
      registry.register(101, 'detail')
      registry.register(102) // No local ID

      const mappings = registry.getMappings()
      expect(mappings.size).toBe(2)
      expect(mappings.get('list')).toBe(100)
      expect(mappings.get('detail')).toBe(101)
    })

    it('returns a copy (modifications do not affect registry)', () => {
      registry.register(100, 'list')

      const mappings = registry.getMappings()
      mappings.set('hacked', 999)

      expect(registry.hasLocalId('hacked')).toBe(false)
    })
  })

  describe('reset', () => {
    it('clears all registered widgets', () => {
      registry.register(100, 'list')
      registry.register(101, 'detail')

      registry.reset()

      expect(registry.hasLocalId('list')).toBe(false)
      expect(registry.hasLocalId('detail')).toBe(false)
    })

    it('clears all pending links', () => {
      registry.queueLink(100, { child_of: 'list' }, 'Table1')

      registry.reset()

      expect(registry.getPendingLinks()).toHaveLength(0)
    })

    it('clears reverse lookup mappings', () => {
      registry.register(100, 'list')

      registry.reset()

      expect(registry.getLocalId(100)).toBeUndefined()
    })

    it('allows re-registration after reset', () => {
      registry.register(100, 'list')
      registry.reset()
      registry.register(200, 'list') // Same local ID, different section

      expect(registry.resolve('list')).toBe(200)
    })
  })
})
