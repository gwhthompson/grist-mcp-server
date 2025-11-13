import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addRecords } from '../../src/tools/records.js'
import { ensureGristReady } from '../helpers/docker.js'
import {
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../helpers/grist-api.js'

/**
 * Type Mismatch Validation Tests
 *
 * Tests that cell values are validated against their column types to prevent
 * data corruption from type mismatches (e.g., "__YES__" in Boolean columns).
 *
 * Critical validations:
 * - Boolean columns reject strings like "__YES__", "true", "yes"
 * - Boolean columns reject numbers like 1, 0
 * - Numeric columns reject string representations like "42"
 */

describe('Type Mismatch Validation', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>

  beforeAll(async () => {
    await ensureGristReady()

    // Create test context with various column types
    context = await createFullTestContext(client, {
      workspaceName: 'Type Validation Test Workspace',
      docName: 'Type Validation Test',
      tableName: 'ValidationTests',
      columns: [
        {
          id: 'BoolColumn',
          fields: {
            label: 'Boolean Column',
            type: 'Bool'
          }
        },
        {
          id: 'NumericColumn',
          fields: {
            label: 'Numeric Column',
            type: 'Numeric'
          }
        },
        {
          id: 'IntColumn',
          fields: {
            label: 'Integer Column',
            type: 'Int'
          }
        },
        {
          id: 'TextColumn',
          fields: {
            label: 'Text Column',
            type: 'Text'
          }
        }
      ]
    })
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  describe('Boolean Column Validation', () => {
    it('should accept valid boolean primitive true', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [{ BoolColumn: true }],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should accept valid boolean primitive false', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [{ BoolColumn: false }],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should accept null for empty cell', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [{ BoolColumn: null }],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should reject string "__YES__" in Boolean column', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        // biome-ignore lint/suspicious/noExplicitAny: Testing invalid string type rejection in Boolean column
        records: [{ BoolColumn: '__YES__' as any }],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Boolean column.*expects.*true.*false/i)
    })

    it('should reject string "true" in Boolean column', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        // biome-ignore lint/suspicious/noExplicitAny: Testing invalid string type rejection in Boolean column
        records: [{ BoolColumn: 'true' as any }],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Boolean column.*expects.*true.*false/i)
    })

    it('should reject string "false" in Boolean column', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        // biome-ignore lint/suspicious/noExplicitAny: Testing invalid string type rejection in Boolean column
        records: [{ BoolColumn: 'false' as any }],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Boolean column.*expects.*true.*false/i)
    })

    it('should reject string "yes" in Boolean column', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        // biome-ignore lint/suspicious/noExplicitAny: Testing invalid string type rejection in Boolean column
        records: [{ BoolColumn: 'yes' as any }],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Boolean column.*expects.*true.*false/i)
    })

    it('should reject string "no" in Boolean column', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        // biome-ignore lint/suspicious/noExplicitAny: Testing invalid string type rejection in Boolean column
        records: [{ BoolColumn: 'no' as any }],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Boolean column.*expects.*true.*false/i)
    })

    it('should reject number 1 in Boolean column', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        // biome-ignore lint/suspicious/noExplicitAny: Testing invalid number type rejection in Boolean column
        records: [{ BoolColumn: 1 as any }],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Boolean column.*expects.*true.*false/i)
    })

    it('should reject number 0 in Boolean column', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        // biome-ignore lint/suspicious/noExplicitAny: Testing invalid number type rejection in Boolean column
        records: [{ BoolColumn: 0 as any }],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Boolean column.*expects.*true.*false/i)
    })

    it('error message should be actionable and include examples', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        // biome-ignore lint/suspicious/noExplicitAny: Testing invalid string type rejection in Boolean column
        records: [{ BoolColumn: '__YES__' as any }],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      const message = result.content[0].text
      // Should mention the column name
      expect(message).toMatch(/BoolColumn/i)
      // Should explain what's expected
      expect(message).toMatch(/expects.*true.*false/i)
      // Should show examples
      expect(message).toMatch(/✅|Examples/i)
    })
  })

  describe('Numeric Column Validation', () => {
    it('should accept valid number', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [{ NumericColumn: 42.5 }],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should accept negative number', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [{ NumericColumn: -10.25 }],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should accept zero', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [{ NumericColumn: 0 }],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should accept null for empty cell', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [{ NumericColumn: null }],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should reject string "42" in Numeric column', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        // biome-ignore lint/suspicious/noExplicitAny: Testing invalid string type rejection in Numeric column
        records: [{ NumericColumn: '42' as any }],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Numeric column.*expects.*number/i)
    })

    it('should reject string "3.14" in Numeric column', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        // biome-ignore lint/suspicious/noExplicitAny: Testing invalid string type rejection in Numeric column
        records: [{ NumericColumn: '3.14' as any }],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Numeric column.*expects.*number/i)
    })

    it('should reject boolean in Numeric column', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        // biome-ignore lint/suspicious/noExplicitAny: Testing invalid boolean type rejection in Numeric column
        records: [{ NumericColumn: true as any }],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Numeric column.*expects.*number/i)
    })
  })

  describe('Integer Column Validation', () => {
    it('should accept valid integer', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [{ IntColumn: 42 }],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should accept decimal number (Grist handles truncation)', async () => {
      // Note: Grist Int columns accept decimals and truncate them
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [{ IntColumn: 42.7 }],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should accept null for empty cell', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [{ IntColumn: null }],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should reject string "42" in Int column', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        // biome-ignore lint/suspicious/noExplicitAny: Testing invalid string type rejection in Int column
        records: [{ IntColumn: '42' as any }],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Int column.*expects.*number/i)
    })
  })

  describe('Text Column Validation (Permissive)', () => {
    it('should accept any string', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [{ TextColumn: '__YES__' }],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should accept string representation of boolean', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [{ TextColumn: 'true' }],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should accept empty string', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [{ TextColumn: '' }],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should accept null for empty cell', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [{ TextColumn: null }],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should reject number in Text column', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        // biome-ignore lint/suspicious/noExplicitAny: Testing invalid number type rejection in Text column
        records: [{ TextColumn: 42 as any }],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Text column.*expects.*string/i)
    })

    it('should reject boolean in Text column', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        // biome-ignore lint/suspicious/noExplicitAny: Testing invalid boolean type rejection in Text column
        records: [{ TextColumn: true as any }],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Text column.*expects.*string/i)
    })
  })

  describe('Mixed Type Validation', () => {
    it('should allow valid values for multiple columns', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [
          {
            BoolColumn: true,
            NumericColumn: 42.5,
            IntColumn: 10,
            TextColumn: 'Valid text'
          }
        ],
        response_format: 'json'
      })
      expect(result.isError).toBeFalsy()
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic API response structure in test code
      const data = result.structuredContent as any
      expect(data.record_ids).toHaveLength(1)
    })

    it('should reject if any column has type mismatch', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [
          {
            // biome-ignore lint/suspicious/noExplicitAny: Testing invalid string type rejection in Boolean column
            BoolColumn: '__YES__' as any, // Invalid
            NumericColumn: 42.5, // Valid
            IntColumn: 10, // Valid
            TextColumn: 'Valid text' // Valid
          }
        ],
        response_format: 'json'
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Boolean column/i)
    })

    it('should validate all fields and report first error', async () => {
      const result = await addRecords(client, {
        docId: context.docId,
        tableId: context.tableId,
        records: [
          {
            // biome-ignore lint/suspicious/noExplicitAny: Testing multiple invalid type rejections
            BoolColumn: 'yes' as any, // Invalid
            // biome-ignore lint/suspicious/noExplicitAny: Testing multiple invalid type rejections
            NumericColumn: '42.5' as any, // Invalid
            IntColumn: 10,
            TextColumn: 'Valid text'
          }
        ],
        response_format: 'json'
      })
      expect(result.isError).toBe(true) // Should fail on first validation error
    })
  })
})
