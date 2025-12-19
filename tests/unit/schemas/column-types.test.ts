/**
 * Unit tests for column-types.ts helper functions
 *
 * Tests:
 * - extractWidgetOptions: Extracts widget options from column definition
 * - extractRulesOptions: Extracts conditional formatting rules
 * - extractCoreColumnProps: Extracts core column properties
 * - columnToGristFormat: Converts to Grist API format
 * - buildGristType: Builds Grist type string (Ref:Table)
 * - parseGristType: Parses Grist type string
 */

import { describe, expect, it } from 'vitest'
import {
  buildGristType,
  columnToGristFormat,
  extractCoreColumnProps,
  extractRulesOptions,
  extractWidgetOptions,
  parseGristType
} from '../../../src/schemas/column-types.js'

describe('column-types helpers', () => {
  describe('buildGristType', () => {
    it('builds Ref type with refTable', () => {
      expect(buildGristType({ type: 'Ref', refTable: 'Contacts' })).toBe('Ref:Contacts')
    })

    it('builds RefList type with refTable', () => {
      expect(buildGristType({ type: 'RefList', refTable: 'Tags' })).toBe('RefList:Tags')
    })

    it('returns type unchanged for non-reference types', () => {
      expect(buildGristType({ type: 'Text' })).toBe('Text')
      expect(buildGristType({ type: 'Numeric' })).toBe('Numeric')
      expect(buildGristType({ type: 'Bool' })).toBe('Bool')
      expect(buildGristType({ type: 'Date' })).toBe('Date')
      expect(buildGristType({ type: 'DateTime' })).toBe('DateTime')
      expect(buildGristType({ type: 'Choice' })).toBe('Choice')
      expect(buildGristType({ type: 'ChoiceList' })).toBe('ChoiceList')
      expect(buildGristType({ type: 'Int' })).toBe('Int')
      expect(buildGristType({ type: 'Attachments' })).toBe('Attachments')
    })

    it('returns Ref without refTable unchanged', () => {
      expect(buildGristType({ type: 'Ref' })).toBe('Ref')
      expect(buildGristType({ type: 'RefList' })).toBe('RefList')
    })

    it('ignores refTable for non-reference types', () => {
      expect(buildGristType({ type: 'Text', refTable: 'Ignored' })).toBe('Text')
    })
  })

  describe('parseGristType', () => {
    it('parses Ref:TableName format', () => {
      const result = parseGristType('Ref:Contacts')
      expect(result.type).toBe('Ref')
      expect(result.refTable).toBe('Contacts')
    })

    it('parses RefList:TableName format', () => {
      const result = parseGristType('RefList:Tags')
      expect(result.type).toBe('RefList')
      expect(result.refTable).toBe('Tags')
    })

    it('handles table names with underscores', () => {
      const result = parseGristType('Ref:My_Table_Name')
      expect(result.type).toBe('Ref')
      expect(result.refTable).toBe('My_Table_Name')
    })

    it('returns simple types without refTable', () => {
      expect(parseGristType('Text')).toEqual({ type: 'Text' })
      expect(parseGristType('Numeric')).toEqual({ type: 'Numeric' })
      expect(parseGristType('Bool')).toEqual({ type: 'Bool' })
      expect(parseGristType('Date')).toEqual({ type: 'Date' })
      expect(parseGristType('DateTime')).toEqual({ type: 'DateTime' })
      expect(parseGristType('Choice')).toEqual({ type: 'Choice' })
      expect(parseGristType('ChoiceList')).toEqual({ type: 'ChoiceList' })
      expect(parseGristType('Int')).toEqual({ type: 'Int' })
      expect(parseGristType('Attachments')).toEqual({ type: 'Attachments' })
    })

    it('handles Any type', () => {
      expect(parseGristType('Any')).toEqual({ type: 'Any' })
    })
  })

  describe('extractWidgetOptions', () => {
    it('extracts type-specific options', () => {
      const column = {
        colId: 'Price',
        type: 'Numeric',
        decimals: 2,
        numMode: 'currency',
        currency: 'USD'
      }
      const options = extractWidgetOptions(column)
      expect(options).toEqual({
        decimals: 2,
        numMode: 'currency',
        currency: 'USD'
      })
    })

    it('extracts nested style properties', () => {
      const column = {
        colId: 'Name',
        type: 'Text',
        style: {
          textColor: '#FF0000',
          fillColor: '#00FF00'
        }
      }
      const options = extractWidgetOptions(column)
      expect(options).toEqual({
        textColor: '#FF0000',
        fillColor: '#00FF00'
      })
    })

    it('excludes rulesOptions from style', () => {
      const column = {
        colId: 'Status',
        type: 'Choice',
        style: {
          textColor: '#000000',
          rulesOptions: [{ formula: '$Status == "Active"', style: { fillColor: '#00FF00' } }]
        }
      }
      const options = extractWidgetOptions(column)
      expect(options).toEqual({ textColor: '#000000' })
      expect(options).not.toHaveProperty('rulesOptions')
    })

    it('returns undefined for column with no options', () => {
      const column = {
        colId: 'Id',
        type: 'Int'
      }
      const options = extractWidgetOptions(column)
      expect(options).toBeUndefined()
    })

    it('ignores undefined values', () => {
      const column = {
        colId: 'Value',
        type: 'Numeric',
        decimals: 2,
        currency: undefined
      }
      const options = extractWidgetOptions(column)
      expect(options).toEqual({ decimals: 2 })
    })

    it('combines type-specific and style properties', () => {
      const column = {
        colId: 'Amount',
        type: 'Numeric',
        decimals: 2,
        style: {
          fontBold: true
        }
      }
      const options = extractWidgetOptions(column)
      expect(options).toEqual({
        decimals: 2,
        fontBold: true
      })
    })

    it('extracts choice options', () => {
      const column = {
        colId: 'Status',
        type: 'Choice',
        choices: ['Active', 'Inactive'],
        choiceOptions: { Active: { fillColor: '#00FF00' } }
      }
      const options = extractWidgetOptions(column)
      expect(options).toEqual({
        choices: ['Active', 'Inactive'],
        choiceOptions: { Active: { fillColor: '#00FF00' } }
      })
    })

    it('extracts date format options', () => {
      const column = {
        colId: 'Created',
        type: 'Date',
        dateFormat: 'YYYY-MM-DD',
        isCustomDateFormat: true
      }
      const options = extractWidgetOptions(column)
      expect(options).toEqual({
        dateFormat: 'YYYY-MM-DD',
        isCustomDateFormat: true
      })
    })
  })

  describe('extractRulesOptions', () => {
    it('extracts rulesOptions from style', () => {
      const column = {
        colId: 'Status',
        type: 'Choice',
        style: {
          rulesOptions: [
            { formula: '$Status == "Active"', style: { fillColor: '#00FF00' } },
            { formula: '$Status == "Inactive"', style: { fillColor: '#FF0000' } }
          ]
        }
      }
      const rules = extractRulesOptions(column)
      expect(rules).toHaveLength(2)
      expect(rules?.[0].formula).toBe('$Status == "Active"')
      expect(rules?.[1].formula).toBe('$Status == "Inactive"')
    })

    it('returns undefined when no style', () => {
      const column = {
        colId: 'Name',
        type: 'Text'
      }
      expect(extractRulesOptions(column)).toBeUndefined()
    })

    it('returns undefined when style has no rulesOptions', () => {
      const column = {
        colId: 'Name',
        type: 'Text',
        style: {
          textColor: '#000000'
        }
      }
      expect(extractRulesOptions(column)).toBeUndefined()
    })

    it('returns undefined when rulesOptions is not an array', () => {
      const column = {
        colId: 'Name',
        type: 'Text',
        style: {
          rulesOptions: 'not an array'
        }
      }
      expect(extractRulesOptions(column)).toBeUndefined()
    })

    it('handles rules with sectionId (field scope)', () => {
      const column = {
        colId: 'Value',
        type: 'Numeric',
        style: {
          rulesOptions: [{ formula: '$Value > 100', style: { fillColor: '#00FF00' }, sectionId: 5 }]
        }
      }
      const rules = extractRulesOptions(column)
      expect(rules?.[0].sectionId).toBe(5)
    })
  })

  describe('extractCoreColumnProps', () => {
    it('extracts all core properties', () => {
      const column = {
        colId: 'Price',
        type: 'Numeric',
        refTable: 'Products',
        label: 'Product Price',
        isFormula: true,
        formula: '$Quantity * $UnitPrice',
        visibleCol: 'Name',
        // Non-core properties should be ignored
        decimals: 2,
        numMode: 'currency'
      }
      const core = extractCoreColumnProps(column as never)
      expect(core).toEqual({
        colId: 'Price',
        type: 'Numeric',
        refTable: 'Products',
        label: 'Product Price',
        isFormula: true,
        formula: '$Quantity * $UnitPrice',
        visibleCol: 'Name'
      })
    })

    it('excludes non-core properties', () => {
      const column = {
        colId: 'Amount',
        type: 'Numeric',
        decimals: 2,
        currency: 'USD',
        style: { fillColor: '#FFFFFF' }
      }
      const core = extractCoreColumnProps(column as never)
      expect(core).toEqual({
        colId: 'Amount',
        type: 'Numeric'
      })
      expect(core).not.toHaveProperty('decimals')
      expect(core).not.toHaveProperty('currency')
      expect(core).not.toHaveProperty('style')
    })

    it('excludes undefined values', () => {
      const column = {
        colId: 'Name',
        type: 'Text',
        label: undefined,
        formula: undefined
      }
      const core = extractCoreColumnProps(column as never)
      expect(core).toEqual({
        colId: 'Name',
        type: 'Text'
      })
    })

    it('handles numeric visibleCol', () => {
      const column = {
        colId: 'Contact',
        type: 'Ref',
        refTable: 'Contacts',
        visibleCol: 5
      }
      const core = extractCoreColumnProps(column as never)
      expect(core.visibleCol).toBe(5)
    })
  })

  describe('columnToGristFormat', () => {
    it('converts simple column', () => {
      const column = {
        colId: 'Name',
        type: 'Text'
      }
      const result = columnToGristFormat(column as never)
      expect(result).toEqual({
        colId: 'Name',
        type: 'Text'
      })
    })

    it('converts Ref column with refTable', () => {
      const column = {
        colId: 'Contact',
        type: 'Ref',
        refTable: 'Contacts'
      }
      const result = columnToGristFormat(column as never)
      expect(result.type).toBe('Ref:Contacts')
    })

    it('converts RefList column with refTable', () => {
      const column = {
        colId: 'Tags',
        type: 'RefList',
        refTable: 'Tags'
      }
      const result = columnToGristFormat(column as never)
      expect(result.type).toBe('RefList:Tags')
    })

    it('includes optional properties when present', () => {
      const column = {
        colId: 'Total',
        type: 'Numeric',
        label: 'Total Amount',
        isFormula: true,
        formula: '$Quantity * $Price'
      }
      const result = columnToGristFormat(column as never)
      expect(result.label).toBe('Total Amount')
      expect(result.isFormula).toBe(true)
      expect(result.formula).toBe('$Quantity * $Price')
    })

    it('includes widgetOptions when present', () => {
      const column = {
        colId: 'Price',
        type: 'Numeric',
        decimals: 2,
        numMode: 'currency',
        currency: 'USD'
      }
      const result = columnToGristFormat(column as never)
      expect(result.widgetOptions).toEqual({
        decimals: 2,
        numMode: 'currency',
        currency: 'USD'
      })
    })

    it('includes visibleCol when present', () => {
      const column = {
        colId: 'Contact',
        type: 'Ref',
        refTable: 'Contacts',
        visibleCol: 'FullName'
      }
      const result = columnToGristFormat(column as never)
      expect(result.visibleCol).toBe('FullName')
    })

    it('flattens style into widgetOptions', () => {
      const column = {
        colId: 'Status',
        type: 'Text',
        style: {
          textColor: '#FF0000',
          fontBold: true
        }
      }
      const result = columnToGristFormat(column as never)
      expect(result.widgetOptions).toEqual({
        textColor: '#FF0000',
        fontBold: true
      })
    })

    it('excludes undefined optional properties', () => {
      const column = {
        colId: 'Id',
        type: 'Int',
        label: undefined,
        formula: undefined
      }
      const result = columnToGristFormat(column as never)
      expect(result).toEqual({
        colId: 'Id',
        type: 'Int'
      })
      expect(result).not.toHaveProperty('label')
      expect(result).not.toHaveProperty('formula')
    })
  })
})
