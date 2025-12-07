import type {
  ConditionalFormatOptions,
  ConditionalRuleDisplay,
  GristConditionalRuleRaw
} from '../schemas/conditional-rules.js'

export interface FormulaValidationResult {
  valid: boolean
  error?: string
  suggestions?: string[]
}

// Basic validation to catch common errors - not a full Python parser
export function validatePythonFormula(formula: string): FormulaValidationResult {
  const trimmed = formula.trim()

  let parenCount = 0
  for (const char of trimmed) {
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

  if (trimmed.includes('=') && !trimmed.match(/[=!<>]=|==|!=/)) {
    const singleEqualMatch = trimmed.match(/\$\w+\s*=\s*[^=]/)
    if (singleEqualMatch) {
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

  const singleQuotes = (trimmed.match(/'/g) || []).length
  const doubleQuotes = (trimmed.match(/"/g) || []).length

  if (singleQuotes % 2 !== 0) {
    return {
      valid: false,
      error: "Unmatched single quote (') in formula",
      suggestions: ['Ensure all single quotes are properly closed']
    }
  }

  if (doubleQuotes % 2 !== 0) {
    return {
      valid: false,
      error: 'Unmatched double quote (") in formula',
      suggestions: ['Ensure all double quotes are properly closed']
    }
  }

  const columnRefPattern = /\b[A-Z][A-Za-z0-9_]*\b/
  const match = trimmed.match(columnRefPattern)
  if (match && !trimmed.includes(`$${match[0]}`)) {
    return {
      valid: true,
      error: `Possible missing $ prefix for column reference "${match[0]}"`,
      suggestions: [
        `Did you mean "$${match[0]}"?`,
        'Column references in formulas should start with $ (e.g., "$Price", "$Status")'
      ]
    }
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
    const rule = rules[i]
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
