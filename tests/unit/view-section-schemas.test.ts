/**
 * Unit tests for ViewSection Zod schemas
 *
 * Tests runtime validation of _grist_Views_section records
 */

import { describe, expect, it } from 'vitest'
import { ViewLayoutSpecSchema, ViewSectionRecordSchema } from '../../src/schemas/api-responses.js'

describe('ViewSection Schemas', () => {
  describe('ViewSectionRecordSchema', () => {
    it('validates complete valid record', () => {
      const validRecord = {
        id: 1,
        parentId: 2,
        tableRef: 3,
        parentKey: 'record',
        title: 'Test Widget',
        description: 'Test description',
        linkSrcSectionRef: null,
        linkSrcColRef: null,
        linkTargetColRef: null,
        sortColRefs: '[]',
        filterSpec: null,
        borderWidth: 1,
        chartType: '',
        options: ''
      }

      const result = ViewSectionRecordSchema.safeParse(validRecord)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(1)
        expect(result.data.parentId).toBe(2)
        expect(result.data.tableRef).toBe(3)
        expect(result.data.title).toBe('Test Widget')
        expect(result.data.description).toBe('Test description')
      }
    })

    it('validates record with link configuration', () => {
      const linkedRecord = {
        id: 1,
        parentId: 2,
        tableRef: 3,
        parentKey: 'detail',
        title: 'Linked Widget',
        linkSrcSectionRef: 10,
        linkSrcColRef: 5,
        linkTargetColRef: 6,
        sortColRefs: null,
        filterSpec: null,
        borderWidth: 1
      }

      const result = ViewSectionRecordSchema.safeParse(linkedRecord)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.linkSrcSectionRef).toBe(10)
        expect(result.data.linkSrcColRef).toBe(5)
        expect(result.data.linkTargetColRef).toBe(6)
      }
    })

    it('validates record with minimal required fields only', () => {
      const minimalRecord = {
        id: 1,
        parentId: 0, // 0 for raw sections
        tableRef: 1,
        parentKey: 'record',
        title: '',
        linkSrcSectionRef: null,
        linkSrcColRef: null,
        linkTargetColRef: null,
        sortColRefs: null,
        filterSpec: null,
        borderWidth: 0
      }

      const result = ViewSectionRecordSchema.safeParse(minimalRecord)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.parentId).toBe(0)
        expect(result.data.borderWidth).toBe(0)
      }
    })

    it('rejects missing required field (id)', () => {
      const invalid = {
        parentId: 2,
        tableRef: 3,
        parentKey: 'record',
        title: 'Test',
        linkSrcSectionRef: null,
        linkSrcColRef: null,
        linkTargetColRef: null,
        sortColRefs: null,
        filterSpec: null,
        borderWidth: 1
      }

      const result = ViewSectionRecordSchema.safeParse(invalid)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['id'] }))
      }
    })

    it('rejects missing required field (tableRef)', () => {
      const invalid = {
        id: 1,
        parentId: 2,
        parentKey: 'record',
        title: 'Test',
        linkSrcSectionRef: null,
        linkSrcColRef: null,
        linkTargetColRef: null,
        sortColRefs: null,
        filterSpec: null,
        borderWidth: 1
      }

      const result = ViewSectionRecordSchema.safeParse(invalid)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['tableRef'] }))
      }
    })

    it('rejects invalid type for INTEGER field (tableRef)', () => {
      const invalid = {
        id: 1,
        parentId: 2,
        tableRef: 'not a number', // ❌ Should be number
        parentKey: 'record',
        title: 'Test',
        linkSrcSectionRef: null,
        linkSrcColRef: null,
        linkTargetColRef: null,
        sortColRefs: null,
        filterSpec: null,
        borderWidth: 1
      }

      const result = ViewSectionRecordSchema.safeParse(invalid)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({
            path: ['tableRef'],
            code: 'invalid_type'
          })
        )
      }
    })

    it('rejects negative id', () => {
      const invalid = {
        id: -1, // ❌ Must be positive
        parentId: 2,
        tableRef: 3,
        parentKey: 'record',
        title: 'Test',
        linkSrcSectionRef: null,
        linkSrcColRef: null,
        linkTargetColRef: null,
        sortColRefs: null,
        filterSpec: null,
        borderWidth: 1
      }

      const result = ViewSectionRecordSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    it('accepts nullable link fields', () => {
      const record = {
        id: 1,
        parentId: 2,
        tableRef: 3,
        parentKey: 'record',
        title: 'Test',
        linkSrcSectionRef: null, // ✅ Nullable
        linkSrcColRef: null,
        linkTargetColRef: null,
        sortColRefs: null,
        filterSpec: null,
        borderWidth: 1
      }

      const result = ViewSectionRecordSchema.safeParse(record)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.linkSrcSectionRef).toBeNull()
        expect(result.data.linkSrcColRef).toBeNull()
        expect(result.data.linkTargetColRef).toBeNull()
      }
    })

    it('accepts optional chart fields', () => {
      const chartRecord = {
        id: 1,
        parentId: 2,
        tableRef: 3,
        parentKey: 'chart',
        title: 'Sales Chart',
        linkSrcSectionRef: null,
        linkSrcColRef: null,
        linkTargetColRef: null,
        sortColRefs: null,
        filterSpec: null,
        borderWidth: 1,
        chartType: 'bar',
        options: '{"xAxis":"Region","yAxis":["Sales"]}'
      }

      const result = ViewSectionRecordSchema.safeParse(chartRecord)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.chartType).toBe('bar')
        expect(result.data.options).toContain('xAxis')
      }
    })

    it('accepts chart record without optional fields', () => {
      const chartRecord = {
        id: 1,
        parentId: 2,
        tableRef: 3,
        parentKey: 'chart',
        title: 'Chart',
        linkSrcSectionRef: null,
        linkSrcColRef: null,
        linkTargetColRef: null,
        sortColRefs: null,
        filterSpec: null,
        borderWidth: 1
        // chartType and options omitted
      }

      const result = ViewSectionRecordSchema.safeParse(chartRecord)
      expect(result.success).toBe(true)
    })
  })

  describe('ViewLayoutSpecSchema', () => {
    it('validates view with layoutSpec', () => {
      const valid = {
        id: 1,
        layoutSpec: '{"type":"leaf","leaf":1}'
      }

      const result = ViewLayoutSpecSchema.safeParse(valid)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(1)
        expect(result.data.layoutSpec).toBe('{"type":"leaf","leaf":1}')
      }
    })

    it('accepts empty layoutSpec string', () => {
      const valid = {
        id: 1,
        layoutSpec: ''
      }

      const result = ViewLayoutSpecSchema.safeParse(valid)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.layoutSpec).toBe('')
      }
    })

    it('validates complex layoutSpec', () => {
      const valid = {
        id: 5,
        layoutSpec:
          '{"type":"hsplit","splitRatio":0.4,"children":[{"type":"leaf","leaf":1},{"type":"leaf","leaf":2}]}'
      }

      const result = ViewLayoutSpecSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })

    it('rejects missing id', () => {
      const invalid = {
        layoutSpec: '{"type":"leaf"}'
      }

      const result = ViewLayoutSpecSchema.safeParse(invalid)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['id'] }))
      }
    })

    it('rejects missing layoutSpec', () => {
      const invalid = {
        id: 1
      }

      const result = ViewLayoutSpecSchema.safeParse(invalid)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({ path: ['layoutSpec'] })
        )
      }
    })

    it('rejects non-string layoutSpec', () => {
      const invalid = {
        id: 1,
        layoutSpec: 123 // ❌ Should be string
      }

      const result = ViewLayoutSpecSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
  })
})
