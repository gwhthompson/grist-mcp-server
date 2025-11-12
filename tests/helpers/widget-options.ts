/**
 * WidgetOptions Builders and Validators
 *
 * Provides type-safe builders for all column types based on WidgetOptions interface
 * from grist-types.d.ts
 */

import type { WidgetOptions } from '../../docs/grist-types.js';

/**
 * Build widgetOptions for Text columns
 */
export function buildTextWidgetOptions(options: {
  widget?: 'TextBox' | 'Markdown' | 'HyperLink';
  alignment?: 'left' | 'center' | 'right';
  wrap?: boolean;
  textColor?: string;
  fillColor?: string;
  fontBold?: boolean;
  fontItalic?: boolean;
  fontUnderline?: boolean;
  fontStrikethrough?: boolean;
} = {}): string {
  const widgetOpts: Partial<WidgetOptions> = {
    widget: options.widget,
    alignment: options.alignment,
    wrap: options.wrap,
    textColor: options.textColor,
    fillColor: options.fillColor,
    fontBold: options.fontBold,
    fontItalic: options.fontItalic,
    fontUnderline: options.fontUnderline,
    fontStrikethrough: options.fontStrikethrough
  };

  return JSON.stringify(removeUndefined(widgetOpts));
}

/**
 * Build widgetOptions for Numeric/Int columns
 */
export function buildNumericWidgetOptions(options: {
  widget?: 'Spinner';
  numMode?: 'currency' | 'decimal' | 'percent' | 'scientific';
  currency?: string;
  numSign?: 'parens' | null;
  decimals?: number;
  maxDecimals?: number;
  alignment?: 'left' | 'center' | 'right';
  textColor?: string;
  fillColor?: string;
} = {}): string {
  const widgetOpts: Partial<WidgetOptions> = {
    widget: options.widget,
    numMode: options.numMode,
    currency: options.currency,
    numSign: options.numSign,
    decimals: options.decimals,
    maxDecimals: options.maxDecimals,
    alignment: options.alignment,
    textColor: options.textColor,
    fillColor: options.fillColor
  };

  return JSON.stringify(removeUndefined(widgetOpts));
}

/**
 * Build widgetOptions for Bool columns
 */
export function buildBoolWidgetOptions(options: {
  widget?: 'CheckBox' | 'Switch';
  alignment?: 'left' | 'center' | 'right';
  textColor?: string;
  fillColor?: string;
} = {}): string {
  const widgetOpts: Partial<WidgetOptions> = {
    widget: options.widget,
    alignment: options.alignment,
    textColor: options.textColor,
    fillColor: options.fillColor
  };

  return JSON.stringify(removeUndefined(widgetOpts));
}

/**
 * Build widgetOptions for Date columns
 */
export function buildDateWidgetOptions(options: {
  dateFormat?: string;
  isCustomDateFormat?: boolean;
  alignment?: 'left' | 'center' | 'right';
  textColor?: string;
  fillColor?: string;
} = {}): string {
  const widgetOpts: Partial<WidgetOptions> = {
    dateFormat: options.dateFormat,
    isCustomDateFormat: options.isCustomDateFormat,
    alignment: options.alignment,
    textColor: options.textColor,
    fillColor: options.fillColor
  };

  return JSON.stringify(removeUndefined(widgetOpts));
}

/**
 * Build widgetOptions for DateTime columns
 */
export function buildDateTimeWidgetOptions(options: {
  dateFormat?: string;
  isCustomDateFormat?: boolean;
  timeFormat?: string;
  isCustomTimeFormat?: boolean;
  alignment?: 'left' | 'center' | 'right';
  textColor?: string;
  fillColor?: string;
} = {}): string {
  const widgetOpts: Partial<WidgetOptions> = {
    dateFormat: options.dateFormat,
    isCustomDateFormat: options.isCustomDateFormat,
    timeFormat: options.timeFormat,
    isCustomTimeFormat: options.isCustomTimeFormat,
    alignment: options.alignment,
    textColor: options.textColor,
    fillColor: options.fillColor
  };

  return JSON.stringify(removeUndefined(widgetOpts));
}

/**
 * Build widgetOptions for Choice columns
 */
export function buildChoiceWidgetOptions(options: {
  choices: string[];
  choiceOptions?: Record<string, {
    textColor?: string;
    fillColor?: string;
    fontBold?: boolean;
    fontItalic?: boolean;
    fontUnderline?: boolean;
    fontStrikethrough?: boolean;
  }>;
  alignment?: 'left' | 'center' | 'right';
  textColor?: string;
  fillColor?: string;
} = { choices: [] }): string {
  const widgetOpts: Partial<WidgetOptions> = {
    choices: options.choices,
    choiceOptions: options.choiceOptions,
    alignment: options.alignment,
    textColor: options.textColor,
    fillColor: options.fillColor
  };

  return JSON.stringify(removeUndefined(widgetOpts));
}

/**
 * Build widgetOptions for ChoiceList columns
 */
export function buildChoiceListWidgetOptions(options: {
  choices: string[];
  choiceOptions?: Record<string, {
    textColor?: string;
    fillColor?: string;
    fontBold?: boolean;
    fontItalic?: boolean;
    fontUnderline?: boolean;
    fontStrikethrough?: boolean;
  }>;
  alignment?: 'left' | 'center' | 'right';
  textColor?: string;
  fillColor?: string;
} = { choices: [] }): string {
  // ChoiceList uses same options as Choice
  return buildChoiceWidgetOptions(options);
}

/**
 * Build widgetOptions for Ref columns
 */
export function buildRefWidgetOptions(options: {
  alignment?: 'left' | 'center' | 'right';
  textColor?: string;
  fillColor?: string;
} = {}): string {
  const widgetOpts: Partial<WidgetOptions> = {
    alignment: options.alignment,
    textColor: options.textColor,
    fillColor: options.fillColor
  };

  return JSON.stringify(removeUndefined(widgetOpts));
}

/**
 * Build widgetOptions for RefList columns
 */
export function buildRefListWidgetOptions(options: {
  alignment?: 'left' | 'center' | 'right';
  textColor?: string;
  fillColor?: string;
} = {}): string {
  // RefList uses same options as Ref
  return buildRefWidgetOptions(options);
}

/**
 * Build widgetOptions for Attachments columns
 */
export function buildAttachmentsWidgetOptions(options: {
  height?: number;
  alignment?: 'left' | 'center' | 'right';
  textColor?: string;
  fillColor?: string;
} = {}): string {
  const widgetOpts: Partial<WidgetOptions> = {
    height: options.height,
    alignment: options.alignment,
    textColor: options.textColor,
    fillColor: options.fillColor
  };

  return JSON.stringify(removeUndefined(widgetOpts));
}

/**
 * Sample widgetOptions for all column types
 */
export const SAMPLE_WIDGET_OPTIONS = {
  // Text variants
  textBasic: buildTextWidgetOptions({ alignment: 'left' }),
  textMarkdown: buildTextWidgetOptions({ widget: 'Markdown', wrap: true }),
  textHyperlink: buildTextWidgetOptions({ widget: 'HyperLink', textColor: '#0066CC' }),
  textStyled: buildTextWidgetOptions({
    fontBold: true,
    fontItalic: true,
    textColor: '#FF0000',
    fillColor: '#FFFF00'
  }),

  // Numeric variants
  numericDecimal: buildNumericWidgetOptions({ numMode: 'decimal', decimals: 2 }),
  numericCurrency: buildNumericWidgetOptions({ numMode: 'currency', currency: 'USD', decimals: 2 }),
  numericPercent: buildNumericWidgetOptions({ numMode: 'percent', decimals: 1 }),
  numericScientific: buildNumericWidgetOptions({ numMode: 'scientific', maxDecimals: 3 }),
  numericParens: buildNumericWidgetOptions({ numSign: 'parens', numMode: 'decimal', decimals: 2 }),

  // Bool variants
  boolCheckbox: buildBoolWidgetOptions({ widget: 'CheckBox', alignment: 'center' }),
  boolSwitch: buildBoolWidgetOptions({ widget: 'Switch', alignment: 'center' }),

  // Date variants
  dateDefault: buildDateWidgetOptions({ dateFormat: 'YYYY-MM-DD' }),
  dateCustom: buildDateWidgetOptions({ dateFormat: 'MMM D, YYYY', isCustomDateFormat: true }),

  // DateTime variants
  dateTimeDefault: buildDateTimeWidgetOptions({ dateFormat: 'YYYY-MM-DD', timeFormat: 'HH:mm:ss' }),
  dateTimeCustom: buildDateTimeWidgetOptions({
    dateFormat: 'MMM D, YYYY',
    timeFormat: 'h:mm A',
    isCustomDateFormat: true,
    isCustomTimeFormat: true
  }),

  // Choice variants
  choiceSimple: buildChoiceWidgetOptions({ choices: ['New', 'In Progress', 'Done'] }),
  choiceStyled: buildChoiceWidgetOptions({
    choices: ['New', 'Active', 'Archived'],
    choiceOptions: {
      'New': { fillColor: '#90EE90', textColor: '#000000' },
      'Active': { fillColor: '#87CEEB', textColor: '#000000', fontBold: true },
      'Archived': { fillColor: '#D3D3D3', textColor: '#696969', fontItalic: true }
    }
  }),

  // ChoiceList variants
  choiceListSimple: buildChoiceListWidgetOptions({ choices: ['tag1', 'tag2', 'tag3'] }),
  choiceListStyled: buildChoiceListWidgetOptions({
    choices: ['urgent', 'important', 'review'],
    choiceOptions: {
      'urgent': { fillColor: '#FF0000', textColor: '#FFFFFF', fontBold: true },
      'important': { fillColor: '#FFA500', textColor: '#000000' },
      'review': { fillColor: '#ADD8E6', textColor: '#000000' }
    }
  }),

  // Ref/RefList
  refBasic: buildRefWidgetOptions({ alignment: 'left' }),
  refListBasic: buildRefListWidgetOptions({ alignment: 'left' }),

  // Attachments
  attachmentsBasic: buildAttachmentsWidgetOptions({ height: 100 }),
  attachmentsLarge: buildAttachmentsWidgetOptions({ height: 200 })
} as const;

/**
 * Validate widgetOptions JSON string
 */
export function validateWidgetOptions(widgetOptionsStr: string): boolean {
  try {
    const parsed = JSON.parse(widgetOptionsStr);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

/**
 * Parse widgetOptions JSON string
 * Supports both valid JSON and Python-style dict strings with single quotes
 */
export function parseWidgetOptions(widgetOptionsStr: string): Partial<WidgetOptions> | null {
  try {
    // First, try parsing as valid JSON
    return JSON.parse(widgetOptionsStr);
  } catch {
    // If that fails, try converting Python-style dict to JSON
    try {
      const jsonString = widgetOptionsStr.replace(/'/g, '"');
      return JSON.parse(jsonString);
    } catch {
      return null;
    }
  }
}

/**
 * Helper to remove undefined values from object
 */
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Column type to widgetOptions mapping for all 11 Grist column types
 */
export const COLUMN_TYPE_WIDGET_OPTIONS = {
  Text: SAMPLE_WIDGET_OPTIONS.textBasic,
  Numeric: SAMPLE_WIDGET_OPTIONS.numericDecimal,
  Int: SAMPLE_WIDGET_OPTIONS.numericDecimal,
  Bool: SAMPLE_WIDGET_OPTIONS.boolCheckbox,
  Date: SAMPLE_WIDGET_OPTIONS.dateDefault,
  DateTime: SAMPLE_WIDGET_OPTIONS.dateTimeDefault,
  Choice: SAMPLE_WIDGET_OPTIONS.choiceSimple,
  ChoiceList: SAMPLE_WIDGET_OPTIONS.choiceListSimple,
  Ref: SAMPLE_WIDGET_OPTIONS.refBasic,
  RefList: SAMPLE_WIDGET_OPTIONS.refListBasic,
  Attachments: SAMPLE_WIDGET_OPTIONS.attachmentsBasic
} as const;
