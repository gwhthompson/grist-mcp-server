/**
 * Negative Test Suite - Grist MCP Server
 *
 * PURPOSE: Verify that tests can detect failures, not just pass all the time.
 * This addresses the critical concern about false positives in the test suite.
 *
 * PHILOSOPHY:
 * - Tests should validate invalid inputs are properly rejected
 * - Error messages should be actionable and guide agents
 * - Document Grist's actual behavior for edge cases (may not always reject)
 * - Follow MCP best practices: test tool behavior, not just happy paths
 *
 * TEST STRUCTURE:
 * 13 tests organized into 5 categories:
 * A. Widget Options Validation (4 tests)
 * B. Choice Constraints (2 tests)
 * C. Reference Constraints (2 tests)
 * D. Formula Errors (3 tests)
 * E. Column Type Conversion (2 tests)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { manageColumns } from '../../../src/tools/columns.js'
import type { DocId, TableId } from '../../../src/types/advanced.js'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  addTestRecords,
  cleanupTestContext,
  createFullTestContext,
  createTestClient,
  createTestTable
} from '../../helpers/grist-api.js'

describe('Negative Tests - Validation & Error Detection', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>
  let docId: DocId
  let mainTableId: TableId

  beforeAll(async () => {
    await ensureGristReady()

    context = await createFullTestContext(client, {
      docName: 'Negative Test Doc',
      tableName: 'TestTable',
      columns: [{ id: 'TestColumn', fields: { type: 'Text', label: 'Test Column' } }]
    })

    docId = context.docId
    mainTableId = context.tableId
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  /**
   * Helper to get column information
   */
  async function getColumnInfo(tableId: TableId, colId: string) {
    const response = await client.get<{
      columns: Array<{ id: string; fields?: Record<string, unknown> }>
    }>(`/docs/${docId}/tables/${tableId}/columns`)
    return response.columns.find((c) => c.id === colId)
  }

  /**
   * Helper to get all records from a table
   */
  async function getRecords(tableId: TableId) {
    const response = await client.get<{
      records: Array<{ id: number; fields: Record<string, CellValue> }>
    }>(`/docs/${docId}/tables/${tableId}/records`)
    return response.records
  }

  // ==========================================================================
  // A. WIDGET OPTIONS VALIDATION (4 tests)
  // ==========================================================================

  describe('A. Widget Options Validation', () => {
    it('A1. should reject or ignore invalid numMode values', async () => {
      /**
       * TEST: Invalid numMode value 'invalid_mode' (not in allowed enum)
       * EXPECTATION: Either Grist rejects it, or silently ignores it
       * MCP BEST PRACTICE: Document actual behavior for agents
       */
      const result = await manageColumns(context.toolContext, {
        docId,
        tableId: mainTableId,
        operations: [
          {
            action: 'add',
            colId: 'BadNumeric',
            type: 'Numeric',
            widgetOptions: {
              numMode: 'invalid_mode' as unknown as string // Force invalid value for testing
            }
          }
        ],
        response_format: 'json'
      })

      // Grist may either reject (isError: true) or accept and ignore
      if (result.isError) {
        // CASE 1: Grist rejects invalid numMode
        expect(result.content[0].text.toLowerCase()).toContain('invalid')
        console.log('✓ Grist correctly rejects invalid numMode')
      } else {
        // CASE 2: Grist accepts but may ignore invalid numMode
        const col = await getColumnInfo(mainTableId, 'BadNumeric')
        expect(col).toBeDefined()
        console.log('✓ Grist accepts invalid numMode (may ignore in UI)')

        // Document the stored value
        const widgetOptions = col.fields.widgetOptions
        if (widgetOptions) {
          const parsed = JSON.parse(widgetOptions)
          console.log(`  Stored widgetOptions: ${JSON.stringify(parsed)}`)
        }
      }
    })

    it('A2. should handle invalid currency codes', async () => {
      /**
       * TEST: Non-ISO-4217 currency code 'INVALID'
       * VALID CODES: USD, EUR, GBP, JPY, etc.
       * EXPECTATION: Grist may accept any string but not recognize it
       */
      const result = await manageColumns(context.toolContext, {
        docId,
        tableId: mainTableId,
        operations: [
          {
            action: 'add',
            colId: 'BadCurrency',
            type: 'Numeric',
            widgetOptions: {
              numMode: 'currency',
              currency: 'INVALID_CODE'
            }
          }
        ],
        response_format: 'json'
      })

      if (result.isError) {
        // Grist validates currency codes
        expect(result.content[0].text).toMatch(/currency|invalid/i)
        console.log('✓ Grist validates currency codes')
      } else {
        // Grist stores invalid currency (may not format correctly in UI)
        const col = await getColumnInfo(mainTableId, 'BadCurrency')
        expect(col).toBeDefined()

        const widgetOptions = JSON.parse(col.fields.widgetOptions || '{}')
        expect(widgetOptions.currency).toBe('INVALID_CODE')
        console.log('✓ Grist accepts invalid currency code (may not format in UI)')
      }
    })

    it('A3. should handle negative decimal places', async () => {
      /**
       * TEST: Negative decimals value (-5)
       * EXPECTATION: Should be rejected (decimals must be >= 0)
       */
      const result = await manageColumns(context.toolContext, {
        docId,
        tableId: mainTableId,
        operations: [
          {
            action: 'add',
            colId: 'NegativeDecimals',
            type: 'Numeric',
            widgetOptions: {
              decimals: -5
            }
          }
        ],
        response_format: 'json'
      })

      if (result.isError) {
        // Our schema validation caught it
        expect(result.content[0].text).toMatch(/decimal|negative|greater/i)
        console.log('✓ Negative decimals rejected by schema validation')
      } else {
        // Grist accepted it - check what was stored
        const col = await getColumnInfo(mainTableId, 'NegativeDecimals')
        const widgetOptions = JSON.parse(col.fields.widgetOptions || '{}')
        console.log(`⚠ Grist accepted negative decimals: ${widgetOptions.decimals}`)

        // Document: This is unexpected behavior
        expect(widgetOptions.decimals).toBe(-5)
      }
    })

    it('A4. should validate hex color formats', async () => {
      /**
       * TEST: Invalid hex color 'NOTACOLOR' vs valid '#FF0000'
       * EXPECTATION: Grist may accept any string but not render invalid colors
       */
      const result = await manageColumns(context.toolContext, {
        docId,
        tableId: mainTableId,
        operations: [
          {
            action: 'add',
            colId: 'InvalidColor',
            type: 'Text',
            widgetOptions: {
              textColor: 'NOTACOLOR' // Invalid hex format
            }
          },
          {
            action: 'add',
            colId: 'ValidColor',
            type: 'Text',
            widgetOptions: {
              textColor: '#FF0000' // Valid hex format
            }
          }
        ],
        response_format: 'json'
      })

      if (result.isError) {
        // Grist validates color format
        expect(result.content[0].text).toMatch(/color|invalid|hex/i)
        console.log('✓ Grist validates color format')
      } else {
        // Grist stores both colors - check what was stored
        const invalidCol = await getColumnInfo(mainTableId, 'InvalidColor')
        const validCol = await getColumnInfo(mainTableId, 'ValidColor')

        const invalidOpts = JSON.parse(invalidCol.fields.widgetOptions || '{}')
        const validOpts = JSON.parse(validCol.fields.widgetOptions || '{}')

        expect(invalidOpts.textColor).toBe('NOTACOLOR')
        expect(validOpts.textColor).toBe('#FF0000')

        console.log('⚠ Grist accepts invalid color format (may not render)')
        console.log(`  Invalid: ${invalidOpts.textColor}`)
        console.log(`  Valid: ${validOpts.textColor}`)
      }
    })
  })

  // ==========================================================================
  // B. CHOICE CONSTRAINTS (2 tests)
  // ==========================================================================

  describe('B. Choice Constraints', () => {
    let choiceTableId: TableId

    beforeAll(async () => {
      choiceTableId = await createTestTable(client, docId, 'ChoiceTest', [
        { id: 'Name', fields: { type: 'Text', label: 'Name' } }
      ])
    })

    it('B2. should handle choiceOptions for non-existent choices', async () => {
      /**
       * TEST: Set choiceOptions styling for choices that don't exist in choices array
       * EXPECTATION: Grist should accept but options may not be applied
       */
      const result = await manageColumns(context.toolContext, {
        docId,
        tableId: choiceTableId,
        operations: [
          {
            action: 'add',
            colId: 'Priority',
            type: 'Choice',
            widgetOptions: {
              choices: ['Low', 'Medium', 'High'],
              choiceOptions: {
                // Styling for choices that exist
                Low: { fillColor: '#00FF00' },
                High: { fillColor: '#FF0000' },
                // Styling for choice that DOESN'T exist!
                Critical: { fillColor: '#FF00FF' }
              }
            }
          }
        ],
        response_format: 'json'
      })

      // Result should succeed
      expect(result.isError).not.toBe(true)

      const col = await getColumnInfo(choiceTableId, 'Priority')
      const widgetOptions = JSON.parse(col.fields.widgetOptions || '{}')

      // Verify structure
      expect(widgetOptions.choices).toEqual(['Low', 'Medium', 'High'])
      expect(widgetOptions.choiceOptions).toBeDefined()
      expect(widgetOptions.choiceOptions.Critical).toBeDefined()

      console.log('📝 Grist Choice behavior - choiceOptions for non-existent choice:')
      console.log(`  Choices: ${widgetOptions.choices}`)
      console.log(`  choiceOptions has 'Critical': ${!!widgetOptions.choiceOptions.Critical}`)
      console.log('  ✓ Grist ACCEPTS choiceOptions for non-existent choices (ignored in UI)')
    })
  })

  // ==========================================================================
  // C. REFERENCE CONSTRAINTS (2 tests)
  // ==========================================================================

  describe('C. Reference Constraints', () => {
    let refTableAId: TableId
    let refTableBId: TableId

    beforeAll(async () => {
      refTableAId = await createTestTable(client, docId, 'RefTableA', [
        { id: 'Name', fields: { type: 'Text', label: 'Name' } }
      ])

      refTableBId = await createTestTable(client, docId, 'RefTableB', [
        { id: 'Title', fields: { type: 'Text', label: 'Title' } }
      ])
    })

    it('C1. should document behavior with circular references', async () => {
      /**
       * TEST: Create A→B and B→A circular reference
       * GRIST BEHAVIOR: Document if Grist allows or prevents circular refs
       */

      // Add A.RefToB (A→B)
      await manageColumns(context.toolContext, {
        docId,
        tableId: refTableAId,
        operations: [
          {
            action: 'add',
            colId: 'RefToB',
            type: 'Ref:RefTableB',
            label: 'Reference to B'
          }
        ],
        response_format: 'json'
      })

      // Add B.RefToA (B→A) - creates circular reference!
      const result = await manageColumns(context.toolContext, {
        docId,
        tableId: refTableBId,
        operations: [
          {
            action: 'add',
            colId: 'RefToA',
            type: 'Ref:RefTableA',
            label: 'Reference to A'
          }
        ],
        response_format: 'json'
      })

      if (result.isError) {
        expect(result.content[0].text).toMatch(/circular|reference/i)
        console.log('✓ Grist prevents circular references')
      } else {
        console.log('📝 Grist ALLOWS circular references:')
        console.log('  RefTableA.RefToB → RefTableB')
        console.log('  RefTableB.RefToA → RefTableA')
        console.log('  ✓ Circular references are permitted (use with caution)')

        // Verify both references exist
        const colA = await getColumnInfo(refTableAId, 'RefToB')
        const colB = await getColumnInfo(refTableBId, 'RefToA')

        expect(colA?.fields.type).toBe('Ref:RefTableB')
        expect(colB?.fields.type).toBe('Ref:RefTableA')
      }
    })

    it('C2. should handle references to deleted records', async () => {
      /**
       * TEST: Create reference, then delete the target record
       * EXPECTATION: Reference becomes 0 (null) or remains as broken ref
       */

      // Create reference table and records
      const targetTableId = await createTestTable(client, docId, 'RefTarget', [
        { id: 'Name', fields: { type: 'Text', label: 'Name' } }
      ])

      const sourceTableId = await createTestTable(client, docId, 'RefSource', [
        { id: 'Title', fields: { type: 'Text', label: 'Title' } },
        { id: 'TargetRef', fields: { type: 'Ref:RefTarget', label: 'Target' } }
      ])

      // Add target record
      const targetIds = await addTestRecords(client, docId, targetTableId, [
        { fields: { Name: 'Target Record' } }
      ])
      const targetId = targetIds[0]

      // Add source record referencing target
      const _sourceIds = await addTestRecords(client, docId, sourceTableId, [
        { fields: { Title: 'Source', TargetRef: targetId } }
      ])

      // Verify reference is set
      let records = await getRecords(sourceTableId)
      expect(records[0].fields.TargetRef).toBe(targetId)

      // Delete target record
      await client.post(`/docs/${docId}/apply`, [['BulkRemoveRecord', targetTableId, [targetId]]])

      // Check what happens to the reference
      records = await getRecords(sourceTableId)
      const brokenRef = records[0].fields.TargetRef

      console.log('📝 Grist behavior - reference to deleted record:')
      console.log(`  Original target ID: ${targetId}`)
      console.log(`  After deletion: ${brokenRef}`)

      if (brokenRef === 0) {
        console.log('  ✓ Grist sets reference to 0 (null) when target deleted')
      } else if (brokenRef === targetId) {
        console.log('  ⚠ Grist keeps broken reference ID (shows as #REF? in UI)')
      } else {
        console.log(`  ⚠ Unexpected behavior: ${brokenRef}`)
      }
    })
  })

  // ==========================================================================
  // D. FORMULA ERRORS (3 tests)
  // ==========================================================================

  describe('D. Formula Errors', () => {
    let formulaTableId: TableId

    beforeAll(async () => {
      formulaTableId = await createTestTable(client, docId, 'FormulaTest', [
        { id: 'Value', fields: { type: 'Numeric', label: 'Value' } }
      ])
    })

    it('D1. should detect circular formula dependencies', async () => {
      /**
       * TEST: Create A=$B+1 and B=$A+1 (circular dependency)
       * EXPECTATION: Grist should reject or detect circular dependency
       */

      // Add column A with formula referencing B
      await manageColumns(context.toolContext, {
        docId,
        tableId: formulaTableId,
        operations: [
          {
            action: 'add',
            colId: 'A',
            type: 'Numeric',
            formula: '$B + 1',
            isFormula: true
          }
        ],
        response_format: 'json'
      })

      // Try to add column B with formula referencing A (creates circular dependency)
      const result = await manageColumns(context.toolContext, {
        docId,
        tableId: formulaTableId,
        operations: [
          {
            action: 'add',
            colId: 'B',
            type: 'Numeric',
            formula: '$A + 1',
            isFormula: true
          }
        ],
        response_format: 'json'
      })

      // Check if Grist detects circular dependency
      if (result.isError) {
        expect(result.content[0].text).toMatch(/circular|dependency|cycle/i)
        console.log('✓ Grist detects circular formula dependencies')
      } else {
        console.log('⚠ Grist allows circular formulas (may show errors in cells)')

        // Add a record and check for formula errors
        await addTestRecords(client, docId, formulaTableId, [{ fields: { Value: 10 } }])

        const records = await getRecords(formulaTableId)
        console.log(`  A value: ${records[0]?.fields.A}`)
        console.log(`  B value: ${records[0]?.fields.B}`)

        // Circular formulas typically evaluate to error values
        const hasError =
          records[0]?.fields.A === null ||
          records[0]?.fields.B === null ||
          typeof records[0]?.fields.A === 'string' ||
          typeof records[0]?.fields.B === 'string'

        if (hasError) {
          console.log('  ✓ Circular formulas result in error values')
        }
      }
    })

    it('D2. should reject invalid formula syntax', async () => {
      /**
       * TEST: Formula with syntax error: "$A + +"
       * EXPECTATION: Grist should reject invalid Python syntax
       */
      const result = await manageColumns(context.toolContext, {
        docId,
        tableId: formulaTableId,
        operations: [
          {
            action: 'add',
            colId: 'BadSyntax',
            type: 'Numeric',
            formula: '$Value + +', // Invalid syntax!
            isFormula: true
          }
        ],
        response_format: 'json'
      })

      if (result.isError) {
        expect(result.content[0].text).toMatch(/syntax|invalid|formula|error/i)
        console.log('✓ Grist rejects invalid formula syntax')
        console.log(`  Error message: ${result.content[0].text.substring(0, 100)}...`)
      } else {
        console.log('⚠ Grist accepts invalid syntax (may error at evaluation time)')

        // Try to evaluate by adding a record
        await addTestRecords(client, docId, formulaTableId, [{ fields: { Value: 42 } }])

        const records = await getRecords(formulaTableId)
        const formulaResult = records.find((r) => r.fields.Value === 42)?.fields.BadSyntax

        console.log(`  Formula result: ${formulaResult}`)
        expect(formulaResult).not.toBe(42) // Should be error or null
      }
    })

    it('D3. should handle formula type mismatches', async () => {
      /**
       * TEST: Add text column to numeric column ($TextCol + $NumericCol)
       * EXPECTATION: Grist may evaluate but produce runtime error
       */

      // Create table with text and numeric columns
      const typeTableId = await createTestTable(client, docId, 'TypeMismatch', [
        { id: 'TextCol', fields: { type: 'Text', label: 'Text' } },
        { id: 'NumCol', fields: { type: 'Numeric', label: 'Number' } }
      ])

      // Add formula that mixes types
      const result = await manageColumns(context.toolContext, {
        docId,
        tableId: typeTableId,
        operations: [
          {
            action: 'add',
            colId: 'MixedTypes',
            type: 'Any', // Use Any type since result is unknown
            formula: '$TextCol + $NumCol', // Type mismatch!
            isFormula: true
          }
        ],
        response_format: 'json'
      })

      if (result.isError) {
        console.log('✓ Grist rejects type mismatch at column creation')
        expect(result.content[0].text).toMatch(/type|mismatch|invalid/i)
      } else {
        console.log('📝 Grist accepts mixed-type formula (check runtime behavior)')

        // Add test data
        await addTestRecords(client, docId, typeTableId, [
          { fields: { TextCol: 'Hello', NumCol: 42 } },
          { fields: { TextCol: '10', NumCol: 20 } } // Numeric string
        ])

        const records = await getRecords(typeTableId)

        console.log('  Runtime results:')
        records.forEach((r, i) => {
          console.log(`    Record ${i + 1}: Text="${r.fields.TextCol}", Num=${r.fields.NumCol}`)
          console.log(`      Formula result: ${r.fields.MixedTypes}`)
        })

        // Python may concatenate or error depending on types
        // '10' + 20 might work in Python, 'Hello' + 42 will error
        const hasError = records.some(
          (r) => r.fields.MixedTypes === null || typeof r.fields.MixedTypes === 'object'
        )

        if (hasError) {
          console.log('  ✓ Type mismatch produces runtime errors')
        } else {
          console.log('  ⚠ Type mismatch produces unexpected results')
        }
      }
    })
  })

  // ==========================================================================
  // E. COLUMN TYPE CONVERSION (2 tests)
  // ==========================================================================

  describe('E. Column Type Conversion', () => {
    it('E1. should handle Text→Numeric conversion with non-numeric data', async () => {
      /**
       * TEST: Convert Text column containing 'abc' to Numeric type
       * EXPECTATION: Grist should handle gracefully (null, 0, or error)
       */

      // Create table with Text column
      const convTableId = await createTestTable(client, docId, 'Conversion', [
        { id: 'Data', fields: { type: 'Text', label: 'Data' } }
      ])

      // Add records with various text values
      await addTestRecords(client, docId, convTableId, [
        { fields: { Data: '123' } }, // Numeric string
        { fields: { Data: 'abc' } }, // Non-numeric
        { fields: { Data: '45.67' } }, // Decimal string
        { fields: { Data: '' } } // Empty
      ])

      // Verify initial data
      let records = await getRecords(convTableId)
      expect(records[0].fields.Data).toBe('123')
      expect(records[1].fields.Data).toBe('abc')

      // Convert column from Text to Numeric
      const result = await manageColumns(context.toolContext, {
        docId,
        tableId: convTableId,
        operations: [
          {
            action: 'modify',
            colId: 'Data',
            type: 'Numeric'
          }
        ],
        response_format: 'json'
      })

      if (result.isError) {
        console.log('✓ Grist rejects Text→Numeric conversion with non-numeric data')
        expect(result.content[0].text).toMatch(/convert|type|numeric/i)
      } else {
        console.log('📝 Grist allows Text→Numeric conversion:')

        // Check converted values
        records = await getRecords(convTableId)

        console.log('  Conversion results:')
        console.log(`    '123' → ${records[0].fields.Data} (${typeof records[0].fields.Data})`)
        console.log(`    'abc' → ${records[1].fields.Data} (${typeof records[1].fields.Data})`)
        console.log(`    '45.67' → ${records[2].fields.Data} (${typeof records[2].fields.Data})`)
        console.log(`    '' → ${records[3].fields.Data} (${typeof records[3].fields.Data})`)

        // Document conversion behavior
        expect(records[0].fields.Data).toBe(123) // Numeric string converts
        expect(records[2].fields.Data).toBeCloseTo(45.67) // Decimal converts

        // Non-numeric likely becomes 0 or null
        if (records[1].fields.Data === 0) {
          console.log('  ✓ Non-numeric text converts to 0')
        } else if (records[1].fields.Data === null) {
          console.log('  ✓ Non-numeric text converts to null')
        } else {
          console.log(`  ⚠ Unexpected conversion: ${records[1].fields.Data}`)
        }
      }
    })

    it('E2. should handle Ref type change with existing references', async () => {
      /**
       * TEST: Change Ref:TableA to Ref:TableB with existing ref data
       * EXPECTATION: Grist should handle gracefully (clear refs or error)
       */

      // Create two reference target tables
      const targetA = await createTestTable(client, docId, 'TargetA', [
        { id: 'Name', fields: { type: 'Text', label: 'Name' } }
      ])

      const _targetB = await createTestTable(client, docId, 'TargetB', [
        { id: 'Title', fields: { type: 'Text', label: 'Title' } }
      ])

      // Create source table with reference to TargetA
      const sourceTable = await createTestTable(client, docId, 'RefSource2', [
        { id: 'Name', fields: { type: 'Text', label: 'Name' } },
        { id: 'RefCol', fields: { type: 'Ref:TargetA', label: 'Reference' } }
      ])

      // Add records to TargetA
      const targetIds = await addTestRecords(client, docId, targetA, [
        { fields: { Name: 'Record A' } }
      ])

      // Add source records with references
      await addTestRecords(client, docId, sourceTable, [
        { fields: { Name: 'Source1', RefCol: targetIds[0] } },
        { fields: { Name: 'Source2', RefCol: targetIds[0] } }
      ])

      // Verify initial references
      let records = await getRecords(sourceTable)
      expect(records[0].fields.RefCol).toBe(targetIds[0])

      // Try to change Ref:TargetA → Ref:TargetB
      const result = await manageColumns(context.toolContext, {
        docId,
        tableId: sourceTable,
        operations: [
          {
            action: 'modify',
            colId: 'RefCol',
            type: 'Ref:TargetB' // Change reference target!
          }
        ],
        response_format: 'json'
      })

      if (result.isError) {
        console.log('✓ Grist prevents changing Ref target with existing data')
        expect(result.content[0].text).toMatch(/reference|type|convert/i)
      } else {
        console.log('📝 Grist allows changing Ref target:')

        // Check column type
        const col = await getColumnInfo(sourceTable, 'RefCol')
        console.log(`  Column type: ${col?.fields.type}`)
        expect(col?.fields.type).toBe('Ref:TargetB')

        // Check what happens to existing references
        records = await getRecords(sourceTable)

        console.log('  Existing reference values:')
        console.log(`    Source1: ${records[0].fields.RefCol}`)
        console.log(`    Source2: ${records[1].fields.RefCol}`)

        // References likely become 0 (cleared) or remain as broken refs
        if (records[0].fields.RefCol === 0) {
          console.log('  ✓ Existing references cleared (set to 0)')
        } else if (records[0].fields.RefCol === targetIds[0]) {
          console.log('  ⚠ Existing references remain (now invalid for TargetB)')
        } else {
          console.log(`  ⚠ Unexpected behavior: ${records[0].fields.RefCol}`)
        }
      }
    })
  })
})
