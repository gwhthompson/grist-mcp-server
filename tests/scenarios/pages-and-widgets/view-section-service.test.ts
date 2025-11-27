/**
 * Integration tests for ViewSectionService
 *
 * Tests ViewSection queries against real Docker Grist instance
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ViewSectionRecord } from '../../../src/schemas/api-responses.js'
import { buildViewSectionUpdate, ViewSectionService } from '../../../src/services/view-section.js'
import type { DocId, SectionId, ViewId } from '../../../src/types/advanced.js'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../../helpers/grist-api.js'

describe('ViewSectionService (Docker Integration)', () => {
  const client = createTestClient()
  let service: ViewSectionService
  let context: Awaited<ReturnType<typeof createFullTestContext>>
  let testDocId: DocId
  let testViewId: number
  let testSectionId: number

  beforeAll(async () => {
    await ensureGristReady()

    // Create test context with simple table
    context = await createFullTestContext(client, {
      docName: 'ViewSectionService Test',
      tableName: 'TestTable1'
    })

    testDocId = context.docId
    service = new ViewSectionService(client)

    // Create test page using buildPage
    const { buildPage } = await import('../../../src/tools/pages/index.js')
    const buildResult = await buildPage(context.toolContext, {
      docId: testDocId,
      page_name: 'Test Page',
      config: {
        pattern: 'custom',
        widgets: [{ table: context.tableId, title: 'Test Widget', widget_type: 'grid' }]
      }
    })

    const buildData = buildResult.structuredContent as Record<string, unknown>
    const widgets = buildData.widgets as Array<{ section_id: number }>
    testSectionId = widgets[0].section_id
    testViewId = buildData.view_id as number
  }, 60000) // Increase timeout for setup

  afterAll(async () => {
    await cleanupTestContext(context)
  })

  describe('getViewSection', () => {
    it('fetches and validates complete section record', async () => {
      const section = await service.getViewSection(testDocId, testSectionId as SectionId)

      // Zod validation passed - verify all required fields present
      expect(section.id).toBe(testSectionId)
      expect(section.parentId).toBe(testViewId)
      expect(typeof section.tableRef).toBe('number')
      expect(section.tableRef).toBeGreaterThan(0)
      expect(typeof section.parentKey).toBe('string')
      expect(typeof section.title).toBe('string')
      expect(typeof section.borderWidth).toBe('number')

      // Nullable fields should be number or null
      expect([null, 'number']).toContain(typeof section.linkSrcSectionRef)
      expect([null, 'number']).toContain(typeof section.linkSrcColRef)
      expect([null, 'number']).toContain(typeof section.linkTargetColRef)
    })

    it('throws descriptive error for missing section', async () => {
      await expect(service.getViewSection(testDocId, 99999 as SectionId)).rejects.toThrow(
        /ViewSection 99999 not found/
      )
    })

    it('handles both flat and nested SQL response formats', async () => {
      // This tests the defensive field extraction in parseViewSectionRecord
      const section = await service.getViewSection(testDocId, testSectionId as SectionId)

      expect(section.id).toBeDefined()
      expect(typeof section.id).toBe('number')
    })

    it('validates field types with Zod', async () => {
      const section = await service.getViewSection(testDocId, testSectionId as SectionId)

      // All INTEGER fields must be numbers (validated by Zod)
      expect(typeof section.id).toBe('number')
      expect(typeof section.parentId).toBe('number')
      expect(typeof section.tableRef).toBe('number')
      expect(typeof section.borderWidth).toBe('number')

      // String fields must be strings
      expect(typeof section.parentKey).toBe('string')
      expect(typeof section.title).toBe('string')
    })
  })

  describe('getLayoutSpec', () => {
    it('fetches layoutSpec with validation', async () => {
      const layoutSpec = await service.getLayoutSpec(testDocId, testViewId as ViewId)

      expect(typeof layoutSpec).toBe('string')

      // Should be valid JSON or empty string
      if (layoutSpec && layoutSpec !== '{}') {
        expect(() => JSON.parse(layoutSpec)).not.toThrow()
      }
    })

    it('returns valid layoutSpec string', async () => {
      const layoutSpec = await service.getLayoutSpec(testDocId, testViewId as ViewId)

      // Should be valid string (may be '{}' for empty or valid JSON)
      expect(typeof layoutSpec).toBe('string')

      // Should be parseable as JSON
      expect(() => JSON.parse(layoutSpec || '{}')).not.toThrow()
    })

    it('throws for missing view', async () => {
      await expect(service.getLayoutSpec(testDocId, 99999 as ViewId)).rejects.toThrow(
        /View 99999 not found/
      )
    })

    it('handles defensive field extraction', async () => {
      // Should not throw on valid view
      const layoutSpec = await service.getLayoutSpec(testDocId, testViewId as ViewId)
      expect(typeof layoutSpec).toBe('string')
    })
  })

  describe('buildViewSectionUpdate', () => {
    let existing: ViewSectionRecord

    beforeAll(async () => {
      // Fetch a real section to test update building
      existing = await service.getViewSection(testDocId, testSectionId as SectionId)
    })

    it('preserves all required INTEGER fields with no updates', () => {
      const payload = buildViewSectionUpdate(existing, {})

      expect(payload.tableRef).toBe(existing.tableRef)
      expect(payload.parentId).toBe(existing.parentId)
      expect(payload.borderWidth).toBe(existing.borderWidth)
      expect(payload.linkSrcSectionRef).toBe(existing.linkSrcSectionRef)
      expect(payload.linkSrcColRef).toBe(existing.linkSrcColRef)
      expect(payload.linkTargetColRef).toBe(existing.linkTargetColRef)
    })

    it('preserves required fields when updating title only', () => {
      const payload = buildViewSectionUpdate(existing, {
        title: 'New Title'
      })

      // Updated field
      expect(payload.title).toBe('New Title')

      // Preserved fields
      expect(payload.tableRef).toBe(existing.tableRef)
      expect(payload.parentId).toBe(existing.parentId)
      expect(payload.borderWidth).toBe(existing.borderWidth)
    })

    it('preserves required fields when updating link configuration', () => {
      const payload = buildViewSectionUpdate(existing, {
        linkSrcSectionRef: 10,
        linkSrcColRef: 5,
        linkTargetColRef: 6
      })

      // Updated link fields
      expect(payload.linkSrcSectionRef).toBe(10)
      expect(payload.linkSrcColRef).toBe(5)
      expect(payload.linkTargetColRef).toBe(6)

      // Preserved required fields
      expect(payload.tableRef).toBe(existing.tableRef)
      expect(payload.parentId).toBe(existing.parentId)
      expect(payload.borderWidth).toBe(existing.borderWidth)
    })

    it('allows null values for nullable link fields', () => {
      const payload = buildViewSectionUpdate(existing, {
        linkSrcSectionRef: null,
        linkSrcColRef: null,
        linkTargetColRef: null
      })

      expect(payload.linkSrcSectionRef).toBeNull()
      expect(payload.linkSrcColRef).toBeNull()
      expect(payload.linkTargetColRef).toBeNull()
    })

    it('merges multiple fields correctly', () => {
      const payload = buildViewSectionUpdate(existing, {
        title: 'Updated Title',
        description: 'Updated Description',
        parentKey: 'detail',
        linkSrcSectionRef: 20
      })

      expect(payload.title).toBe('Updated Title')
      expect(payload.description).toBe('Updated Description')
      expect(payload.parentKey).toBe('detail')
      expect(payload.linkSrcSectionRef).toBe(20)

      // Still preserved
      expect(payload.tableRef).toBe(existing.tableRef)
      expect(payload.parentId).toBe(existing.parentId)
    })

    it('does not include undefined values', () => {
      const payload = buildViewSectionUpdate(existing, {
        title: 'New Title',
        description: undefined // ❌ Should not be included
      })

      expect(payload.title).toBe('New Title')
      expect('description' in payload).toBe(false) // Should not be present
    })
  })
})
