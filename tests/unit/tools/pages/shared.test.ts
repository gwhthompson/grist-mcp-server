import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GristClient } from '../../../../src/services/grist-client.js'
import { fetchWidgetTableMetadata } from '../../../../src/tools/pages/shared.js'

describe('fetchWidgetTableMetadata', () => {
  let mockClient: {
    post: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockClient = {
      post: vi.fn()
    }
  })

  it('fetches metadata for section IDs and returns a map', async () => {
    mockClient.post.mockResolvedValue({
      records: [
        { section_id: 1, tableRef: 10, tableId: 'Table1' },
        { section_id: 2, tableRef: 20, tableId: 'Table2' }
      ]
    })

    const result = await fetchWidgetTableMetadata(
      mockClient as unknown as GristClient,
      'testDocId',
      [1, 2]
    )

    expect(result.size).toBe(2)
    expect(result.get(1)).toEqual({ tableRef: 10, tableId: 'Table1' })
    expect(result.get(2)).toEqual({ tableRef: 20, tableId: 'Table2' })

    expect(mockClient.post).toHaveBeenCalledWith('/docs/testDocId/sql', {
      sql: expect.stringContaining('SELECT vs.id as section_id'),
      args: [1, 2]
    })
  })

  it('handles nested fields structure', async () => {
    mockClient.post.mockResolvedValue({
      records: [{ fields: { section_id: 5, tableRef: 50, tableId: 'NestedTable' } }]
    })

    const result = await fetchWidgetTableMetadata(
      mockClient as unknown as GristClient,
      'docId',
      [5]
    )

    expect(result.size).toBe(1)
    expect(result.get(5)).toEqual({ tableRef: 50, tableId: 'NestedTable' })
  })

  it('returns empty map when no records', async () => {
    mockClient.post.mockResolvedValue({ records: [] })

    const result = await fetchWidgetTableMetadata(
      mockClient as unknown as GristClient,
      'docId',
      [1, 2, 3]
    )

    expect(result.size).toBe(0)
  })

  it('builds correct SQL with placeholders for multiple IDs', async () => {
    mockClient.post.mockResolvedValue({ records: [] })

    await fetchWidgetTableMetadata(mockClient as unknown as GristClient, 'doc123', [10, 20, 30])

    expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
      sql: expect.stringContaining('WHERE vs.id IN (?,?,?)'),
      args: [10, 20, 30]
    })
  })

  it('builds correct SQL with single placeholder for one ID', async () => {
    mockClient.post.mockResolvedValue({ records: [] })

    await fetchWidgetTableMetadata(mockClient as unknown as GristClient, 'doc123', [42])

    expect(mockClient.post).toHaveBeenCalledWith('/docs/doc123/sql', {
      sql: expect.stringContaining('WHERE vs.id IN (?)'),
      args: [42]
    })
  })
})
