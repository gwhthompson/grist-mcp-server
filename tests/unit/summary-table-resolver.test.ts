/**
 * Unit tests for summary-table-resolver service
 *
 * Tests summary table detection and NULL handling for:
 * - isSummaryTable function
 * - getTableInfo function
 *
 * Bug #3 regression tests: Grist can return NULL for summarySourceTable
 * on regular tables (not just 0), so we must handle both cases.
 */

import { describe, expect, it, vi } from 'vitest'
import type { GristClient } from '../../src/services/grist-client.js'
import { getTableInfo, isSummaryTable } from '../../src/services/summary-table-resolver.js'

// Mock GristClient for unit testing
function createMockClient(mockResponses: unknown[]): GristClient {
  let callIndex = 0
  return {
    post: vi.fn().mockImplementation(() => {
      const response = mockResponses[callIndex] || { records: [] }
      callIndex++
      return Promise.resolve(response)
    })
  } as unknown as GristClient
}

describe('isSummaryTable', () => {
  it('should return false when summarySourceTable is NULL (Bug #3 regression)', async () => {
    // Grist can return NULL for regular tables instead of 0
    const mockClient = createMockClient([{ records: [{ summarySourceTable: null }] }])

    const result = await isSummaryTable(mockClient, 'a'.repeat(22), 1)

    expect(result).toBe(false)
  })

  it('should return false when summarySourceTable is 0', async () => {
    const mockClient = createMockClient([{ records: [{ summarySourceTable: 0 }] }])

    const result = await isSummaryTable(mockClient, 'a'.repeat(22), 1)

    expect(result).toBe(false)
  })

  it('should return true when summarySourceTable is positive number', async () => {
    const mockClient = createMockClient([{ records: [{ summarySourceTable: 5 }] }])

    const result = await isSummaryTable(mockClient, 'a'.repeat(22), 1)

    expect(result).toBe(true)
  })

  it('should return false when table not found', async () => {
    const mockClient = createMockClient([{ records: [] }])

    const result = await isSummaryTable(mockClient, 'a'.repeat(22), 999)

    expect(result).toBe(false)
  })
})

describe('getTableInfo', () => {
  it('should return regular table info when summarySourceTable is NULL (Bug #3 regression)', async () => {
    // Grist can return NULL for regular tables instead of 0
    const mockClient = createMockClient([
      {
        records: [
          {
            id: 1,
            tableId: 'Contacts',
            summarySourceTable: null,
            sourceTableId: null
          }
        ]
      }
    ])

    const result = await getTableInfo(mockClient, 'a'.repeat(22), 1)

    expect(result.isSummary).toBe(false)
    expect(result.tableId).toBe('Contacts')
  })

  it('should return regular table info when summarySourceTable is 0', async () => {
    const mockClient = createMockClient([
      {
        records: [
          {
            id: 1,
            tableId: 'Contacts',
            summarySourceTable: 0,
            sourceTableId: null
          }
        ]
      }
    ])

    const result = await getTableInfo(mockClient, 'a'.repeat(22), 1)

    expect(result.isSummary).toBe(false)
    expect(result.tableId).toBe('Contacts')
  })

  it('should return summary table info when summarySourceTable is positive', async () => {
    const mockClient = createMockClient([
      // First query: table info
      {
        records: [
          {
            id: 2,
            tableId: 'Contacts_summary_Region',
            summarySourceTable: 1,
            sourceTableId: 'Contacts'
          }
        ]
      },
      // Second query: group-by columns
      {
        records: [{ id: 5, colId: 'Region', summarySourceCol: 3 }]
      }
    ])

    const result = await getTableInfo(mockClient, 'a'.repeat(22), 2)

    expect(result.isSummary).toBe(true)
    if (result.isSummary) {
      expect(result.tableId).toBe('Contacts_summary_Region')
      expect(result.sourceTableId).toBe('Contacts')
      expect(result.sourceTableRef).toBe(1)
      expect(result.groupByColumns).toEqual(['Region'])
    }
  })

  it('should throw error when table not found', async () => {
    const mockClient = createMockClient([{ records: [] }])

    await expect(getTableInfo(mockClient, 'a'.repeat(22), 999)).rejects.toThrow(
      'Table with ref 999 not found'
    )
  })
})
