/**
 * Column Type Fixtures
 *
 * Complete fixtures for all 11 Grist column types with proper widgetOptions.
 * Sample values use Grist REST API format (simple timestamps, ['L', ...] for lists).
 */

import type { CellValue } from '../../src/schemas/api-responses.js'
import {
  buildAttachmentsWidgetOptions,
  buildBoolWidgetOptions,
  buildChoiceListWidgetOptions,
  buildChoiceWidgetOptions,
  buildDateTimeWidgetOptions,
  buildDateWidgetOptions,
  buildNumericWidgetOptions,
  buildRefListWidgetOptions,
  buildRefWidgetOptions,
  buildTextWidgetOptions
} from '../helpers/widget-options.js'

/**
 * Column definition for testing
 */
export interface ColumnFixture {
  id: string
  fields: {
    type: string
    label: string
    widgetOptions?: string
    description?: string
  }
  sampleValues: CellValue[]
}

// Helper functions for API-format values
const apiDate = (timestamp: number) => timestamp
const apiDateTime = (timestamp: number) => timestamp
const apiList = (...items: (string | number)[]) => ['L', ...items] as CellValue
const apiRef = (rowId: number) => rowId
const apiRefList = (...rowIds: number[]) => ['L', ...rowIds] as CellValue

/**
 * Complete fixtures for all 11 Grist column types
 */
export const COLUMN_TYPE_FIXTURES: Record<string, ColumnFixture> = {
  // 1. Text
  text: {
    id: 'textColumn',
    fields: {
      type: 'Text',
      label: 'Text Column',
      widgetOptions: buildTextWidgetOptions({ alignment: 'left' }),
      description: 'Basic text column'
    },
    sampleValues: ['Hello World', 'Multi\nLine\nText', 'Special chars: @#$%^&*()', '', null]
  },

  // 2. Numeric
  numeric: {
    id: 'numericColumn',
    fields: {
      type: 'Numeric',
      label: 'Numeric Column',
      widgetOptions: buildNumericWidgetOptions({ numMode: 'decimal', decimals: 2 }),
      description: 'Numeric column with decimals'
    },
    sampleValues: [42, Math.PI, -100.5, 0, null]
  },

  // 3. Int
  int: {
    id: 'intColumn',
    fields: {
      type: 'Int',
      label: 'Integer Column',
      widgetOptions: buildNumericWidgetOptions({ numMode: 'decimal', decimals: 0 }),
      description: 'Integer column'
    },
    sampleValues: [1, 100, -50, 0, null]
  },

  // 4. Bool
  bool: {
    id: 'boolColumn',
    fields: {
      type: 'Bool',
      label: 'Boolean Column',
      widgetOptions: buildBoolWidgetOptions({ widget: 'CheckBox' }),
      description: 'Boolean column'
    },
    sampleValues: [true, false, true, false, null]
  },

  // 5. Date - API returns plain timestamps
  date: {
    id: 'dateColumn',
    fields: {
      type: 'Date',
      label: 'Date Column',
      widgetOptions: buildDateWidgetOptions({ dateFormat: 'YYYY-MM-DD' }),
      description: 'Date column'
    },
    sampleValues: [
      apiDate(1704844800), // 2024-01-10
      apiDate(1609459200), // 2021-01-01
      apiDate(0), // Epoch
      null,
      apiDate(1735689600) // 2025-01-01
    ]
  },

  // 6. DateTime - API returns plain timestamps
  dateTime: {
    id: 'dateTimeColumn',
    fields: {
      type: 'DateTime:UTC',
      label: 'DateTime Column',
      widgetOptions: buildDateTimeWidgetOptions({
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm:ss'
      }),
      description: 'DateTime column with timezone'
    },
    sampleValues: [
      apiDateTime(1704945919),
      apiDateTime(1609459200),
      apiDateTime(1735689600),
      null,
      apiDateTime(0)
    ]
  },

  // 7. Choice - plain strings
  choice: {
    id: 'choiceColumn',
    fields: {
      type: 'Choice',
      label: 'Choice Column',
      widgetOptions: buildChoiceWidgetOptions({
        choices: ['New', 'In Progress', 'Done', 'Archived'],
        choiceOptions: {
          New: { fillColor: '#90EE90', textColor: '#000000' },
          'In Progress': { fillColor: '#FFD700', textColor: '#000000' },
          Done: { fillColor: '#87CEEB', textColor: '#000000' },
          Archived: { fillColor: '#D3D3D3', textColor: '#696969' }
        }
      }),
      description: 'Single choice column with styling'
    },
    sampleValues: ['New', 'In Progress', 'Done', 'Archived', null]
  },

  // 8. ChoiceList - API uses ['L', ...strings]
  choiceList: {
    id: 'choiceListColumn',
    fields: {
      type: 'ChoiceList',
      label: 'Choice List Column',
      widgetOptions: buildChoiceListWidgetOptions({
        choices: ['tag1', 'tag2', 'tag3', 'tag4'],
        choiceOptions: {
          tag1: { fillColor: '#FF6B6B', textColor: '#FFFFFF' },
          tag2: { fillColor: '#4ECDC4', textColor: '#000000' },
          tag3: { fillColor: '#FFE66D', textColor: '#000000' },
          tag4: { fillColor: '#A8DADC', textColor: '#000000' }
        }
      }),
      description: 'Multiple choice column with styling'
    },
    sampleValues: [
      apiList('tag1'),
      apiList('tag1', 'tag2'),
      apiList('tag2', 'tag3', 'tag4'),
      apiList(), // Empty list = ['L']
      null
    ]
  },

  // 9. Ref - API returns plain row IDs
  ref: {
    id: 'refColumn',
    fields: {
      type: 'Ref:ReferenceTable',
      label: 'Reference Column',
      widgetOptions: buildRefWidgetOptions({ alignment: 'left' }),
      description: 'Reference to another table'
    },
    sampleValues: [apiRef(1), apiRef(2), apiRef(3), null, apiRef(5)]
  },

  // 10. RefList - API uses ['L', ...rowIds]
  refList: {
    id: 'refListColumn',
    fields: {
      type: 'RefList:ReferenceTable',
      label: 'Reference List Column',
      widgetOptions: buildRefListWidgetOptions({ alignment: 'left' }),
      description: 'Reference list to another table'
    },
    sampleValues: [
      apiRefList(1),
      apiRefList(1, 2),
      apiRefList(2, 3, 4),
      apiRefList(), // Empty list = ['L']
      null
    ]
  },

  // 11. Attachments - API uses ['L', ...attachmentIds]
  attachments: {
    id: 'attachmentsColumn',
    fields: {
      type: 'Attachments',
      label: 'Attachments Column',
      widgetOptions: buildAttachmentsWidgetOptions({ height: 100 }),
      description: 'File attachments column'
    },
    sampleValues: [
      apiList(1), // Attachment ID 1
      apiList(2, 3), // Multiple attachments
      apiList(), // No attachments
      null,
      apiList(5, 6, 7) // Multiple attachments
    ]
  }
}

/**
 * Get all column type names
 */
export const ALL_COLUMN_TYPES = Object.keys(COLUMN_TYPE_FIXTURES)

/**
 * Get column fixture by type
 */
export function getColumnFixture(type: keyof typeof COLUMN_TYPE_FIXTURES): ColumnFixture {
  return COLUMN_TYPE_FIXTURES[type]
}

/**
 * Create a reference table for Ref and RefList testing
 */
export const REFERENCE_TABLE_FIXTURE: ColumnFixture = {
  id: 'ReferenceTable',
  fields: {
    type: 'Text',
    label: 'Reference Table'
  },
  sampleValues: ['Ref Item 1', 'Ref Item 2', 'Ref Item 3', 'Ref Item 4', 'Ref Item 5']
}

/**
 * Create records for testing with all column types
 */
export function createSampleRecords(
  numRecords: number = 5
): Array<{ fields: Record<string, CellValue> }> {
  const records: Array<{ fields: Record<string, CellValue> }> = []

  for (let i = 0; i < numRecords; i++) {
    const fields: Record<string, CellValue> = {}

    for (const [_key, fixture] of Object.entries(COLUMN_TYPE_FIXTURES)) {
      // Get the sample value at this index (cycle if needed)
      const sampleValue = fixture.sampleValues[i % fixture.sampleValues.length]
      fields[fixture.id] = sampleValue
    }

    records.push({ fields })
  }

  return records
}

/**
 * Create minimal table definition for testing
 */
export function createMinimalTable(tableId: string = 'TestTable'): {
  id: string
  columns: Array<{ id: string; fields?: Record<string, unknown> }>
} {
  return {
    id: tableId,
    columns: [
      { id: 'name', fields: { type: 'Text', label: 'Name' } },
      { id: 'value', fields: { type: 'Numeric', label: 'Value' } }
    ]
  }
}

/**
 * Create comprehensive table with all column types
 */
export function createComprehensiveTable(tableId: string = 'ComprehensiveTable'): {
  id: string
  columns: Array<{ id: string; fields: Record<string, unknown> }>
} {
  return {
    id: tableId,
    columns: Object.values(COLUMN_TYPE_FIXTURES).map((fixture) => ({
      id: fixture.id,
      fields: fixture.fields
    }))
  }
}
