/**
 * Domain Table and Column Schemas
 *
 * Canonical shapes for Grist schema entities (tables and columns).
 * These schemas are used for both read and write, enabling omnidirectional verification:
 *
 *     WRITE (encode) ──► Grist ──► READ (decode)
 *           │                           │
 *           └─────── SAME SHAPE ────────┘
 *                         │
 *                   VERIFY (deepEqual)
 *
 * Key design decisions:
 * - DomainColumn includes tableId for context (knowing which table it belongs to)
 * - Type string uses Grist format (e.g., 'Ref:Contacts') for direct API compatibility
 * - widgetOptions is kept as parsed object, not JSON string (codec handles conversion)
 */

import { z } from 'zod'
import { ColIdSchema, TableIdSchema } from '../../schemas/common.js'
import { registerSchema } from '../registry.js'

// =============================================================================
// Column Schema
// =============================================================================

/**
 * Widget options schema - flexible object for type-specific configuration.
 * Different column types use different options:
 * - Choice/ChoiceList: choices, choiceOptions
 * - Numeric: numMode, currency, decimals
 * - Date/DateTime: dateFormat, timeFormat
 * - Attachments: height
 */
export const WidgetOptionsSchema = z.record(z.string(), z.unknown()).optional()

/**
 * Domain Column Schema - the canonical shape for a Grist column.
 *
 * Represents a column's metadata and configuration.
 * This shape is used for both reading columns and verifying writes.
 *
 * @example
 * ```typescript
 * const column: DomainColumn = {
 *   tableId: 'Contacts',
 *   colId: 'Email',
 *   type: 'Text',
 *   label: 'Email Address',
 *   isFormula: false
 * }
 * ```
 */
export const DomainColumnSchema = registerSchema(
  z.object({
    tableId: TableIdSchema.describe('Table containing this column'),
    colId: ColIdSchema.describe('Column identifier'),
    type: z.string().describe('Grist type (e.g., "Text", "Ref:Contacts")'),
    label: z.string().optional().describe('Human-readable label'),
    isFormula: z.boolean().default(false).describe('Whether this is a formula column'),
    formula: z.string().optional().describe('Python formula expression'),
    visibleCol: z.number().optional().describe('For Ref columns: display column ref'),
    widgetOptions: WidgetOptionsSchema.describe('Type-specific configuration')
  }),
  {
    endpoint: '/docs/{docId}/tables/{tableId}/columns',
    userAction: 'AddColumn',
    verifyFields: ['type', 'label', 'isFormula', 'formula'],
    displayName: 'Column'
  }
)

export type DomainColumn = z.infer<typeof DomainColumnSchema>

/**
 * Input schema for adding a column (colId required, tableId in context).
 */
export const AddColumnInputSchema = z.object({
  colId: ColIdSchema,
  type: z.string(),
  label: z.string().optional(),
  isFormula: z.boolean().optional(),
  formula: z.string().optional(),
  visibleCol: z.union([z.string(), z.number()]).optional(),
  widgetOptions: WidgetOptionsSchema
})

export type AddColumnInput = z.infer<typeof AddColumnInputSchema>

/**
 * Input schema for modifying a column (partial updates).
 */
export const ModifyColumnInputSchema = z.object({
  type: z.string().optional(),
  label: z.string().optional(),
  isFormula: z.boolean().optional(),
  formula: z.string().optional(),
  visibleCol: z.union([z.string(), z.number()]).optional(),
  widgetOptions: WidgetOptionsSchema
})

export type ModifyColumnInput = z.infer<typeof ModifyColumnInputSchema>

// =============================================================================
// Table Schema
// =============================================================================

/**
 * Domain Table Schema - the canonical shape for a Grist table.
 *
 * Represents a table's metadata. For full schema, includes columns.
 *
 * @example
 * ```typescript
 * const table: DomainTable = {
 *   docId: 'abc123',
 *   tableId: 'Contacts',
 *   columns: [
 *     { tableId: 'Contacts', colId: 'Name', type: 'Text', isFormula: false },
 *     { tableId: 'Contacts', colId: 'Email', type: 'Text', isFormula: false }
 *   ]
 * }
 * ```
 */
export const DomainTableSchema = registerSchema(
  z.object({
    docId: z.string().describe('Document containing this table'),
    tableId: TableIdSchema.describe('Table identifier'),
    columns: z.array(DomainColumnSchema).optional().describe('Table columns (if fetched)')
  }),
  {
    endpoint: '/docs/{docId}/tables',
    userAction: 'AddTable',
    verifyFields: ['tableId'],
    displayName: 'Table'
  }
)

export type DomainTable = z.infer<typeof DomainTableSchema>

/**
 * Input schema for creating a table.
 */
export const CreateTableInputSchema = z.object({
  tableId: z.string().min(1).max(100),
  columns: z.array(AddColumnInputSchema).optional()
})

export type CreateTableInput = z.infer<typeof CreateTableInputSchema>

// =============================================================================
// Result Types (Following VerifiedResult<T> interface from types.ts)
// =============================================================================

import type { VerifiedDeleteResult, VerifiedResult } from '../operations/types.js'

/**
 * Result of adding a column.
 * Extends VerifiedResult<DomainColumn> with colRef for convenience.
 */
export interface AddColumnResult extends VerifiedResult<DomainColumn> {
  colRef: number
}

/**
 * Result of modifying a column.
 * Standard VerifiedResult<DomainColumn>.
 */
export interface ModifyColumnResult extends VerifiedResult<DomainColumn> {}

/**
 * Result of removing a column.
 * Extends VerifiedDeleteResult with column context.
 */
export interface RemoveColumnResult extends VerifiedDeleteResult {
  tableId: string
  colId: string
}

/**
 * Result of renaming a column.
 * Extends VerifiedResult<DomainColumn> with oldColId for context.
 */
export interface RenameColumnResult extends VerifiedResult<DomainColumn> {
  oldColId: string
}

/**
 * Result of creating a table.
 * Standard VerifiedResult<DomainTable>.
 */
export interface CreateTableResult extends VerifiedResult<DomainTable> {}

/**
 * Result of renaming a table.
 * Extends VerifiedResult<DomainTable> with oldTableId for context.
 */
export interface RenameTableResult extends VerifiedResult<DomainTable> {
  oldTableId: string
}

/**
 * Result of deleting a table.
 * Extends VerifiedDeleteResult with table context.
 */
export interface DeleteTableResult extends VerifiedDeleteResult {
  tableId: string
}
