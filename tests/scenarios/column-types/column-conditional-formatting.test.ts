/**
 * Integration Tests for Conditional Formatting (All Scopes)
 *
 * Tests the unified conditional formatting tool against a real Grist instance.
 * Requires Docker to be running with test Grist instance.
 *
 * Scopes:
 * - column: Format column cells across ALL views
 * - row: Format entire rows in Raw Data view
 * - field: Format column in ONE specific widget only
 *
 * Run with: npm test tests/scenarios/column-types/column-conditional-formatting.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { manageConditionalRules } from '../../../src/tools/conditional-formatting.js'
import type { DocId, TableId } from '../../../src/types/advanced.js'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../../helpers/grist-api.js'

describe('Conditional Formatting Integration', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>
  let docId: DocId
  let tableId: TableId

  beforeAll(async () => {
    await ensureGristReady()
    context = await createFullTestContext(client, {
      docName: 'Conditional Formatting Test Doc',
      tableName: 'Products',
      columns: [
        { id: 'Name', fields: { type: 'Text' } },
        { id: 'Amount', fields: { type: 'Numeric' } },
        { id: 'Quantity', fields: { type: 'Int' } },
        { id: 'Category', fields: { type: 'Choice', widgetOptions: '{"choices":["A","B","C"]}' } },
        { id: 'Priority', fields: { type: 'Int' } },
        { id: 'StatusCode', fields: { type: 'Text' } },
        { id: 'Value1', fields: { type: 'Numeric' } },
        { id: 'Value2', fields: { type: 'Numeric' } },
        { id: 'Status', fields: { type: 'Text' } }
      ]
    })
    docId = context.docId
    tableId = context.tableId
  }, 60000)

  afterAll(async () => {
    await cleanupTestContext(context)
  })

  // =============================================================================
  // COLUMN SCOPE TESTS
  // =============================================================================
  describe('Column Scope', () => {
    describe('List Operation', () => {
      it('should return empty array when no rules exist', async () => {
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Name',
          operation: { action: 'list' },
          response_format: 'json'
        })

        expect(result).toHaveSuccessResponse()
        const content = result.content[0]
        expect(content.type).toBe('text')
        if (content.type === 'text') {
          const data = JSON.parse(content.text)
          expect(data.rules).toEqual([])
          expect(data.totalRules).toBe(0)
          expect(data.scope).toBe('column')
        }
      })

      it('should return markdown format when requested', async () => {
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Amount',
          operation: { action: 'list' },
          response_format: 'markdown'
        })

        expect(result).toHaveSuccessResponse()
        const content = result.content[0]
        expect(content.type).toBe('text')
        if (content.type === 'text') {
          expect(content.text).toContain('Amount')
          expect(content.text).toContain('No conditional formatting rules')
        }
      })
    })

    describe('Add Operation', () => {
      it('should add a conditional formatting rule', async () => {
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Priority',
          operation: {
            action: 'add',
            rule: {
              formula: '$Priority > 5',
              style: {
                fillColor: '#FF0000',
                textColor: '#FFFFFF'
              }
            }
          },
          response_format: 'json'
        })

        expect(result).toHaveSuccessResponse()
        const content = result.content[0]
        if (content.type === 'text') {
          const data = JSON.parse(content.text)
          expect(data.rules).toHaveLength(1)
          expect(data.rules[0].formula).toBe('$Priority > 5')
          expect(data.rules[0].style.fillColor).toBe('#FF0000')
          expect(data.rules[0].style.textColor).toBe('#FFFFFF')
          expect(data.scope).toBe('column')
        }
      })

      it('should reject invalid formula syntax', async () => {
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Amount',
          operation: {
            action: 'add',
            rule: {
              formula: '$Amount > 100))',
              style: { fillColor: '#FF0000' }
            }
          },
          response_format: 'json'
        })

        expect(result).toHaveErrorResponse(/parentheses/i)
      })
    })

    describe('Schema Validation', () => {
      it('should reject invalid hex color format', async () => {
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'StatusCode',
          operation: {
            action: 'add',
            rule: {
              formula: '$StatusCode == "X"',
              style: { fillColor: 'red' }
            }
          },
          response_format: 'json'
        })

        expect(result).toHaveErrorResponse(/hex/i)
      })

      it('should reject empty formula', async () => {
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Value1',
          operation: {
            action: 'add',
            rule: {
              formula: '',
              style: { fillColor: '#FF0000' }
            }
          },
          response_format: 'json'
        })

        expect(result).toHaveErrorResponse(/empty/i)
      })

      it('should reject formula over 1000 characters', async () => {
        const longFormula = `$Value2 > ${'1'.repeat(1000)}`
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Value2',
          operation: {
            action: 'add',
            rule: {
              formula: longFormula,
              style: { fillColor: '#FF0000' }
            }
          },
          response_format: 'json'
        })

        expect(result).toHaveErrorResponse(/1000/)
      })
    })

    describe('Multiple Rules', () => {
      it('should maintain rule order (priority)', async () => {
        // Add first rule
        await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Quantity',
          operation: {
            action: 'add',
            rule: {
              formula: '$Quantity < 10',
              style: { fillColor: '#FF0000' }
            }
          },
          response_format: 'json'
        })

        // Add second rule
        await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Quantity',
          operation: {
            action: 'add',
            rule: {
              formula: '$Quantity < 50',
              style: { fillColor: '#FFFF00' }
            }
          },
          response_format: 'json'
        })

        // List rules - should be in order added
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Quantity',
          operation: { action: 'list' },
          response_format: 'json'
        })

        const content = result.content[0]
        if (content.type === 'text') {
          const data = JSON.parse(content.text)
          expect(data.rules).toHaveLength(2)
          expect(data.rules[0].index).toBe(0)
          expect(data.rules[1].index).toBe(1)
        }
      }, 60000)

      it('should create unique helper columns for each rule', async () => {
        // Add first rule
        await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Value1',
          operation: {
            action: 'add',
            rule: {
              formula: '$Value1 > 100',
              style: { fillColor: '#FF0000' }
            }
          },
          response_format: 'json'
        })

        // Add second rule
        await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Value1',
          operation: {
            action: 'add',
            rule: {
              formula: '$Value1 < 10',
              style: { fillColor: '#00FF00' }
            }
          },
          response_format: 'json'
        })

        // Query rules array via REST API
        const columnsResp = await client.get<{
          columns: Array<{ id: string; fields: { rules?: unknown } }>
        }>(`/docs/${docId}/tables/${tableId}/columns`)

        const value1Col = columnsResp.columns.find((c) => c.id === 'Value1')
        expect(value1Col).toBeDefined()

        const rulesRaw = value1Col?.fields.rules
        expect(rulesRaw).toBeDefined()
        expect(Array.isArray(rulesRaw)).toBe(true)

        const rulesList = rulesRaw as [string, ...number[]]
        expect(rulesList[0]).toBe('L') // Grist list marker
        expect(rulesList.length).toBeGreaterThanOrEqual(3)

        const colRefs = rulesList.slice(1) as number[]
        expect(colRefs).toHaveLength(2)
        expect(colRefs[0]).not.toBe(colRefs[1]) // UNIQUE colRefs
      }, 60000)

      it('should preserve existing widgetOptions when adding rules', async () => {
        // Set up column with existing widgetOptions
        await client.post(`/docs/${docId}/apply`, [
          [
            'UpdateRecord',
            '_grist_Tables_column',
            await (async () => {
              const resp = await client.post<{ records: Array<{ fields: { id: number } }> }>(
                `/docs/${docId}/sql`,
                {
                  sql: `SELECT c.id
                        FROM _grist_Tables_column c
                        JOIN _grist_Tables t ON c.parentId = t.id
                        WHERE t.tableId = ? AND c.colId = ?`,
                  args: [tableId, 'Value2']
                }
              )
              return resp.records[0].fields.id
            })(),
            {
              widgetOptions: JSON.stringify({
                numMode: 'currency',
                currency: 'USD',
                decimals: 2
              })
            }
          ]
        ])

        // Add a conditional rule
        await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Value2',
          operation: {
            action: 'add',
            rule: {
              formula: '$Value2 > 1000',
              style: { fillColor: '#FF0000' }
            }
          },
          response_format: 'json'
        })

        // Verify widgetOptions preserved
        const optionsResp = await client.post<{
          records: Array<{ fields: { widgetOptions: string } }>
        }>(`/docs/${docId}/sql`, {
          sql: `SELECT c.widgetOptions
                FROM _grist_Tables_column c
                JOIN _grist_Tables t ON c.parentId = t.id
                WHERE t.tableId = ? AND c.colId = ?`,
          args: [tableId, 'Value2']
        })

        const widgetOptions = JSON.parse(optionsResp.records[0].fields.widgetOptions)
        expect(widgetOptions.numMode).toBe('currency')
        expect(widgetOptions.currency).toBe('USD')
        expect(widgetOptions.decimals).toBe(2)
        expect(widgetOptions.rulesOptions).toBeDefined()
        expect(widgetOptions.rulesOptions).toHaveLength(1)
      }, 60000)
    })

    describe('Update Operation', () => {
      it('should update existing rule', async () => {
        // Add a rule
        await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Category',
          operation: {
            action: 'add',
            rule: {
              formula: '$Category == "A"',
              style: { fillColor: '#00FF00' }
            }
          },
          response_format: 'json'
        })

        // Update it
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Category',
          operation: {
            action: 'update',
            ruleIndex: 0,
            rule: {
              formula: '$Category == "B"',
              style: { fillColor: '#FF0000', fontStrikethrough: true }
            }
          },
          response_format: 'json'
        })

        expect(result).toHaveSuccessResponse()
        const content = result.content[0]
        if (content.type === 'text') {
          const data = JSON.parse(content.text)
          expect(data.rules).toHaveLength(1)
          expect(data.rules[0].formula).toBe('$Category == "B"')
          expect(data.rules[0].style.fillColor).toBe('#FF0000')
          expect(data.rules[0].style.fontStrikethrough).toBe(true)
        }
      })

      it('should reject invalid ruleIndex', async () => {
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Value2',
          operation: {
            action: 'update',
            ruleIndex: 99,
            rule: {
              formula: '$Status == "Active"',
              style: { fillColor: '#00FF00' }
            }
          },
          response_format: 'json'
        })

        expect(result).toHaveErrorResponse(/Invalid ruleIndex.*99/)
      })
    })

    describe('Remove Operation', () => {
      it('should remove rule by index', async () => {
        // Add two rules
        await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Name',
          operation: {
            action: 'add',
            rule: {
              formula: 'len($Name) > 50',
              style: { fillColor: '#FFFF00' }
            }
          },
          response_format: 'json'
        })

        await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Name',
          operation: {
            action: 'add',
            rule: {
              formula: 'len($Name) < 5',
              style: { fillColor: '#FF0000' }
            }
          },
          response_format: 'json'
        })

        // Remove first rule
        const removeResult = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Name',
          operation: {
            action: 'remove',
            ruleIndex: 0
          },
          response_format: 'markdown'
        })

        expect(removeResult.isError).toBeFalsy()
        const removeContent = removeResult.content[0]
        if (removeContent.type === 'text') {
          expect(removeContent.text).toContain('Successfully removed')
          expect(removeContent.text).toContain('1 rule(s) remaining')
        }

        // Verify only one rule remains
        const listResult = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId,
          colId: 'Name',
          operation: { action: 'list' },
          response_format: 'json'
        })

        const listContent = listResult.content[0]
        if (listContent.type === 'text') {
          const data = JSON.parse(listContent.text)
          expect(data.rules).toHaveLength(1)
          expect(data.rules[0].formula).toBe('len($Name) < 5')
        }
      })
    })

    describe('Error Handling', () => {
      it('should reject invalid docId', async () => {
        const result = await manageConditionalRules(context.toolContext, {
          docId: 'NonExistentDoc123456AB',
          scope: 'column',
          tableId,
          colId: 'Name',
          operation: { action: 'list' },
          response_format: 'json'
        })

        expect(result).toHaveErrorResponse()
      })

      it('should reject invalid tableId', async () => {
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'column',
          tableId: 'NonExistentTable',
          colId: 'Name',
          operation: { action: 'list' },
          response_format: 'json'
        })

        expect(result).toHaveErrorResponse(/not found/i)
      })
    })
  })

  // =============================================================================
  // ROW SCOPE TESTS
  // =============================================================================
  describe('Row Scope', () => {
    describe('List Operation', () => {
      it('should return empty array when no row rules exist', async () => {
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'row',
          tableId,
          operation: { action: 'list' },
          response_format: 'json'
        })

        expect(result).toHaveSuccessResponse()
        const content = result.content[0]
        expect(content.type).toBe('text')
        if (content.type === 'text') {
          const data = JSON.parse(content.text)
          expect(data.rules).toEqual([])
          expect(data.totalRules).toBe(0)
          expect(data.scope).toBe('row')
        }
      })
    })

    describe('Add Operation', () => {
      it('should add a row conditional formatting rule', async () => {
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'row',
          tableId,
          operation: {
            action: 'add',
            rule: {
              formula: '$Status == "Overdue"',
              style: {
                fillColor: '#FFCCCC'
              }
            }
          },
          response_format: 'json'
        })

        expect(result).toHaveSuccessResponse()
        const content = result.content[0]
        if (content.type === 'text') {
          const data = JSON.parse(content.text)
          expect(data.rules).toHaveLength(1)
          expect(data.rules[0].formula).toBe('$Status == "Overdue"')
          expect(data.rules[0].style.fillColor).toBe('#FFCCCC')
          expect(data.scope).toBe('row')
        }
      })

      it('should add multiple row rules', async () => {
        // Add another rule
        await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'row',
          tableId,
          operation: {
            action: 'add',
            rule: {
              formula: '$Priority > 8',
              style: {
                fillColor: '#FF0000',
                fontBold: true
              }
            }
          },
          response_format: 'json'
        })

        // List all row rules
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'row',
          tableId,
          operation: { action: 'list' },
          response_format: 'json'
        })

        const content = result.content[0]
        if (content.type === 'text') {
          const data = JSON.parse(content.text)
          expect(data.rules.length).toBeGreaterThanOrEqual(2)
          expect(data.scope).toBe('row')
        }
      }, 60000)
    })

    describe('Update Operation', () => {
      it('should update existing row rule', async () => {
        // First list to get current rules
        const listResult = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'row',
          tableId,
          operation: { action: 'list' },
          response_format: 'json'
        })

        const listContent = listResult.content[0]
        if (listContent.type !== 'text') return

        const listData = JSON.parse(listContent.text)
        if (listData.rules.length === 0) return

        // Update first rule
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'row',
          tableId,
          operation: {
            action: 'update',
            ruleIndex: 0,
            rule: {
              formula: '$Status == "Complete"',
              style: { fillColor: '#90EE90' }
            }
          },
          response_format: 'json'
        })

        expect(result).toHaveSuccessResponse()
        const content = result.content[0]
        if (content.type === 'text') {
          const data = JSON.parse(content.text)
          expect(data.rules[0].formula).toBe('$Status == "Complete"')
          expect(data.rules[0].style.fillColor).toBe('#90EE90')
        }
      })
    })

    describe('Remove Operation', () => {
      it('should remove row rule by index', async () => {
        // List to get count
        const listResult = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'row',
          tableId,
          operation: { action: 'list' },
          response_format: 'json'
        })

        const listContent = listResult.content[0]
        if (listContent.type !== 'text') return

        const listData = JSON.parse(listContent.text)
        const initialCount = listData.rules.length
        if (initialCount === 0) return

        // Remove first rule
        const removeResult = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'row',
          tableId,
          operation: {
            action: 'remove',
            ruleIndex: 0
          },
          response_format: 'markdown'
        })

        expect(removeResult.isError).toBeFalsy()
        const removeContent = removeResult.content[0]
        if (removeContent.type === 'text') {
          expect(removeContent.text).toContain('Successfully removed')
        }
      })
    })
  })

  // =============================================================================
  // FIELD SCOPE TESTS
  // =============================================================================
  describe('Field Scope', () => {
    let sectionId: number

    beforeAll(async () => {
      // Get the default Raw Data section for the table
      const resp = await client.post<{
        records: Array<{ fields: { id: number; tableRef: number } }>
      }>(`/docs/${docId}/sql`, {
        sql: `SELECT vs.id, vs.tableRef
              FROM _grist_Views_section vs
              JOIN _grist_Tables t ON vs.tableRef = t.id
              WHERE t.tableId = ?
              LIMIT 1`,
        args: [tableId]
      })

      if (resp.records.length > 0) {
        sectionId = resp.records[0].fields.id
      }
    })

    describe('List Operation', () => {
      it('should return empty array when no field rules exist', async () => {
        if (!sectionId) return

        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'field',
          tableId,
          colId: 'Amount',
          sectionId,
          operation: { action: 'list' },
          response_format: 'json'
        })

        expect(result).toHaveSuccessResponse()
        const content = result.content[0]
        expect(content.type).toBe('text')
        if (content.type === 'text') {
          const data = JSON.parse(content.text)
          expect(data.rules).toEqual([])
          expect(data.totalRules).toBe(0)
          expect(data.scope).toBe('field')
        }
      })
    })

    describe('Add Operation', () => {
      it('should add a field conditional formatting rule', async () => {
        if (!sectionId) return

        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'field',
          tableId,
          colId: 'Amount',
          sectionId,
          operation: {
            action: 'add',
            rule: {
              formula: '$Amount > 10000',
              style: {
                fillColor: '#90EE90',
                fontBold: true
              }
            }
          },
          response_format: 'json'
        })

        expect(result).toHaveSuccessResponse()
        const content = result.content[0]
        if (content.type === 'text') {
          const data = JSON.parse(content.text)
          expect(data.rules).toHaveLength(1)
          expect(data.rules[0].formula).toBe('$Amount > 10000')
          expect(data.rules[0].style.fillColor).toBe('#90EE90')
          expect(data.rules[0].style.fontBold).toBe(true)
          expect(data.scope).toBe('field')
        }
      })
    })

    describe('Update Operation', () => {
      it('should update existing field rule', async () => {
        if (!sectionId) return

        // First list to ensure we have a rule
        const listResult = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'field',
          tableId,
          colId: 'Amount',
          sectionId,
          operation: { action: 'list' },
          response_format: 'json'
        })

        const listContent = listResult.content[0]
        if (listContent.type !== 'text') return

        const listData = JSON.parse(listContent.text)
        if (listData.rules.length === 0) return

        // Update rule
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'field',
          tableId,
          colId: 'Amount',
          sectionId,
          operation: {
            action: 'update',
            ruleIndex: 0,
            rule: {
              formula: '$Amount > 5000',
              style: { fillColor: '#FFD700', fontItalic: true }
            }
          },
          response_format: 'json'
        })

        expect(result).toHaveSuccessResponse()
        const content = result.content[0]
        if (content.type === 'text') {
          const data = JSON.parse(content.text)
          expect(data.rules[0].formula).toBe('$Amount > 5000')
          expect(data.rules[0].style.fillColor).toBe('#FFD700')
          expect(data.rules[0].style.fontItalic).toBe(true)
        }
      })
    })

    describe('Remove Operation', () => {
      it('should remove field rule by index', async () => {
        if (!sectionId) return

        // List to check if we have rules
        const listResult = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'field',
          tableId,
          colId: 'Amount',
          sectionId,
          operation: { action: 'list' },
          response_format: 'json'
        })

        const listContent = listResult.content[0]
        if (listContent.type !== 'text') return

        const listData = JSON.parse(listContent.text)
        if (listData.rules.length === 0) return

        // Remove rule
        const removeResult = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'field',
          tableId,
          colId: 'Amount',
          sectionId,
          operation: {
            action: 'remove',
            ruleIndex: 0
          },
          response_format: 'markdown'
        })

        expect(removeResult.isError).toBeFalsy()
        const removeContent = removeResult.content[0]
        if (removeContent.type === 'text') {
          expect(removeContent.text).toContain('Successfully removed')
        }
      })
    })

    describe('Widget Identification', () => {
      it('should require widget identification for field scope', async () => {
        // This should fail at schema validation level
        const result = await manageConditionalRules(context.toolContext, {
          docId,
          scope: 'field',
          tableId,
          colId: 'Amount',
          // Missing sectionId, pageName, and widgetTitle
          operation: { action: 'list' },
          response_format: 'json'
        } as Parameters<typeof manageConditionalRules>[1])

        expect(result).toHaveErrorResponse(/sectionId|pageName|widgetTitle/i)
      })
    })
  })

  // =============================================================================
  // CROSS-SCOPE TESTS
  // =============================================================================
  describe('Cross-Scope Behavior', () => {
    it('should keep column and row rules independent', async () => {
      // Add a column rule
      await manageConditionalRules(context.toolContext, {
        docId,
        scope: 'column',
        tableId,
        colId: 'StatusCode',
        operation: {
          action: 'add',
          rule: {
            formula: '$StatusCode == "ERR"',
            style: { fillColor: '#FF0000' }
          }
        },
        response_format: 'json'
      })

      // List row rules - should not include column rule
      const rowResult = await manageConditionalRules(context.toolContext, {
        docId,
        scope: 'row',
        tableId,
        operation: { action: 'list' },
        response_format: 'json'
      })

      const rowContent = rowResult.content[0]
      if (rowContent.type === 'text') {
        const rowData = JSON.parse(rowContent.text)
        // Row rules should not include '$StatusCode == "ERR"' (that's a column rule)
        const hasColumnFormula = rowData.rules.some(
          (r: { formula: string }) => r.formula === '$StatusCode == "ERR"'
        )
        expect(hasColumnFormula).toBe(false)
      }

      // List column rules - should include the rule
      const colResult = await manageConditionalRules(context.toolContext, {
        docId,
        scope: 'column',
        tableId,
        colId: 'StatusCode',
        operation: { action: 'list' },
        response_format: 'json'
      })

      const colContent = colResult.content[0]
      if (colContent.type === 'text') {
        const colData = JSON.parse(colContent.text)
        const hasFormula = colData.rules.some(
          (r: { formula: string }) => r.formula === '$StatusCode == "ERR"'
        )
        expect(hasFormula).toBe(true)
      }
    })
  })
})
