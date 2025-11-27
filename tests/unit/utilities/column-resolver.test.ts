/**
 * Column Resolver Service Unit Tests
 *
 * Tests the column name → numeric ID resolution logic for visibleCol properties.
 * This service enables user-friendly column names instead of requiring numeric IDs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ColumnsApiResponse } from '../../../src/services/column-resolver.js'
import { resolveVisibleCol } from '../../../src/services/column-resolver.js'
import type { GristClient } from '../../../src/services/grist-client.js'

describe('Column Resolver Service', () => {
  let mockClient: GristClient

  beforeEach(() => {
    // Create a mock GristClient
    mockClient = {
      get: vi.fn()
    } as unknown as GristClient
  })

  describe('resolveVisibleCol - Numeric ID Pass-Through', () => {
    it('should return numeric visibleCol unchanged', async () => {
      const result = await resolveVisibleCol(mockClient, 'doc123', 'Customers', 456)

      expect(result).toBe(456)
      // Should NOT call API (no resolution needed)
      expect(mockClient.get).not.toHaveBeenCalled()
    })

    it('should handle zero as valid column ID', async () => {
      const result = await resolveVisibleCol(mockClient, 'doc123', 'Customers', 0)

      expect(result).toBe(0)
      expect(mockClient.get).not.toHaveBeenCalled()
    })

    it('should handle large column IDs', async () => {
      const result = await resolveVisibleCol(mockClient, 'doc123', 'Customers', 999999)

      expect(result).toBe(999999)
      expect(mockClient.get).not.toHaveBeenCalled()
    })
  })

  describe('resolveVisibleCol - String Name Resolution', () => {
    it('should resolve column name to numeric colRef', async () => {
      // Mock API response with available columns
      const mockResponse: ColumnsApiResponse = {
        columns: [
          {
            id: 'Name',
            fields: { colRef: 123, type: 'Text' }
          },
          {
            id: 'Email',
            fields: { colRef: 456, type: 'Text' }
          },
          {
            id: 'Phone',
            fields: { colRef: 789, type: 'Text' }
          }
        ]
      }

      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      const result = await resolveVisibleCol(mockClient, 'doc123', 'Customers', 'Email')

      expect(result).toBe(456)
      expect(mockClient.get).toHaveBeenCalledWith('/docs/doc123/tables/Customers/columns')
    })

    it('should handle column name with underscores', async () => {
      const mockResponse: ColumnsApiResponse = {
        columns: [
          {
            id: 'First_Name',
            fields: { colRef: 111, type: 'Text' }
          },
          {
            id: 'Last_Name',
            fields: { colRef: 222, type: 'Text' }
          }
        ]
      }

      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      const result = await resolveVisibleCol(mockClient, 'doc123', 'People', 'Last_Name')

      expect(result).toBe(222)
    })

    it('should match column names case-sensitively', async () => {
      const mockResponse: ColumnsApiResponse = {
        columns: [
          {
            id: 'email', // lowercase
            fields: { colRef: 100, type: 'Text' }
          },
          {
            id: 'Email', // uppercase
            fields: { colRef: 200, type: 'Text' }
          }
        ]
      }

      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      // Should match exact case
      const result1 = await resolveVisibleCol(mockClient, 'doc123', 'Users', 'email')
      expect(result1).toBe(100) // lowercase match

      const result2 = await resolveVisibleCol(mockClient, 'doc123', 'Users', 'Email')
      expect(result2).toBe(200) // uppercase match
    })

    it('should handle single column in table', async () => {
      const mockResponse: ColumnsApiResponse = {
        columns: [
          {
            id: 'OnlyColumn',
            fields: { colRef: 42, type: 'Text' }
          }
        ]
      }

      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      const result = await resolveVisibleCol(mockClient, 'doc123', 'SimpleTable', 'OnlyColumn')

      expect(result).toBe(42)
    })
  })

  describe('resolveVisibleCol - Error Cases', () => {
    it('should throw actionable error when column not found', async () => {
      const mockResponse: ColumnsApiResponse = {
        columns: [
          {
            id: 'Name',
            fields: { colRef: 123, type: 'Text' }
          },
          {
            id: 'Email',
            fields: { colRef: 456, type: 'Text' }
          }
        ]
      }

      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      await expect(
        resolveVisibleCol(mockClient, 'doc123', 'Customers', 'InvalidColumn')
      ).rejects.toThrow(/Column 'InvalidColumn' not found in table 'Customers'/)
    })

    it('should list available columns when column not found', async () => {
      const mockResponse: ColumnsApiResponse = {
        columns: [
          {
            id: 'Name',
            fields: { colRef: 123, type: 'Text' }
          },
          {
            id: 'Email',
            fields: { colRef: 456, type: 'Text' }
          }
        ]
      }

      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      await expect(resolveVisibleCol(mockClient, 'doc123', 'Customers', 'Phone')).rejects.toThrow(
        /Available columns: Name, Email/
      )
    })

    it('should mention case-sensitivity in error message', async () => {
      const mockResponse: ColumnsApiResponse = {
        columns: [
          {
            id: 'Email',
            fields: { colRef: 456, type: 'Text' }
          }
        ]
      }

      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      await expect(
        resolveVisibleCol(mockClient, 'doc123', 'Customers', 'email') // lowercase
      ).rejects.toThrow(/Column names are case-sensitive/)
    })

    it('should handle empty column list gracefully', async () => {
      const mockResponse: ColumnsApiResponse = {
        columns: []
      }

      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      await expect(
        resolveVisibleCol(mockClient, 'doc123', 'EmptyTable', 'AnyColumn')
      ).rejects.toThrow(/Available columns: none/)
    })

    it('should provide context when API request fails', async () => {
      vi.mocked(mockClient.get).mockRejectedValue(new Error('Network timeout'))

      await expect(resolveVisibleCol(mockClient, 'doc123', 'Customers', 'Name')).rejects.toThrow(
        /Failed to resolve column 'Name' in table 'Customers'/
      )
    })

    it('should preserve original error for not-found cases', async () => {
      const mockResponse: ColumnsApiResponse = {
        columns: [
          {
            id: 'Name',
            fields: { colRef: 123, type: 'Text' }
          }
        ]
      }

      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      // Should get the specific "not found in table" error, not generic "Failed to resolve"
      await expect(
        resolveVisibleCol(mockClient, 'doc123', 'Customers', 'InvalidColumn')
      ).rejects.toThrow(/not found in table/)

      await expect(
        resolveVisibleCol(mockClient, 'doc123', 'Customers', 'InvalidColumn')
      ).rejects.not.toThrow(/Failed to resolve/)
    })
  })

  describe('resolveVisibleCol - Edge Cases', () => {
    it('should handle columns with special characters in table name', async () => {
      const mockResponse: ColumnsApiResponse = {
        columns: [
          {
            id: 'Name',
            fields: { colRef: 123, type: 'Text' }
          }
        ]
      }

      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      const result = await resolveVisibleCol(mockClient, 'doc123', 'Sales_2024', 'Name')

      expect(result).toBe(123)
      expect(mockClient.get).toHaveBeenCalledWith('/docs/doc123/tables/Sales_2024/columns')
    })

    it('should handle column with formula and widgetOptions', async () => {
      const mockResponse: ColumnsApiResponse = {
        columns: [
          {
            id: 'FullName',
            fields: {
              colRef: 555,
              type: 'Text',
              isFormula: true,
              formula: '$FirstName + " " + $LastName',
              widgetOptions: '{"alignment":"left"}'
            }
          }
        ]
      }

      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      const result = await resolveVisibleCol(mockClient, 'doc123', 'People', 'FullName')

      expect(result).toBe(555)
    })

    it('should handle columns with labels different from IDs', async () => {
      const mockResponse: ColumnsApiResponse = {
        columns: [
          {
            id: 'EmailAddress', // ID
            fields: {
              colRef: 456,
              type: 'Text',
              label: 'Email Address' // Label (different from ID)
            }
          }
        ]
      }

      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      // Should match by ID, not label
      const result = await resolveVisibleCol(mockClient, 'doc123', 'Contacts', 'EmailAddress')
      expect(result).toBe(456)

      // Label match should fail
      await expect(
        resolveVisibleCol(mockClient, 'doc123', 'Contacts', 'Email Address')
      ).rejects.toThrow(/not found/)
    })
  })

  describe('resolveVisibleCol - API Call Verification', () => {
    it('should call correct API endpoint with docId and tableId', async () => {
      const mockResponse: ColumnsApiResponse = {
        columns: [
          {
            id: 'Name',
            fields: { colRef: 123, type: 'Text' }
          }
        ]
      }

      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      await resolveVisibleCol(mockClient, 'aKt7TZe8YGLp3ak8bDL8TZ', 'Customers', 'Name')

      expect(mockClient.get).toHaveBeenCalledTimes(1)
      expect(mockClient.get).toHaveBeenCalledWith(
        '/docs/aKt7TZe8YGLp3ak8bDL8TZ/tables/Customers/columns'
      )
    })

    it('should only call API once per resolution', async () => {
      const mockResponse: ColumnsApiResponse = {
        columns: [
          {
            id: 'Name',
            fields: { colRef: 123, type: 'Text' }
          }
        ]
      }

      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      await resolveVisibleCol(mockClient, 'doc123', 'People', 'Name')

      expect(mockClient.get).toHaveBeenCalledTimes(1)
    })
  })

  describe('resolveVisibleCol - Performance Characteristics', () => {
    it('should find column efficiently in large column list', async () => {
      // Create mock response with 100 columns
      const columns = Array.from({ length: 100 }, (_, i) => ({
        id: `Column${i}`,
        fields: { colRef: i, type: 'Text' }
      }))

      const mockResponse: ColumnsApiResponse = { columns }
      vi.mocked(mockClient.get).mockResolvedValue(mockResponse)

      // Find column at the end of list
      const result = await resolveVisibleCol(mockClient, 'doc123', 'LargeTable', 'Column99')

      expect(result).toBe(99)
    })

    it('should not make API call for numeric IDs (performance optimization)', async () => {
      // Verify no API overhead for numeric IDs
      const result = await resolveVisibleCol(mockClient, 'doc123', 'Customers', 456)

      expect(result).toBe(456)
      expect(mockClient.get).not.toHaveBeenCalled()
      // This is a performance optimization - avoids unnecessary API round trip
    })
  })
})
