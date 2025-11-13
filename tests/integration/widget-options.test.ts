/**
 * WidgetOptions Tests for All Column Types
 *
 * TDD approach: Validate widgetOptions against live Grist for all 11 column types
 * Tests both the structure and actual behavior when applied to columns
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TESTING LIMITATION - Widget Options Rendering
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHAT THESE TESTS VERIFY:
 * ✅ Grist API accepts widget options without errors
 * ✅ Widget options are correctly stored in column metadata
 * ✅ Stored values can be retrieved and match exactly what was set
 * ✅ Widget options structure conforms to expected schema
 *
 * WHAT THESE TESTS DO NOT VERIFY:
 * ❌ That Grist UI actually renders these options (colors, fonts, alignment)
 * ❌ That formatted values appear correctly in the interface
 * ❌ That styling is applied to cells as expected
 * ❌ That display modes (currency, percent, etc.) affect visual output
 *
 * FALSE POSITIVE RISK:
 * If Grist stops respecting widgetOptions for display rendering, these tests
 * would still pass. This is an ACCEPTABLE LIMITATION because:
 *
 * 1. Grist API returns raw values, not formatted display strings
 * 2. UI testing requires Selenium/Playwright (high maintenance overhead)
 * 3. Grist is a mature project with reliable widget options implementation
 * 4. MCP evaluation suite (Phase 2) will detect agent-visible UX regressions
 * 5. End-to-end usage testing will catch rendering issues
 *
 * MITIGATION STRATEGY:
 * - Run MCP evaluation suite regularly to catch functional regressions
 * - Manual UI spot-checks for critical styling features
 * - Trust Grist's well-tested widget options rendering
 * - Monitor for Grist API changes that might affect behavior
 *
 * VERIFICATION APPROACH:
 * These tests use a "write → read back → assert exact match" pattern:
 * 1. Create column with specific widget options
 * 2. Retrieve column metadata via API
 * 3. Parse widgetOptions and verify all properties match expected values
 *
 * This verifies API contract and data persistence, which is appropriate for
 * an MCP server that wraps the Grist API.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DocId, WorkspaceId } from '../../src/types/advanced.js'
import { COLUMN_TYPE_FIXTURES, createComprehensiveTable } from '../fixtures/column-types.js'
import { ensureGristReady } from '../helpers/docker.js'
import {
  createTestClient,
  createTestDocument,
  createTestWorkspace,
  deleteDocument,
  deleteWorkspace,
  getFirstOrg
} from '../helpers/grist-api.js'
import {
  buildChoiceWidgetOptions,
  buildNumericWidgetOptions,
  buildTextWidgetOptions,
  COLUMN_TYPE_WIDGET_OPTIONS,
  parseWidgetOptions,
  SAMPLE_WIDGET_OPTIONS,
  validateWidgetOptions
} from '../helpers/widget-options.js'

// Type for Grist columns API response
interface ColumnMetadata {
  id: string
  fields: {
    widgetOptions?: string
    type?: string
    label?: string
    isFormula?: boolean
    formula?: string
    [key: string]: unknown
  }
}

interface ColumnsResponse {
  columns: ColumnMetadata[]
}

describe('WidgetOptions - All 11 Column Types', () => {
  const client = createTestClient()
  let orgId: number
  let workspaceId: WorkspaceId
  let docId: DocId

  beforeAll(async () => {
    await ensureGristReady()

    orgId = await getFirstOrg(client)
    workspaceId = (await createTestWorkspace(client, orgId, 'WidgetOptions Test')) as WorkspaceId
    docId = (await createTestDocument(client, workspaceId, 'WidgetOptions Test Doc')) as DocId
  }, 60000)

  afterAll(async () => {
    if (docId) await deleteDocument(client, docId)
    if (workspaceId) await deleteWorkspace(client, workspaceId)
  })

  describe('WidgetOptions Structure Validation', () => {
    it('should validate all sample widgetOptions are valid JSON', () => {
      for (const [key, value] of Object.entries(SAMPLE_WIDGET_OPTIONS)) {
        expect(validateWidgetOptions(value), `${key} should be valid JSON`).toBe(true)
      }
    })

    it('should parse all sample widgetOptions successfully', () => {
      for (const [key, value] of Object.entries(SAMPLE_WIDGET_OPTIONS)) {
        const parsed = parseWidgetOptions(value)
        expect(parsed, `${key} should parse successfully`).not.toBeNull()
        expect(typeof parsed).toBe('object')
      }
    })

    it('should validate column type specific widgetOptions', () => {
      for (const [type, widgetOptions] of Object.entries(COLUMN_TYPE_WIDGET_OPTIONS)) {
        expect(validateWidgetOptions(widgetOptions), `${type} widgetOptions should be valid`).toBe(
          true
        )
      }
    })
  })

  describe('Text Column WidgetOptions', () => {
    it('should create Text column with basic options', async () => {
      const table = await client.post(`/docs/${docId}/tables`, {
        tables: [
          {
            id: 'TextTest',
            columns: [
              {
                id: 'textBasic',
                fields: {
                  type: 'Text',
                  label: 'Basic Text',
                  widgetOptions: buildTextWidgetOptions({ alignment: 'left' })
                }
              }
            ]
          }
        ]
      })

      expect(table).toBeDefined()

      // Verify column was created with widgetOptions
      const columns = await client.get<ColumnsResponse>(`/docs/${docId}/tables/TextTest/columns`)

      const textColumn = columns.columns.find((c) => c.id === 'textBasic')
      expect(textColumn).toBeDefined()
      expect(textColumn?.fields.widgetOptions).toBeDefined()

      const parsed = parseWidgetOptions(textColumn?.fields.widgetOptions)
      expect(parsed?.alignment).toBe('left')
    })

    it('should create Text column with Markdown widget', async () => {
      await client.post(`/docs/${docId}/tables/TextTest/columns`, {
        columns: [
          {
            id: 'textMarkdown',
            fields: {
              type: 'Text',
              label: 'Markdown Text',
              widgetOptions: buildTextWidgetOptions({ widget: 'Markdown', wrap: true })
            }
          }
        ]
      })

      const columns = await client.get<ColumnsResponse>(`/docs/${docId}/tables/TextTest/columns`)

      const markdownColumn = columns.columns.find((c) => c.id === 'textMarkdown')
      expect(markdownColumn).toBeDefined()

      const parsed = parseWidgetOptions(markdownColumn?.fields.widgetOptions)
      expect(parsed?.widget).toBe('Markdown')
      expect(parsed?.wrap).toBe(true)
    })

    it('should create Text column with styling options', async () => {
      await client.post(`/docs/${docId}/tables/TextTest/columns`, {
        columns: [
          {
            id: 'textStyled',
            fields: {
              type: 'Text',
              label: 'Styled Text',
              widgetOptions: buildTextWidgetOptions({
                fontBold: true,
                fontItalic: true,
                textColor: '#FF0000',
                fillColor: '#FFFF00'
              })
            }
          }
        ]
      })

      const columns = await client.get<ColumnsResponse>(`/docs/${docId}/tables/TextTest/columns`)

      const styledColumn = columns.columns.find((c) => c.id === 'textStyled')
      const parsed = parseWidgetOptions(styledColumn?.fields.widgetOptions)

      expect(parsed?.fontBold).toBe(true)
      expect(parsed?.fontItalic).toBe(true)
      expect(parsed?.textColor).toBe('#FF0000')
      expect(parsed?.fillColor).toBe('#FFFF00')
    })
  })

  describe('Numeric Column WidgetOptions', () => {
    it('should create Numeric column with decimal mode', async () => {
      const _table = await client.post(`/docs/${docId}/tables`, {
        tables: [
          {
            id: 'NumericTest',
            columns: [
              {
                id: 'numDecimal',
                fields: {
                  type: 'Numeric',
                  label: 'Decimal Number',
                  widgetOptions: buildNumericWidgetOptions({ numMode: 'decimal', decimals: 2 })
                }
              }
            ]
          }
        ]
      })

      const columns = await client.get<ColumnsResponse>(`/docs/${docId}/tables/NumericTest/columns`)

      const numColumn = columns.columns.find((c) => c.id === 'numDecimal')
      const parsed = parseWidgetOptions(numColumn?.fields.widgetOptions)

      expect(parsed?.numMode).toBe('decimal')
      expect(parsed?.decimals).toBe(2)
    })

    it('should create Numeric column with currency mode', async () => {
      await client.post(`/docs/${docId}/tables/NumericTest/columns`, {
        columns: [
          {
            id: 'numCurrency',
            fields: {
              type: 'Numeric',
              label: 'Currency',
              widgetOptions: buildNumericWidgetOptions({
                numMode: 'currency',
                currency: 'USD',
                decimals: 2
              })
            }
          }
        ]
      })

      const columns = await client.get<ColumnsResponse>(`/docs/${docId}/tables/NumericTest/columns`)

      const currencyColumn = columns.columns.find((c) => c.id === 'numCurrency')
      const parsed = parseWidgetOptions(currencyColumn?.fields.widgetOptions)

      expect(parsed?.numMode).toBe('currency')
      expect(parsed?.currency).toBe('USD')
      expect(parsed?.decimals).toBe(2)
    })

    it('should create Numeric column with percent mode', async () => {
      await client.post(`/docs/${docId}/tables/NumericTest/columns`, {
        columns: [
          {
            id: 'numPercent',
            fields: {
              type: 'Numeric',
              label: 'Percentage',
              widgetOptions: buildNumericWidgetOptions({ numMode: 'percent', decimals: 1 })
            }
          }
        ]
      })

      const columns = await client.get<ColumnsResponse>(`/docs/${docId}/tables/NumericTest/columns`)

      const percentColumn = columns.columns.find((c) => c.id === 'numPercent')
      const parsed = parseWidgetOptions(percentColumn?.fields.widgetOptions)

      expect(parsed?.numMode).toBe('percent')
      expect(parsed?.decimals).toBe(1)
    })

    it('should create Numeric column with scientific mode', async () => {
      await client.post(`/docs/${docId}/tables/NumericTest/columns`, {
        columns: [
          {
            id: 'numScientific',
            fields: {
              type: 'Numeric',
              label: 'Scientific',
              widgetOptions: buildNumericWidgetOptions({ numMode: 'scientific', maxDecimals: 3 })
            }
          }
        ]
      })

      const columns = await client.get<ColumnsResponse>(`/docs/${docId}/tables/NumericTest/columns`)

      const sciColumn = columns.columns.find((c) => c.id === 'numScientific')
      const parsed = parseWidgetOptions(sciColumn?.fields.widgetOptions)

      expect(parsed?.numMode).toBe('scientific')
      expect(parsed?.maxDecimals).toBe(3)
    })
  })

  describe('Choice Column WidgetOptions', () => {
    it('should create Choice column with simple choices', async () => {
      const _table = await client.post(`/docs/${docId}/tables`, {
        tables: [
          {
            id: 'ChoiceTest',
            columns: [
              {
                id: 'choiceSimple',
                fields: {
                  type: 'Choice',
                  label: 'Simple Choice',
                  widgetOptions: buildChoiceWidgetOptions({
                    choices: ['New', 'In Progress', 'Done']
                  })
                }
              }
            ]
          }
        ]
      })

      const columns = await client.get<ColumnsResponse>(`/docs/${docId}/tables/ChoiceTest/columns`)

      const choiceColumn = columns.columns.find((c) => c.id === 'choiceSimple')
      const parsed = parseWidgetOptions(choiceColumn?.fields.widgetOptions)

      expect(parsed?.choices).toEqual(['New', 'In Progress', 'Done'])
    })

    it('should create Choice column with styled choices', async () => {
      await client.post(`/docs/${docId}/tables/ChoiceTest/columns`, {
        columns: [
          {
            id: 'choiceStyled',
            fields: {
              type: 'Choice',
              label: 'Styled Choice',
              widgetOptions: buildChoiceWidgetOptions({
                choices: ['New', 'Active', 'Archived'],
                choiceOptions: {
                  New: { fillColor: '#90EE90', textColor: '#000000' },
                  Active: { fillColor: '#87CEEB', textColor: '#000000', fontBold: true },
                  Archived: { fillColor: '#D3D3D3', textColor: '#696969', fontItalic: true }
                }
              })
            }
          }
        ]
      })

      const columns = await client.get<ColumnsResponse>(`/docs/${docId}/tables/ChoiceTest/columns`)

      const styledColumn = columns.columns.find((c) => c.id === 'choiceStyled')
      const parsed = parseWidgetOptions(styledColumn?.fields.widgetOptions)

      expect(parsed?.choices).toEqual(['New', 'Active', 'Archived'])
      expect(parsed?.choiceOptions).toBeDefined()
      expect(parsed?.choiceOptions?.New).toMatchObject({
        fillColor: '#90EE90',
        textColor: '#000000'
      })
      expect(parsed?.choiceOptions?.Active).toMatchObject({
        fillColor: '#87CEEB',
        fontBold: true
      })
    })
  })

  describe('All Column Types Integration', () => {
    it('should create comprehensive table with all column types and widgetOptions', async () => {
      const comprehensiveTable = createComprehensiveTable('ComprehensiveTest')

      const table = await client.post(`/docs/${docId}/tables`, {
        tables: [comprehensiveTable]
      })

      expect(table).toBeDefined()

      // Verify all columns were created with proper widgetOptions
      const columns = await client.get<ColumnsResponse>(
        `/docs/${docId}/tables/ComprehensiveTest/columns`
      )

      // Should have all 11 column types + auto-generated id column
      expect(columns.columns.length).toBeGreaterThanOrEqual(11)

      // Verify each column type has widgetOptions
      for (const [_type, fixture] of Object.entries(COLUMN_TYPE_FIXTURES)) {
        const column = columns.columns.find((c) => c.id === fixture.id)
        expect(column, `Column ${fixture.id} should exist`).toBeDefined()

        if (fixture.fields.widgetOptions) {
          expect(
            column?.fields.widgetOptions,
            `${fixture.id} should have widgetOptions`
          ).toBeDefined()
          expect(validateWidgetOptions(column?.fields.widgetOptions)).toBe(true)
        }
      }
    })
  })

  describe('WidgetOptions Edge Cases', () => {
    it('should handle empty widgetOptions', () => {
      const empty = JSON.stringify({})
      expect(validateWidgetOptions(empty)).toBe(true)

      const parsed = parseWidgetOptions(empty)
      expect(parsed).toEqual({})
    })

    it('should reject invalid JSON widgetOptions', () => {
      expect(validateWidgetOptions('not json')).toBe(false)
      expect(validateWidgetOptions('{ invalid json }')).toBe(false)
      expect(validateWidgetOptions('')).toBe(false)
    })

    it('should parse complex nested widgetOptions', () => {
      const complex = JSON.stringify({
        choices: ['a', 'b', 'c'],
        choiceOptions: {
          a: { fillColor: '#FF0000', fontBold: true },
          b: { fillColor: '#00FF00', fontItalic: true }
        },
        alignment: 'center',
        wrap: true
      })

      expect(validateWidgetOptions(complex)).toBe(true)

      const parsed = parseWidgetOptions(complex)
      expect(parsed?.choices).toHaveLength(3)
      expect(parsed?.choiceOptions?.a).toMatchObject({ fillColor: '#FF0000' })
    })
  })

  describe('Python-style Dict Conversion', () => {
    it('should convert Python-style dict with single quotes to valid JSON', () => {
      const pythonDict = "{'widget':'TextBox','alignment':'center','headerFillColor':'#E8D62F'}"
      const parsed = parseWidgetOptions(pythonDict)

      expect(parsed).toBeDefined()
      expect(parsed?.widget).toBe('TextBox')
      expect(parsed?.alignment).toBe('center')
      expect(parsed?.headerFillColor).toBe('#E8D62F')
    })

    it('should handle Python-style dict with boolean values', () => {
      const pythonDict = "{'widget':'TextBox','headerFontBold':true,'headerFontUnderline':false}"
      const parsed = parseWidgetOptions(pythonDict)

      expect(parsed).toBeDefined()
      expect(parsed?.widget).toBe('TextBox')
      expect(parsed?.headerFontBold).toBe(true)
      expect(parsed?.headerFontUnderline).toBe(false)
    })

    it('should handle Python-style dict with array values', () => {
      const pythonDict = "{'choices':['New','In Progress','Complete'],'choiceOptions':{}}"
      const parsed = parseWidgetOptions(pythonDict)

      expect(parsed).toBeDefined()
      expect(parsed?.choices).toEqual(['New', 'In Progress', 'Complete'])
    })

    it('should handle Python-style dict with nested objects', () => {
      const pythonDict = "{'widget':'TextBox','choiceOptions':{'New':{'fillColor':'#FF0000'}}}"
      const parsed = parseWidgetOptions(pythonDict)

      expect(parsed).toBeDefined()
      expect(parsed?.widget).toBe('TextBox')
      expect(parsed?.choiceOptions).toBeDefined()
      expect(parsed?.choiceOptions?.New).toMatchObject({ fillColor: '#FF0000' })
    })

    it('should prefer valid JSON over Python-style conversion', () => {
      // Valid JSON should parse correctly without conversion
      const validJson = '{"widget":"TextBox","alignment":"center"}'
      const parsed = parseWidgetOptions(validJson)

      expect(parsed).toBeDefined()
      expect(parsed?.widget).toBe('TextBox')
      expect(parsed?.alignment).toBe('center')
    })

    it('should return null for unparseable strings', () => {
      const invalid = "{'unclosed': 'bracket'"
      const parsed = parseWidgetOptions(invalid)

      expect(parsed).toBeNull()
    })

    it('should handle mixed quote scenarios that convert successfully', () => {
      // After conversion, this becomes valid JSON
      const pythonDict = "{'widget':'Choice','choices':['Option A','Option B']}"
      const parsed = parseWidgetOptions(pythonDict)

      expect(parsed).toBeDefined()
      expect(parsed?.widget).toBe('Choice')
      expect(parsed?.choices).toEqual(['Option A', 'Option B'])
    })
  })
})
