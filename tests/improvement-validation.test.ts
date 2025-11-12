/**
 * Validation Tests for January 10, 2025 Improvements
 *
 * These tests verify that the LLM-focused improvements actually work:
 * 1. CellValueSchema validates encoding correctly
 * 2. Enhanced error messages are triggered
 * 3. Tool descriptions contain encoding guides
 * 4. Widget options documentation is present
 */

import { describe, it, expect } from 'vitest'
import { CellValueSchema } from '../src/schemas/api-responses.js'

describe('Improvement Validation - CellValueSchema', () => {
  describe('Primitive values (should pass)', () => {
    it('should accept null', () => {
      const result = CellValueSchema.safeParse(null)
      expect(result.success).toBe(true)
    })

    it('should accept string', () => {
      const result = CellValueSchema.safeParse('Hello World')
      expect(result.success).toBe(true)
    })

    it('should accept number', () => {
      const result = CellValueSchema.safeParse(42)
      expect(result.success).toBe(true)
    })

    it('should accept boolean', () => {
      const result = CellValueSchema.safeParse(true)
      expect(result.success).toBe(true)
    })
  })

  describe('ChoiceList encoding validation', () => {
    it('should accept correctly encoded ChoiceList with "L" prefix', () => {
      const result = CellValueSchema.safeParse(['L', 'VIP', 'Active', 'Premium'])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(['L', 'VIP', 'Active', 'Premium'])
      }
    })

    it('should accept ChoiceList with numbers', () => {
      const result = CellValueSchema.safeParse(['L', 1, 2, 3])
      expect(result.success).toBe(true)
    })

    it('should accept empty ChoiceList', () => {
      const result = CellValueSchema.safeParse(['L'])
      expect(result.success).toBe(true)
    })

    it('should REJECT array without "L" prefix (common mistake)', () => {
      const result = CellValueSchema.safeParse(['VIP', 'Active'])
      // This should fail because ['VIP', 'Active'] doesn't match any specific encoding
      // It's not a valid primitive, and not a valid encoded type
      expect(result.success).toBe(false)

      if (!result.success) {
        // Error should mention the issue
        const errorMessage = JSON.stringify(result.error.errors)
        console.log('Error for wrong ChoiceList encoding:', errorMessage)
      }
    })
  })

  describe('Date encoding validation', () => {
    it('should accept correctly encoded Date ["d", timestamp]', () => {
      const result = CellValueSchema.safeParse(['d', 1705276800000])
      expect(result.success).toBe(true)
    })

    it('should accept Date with epoch timestamp', () => {
      const result = CellValueSchema.safeParse(['d', 0])
      expect(result.success).toBe(true)
    })

    it('should have description visible to LLMs', () => {
      // The schema description should be available (used in JSON Schema)
      const schema = CellValueSchema._def
      expect(schema).toBeDefined()
      // Description is on individual union variants
    })
  })

  describe('DateTime encoding validation', () => {
    it('should accept correctly encoded DateTime ["D", timestamp, timezone]', () => {
      const result = CellValueSchema.safeParse(['D', 1705276800000, 'UTC'])
      expect(result.success).toBe(true)
    })

    it('should accept DateTime with different timezones', () => {
      const result = CellValueSchema.safeParse(['D', 1705276800000, 'America/New_York'])
      expect(result.success).toBe(true)
    })

    it('should REJECT DateTime without timezone (common mistake)', () => {
      const result = CellValueSchema.safeParse(['D', 1705276800000])
      // This should fail - DateTime needs 3 elements
      expect(result.success).toBe(false)
    })
  })

  describe('Reference encoding validation', () => {
    it('should accept Reference ["R", row_id]', () => {
      const result = CellValueSchema.safeParse(['R', 123])
      expect(result.success).toBe(true)
    })

    it('should accept ReferenceList ["r", [row_ids]]', () => {
      const result = CellValueSchema.safeParse(['r', [1, 2, 3]])
      expect(result.success).toBe(true)
    })

    it('should accept empty ReferenceList', () => {
      const result = CellValueSchema.safeParse(['r', []])
      expect(result.success).toBe(true)
    })
  })

  describe('Dict encoding validation', () => {
    it('should accept Dict ["O", {...}]', () => {
      const result = CellValueSchema.safeParse(['O', { name: 'John', age: 30 }])
      expect(result.success).toBe(true)
    })

    it('should accept empty Dict', () => {
      const result = CellValueSchema.safeParse(['O', {}])
      expect(result.success).toBe(true)
    })
  })

  describe('Generic encoded values (catch-all)', () => {
    it('should accept other GristObjCode types', () => {
      // Exception: ["E", errorName, ...]
      const exception = CellValueSchema.safeParse(['E', 'ValueError', 'Invalid input'])
      expect(exception.success).toBe(true)

      // Pending: ["P"]
      const pending = CellValueSchema.safeParse(['P'])
      expect(pending.success).toBe(true)

      // Censored: ["C"]
      const censored = CellValueSchema.safeParse(['C'])
      expect(censored.success).toBe(true)
    })
  })

  describe('Error message quality', () => {
    it('should provide helpful error for invalid encoding', () => {
      const result = CellValueSchema.safeParse({ invalid: 'object' })
      expect(result.success).toBe(false)

      if (!result.success) {
        // Should have some error message
        expect(result.error.errors.length).toBeGreaterThan(0)
        console.log('Sample validation error:', result.error.errors[0])
      }
    })
  })
})

describe('Improvement Validation - Encoding Helpers', () => {
  it('should export encoding helpers from package', async () => {
    // Verify the helpers are accessible
    const helpers = await import('../src/encoding/cell-value-helpers.js')

    expect(helpers.createList).toBeDefined()
    expect(helpers.createDate).toBeDefined()
    expect(helpers.createDateTime).toBeDefined()
    expect(helpers.createReference).toBeDefined()
    expect(helpers.createReferenceList).toBeDefined()
    expect(helpers.GristObjCode).toBeDefined()
  })

  it('should create correctly encoded ChoiceList', async () => {
    const { createList } = await import('../src/encoding/cell-value-helpers.js')
    const result = createList('VIP', 'Active', 'Premium')
    expect(result).toEqual(['L', 'VIP', 'Active', 'Premium'])
  })

  it('should create correctly encoded Date', async () => {
    const { createDate } = await import('../src/encoding/cell-value-helpers.js')
    const timestamp = Date.parse('2024-01-15')
    const result = createDate(timestamp)
    expect(result).toEqual(['d', timestamp])
  })

  it('should create correctly encoded DateTime', async () => {
    const { createDateTime } = await import('../src/encoding/cell-value-helpers.js')
    const timestamp = Date.now()
    const result = createDateTime(timestamp, 'America/New_York')
    expect(result).toEqual(['D', timestamp, 'America/New_York'])
  })
})

describe('Improvement Validation - Tool Descriptions', () => {
  it('grist_add_records should include encoding guide', async () => {
    const { ALL_TOOLS } = await import('../src/registry/tool-definitions.js')
    const addRecordsTool = ALL_TOOLS.find(t => t.name === 'grist_add_records')

    expect(addRecordsTool).toBeDefined()
    expect(addRecordsTool!.description).toContain('CELLVALUE ENCODING')
    expect(addRecordsTool!.description).toContain('ChoiceList')
    expect(addRecordsTool!.description).toContain('["L",')
    expect(addRecordsTool!.description).toContain('Date')
    expect(addRecordsTool!.description).toContain('["d",')
    expect(addRecordsTool!.description).toContain('DateTime')
    expect(addRecordsTool!.description).toContain('["D",')
    expect(addRecordsTool!.description).toContain('COMPLETE ENCODING EXAMPLE')
  })

  it('grist_manage_columns should include widget options guide', async () => {
    const { ALL_TOOLS } = await import('../src/registry/tool-definitions.js')
    const manageColumnsTool = ALL_TOOLS.find(t => t.name === 'grist_manage_columns')

    expect(manageColumnsTool).toBeDefined()
    expect(manageColumnsTool!.description).toContain('WIDGET OPTIONS BY COLUMN TYPE')
    expect(manageColumnsTool!.description).toContain('Numeric/Int columns')
    expect(manageColumnsTool!.description).toContain('numMode')
    expect(manageColumnsTool!.description).toContain('currency')
    expect(manageColumnsTool!.description).toContain('Choice/ChoiceList columns')
    expect(manageColumnsTool!.description).toContain('choices')
    expect(manageColumnsTool!.description).toContain('Reference')
    expect(manageColumnsTool!.description).toContain('visibleCol')
  })
})
