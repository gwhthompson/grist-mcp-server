/**
 * Unit tests for widget-resolver service
 *
 * Tests name resolution and query construction for:
 * - Page name → ViewId resolution
 * - Column name → ColRef resolution
 * - Widget name → SectionId resolution
 * - getAllPages helper
 *
 * Note: These are unit tests that verify SQL query construction and response parsing.
 * Integration tests verify actual API calls with Docker.
 */

import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../../src/errors/ValidationError.js'
import type { GristClient } from '../../src/services/grist-client.js'
import {
  getAllPages,
  getAllWidgetsOnPage,
  resolveColumnNameToColRef,
  resolvePageNameToViewId,
  resolveWidgetNameToSectionId
} from '../../src/services/widget-resolver.js'

// Mock GristClient for unit testing
function createMockClient(mockResponse: unknown): GristClient {
  return {
    post: vi.fn().mockResolvedValue(mockResponse)
  } as unknown as GristClient
}

describe('resolvePageNameToViewId', () => {
  describe('name-based resolution', () => {
    it('should return viewId when page name matches exactly', async () => {
      const mockClient = createMockClient({
        records: [
          { id: 42, name: 'Sales Dashboard' },
          { id: 43, name: 'Analytics' }
        ]
      })

      const result = await resolvePageNameToViewId(mockClient, 'a'.repeat(22), 'Sales Dashboard')

      expect(result).toBe(42)
      expect(mockClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/sql'),
        expect.objectContaining({
          sql: expect.stringContaining('SELECT id, name FROM _grist_Views')
        })
      )
    })

    it('should query with exact page name', async () => {
      const mockClient = createMockClient({
        records: [{ id: 10, name: 'Dashboard' }]
      })

      const result = await resolvePageNameToViewId(mockClient, 'a'.repeat(22), 'Dashboard')

      expect(result).toBe(10)
      expect(mockClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/sql'),
        expect.objectContaining({
          args: ['Dashboard'] // Exact name used in query
        })
      )
    })

    it('should throw ValidationError when page name not found', async () => {
      // First call returns empty (page not found)
      // Second call returns all pages for error message
      let callCount = 0
      const mockClient = {
        post: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve({ records: [] }) // Page not found
          } else {
            return Promise.resolve({
              records: [
                { id: 1, name: 'Page A' },
                { id: 2, name: 'Page B' }
              ]
            })
          }
        })
      } as unknown as GristClient

      await expect(resolvePageNameToViewId(mockClient, 'a'.repeat(22), 'Page C')).rejects.toThrow(
        /not found/
      )
    })

    it('should provide list of available pages in error', async () => {
      // First call returns empty (page not found)
      // Second call returns all pages for error message
      let callCount = 0
      const mockClient = {
        post: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve({ records: [] })
          } else {
            return Promise.resolve({
              records: [
                { id: 1, name: 'Dashboard' },
                { id: 2, name: 'Reports' },
                { id: 3, name: 'Settings' }
              ]
            })
          }
        })
      } as unknown as GristClient

      try {
        await resolvePageNameToViewId(mockClient, 'a'.repeat(22), 'NonExistent')
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        if (error instanceof ValidationError) {
          expect(error.message).toContain('Dashboard')
          expect(error.message).toContain('Reports')
          expect(error.message).toContain('Settings')
        }
      }
    })

    it('should handle Unicode page names', async () => {
      const mockClient = createMockClient({
        records: [{ id: 100, name: '销售仪表板' }]
      })

      const result = await resolvePageNameToViewId(mockClient, 'a'.repeat(22), '销售仪表板')

      expect(result).toBe(100)
    })

    it('should handle page names with special characters', async () => {
      const mockClient = createMockClient({
        records: [{ id: 50, name: 'Q1/Q2 Report (2024)' }]
      })

      const result = await resolvePageNameToViewId(
        mockClient,
        'a'.repeat(22),
        'Q1/Q2 Report (2024)'
      )

      expect(result).toBe(50)
    })
  })

  describe('numeric ID passthrough', () => {
    it('should return numeric input as-is without API call', async () => {
      const mockClient = createMockClient({})

      const result = await resolvePageNameToViewId(mockClient, 'a'.repeat(22), 42)

      expect(result).toBe(42)
      expect(mockClient.post).not.toHaveBeenCalled()
    })

    it('should handle zero as valid view ID', async () => {
      const mockClient = createMockClient({})

      const result = await resolvePageNameToViewId(mockClient, 'a'.repeat(22), 0)

      expect(result).toBe(0)
      expect(mockClient.post).not.toHaveBeenCalled()
    })

    it('should handle large view IDs', async () => {
      const mockClient = createMockClient({})

      const result = await resolvePageNameToViewId(mockClient, 'a'.repeat(22), 999999)

      expect(result).toBe(999999)
    })
  })

  describe('edge cases', () => {
    it('should handle empty pages list', async () => {
      // First call returns empty (no pages)
      // Second call also returns empty for error message
      const mockClient = {
        post: vi.fn().mockResolvedValue({ records: [] })
      } as unknown as GristClient

      await expect(resolvePageNameToViewId(mockClient, 'a'.repeat(22), 'Any Page')).rejects.toThrow(
        ValidationError
      )
    })

    it('should match exact page names including whitespace', async () => {
      const mockClient = createMockClient({
        records: [{ id: 1, name: '  Spaces  ' }]
      })

      const result = await resolvePageNameToViewId(mockClient, 'a'.repeat(22), '  Spaces  ')
      expect(result).toBe(1)
    })
  })
})

describe('resolveColumnNameToColRef', () => {
  describe('name-based resolution', () => {
    it('should return colRef when column name matches', async () => {
      const mockClient = createMockClient({
        records: [{ colId: 'Email', colRef: 6 }]
      })

      const result = await resolveColumnNameToColRef(mockClient, 'a'.repeat(22), 'Orders', 'Email')

      expect(result).toBe(6)
      expect(mockClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/sql'),
        expect.objectContaining({
          sql: expect.stringContaining('_grist_Tables_column'),
          args: ['Orders', 'Email']
        })
      )
    })

    it('should throw ValidationError when column not found', async () => {
      // First call returns empty (column not found)
      // Second call returns all columns for error message
      let callCount = 0
      const mockClient = {
        post: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve({ records: [] })
          } else {
            return Promise.resolve({
              records: [{ colId: 'Name' }, { colId: 'Age' }]
            })
          }
        })
      } as unknown as GristClient

      await expect(
        resolveColumnNameToColRef(mockClient, 'a'.repeat(22), 'People', 'Email')
      ).rejects.toThrow(ValidationError)
    })

    it('should provide list of available columns in error', async () => {
      // First call returns empty (column not found)
      // Second call returns all columns for error message
      let callCount = 0
      const mockClient = {
        post: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve({ records: [] })
          } else {
            return Promise.resolve({
              records: [{ colId: 'Name' }, { colId: 'Email' }, { colId: 'Phone' }]
            })
          }
        })
      } as unknown as GristClient

      try {
        await resolveColumnNameToColRef(mockClient, 'a'.repeat(22), 'Contacts', 'Address')
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        if (error instanceof ValidationError) {
          expect(error.message).toContain('Name')
          expect(error.message).toContain('Email')
          expect(error.message).toContain('Phone')
        }
      }
    })
  })

  describe('numeric ID passthrough', () => {
    it('should return numeric input as-is without API call', async () => {
      const mockClient = createMockClient({})

      const result = await resolveColumnNameToColRef(mockClient, 'a'.repeat(22), 'Orders', 15)

      expect(result).toBe(15)
      expect(mockClient.post).not.toHaveBeenCalled()
    })
  })

  describe('SQL query construction', () => {
    it('should use parameterized query with table and column name', async () => {
      const mockClient = createMockClient({
        records: [{ colId: 'Total', colRef: 99 }]
      })

      await resolveColumnNameToColRef(mockClient, 'a'.repeat(22), 'Sales', 'Total')

      expect(mockClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          args: ['Sales', 'Total'] // Both table and column name
        })
      )
    })
  })

  describe('undefined tableId validation', () => {
    it('should reject undefined tableId', async () => {
      const mockClient = createMockClient({})

      await expect(
        resolveColumnNameToColRef(
          mockClient,
          'a'.repeat(22),
          undefined as unknown as string,
          'Email'
        )
      ).rejects.toThrow(ValidationError)

      await expect(
        resolveColumnNameToColRef(
          mockClient,
          'a'.repeat(22),
          undefined as unknown as string,
          'Email'
        )
      ).rejects.toThrow(/Cannot resolve column reference.*undefined/)
    })

    it('should reject null tableId', async () => {
      const mockClient = createMockClient({})

      await expect(
        resolveColumnNameToColRef(mockClient, 'a'.repeat(22), null as unknown as string, 'Email')
      ).rejects.toThrow(ValidationError)

      await expect(
        resolveColumnNameToColRef(mockClient, 'a'.repeat(22), null as unknown as string, 'Email')
      ).rejects.toThrow(/Cannot resolve column reference/)
    })

    it('should reject empty tableId', async () => {
      const mockClient = createMockClient({})

      await expect(
        resolveColumnNameToColRef(mockClient, 'a'.repeat(22), '', 'Email')
      ).rejects.toThrow(ValidationError)

      await expect(
        resolveColumnNameToColRef(mockClient, 'a'.repeat(22), '', 'Email')
      ).rejects.toThrow(/Cannot resolve column reference/)
    })

    it('should reject string "undefined" tableId', async () => {
      const mockClient = createMockClient({})

      await expect(
        resolveColumnNameToColRef(mockClient, 'a'.repeat(22), 'undefined', 'Email')
      ).rejects.toThrow(ValidationError)

      await expect(
        resolveColumnNameToColRef(mockClient, 'a'.repeat(22), 'undefined', 'Email')
      ).rejects.toThrow(/Cannot resolve column reference.*"undefined"/)
    })

    it('should reject string "null" tableId', async () => {
      const mockClient = createMockClient({})

      await expect(
        resolveColumnNameToColRef(mockClient, 'a'.repeat(22), 'null', 'Email')
      ).rejects.toThrow(ValidationError)

      await expect(
        resolveColumnNameToColRef(mockClient, 'a'.repeat(22), 'null', 'Email')
      ).rejects.toThrow(/Cannot resolve column reference.*"null"/)
    })

    it('should provide helpful error message explaining deleted table scenario', async () => {
      const mockClient = createMockClient({})

      try {
        await resolveColumnNameToColRef(
          mockClient,
          'a'.repeat(22),
          undefined as unknown as string,
          'Email'
        )
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        if (error instanceof ValidationError) {
          expect(error.message).toContain('widget references a table that has been deleted')
          expect(error.message).toContain('grist_query_sql')
        }
      }
    })
  })
})

describe('resolveWidgetNameToSectionId', () => {
  describe('name-based resolution', () => {
    it('should return sectionId when widget title matches', async () => {
      const mockClient = createMockClient({
        records: [{ id: 100, title: 'Sales Table', parentId: 42, tableRef: 1, parentKey: 'record' }]
      })

      const result = await resolveWidgetNameToSectionId(
        mockClient,
        'a'.repeat(22),
        42,
        'Sales Table'
      )

      expect(result).toBe(100)
      expect(mockClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/sql'),
        expect.objectContaining({
          args: [42, 'Sales Table'] // viewId and widgetName
        })
      )
    })

    it('should throw ValidationError when widget not found on page', async () => {
      // First call returns empty (widget not found)
      // Second call returns all widgets for error message
      let callCount = 0
      const mockClient = {
        post: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve({ records: [] })
          } else {
            return Promise.resolve({
              records: [{ id: 100, title: 'Widget A' }]
            })
          }
        })
      } as unknown as GristClient

      await expect(
        resolveWidgetNameToSectionId(mockClient, 'a'.repeat(22), 42, 'Widget B')
      ).rejects.toThrow(ValidationError)
    })

    it('should provide list of available widgets in error', async () => {
      // First call returns empty (widget not found)
      // Second call returns all widgets for error message
      let callCount = 0
      const mockClient = {
        post: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve({ records: [] })
          } else {
            return Promise.resolve({
              records: [
                { id: 100, title: 'Chart 1' },
                { id: 101, title: 'Table 1' },
                { id: 102, title: 'Form 1' }
              ]
            })
          }
        })
      } as unknown as GristClient

      try {
        await resolveWidgetNameToSectionId(mockClient, 'a'.repeat(22), 42, 'Nonexistent')
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        if (error instanceof ValidationError) {
          expect(error.message).toContain('Chart 1')
          expect(error.message).toContain('Table 1')
          expect(error.message).toContain('Form 1')
        }
      }
    })

    it('should handle widgets with empty titles (Bug 2 regression test)', async () => {
      // First call returns empty (widget not found)
      // Second call returns widgets with empty titles
      let callCount = 0
      const mockClient = {
        post: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve({ records: [] })
          } else {
            return Promise.resolve({
              records: [
                { id: 13, fields: { id: 13, title: '', parentKey: 'detail' } },
                { id: 14, fields: { id: 14, title: '', parentKey: 'record' } }
              ]
            })
          }
        })
      } as unknown as GristClient

      try {
        await resolveWidgetNameToSectionId(mockClient, 'a'.repeat(22), 42, 'Nonexistent')
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        if (error instanceof ValidationError) {
          // Error message should show "Untitled Widget (section_id: N)" instead of "" (undefined)
          expect(error.message).toContain('Untitled Widget (section_id: 13)')
          expect(error.message).toContain('Untitled Widget (section_id: 14)')
          expect(error.message).toContain('detail')
          expect(error.message).toContain('record')
          // Should NOT contain empty quotes or "undefined"
          expect(error.message).not.toContain('""')
          expect(error.message).not.toContain('undefined')
        }
      }
    })
  })

  describe('numeric ID passthrough', () => {
    it('should return numeric input as-is without API call', async () => {
      const mockClient = createMockClient({})

      const result = await resolveWidgetNameToSectionId(mockClient, 'a'.repeat(22), 42, 123)

      expect(result).toBe(123)
      expect(mockClient.post).not.toHaveBeenCalled()
    })
  })
})

describe('getAllPages', () => {
  it('should return array of page objects', async () => {
    const mockClient = createMockClient({
      records: [
        { id: 1, name: 'Dashboard' },
        { id: 2, name: 'Reports' },
        { id: 3, name: 'Settings' }
      ]
    })

    const pages = await getAllPages(mockClient, 'a'.repeat(22))

    expect(pages).toHaveLength(3)
    expect(pages[0]).toEqual({ id: 1, name: 'Dashboard' })
    expect(pages[1]).toEqual({ id: 2, name: 'Reports' })
    expect(pages[2]).toEqual({ id: 3, name: 'Settings' })
  })

  it('should handle empty pages list', async () => {
    const mockClient = createMockClient({
      records: []
    })

    const pages = await getAllPages(mockClient, 'a'.repeat(22))

    expect(pages).toHaveLength(0)
    expect(Array.isArray(pages)).toBe(true)
  })

  it('should preserve page order from database', async () => {
    const mockClient = createMockClient({
      records: [
        { id: 3, name: 'C' },
        { id: 1, name: 'A' },
        { id: 2, name: 'B' }
      ]
    })

    const pages = await getAllPages(mockClient, 'a'.repeat(22))

    expect(pages[0].id).toBe(3)
    expect(pages[1].id).toBe(1)
    expect(pages[2].id).toBe(2)
  })

  it('should query _grist_Views table', async () => {
    const mockClient = createMockClient({
      records: []
    })

    await getAllPages(mockClient, 'a'.repeat(22))

    expect(mockClient.post).toHaveBeenCalledWith(
      expect.stringContaining('/sql'),
      expect.objectContaining({
        sql: expect.stringContaining('_grist_Views')
      })
    )
  })
})

describe('getAllWidgetsOnPage', () => {
  it('should return widgets with valid data', async () => {
    const mockClient = createMockClient({
      records: [
        { id: 1, parentId: 5, tableRef: 10, title: 'Sales Widget', parentKey: 'record' },
        { id: 2, parentId: 5, tableRef: 11, title: 'Chart Widget', parentKey: 'chart' }
      ]
    })

    const widgets = await getAllWidgetsOnPage(mockClient, 'a'.repeat(22), 5)

    expect(widgets).toHaveLength(2)
    expect(widgets[0]).toEqual({
      id: 1,
      parentId: 5,
      tableRef: 10,
      title: 'Sales Widget',
      parentKey: 'record'
    })
  })

  it('should handle widgets with null titles (Bug #1 regression test)', async () => {
    // Grist widgets frequently have null titles (the default state when created)
    const mockClient = createMockClient({
      records: [
        { id: 1, parentId: 5, tableRef: 10, title: null, parentKey: 'record' },
        { id: 2, parentId: 5, tableRef: 11, title: 'Named Widget', parentKey: 'chart' }
      ]
    })

    // Should NOT throw - should return empty string for null title
    const widgets = await getAllWidgetsOnPage(mockClient, 'a'.repeat(22), 5)

    expect(widgets).toHaveLength(2)
    expect(widgets[0].title).toBe('') // null converted to empty string
    expect(widgets[1].title).toBe('Named Widget')
  })

  it('should handle widgets with undefined titles', async () => {
    // Response where title field is missing entirely
    const mockClient = createMockClient({
      records: [{ id: 1, parentId: 5, tableRef: 10, parentKey: 'record' }] // no title field
    })

    // Should NOT throw - should return empty string for missing title
    const widgets = await getAllWidgetsOnPage(mockClient, 'a'.repeat(22), 5)

    expect(widgets).toHaveLength(1)
    expect(widgets[0].title).toBe('') // undefined converted to empty string
  })

  it('should handle empty widget list', async () => {
    const mockClient = createMockClient({
      records: []
    })

    const widgets = await getAllWidgetsOnPage(mockClient, 'a'.repeat(22), 5)

    expect(widgets).toHaveLength(0)
  })
})

describe('Error Message Quality', () => {
  it('resolvePageNameToViewId should provide actionable error', async () => {
    const mockClient = createMockClient({
      records: [{ id: 1, name: 'Page1' }]
    })

    try {
      await resolvePageNameToViewId(mockClient, 'a'.repeat(22), 'WrongName')
      expect.fail('Should throw')
    } catch (error) {
      if (error instanceof ValidationError) {
        expect(error.message).toContain('not found')
        expect(error.message).toContain('Available pages')
        expect(error.message).toContain('Page1')
      }
    }
  })

  it('resolveColumnNameToColRef should include table name in error', async () => {
    // First call returns empty, second returns empty (no columns)
    const mockClient = {
      post: vi.fn().mockResolvedValue({ records: [] })
    } as unknown as GristClient

    try {
      await resolveColumnNameToColRef(mockClient, 'a'.repeat(22), 'Table1', 'Col1')
      expect.fail('Should throw')
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      if (error instanceof ValidationError) {
        expect(error.message).toContain('not found')
        expect(error.message).toContain('Table1')
        expect(error.message).toContain('Available columns')
      }
    }
  })

  it('resolveWidgetNameToSectionId should suggest checking page ID', async () => {
    const mockClient = createMockClient({
      records: []
    })

    try {
      await resolveWidgetNameToSectionId(mockClient, 'a'.repeat(22), 99, 'WidgetName')
      expect.fail('Should throw')
    } catch (error) {
      if (error instanceof ValidationError) {
        expect(error.message).toContain('not found')
        expect(error.message).toContain('viewId=99')
      }
    }
  })
})
