/**
 * Unit Tests for Conditional Formatting Rules
 *
 * Tests schema validation, rule utilities, and action builders.
 * Does NOT require Docker - pure unit tests with mocks.
 */

import { describe, expect, it } from 'vitest'
import type {
  ConditionalRuleDisplay,
  GristConditionalRuleRaw
} from '../../src/schemas/conditional-rules.js'
import {
  BaseConditionalRuleSchema,
  ColumnRuleOperationSchema,
  ConditionalFormatOptionsSchema,
  ConditionalRulesInputSchema,
  isColumnScope,
  isFieldScope,
  isRowScope,
  RuleFormulaSchema
} from '../../src/schemas/conditional-rules.js'
import {
  formatRuleForMarkdown,
  formatRulesListMarkdown,
  isConditionalRuleHelperColumn,
  parseRulesFromGrist,
  parseStyleOptions,
  serializeRulesForGrist,
  serializeStyleOptions,
  validatePythonFormula
} from '../../src/services/rule-utilities.js'

describe('Conditional Rules Schemas', () => {
  describe('RuleFormulaSchema', () => {
    it('should accept valid Python formulas', () => {
      const validFormulas = [
        '$Price > 1000',
        '$Status == "Active"',
        '$Price > 100 and $Quantity < 10',
        'len($Description) > 50',
        '$DueDate < NOW()',
        '$Value != 0'
      ]

      for (const formula of validFormulas) {
        const result = RuleFormulaSchema.safeParse(formula)
        expect(result.success).toBe(true)
      }
    })

    it('should reject empty formulas', () => {
      const result = RuleFormulaSchema.safeParse('')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('empty')
      }
    })

    it('should reject whitespace-only formulas', () => {
      const result = RuleFormulaSchema.safeParse('   ')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('whitespace')
      }
    })

    it('should reject formulas over 1000 characters', () => {
      const longFormula = `$Price > ${'1'.repeat(1000)}`
      const result = RuleFormulaSchema.safeParse(longFormula)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('1000')
      }
    })
  })

  describe('ConditionalFormatOptionsSchema', () => {
    it('should accept valid style options', () => {
      const validStyles = [
        { fillColor: '#FF0000' },
        { textColor: '#FFFFFF' },
        { fillColor: '#FF0000', textColor: '#FFFFFF' },
        { fontBold: true },
        { fontItalic: true, fontUnderline: true },
        { fillColor: '#10B981', fontBold: true, fontItalic: true }
      ]

      for (const style of validStyles) {
        const result = ConditionalFormatOptionsSchema.safeParse(style)
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid hex colors', () => {
      const invalidColors = [
        { fillColor: 'red' }, // CSS color name
        { fillColor: '#FF00' }, // Too short
        { fillColor: '#GGGGGG' }, // Invalid hex
        { textColor: 'rgb(255, 0, 0)' } // RGB format
      ]

      for (const style of invalidColors) {
        const result = ConditionalFormatOptionsSchema.safeParse(style)
        expect(result.success).toBe(false)
      }
    })

    it('should reject unknown properties (strict mode)', () => {
      const result = ConditionalFormatOptionsSchema.safeParse({
        fillColor: '#FF0000',
        unknownProperty: 'value'
      })
      expect(result.success).toBe(false)
    })

    it('should accept empty style object', () => {
      const result = ConditionalFormatOptionsSchema.safeParse({})
      expect(result.success).toBe(true)
    })
  })

  describe('BaseConditionalRuleSchema', () => {
    it('should accept valid rule with formula and style', () => {
      const rule = {
        formula: '$Price > 1000',
        style: {
          fillColor: '#FF0000',
          textColor: '#FFFFFF'
        }
      }

      const result = BaseConditionalRuleSchema.safeParse(rule)
      expect(result.success).toBe(true)
    })

    it('should require both formula and style', () => {
      const missingFormula = BaseConditionalRuleSchema.safeParse({
        style: { fillColor: '#FF0000' }
      })
      expect(missingFormula.success).toBe(false)

      const missingStyle = BaseConditionalRuleSchema.safeParse({
        formula: '$Price > 1000'
      })
      expect(missingStyle.success).toBe(false)
    })
  })

  describe('ColumnRuleOperationSchema', () => {
    it('should accept add operation', () => {
      const operation = {
        action: 'add' as const,
        rule: {
          formula: '$Price > 1000',
          style: { fillColor: '#FF0000' }
        }
      }

      const result = ColumnRuleOperationSchema.safeParse(operation)
      expect(result.success).toBe(true)
    })

    it('should accept update operation with ruleIndex', () => {
      const operation = {
        action: 'update' as const,
        ruleIndex: 0,
        rule: {
          formula: '$Price > 500',
          style: { fillColor: '#FFFF00' }
        }
      }

      const result = ColumnRuleOperationSchema.safeParse(operation)
      expect(result.success).toBe(true)
    })

    it('should accept remove operation with ruleIndex', () => {
      const operation = {
        action: 'remove' as const,
        ruleIndex: 0
      }

      const result = ColumnRuleOperationSchema.safeParse(operation)
      expect(result.success).toBe(true)
    })

    it('should accept list operation', () => {
      const operation = {
        action: 'list' as const
      }

      const result = ColumnRuleOperationSchema.safeParse(operation)
      expect(result.success).toBe(true)
    })

    it('should reject negative ruleIndex', () => {
      const operation = {
        action: 'update' as const,
        ruleIndex: -1,
        rule: {
          formula: '$Price > 500',
          style: { fillColor: '#FFFF00' }
        }
      }

      const result = ColumnRuleOperationSchema.safeParse(operation)
      expect(result.success).toBe(false)
    })
  })
})

describe('Rule Utilities', () => {
  describe('validatePythonFormula', () => {
    it('should validate formulas with balanced parentheses', () => {
      const result = validatePythonFormula('($Price > 1000)')
      expect(result.valid).toBe(true)
    })

    it('should detect unbalanced opening parentheses', () => {
      const result = validatePythonFormula('($Price > 1000')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('parentheses')
    })

    it('should detect unbalanced closing parentheses', () => {
      const result = validatePythonFormula('$Price > 1000)')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('parentheses')
    })

    it('should detect single equals sign mistake', () => {
      const result = validatePythonFormula('$Status = "Active"')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('==')
    })

    it('should accept double equals for comparison', () => {
      const result = validatePythonFormula('$Status == "Active"')
      expect(result.valid).toBe(true)
    })

    it('should detect unmatched single quotes', () => {
      const result = validatePythonFormula("$Status == 'Active")
      expect(result.valid).toBe(false)
      expect(result.error).toContain('quote')
    })

    it('should detect unmatched double quotes', () => {
      const result = validatePythonFormula('$Status == "Active')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('quote')
    })

    it('should warn about missing $ prefix (but still valid)', () => {
      const result = validatePythonFormula('Price > 1000')
      expect(result.valid).toBe(true)
      expect(result.error).toContain('$')
    })
  })

  describe('parseRulesFromGrist / serializeRulesForGrist', () => {
    it('should parse valid rules JSON', () => {
      const json = JSON.stringify([
        { colRef: 123, style: { fillColor: '#FF0000' } },
        { colRef: 124, style: { textColor: '#FFFFFF' } }
      ])

      const rules = parseRulesFromGrist(json)
      expect(rules).toHaveLength(2)
      expect(rules[0].colRef).toBe(123)
      expect(rules[1].colRef).toBe(124)
    })

    it('should return empty array for empty string', () => {
      const rules = parseRulesFromGrist('')
      expect(rules).toEqual([])
    })

    it('should throw for invalid JSON', () => {
      expect(() => parseRulesFromGrist('not json')).toThrow('parse')
    })

    it('should serialize rules back to JSON', () => {
      const rules: GristConditionalRuleRaw[] = [{ colRef: 123, style: { fillColor: '#FF0000' } }]

      const json = serializeRulesForGrist(rules)
      expect(json).toBe(JSON.stringify(rules))
    })

    it('should round-trip correctly', () => {
      const original: GristConditionalRuleRaw[] = [
        { colRef: 123, style: { fillColor: '#FF0000', fontBold: true } }
      ]

      const json = serializeRulesForGrist(original)
      const parsed = parseRulesFromGrist(json)

      expect(parsed).toEqual(original)
    })
  })

  describe('styleOptions serialization', () => {
    it('should serialize style options removing undefined values', () => {
      const style = {
        fillColor: '#FF0000',
        textColor: undefined,
        fontBold: true
      }

      const json = serializeStyleOptions(style)
      const parsed = JSON.parse(json)

      expect(parsed).toEqual({
        fillColor: '#FF0000',
        fontBold: true
      })
      expect(parsed.textColor).toBeUndefined()
    })

    it('should parse style options from string', () => {
      const json = '{"fillColor":"#FF0000","fontBold":true}'
      const style = parseStyleOptions(json)

      expect(style.fillColor).toBe('#FF0000')
      expect(style.fontBold).toBe(true)
    })

    it('should parse style options from object', () => {
      const obj = { fillColor: '#FF0000', fontBold: true }
      const style = parseStyleOptions(obj)

      expect(style.fillColor).toBe('#FF0000')
      expect(style.fontBold).toBe(true)
    })
  })

  describe('formatRuleForMarkdown', () => {
    it('should format rule with all style options', () => {
      const rule: ConditionalRuleDisplay = {
        index: 0,
        formula: '$Price > 1000',
        style: {
          fillColor: '#FF0000',
          textColor: '#FFFFFF',
          fontBold: true,
          fontItalic: true
        }
      }

      const markdown = formatRuleForMarkdown(rule, 0)

      expect(markdown).toContain('Rule 1')
      expect(markdown).toContain('$Price > 1000')
      expect(markdown).toContain('#FF0000')
      expect(markdown).toContain('#FFFFFF')
      expect(markdown).toContain('Bold')
      expect(markdown).toContain('Italic')
    })

    it('should format rule with minimal style', () => {
      const rule: ConditionalRuleDisplay = {
        index: 0,
        formula: '$Status == "Active"',
        style: {
          fillColor: '#10B981'
        }
      }

      const markdown = formatRuleForMarkdown(rule, 0)

      expect(markdown).toContain('Rule 1')
      expect(markdown).toContain('$Status == "Active"')
      expect(markdown).toContain('#10B981')
      expect(markdown).not.toContain('Font:')
    })
  })

  describe('formatRulesListMarkdown', () => {
    it('should format multiple rules with priority indication', () => {
      const rules: ConditionalRuleDisplay[] = [
        {
          index: 0,
          formula: '$Price > 1000',
          style: { fillColor: '#FF0000' }
        },
        {
          index: 1,
          formula: '$Price > 500',
          style: { fillColor: '#FFFF00' }
        }
      ]

      const markdown = formatRulesListMarkdown(rules, 'Price')

      expect(markdown).toContain('Price')
      expect(markdown).toContain('Rule 1')
      expect(markdown).toContain('Highest Priority')
      expect(markdown).toContain('Rule 2')
      expect(markdown).toContain('Total: 2 rules')
      expect(markdown).toContain('First matching rule wins')
    })

    it('should format empty rules list', () => {
      const markdown = formatRulesListMarkdown([], 'Status')

      expect(markdown).toContain('Status')
      expect(markdown).toContain('No conditional formatting rules')
    })
  })

  describe('isConditionalRuleHelperColumn', () => {
    it('should identify helper columns', () => {
      expect(isConditionalRuleHelperColumn('gristHelper_ConditionalRule')).toBe(true)
      expect(isConditionalRuleHelperColumn('gristHelper_ConditionalRule2')).toBe(true)
      expect(isConditionalRuleHelperColumn('gristHelper_ConditionalRule99')).toBe(true)
    })

    it('should reject non-helper columns', () => {
      expect(isConditionalRuleHelperColumn('Price')).toBe(false)
      expect(isConditionalRuleHelperColumn('Status')).toBe(false)
      expect(isConditionalRuleHelperColumn('gristHelper_Display')).toBe(false)
    })
  })
})

describe('ConditionalRulesInputSchema (Unified Schema)', () => {
  const validDocId = 'aKt7TZe8YGLp3ak8bDL8TZ'

  describe('Column scope', () => {
    it('should accept valid column scope input', () => {
      const input = {
        docId: validDocId,
        scope: 'column',
        tableId: 'Products',
        colId: 'Price',
        operation: { action: 'list' }
      }

      const result = ConditionalRulesInputSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(isColumnScope(result.data)).toBe(true)
        expect(isRowScope(result.data)).toBe(false)
        expect(isFieldScope(result.data)).toBe(false)
      }
    })

    it('should require colId for column scope', () => {
      const input = {
        docId: validDocId,
        scope: 'column',
        tableId: 'Products',
        operation: { action: 'list' }
      }

      const result = ConditionalRulesInputSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should accept column scope with add operation', () => {
      const input = {
        docId: validDocId,
        scope: 'column',
        tableId: 'Products',
        colId: 'Price',
        operation: {
          action: 'add',
          rule: {
            formula: '$Price > 1000',
            style: { fillColor: '#FF0000' }
          }
        }
      }

      const result = ConditionalRulesInputSchema.safeParse(input)
      expect(result.success).toBe(true)
    })
  })

  describe('Row scope', () => {
    it('should accept valid row scope input (no widget ID needed)', () => {
      const input = {
        docId: validDocId,
        scope: 'row',
        tableId: 'Tasks',
        operation: { action: 'list' }
      }

      const result = ConditionalRulesInputSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(isRowScope(result.data)).toBe(true)
        expect(isColumnScope(result.data)).toBe(false)
        expect(isFieldScope(result.data)).toBe(false)
      }
    })

    it('should accept row scope with add operation', () => {
      const input = {
        docId: validDocId,
        scope: 'row',
        tableId: 'Tasks',
        operation: {
          action: 'add',
          rule: {
            formula: '$Status == "Overdue"',
            style: { fillColor: '#FFCCCC' }
          }
        }
      }

      const result = ConditionalRulesInputSchema.safeParse(input)
      expect(result.success).toBe(true)
    })
  })

  describe('Field scope', () => {
    it('should accept field scope with sectionId', () => {
      const input = {
        docId: validDocId,
        scope: 'field',
        tableId: 'Sales',
        colId: 'Amount',
        sectionId: 42,
        operation: { action: 'list' }
      }

      const result = ConditionalRulesInputSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(isFieldScope(result.data)).toBe(true)
        expect(isRowScope(result.data)).toBe(false)
        expect(isColumnScope(result.data)).toBe(false)
      }
    })

    it('should accept field scope with pageName and widgetTitle', () => {
      const input = {
        docId: validDocId,
        scope: 'field',
        tableId: 'Sales',
        colId: 'Amount',
        pageName: 'Dashboard',
        widgetTitle: 'Sales Table',
        operation: { action: 'list' }
      }

      const result = ConditionalRulesInputSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should require widget identification for field scope', () => {
      const input = {
        docId: validDocId,
        scope: 'field',
        tableId: 'Sales',
        colId: 'Amount',
        operation: { action: 'list' }
      }

      const result = ConditionalRulesInputSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should reject field scope with only pageName (missing widgetTitle)', () => {
      const input = {
        docId: validDocId,
        scope: 'field',
        tableId: 'Sales',
        colId: 'Amount',
        pageName: 'Dashboard',
        operation: { action: 'list' }
      }

      const result = ConditionalRulesInputSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should reject field scope with only widgetTitle (missing pageName)', () => {
      const input = {
        docId: validDocId,
        scope: 'field',
        tableId: 'Sales',
        colId: 'Amount',
        widgetTitle: 'Sales Table',
        operation: { action: 'list' }
      }

      const result = ConditionalRulesInputSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should require colId for field scope', () => {
      const input = {
        docId: validDocId,
        scope: 'field',
        tableId: 'Sales',
        sectionId: 42,
        operation: { action: 'list' }
      }

      const result = ConditionalRulesInputSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })

  describe('Invalid scopes', () => {
    it('should reject invalid scope value', () => {
      const input = {
        docId: validDocId,
        scope: 'invalid',
        tableId: 'Products',
        operation: { action: 'list' }
      }

      const result = ConditionalRulesInputSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should reject missing scope', () => {
      const input = {
        docId: validDocId,
        tableId: 'Products',
        colId: 'Price',
        operation: { action: 'list' }
      }

      const result = ConditionalRulesInputSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })

  describe('Type guards', () => {
    it('isColumnScope correctly identifies column scope', () => {
      const columnInput = {
        docId: validDocId,
        scope: 'column' as const,
        tableId: 'Products',
        colId: 'Price',
        operation: { action: 'list' as const }
      }

      const result = ConditionalRulesInputSchema.safeParse(columnInput)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(isColumnScope(result.data)).toBe(true)
      }
    })

    it('isRowScope correctly identifies row scope', () => {
      const rowInput = {
        docId: validDocId,
        scope: 'row' as const,
        tableId: 'Tasks',
        operation: { action: 'list' as const }
      }

      const result = ConditionalRulesInputSchema.safeParse(rowInput)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(isRowScope(result.data)).toBe(true)
      }
    })

    it('isFieldScope correctly identifies field scope', () => {
      const fieldInput = {
        docId: validDocId,
        scope: 'field' as const,
        tableId: 'Sales',
        colId: 'Amount',
        sectionId: 42,
        operation: { action: 'list' as const }
      }

      const result = ConditionalRulesInputSchema.safeParse(fieldInput)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(isFieldScope(result.data)).toBe(true)
      }
    })
  })
})
