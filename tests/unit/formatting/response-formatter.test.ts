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
    it.each([
      ['json', '"name": "Alice"', '"age": 30'],
      ['markdown', '**name**: Alice', '**age**: 30']
    ] as const)('should format data as %s with expected patterns', (format, expectedPattern1, expectedPattern2) => {
      const data = { name: 'Alice', age: 30 }
      const result = formatToolResponse(data, format as ResponseFormat)

      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')
      expect(result.content[0].text).toContain(expectedPattern1)
      expect(result.content[0].text).toContain(expectedPattern2)
      expect(result.structuredContent).toEqual(data)
    })

    it('should default to json format', () => {
      const data = { name: 'Alice' }
      const result = formatToolResponse(data)

      expect(result.content[0].text).toContain('"name"')
      expect(result.structuredContent).toEqual(data)
    })

    it('should always include structuredContent for both formats', () => {
      const data = { users: [{ id: 1 }, { id: 2 }] }
      const jsonResult = formatToolResponse(data, 'json')
      const markdownResult = formatToolResponse(data, 'markdown')

      expect(jsonResult.structuredContent).toEqual(data)
      expect(markdownResult.structuredContent).toEqual(data)
    })

    it('should handle arrays with numbered lists', () => {
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
    it('should format error with isError flag but no structuredContent', () => {
      // MCP SDK validates structuredContent against outputSchema if present,
      // even when isError: true. We omit structuredContent to avoid this.
      const errorMessage = 'Document not found'
      const result = formatErrorResponse(errorMessage)

      expect(result).toHaveErrorResponse(/Document not found/)
      expect(result.content).toHaveLength(1)
      expect(result.isError).toBe(true)
      expect(result.structuredContent).toBeUndefined()
    })

    it('should handle multiline error messages', () => {
      const errorMessage = 'Error: Invalid value\nDetails: Column "Status" expects boolean'
      const result = formatErrorResponse(errorMessage)

      expect(result.content[0].text).toContain('Error: Invalid value')
      expect(result.content[0].text).toContain('Details:')
    })
  })

  describe('formatAsMarkdown', () => {
    describe('null/undefined and primitive types', () => {
      it.each([
        [null, 'No data'],
        [undefined, 'No data'],
        ['hello', 'hello'],
        [42, '42'],
        [true, 'true'],
        [false, 'false']
      ])('should format %s as %s', (input, expected) => {
        expect(formatAsMarkdown(input)).toBe(expected)
      })
    })

    describe('arrays', () => {
      it('should format empty array', () => {
        expect(formatAsMarkdown([])).toBe('No items found')
      })

      it('should format array of primitives with numbered list', () => {
        const result = formatAsMarkdown(['Alice', 'Bob', 'Charlie'])
        expect(result).toContain('1. Alice')
        expect(result).toContain('2. Bob')
        expect(result).toContain('3. Charlie')
      })

      it('should format array of objects with numbered items', () => {
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

      it('should number items sequentially for multi-item arrays', () => {
        const data = ['A', 'B', 'C', 'D', 'E']
        const result = formatAsMarkdown(data)

        for (let i = 1; i <= 5; i++) {
          expect(result).toContain(`${i}.`)
        }
      })
    })

    describe('objects', () => {
      it('should format simple object with bold keys', () => {
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
      it('should format response with items key and pagination info', () => {
        const data = {
          items: [{ id: 1 }, { id: 2 }],
          total: 10
        }
        const result = formatAsMarkdown(data)

        expect(result).toContain('# Results')
        expect(result).toContain('2 of 10 total')
      })

      it('should show more results available with offset', () => {
        const data = {
          items: [{ id: 1 }],
          total: 5,
          hasMore: true,
          nextOffset: 1
        }
        const result = formatAsMarkdown(data)

        expect(result).toContain('More results available')
        expect(result).toContain('offset=1')
      })

      it('should format truncation warning with suggestions', () => {
        const data = {
          items: [{ id: 1 }],
          truncated: true,
          truncationReason: 'Too many items',
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

      it('should format long arrays with numbered list', () => {
        const data = { tags: ['a', 'b', 'c', 'd', 'e'] }
        const result = formatAsMarkdown(data)

        // Arrays > 3 items use numbered list format
        expect(result).toContain('**tags**:')
      })

      it('should format nested objects as structured data', () => {
        const data = {
          metadata: { created: '2024-01-01', updated: '2024-01-02' }
        }
        const result = formatAsMarkdown(data)

        expect(result).toContain('**metadata**')
      })
    })
  })

  describe('truncateIfNeeded', () => {
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
      it('should truncate items if response exceeds character limit', () => {
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

      it('should include truncation metadata with actionable info', () => {
        const largeItems = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: 'A'.repeat(100)
        }))

        const result = truncateIfNeeded(largeItems, 'json', {})

        expect(result.data.truncated).toBe(true)
        expect(result.data.itemsReturned).toBeDefined()
        expect(result.data.itemsRequested).toBe(1000)
        expect(result.data.truncationReason).toContain('truncated')
        expect(result.data.suggestions).toBeDefined()
      })
    })

    describe('truncation suggestions', () => {
      it.each([
        ['offset', { offset: 10 }],
        ['detail_level', { detail_level: 'detailed' }],
        ['columns', { columns: '*' }],
        ['limit', { limit: 200 }]
      ])('should suggest %s for pagination optimization', (suggestionType, additionalData) => {
        const largeItems = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: 'x'.repeat(100)
        }))
        const result = truncateIfNeeded(largeItems, 'json', additionalData)

        const suggestions = result.data.suggestions as string[]
        const suggestion = suggestions.find((s) => s.includes(suggestionType))
        expect(suggestion).toBeDefined()
      })

      it('should suggest adding filters when no filters present', () => {
        const largeItems = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: 'x'.repeat(100)
        }))
        const result = truncateIfNeeded(largeItems, 'json', {})

        const suggestions = result.data.suggestions as string[]
        const filterSuggestion = suggestions.find((s) => s.includes('filter'))
        expect(filterSuggestion).toBeDefined()
      })
    })

    describe('format handling', () => {
      it.each([
        ['json', '"items"', '"id"'],
        ['markdown', /\*\*|\d\./, null]
      ] as const)('should handle %s format correctly', (format, expectedPattern1, expectedPattern2) => {
        const items = [{ id: 1 }]
        const result = truncateIfNeeded(items, format as ResponseFormat, {})

        if (expectedPattern2) {
          expect(result.text).toContain(expectedPattern1 as string)
          expect(result.text).toContain(expectedPattern2 as string)
        } else {
          expect(result.text).toMatch(expectedPattern1 as RegExp)
        }
      })
    })

    describe('edge cases', () => {
      it('should handle empty items array', () => {
        const result = truncateIfNeeded([], 'json', {})

        expect(result.data.items).toHaveLength(0)
        expect(result.truncationInfo).toBeUndefined()
      })

      it('should handle single item without truncation', () => {
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
