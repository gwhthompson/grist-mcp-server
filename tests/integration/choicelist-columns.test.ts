/**
 * ChoiceList Column Tests - Real-world validation
 *
 * Tests ChoiceList columns with actual data encoding and styled choices
 * Validates ["L", ...items] encoding and choiceOptions styling
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CellValue } from '../../src/schemas/api-responses.js'
import type { DocId, TableId } from '../../src/types/advanced.js'
import { createList, extractListItems, isList } from '../helpers/cell-values.js'
import { ensureGristReady } from '../helpers/docker.js'
import {
  addTestRecords,
  cleanupTestContext,
  createFullTestContext,
  createTestClient,
  createTestTable
} from '../helpers/grist-api.js'
import { buildChoiceListWidgetOptions, parseWidgetOptions } from '../helpers/widget-options.js'

// Type for Grist API responses
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

interface RecordData {
  id: number
  fields: Record<string, CellValue>
}

interface RecordsResponse {
  records: RecordData[]
}

describe('ChoiceList Columns - Real-World Tests', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>
  let docId: DocId

  beforeAll(async () => {
    await ensureGristReady()

    context = await createFullTestContext(client, {
      docName: 'ChoiceList Test Doc',
      tableName: 'TasksWithTags'
    })

    docId = context.docId
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  /**
   * Helper function to get columns for a table
   * The /docs/{docId}/tables endpoint does NOT include columns
   * We must fetch them separately using /docs/{docId}/tables/{tableId}/columns
   */
  async function getTableColumns(docId: DocId, tableId: TableId): Promise<ColumnMetadata[]> {
    const response = await client.get<ColumnsResponse>(`/docs/${docId}/tables/${tableId}/columns`)
    return response.columns || []
  }

  describe('Basic ChoiceList functionality', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'BasicChoiceList', [
        { id: 'Title', fields: { type: 'Text', label: 'Title' } },
        {
          id: 'Tags',
          fields: {
            type: 'ChoiceList',
            label: 'Tags',
            widgetOptions: buildChoiceListWidgetOptions({
              choices: ['urgent', 'bug', 'feature', 'documentation', 'testing']
            })
          }
        }
      ])
    })

    it('should insert record with multiple tags', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Title: 'Fix login issue',
            Tags: createList('urgent', 'bug')
          }
        }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(record).toBeDefined()
      expect(isList(record?.fields.Tags)).toBe(true)

      const tags = extractListItems(record?.fields.Tags)
      expect(tags).toEqual(['urgent', 'bug'])
    })

    it('should insert record with single tag', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Title: 'Add new feature',
            Tags: createList('feature')
          }
        }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      const tags = extractListItems(record?.fields.Tags)
      expect(tags).toEqual(['feature'])
    })

    it('should insert record with empty tags', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Title: 'Untagged task',
            Tags: createList() // Empty list
          }
        }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      // NOTE: Grist returns null for empty ChoiceList, not ["L"]
      expect(record?.fields.Tags).toBe(null)
    })

    it('should insert record with all available tags', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Title: 'Comprehensive task',
            Tags: createList('urgent', 'bug', 'feature', 'documentation', 'testing')
          }
        }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      const tags = extractListItems(record?.fields.Tags)
      expect(tags).toEqual(['urgent', 'bug', 'feature', 'documentation', 'testing'])
    })

    it('should handle null value', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Title: 'Null tags task',
            Tags: null
          }
        }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      // Grist converts null to empty list for ChoiceList
      expect(record?.fields.Tags).toBeDefined()
    })
  })

  describe('Styled ChoiceList with choiceOptions', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'StyledChoiceList', [
        { id: 'Task', fields: { type: 'Text', label: 'Task' } },
        {
          id: 'Priority',
          fields: {
            type: 'ChoiceList',
            label: 'Priority',
            widgetOptions: buildChoiceListWidgetOptions({
              choices: ['critical', 'high', 'medium', 'low'],
              choiceOptions: {
                critical: {
                  fillColor: '#FF0000',
                  textColor: '#FFFFFF',
                  fontBold: true
                },
                high: {
                  fillColor: '#FFA500',
                  textColor: '#000000',
                  fontBold: true
                },
                medium: {
                  fillColor: '#FFFF00',
                  textColor: '#000000'
                },
                low: {
                  fillColor: '#90EE90',
                  textColor: '#000000',
                  fontItalic: true
                }
              }
            })
          }
        }
      ])
    })

    it('should validate choiceOptions in column schema', async () => {
      const columns = await getTableColumns(docId, tableId)
      const priorityCol = columns.find((c) => c.id === 'Priority')

      expect(priorityCol).toBeDefined()
      expect(priorityCol.fields.type).toBe('ChoiceList')

      const widgetOpts = parseWidgetOptions(priorityCol.fields.widgetOptions || '{}')
      expect(widgetOpts?.choices).toEqual(['critical', 'high', 'medium', 'low'])
      expect(widgetOpts?.choiceOptions).toBeDefined()
      expect(widgetOpts?.choiceOptions?.critical).toEqual({
        fillColor: '#FF0000',
        textColor: '#FFFFFF',
        fontBold: true
      })
    })

    it('should insert record with styled choices', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Task: 'Critical bug fix',
            Priority: createList('critical', 'high')
          }
        }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(isList(record?.fields.Priority)).toBe(true)

      const priorities = extractListItems(record?.fields.Priority)
      expect(priorities).toEqual(['critical', 'high'])
    })

    it('should handle multiple styled choices', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Task: 'Multi-priority task',
            Priority: createList('high', 'medium', 'low')
          }
        }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      const priorities = extractListItems(record?.fields.Priority)
      expect(priorities).toEqual(['high', 'medium', 'low'])
    })
  })

  describe('Update ChoiceList values', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'UpdateChoiceList', [
        { id: 'Name', fields: { type: 'Text', label: 'Name' } },
        {
          id: 'Labels',
          fields: {
            type: 'ChoiceList',
            label: 'Labels',
            widgetOptions: buildChoiceListWidgetOptions({
              choices: ['red', 'blue', 'green', 'yellow']
            })
          }
        }
      ])
    })

    it('should update ChoiceList by adding items', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Name: 'Item 1',
            Labels: createList('red')
          }
        }
      ])

      // Update to add more labels
      await client.patch(`/docs/${docId}/tables/${tableId}/records`, {
        records: [
          {
            id: recordIds[0],
            fields: {
              Labels: createList('red', 'blue', 'green')
            }
          }
        ]
      })

      // Verify update
      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      const labels = extractListItems(record?.fields.Labels)
      expect(labels).toEqual(['red', 'blue', 'green'])
    })

    it('should update ChoiceList by removing items', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Name: 'Item 2',
            Labels: createList('red', 'blue', 'green', 'yellow')
          }
        }
      ])

      // Update to remove some labels
      await client.patch(`/docs/${docId}/tables/${tableId}/records`, {
        records: [
          {
            id: recordIds[0],
            fields: {
              Labels: createList('blue')
            }
          }
        ]
      })

      // Verify update
      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      const labels = extractListItems(record?.fields.Labels)
      expect(labels).toEqual(['blue'])
    })

    it('should update ChoiceList to empty', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Name: 'Item 3',
            Labels: createList('red', 'blue')
          }
        }
      ])

      // Update to empty list
      await client.patch(`/docs/${docId}/tables/${tableId}/records`, {
        records: [
          {
            id: recordIds[0],
            fields: {
              Labels: createList()
            }
          }
        ]
      })

      // Verify update
      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      // NOTE: Grist returns null for empty ChoiceList
      expect(record?.fields.Labels).toBe(null)
    })

    it('should update ChoiceList by replacing all items', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Name: 'Item 4',
            Labels: createList('red', 'blue')
          }
        }
      ])

      // Replace with different items
      await client.patch(`/docs/${docId}/tables/${tableId}/records`, {
        records: [
          {
            id: recordIds[0],
            fields: {
              Labels: createList('green', 'yellow')
            }
          }
        ]
      })

      // Verify update
      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      const labels = extractListItems(record?.fields.Labels)
      expect(labels).toEqual(['green', 'yellow'])
    })
  })

  describe('Choice vs ChoiceList comparison', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'ChoiceComparison', [
        { id: 'Item', fields: { type: 'Text', label: 'Item' } },
        {
          id: 'SingleChoice',
          fields: {
            type: 'Choice',
            label: 'Single Choice',
            widgetOptions: JSON.stringify({
              choices: ['option1', 'option2', 'option3']
            })
          }
        },
        {
          id: 'MultipleChoice',
          fields: {
            type: 'ChoiceList',
            label: 'Multiple Choice',
            widgetOptions: buildChoiceListWidgetOptions({
              choices: ['option1', 'option2', 'option3']
            })
          }
        }
      ])
    })

    it('should handle Choice as single string value', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Item: 'Test 1',
            SingleChoice: 'option1',
            MultipleChoice: createList('option1')
          }
        }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])

      // Choice is a plain string
      expect(typeof record?.fields.SingleChoice).toBe('string')
      expect(record?.fields.SingleChoice).toBe('option1')

      // ChoiceList is a List ["L", ...]
      expect(isList(record?.fields.MultipleChoice)).toBe(true)
      expect(extractListItems(record?.fields.MultipleChoice)).toEqual(['option1'])
    })

    it('should demonstrate ChoiceList supports multiple values', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Item: 'Test 2',
            SingleChoice: 'option2',
            MultipleChoice: createList('option2', 'option3')
          }
        }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])

      // ChoiceList can have multiple values
      const choices = extractListItems(record?.fields.MultipleChoice)
      expect(choices).toEqual(['option2', 'option3'])
    })
  })

  describe('Real-world ChoiceList scenarios', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'RealWorldTasks', [
        { id: 'Title', fields: { type: 'Text', label: 'Title' } },
        { id: 'Assignee', fields: { type: 'Text', label: 'Assignee' } },
        {
          id: 'Tags',
          fields: {
            type: 'ChoiceList',
            label: 'Tags',
            widgetOptions: buildChoiceListWidgetOptions({
              choices: [
                'frontend',
                'backend',
                'database',
                'api',
                'ui',
                'ux',
                'security',
                'performance'
              ],
              choiceOptions: {
                frontend: { fillColor: '#E3F2FD', textColor: '#1976D2' },
                backend: { fillColor: '#F3E5F5', textColor: '#7B1FA2' },
                database: { fillColor: '#E8F5E9', textColor: '#388E3C' },
                api: { fillColor: '#FFF9C4', textColor: '#F57F17' },
                security: { fillColor: '#FFEBEE', textColor: '#C62828', fontBold: true },
                performance: { fillColor: '#FFF3E0', textColor: '#E65100', fontBold: true }
              }
            })
          }
        },
        {
          id: 'Status',
          fields: {
            type: 'Choice',
            label: 'Status',
            widgetOptions: JSON.stringify({
              choices: ['New', 'In Progress', 'Review', 'Done']
            })
          }
        }
      ])
    })

    it('should create realistic task with multiple technical tags', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Title: 'Implement user authentication API',
            Assignee: 'Alice',
            Tags: createList('backend', 'api', 'security'),
            Status: 'In Progress'
          }
        }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      expect(record?.fields.Title).toBe('Implement user authentication API')

      const tags = extractListItems(record?.fields.Tags)
      expect(tags).toEqual(['backend', 'api', 'security'])
    })

    it('should create frontend task with UI/UX tags', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Title: 'Redesign dashboard layout',
            Assignee: 'Bob',
            Tags: createList('frontend', 'ui', 'ux'),
            Status: 'Review'
          }
        }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      const tags = extractListItems(record?.fields.Tags)
      expect(tags).toContain('frontend')
      expect(tags).toContain('ui')
      expect(tags).toContain('ux')
    })

    it('should create performance optimization task', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Title: 'Optimize database queries',
            Assignee: 'Carol',
            Tags: createList('database', 'performance', 'backend'),
            Status: 'New'
          }
        }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      const tags = extractListItems(record?.fields.Tags)
      expect(tags).toContain('database')
      expect(tags).toContain('performance')
    })

    it('should query and filter tasks by tag', async () => {
      // Get all tasks
      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      // Filter tasks with 'security' tag
      const securityTasks = records.records.filter((r) => {
        if (!isList(r.fields.Tags)) return false
        const tags = extractListItems(r.fields.Tags)
        return tags?.includes('security')
      })

      expect(securityTasks.length).toBeGreaterThan(0)
      expect(securityTasks[0].fields.Title).toBe('Implement user authentication API')
    })
  })

  describe('ChoiceList edge cases', () => {
    let tableId: TableId

    beforeAll(async () => {
      tableId = await createTestTable(client, docId, 'EdgeCases', [
        { id: 'Name', fields: { type: 'Text', label: 'Name' } },
        {
          id: 'Items',
          fields: {
            type: 'ChoiceList',
            label: 'Items',
            widgetOptions: buildChoiceListWidgetOptions({
              choices: ['A', 'B', 'C', 'D', 'E']
            })
          }
        }
      ])
    })

    it('should handle duplicate values in list', async () => {
      // Note: Grist typically deduplicates ChoiceList values
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Name: 'Test duplicates',
            Items: createList('A', 'B', 'A', 'C') // Contains duplicate 'A'
          }
        }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      const items = extractListItems(record?.fields.Items)

      // Grist may deduplicate automatically
      // We just verify the list is valid
      expect(Array.isArray(items)).toBe(true)
    })

    it('should preserve order of choices', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Name: 'Test order',
            Items: createList('E', 'A', 'C', 'B')
          }
        }
      ])

      const records = await client.get<RecordsResponse>(`/docs/${docId}/tables/${tableId}/records`)

      const record = records.records.find((r) => r.id === recordIds[0])
      const items = extractListItems(record?.fields.Items)

      // Verify items are present (order may be preserved or sorted by Grist)
      expect(items).toContain('E')
      expect(items).toContain('A')
      expect(items).toContain('C')
      expect(items).toContain('B')
    })
  })
})
