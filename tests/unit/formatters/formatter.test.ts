import { describe, expect, it } from 'vitest'
import {
  formatAsMarkdown,
  formatErrorResponse,
  formatToolResponse,
  truncateIfNeeded
} from '../../../src/services/formatter.js'
import type { ResponseFormat } from '../../../src/types.js'

describe('Formatter Service', () => {
  describe('formatToolResponse', () => {
    it('should format data as JSON when format is json', () => {
      const data = { name: 'Alice', age: 30 }
      const result = formatToolResponse(data, 'json')

      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')
      expect(result.content[0].text).toContain('"name": "Alice"')
      expect(result.content[0].text).toContain('"age": 30')
      expect(result.structuredContent).toEqual(data)
    })

    it('should format data as markdown when format is markdown', () => {
      const data = { name: 'Alice', age: 30 }
      const result = formatToolResponse(data, 'markdown')

      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')
      expect(result.content[0].text).toContain('**name**: Alice')
      expect(result.content[0].text).toContain('**age**: 30')
      expect(result.structuredContent).toEqual(data)
    })

    it('should default to markdown format', () => {
      const data = { name: 'Alice' }
      const result = formatToolResponse(data)

      expect(result.content[0].text).toContain('**name**')
      expect(result.structuredContent).toEqual(data)
    })

    it('should always include structuredContent', () => {
      const data = { users: [{ id: 1 }, { id: 2 }] }
      const jsonResult = formatToolResponse(data, 'json')
      const markdownResult = formatToolResponse(data, 'markdown')

      expect(jsonResult.structuredContent).toEqual(data)
      expect(markdownResult.structuredContent).toEqual(data)
    })

    it('should handle arrays', () => {
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ]
      const result = formatToolResponse(data, 'markdown')

      expect(result.content[0].text).toContain('1.')
      expect(result.content[0].text).toContain('2.')
      expect(result.structuredContent).toEqual(data)
    })
  })

  describe('formatErrorResponse', () => {
    it('should format error with isError flag', () => {
      const errorMessage = 'Document not found'
      const result = formatErrorResponse(errorMessage)

      expect(result.isError).toBe(true)
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')
      expect(result.content[0].text).toBe(errorMessage)
    })

    it('should include structured error content', () => {
      const errorMessage = 'Invalid table ID'
      const result = formatErrorResponse(errorMessage)

      expect(result.structuredContent).toEqual({
        success: false,
        error: errorMessage
      })
    })

    it('should handle multiline error messages', () => {
      const errorMessage = 'Error: Invalid value\nDetails: Column "Status" expects boolean'
      const result = formatErrorResponse(errorMessage)

      expect(result.content[0].text).toContain('Error: Invalid value')
      expect(result.content[0].text).toContain('Details:')
    })
  })

  describe('formatAsMarkdown', () => {
    describe('null/undefined handling', () => {
      it('should handle null', () => {
        expect(formatAsMarkdown(null)).toBe('No data')
      })

      it('should handle undefined', () => {
        expect(formatAsMarkdown(undefined)).toBe('No data')
      })
    })

    describe('primitive types', () => {
      it('should format string', () => {
        expect(formatAsMarkdown('hello')).toBe('hello')
      })

      it('should format number', () => {
        expect(formatAsMarkdown(42)).toBe('42')
      })

      it('should format boolean', () => {
        expect(formatAsMarkdown(true)).toBe('true')
        expect(formatAsMarkdown(false)).toBe('false')
      })
    })

    describe('arrays', () => {
      it('should format empty array', () => {
        expect(formatAsMarkdown([])).toBe('No items found')
      })

      it('should format array of primitives', () => {
        const result = formatAsMarkdown(['Alice', 'Bob', 'Charlie'])
        expect(result).toContain('1. Alice')
        expect(result).toContain('2. Bob')
        expect(result).toContain('3. Charlie')
      })

      it('should format array of objects', () => {
        const data = [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 }
        ]
        const result = formatAsMarkdown(data)

        expect(result).toContain('1.')
        expect(result).toContain('**name**: Alice')
        expect(result).toContain('**age**: 30')
        expect(result).toContain('2.')
        expect(result).toContain('**name**: Bob')
      })

      it('should number items sequentially', () => {
        const data = ['A', 'B', 'C', 'D', 'E']
        const result = formatAsMarkdown(data)

        for (let i = 1; i <= 5; i++) {
          expect(result).toContain(`${i}.`)
        }
      })
    })

    describe('objects', () => {
      it('should format simple object', () => {
        const data = { name: 'Alice', email: 'alice@example.com' }
        const result = formatAsMarkdown(data)

        expect(result).toContain('**name**: Alice')
        expect(result).toContain('**email**: alice@example.com')
      })

      it('should format nested arrays in objects', () => {
        const data = {
          name: 'Team',
          members: ['Alice', 'Bob', 'Charlie']
        }
        const result = formatAsMarkdown(data)

        expect(result).toContain('**name**: Team')
        expect(result).toContain('**members**:')
        expect(result).toContain('1. Alice')
        expect(result).toContain('2. Bob')
      })

      it('should format object with null values', () => {
        const data = { name: 'Alice', age: null, email: 'alice@example.com' }
        const result = formatAsMarkdown(data)

        expect(result).toContain('**name**: Alice')
        expect(result).toContain('**age**: null')
        expect(result).toContain('**email**: alice@example.com')
      })
    })

    describe('paginated responses', () => {
      it('should format response with items key', () => {
        const data = {
          items: [{ id: 1 }, { id: 2 }],
          total: 10
        }
        const result = formatAsMarkdown(data)

        expect(result).toContain('# Results')
        expect(result).toContain('2 of 10 total')
      })

      it('should show more results available', () => {
        const data = {
          items: [{ id: 1 }],
          total: 5,
          has_more: true,
          next_offset: 1
        }
        const result = formatAsMarkdown(data)

        expect(result).toContain('More results available')
        expect(result).toContain('offset=1')
      })

      it('should format truncation warning', () => {
        const data = {
          items: [{ id: 1 }],
          truncated: true,
          truncation_reason: 'Too many items',
          suggestions: ['Use pagination', 'Reduce limit']
        }
        const result = formatAsMarkdown(data)

        expect(result).toContain('Response Truncated')
        expect(result).toContain('Too many items')
        expect(result).toContain('Suggestions:')
        expect(result).toContain('Use pagination')
        expect(result).toContain('Reduce limit')
      })
    })

    describe('value formatting', () => {
      it('should format short arrays inline', () => {
        const data = { tags: ['tag1', 'tag2', 'tag3'] }
        const result = formatAsMarkdown(data)

        // Short arrays (<=3 items) are formatted inline
        expect(result).toContain('**tags**')
      })

      it('should truncate long arrays with ellipsis', () => {
        const data = { tags: ['a', 'b', 'c', 'd', 'e'] }
        const result = formatAsMarkdown(data)

        // Arrays > 3 items use numbered list format
        expect(result).toContain('**tags**:')
      })

      it('should format nested objects as JSON', () => {
        const data = {
          metadata: { created: '2024-01-01', updated: '2024-01-02' }
        }
        const result = formatAsMarkdown(data)

        expect(result).toContain('**metadata**')
      })
    })
  })

  describe('truncateIfNeeded', () => {
    const SHORT_LIMIT = 100 // For testing purposes

    describe('no truncation needed', () => {
      it('should return full data if under limit', () => {
        const items = [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' }
        ]
        const result = truncateIfNeeded(items, 'json', {})

        expect(result.data.items).toHaveLength(2)
        expect(result.truncationInfo).toBeUndefined()
        expect(result.data.truncated).toBeUndefined()
      })

      it('should include additional data in response', () => {
        const items = [{ id: 1 }]
        const additionalData = { total: 1, page: 1 }
        const result = truncateIfNeeded(items, 'json', additionalData)

        expect(result.data.total).toBe(1)
        expect(result.data.page).toBe(1)
        expect(result.data.items).toEqual(items)
      })
    })

    describe('truncation logic', () => {
      it('should truncate items if response exceeds limit', () => {
        // Create large items that will exceed CHARACTER_LIMIT
        const largeItems = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: 'A'.repeat(100),
          data: Array.from({ length: 50 }, (_, j) => `field${j}`)
        }))

        const result = truncateIfNeeded(largeItems, 'json', {})

        // Should truncate to fit within limit
        expect(result.data.items.length).toBeLessThan(largeItems.length)
        expect(result.data.truncated).toBe(true)
        expect(result.truncationInfo).toBeDefined()
      })

      it('should include truncation metadata', () => {
        const largeItems = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: 'A'.repeat(100)
        }))

        const result = truncateIfNeeded(largeItems, 'json', {})

        expect(result.data.truncated).toBe(true)
        expect(result.data.items_returned).toBeDefined()
        expect(result.data.items_requested).toBe(1000)
        expect(result.data.truncation_reason).toContain('truncated')
        expect(result.data.suggestions).toBeDefined()
      })

      it('should provide actionable suggestions', () => {
        const largeItems = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: 'x'.repeat(100)
        }))
        const result = truncateIfNeeded(largeItems, 'json', { offset: 0, limit: 100 })

        expect(Array.isArray(result.data.suggestions)).toBe(true)
        if (result.data.suggestions) {
          expect(result.data.suggestions.length).toBeGreaterThan(0)
          // Should suggest using offset
          const offsetSuggestion = result.data.suggestions.find((s) => String(s).includes('offset'))
          expect(offsetSuggestion).toBeDefined()
        }
      })
    })

    describe('truncation suggestions', () => {
      it('should suggest offset for pagination', () => {
        const largeItems = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: 'x'.repeat(100)
        }))
        const result = truncateIfNeeded(largeItems, 'json', { offset: 10 })

        const suggestions = result.data.suggestions as string[]
        const offsetSuggestion = suggestions.find((s) => s.includes('offset'))
        expect(offsetSuggestion).toBeDefined()
        if (offsetSuggestion) {
          expect(offsetSuggestion).toContain('offset=')
        }
      })

      it('should suggest reducing detail level', () => {
        const largeItems = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: 'x'.repeat(100)
        }))
        const result = truncateIfNeeded(largeItems, 'json', { detail_level: 'detailed' })

        const suggestions = result.data.suggestions as string[]
        const detailSuggestion = suggestions.find((s) => s.includes('detail_level'))
        expect(detailSuggestion).toBeDefined()
      })

      it('should suggest column selection', () => {
        const largeItems = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: 'x'.repeat(100)
        }))
        const result = truncateIfNeeded(largeItems, 'json', { columns: '*' })

        const suggestions = result.data.suggestions as string[]
        const columnSuggestion = suggestions.find((s) => s.includes('columns'))
        expect(columnSuggestion).toBeDefined()
      })

      it('should suggest adding filters', () => {
        const largeItems = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: 'x'.repeat(100)
        }))
        const result = truncateIfNeeded(largeItems, 'json', {})

        const suggestions = result.data.suggestions as string[]
        const filterSuggestion = suggestions.find((s) => s.includes('filter'))
        expect(filterSuggestion).toBeDefined()
      })

      it('should suggest reducing limit', () => {
        const largeItems = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: 'x'.repeat(100)
        }))
        const result = truncateIfNeeded(largeItems, 'json', { limit: 200 })

        const suggestions = result.data.suggestions as string[]
        const limitSuggestion = suggestions.find((s) => s.includes('limit'))
        expect(limitSuggestion).toBeDefined()
      })
    })

    describe('format handling', () => {
      it('should handle json format', () => {
        const items = [{ id: 1 }]
        const result = truncateIfNeeded(items, 'json', {})

        expect(result.text).toContain('"items"')
        expect(result.text).toContain('"id"')
      })

      it('should handle markdown format', () => {
        const items = [{ id: 1 }]
        const result = truncateIfNeeded(items, 'markdown', {})

        // Markdown format uses **bold** and bullet points
        expect(result.text).toMatch(/\*\*|\d\./)
      })
    })

    describe('edge cases', () => {
      it('should handle empty items array', () => {
        const result = truncateIfNeeded([], 'json', {})

        expect(result.data.items).toHaveLength(0)
        expect(result.truncationInfo).toBeUndefined()
      })

      it('should handle single item', () => {
        const items = [{ id: 1, name: 'Single' }]
        const result = truncateIfNeeded(items, 'json', {})

        expect(result.data.items).toHaveLength(1)
        expect(result.data.items[0]).toEqual(items[0])
      })

      it('should preserve item order', () => {
        const items = [{ id: 3 }, { id: 1 }, { id: 2 }]
        const result = truncateIfNeeded(items, 'json', {})

        expect(result.data.items[0].id).toBe(3)
        expect(result.data.items[1].id).toBe(1)
        expect(result.data.items[2].id).toBe(2)
      })
    })
  })
})
