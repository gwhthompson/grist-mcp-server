/**
 * Comprehensive Widget Options Test
 *
 * Tests that ALL widget option types can be:
 * 1. Validated by schemas
 * 2. Serialized to JSON strings
 * 3. Stored correctly in Grist
 * 4. Retrieved and parsed
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestClient,
  createTestDocument,
  createTestWorkspace,
  getFirstOrg,
  deleteDocument,
  deleteWorkspace
} from './helpers/grist-api.js'
import { ensureGristReady } from './helpers/docker.js'
import { createTable } from '../src/tools/tables.js'
import type { DocId, WorkspaceId } from '../src/types/advanced.js'

describe('All Widget Options Types - Serialization Test', () => {
  const client = createTestClient()
  let orgId: number
  let workspaceId: WorkspaceId
  let docId: DocId

  beforeAll(async () => {
    await ensureGristReady()
    orgId = await getFirstOrg(client)
    workspaceId = (await createTestWorkspace(client, orgId, 'All Widget Options Test')) as WorkspaceId
    docId = (await createTestDocument(client, workspaceId, 'Widget Options Doc')) as DocId
  }, 60000)

  afterAll(async () => {
    if (docId) await deleteDocument(client, docId)
    if (workspaceId) await deleteWorkspace(client, workspaceId)
  })

  it('should handle ALL widget option types with proper JSON serialization', async () => {
    await createTable(client, {
      docId,
      tableName: 'AllWidgetTypes',
      columns: [
        // Text with alignment
        {
          colId: 'TextCol',
          type: 'Text',
          widgetOptions: { alignment: 'center' }
        },
        // Numeric with currency
        {
          colId: 'NumericCol',
          type: 'Numeric',
          widgetOptions: { numMode: 'currency', currency: 'USD', decimals: 2 }
        },
        // Bool with widget type
        {
          colId: 'BoolCol',
          type: 'Bool',
          widgetOptions: { widget: 'Switch' }
        },
        // Date with format
        {
          colId: 'DateCol',
          type: 'Date',
          widgetOptions: { dateFormat: 'YYYY-MM-DD' }
        },
        // DateTime with formats
        {
          colId: 'DateTimeCol',
          type: 'DateTime',
          widgetOptions: { dateFormat: 'YYYY-MM-DD', timeFormat: 'HH:mm:ss' }
        },
        // Choice with choices
        {
          colId: 'ChoiceCol',
          type: 'Choice',
          widgetOptions: { choices: ['Option1', 'Option2', 'Option3'] }
        },
        // ChoiceList with choices
        {
          colId: 'ChoiceListCol',
          type: 'ChoiceList',
          widgetOptions: { choices: ['Tag1', 'Tag2', 'Tag3'] }
        },
        // Attachments with height
        {
          colId: 'AttachmentsCol',
          type: 'Attachments',
          widgetOptions: { height: 100 }
        }
      ],
      response_format: 'json'
    })

    // Retrieve all column metadata
    const columnsResponse = await client.get<{ columns: any[] }>(
      `/docs/${docId}/tables/AllWidgetTypes/columns`
    )

    const columns = columnsResponse.columns.reduce((acc, col) => {
      acc[col.id] = col.fields.widgetOptions
      return acc
    }, {} as Record<string, string>)

    console.log('\n=== ALL WIDGET OPTIONS STORED VALUES ===')

    // Verify each column type
    for (const [colId, widgetOptions] of Object.entries(columns)) {
      if (!widgetOptions || widgetOptions === '') {
        console.log(`${colId}: (empty)`)
        continue
      }

      console.log(`\n${colId}:`)
      console.log(`  Raw: ${widgetOptions}`)

      // CRITICAL: No Python-style dicts
      expect(widgetOptions).not.toContain("'")
      expect(widgetOptions).not.toMatch(/\{'/)

      // Must be parseable JSON
      expect(() => JSON.parse(widgetOptions)).not.toThrow()

      const parsed = JSON.parse(widgetOptions)
      console.log(`  Parsed:`, parsed)
    }

    console.log('\n==========================================')

    // Verify specific expected values
    expect(JSON.parse(columns.TextCol).alignment).toBe('center')
    expect(JSON.parse(columns.NumericCol).numMode).toBe('currency')
    expect(JSON.parse(columns.BoolCol).widget).toBe('Switch')
    expect(JSON.parse(columns.DateCol).dateFormat).toBe('YYYY-MM-DD')
    expect(JSON.parse(columns.DateTimeCol).timeFormat).toBe('HH:mm:ss')
    expect(JSON.parse(columns.ChoiceCol).choices).toEqual(['Option1', 'Option2', 'Option3'])
    expect(JSON.parse(columns.ChoiceListCol).choices).toEqual(['Tag1', 'Tag2', 'Tag3'])
    expect(JSON.parse(columns.AttachmentsCol).height).toBe(100)
  }, 30000)
})
