/**
 * Domain Record Schema
 *
 * Extends the base RecordSchema with Grist registry metadata.
 * This is the canonical record shape used throughout the domain layer.
 */

import { z } from 'zod'
import { CellValueSchema as BaseCellValueSchema } from '../../schemas/api-responses.js'
import { TableIdSchema } from '../../schemas/common.js'
import { registerSchema } from '../registry.js'

/**
 * Cell value schema - re-exported from base for convenience.
 * Supports: string, number, boolean, null, arrays (for ChoiceList/RefList)
 */
export const CellValueSchema = BaseCellValueSchema

export type CellValue = z.infer<typeof CellValueSchema>

/**
 * Domain Record Schema - the canonical shape for a Grist record.
 *
 * Includes:
 * - tableId: Which table this record belongs to
 * - id: Row ID (assigned by Grist)
 * - fields: Column values as key-value pairs
 *
 * This schema is registered with gristRegistry for generic operations.
 */
export const DomainRecordSchema = registerSchema(
  z.object({
    tableId: TableIdSchema.describe('Table containing this record'),
    id: z.number().int().positive().describe('Row ID'),
    fields: z.record(z.string(), CellValueSchema).describe('Column values')
  }),
  {
    endpoint: '/docs/{docId}/tables/{tableId}/records',
    userAction: 'BulkAddRecord',
    verifyFields: ['fields'],
    displayName: 'Record'
  }
)

export type DomainRecord = z.infer<typeof DomainRecordSchema>

/**
 * Input schema for adding records (no id yet - assigned by Grist)
 */
export const AddRecordInputSchema = z.object({
  tableId: TableIdSchema,
  fields: z.record(z.string(), CellValueSchema)
})

export type AddRecordInput = z.infer<typeof AddRecordInputSchema>

/**
 * Input schema for updating records (requires id)
 */
export const UpdateRecordInputSchema = z.object({
  id: z.number().int().positive(),
  fields: z.record(z.string(), CellValueSchema)
})

export type UpdateRecordInput = z.infer<typeof UpdateRecordInputSchema>

/**
 * Batch update input - multiple records for one table
 */
export const BatchUpdateInputSchema = z.object({
  tableId: TableIdSchema,
  records: z.array(UpdateRecordInputSchema).min(1)
})

export type BatchUpdateInput = z.infer<typeof BatchUpdateInputSchema>

/**
 * Delete input - records to delete from a table
 */
export const DeleteRecordsInputSchema = z.object({
  tableId: TableIdSchema,
  rowIds: z.array(z.number().int().positive()).min(1)
})

export type DeleteRecordsInput = z.infer<typeof DeleteRecordsInputSchema>

/**
 * Result of adding records
 */
export interface AddRecordsResult {
  records: DomainRecord[]
  count: number
}

/**
 * Result of updating records
 */
export interface UpdateRecordsResult {
  records: DomainRecord[]
  count: number
}

/**
 * Result of deleting records
 */
export interface DeleteRecordsResult {
  deletedIds: number[]
  count: number
}
