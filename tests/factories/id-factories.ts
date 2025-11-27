/**
 * Type-safe factory functions for generating test IDs
 * Uses branded types to prevent ID mixing at compile-time
 *
 * Based on test-architecture-review.md Factory Pattern recommendations
 */

import type { ColId, DocId, TableId, WorkspaceId } from '../../src/types/advanced.js'

/**
 * Configuration for ID generation
 */
export interface IdFactoryConfig {
  prefix?: string
  includeTimestamp?: boolean
  suffix?: string
}

/**
 * Generate valid DocId (Base58, 22 characters)
 * Excludes visually ambiguous characters: 0, O, I, l
 *
 * @param config - Optional configuration
 * @returns Valid DocId branded type
 *
 * @example
 * const docId = createDocId() // "mRYz2a3KpN7jTbV9XcWdEf"
 * const customDocId = createDocId({ prefix: 'test' }) // Uses 'test' in generation
 */
export function createDocId(_config: IdFactoryConfig = {}): DocId {
  // Base58 alphabet: 1-9, A-H, J-N, P-Z, a-k, m-z (excludes 0, O, I, l)
  const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz'

  // Generate 22-character Base58 string
  const id = Array.from(
    { length: 22 },
    () => base58[Math.floor(Math.random() * base58.length)]
  ).join('')

  return id as DocId
}

/**
 * Generate valid TableId (UPPERCASE start, Python identifier)
 * Ensures no Python keywords and follows Grist conventions
 *
 * @param config - Optional configuration
 * @returns Valid TableId branded type
 *
 * @example
 * const tableId = createTableId() // "TestTable1234567890"
 * const namedTableId = createTableId({ prefix: 'Products' }) // "Products1234567890"
 */
export function createTableId(config: IdFactoryConfig = {}): TableId {
  const { prefix = 'Test', includeTimestamp = true, suffix = '' } = config

  // Python keywords to avoid (only capitalized ones that could conflict)
  const capitalizedKeywords = new Set(['True', 'False', 'None'])

  let tableId = prefix

  // Ensure UPPERCASE start (Grist convention)
  if (tableId.length > 0) {
    tableId = tableId[0].toUpperCase() + tableId.slice(1)
  }

  // Add timestamp for uniqueness
  if (includeTimestamp) {
    tableId += Date.now()
  }

  // Add suffix if provided
  if (suffix) {
    tableId += suffix
  }

  // Avoid Python keywords by appending suffix
  if (capitalizedKeywords.has(tableId)) {
    tableId += '_Table'
  }

  // Ensure valid format: starts with uppercase letter
  if (!/^[A-Z]/.test(tableId)) {
    tableId = `T${tableId}`
  }

  return tableId as TableId
}

/**
 * Generate valid ColId (Python identifier)
 * Can start with uppercase, lowercase, or underscore
 * Ensures no Python keywords and no reserved prefixes
 *
 * @param config - Optional configuration
 * @returns Valid ColId branded type
 *
 * @example
 * const colId = createColId() // "field1234567890"
 * const namedColId = createColId({ prefix: 'email' }) // "email1234567890"
 */
export function createColId(config: IdFactoryConfig = {}): ColId {
  const { prefix = 'field', includeTimestamp = true, suffix = '' } = config

  // Python keywords to avoid (lowercase for columns)
  const pythonKeywords = new Set([
    'for',
    'class',
    'if',
    'def',
    'return',
    'import',
    'from',
    'while',
    'with',
    'try',
    'except',
    'finally',
    'raise',
    'assert',
    'break',
    'continue',
    'pass',
    'lambda',
    'yield',
    'global',
    'nonlocal',
    'del',
    'True',
    'False',
    'None',
    'and',
    'or',
    'not',
    'in',
    'is',
    'as',
    'elif',
    'else'
  ])

  let colId = prefix

  // Add timestamp for uniqueness
  if (includeTimestamp) {
    colId += Date.now()
  }

  // Add suffix if provided
  if (suffix) {
    colId += suffix
  }

  // Avoid Python keywords
  if (pythonKeywords.has(colId)) {
    colId += '_col'
  }

  // Avoid reserved prefixes
  if (colId.startsWith('gristHelper_') || colId.startsWith('_grist_')) {
    colId = `col_${colId}`
  }

  // Ensure valid format: starts with letter or underscore
  if (!/^[a-zA-Z_]/.test(colId)) {
    colId = `_${colId}`
  }

  return colId as ColId
}

/**
 * Generate valid WorkspaceId (positive integer)
 *
 * @param config - Optional configuration
 * @returns Valid WorkspaceId branded type
 *
 * @example
 * const workspaceId = createWorkspaceId() // Random positive integer
 * const specificId = 123 as WorkspaceId // Type-safe cast
 */
export function createWorkspaceId(): WorkspaceId {
  // Generate random positive integer (1-9999)
  const id = Math.floor(Math.random() * 9999) + 1
  return id as WorkspaceId
}

/**
 * Create multiple DocIds
 *
 * @param count - Number of IDs to generate
 * @returns Array of unique DocIds
 *
 * @example
 * const docIds = createDocIds(5) // [DocId, DocId, DocId, DocId, DocId]
 */
export function createDocIds(count: number): DocId[] {
  return Array.from({ length: count }, () => createDocId())
}

/**
 * Create multiple TableIds with sequential suffixes
 *
 * @param count - Number of IDs to generate
 * @param basePrefix - Base prefix for all table names
 * @returns Array of unique TableIds
 *
 * @example
 * const tableIds = createTableIds(3, 'Product') // ["Product1", "Product2", "Product3"]
 */
export function createTableIds(count: number, basePrefix = 'Test'): TableId[] {
  return Array.from({ length: count }, (_, i) =>
    createTableId({ prefix: `${basePrefix}${i + 1}`, includeTimestamp: false })
  )
}

/**
 * Create multiple ColIds with sequential suffixes
 *
 * @param count - Number of IDs to generate
 * @param basePrefix - Base prefix for all column names
 * @returns Array of unique ColIds
 *
 * @example
 * const colIds = createColIds(3, 'field') // ["field1", "field2", "field3"]
 */
export function createColIds(count: number, basePrefix = 'field'): ColId[] {
  return Array.from({ length: count }, (_, i) =>
    createColId({ prefix: `${basePrefix}${i + 1}`, includeTimestamp: false })
  )
}

/**
 * Create multiple WorkspaceIds
 *
 * @param count - Number of IDs to generate
 * @returns Array of unique WorkspaceIds
 *
 * @example
 * const workspaceIds = createWorkspaceIds(3) // [123, 456, 789]
 */
export function createWorkspaceIds(count: number): WorkspaceId[] {
  const ids = new Set<number>()

  while (ids.size < count) {
    ids.add(Math.floor(Math.random() * 9999) + 1)
  }

  return Array.from(ids) as WorkspaceId[]
}
