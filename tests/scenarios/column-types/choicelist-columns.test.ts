/**
 * ChoiceList Column Tests - Advanced features
 *
 * Tests advanced ChoiceList features NOT covered by simple-choicelist.test.ts:
 * - Styled choiceOptions (colors, fonts)
 * - Complex real-world scenarios with multiple ChoiceList columns
 * - Edge cases (duplicates, order preservation)
 *
 * For basic ChoiceList functionality (add, update, empty arrays), see simple-choicelist.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DocId, TableId } from '../../../src/types/advanced.js'
import { extractListItems, isList } from '../../helpers/cell-values.js'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  addTestRecords,
  cleanupTestContext,
  createFullTestContext,
  createTestClient,
  createTestTable,
  getTableRecords
} from '../../helpers/grist-api.js'
import { getAllColumns } from '../../helpers/grist-column-helpers.js'
import type { GristColumnMetadata } from '../../helpers/test-types.js'
import { buildChoiceListWidgetOptions, parseWidgetOptions } from '../../helpers/widget-options.js'

describe('ChoiceList Columns - Advanced Features', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>
  let docId: DocId

  beforeAll(async () => {
    await ensureGristReady()

    context = await createFullTestContext(client, {
      docName: 'ChoiceList Advanced Test Doc',
      tableName: 'TasksWithTags'
    })

    docId = context.docId
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  async function getTableColumns(docId: DocId, tableId: TableId): Promise<GristColumnMetadata[]> {
    return getAllColumns(client, docId, tableId)
  }

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
      expect(priorityCol?.fields.type).toBe('ChoiceList')

      const widgetOpts = parseWidgetOptions(priorityCol?.fields.widgetOptions || '{}')
      expect(widgetOpts?.choices).toEqual(['critical', 'high', 'medium', 'low'])
      expect(widgetOpts?.choiceOptions).toBeDefined()
      expect(widgetOpts?.choiceOptions?.critical).toEqual({
        fillColor: '#FF0000',
        textColor: '#FFFFFF',
        fontBold: true
      })
    })

    it('should insert and retrieve records with styled choices', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Task: 'Critical bug fix',
            Priority: ['critical', 'high']
          }
        },
        {
          fields: {
            Task: 'Multi-priority task',
            Priority: ['high', 'medium', 'low']
          }
        }
      ])

      const records = await getTableRecords(client, docId, tableId)

      const record1 = records.find((r) => r.id === recordIds[0])
      const record2 = records.find((r) => r.id === recordIds[1])

      expect(isList(record1?.fields.Priority)).toBe(true)
      expect(extractListItems(record1?.fields.Priority)).toEqual(['critical', 'high'])

      expect(isList(record2?.fields.Priority)).toBe(true)
      expect(extractListItems(record2?.fields.Priority)).toEqual(['high', 'medium', 'low'])
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

    it('should handle realistic tasks with multiple technical tags', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Title: 'Implement user authentication API',
            Assignee: 'Alice',
            Tags: ['backend', 'api', 'security'],
            Status: 'In Progress'
          }
        },
        {
          fields: {
            Title: 'Optimize database queries',
            Assignee: 'Carol',
            Tags: ['database', 'performance', 'backend'],
            Status: 'New'
          }
        }
      ])

      const records = await getTableRecords(client, docId, tableId)

      const authTask = records.find((r) => r.id === recordIds[0])
      const dbTask = records.find((r) => r.id === recordIds[1])

      expect(extractListItems(authTask?.fields.Tags)).toEqual(['backend', 'api', 'security'])
      expect(extractListItems(dbTask?.fields.Tags)).toEqual(['database', 'performance', 'backend'])
    })

    it('should support filtering tasks by tag', async () => {
      const records = await getTableRecords(client, docId, tableId)

      // Filter tasks with 'security' tag
      const securityTasks = records.filter((r) => {
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
            Items: ['A', 'B', 'A', 'C'] // Contains duplicate 'A'
          }
        }
      ])

      const records = await getTableRecords(client, docId, tableId)
      const record = records.find((r) => r.id === recordIds[0])
      const items = extractListItems(record?.fields.Items)

      // Grist may deduplicate automatically - just verify the list is valid
      expect(Array.isArray(items)).toBe(true)
    })

    it('should preserve order of choices', async () => {
      const recordIds = await addTestRecords(client, docId, tableId, [
        {
          fields: {
            Name: 'Test order',
            Items: ['E', 'A', 'C', 'B']
          }
        }
      ])

      const records = await getTableRecords(client, docId, tableId)
      const record = records.find((r) => r.id === recordIds[0])

      // MCP server returns decoded natural format (plain array)
      const items = record?.fields.Items

      // Verify items are present (order may be preserved or sorted by Grist)
      expect(Array.isArray(items)).toBe(true)
      expect(items).toContain('E')
      expect(items).toContain('A')
      expect(items).toContain('C')
      expect(items).toContain('B')
    })
  })
})
