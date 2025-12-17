import { describe, expect, it } from 'vitest'
import {
  generateHelperColumnName,
  isConditionalRuleHelperColumn,
  parseRulesFromGrist,
  parseStyleOptions,
  serializeRulesForGrist,
  serializeStyleOptions,
  validatePythonFormula
} from '../../../src/services/rule-utilities.js'

describe('Rule Utilities', () => {
  describe('validatePythonFormula', () => {
    describe('valid formulas', () => {
      it.each([
        ['$Price > 100'],
        ['$Status == "Active"'],
        ['($A + $B) * 2'],
        ['$Price >= 50 and $Status != "Sold"'],
        ['len($Name) > 0'],
        ['$Value == None']
      ])('accepts valid formula: %s', (formula) => {
        const result = validatePythonFormula(formula)
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      })

      it('accepts formula with warning for Python keywords', () => {
        const result = validatePythonFormula('True if $A else False')
        expect(result.valid).toBe(true)
        // "True" triggers warning about possible missing $ prefix
        expect(result.error).toContain('Possible missing')
      })
    })

    describe('invalid formulas', () => {
      it.each([
        ['$Status = "Active"', 'Invalid equality operator'],
        ['(unclosed', 'unclosed opening parenthesis'],
        ['extra)', 'closing parenthesis without matching'],
        ["'unmatched", 'Unmatched single quote'],
        ['"unmatched', 'Unmatched double quote']
      ])('rejects invalid formula: %s -> %s', (formula, errorContains) => {
        const result = validatePythonFormula(formula)
        expect(result.valid).toBe(false)
        expect(result.error).toContain(errorContains)
      })
    })

    it('warns about possible missing $ prefix', () => {
      const result = validatePythonFormula('Price > 100')
      expect(result.valid).toBe(true)
      expect(result.error).toContain('Possible missing $ prefix')
      expect(result.suggestions).toBeDefined()
    })
  })

  describe('parseRulesFromGrist', () => {
    it.each([
      ['[]', []],
      ['[{"formula":"$A"}]', [{ formula: '$A' }]],
      ['', []],
      ['  ', []]
    ])('parses: %s', (json, expected) => {
      expect(parseRulesFromGrist(json)).toEqual(expected)
    })

    it.each([
      ['invalid json', 'Failed to parse'],
      ['{}', 'not an array']
    ])('throws for: %s -> %s', (json, errorContains) => {
      expect(() => parseRulesFromGrist(json)).toThrow(errorContains)
    })
  })

  describe('serializeRulesForGrist', () => {
    it('serializes rules to JSON', () => {
      const rules = [{ formula: '$A > 0' }] as Parameters<typeof serializeRulesForGrist>[0]
      expect(serializeRulesForGrist(rules)).toBe('[{"formula":"$A > 0"}]')
    })

    it('handles empty array', () => {
      expect(serializeRulesForGrist([])).toBe('[]')
    })
  })

  describe('generateHelperColumnName', () => {
    it.each([
      ['Table', undefined, 'gristHelper_ConditionalRule'],
      ['Table', 0, 'gristHelper_ConditionalRule'],
      ['Table', 1, 'gristHelper_ConditionalRule2'],
      ['Table', 5, 'gristHelper_ConditionalRule6']
    ])('generateHelperColumnName(%s, %s) -> %s', (table, idx, expected) => {
      expect(generateHelperColumnName(table, idx)).toBe(expected)
    })
  })

  describe('isConditionalRuleHelperColumn', () => {
    it.each([
      ['gristHelper_ConditionalRule', true],
      ['gristHelper_ConditionalRule2', true],
      ['gristHelper_ConditionalRule99', true],
      ['Name', false],
      ['gristHelper_Display', false],
      ['conditionalRule', false]
    ])('isConditionalRuleHelperColumn(%s) -> %s', (colId, expected) => {
      expect(isConditionalRuleHelperColumn(colId)).toBe(expected)
    })
  })

  describe('serializeStyleOptions', () => {
    it('serializes only defined properties', () => {
      const style = { fillColor: '#FF0000', fontBold: true }
      const result = JSON.parse(serializeStyleOptions(style))
      expect(result).toEqual({ fillColor: '#FF0000', fontBold: true })
    })

    it('omits undefined properties', () => {
      const style = { fillColor: '#FF0000', textColor: undefined }
      const result = JSON.parse(serializeStyleOptions(style))
      expect(result).toEqual({ fillColor: '#FF0000' })
      expect(result.textColor).toBeUndefined()
    })
  })

  describe('parseStyleOptions', () => {
    it('parses JSON string', () => {
      const json = '{"fillColor":"#FF0000","fontBold":true}'
      const result = parseStyleOptions(json)
      expect(result.fillColor).toBe('#FF0000')
      expect(result.fontBold).toBe(true)
    })

    it('accepts object directly', () => {
      const obj = { textColor: '#0000FF', fontItalic: true }
      const result = parseStyleOptions(obj)
      expect(result.textColor).toBe('#0000FF')
      expect(result.fontItalic).toBe(true)
    })
  })
})
