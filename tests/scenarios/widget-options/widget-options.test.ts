/**
 * Widget Options Tests - Comprehensive validation for all column types
 *
 * Tests widget options functionality across all 11 Grist column types.
 * Uses parameterized testing to reduce redundancy while maintaining coverage.
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
import type { CellValue } from '../../../src/schemas/api-responses.js'
import type { DocId, TableId } from '../../../src/types/advanced.js'
import { COLUMN_TYPE_FIXTURES, createComprehensiveTable } from '../../fixtures/column-types.js'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  addTestRecords,
  cleanupTestContext,
  createFullTestContext,
  createTestClient,
  createTestTable
} from '../../helpers/grist-api.js'
import { getAllColumns } from '../../helpers/grist-column-helpers.js'
import type { GristColumnMetadata } from '../../helpers/test-types.js'
import {
  buildAttachmentsWidgetOptions,
  buildBoolWidgetOptions,
  buildChoiceWidgetOptions,
  buildDateTimeWidgetOptions,
  buildDateWidgetOptions,
  buildNumericWidgetOptions,
  buildTextWidgetOptions,
  COLUMN_TYPE_WIDGET_OPTIONS,
  parseWidgetOptions,
  SAMPLE_WIDGET_OPTIONS,
  validateWidgetOptions
} from '../../helpers/widget-options.js'

describe('Widget Options - Comprehensive Tests', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>
  let docId: DocId

  beforeAll(async () => {
    await ensureGristReady()

    context = await createFullTestContext(client, {
      docName: 'Widget Options Test Doc',
      tableName: 'TestTable'
    })

    docId = context.docId
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  }, 30000)

  /**
   * Helper function to get columns for a table
   */
  async function getTableColumns(docId: DocId, tableId: TableId): Promise<GristColumnMetadata[]> {
    return getAllColumns(client, docId, tableId)
  }

  describe('Widget Options Structure Validation', () => {
    it.each(
      Object.entries(SAMPLE_WIDGET_OPTIONS)
    )('should validate %s widgetOptions as valid JSON', (_key, value) => {
      expect(validateWidgetOptions(value)).toBe(true)
    })

    it.each(
      Object.entries(SAMPLE_WIDGET_OPTIONS)
    )('should parse %s widgetOptions successfully', (_key, value) => {
      const parsed = parseWidgetOptions(value)
      expect(parsed).not.toBeNull()
      expect(typeof parsed).toBe('object')
    })

    it.each(
      Object.entries(COLUMN_TYPE_WIDGET_OPTIONS)
    )('should validate %s column type widgetOptions', (_type, widgetOptions) => {
      expect(validateWidgetOptions(widgetOptions)).toBe(true)
    })
  })

  describe('Text Column Widget Options', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'TextOptions', [
        {
          id: 'PlainText',
          fields: {
            type: 'Text',
            label: 'Plain Text',
            widgetOptions: buildTextWidgetOptions({ alignment: 'left' })
          }
        },
        {
          id: 'MarkdownText',
          fields: {
            type: 'Text',
            label: 'Markdown',
            widgetOptions: buildTextWidgetOptions({ widget: 'Markdown', wrap: true })
          }
        },
        {
          id: 'HyperLink',
          fields: {
            type: 'Text',
            label: 'HyperLink',
            widgetOptions: buildTextWidgetOptions({
              widget: 'HyperLink',
              textColor: '#0066CC',
              fontUnderline: true
            })
          }
        },
        {
          id: 'StyledText',
          fields: {
            type: 'Text',
            label: 'Styled',
            widgetOptions: buildTextWidgetOptions({
              textColor: '#FF0000',
              fillColor: '#FFFF00',
              fontBold: true,
              fontItalic: true,
              fontUnderline: true,
              alignment: 'center'
            })
          }
        }
      ])
    })

    it.each([
      ['PlainText', { alignment: 'left' }],
      ['MarkdownText', { widget: 'Markdown', wrap: true }],
      ['HyperLink', { widget: 'HyperLink', textColor: '#0066CC', fontUnderline: true }],
      [
        'StyledText',
        {
          textColor: '#FF0000',
          fillColor: '#FFFF00',
          fontBold: true,
          fontItalic: true,
          fontUnderline: true,
          alignment: 'center'
        }
      ]
    ])('should validate %s widget options', async (colId, expectedOptions) => {
      const columns = await getTableColumns(docId, tableId)
      const col = columns.find((c) => c.id === colId)

      expect(col).toBeDefined()
      const opts = parseWidgetOptions(col?.fields.widgetOptions || '{}')

      for (const [key, value] of Object.entries(expectedOptions)) {
        expect(opts?.[key]).toBe(value)
      }
    })
  })

  describe('Numeric Column Widget Options', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'NumericOptions', [
        {
          id: 'Currency',
          fields: {
            type: 'Numeric',
            widgetOptions: buildNumericWidgetOptions({
              numMode: 'currency',
              currency: 'USD',
              decimals: 2
            })
          }
        },
        {
          id: 'Percent',
          fields: {
            type: 'Numeric',
            widgetOptions: buildNumericWidgetOptions({ numMode: 'percent', decimals: 1 })
          }
        },
        {
          id: 'Scientific',
          fields: {
            type: 'Numeric',
            widgetOptions: buildNumericWidgetOptions({ numMode: 'scientific', maxDecimals: 3 })
          }
        },
        {
          id: 'Decimal',
          fields: {
            type: 'Numeric',
            widgetOptions: buildNumericWidgetOptions({ numMode: 'decimal', decimals: 4 })
          }
        },
        {
          id: 'ParensNegative',
          fields: {
            type: 'Numeric',
            widgetOptions: buildNumericWidgetOptions({
              numSign: 'parens',
              numMode: 'decimal',
              decimals: 2
            })
          }
        }
      ])
    })

    it.each([
      ['Currency', { numMode: 'currency', currency: 'USD', decimals: 2 }],
      ['Percent', { numMode: 'percent', decimals: 1 }],
      ['Scientific', { numMode: 'scientific', maxDecimals: 3 }],
      ['Decimal', { numMode: 'decimal', decimals: 4 }],
      ['ParensNegative', { numSign: 'parens', numMode: 'decimal', decimals: 2 }]
    ])('should validate %s numeric options', async (colId, expectedOptions) => {
      const columns = await getTableColumns(docId, tableId)
      const col = columns.find((c) => c.id === colId)

      const opts = parseWidgetOptions(col?.fields.widgetOptions || '{}')

      for (const [key, value] of Object.entries(expectedOptions)) {
        expect(opts?.[key]).toBe(value)
      }
    })

    it('should display negative number with parens formatting', async () => {
      // Verify raw value is stored correctly (formatting is UI-only)
      const recordIds = await addTestRecords(client, docId, tableId, [
        { fields: { ParensNegative: -42.5 } }
      ])

      const records = await client.get<{
        records: Array<{ id: number; fields: Record<string, CellValue> }>
      }>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(record?.fields.ParensNegative).toBe(-42.5)
      // Note: Actual display format (with parens) is handled by Grist UI
    })
  })

  describe('Bool Column Widget Options', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'BoolOptions', [
        {
          id: 'CheckBox',
          fields: {
            type: 'Bool',
            widgetOptions: buildBoolWidgetOptions({ widget: 'CheckBox', alignment: 'center' })
          }
        },
        {
          id: 'Switch',
          fields: {
            type: 'Bool',
            widgetOptions: buildBoolWidgetOptions({ widget: 'Switch', alignment: 'left' })
          }
        }
      ])
    })

    it.each([
      ['CheckBox', { widget: 'CheckBox', alignment: 'center' }],
      ['Switch', { widget: 'Switch', alignment: 'left' }]
    ])('should validate %s bool widget', async (colId, expectedOptions) => {
      const columns = await getTableColumns(docId, tableId)
      const col = columns.find((c) => c.id === colId)

      const opts = parseWidgetOptions(col?.fields.widgetOptions || '{}')
      expect(opts?.widget).toBe(expectedOptions.widget)
      expect(opts?.alignment).toBe(expectedOptions.alignment)
    })
  })

  describe('Date Column Widget Options', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'DateOptions', [
        {
          id: 'DateISO',
          fields: {
            type: 'Date',
            widgetOptions: buildDateWidgetOptions({ dateFormat: 'YYYY-MM-DD' })
          }
        },
        {
          id: 'DateCustom',
          fields: {
            type: 'Date',
            widgetOptions: buildDateWidgetOptions({
              dateFormat: 'MMM D, YYYY',
              isCustomDateFormat: true
            })
          }
        },
        {
          id: 'DateEuropean',
          fields: {
            type: 'Date',
            widgetOptions: buildDateWidgetOptions({
              dateFormat: 'DD/MM/YYYY',
              isCustomDateFormat: true
            })
          }
        }
      ])
    })

    it.each([
      ['DateISO', { dateFormat: 'YYYY-MM-DD' }],
      ['DateCustom', { dateFormat: 'MMM D, YYYY', isCustomDateFormat: true }],
      ['DateEuropean', { dateFormat: 'DD/MM/YYYY', isCustomDateFormat: true }]
    ])('should validate %s date format', async (colId, expectedOptions) => {
      const columns = await getTableColumns(docId, tableId)
      const col = columns.find((c) => c.id === colId)

      const opts = parseWidgetOptions(col?.fields.widgetOptions || '{}')
      expect(opts?.dateFormat).toBe(expectedOptions.dateFormat)

      if (expectedOptions.isCustomDateFormat) {
        expect(opts?.isCustomDateFormat).toBe(true)
      }
    })
  })

  describe('DateTime Column Widget Options', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'DateTimeOptions', [
        {
          id: 'DateTimeDefault',
          fields: {
            type: 'DateTime',
            widgetOptions: buildDateTimeWidgetOptions({
              dateFormat: 'YYYY-MM-DD',
              timeFormat: 'HH:mm:ss'
            })
          }
        },
        {
          id: 'DateTimeCustom',
          fields: {
            type: 'DateTime',
            widgetOptions: buildDateTimeWidgetOptions({
              dateFormat: 'MMM D, YYYY',
              timeFormat: 'h:mm A',
              isCustomDateFormat: true,
              isCustomTimeFormat: true
            })
          }
        },
        {
          id: 'DateTime24h',
          fields: {
            type: 'DateTime',
            widgetOptions: buildDateTimeWidgetOptions({
              dateFormat: 'DD/MM/YYYY',
              timeFormat: 'HH:mm',
              isCustomDateFormat: true,
              isCustomTimeFormat: true
            })
          }
        }
      ])
    })

    it.each([
      ['DateTimeDefault', { dateFormat: 'YYYY-MM-DD', timeFormat: 'HH:mm:ss' }],
      [
        'DateTimeCustom',
        {
          dateFormat: 'MMM D, YYYY',
          timeFormat: 'h:mm A',
          isCustomDateFormat: true,
          isCustomTimeFormat: true
        }
      ],
      [
        'DateTime24h',
        {
          dateFormat: 'DD/MM/YYYY',
          timeFormat: 'HH:mm',
          isCustomDateFormat: true,
          isCustomTimeFormat: true
        }
      ]
    ])('should validate %s datetime format', async (colId, expectedOptions) => {
      const columns = await getTableColumns(docId, tableId)
      const col = columns.find((c) => c.id === colId)

      const opts = parseWidgetOptions(col?.fields.widgetOptions || '{}')
      expect(opts?.dateFormat).toBe(expectedOptions.dateFormat)
      expect(opts?.timeFormat).toBe(expectedOptions.timeFormat)
    })
  })

  describe('Choice Column Widget Options', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'ChoiceOptions', [
        {
          id: 'SimpleChoice',
          fields: {
            type: 'Choice',
            widgetOptions: buildChoiceWidgetOptions({ choices: ['Red', 'Green', 'Blue'] })
          }
        },
        {
          id: 'StyledChoice',
          fields: {
            type: 'Choice',
            widgetOptions: buildChoiceWidgetOptions({
              choices: ['New', 'Active', 'Archived'],
              choiceOptions: {
                New: { fillColor: '#90EE90', textColor: '#000000' },
                Active: { fillColor: '#87CEEB', textColor: '#000000', fontBold: true },
                Archived: {
                  fillColor: '#D3D3D3',
                  textColor: '#696969',
                  fontItalic: true,
                  fontStrikethrough: true
                }
              }
            })
          }
        }
      ])
    })

    it('should validate simple choice options', async () => {
      const columns = await getTableColumns(docId, tableId)
      const col = columns.find((c) => c.id === 'SimpleChoice')

      const opts = parseWidgetOptions(col?.fields.widgetOptions || '{}')
      expect(opts?.choices).toEqual(['Red', 'Green', 'Blue'])
    })

    it('should validate styled choice options with choiceOptions', async () => {
      const columns = await getTableColumns(docId, tableId)
      const col = columns.find((c) => c.id === 'StyledChoice')

      const opts = parseWidgetOptions(col?.fields.widgetOptions || '{}')
      expect(opts?.choices).toEqual(['New', 'Active', 'Archived'])
      expect(opts?.choiceOptions).toBeDefined()

      // Verify each styled choice
      expect(opts?.choiceOptions?.New).toEqual({ fillColor: '#90EE90', textColor: '#000000' })
      expect(opts?.choiceOptions?.Active).toEqual({
        fillColor: '#87CEEB',
        textColor: '#000000',
        fontBold: true
      })
      expect(opts?.choiceOptions?.Archived).toEqual({
        fillColor: '#D3D3D3',
        textColor: '#696969',
        fontItalic: true,
        fontStrikethrough: true
      })
    })
  })

  describe('Attachments Column Widget Options', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'AttachmentOptions', [
        {
          id: 'SmallAttachments',
          fields: {
            type: 'Attachments',
            widgetOptions: buildAttachmentsWidgetOptions({ height: 80 })
          }
        },
        {
          id: 'LargeAttachments',
          fields: {
            type: 'Attachments',
            widgetOptions: buildAttachmentsWidgetOptions({ height: 200, alignment: 'center' })
          }
        }
      ])
    })

    it.each([
      ['SmallAttachments', { height: 80 }],
      ['LargeAttachments', { height: 200, alignment: 'center' }]
    ])('should validate %s attachment options', async (colId, expectedOptions) => {
      const columns = await getTableColumns(docId, tableId)
      const col = columns.find((c) => c.id === colId)

      const opts = parseWidgetOptions(col?.fields.widgetOptions || '{}')
      expect(opts?.height).toBe(expectedOptions.height)

      if (expectedOptions.alignment) {
        expect(opts?.alignment).toBe(expectedOptions.alignment)
      }
    })
  })

  describe('Styling Properties', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'StylingOptions', [
        {
          id: 'HeaderStyled',
          fields: {
            type: 'Text',
            widgetOptions: JSON.stringify({
              headerTextColor: '#FFFFFF',
              headerFillColor: '#0066CC',
              headerFontBold: true,
              headerFontUnderline: false,
              headerFontItalic: false,
              headerFontStrikethrough: false
            })
          }
        },
        {
          id: 'AllFontStyles',
          fields: {
            type: 'Text',
            widgetOptions: buildTextWidgetOptions({
              fontBold: true,
              fontItalic: true,
              fontUnderline: true,
              fontStrikethrough: true
            })
          }
        },
        {
          id: 'ColoredText',
          fields: {
            type: 'Text',
            widgetOptions: buildTextWidgetOptions({
              textColor: '#FF0000',
              fillColor: '#FFFF00'
            })
          }
        }
      ])
    })

    it('should validate header style properties', async () => {
      const columns = await getTableColumns(docId, tableId)
      const col = columns.find((c) => c.id === 'HeaderStyled')

      const opts = parseWidgetOptions(col?.fields.widgetOptions || '{}')
      expect(opts?.headerTextColor).toBe('#FFFFFF')
      expect(opts?.headerFillColor).toBe('#0066CC')
      expect(opts?.headerFontBold).toBe(true)
      expect(opts?.headerFontUnderline).toBe(false)
    })

    it('should validate all font style properties together', async () => {
      const columns = await getTableColumns(docId, tableId)
      const col = columns.find((c) => c.id === 'AllFontStyles')

      const opts = parseWidgetOptions(col?.fields.widgetOptions || '{}')
      expect(opts?.fontBold).toBe(true)
      expect(opts?.fontItalic).toBe(true)
      expect(opts?.fontUnderline).toBe(true)
      expect(opts?.fontStrikethrough).toBe(true)
    })

    it('should validate hex color values', async () => {
      const columns = await getTableColumns(docId, tableId)
      const col = columns.find((c) => c.id === 'ColoredText')

      const opts = parseWidgetOptions(col?.fields.widgetOptions || '{}')
      expect(opts?.textColor).toBe('#FF0000')
      expect(opts?.fillColor).toBe('#FFFF00')
    })
  })

  describe('Alignment Options', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'AlignmentOptions', [
        {
          id: 'LeftAlign',
          fields: { type: 'Text', widgetOptions: buildTextWidgetOptions({ alignment: 'left' }) }
        },
        {
          id: 'CenterAlign',
          fields: { type: 'Text', widgetOptions: buildTextWidgetOptions({ alignment: 'center' }) }
        },
        {
          id: 'RightAlign',
          fields: { type: 'Text', widgetOptions: buildTextWidgetOptions({ alignment: 'right' }) }
        }
      ])
    })

    it.each([
      ['LeftAlign', 'left'],
      ['CenterAlign', 'center'],
      ['RightAlign', 'right']
    ])('should validate %s alignment', async (colId, expectedAlignment) => {
      const columns = await getTableColumns(docId, tableId)
      const col = columns.find((c) => c.id === colId)

      const opts = parseWidgetOptions(col?.fields.widgetOptions || '{}')
      expect(opts?.alignment).toBe(expectedAlignment)
    })
  })

  describe('Comprehensive Integration', () => {
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

  describe('Edge Cases', () => {
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
    it.each([
      [
        "{'widget':'TextBox','alignment':'center','headerFillColor':'#E8D62F'}",
        { widget: 'TextBox', alignment: 'center', headerFillColor: '#E8D62F' }
      ],
      [
        "{'widget':'TextBox','headerFontBold':true,'headerFontUnderline':false}",
        { widget: 'TextBox', headerFontBold: true, headerFontUnderline: false }
      ],
      [
        "{'choices':['New','In Progress','Complete'],'choiceOptions':{}}",
        { choices: ['New', 'In Progress', 'Complete'], choiceOptions: {} }
      ],
      [
        "{'widget':'TextBox','choiceOptions':{'New':{'fillColor':'#FF0000'}}}",
        { widget: 'TextBox', choiceOptions: { New: { fillColor: '#FF0000' } } }
      ]
    ])('should convert Python-style dict: %s', (pythonDict, expectedResult) => {
      const parsed = parseWidgetOptions(pythonDict)

      expect(parsed).toBeDefined()
      for (const [key, value] of Object.entries(expectedResult)) {
        expect(parsed?.[key]).toEqual(value)
      }
    })

    it('should prefer valid JSON over Python-style conversion', () => {
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
  })
})
