import type {
  ConditionalFormatOptions,
  ConditionalRuleDisplay,
  GristConditionalRuleRaw
} from '../schemas/conditional-rules.js'

/** Regex to match comparison operators (==, !=, <=, >=, <>, etc.) */
const COMPARISON_OPERATORS_REGEX = /[=!<>]=|==|!=/

/** Regex to detect single = assignment used incorrectly in comparison */
const SINGLE_EQUAL_REGEX = /\$\w+\s*=\s*[^=]/

/** Regex to match potential column references (capitalized identifiers) */
const COLUMN_REF_PATTERN = /\b[A-Z][A-Za-z0-9_]*\b/

export interface FormulaValidationResult {
  valid: boolean
  error?: string
  suggestions?: string[]
}

// Validator returns null if check passes, or a FormulaValidationResult if it fails/warns
type FormulaValidator = (formula: string) => FormulaValidationResult | null

/** Check for balanced parentheses */
function validateParentheses(formula: string): FormulaValidationResult | null {
  let parenCount = 0
  for (const char of formula) {
    if (char === '(') parenCount++
    if (char === ')') parenCount--
    if (parenCount < 0) {
      return {
        valid: false,
        error: 'Unbalanced parentheses: closing parenthesis without matching opening parenthesis',
        suggestions: ['Check that each ")" has a corresponding "("']
      }
    }
  }
  if (parenCount > 0) {
    return {
      valid: false,
      error: 'Unbalanced parentheses: unclosed opening parenthesis',
      suggestions: ['Check that each "(" has a corresponding ")"']
    }
  }
  return null
}

/** Check for incorrect assignment operator (= instead of ==) */
function validateAssignmentOperator(formula: string): FormulaValidationResult | null {
  if (formula.includes('=') && !COMPARISON_OPERATORS_REGEX.test(formula)) {
    if (SINGLE_EQUAL_REGEX.test(formula)) {
      return {
        valid: false,
        error: 'Invalid equality operator: use "==" for comparison, not "="',
        suggestions: [
          'Python uses "==" for equality comparison',
          'Example: "$Status == \\"Active\\"" not "$Status = \\"Active\\""'
        ]
      }
    }
  }
  return null
}

/** Check for balanced single quotes */
function validateSingleQuotes(formula: string): FormulaValidationResult | null {
  const count = (formula.match(/'/g) || []).length
  if (count % 2 !== 0) {
    return {
      valid: false,
      error: "Unmatched single quote (') in formula",
      suggestions: ['Ensure all single quotes are properly closed']
    }
  }
  return null
}

/** Check for balanced double quotes */
function validateDoubleQuotes(formula: string): FormulaValidationResult | null {
  const count = (formula.match(/"/g) || []).length
  if (count % 2 !== 0) {
    return {
      valid: false,
      error: 'Unmatched double quote (") in formula',
      suggestions: ['Ensure all double quotes are properly closed']
    }
  }
  return null
}

/** Check for missing $ prefix on column references (warning only) */
function validateColumnReferences(formula: string): FormulaValidationResult | null {
  const match = formula.match(COLUMN_REF_PATTERN)
  if (match && !formula.includes(`$${match[0]}`)) {
    return {
      valid: true,
      error: `Possible missing $ prefix for column reference "${match[0]}"`,
      suggestions: [
        `Did you mean "$${match[0]}"?`,
        'Column references in formulas should start with $ (e.g., "$Price", "$Status")'
      ]
    }
  }
  return null
}

// Validator chain - each validator returns null to pass, or a result to stop
const FORMULA_VALIDATORS: FormulaValidator[] = [
  validateParentheses,
  validateAssignmentOperator,
  validateSingleQuotes,
  validateDoubleQuotes,
  validateColumnReferences
]

// Basic validation to catch common errors - not a full Python parser
export function validatePythonFormula(formula: string): FormulaValidationResult {
  const trimmed = formula.trim()

  for (const validator of FORMULA_VALIDATORS) {
    const result = validator(trimmed)
    if (result !== null) return result
  }

  return { valid: true }
}

export function parseRulesFromGrist(rulesJson: string): GristConditionalRuleRaw[] {
  try {
    if (!rulesJson || rulesJson.trim() === '') {
      return []
    }

    const parsed = JSON.parse(rulesJson)

    if (!Array.isArray(parsed)) {
      throw new Error('Rules field is not an array')
    }

    return parsed as GristConditionalRuleRaw[]
  } catch (error) {
    throw new Error(
      `Failed to parse conditional formatting rules: ${error instanceof Error ? error.message : 'Invalid JSON'}`
    )
  }
}

export function serializeRulesForGrist(rules: GristConditionalRuleRaw[]): string {
  return JSON.stringify(rules)
}

export function formatRuleForMarkdown(rule: ConditionalRuleDisplay, index: number): string {
  const lines: string[] = []

  lines.push(`**Rule ${index + 1}**`)
  lines.push(`- Formula: \`${rule.formula}\``)

  const style = rule.style

  if (style.fillColor) {
    lines.push(`- Fill Color: \`${style.fillColor}\``)
  }

  if (style.textColor) {
    lines.push(`- Text Color: \`${style.textColor}\``)
  }

  const fontStyles: string[] = []
  if (style.fontBold) fontStyles.push('Bold')
  if (style.fontItalic) fontStyles.push('Italic')
  if (style.fontUnderline) fontStyles.push('Underline')
  if (style.fontStrikethrough) fontStyles.push('Strikethrough')

  if (fontStyles.length > 0) {
    lines.push(`- Font: ${fontStyles.join(', ')}`)
  }

  return lines.join('\n')
}

export function formatRulesListMarkdown(rules: ConditionalRuleDisplay[], colId: string): string {
  if (rules.length === 0) {
    return `# Conditional Formatting Rules for Column: ${colId}\n\nNo conditional formatting rules configured.`
  }

  const lines: string[] = []

  lines.push(`# Conditional Formatting Rules for Column: ${colId}\n`)

  for (let i = 0; i < rules.length; i++) {
    // Safe: loop bound guarantees rules[i] exists
    const rule = rules[i] as ConditionalRuleDisplay
    if (i === 0) {
      lines.push(`${formatRuleForMarkdown(rule, i)} (Highest Priority)`)
    } else {
      lines.push(formatRuleForMarkdown(rule, i))
    }
    lines.push('') // Blank line between rules
  }

  lines.push('---')
  lines.push(`Total: ${rules.length} rule${rules.length === 1 ? '' : 's'}`)
  lines.push('Note: Rules are evaluated in order. First matching rule wins.')

  return lines.join('\n')
}

export function serializeStyleOptions(style: ConditionalFormatOptions): string {
  const cleanStyle: Record<string, unknown> = {}

  if (style.textColor !== undefined) cleanStyle.textColor = style.textColor
  if (style.fillColor !== undefined) cleanStyle.fillColor = style.fillColor
  if (style.fontBold !== undefined) cleanStyle.fontBold = style.fontBold
  if (style.fontItalic !== undefined) cleanStyle.fontItalic = style.fontItalic
  if (style.fontUnderline !== undefined) cleanStyle.fontUnderline = style.fontUnderline
  if (style.fontStrikethrough !== undefined) cleanStyle.fontStrikethrough = style.fontStrikethrough

  return JSON.stringify(cleanStyle)
}

export function parseStyleOptions(
  styleJson: string | Record<string, unknown>
): ConditionalFormatOptions {
  const parsed = typeof styleJson === 'string' ? JSON.parse(styleJson) : styleJson

  return {
    textColor: parsed.textColor as string | undefined,
    fillColor: parsed.fillColor as string | undefined,
    fontBold: parsed.fontBold as boolean | undefined,
    fontItalic: parsed.fontItalic as boolean | undefined,
    fontUnderline: parsed.fontUnderline as boolean | undefined,
    fontStrikethrough: parsed.fontStrikethrough as boolean | undefined
  }
}

// Re-export from grist-cell-formats for backwards compatibility
export {
  encodeRefList as encodeGristList,
  type NaturalRefList,
  parseGristJson,
  parseRefList as parseGristList,
  type WireRefList
} from '../types/grist-cell-formats.js'

export function generateHelperColumnName(_tableId: string, index?: number): string {
  if (index === undefined || index === 0) {
    return 'gristHelper_ConditionalRule'
  }
  return `gristHelper_ConditionalRule${index + 1}`
}

export function isConditionalRuleHelperColumn(colId: string): boolean {
  return colId.startsWith('gristHelper_ConditionalRule')
}
