/**
 * Python 3.12 Keywords and Reserved Identifiers
 *
 * These cannot be used as column IDs or table names in Grist because
 * Grist uses Python for formulas and internal processing.
 *
 * Source: https://docs.python.org/3/reference/lexical_analysis.html#keywords
 */

/**
 * Complete list of Python 3.12 keywords
 * Using Set for O(1) lookup performance
 */
export const PYTHON_KEYWORDS = new Set([
  // Boolean and None
  'False',
  'None',
  'True',

  // Logical operators
  'and',
  'not',
  'or',

  // Control flow
  'if',
  'elif',
  'else',
  'for',
  'while',
  'break',
  'continue',
  'pass',

  // Function and class definition
  'def',
  'class',
  'lambda',
  'return',
  'yield',

  // Exception handling
  'try',
  'except',
  'finally',
  'raise',

  // Import and module
  'import',
  'from',
  'as',

  // Scope and context
  'global',
  'nonlocal',
  'with',

  // Async/await (Python 3.5+)
  'async',
  'await',

  // Other
  'assert',
  'del',
  'in',
  'is'
])

/**
 * Grist system reserved prefixes that should not be used for user columns
 * These are used internally by Grist for metadata and helper columns
 */
export const GRIST_RESERVED_PREFIXES = [
  'gristHelper_', // Display helper columns (e.g., gristHelper_Display)
  '_grist_' // Metadata tables (e.g., _grist_Tables, _grist_Tables_column)
] as const

/**
 * Check if a string is a Python keyword
 *
 * @param identifier - String to check
 * @returns True if the identifier is a Python keyword
 */
export function isPythonKeyword(identifier: string): boolean {
  return PYTHON_KEYWORDS.has(identifier)
}

/**
 * Check if a string starts with a Grist reserved prefix
 *
 * @param identifier - String to check
 * @returns True if the identifier starts with a reserved prefix
 */
export function hasGristReservedPrefix(identifier: string): boolean {
  return GRIST_RESERVED_PREFIXES.some(prefix => identifier.startsWith(prefix))
}

/**
 * Get a descriptive error message for why an identifier is invalid
 *
 * @param identifier - The invalid identifier
 * @param type - Whether this is a column or table identifier
 * @returns Human-readable error message
 */
export function getPythonKeywordError(identifier: string, type: 'column' | 'table'): string {
  if (isPythonKeyword(identifier)) {
    return `${type} ID "${identifier}" is a Python keyword and cannot be used. ` +
      `Python keywords are reserved because Grist uses Python for formulas. ` +
      `Suggestion: Use "${identifier}_col" or "${identifier}_field" instead.`
  }

  if (hasGristReservedPrefix(identifier)) {
    const prefix = GRIST_RESERVED_PREFIXES.find(p => identifier.startsWith(p))
    return `${type} ID "${identifier}" starts with reserved prefix "${prefix}". ` +
      `This prefix is used internally by Grist for system columns. ` +
      `Suggestion: Use a different name without this prefix.`
  }

  return ''
}
