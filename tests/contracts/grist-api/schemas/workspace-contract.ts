/**
 * Contract schemas for Grist Workspace and Document API responses
 * Based on: docs/reference/grist-api-spec.yml
 *
 * These schemas validate that Grist's API responses match our type definitions.
 * If validation fails, Grist's API has changed unexpectedly.
 */

import { z } from 'zod'

/**
 * Document response schema
 * Validates individual document objects within workspace responses
 */
export const DocumentContractSchema = z
  .object({
    id: z.string().length(22).describe('Document ID (Base58, 22 chars)'),
    name: z.string().min(1).describe('Document name'),
    access: z.enum(['viewers', 'editors', 'owners']).describe('User access level'),
    isPinned: z.boolean().describe('Whether document is pinned'),
    urlId: z.string().optional().describe('URL-friendly document ID'),
    trunkId: z.string().nullable().optional().describe('Trunk document ID (null if not a fork)'),
    type: z.unknown().nullable().optional().describe('Document type'),
    trunk: z
      .object({
        id: z.string(),
        name: z.string()
      })
      .optional()
      .describe('Trunk document (for forks)'),
    forks: z
      .array(
        z.object({
          id: z.string(),
          name: z.string()
        })
      )
      .optional()
      .describe('Forked documents'),
    createdAt: z.string().optional().describe('Creation timestamp'),
    updatedAt: z.string().optional().describe('Last update timestamp')
  })
  .strict() // Reject unknown properties to catch new API fields

export type DocumentContract = z.infer<typeof DocumentContractSchema>

/**
 * Workspace response schema (summary level)
 * Validates basic workspace information
 */
export const WorkspaceSummaryContractSchema = z
  .object({
    id: z.number().int().positive().describe('Workspace ID'),
    name: z.string().min(1).describe('Workspace name'),
    orgDomain: z.string().optional().describe('Organization domain'),
    access: z.enum(['viewers', 'editors', 'owners']).describe('User access level'),
    createdAt: z.string().optional().describe('Creation timestamp'),
    updatedAt: z.string().optional().describe('Last update timestamp'),
    isSupportWorkspace: z.boolean().optional().describe('Whether workspace is for support'),
    owner: z.unknown().optional().describe('Workspace owner information')
  })
  .strict()

export type WorkspaceSummaryContract = z.infer<typeof WorkspaceSummaryContractSchema>

/**
 * Workspace response schema (detailed level)
 * Includes nested documents array
 */
export const WorkspaceDetailedContractSchema = WorkspaceSummaryContractSchema.extend({
  docs: z.array(DocumentContractSchema).optional().describe('Documents in workspace')
}).strict()

export type WorkspaceDetailedContract = z.infer<typeof WorkspaceDetailedContractSchema>

/**
 * Workspace list response schema
 * Validates array of workspaces
 */
export const WorkspaceListContractSchema = z.array(WorkspaceDetailedContractSchema)

export type WorkspaceListContract = z.infer<typeof WorkspaceListContractSchema>

/**
 * Table column schema
 * Validates column metadata from Grist API
 */
export const ColumnContractSchema = z
  .object({
    id: z.string().min(1).describe('Column ID'),
    fields: z
      .object({
        label: z.string().optional().describe('Column label (display name)'),
        type: z.string().min(1).describe('Column type (Text, Numeric, Ref:Table, etc.)'),
        formula: z.string().optional().describe('Formula expression'),
        isFormula: z.boolean().optional().describe('Whether column is formula-based'),
        widgetOptions: z.string().optional().describe('Widget options (JSON string)'),
        displayCol: z.number().optional().describe('Display column ID for references'),
        visibleCol: z.number().optional().describe('Visible column ID'),
        colRef: z.number().int().positive().describe('Numeric column reference ID')
      })
      .passthrough() // Allow additional fields that Grist may add
  })
  .strict()

export type ColumnContract = z.infer<typeof ColumnContractSchema>

/**
 * Table metadata schema
 * Validates table information from Grist API
 */
export const TableContractSchema = z
  .object({
    id: z.string().min(1).describe('Table ID'),
    fields: z
      .object({
        primaryViewId: z.number().optional().describe('Primary view ID'),
        summarySourceTable: z.number().optional().describe('Summary table source'),
        onDemand: z.boolean().optional().describe('On-demand loading flag'),
        rawViewSectionRef: z.number().optional().describe('Raw view section reference'),
        recordCardViewSectionRef: z
          .number()
          .optional()
          .describe('Record card view section reference'),
        tableRef: z.number().optional().describe('Table reference ID')
      })
      .passthrough() // Allow additional fields Grist may add
  })
  .strict()

export type TableContract = z.infer<typeof TableContractSchema>

/**
 * Table list response schema
 * Validates tables array from GET /docs/{docId}/tables
 */
export const TableListContractSchema = z
  .object({
    tables: z.array(TableContractSchema)
  })
  .strict()

export type TableListContract = z.infer<typeof TableListContractSchema>

/**
 * Column list response schema
 * Validates columns array from GET /docs/{docId}/tables/{tableId}/columns
 */
export const ColumnListContractSchema = z
  .object({
    columns: z.array(ColumnContractSchema)
  })
  .strict()

export type ColumnListContract = z.infer<typeof ColumnListContractSchema>

/**
 * Record response schema
 * Validates single record from Grist API
 */
export const RecordContractSchema = z
  .object({
    id: z.number().int().positive().describe('Row ID'),
    fields: z.record(z.unknown()).describe('Record fields (column values)')
  })
  .strict()

export type RecordContract = z.infer<typeof RecordContractSchema>

/**
 * Records list response schema
 * Validates records array from GET /docs/{docId}/tables/{tableId}/records
 */
export const RecordsListContractSchema = z
  .object({
    records: z.array(RecordContractSchema)
  })
  .strict()

export type RecordsListContract = z.infer<typeof RecordsListContractSchema>

/**
 * Error response schema
 * Validates Grist API error responses
 */
export const GristErrorContractSchema = z.object({
  error: z.string().min(1).describe('Error message'),
  details: z.unknown().optional().describe('Additional error details'),
  memos: z.array(z.string()).optional().describe('Formula error memos')
})

export type GristErrorContract = z.infer<typeof GristErrorContractSchema>
