/**
 * Domain Schema Operations
 *
 * High-level column and table operations with built-in verification.
 * Every write operation reads back and verifies the result.
 *
 * Verification pattern:
 *   WRITE ──► Grist ──► READ BACK ──► VERIFY (deepEqual)
 *
 * This ensures data integrity: if the function returns without throwing,
 * the operation was successful and the data matches what was written.
 */

import {
  type VerificationCheck,
  VerificationError,
  type VerificationResult
} from '../../errors/VerificationError.js'
import type { ToolContext } from '../../registry/types.js'
import { ApplyResponseSchema } from '../../schemas/api-responses.js'
import {
  buildAddColumnAction,
  buildAddTableAction,
  buildModifyColumnAction,
  buildRemoveColumnAction,
  buildRemoveTableAction,
  buildRenameColumnAction,
  buildRenameTableAction
} from '../../services/action-builder.js'
import { serializeUserAction } from '../../services/action-serializer.js'
import type { ColumnMetadata } from '../../services/schema-cache.js'
import type { DocId, TableId } from '../../types/advanced.js'
import { toColId, toDocId, toTableId } from '../../types/advanced.js'
import type { ApplyResponse } from '../../types.js'
import { validateRetValues } from '../../validators/apply-response.js'
// =============================================================================
// Domain Types (inlined from deleted domain/schemas/table.ts)
// =============================================================================

export interface DomainColumn {
  tableId: string
  colId: string
  type: string
  label?: string
  isFormula: boolean
  formula?: string
  visibleCol?: number
  widgetOptions?: Record<string, unknown>
}

export interface DomainTable {
  docId: string
  tableId: string
  columns?: DomainColumn[]
}

export interface AddColumnInput {
  colId: string
  type: string
  label?: string
  isFormula?: boolean
  formula?: string
  visibleCol?: string | number
  widgetOptions?: Record<string, unknown>
}

export interface ModifyColumnInput {
  type?: string
  label?: string
  isFormula?: boolean
  formula?: string
  visibleCol?: string | number
  widgetOptions?: Record<string, unknown>
}

export interface AddColumnResult {
  entity: DomainColumn
  verified: true
  colRef: number
}

export interface ModifyColumnResult {
  entity: DomainColumn
  verified: true
}

export interface RemoveColumnResult {
  tableId: string
  colId: string
  deleted: true
  verified: true
}

export interface RenameColumnResult {
  entity: DomainColumn
  verified: true
  oldColId: string
}

export interface CreateTableInput {
  tableId: string
  columns?: AddColumnInput[]
}

export interface CreateTableResult {
  entity: DomainTable
  verified: true
}

export interface RenameTableResult {
  entity: DomainTable
  verified: true
  oldTableId: string
}

export interface DeleteTableResult {
  tableId: string
  deleted: true
  verified: true
}

import { deepEqual, throwIfFailed } from './base.js'

// =============================================================================
// Column Read Operations
// =============================================================================

/**
 * Get all columns from a table.
 * Returns columns in DomainColumn shape with parsed widgetOptions.
 */
export async function getColumns(
  ctx: ToolContext,
  docId: DocId | string,
  tableId: TableId | string
): Promise<DomainColumn[]> {
  const docIdStr = typeof docId === 'string' ? docId : String(docId)
  const tableIdStr = typeof tableId === 'string' ? tableId : String(tableId)

  const columns = await ctx.schemaCache.getFreshColumns(toDocId(docIdStr), toTableId(tableIdStr))

  return columns.map((col) => apiColumnToDomain(tableIdStr, col))
}

/**
 * Get a single column by ID.
 * Returns null if not found.
 */
export async function getColumn(
  ctx: ToolContext,
  docId: DocId | string,
  tableId: TableId | string,
  colId: string
): Promise<DomainColumn | null> {
  const columns = await getColumns(ctx, docId, tableId)
  return columns.find((c) => c.colId === colId) ?? null
}

// =============================================================================
// Column Write Operations with Verification
// =============================================================================

/**
 * Add a column to a table and verify it was created.
 *
 * @returns Added column with its assigned colRef
 * @throws VerificationError if column couldn't be verified after creation
 */
export async function addColumn(
  ctx: ToolContext,
  docId: DocId | string,
  tableId: TableId | string,
  input: AddColumnInput,
  options: { verify?: boolean } = {}
): Promise<AddColumnResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)
  const tableIdStr = typeof tableId === 'string' ? tableId : String(tableId)
  const tableIdBranded = toTableId(tableIdStr)
  const colIdBranded = toColId(input.colId)

  // Build the action
  const action = buildAddColumnAction(tableIdBranded, colIdBranded, {
    type: input.type,
    label: input.label,
    isFormula: input.isFormula,
    formula: input.formula,
    visibleCol: typeof input.visibleCol === 'number' ? input.visibleCol : undefined,
    widgetOptions: input.widgetOptions
  })

  // Execute the write
  const response = await ctx.client.post<ApplyResponse>(
    `/docs/${docIdStr}/apply`,
    [serializeUserAction(action)],
    {
      schema: ApplyResponseSchema,
      context: `Adding column ${input.colId} to ${tableIdStr}`
    }
  )

  // Extract colRef from response
  const retValues = validateRetValues(response, { context: `AddColumn ${input.colId}` })
  const retValue = retValues[0] as { colRef?: number } | undefined
  const colRef = retValue?.colRef ?? 0

  // Build the expected domain column
  const writtenColumn: DomainColumn = {
    tableId: tableIdStr,
    colId: input.colId,
    type: input.type,
    label: input.label,
    isFormula: input.isFormula ?? false,
    formula: input.formula,
    visibleCol: typeof input.visibleCol === 'number' ? input.visibleCol : undefined,
    widgetOptions: input.widgetOptions
  }

  // Invalidate cache
  ctx.schemaCache.invalidateCache(toDocId(docIdStr), tableIdBranded)

  // Verify by reading back
  if (verify) {
    const readColumn = await getColumn(ctx, docIdStr, tableIdStr, input.colId)

    if (!readColumn) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: `Column ${input.colId} not found after add`,
              passed: false,
              expected: writtenColumn,
              actual: null
            }
          ]
        },
        {
          operation: 'addColumn',
          entityType: 'Column',
          entityId: `${tableIdStr}.${input.colId}`
        }
      )
    }

    const verification = verifyColumn(writtenColumn, readColumn)
    throwIfFailed(verification, {
      operation: 'addColumn',
      entityType: 'Column',
      entityId: `${tableIdStr}.${input.colId}`
    })
  }

  return { entity: writtenColumn, verified: true, colRef }
}

/**
 * Modify a column and verify the updates.
 *
 * @returns Modified column
 * @throws VerificationError if updates couldn't be verified
 */
export async function modifyColumn(
  ctx: ToolContext,
  docId: DocId | string,
  tableId: TableId | string,
  colId: string,
  updates: ModifyColumnInput,
  options: { verify?: boolean } = {}
): Promise<ModifyColumnResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)
  const tableIdStr = typeof tableId === 'string' ? tableId : String(tableId)
  const tableIdBranded = toTableId(tableIdStr)
  const colIdBranded = toColId(colId)

  // Build the action
  const action = buildModifyColumnAction(tableIdBranded, colIdBranded, {
    type: updates.type,
    label: updates.label,
    isFormula: updates.isFormula,
    formula: updates.formula,
    visibleCol: typeof updates.visibleCol === 'number' ? updates.visibleCol : undefined,
    widgetOptions: updates.widgetOptions
  })

  // Execute the write
  await ctx.client.post<ApplyResponse>(`/docs/${docIdStr}/apply`, [serializeUserAction(action)], {
    schema: ApplyResponseSchema,
    context: `Modifying column ${colId} in ${tableIdStr}`
  })

  // Invalidate cache
  ctx.schemaCache.invalidateCache(toDocId(docIdStr), tableIdBranded)

  // Verify by reading back
  if (verify) {
    const readColumn = await getColumn(ctx, docIdStr, tableIdStr, colId)

    if (!readColumn) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: `Column ${colId} not found after modify`,
              passed: false,
              expected: updates,
              actual: null
            }
          ]
        },
        {
          operation: 'modifyColumn',
          entityType: 'Column',
          entityId: `${tableIdStr}.${colId}`
        }
      )
    }

    // Verify only the fields we updated
    const checks: VerificationCheck[] = []
    for (const [field, expected] of Object.entries(updates)) {
      if (expected === undefined) continue
      const actual = readColumn[field as keyof DomainColumn]
      const passed = deepEqual(expected, actual)
      checks.push({
        description: `Column ${colId}.${field}`,
        passed,
        field,
        expected,
        actual
      })
    }

    const verification: VerificationResult = {
      passed: checks.every((c) => c.passed),
      checks
    }

    throwIfFailed(verification, {
      operation: 'modifyColumn',
      entityType: 'Column',
      entityId: `${tableIdStr}.${colId}`
    })

    return { entity: readColumn, verified: true }
  }

  // Without verification, read back to return the column
  const readColumn = await getColumn(ctx, docIdStr, tableIdStr, colId)
  if (!readColumn) {
    throw new Error(`Column ${colId} not found after modifyColumn operation`)
  }
  return { entity: readColumn, verified: true }
}

/**
 * Remove a column from a table and verify it was deleted.
 *
 * @returns Removed column info
 * @throws VerificationError if column still exists after deletion
 */
export async function removeColumn(
  ctx: ToolContext,
  docId: DocId | string,
  tableId: TableId | string,
  colId: string,
  options: { verify?: boolean } = {}
): Promise<RemoveColumnResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)
  const tableIdStr = typeof tableId === 'string' ? tableId : String(tableId)
  const tableIdBranded = toTableId(tableIdStr)
  const colIdBranded = toColId(colId)

  // Execute the delete
  const action = buildRemoveColumnAction(tableIdBranded, colIdBranded)
  await ctx.client.post<ApplyResponse>(`/docs/${docIdStr}/apply`, [serializeUserAction(action)], {
    schema: ApplyResponseSchema,
    context: `Removing column ${colId} from ${tableIdStr}`
  })

  // Invalidate cache
  ctx.schemaCache.invalidateCache(toDocId(docIdStr), tableIdBranded)

  // Verify column is gone
  if (verify) {
    const remaining = await getColumn(ctx, docIdStr, tableIdStr, colId)

    if (remaining) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: `Column ${colId} still exists after delete`,
              passed: false,
              expected: 'deleted',
              actual: remaining
            }
          ]
        },
        {
          operation: 'removeColumn',
          entityType: 'Column',
          entityId: `${tableIdStr}.${colId}`
        }
      )
    }
  }

  return { tableId: tableIdStr, colId, deleted: true, verified: true }
}

/**
 * Rename a column and verify the rename.
 *
 * @returns Renamed column with old name
 * @throws VerificationError if rename couldn't be verified
 */
export async function renameColumn(
  ctx: ToolContext,
  docId: DocId | string,
  tableId: TableId | string,
  oldColId: string,
  newColId: string,
  options: { verify?: boolean } = {}
): Promise<RenameColumnResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)
  const tableIdStr = typeof tableId === 'string' ? tableId : String(tableId)
  const tableIdBranded = toTableId(tableIdStr)

  // Execute the rename
  const action = buildRenameColumnAction(tableIdBranded, toColId(oldColId), toColId(newColId))
  await ctx.client.post<ApplyResponse>(`/docs/${docIdStr}/apply`, [serializeUserAction(action)], {
    schema: ApplyResponseSchema,
    context: `Renaming column ${oldColId} to ${newColId} in ${tableIdStr}`
  })

  // Invalidate cache
  ctx.schemaCache.invalidateCache(toDocId(docIdStr), tableIdBranded)

  // Verify by reading back
  if (verify) {
    const [oldColumn, newColumn] = await Promise.all([
      getColumn(ctx, docIdStr, tableIdStr, oldColId),
      getColumn(ctx, docIdStr, tableIdStr, newColId)
    ])

    const checks: VerificationCheck[] = []

    if (oldColumn) {
      checks.push({
        description: `Old column ${oldColId} should not exist`,
        passed: false,
        expected: 'deleted',
        actual: oldColumn
      })
    } else {
      checks.push({
        description: `Old column ${oldColId} removed`,
        passed: true,
        expected: 'deleted',
        actual: 'deleted'
      })
    }

    if (newColumn) {
      checks.push({
        description: `New column ${newColId} exists`,
        passed: true,
        expected: 'exists',
        actual: newColumn
      })
    } else {
      checks.push({
        description: `New column ${newColId} should exist`,
        passed: false,
        expected: 'exists',
        actual: null
      })
    }

    const verification: VerificationResult = {
      passed: checks.every((c) => c.passed),
      checks
    }

    throwIfFailed(verification, {
      operation: 'renameColumn',
      entityType: 'Column',
      entityId: `${tableIdStr}.${oldColId} → ${newColId}`
    })

    if (!newColumn) {
      throw new Error(`Column ${newColId} not found after renameColumn operation`)
    }
    return { entity: newColumn, verified: true, oldColId }
  }

  // Without verification, read back to return the column
  const readColumn = await getColumn(ctx, docIdStr, tableIdStr, newColId)
  if (!readColumn) {
    throw new Error(`Column ${newColId} not found after renameColumn operation`)
  }
  return { entity: readColumn, verified: true, oldColId }
}

// =============================================================================
// Table Read Operations
// =============================================================================

/**
 * Get all tables in a document.
 * Returns tables in DomainTable shape (without columns by default).
 */
export async function getTables(
  ctx: ToolContext,
  docId: DocId | string,
  options: { includeColumns?: boolean } = {}
): Promise<DomainTable[]> {
  const { includeColumns = false } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)

  const tableRefs = await ctx.schemaCache.getTableRefs(toDocId(docIdStr))
  const tables: DomainTable[] = []

  for (const [tableId] of tableRefs) {
    const table: DomainTable = {
      docId: docIdStr,
      tableId
    }

    if (includeColumns) {
      table.columns = await getColumns(ctx, docIdStr, tableId)
    }

    tables.push(table)
  }

  return tables
}

/**
 * Get a single table by ID.
 * Returns null if not found.
 */
export async function getTable(
  ctx: ToolContext,
  docId: DocId | string,
  tableId: TableId | string,
  options: { includeColumns?: boolean } = {}
): Promise<DomainTable | null> {
  const { includeColumns = false } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)
  const tableIdStr = typeof tableId === 'string' ? tableId : String(tableId)

  const tableRefs = await ctx.schemaCache.getTableRefs(toDocId(docIdStr))
  if (!tableRefs.has(tableIdStr)) {
    return null
  }

  const table: DomainTable = {
    docId: docIdStr,
    tableId: tableIdStr
  }

  if (includeColumns) {
    table.columns = await getColumns(ctx, docIdStr, tableIdStr)
  }

  return table
}

// =============================================================================
// Table Write Operations with Verification
// =============================================================================

/**
 * Create a new table and verify it was created.
 *
 * @returns Created table
 * @throws VerificationError if table couldn't be verified after creation
 */
export async function createTable(
  ctx: ToolContext,
  docId: DocId | string,
  input: CreateTableInput,
  options: { verify?: boolean } = {}
): Promise<CreateTableResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)

  // Build column definitions for AddTable action
  const gristColumns = (input.columns ?? []).map((col) => ({
    colId: col.colId,
    type: col.type,
    label: col.label,
    isFormula: col.isFormula,
    formula: col.formula,
    visibleCol: typeof col.visibleCol === 'number' ? col.visibleCol : undefined,
    widgetOptions: col.widgetOptions
  }))

  // Execute the create
  const action = buildAddTableAction(toTableId(input.tableId), gristColumns)
  const response = await ctx.client.post<ApplyResponse>(
    `/docs/${docIdStr}/apply`,
    [serializeUserAction(action)],
    {
      schema: ApplyResponseSchema,
      context: `Creating table ${input.tableId}`
    }
  )

  // Extract actual table ID from response (may differ from input due to normalization)
  const retValues = validateRetValues(response, { context: `AddTable ${input.tableId}` })
  const retValue = retValues[0]
  let actualTableId = input.tableId
  if (typeof retValue === 'object' && retValue !== null && 'table_id' in retValue) {
    actualTableId = (retValue as { table_id: string }).table_id
  }

  // Invalidate cache
  ctx.schemaCache.invalidateDocument(toDocId(docIdStr))

  // Verify by reading back
  if (verify) {
    const readTable = await getTable(ctx, docIdStr, actualTableId, { includeColumns: true })

    if (!readTable) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: `Table ${actualTableId} not found after create`,
              passed: false,
              expected: input,
              actual: null
            }
          ]
        },
        {
          operation: 'createTable',
          entityType: 'Table',
          entityId: actualTableId
        }
      )
    }

    // Verify column count matches
    const checks: VerificationCheck[] = []
    const expectedColCount = input.columns?.length ?? 0
    const actualColCount = readTable.columns?.length ?? 0

    if (expectedColCount > 0 && actualColCount !== expectedColCount) {
      checks.push({
        description: 'Column count',
        passed: false,
        expected: expectedColCount,
        actual: actualColCount
      })
    } else {
      checks.push({
        description: 'Table created',
        passed: true,
        expected: actualTableId,
        actual: actualTableId
      })
    }

    const verification: VerificationResult = {
      passed: checks.every((c) => c.passed),
      checks
    }

    throwIfFailed(verification, {
      operation: 'createTable',
      entityType: 'Table',
      entityId: actualTableId
    })

    return { entity: readTable, verified: true }
  }

  // Without verification, read back to return the table
  const readTable = await getTable(ctx, docIdStr, actualTableId, { includeColumns: true })
  if (!readTable) {
    throw new Error(`Table ${actualTableId} not found after createTable operation`)
  }
  return { entity: readTable, verified: true }
}

/**
 * Rename a table and verify the rename.
 *
 * @returns Renamed table with old name
 * @throws VerificationError if rename couldn't be verified
 */
export async function renameTable(
  ctx: ToolContext,
  docId: DocId | string,
  oldTableId: TableId | string,
  newTableId: TableId | string,
  options: { verify?: boolean } = {}
): Promise<RenameTableResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)
  const oldTableIdStr = typeof oldTableId === 'string' ? oldTableId : String(oldTableId)
  const newTableIdStr = typeof newTableId === 'string' ? newTableId : String(newTableId)

  // Execute the rename
  const action = buildRenameTableAction(toTableId(oldTableIdStr), toTableId(newTableIdStr))
  await ctx.client.post<ApplyResponse>(`/docs/${docIdStr}/apply`, [serializeUserAction(action)], {
    schema: ApplyResponseSchema,
    context: `Renaming table ${oldTableIdStr} to ${newTableIdStr}`
  })

  // Invalidate cache
  ctx.schemaCache.invalidateDocument(toDocId(docIdStr))

  // Verify by reading back
  if (verify) {
    const [oldTable, newTable] = await Promise.all([
      getTable(ctx, docIdStr, oldTableIdStr),
      getTable(ctx, docIdStr, newTableIdStr)
    ])

    const checks: VerificationCheck[] = []

    if (oldTable) {
      checks.push({
        description: `Old table ${oldTableIdStr} should not exist`,
        passed: false,
        expected: 'deleted',
        actual: oldTable
      })
    } else {
      checks.push({
        description: `Old table ${oldTableIdStr} removed`,
        passed: true,
        expected: 'deleted',
        actual: 'deleted'
      })
    }

    if (newTable) {
      checks.push({
        description: `New table ${newTableIdStr} exists`,
        passed: true,
        expected: 'exists',
        actual: newTable
      })
    } else {
      checks.push({
        description: `New table ${newTableIdStr} should exist`,
        passed: false,
        expected: 'exists',
        actual: null
      })
    }

    const verification: VerificationResult = {
      passed: checks.every((c) => c.passed),
      checks
    }

    throwIfFailed(verification, {
      operation: 'renameTable',
      entityType: 'Table',
      entityId: `${oldTableIdStr} → ${newTableIdStr}`
    })

    if (!newTable) {
      throw new Error(`Table ${newTableIdStr} not found after renameTable operation`)
    }
    return { entity: newTable, verified: true, oldTableId: oldTableIdStr }
  }

  // Without verification, read back to return the table
  const readTable = await getTable(ctx, docIdStr, newTableIdStr)
  if (!readTable) {
    throw new Error(`Table ${newTableIdStr} not found after renameTable operation`)
  }
  return { entity: readTable, verified: true, oldTableId: oldTableIdStr }
}

/**
 * Delete a table and verify it was deleted.
 *
 * @returns Deleted table ID
 * @throws VerificationError if table still exists after deletion
 */
export async function deleteTable(
  ctx: ToolContext,
  docId: DocId | string,
  tableId: TableId | string,
  options: { verify?: boolean } = {}
): Promise<DeleteTableResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)
  const tableIdStr = typeof tableId === 'string' ? tableId : String(tableId)

  // Execute the delete
  const action = buildRemoveTableAction(toTableId(tableIdStr))
  await ctx.client.post<ApplyResponse>(`/docs/${docIdStr}/apply`, [serializeUserAction(action)], {
    schema: ApplyResponseSchema,
    context: `Deleting table ${tableIdStr}`
  })

  // Invalidate cache
  ctx.schemaCache.invalidateDocument(toDocId(docIdStr))

  // Verify table is gone
  if (verify) {
    const remaining = await getTable(ctx, docIdStr, tableIdStr)

    if (remaining) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: `Table ${tableIdStr} still exists after delete`,
              passed: false,
              expected: 'deleted',
              actual: remaining
            }
          ]
        },
        {
          operation: 'deleteTable',
          entityType: 'Table',
          entityId: tableIdStr
        }
      )
    }
  }

  return { tableId: tableIdStr, deleted: true, verified: true }
}

// =============================================================================
// Verification Helpers
// =============================================================================

/**
 * Convert API column response to DomainColumn shape.
 */
function apiColumnToDomain(tableId: string, col: ColumnMetadata): DomainColumn {
  // Parse widgetOptions from JSON string if present
  let widgetOptions: Record<string, unknown> | undefined
  if (col.fields.widgetOptions) {
    try {
      widgetOptions = JSON.parse(col.fields.widgetOptions)
    } catch {
      // Keep as undefined if parsing fails
    }
  }

  return {
    tableId,
    colId: col.id,
    type: col.fields.type,
    label: col.fields.label || undefined,
    isFormula: col.fields.isFormula ?? false,
    formula: col.fields.formula || undefined,
    visibleCol: col.fields.visibleCol || undefined,
    widgetOptions
  } satisfies DomainColumn
}

/**
 * Verify that a written column matches the read column.
 * Compares only the verifyFields defined in the schema metadata.
 */
function verifyColumn(written: DomainColumn, read: DomainColumn): VerificationResult {
  const checks: VerificationCheck[] = []

  // Core fields to verify
  const verifyFields: (keyof DomainColumn)[] = ['type', 'label', 'isFormula', 'formula']

  for (const field of verifyFields) {
    const expected = written[field]
    const actual = read[field]

    // Skip undefined fields in written (weren't set)
    if (expected === undefined) continue

    const passed = deepEqual(expected, actual)
    checks.push({
      description: `Column ${written.colId}.${field}`,
      passed,
      field: String(field),
      expected,
      actual
    })
  }

  return {
    passed: checks.every((c) => c.passed),
    checks
  }
}
