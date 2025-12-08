// Grist uses Python for formulas, so identifiers must be valid Python identifiers.
// Tables start uppercase (Grist convention).

import {
  GRIST_RESERVED_PREFIXES,
  getPythonKeywordError,
  PYTHON_KEYWORDS
} from '../constants/python-keywords.js'

/** Validates column ID against Python identifier rules and Grist conventions. */
export const isValidColId = (colId: string, existingColIds?: string[]): boolean => {
  if (!colId) return false

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(colId)) {
    return false
  }

  if (PYTHON_KEYWORDS.has(colId)) {
    return false
  }

  for (const prefix of GRIST_RESERVED_PREFIXES) {
    if (colId.startsWith(prefix)) {
      return false
    }
  }

  if (existingColIds) {
    const upper = colId.toUpperCase()
    if (existingColIds.some((id) => id.toUpperCase() === upper)) {
      return false
    }
  }

  return true
}

/** Validates table ID (must start uppercase, valid Python identifier). */
export const isValidTableId = (tableId: string, existingTableIds?: string[]): boolean => {
  if (!tableId) return false

  if (!/^[A-Z][a-zA-Z0-9_]*$/.test(tableId)) {
    return false
  }

  if (PYTHON_KEYWORDS.has(tableId)) {
    return false
  }

  if (existingTableIds) {
    const upper = tableId.toUpperCase()
    if (existingTableIds.some((id) => id.toUpperCase() === upper)) {
      return false
    }
  }

  return true
}

/** Returns descriptive error message for invalid column ID, or empty string if valid. */
export function getColIdError(colId: string, existingColIds?: string[]): string {
  if (!colId) {
    return 'Column ID cannot be empty'
  }

  if (colId.length > 64) {
    return `Column ID too long (${colId.length} chars, max: 64). Use shorter name.`
  }

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

  const keywordError = getPythonKeywordError(colId, 'column')
  if (keywordError) {
    return keywordError
  }

  if (existingColIds) {
    const upper = colId.toUpperCase()
    const duplicate = existingColIds.find((id) => id.toUpperCase() === upper && id !== colId)
    if (duplicate) {
      return `Column ID "${colId}" conflicts with existing column "${duplicate}" (case-insensitive match). Column IDs must be unique ignoring case.`
    }
  }

  return ''
}

export function getTableIdError(tableId: string, existingTableIds?: string[]): string {
  if (!tableId) {
    return 'Table ID cannot be empty'
  }

  if (tableId.length > 64) {
    return `Table ID too long (${tableId.length} chars, max: 64). Use shorter name.`
  }

  if (/^[a-z]/.test(tableId)) {
    const firstChar = tableId[0] ?? ''
    return `Table ID must start with UPPERCASE letter (got: "${tableId}"). Suggestion: "${firstChar.toUpperCase()}${tableId.slice(1)}"`
  }

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

  const keywordError = getPythonKeywordError(tableId, 'table')
  if (keywordError) {
    return keywordError
  }

  if (existingTableIds) {
    const upper = tableId.toUpperCase()
    const duplicate = existingTableIds.find((id) => id.toUpperCase() === upper && id !== tableId)
    if (duplicate) {
      return `Table ID "${tableId}" conflicts with existing table "${duplicate}" (case-insensitive match). Table IDs must be unique ignoring case.`
    }
  }

  return ''
}

// Base58, 22 chars, excludes 0/O/I/l for visual clarity
export function isValidDocId(docId: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{22}$/.test(docId)
}

export function getDocIdError(docId: string): string {
  if (!docId) {
    return 'Document ID cannot be empty'
  }

  if (docId.length !== 22) {
    return `Document ID must be exactly 22 characters (got: ${docId.length}). Document IDs are base58 encoded.`
  }

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

  return ''
}
