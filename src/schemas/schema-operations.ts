/**
 * Zod schemas for schema management operations.
 *
 * Extracted from manage-schema.ts to keep tool files focused on routing/handlers.
 */

import { z } from 'zod'
import { MAX_COLUMN_OPERATIONS } from '../constants.js'
import { createBatchOutputSchema, GenericOperationResultSchema } from './batch-operation-schemas.js'
import {
  ChoiceOptionsSchema,
  ColumnDefinitionSchema,
  ColumnStyleSchema,
  ColumnTypeLiteralSchema,
  VisibleColSchema
} from './column-types.js'
import {
  ColIdSchema,
  DocIdSchema,
  jsonSafe,
  jsonSafeArray,
  ResponseFormatSchema,
  TableIdSchema
} from './common.js'
import { BaseConditionalRuleSchema } from './conditional-rules.js'

// =============================================================================
// Table Operation Schemas
// =============================================================================

const CreateTableOperationSchema = z
  .object({
    action: z.literal('create_table'),
    name: z.string().min(1).max(100).describe('becomes tableId'),
    columns: jsonSafeArray(ColumnDefinitionSchema, { min: 0, max: 100 }).default([])
  })
  .describe('create table')

const RenameTableOperationSchema = z
  .object({
    action: z.literal('rename_table'),
    tableId: TableIdSchema,
    newTableId: z.string().min(1).max(100)
  })
  .describe('rename table')

const DeleteTableOperationSchema = z
  .object({
    action: z.literal('delete_table'),
    tableId: TableIdSchema
  })
  .describe('delete table')

const UpdateTableOperationSchema = z
  .object({
    action: z.literal('update_table'),
    tableId: TableIdSchema,
    rowRules: jsonSafeArray(BaseConditionalRuleSchema)
      .optional()
      .describe('replaces existing row rules')
  })
  .describe('update table')

// =============================================================================
// Column Operation Schemas
// =============================================================================

const AddColumnOperationSchema = z
  .object({
    action: z.literal('add_column'),
    tableId: TableIdSchema,
    column: ColumnDefinitionSchema
  })
  .describe('add column')

const ModifyColumnOperationSchema = z
  .object({
    action: z.literal('modify_column'),
    tableId: TableIdSchema,
    colId: ColIdSchema,
    updates: z.object({
      type: ColumnTypeLiteralSchema.optional(),
      refTable: z.string().optional().describe('for Ref/RefList'),
      label: z.string().optional(),
      isFormula: z.boolean().optional(),
      formula: z.string().optional().describe('Python expression'),
      visibleCol: VisibleColSchema.optional().describe('display column for Ref'),
      untieColIdFromLabel: z.boolean().optional(),
      // Type-specific options
      widget: z.string().optional(),
      wrap: z.boolean().optional(),
      numMode: z.string().nullable().optional(),
      currency: z.string().optional(),
      numSign: z.string().nullable().optional(),
      decimals: z.number().optional(),
      maxDecimals: z.number().optional(),
      dateFormat: z.string().optional(),
      isCustomDateFormat: z.boolean().optional(),
      timeFormat: z.string().optional(),
      isCustomTimeFormat: z.boolean().optional(),
      choices: jsonSafe(z.array(z.string())).optional(),
      choiceOptions: ChoiceOptionsSchema,
      height: z.number().optional(),
      style: ColumnStyleSchema.optional().describe('styling + rulesOptions')
    })
  })
  .describe('modify column')

const RemoveColumnOperationSchema = z
  .object({
    action: z.literal('remove_column'),
    tableId: TableIdSchema,
    colId: ColIdSchema
  })
  .describe('remove column')

const RenameColumnOperationSchema = z
  .object({
    action: z.literal('rename_column'),
    tableId: TableIdSchema,
    colId: ColIdSchema,
    newColId: z.string().min(1)
  })
  .describe('rename column')

// =============================================================================
// Summary Table Operation Schema
// =============================================================================

const CreateSummaryOperationSchema = z
  .object({
    action: z.literal('create_summary'),
    sourceTable: z.string().min(1),
    groupByColumns: jsonSafe(z.array(z.string().min(1)).min(1)),
    keepPage: z.boolean().default(false).describe('keep auto-created page')
  })
  .describe('create summary')

// =============================================================================
// Discriminated Union and Main Schema
// =============================================================================

const SchemaOperationSchema = z.discriminatedUnion('action', [
  CreateTableOperationSchema,
  UpdateTableOperationSchema,
  RenameTableOperationSchema,
  DeleteTableOperationSchema,
  AddColumnOperationSchema,
  ModifyColumnOperationSchema,
  RemoveColumnOperationSchema,
  RenameColumnOperationSchema,
  CreateSummaryOperationSchema
])

export const ManageSchemaSchema = z.strictObject({
  docId: DocIdSchema,
  operations: jsonSafeArray(SchemaOperationSchema, { min: 1, max: MAX_COLUMN_OPERATIONS }),
  response_format: ResponseFormatSchema
})

export type ManageSchemaInput = z.infer<typeof ManageSchemaSchema>
export type SchemaOperation = z.infer<typeof SchemaOperationSchema>

// =============================================================================
// Output Schema
// =============================================================================

export const ManageSchemaOutputSchema = createBatchOutputSchema(GenericOperationResultSchema)
