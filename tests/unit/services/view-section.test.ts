import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GristClient } from '../../../src/services/grist-client.js'
import {
  buildViewSectionUpdate,
  ViewSectionService,
  validateViewSectionUpdate
} from '../../../src/services/view-section.js'

describe('ViewSectionService', () => {
  let mockClient: {
    post: ReturnType<typeof vi.fn>
  }
  let service: ViewSectionService

  beforeEach(() => {
    mockClient = {
      post: vi.fn()
    }
    service = new ViewSectionService(mockClient as unknown as GristClient)
  })

  describe('getViewSection', () => {
    it('returns parsed view section record', async () => {
      mockClient.post.mockResolvedValue({
        records: [
          {
            id: 1,
            parentId: 10,
            tableRef: 5,
            parentKey: 'record',
            title: 'Test Section',
            description: 'A test section',
            linkSrcSectionRef: 0,
            linkSrcColRef: 0,
            linkTargetColRef: 0,
            sortColRefs: '[]',
            filterSpec: '{}',
            borderWidth: 1,
            chartType: '',
            options: '{}'
          }
        ]
      })

      const result = await service.getViewSection(
        'docId',
        1 as unknown as number & { __brand: 'SectionId' }
      )

      expect(result.id).toBe(1)
      expect(result.title).toBe('Test Section')
      expect(mockClient.post).toHaveBeenCalledWith('/docs/docId/sql', {
        sql: expect.stringContaining('FROM _grist_Views_section'),
        args: [1]
      })
    })

    it('handles nested fields structure', async () => {
      mockClient.post.mockResolvedValue({
        records: [
          {
            fields: {
              id: 2,
              parentId: 20,
              tableRef: 10,
              parentKey: 'single',
              title: 'Nested Section',
              description: '',
              linkSrcSectionRef: 0,
              linkSrcColRef: 0,
              linkTargetColRef: 0,
              sortColRefs: '[]',
              filterSpec: '{}',
              borderWidth: 1,
              chartType: '',
              options: '{}'
            }
          }
        ]
      })

      const result = await service.getViewSection(
        'docId',
        2 as unknown as number & { __brand: 'SectionId' }
      )

      expect(result.id).toBe(2)
      expect(result.title).toBe('Nested Section')
    })

    it('throws error when section not found', async () => {
      mockClient.post.mockResolvedValue({ records: [] })

      await expect(
        service.getViewSection('docId', 999 as unknown as number & { __brand: 'SectionId' })
      ).rejects.toThrow('ViewSection 999 not found')
    })

    it('throws error for invalid record format', async () => {
      mockClient.post.mockResolvedValue({
        records: [{ id: 1, invalidField: 'bad' }]
      })

      await expect(
        service.getViewSection('docId', 1 as unknown as number & { __brand: 'SectionId' })
      ).rejects.toThrow('Invalid ViewSection record')
    })
  })

  describe('getLayoutSpec', () => {
    it('returns layout spec string', async () => {
      mockClient.post.mockResolvedValue({
        records: [{ id: 1, layoutSpec: '{"type":"leaf","leaf":5}' }]
      })

      const result = await service.getLayoutSpec(
        'docId',
        1 as unknown as number & { __brand: 'ViewId' }
      )

      expect(result).toBe('{"type":"leaf","leaf":5}')
    })

    it('returns empty object string when layoutSpec is empty', async () => {
      mockClient.post.mockResolvedValue({
        records: [{ id: 1, layoutSpec: '' }]
      })

      const result = await service.getLayoutSpec(
        'docId',
        1 as unknown as number & { __brand: 'ViewId' }
      )

      expect(result).toBe('{}')
    })

    it('throws error when view not found', async () => {
      mockClient.post.mockResolvedValue({ records: [] })

      await expect(
        service.getLayoutSpec('docId', 999 as unknown as number & { __brand: 'ViewId' })
      ).rejects.toThrow('View 999 not found')
    })

    it('throws error for invalid layoutSpec', async () => {
      mockClient.post.mockResolvedValue({
        records: [{ id: 1, layoutSpec: 123 }] // Should be string
      })

      await expect(
        service.getLayoutSpec('docId', 1 as unknown as number & { __brand: 'ViewId' })
      ).rejects.toThrow('Invalid layoutSpec')
    })
  })
})

describe('buildViewSectionUpdate', () => {
  const existingSection = {
    id: 1,
    parentId: 10,
    tableRef: 5,
    parentKey: 'record',
    title: 'Original',
    description: 'Original desc',
    linkSrcSectionRef: 0,
    linkSrcColRef: 0,
    linkTargetColRef: 0,
    sortColRefs: '[]',
    filterSpec: '{}',
    borderWidth: 1,
    chartType: '',
    options: '{}'
  }

  it('preserves existing required fields', () => {
    const result = buildViewSectionUpdate(existingSection, {})

    expect(result.tableRef).toBe(5)
    expect(result.parentId).toBe(10)
    expect(result.borderWidth).toBe(1)
    expect(result.linkSrcSectionRef).toBe(0)
    expect(result.linkSrcColRef).toBe(0)
    expect(result.linkTargetColRef).toBe(0)
  })

  it('applies provided updates', () => {
    const result = buildViewSectionUpdate(existingSection, {
      title: 'New Title',
      description: 'New Description'
    })

    expect(result.title).toBe('New Title')
    expect(result.description).toBe('New Description')
  })

  it('ignores undefined values in updates', () => {
    const result = buildViewSectionUpdate(existingSection, {
      title: 'New Title',
      description: undefined
    })

    expect(result.title).toBe('New Title')
    expect(result).not.toHaveProperty('description')
  })

  it('allows null values for nullable fields', () => {
    const result = buildViewSectionUpdate(existingSection, {
      linkSrcSectionRef: null,
      sortColRefs: null
    })

    expect(result.linkSrcSectionRef).toBeNull()
    expect(result.sortColRefs).toBeNull()
  })
})

describe('validateViewSectionUpdate', () => {
  it('passes with valid widget type', () => {
    expect(() => validateViewSectionUpdate({ parentKey: 'record' })).not.toThrow()
    expect(() => validateViewSectionUpdate({ parentKey: 'single' })).not.toThrow()
    expect(() => validateViewSectionUpdate({ parentKey: 'detail' })).not.toThrow()
    expect(() => validateViewSectionUpdate({ parentKey: 'chart' })).not.toThrow()
    expect(() => validateViewSectionUpdate({ parentKey: 'form' })).not.toThrow()
    expect(() => validateViewSectionUpdate({ parentKey: 'custom' })).not.toThrow()
  })

  it('throws for invalid widget type', () => {
    expect(() => validateViewSectionUpdate({ parentKey: 'invalid' })).toThrow(
      'Invalid widget type "invalid"'
    )
  })

  it('passes with valid sortColRefs JSON', () => {
    expect(() => validateViewSectionUpdate({ sortColRefs: '[]' })).not.toThrow()
    expect(() => validateViewSectionUpdate({ sortColRefs: '[1,2,3]' })).not.toThrow()
    expect(() => validateViewSectionUpdate({ sortColRefs: null })).not.toThrow()
  })

  it('throws for invalid sortColRefs JSON', () => {
    expect(() => validateViewSectionUpdate({ sortColRefs: 'not json' })).toThrow(
      'sortColRefs must be valid JSON'
    )
  })

  it('passes with no updates', () => {
    expect(() => validateViewSectionUpdate({})).not.toThrow()
  })

  it('collects multiple validation errors', () => {
    expect(() =>
      validateViewSectionUpdate({
        parentKey: 'invalid',
        sortColRefs: 'bad json'
      })
    ).toThrow(/Invalid widget type.*sortColRefs/s)
  })
})
