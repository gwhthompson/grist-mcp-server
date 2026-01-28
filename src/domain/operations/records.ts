/**
 * Domain Record Operations
 *
 * High-level record operations with built-in verification.
 * Every write operation reads back and verifies the result.
 */

import type { VerificationCheck, VerificationResult } from '../../errors/VerificationError.js'
import type { ToolContext } from '../../registry/types.js'
import { ApplyResponseSchema, type CellValue, decodeRecord } from '../../schemas/api-responses.js'
import { decodeFromApi, encodeRecordForApi } from '../../schemas/cell-codecs.js'
import {
  buildBulkAddRecordAction,
  buildBulkRemoveRecordAction,
  buildBulkUpdateRecordAction
} from '../../services/action-builder.js'
import { serializeUserAction } from '../../services/grist-client.js'
import type { DocId, TableId } from '../../types/advanced.js'
import { toDocId, toRowId, toTableId } from '../../types/advanced.js'
import type { ApplyResponse } from '../../types.js'
import { validateRetValues } from '../../validators/apply-response.js'

// =============================================================================
// Domain Types (inlined from deleted domain/schemas/record.ts)
// =============================================================================

export interface DomainRecord {
  tableId: string
  id: number
  fields: Record<string, unknown>
  [key: string]: unknown
}

export interface AddRecordsResult {
  records: DomainRecord[]
  count: number
}

export interface UpdateRecordsResult {
  records: DomainRecord[]
  count: number
}

export interface DeleteRecordsResult {
  deletedIds: number[]
  count: number
}

import { buildColumnTypeMap, deepEqual, throwIfFailed, verifyDeleted } from './base.js'

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Get records from a table by IDs.
 * Returns records in DomainRecord shape with decoded cell values.
 * Uses column-type-aware decoding so timestamps become ISO strings.
 */
export async function getRecords(
  ctx: ToolContext,
  docId: DocId | string,
  tableId: TableId | string,
  ids?: number[]
): Promise<DomainRecord[]> {
  const docIdStr = typeof docId === 'string' ? docId : String(docId)
  const tableIdStr = typeof tableId === 'string' ? tableId : String(tableId)
  const tableIdBranded = toTableId(tableIdStr)
  const docIdBranded = toDocId(docIdStr)

  interface RecordResponse {
    id: number
    fields: Record<string, unknown>
  }

  // Get column types for proper decoding (timestamps → ISO strings)
  const columns = await ctx.schemaCache.getFreshColumns(docIdBranded, tableIdBranded)
  const columnTypes = buildColumnTypeMap(columns)

  const params: Record<string, unknown> = {}
  if (ids && ids.length > 0) {
    params.filter = JSON.stringify({ id: ids })
  }

  const response = await ctx.client.get<{ records: RecordResponse[] }>(
    `/docs/${docIdStr}/tables/${tableIdStr}/records`,
    params
  )

  return response.records
    .filter((r) => !ids || ids.includes(r.id))
    .map((r) => {
      // First decode list markers (L prefix)
      const decoded = decodeRecord(r)
      // Then decode with column types (timestamps → ISO strings)
      const typedFields: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(decoded.fields)) {
        const colType = columnTypes.get(key) || 'Text'
        typedFields[key] = decodeFromApi(value, colType)
      }
      return {
        tableId: tableIdStr,
        id: decoded.id,
        fields: typedFields
      } satisfies DomainRecord
    })
}

/**
 * Get a single record by ID.
 * Returns null if not found.
 */
export async function getRecord(
  ctx: ToolContext,
  docId: DocId | string,
  tableId: TableId | string,
  id: number
): Promise<DomainRecord | null> {
  const records = await getRecords(ctx, docId, tableId, [id])
  return records.length > 0 ? (records[0] ?? null) : null
}

// =============================================================================
// Write Operations with Verification
// =============================================================================

/**
 * Add records to a table and verify they were created.
 *
 * @returns Added records with their assigned IDs
 * @throws VerificationError if records couldn't be verified after creation
 */
export async function addRecords(
  ctx: ToolContext,
  docId: DocId | string,
  tableId: TableId | string,
  records: Array<Record<string, CellValue>>,
  options: { verify?: boolean } = {}
): Promise<AddRecordsResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)
  const tableIdStr = typeof tableId === 'string' ? tableId : String(tableId)
  const tableIdBranded = toTableId(tableIdStr)
  const docIdBranded = toDocId(docIdStr)

  // Get column types for encoding
  const columns = await ctx.schemaCache.getFreshColumns(docIdBranded, tableIdBranded)
  const columnTypes = buildColumnTypeMap(columns)

  // Encode records for API
  const encodedRecords = records.map((r) => encodeRecordForApi(r, columnTypes))

  // Execute the write
  const action = buildBulkAddRecordAction(tableIdBranded, encodedRecords)
  const response = await ctx.client.post<ApplyResponse>(
    `/docs/${docIdStr}/apply`,
    [serializeUserAction(action)],
    {
      schema: ApplyResponseSchema,
      context: `Adding ${records.length} records to ${tableIdStr}`
    }
  )

  // Extract row IDs from response
  const retValues = validateRetValues(response, { context: `BulkAddRecord on ${tableIdStr}` })
  const ids = retValues[0]
  if (!Array.isArray(ids)) {
    throw new Error(`Expected array of row IDs but got ${typeof ids}`)
  }

  // Build domain records
  const writtenRecords: DomainRecord[] = records.map(
    (fields, i) =>
      ({
        tableId: tableIdStr,
        id: ids[i] as number,
        fields
      }) satisfies DomainRecord
  )

  // Verify by reading back
  if (verify) {
    const readRecords = await getRecords(ctx, docIdStr, tableIdStr, ids as number[])
    const verification = verifyRecords(writtenRecords, readRecords, columnTypes)
    throwIfFailed(verification, {
      operation: 'addRecords',
      entityType: 'Record',
      entityId: `${tableIdStr}:[${ids.join(',')}]`
    })
  }

  return {
    records: writtenRecords,
    count: writtenRecords.length
  }
}

/**
 * Update records in a table and verify the updates.
 *
 * @returns Updated records
 * @throws VerificationError if updates couldn't be verified
 */
export async function updateRecords(
  ctx: ToolContext,
  docId: DocId | string,
  tableId: TableId | string,
  updates: Array<{ id: number; fields: Record<string, CellValue> }>,
  options: { verify?: boolean } = {}
): Promise<UpdateRecordsResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)
  const tableIdStr = typeof tableId === 'string' ? tableId : String(tableId)
  const tableIdBranded = toTableId(tableIdStr)
  const docIdBranded = toDocId(docIdStr)

  // Get column types for encoding
  const columns = await ctx.schemaCache.getFreshColumns(docIdBranded, tableIdBranded)
  const columnTypes = buildColumnTypeMap(columns)

  // Execute updates
  for (const update of updates) {
    const encodedFields = encodeRecordForApi(update.fields, columnTypes)
    const action = buildBulkUpdateRecordAction(tableIdBranded, [toRowId(update.id)], encodedFields)
    await ctx.client.post<ApplyResponse>(`/docs/${docIdStr}/apply`, [serializeUserAction(action)], {
      schema: ApplyResponseSchema,
      context: `Updating record ${update.id} in ${tableIdStr}`
    })
  }

  const rowIds = updates.map((u) => u.id)

  // Verify by reading back
  if (verify) {
    const readRecords = await getRecords(ctx, docIdStr, tableIdStr, rowIds)

    // Build verification checks for the specific fields we updated
    const checks: VerificationCheck[] = []

    for (const update of updates) {
      const readRecord = readRecords.find((r) => r.id === update.id)

      if (!readRecord) {
        checks.push({
          description: `Record ${update.id} not found after update`,
          passed: false,
          expected: update,
          actual: null
        })
        continue
      }

      // Verify only the fields we updated
      for (const [field, expected] of Object.entries(update.fields)) {
        const actual = readRecord.fields[field]
        const colType = columnTypes.get(field)
        const passed = deepEqual(expected, actual, colType)
        checks.push({
          description: `Record ${update.id}.${field}`,
          passed,
          field,
          expected,
          actual
        })
      }
    }

    const verification: VerificationResult = {
      passed: checks.every((c) => c.passed),
      checks
    }

    throwIfFailed(verification, {
      operation: 'updateRecords',
      entityType: 'Record',
      entityId: `${tableIdStr}:[${rowIds.join(',')}]`
    })
  }

  // Return full records after update
  const readRecords = await getRecords(ctx, docIdStr, tableIdStr, rowIds)
  return {
    records: readRecords,
    count: readRecords.length
  }
}

/**
 * Delete records from a table and verify they were deleted.
 *
 * @returns Deleted row IDs
 * @throws VerificationError if records still exist after deletion
 */
export async function deleteRecords(
  ctx: ToolContext,
  docId: DocId | string,
  tableId: TableId | string,
  rowIds: number[],
  options: { verify?: boolean } = {}
): Promise<DeleteRecordsResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)
  const tableIdStr = typeof tableId === 'string' ? tableId : String(tableId)
  const tableIdBranded = toTableId(tableIdStr)

  // Execute the delete
  const action = buildBulkRemoveRecordAction(tableIdBranded, rowIds.map(toRowId))
  await ctx.client.post<ApplyResponse>(`/docs/${docIdStr}/apply`, [serializeUserAction(action)], {
    schema: ApplyResponseSchema,
    context: `Deleting ${rowIds.length} records from ${tableIdStr}`
  })

  // Verify by reading back - records should not exist
  if (verify) {
    const remaining = await getRecords(ctx, docIdStr, tableIdStr, rowIds)
    const verification = verifyDeleted(rowIds, remaining, {
      idField: 'id',
      entityName: 'Record'
    })
    throwIfFailed(verification, {
      operation: 'deleteRecords',
      entityType: 'Record',
      entityId: `${tableIdStr}:[${rowIds.join(',')}]`
    })
  }

  return {
    deletedIds: rowIds,
    count: rowIds.length
  }
}

// =============================================================================
// Verification Helpers
// =============================================================================

/**
 * Verify that written records match read records.
 * Only compares fields that were written (subset comparison).
 * Uses codec round-trip normalization for type-aware comparison.
 *
 * @param columnTypes - Map of column ID to column type for normalization
 */
export function verifyRecords(
  written: DomainRecord[],
  read: DomainRecord[],
  columnTypes?: Map<string, string>
): VerificationResult {
  const startTime = Date.now()
  const checks: VerificationCheck[] = []

  for (const w of written) {
    const r = read.find((rec) => rec.id === w.id)

    if (!r) {
      checks.push({
        description: `Record ${w.id} not found`,
        passed: false,
        expected: w,
        actual: null
      })
      continue
    }

    // Verify each field that was written
    for (const [field, expected] of Object.entries(w.fields)) {
      const actual = r.fields[field]
      // Pass column type for codec-based normalization
      const colType = columnTypes?.get(field)
      const passed = deepEqual(expected, actual, colType)
      checks.push({
        description: `Record ${w.id}.${field}`,
        passed,
        field,
        expected,
        actual
      })
    }
  }

  return {
    passed: checks.every((c) => c.passed),
    checks,
    duration: Date.now() - startTime
  }
}

// Note: normalizeValue and deepEqual are now in base.ts for reuse across all entity operations
