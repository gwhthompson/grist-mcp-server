/**
 * Identifier Validation for Grist Column and Table Names
 *
 * Grist uses Python for formulas, so column and table IDs must be valid Python identifiers.
 * Additionally, Grist has conventions (tables start uppercase) and reserved prefixes.
 */

import { PYTHON_KEYWORDS, GRIST_RESERVED_PREFIXES, getPythonKeywordError } from '../constants/python-keywords.js'

/**
 * Validate column identifier
 *
 * Column IDs must:
 * - Start with a letter (uppercase or lowercase) or underscore
 * - Contain only letters, digits, underscores
 * - Not be a Python keyword
 * - Not start with Grist reserved prefix
 * - Be unique (case-insensitive) within the table
 *
 * @param colId - Column identifier to validate
 * @param existingColIds - Optional array of existing column IDs in the table
 * @returns True if valid
 *
 * @example
 * isValidColId('ProductName') // ✅ true
 * isValidColId('product_name') // ✅ true
 * isValidColId('for') // ❌ false (Python keyword)
 * isValidColId('123abc') // ❌ false (starts with digit)
 */
export const isValidColId = (colId: string, existingColIds?: string[]): boolean => {
  if (!colId) return false

  // Check pattern: must start with letter or underscore
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(colId)) {
    return false
  }

  // Check Python keywords
  if (PYTHON_KEYWORDS.has(colId)) {
    return false
  }

  // Check Grist reserved prefixes
  for (const prefix of GRIST_RESERVED_PREFIXES) {
    if (colId.startsWith(prefix)) {
      return false
    }
  }

  // Check case-insensitive uniqueness
  if (existingColIds) {
    const upper = colId.toUpperCase()
    if (existingColIds.some(id => id.toUpperCase() === upper)) {
      return false
    }
  }

  return true
}

/**
 * Validate table identifier
 *
 * Table IDs must:
 * - Start with an UPPERCASE letter (Grist convention)
 * - Contain only letters, digits, underscores
 * - Not be a Python keyword
 * - Be unique (case-insensitive) within the document
 *
 * @param tableId - Table identifier to validate
 * @param existingTableIds - Optional array of existing table IDs in the document
 * @returns True if valid
 *
 * @example
 * isValidTableId('Products') // ✅ true
 * isValidTableId('products') // ❌ false (must start uppercase)
 * isValidTableId('for') // ❌ false (Python keyword)
 */
export const isValidTableId = (tableId: string, existingTableIds?: string[]): boolean => {
  if (!tableId) return false

  // Check pattern: must start with UPPERCASE letter (Grist convention)
  if (!/^[A-Z][a-zA-Z0-9_]*$/.test(tableId)) {
    return false
  }

  // Check Python keywords
  if (PYTHON_KEYWORDS.has(tableId)) {
    return false
  }

  // Check case-insensitive uniqueness
  if (existingTableIds) {
    const upper = tableId.toUpperCase()
    if (existingTableIds.some(id => id.toUpperCase() === upper)) {
      return false
    }
  }

  return true
}

/**
 * Get descriptive error message for invalid column identifier
 *
 * @param colId - Invalid column identifier
 * @param existingColIds - Optional array of existing column IDs
 * @returns Human-readable error message with actionable guidance
 */
export function getColIdError(colId: string, existingColIds?: string[]): string {
  if (!colId) {
    return 'Column ID cannot be empty'
  }

  // Check length (reasonable database limit)
  if (colId.length > 64) {
    return `Column ID too long (${colId.length} chars, max: 64). Use shorter name.`
  }

  // Check pattern
  if (/^[0-9]/.test(colId)) {
    return `Column ID cannot start with digit (got: "${colId}"). Suggestion: "${colId[0]}_${colId.slice(1)}"`
  }

  if (!/^[a-zA-Z_]/.test(colId)) {
    return `Column ID must start with letter or underscore (got: "${colId}")`
  }

  const invalidChars = colId.match(/[^a-zA-Z0-9_]/g)
  if (invalidChars) {
    return `Column ID contains invalid characters: ${invalidChars.join(', ')} (only letters, digits, underscores allowed). Got: "${colId}"`
  }

  // Check Python keywords
  const keywordError = getPythonKeywordError(colId, 'column')
  if (keywordError) {
    return keywordError
  }

  // Check case-insensitive duplicates
  if (existingColIds) {
    const upper = colId.toUpperCase()
    const duplicate = existingColIds.find(id => id.toUpperCase() === upper && id !== colId)
    if (duplicate) {
      return `Column ID "${colId}" conflicts with existing column "${duplicate}" (case-insensitive match). Column IDs must be unique ignoring case.`
    }
  }

  return '' // Valid
}

/**
 * Get descriptive error message for invalid table identifier
 *
 * @param tableId - Invalid table identifier
 * @param existingTableIds - Optional array of existing table IDs
 * @returns Human-readable error message with actionable guidance
 */
export function getTableIdError(tableId: string, existingTableIds?: string[]): string {
  if (!tableId) {
    return 'Table ID cannot be empty'
  }

  // Check length
  if (tableId.length > 64) {
    return `Table ID too long (${tableId.length} chars, max: 64). Use shorter name.`
  }

  // Check uppercase start (Grist convention)
  if (/^[a-z]/.test(tableId)) {
    return `Table ID must start with UPPERCASE letter (got: "${tableId}"). Suggestion: "${tableId[0].toUpperCase()}${tableId.slice(1)}"`
  }

  // Check pattern
  if (/^[0-9]/.test(tableId)) {
    return `Table ID cannot start with digit (got: "${tableId}")`
  }

  if (!/^[A-Z]/.test(tableId)) {
    return `Table ID must start with UPPERCASE letter (got: "${tableId}")`
  }

  const invalidChars = tableId.match(/[^a-zA-Z0-9_]/g)
  if (invalidChars) {
    return `Table ID contains invalid characters: ${invalidChars.join(', ')} (only letters, digits, underscores allowed). Got: "${tableId}"`
  }

  // Check Python keywords
  const keywordError = getPythonKeywordError(tableId, 'table')
  if (keywordError) {
    return keywordError
  }

  // Check case-insensitive duplicates
  if (existingTableIds) {
    const upper = tableId.toUpperCase()
    const duplicate = existingTableIds.find(id => id.toUpperCase() === upper && id !== tableId)
    if (duplicate) {
      return `Table ID "${tableId}" conflicts with existing table "${duplicate}" (case-insensitive match). Table IDs must be unique ignoring case.`
    }
  }

  return '' // Valid
}

/**
 * Validate Grist document ID
 *
 * Document IDs use base58 encoding with exactly 22 characters.
 * Excludes visually ambiguous characters: 0, O, I, l
 * Includes: 1-9, A-H, J-N, P-Z, a-k, m-z
 *
 * @param docId - Document ID to validate
 * @returns True if valid base58 format
 *
 * @example
 * isValidDocId('fdCVLvgAPAD1HXhQcGHCyz') // ✅ true (actual Grist docId)
 * isValidDocId('contains-O-or-0') // ❌ false (contains excluded chars)
 * isValidDocId('tooshort') // ❌ false (< 22 chars)
 */
export function isValidDocId(docId: string): boolean {
  // Exact base58 pattern: 22 characters, excludes 0, O, I, l
  // Note: "1" is INCLUDED (standard base58)
  return /^[1-9A-HJ-NP-Za-km-z]{22}$/.test(docId)
}

/**
 * Get error message for invalid document ID
 *
 * @param docId - Invalid document ID
 * @returns Descriptive error message
 */
export function getDocIdError(docId: string): string {
  if (!docId) {
    return 'Document ID cannot be empty'
  }

  if (docId.length !== 22) {
    return `Document ID must be exactly 22 characters (got: ${docId.length}). Document IDs are base58 encoded.`
  }

  // Check for excluded characters
  const excludedChars = ['0', 'O', 'I', 'l']
  for (const char of excludedChars) {
    if (docId.includes(char)) {
      return `Document ID contains excluded character "${char}". Base58 excludes 0, O, I, l for visual clarity.`
    }
  }

  const invalidChars = docId.match(/[^1-9A-HJ-NP-Za-km-z]/g)
  if (invalidChars) {
    return `Document ID contains invalid characters: ${invalidChars.join(', ')}. Must be base58 (1-9, A-H, J-N, P-Z, a-k, m-z).`
  }

  return '' // Valid
}
