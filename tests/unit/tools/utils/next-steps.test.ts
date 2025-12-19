import { describe, expect, it } from 'vitest'
import { NextStepsBuilder, nextSteps } from '../../../../src/tools/utils/next-steps.js'

describe('NextStepsBuilder', () => {
  describe('addPaginationHint', () => {
    it('adds hint when hasMore is true', () => {
      const builder = new NextStepsBuilder()
      builder.addPaginationHint({ total: 100, offset: 0, limit: 10, hasMore: true, nextOffset: 10 })
      expect(builder.build()).toEqual(['Use offset=10 to get more items'])
    })

    it('uses custom resource name', () => {
      const builder = new NextStepsBuilder()
      builder.addPaginationHint(
        { total: 100, offset: 0, limit: 10, hasMore: true, nextOffset: 10 },
        'workspaces'
      )
      expect(builder.build()).toEqual(['Use offset=10 to get more workspaces'])
    })

    it('does not add hint when hasMore is false', () => {
      const builder = new NextStepsBuilder()
      builder.addPaginationHint({
        total: 10,
        offset: 0,
        limit: 10,
        hasMore: false,
        nextOffset: null
      })
      expect(builder.build()).toBeUndefined()
    })
  })

  describe('addRelatedTool', () => {
    it('adds tool without context', () => {
      const builder = new NextStepsBuilder()
      builder.addRelatedTool('grist_get_tables')
      expect(builder.build()).toEqual(['Use grist_get_tables'])
    })

    it('adds tool with context', () => {
      const builder = new NextStepsBuilder()
      builder.addRelatedTool('grist_get_documents', { workspaceId: 123 })
      expect(builder.build()).toEqual(['Use grist_get_documents with workspaceId=123'])
    })

    it('adds tool with multiple context params', () => {
      const builder = new NextStepsBuilder()
      builder.addRelatedTool('grist_get_records', { docId: 'abc', tableId: 'Users' })
      expect(builder.build()).toEqual(['Use grist_get_records with docId=abc, tableId=Users'])
    })

    it('filters out undefined context values', () => {
      const builder = new NextStepsBuilder()
      builder.addRelatedTool('grist_get_records', { docId: 'abc', tableId: undefined })
      expect(builder.build()).toEqual(['Use grist_get_records with docId=abc'])
    })

    it('falls back to no params if all context values undefined', () => {
      const builder = new NextStepsBuilder()
      builder.addRelatedTool('grist_get_tables', { docId: undefined })
      expect(builder.build()).toEqual(['Use grist_get_tables'])
    })
  })

  describe('addVerifyHint', () => {
    it('adds verify hint without context', () => {
      const builder = new NextStepsBuilder()
      builder.addVerifyHint('grist_get_records')
      expect(builder.build()).toEqual(['Verify with grist_get_records'])
    })

    it('adds verify hint with context', () => {
      const builder = new NextStepsBuilder()
      builder.addVerifyHint('grist_get_records', { tableId: 'Users' })
      expect(builder.build()).toEqual(['Verify with grist_get_records using tableId=Users'])
    })
  })

  describe('add', () => {
    it('adds custom hint', () => {
      const builder = new NextStepsBuilder()
      builder.add('Check the documentation for more info')
      expect(builder.build()).toEqual(['Check the documentation for more info'])
    })
  })

  describe('addIf', () => {
    it('adds hint when condition is true', () => {
      const builder = new NextStepsBuilder()
      builder.addIf(true, 'This should appear')
      expect(builder.build()).toEqual(['This should appear'])
    })

    it('does not add hint when condition is false', () => {
      const builder = new NextStepsBuilder()
      builder.addIf(false, 'This should not appear')
      expect(builder.build()).toBeUndefined()
    })
  })

  describe('addIfFn', () => {
    it('calls factory only when condition is true', () => {
      let called = false
      const builder = new NextStepsBuilder()
      builder.addIfFn(true, () => {
        called = true
        return 'Dynamic hint'
      })
      expect(called).toBe(true)
      expect(builder.build()).toEqual(['Dynamic hint'])
    })

    it('does not call factory when condition is false', () => {
      let called = false
      const builder = new NextStepsBuilder()
      builder.addIfFn(false, () => {
        called = true
        return 'Dynamic hint'
      })
      expect(called).toBe(false)
      expect(builder.build()).toBeUndefined()
    })
  })

  describe('build', () => {
    it('returns undefined when no hints', () => {
      const builder = new NextStepsBuilder()
      expect(builder.build()).toBeUndefined()
    })

    it('returns array with all hints', () => {
      const builder = new NextStepsBuilder()
      builder.add('First')
      builder.add('Second')
      builder.add('Third')
      expect(builder.build()).toEqual(['First', 'Second', 'Third'])
    })

    it('returns a copy of the array', () => {
      const builder = new NextStepsBuilder()
      builder.add('Test')
      const result1 = builder.build()
      const result2 = builder.build()
      expect(result1).toEqual(result2)
      expect(result1).not.toBe(result2)
    })
  })

  describe('fluent chaining', () => {
    it('supports method chaining', () => {
      const result = new NextStepsBuilder()
        .addPaginationHint({ total: 100, offset: 0, limit: 10, hasMore: true, nextOffset: 10 })
        .addRelatedTool('grist_get_tables', { docId: 'abc' })
        .addIf(true, 'Custom hint')
        .build()

      expect(result).toEqual([
        'Use offset=10 to get more items',
        'Use grist_get_tables with docId=abc',
        'Custom hint'
      ])
    })
  })

  describe('nextSteps factory', () => {
    it('creates a new builder', () => {
      const builder = nextSteps()
      expect(builder).toBeInstanceOf(NextStepsBuilder)
    })

    it('supports fluent usage', () => {
      const result = nextSteps().add('Test hint').build()
      expect(result).toEqual(['Test hint'])
    })
  })
})
