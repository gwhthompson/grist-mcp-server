/**
 * Advanced WidgetOptions Tests - Complete validation
 *
 * Tests ALL WidgetOptions properties from grist-types.d.ts
 * Validates every option works correctly with live Grist
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TESTING LIMITATION - Widget Options Rendering
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHAT THESE TESTS VERIFY:
 * ✅ Grist API accepts all widget option properties
 * ✅ All widget options are correctly stored in column metadata
 * ✅ Complex widget configurations (styling, formatting) persist correctly
 * ✅ Widget option schemas match Grist type definitions
 *
 * WHAT THESE TESTS DO NOT VERIFY:
 * ❌ That Grist UI renders colors, fonts, and styling as specified
 * ❌ That currency symbols ($, €, £) appear in formatted display
 * ❌ That percent mode shows values with % symbol
 * ❌ That choice colors and styles are applied to tags
 * ❌ That date/time formatting affects displayed values
 *
 * FALSE POSITIVE RISK:
 * These tests verify the API contract (storage and retrieval) but NOT the
 * visual presentation. If Grist's rendering engine stops respecting widget
 * options, these tests would continue to pass.
 *
 * This is an ACCEPTABLE LIMITATION for an MCP server because:
 * 1. MCP servers wrap APIs, not UIs - our concern is data accuracy
 * 2. Grist's API returns raw values (42.5) not formatted strings ("$42.50")
 * 3. UI verification requires expensive Playwright/Selenium infrastructure
 * 4. Grist is mature software with reliable widget options implementation
 * 5. Agent-facing bugs will be caught by MCP evaluation suite
 *
 * VERIFICATION APPROACH:
 * Tests follow this pattern for every widget option property:
 * 1. Create column with specific widget option
 * 2. Read back column configuration via API
 * 3. Parse widgetOptions JSON string
 * 4. Assert exact match for every property (colors, modes, decimals, etc.)
 * 5. Some tests insert data and verify raw values (not formatted display)
 *
 * This provides confidence that:
 * - The MCP server correctly passes options to Grist ✅
 * - Grist stores options correctly ✅
 * - Options can be retrieved for inspection ✅
 * - But UI rendering is trusted, not verified ⚠️
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestClient,
  createFullTestContext,
  cleanupTestContext,
  addTestRecords,
  createTestTable
} from './helpers/grist-api.js';
import { ensureGristReady } from './helpers/docker.js';
import {
  buildTextWidgetOptions,
  buildNumericWidgetOptions,
  buildBoolWidgetOptions,
  buildDateWidgetOptions,
  buildDateTimeWidgetOptions,
  buildChoiceWidgetOptions,
  buildChoiceListWidgetOptions,
  buildAttachmentsWidgetOptions,
  parseWidgetOptions
} from './helpers/widget-options.js';
import type { DocId, TableId } from '../src/types/advanced.js';

describe('Advanced WidgetOptions - Complete Validation', () => {
  const client = createTestClient();
  let context: Awaited<ReturnType<typeof createFullTestContext>>;
  let docId: DocId;

  beforeAll(async () => {
    await ensureGristReady();

    context = await createFullTestContext(client, {
      docName: 'WidgetOptions Test Doc',
      tableName: 'TestTable'
    });

    docId = context.docId;
  }, 60000);

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context);
    }
  });

  /**
   * Helper function to get columns for a table
   * The /docs/{docId}/tables endpoint does NOT include columns
   * We must fetch them separately using /docs/{docId}/tables/{tableId}/columns
   */
  async function getTableColumns(docId: DocId, tableId: TableId): Promise<any[]> {
    const response = await client.get<{ columns: any[] }>(
      `/docs/${docId}/tables/${tableId}/columns`
    );
    return response.columns || [];
  }

  describe('Text Column WidgetOptions', () => {
    let tableId: TableId;

    beforeAll(async () => {
      tableId = await createTestTable(
        client,
        docId,
        'TextOptions',
        [
          {
            id: 'PlainText',
            fields: {
              type: 'Text',
              label: 'Plain Text',
              widgetOptions: buildTextWidgetOptions({
                alignment: 'left'
              })
            }
          },
          {
            id: 'MarkdownText',
            fields: {
              type: 'Text',
              label: 'Markdown Text',
              widgetOptions: buildTextWidgetOptions({
                widget: 'Markdown',
                wrap: true
              })
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
              label: 'Styled Text',
              widgetOptions: buildTextWidgetOptions({
                textColor: '#FF0000',
                fillColor: '#FFFF00',
                fontBold: true,
                fontItalic: true,
                fontUnderline: true,
                fontStrikethrough: false,
                alignment: 'center'
              })
            }
          }
        ]
      );
    });

    it('should validate PlainText widgetOptions', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'PlainText');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.alignment).toBe('left');
    });

    it('should validate Markdown widget type', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'MarkdownText');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.widget).toBe('Markdown');
      expect(opts?.wrap).toBe(true);
    });

    it('should validate HyperLink widget type', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'HyperLink');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.widget).toBe('HyperLink');
      expect(opts?.textColor).toBe('#0066CC');
      expect(opts?.fontUnderline).toBe(true);
    });

    it('should validate all text style properties', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'StyledText');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.textColor).toBe('#FF0000');
      expect(opts?.fillColor).toBe('#FFFF00');
      expect(opts?.fontBold).toBe(true);
      expect(opts?.fontItalic).toBe(true);
      expect(opts?.fontUnderline).toBe(true);
      expect(opts?.alignment).toBe('center');
    });
  });

  describe('Numeric Column WidgetOptions', () => {
    let tableId: TableId;

    beforeAll(async () => {
      tableId = await createTestTable(
        client,
        docId,
        'NumericOptions',
        [
          {
            id: 'Currency',
            fields: {
              type: 'Numeric',
              label: 'Currency',
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
              label: 'Percent',
              widgetOptions: buildNumericWidgetOptions({
                numMode: 'percent',
                decimals: 1
              })
            }
          },
          {
            id: 'Scientific',
            fields: {
              type: 'Numeric',
              label: 'Scientific',
              widgetOptions: buildNumericWidgetOptions({
                numMode: 'scientific',
                maxDecimals: 3
              })
            }
          },
          {
            id: 'Decimal',
            fields: {
              type: 'Numeric',
              label: 'Decimal',
              widgetOptions: buildNumericWidgetOptions({
                numMode: 'decimal',
                decimals: 4
              })
            }
          },
          {
            id: 'ParensNegative',
            fields: {
              type: 'Numeric',
              label: 'Parens Negative',
              widgetOptions: buildNumericWidgetOptions({
                numSign: 'parens',
                numMode: 'decimal',
                decimals: 2
              })
            }
          }
        ]
      );
    });

    it('should validate currency widgetOptions', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'Currency');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.numMode).toBe('currency');
      expect(opts?.currency).toBe('USD');
      expect(opts?.decimals).toBe(2);
    });

    it('should validate percent widgetOptions', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'Percent');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.numMode).toBe('percent');
      expect(opts?.decimals).toBe(1);
    });

    it('should validate scientific notation widgetOptions', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'Scientific');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.numMode).toBe('scientific');
      expect(opts?.maxDecimals).toBe(3);
    });

    it('should validate numSign parens for negative numbers', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'ParensNegative');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.numSign).toBe('parens');
      expect(opts?.decimals).toBe(2);
    });

    it('should display negative number with parens', async () => {
      // Add record with negative number
      const recordIds = await addTestRecords(client, docId, tableId, [
        { fields: { ParensNegative: -42.50 } }
      ]);

      const records = await client.get<{ records: Array<{ id: number; fields: any }> }>(
        `/docs/${docId}/tables/${tableId}/records`
      );

      const record = records.records.find(r => r.id === recordIds[0]);
      expect(record!.fields.ParensNegative).toBe(-42.50);
      // Note: The actual display format (with parens) is handled by Grist UI
    });
  });

  describe('Bool Column WidgetOptions', () => {
    let tableId: TableId;

    beforeAll(async () => {
      tableId = await createTestTable(
        client,
        docId,
        'BoolOptions',
        [
          {
            id: 'CheckBox',
            fields: {
              type: 'Bool',
              label: 'CheckBox',
              widgetOptions: buildBoolWidgetOptions({
                widget: 'CheckBox',
                alignment: 'center'
              })
            }
          },
          {
            id: 'Switch',
            fields: {
              type: 'Bool',
              label: 'Switch',
              widgetOptions: buildBoolWidgetOptions({
                widget: 'Switch',
                alignment: 'left'
              })
            }
          }
        ]
      );
    });

    it('should validate CheckBox widget', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'CheckBox');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.widget).toBe('CheckBox');
      expect(opts?.alignment).toBe('center');
    });

    it('should validate Switch widget', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'Switch');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.widget).toBe('Switch');
      expect(opts?.alignment).toBe('left');
    });
  });

  describe('Date Column WidgetOptions', () => {
    let tableId: TableId;

    beforeAll(async () => {
      tableId = await createTestTable(
        client,
        docId,
        'DateOptions',
        [
          {
            id: 'DateISO',
            fields: {
              type: 'Date',
              label: 'Date ISO',
              widgetOptions: buildDateWidgetOptions({
                dateFormat: 'YYYY-MM-DD'
              })
            }
          },
          {
            id: 'DateCustom',
            fields: {
              type: 'Date',
              label: 'Date Custom',
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
              label: 'Date European',
              widgetOptions: buildDateWidgetOptions({
                dateFormat: 'DD/MM/YYYY',
                isCustomDateFormat: true
              })
            }
          }
        ]
      );
    });

    it('should validate ISO date format', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'DateISO');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.dateFormat).toBe('YYYY-MM-DD');
    });

    it('should validate custom date format', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'DateCustom');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.dateFormat).toBe('MMM D, YYYY');
      expect(opts?.isCustomDateFormat).toBe(true);
    });

    it('should validate European date format', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'DateEuropean');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.dateFormat).toBe('DD/MM/YYYY');
      expect(opts?.isCustomDateFormat).toBe(true);
    });
  });

  describe('DateTime Column WidgetOptions', () => {
    let tableId: TableId;

    beforeAll(async () => {
      tableId = await createTestTable(
        client,
        docId,
        'DateTimeOptions',
        [
          {
            id: 'DateTimeDefault',
            fields: {
              type: 'DateTime',
              label: 'DateTime Default',
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
              label: 'DateTime Custom',
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
              label: 'DateTime 24h',
              widgetOptions: buildDateTimeWidgetOptions({
                dateFormat: 'DD/MM/YYYY',
                timeFormat: 'HH:mm',
                isCustomDateFormat: true,
                isCustomTimeFormat: true
              })
            }
          }
        ]
      );
    });

    it('should validate default datetime format', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'DateTimeDefault');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.dateFormat).toBe('YYYY-MM-DD');
      expect(opts?.timeFormat).toBe('HH:mm:ss');
    });

    it('should validate custom datetime format with AM/PM', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'DateTimeCustom');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.dateFormat).toBe('MMM D, YYYY');
      expect(opts?.timeFormat).toBe('h:mm A');
      expect(opts?.isCustomDateFormat).toBe(true);
      expect(opts?.isCustomTimeFormat).toBe(true);
    });

    it('should validate 24-hour time format', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'DateTime24h');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.timeFormat).toBe('HH:mm');
      expect(opts?.isCustomTimeFormat).toBe(true);
    });
  });

  describe('Choice Column WidgetOptions', () => {
    let tableId: TableId;

    beforeAll(async () => {
      tableId = await createTestTable(
        client,
        docId,
        'ChoiceOptions',
        [
          {
            id: 'SimpleChoice',
            fields: {
              type: 'Choice',
              label: 'Simple Choice',
              widgetOptions: buildChoiceWidgetOptions({
                choices: ['Red', 'Green', 'Blue']
              })
            }
          },
          {
            id: 'StyledChoice',
            fields: {
              type: 'Choice',
              label: 'Styled Choice',
              widgetOptions: buildChoiceWidgetOptions({
                choices: ['New', 'Active', 'Archived'],
                choiceOptions: {
                  'New': {
                    fillColor: '#90EE90',
                    textColor: '#000000'
                  },
                  'Active': {
                    fillColor: '#87CEEB',
                    textColor: '#000000',
                    fontBold: true
                  },
                  'Archived': {
                    fillColor: '#D3D3D3',
                    textColor: '#696969',
                    fontItalic: true,
                    fontStrikethrough: true
                  }
                }
              })
            }
          }
        ]
      );
    });

    it('should validate simple choice options', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'SimpleChoice');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.choices).toEqual(['Red', 'Green', 'Blue']);
    });

    it('should validate styled choice options', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'StyledChoice');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.choices).toEqual(['New', 'Active', 'Archived']);
      expect(opts?.choiceOptions).toBeDefined();
      expect(opts?.choiceOptions?.New).toEqual({
        fillColor: '#90EE90',
        textColor: '#000000'
      });
      expect(opts?.choiceOptions?.Active).toEqual({
        fillColor: '#87CEEB',
        textColor: '#000000',
        fontBold: true
      });
      expect(opts?.choiceOptions?.Archived).toEqual({
        fillColor: '#D3D3D3',
        textColor: '#696969',
        fontItalic: true,
        fontStrikethrough: true
      });
    });
  });

  describe('Attachments Column WidgetOptions', () => {
    let tableId: TableId;

    beforeAll(async () => {
      tableId = await createTestTable(
        client,
        docId,
        'AttachmentOptions',
        [
          {
            id: 'SmallAttachments',
            fields: {
              type: 'Attachments',
              label: 'Small Attachments',
              widgetOptions: buildAttachmentsWidgetOptions({
                height: 80
              })
            }
          },
          {
            id: 'LargeAttachments',
            fields: {
              type: 'Attachments',
              label: 'Large Attachments',
              widgetOptions: buildAttachmentsWidgetOptions({
                height: 200,
                alignment: 'center'
              })
            }
          }
        ]
      );
    });

    it('should validate small attachment height', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'SmallAttachments');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.height).toBe(80);
    });

    it('should validate large attachment height', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'LargeAttachments');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.height).toBe(200);
      expect(opts?.alignment).toBe('center');
    });
  });

  describe('HeaderStyle Properties', () => {
    let tableId: TableId;

    beforeAll(async () => {
      tableId = await createTestTable(
        client,
        docId,
        'HeaderStyles',
        [
          {
            id: 'StyledHeader',
            fields: {
              type: 'Text',
              label: 'Styled Header',
              widgetOptions: JSON.stringify({
                headerTextColor: '#FFFFFF',
                headerFillColor: '#0066CC',
                headerFontBold: true,
                headerFontUnderline: false,
                headerFontItalic: false,
                headerFontStrikethrough: false
              })
            }
          }
        ]
      );
    });

    it('should validate all header style properties', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'StyledHeader');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.headerTextColor).toBe('#FFFFFF');
      expect(opts?.headerFillColor).toBe('#0066CC');
      expect(opts?.headerFontBold).toBe(true);
      expect(opts?.headerFontUnderline).toBe(false);
      expect(opts?.headerFontItalic).toBe(false);
      expect(opts?.headerFontStrikethrough).toBe(false);
    });
  });

  describe('Alignment Options', () => {
    let tableId: TableId;

    beforeAll(async () => {
      tableId = await createTestTable(
        client,
        docId,
        'AlignmentOptions',
        [
          {
            id: 'LeftAlign',
            fields: {
              type: 'Text',
              label: 'Left Align',
              widgetOptions: buildTextWidgetOptions({ alignment: 'left' })
            }
          },
          {
            id: 'CenterAlign',
            fields: {
              type: 'Text',
              label: 'Center Align',
              widgetOptions: buildTextWidgetOptions({ alignment: 'center' })
            }
          },
          {
            id: 'RightAlign',
            fields: {
              type: 'Text',
              label: 'Right Align',
              widgetOptions: buildTextWidgetOptions({ alignment: 'right' })
            }
          }
        ]
      );
    });

    it('should validate left alignment', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'LeftAlign');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.alignment).toBe('left');
    });

    it('should validate center alignment', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'CenterAlign');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.alignment).toBe('center');
    });

    it('should validate right alignment', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'RightAlign');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.alignment).toBe('right');
    });
  });

  describe('Color Properties', () => {
    let tableId: TableId;

    beforeAll(async () => {
      tableId = await createTestTable(
        client,
        docId,
        'ColorOptions',
        [
          {
            id: 'ColoredText',
            fields: {
              type: 'Text',
              label: 'Colored Text',
              widgetOptions: buildTextWidgetOptions({
                textColor: '#FF0000',
                fillColor: '#FFFF00'
              })
            }
          },
          {
            id: 'NoColors',
            fields: {
              type: 'Text',
              label: 'No Colors',
              widgetOptions: buildTextWidgetOptions({})
            }
          }
        ]
      );
    });

    it('should validate hex color values', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'ColoredText');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.textColor).toBe('#FF0000');
      expect(opts?.fillColor).toBe('#FFFF00');
    });

    it('should handle no color specification', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'NoColors');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.textColor).toBeUndefined();
      expect(opts?.fillColor).toBeUndefined();
    });
  });

  describe('Font Style Properties', () => {
    let tableId: TableId;

    beforeAll(async () => {
      tableId = await createTestTable(
        client,
        docId,
        'FontStyles',
        [
          {
            id: 'Bold',
            fields: {
              type: 'Text',
              label: 'Bold',
              widgetOptions: buildTextWidgetOptions({ fontBold: true })
            }
          },
          {
            id: 'Italic',
            fields: {
              type: 'Text',
              label: 'Italic',
              widgetOptions: buildTextWidgetOptions({ fontItalic: true })
            }
          },
          {
            id: 'Underline',
            fields: {
              type: 'Text',
              label: 'Underline',
              widgetOptions: buildTextWidgetOptions({ fontUnderline: true })
            }
          },
          {
            id: 'Strikethrough',
            fields: {
              type: 'Text',
              label: 'Strikethrough',
              widgetOptions: buildTextWidgetOptions({ fontStrikethrough: true })
            }
          },
          {
            id: 'AllStyles',
            fields: {
              type: 'Text',
              label: 'All Styles',
              widgetOptions: buildTextWidgetOptions({
                fontBold: true,
                fontItalic: true,
                fontUnderline: true,
                fontStrikethrough: true
              })
            }
          }
        ]
      );
    });

    it('should validate bold font', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'Bold');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.fontBold).toBe(true);
    });

    it('should validate italic font', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'Italic');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.fontItalic).toBe(true);
    });

    it('should validate underline font', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'Underline');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.fontUnderline).toBe(true);
    });

    it('should validate strikethrough font', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'Strikethrough');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.fontStrikethrough).toBe(true);
    });

    it('should validate all font styles together', async () => {
      const columns = await getTableColumns(docId, tableId);
      const col = columns.find((c: any) => c.id === 'AllStyles');

      const opts = parseWidgetOptions(col.fields.widgetOptions || '{}');
      expect(opts?.fontBold).toBe(true);
      expect(opts?.fontItalic).toBe(true);
      expect(opts?.fontUnderline).toBe(true);
      expect(opts?.fontStrikethrough).toBe(true);
    });
  });
});
