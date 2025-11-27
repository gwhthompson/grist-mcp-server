/**
 * Unit tests for link-validator service
 *
 * Tests Phase 1 critical validation rules:
 * 1. Same section check
 * 2. Chart widget blocking
 * 3. Attachments column blocking
 * 4. Basic cycle detection (same-table field-level links)
 *
 * Note: These are unit tests with mocked API responses.
 * Integration tests verify actual behavior with Docker.
 */

import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../../src/errors/ValidationError.js'
import type { GristClient } from '../../src/services/grist-client.js'
import { validateWidgetLink } from '../../src/services/link-validator.js'

// Mock GristClient for unit testing
function createMockClient(mockResponses: unknown[]): GristClient {
  const postMock = vi.fn()
  mockResponses.forEach((response) => {
    postMock.mockResolvedValueOnce(response)
  })
  return {
    post: postMock
  } as unknown as GristClient
}

describe('validateWidgetLink', () => {
  const mockDocId = 'a'.repeat(22)

  describe('Rule 1: Same section check', () => {
    it('should reject linking a widget to itself', async () => {
      // No API calls needed for this check
      const mockClient = createMockClient([])

      await expect(validateWidgetLink(mockClient, mockDocId, 5, 5, 0, 0)).rejects.toThrow(
        ValidationError
      )

      await expect(validateWidgetLink(mockClient, mockDocId, 5, 5, 0, 0)).rejects.toThrow(
        /Cannot link a widget to itself/
      )
    })

    it('should accept linking different widgets', async () => {
      // Mock responses for getWidgetInfo calls (source and target)
      const mockClient = createMockClient([
        {
          // Source widget info
          records: [
            {
              sectionId: 5,
              tableId: 'Customers',
              tableRef: 1,
              widgetType: 'record'
            }
          ]
        },
        {
          // Target widget info
          records: [
            {
              sectionId: 6,
              tableId: 'Orders',
              tableRef: 2,
              widgetType: 'detail'
            }
          ]
        },
        // isSummaryTable checks (source and target)
        { records: [{ summarySourceTable: 0 }] },
        { records: [{ summarySourceTable: 0 }] }
      ])

      // Should not throw
      await expect(validateWidgetLink(mockClient, mockDocId, 5, 6, 0, 0)).resolves.not.toThrow()
    })
  })

  describe('Rule 2: Chart widget blocking', () => {
    it('should reject chart widget as link source', async () => {
      const mockClient = createMockClient([
        {
          // Source widget info (chart)
          records: [
            {
              sectionId: 5,
              tableId: 'Sales',
              tableRef: 1,
              widgetType: 'chart'
            }
          ]
        },
        {
          // Target widget info
          records: [
            {
              sectionId: 6,
              tableId: 'Orders',
              tableRef: 2,
              widgetType: 'record'
            }
          ]
        }
      ])

      try {
        await validateWidgetLink(mockClient, mockDocId, 5, 6, 0, 0)
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        if (error instanceof ValidationError) {
          expect(error.message).toContain('Cannot use chart widget as link source')
        }
      }
    })

    it('should accept non-chart widgets as link source', async () => {
      const mockClient = createMockClient([
        {
          // Source widget info (table)
          records: [
            {
              sectionId: 5,
              tableId: 'Customers',
              tableRef: 1,
              widgetType: 'record'
            }
          ]
        },
        {
          // Target widget info
          records: [
            {
              sectionId: 6,
              tableId: 'Orders',
              tableRef: 2,
              widgetType: 'detail'
            }
          ]
        },
        // isSummaryTable checks (source and target)
        { records: [{ summarySourceTable: 0 }] },
        { records: [{ summarySourceTable: 0 }] }
      ])

      // Should not throw
      await expect(validateWidgetLink(mockClient, mockDocId, 5, 6, 0, 0)).resolves.not.toThrow()
    })
  })

  describe('Rule 3: Attachments column blocking', () => {
    it('should reject Attachments column as link target', async () => {
      const mockClient = createMockClient([
        {
          // Source widget info
          records: [
            {
              sectionId: 5,
              tableId: 'Customers',
              tableRef: 1,
              widgetType: 'record'
            }
          ]
        },
        {
          // Target widget info
          records: [
            {
              sectionId: 6,
              tableId: 'Orders',
              tableRef: 2,
              widgetType: 'detail'
            }
          ]
        },
        {
          // Column type query
          records: [{ type: 'Attachments' }]
        }
      ])

      try {
        await validateWidgetLink(mockClient, mockDocId, 5, 6, 0, 10)
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        if (error instanceof ValidationError) {
          expect(error.message).toContain('Cannot link to Attachments column')
        }
      }
    })

    it('should accept non-Attachments columns as link target', async () => {
      const mockClient = createMockClient([
        {
          // Source widget info
          records: [
            {
              sectionId: 5,
              tableId: 'Customers',
              tableRef: 1,
              widgetType: 'record'
            }
          ]
        },
        {
          // Target widget info
          records: [
            {
              sectionId: 6,
              tableId: 'Orders',
              tableRef: 2,
              widgetType: 'detail'
            }
          ]
        },
        {
          // Column type query (Reference column)
          records: [{ type: 'Ref:Customers' }]
        },
        // isSummaryTable checks (source and target)
        { records: [{ summarySourceTable: 0 }] },
        { records: [{ summarySourceTable: 0 }] }
      ])

      // Should not throw
      await expect(validateWidgetLink(mockClient, mockDocId, 5, 6, 0, 10)).resolves.not.toThrow()
    })

    it('should skip Attachments check for cursor-level links (targetColRef = 0)', async () => {
      const mockClient = createMockClient([
        {
          // Source widget info
          records: [
            {
              sectionId: 5,
              tableId: 'Customers',
              tableRef: 1,
              widgetType: 'record'
            }
          ]
        },
        {
          // Target widget info
          records: [
            {
              sectionId: 6,
              tableId: 'Orders',
              tableRef: 2,
              widgetType: 'detail'
            }
          ]
        },
        // No column type query for targetColRef = 0
        // isSummaryTable checks (source and target)
        { records: [{ summarySourceTable: 0 }] },
        { records: [{ summarySourceTable: 0 }] }
      ])

      // Should not throw and not query column type
      await expect(validateWidgetLink(mockClient, mockDocId, 5, 6, 0, 0)).resolves.not.toThrow()
    })
  })

  describe('Rule 4: Basic cycle detection', () => {
    it('should reject field-level links on same table', { retry: 0 }, async () => {
      const mockClient = createMockClient([
        {
          // Source widget info
          records: [
            {
              sectionId: 5,
              tableId: 'Customers',
              tableRef: 1,
              widgetType: 'record'
            }
          ]
        },
        {
          // Target widget info (same table)
          records: [
            {
              sectionId: 6,
              tableId: 'Customers',
              tableRef: 1,
              widgetType: 'detail'
            }
          ]
        },
        {
          // Column type query (targetColRef = 20, so we need to check it's not Attachments)
          records: [{ type: 'Ref:Customers' }]
        }
      ])

      // Field-level link (sourceColRef = 10, targetColRef = 20)
      try {
        await validateWidgetLink(mockClient, mockDocId, 5, 6, 10, 20)
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        if (error instanceof ValidationError) {
          expect(error.message).toContain(
            'Cannot create field-level link between widgets on the same table'
          )
        }
      }
    })

    it('should accept cursor-level links on same table', async () => {
      const mockClient = createMockClient([
        {
          // Source widget info
          records: [
            {
              sectionId: 5,
              tableId: 'Customers',
              tableRef: 1,
              widgetType: 'record'
            }
          ]
        },
        {
          // Target widget info (same table)
          records: [
            {
              sectionId: 6,
              tableId: 'Customers',
              tableRef: 1,
              widgetType: 'single'
            }
          ]
        },
        // isSummaryTable checks (source and target)
        { records: [{ summarySourceTable: 0 }] },
        { records: [{ summarySourceTable: 0 }] }
      ])

      // Cursor-level link (both colRefs = 0)
      await expect(validateWidgetLink(mockClient, mockDocId, 5, 6, 0, 0)).resolves.not.toThrow()
    })

    it('should accept field-level links on different tables', async () => {
      const mockClient = createMockClient([
        {
          // Source widget info
          records: [
            {
              sectionId: 5,
              tableId: 'Customers',
              tableRef: 1,
              widgetType: 'record'
            }
          ]
        },
        {
          // Target widget info (different table)
          records: [
            {
              sectionId: 6,
              tableId: 'Orders',
              tableRef: 2,
              widgetType: 'detail'
            }
          ]
        },
        {
          // Column type query for targetColRef
          records: [{ type: 'Ref:Customers' }]
        },
        // isSummaryTable checks (source and target)
        { records: [{ summarySourceTable: 0 }] },
        { records: [{ summarySourceTable: 0 }] }
      ])

      // Field-level link (sourceColRef = 0, targetColRef = 10)
      await expect(validateWidgetLink(mockClient, mockDocId, 5, 6, 0, 10)).resolves.not.toThrow()
    })
  })

  describe('Error handling', () => {
    it('should throw ValidationError when source widget not found', async () => {
      const mockClient = createMockClient([
        {
          // Empty response for source widget
          records: []
        }
      ])

      try {
        await validateWidgetLink(mockClient, mockDocId, 999, 6, 0, 0)
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        if (error instanceof ValidationError) {
          expect(error.message).toContain('Widget section 999 not found')
        }
      }
    })

    it('should throw ValidationError when target widget not found', async () => {
      const mockClient = createMockClient([
        {
          // Source widget found
          records: [
            {
              sectionId: 5,
              tableId: 'Customers',
              tableRef: 1,
              widgetType: 'record'
            }
          ]
        },
        {
          // Empty response for target widget
          records: []
        }
      ])

      try {
        await validateWidgetLink(mockClient, mockDocId, 5, 999, 0, 0)
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        if (error instanceof ValidationError) {
          expect(error.message).toContain('Widget section 999 not found')
        }
      }
    })

    it('should throw ValidationError when column not found', async () => {
      const mockClient = createMockClient([
        {
          // Source widget info
          records: [
            {
              sectionId: 5,
              tableId: 'Customers',
              tableRef: 1,
              widgetType: 'record'
            }
          ]
        },
        {
          // Target widget info
          records: [
            {
              sectionId: 6,
              tableId: 'Orders',
              tableRef: 2,
              widgetType: 'detail'
            }
          ]
        },
        {
          // Empty response for column type
          records: []
        }
      ])

      try {
        await validateWidgetLink(mockClient, mockDocId, 5, 6, 0, 999)
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        if (error instanceof ValidationError) {
          expect(error.message).toContain('Column 999 not found')
        }
      }
    })
  })
})
