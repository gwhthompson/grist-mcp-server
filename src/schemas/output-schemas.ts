/**
 * Output schemas for MCP tools.
 *
 * Per MCP spec 2025-11-25, outputSchema defines the structure of structuredContent
 * returned by tools. These schemas enable client-side validation.
 *
 * IMPORTANT: These schemas must exactly match the return values from each tool's
 * executeInternal() method. All schemas have been validated against actual code.
 *
 * NAMING CONVENTION (v2.0): All fields use camelCase to match input schemas.
 */

import { z } from 'zod'

// ============================================================================
// Common Building Blocks
// ============================================================================

/** Pagination metadata included in list responses */
export const PaginationOutputSchema = z.object({
  total: z.number().describe('Total number of items available'),
  offset: z.number().describe('Starting position of current page'),
  limit: z.number().describe('Maximum items per page'),
  hasMore: z.boolean().describe('Whether more items are available'),
  nextOffset: z.number().nullable().describe('Offset for next page, null if no more')
})

/** Extended pagination with page info */
export const ExtendedPaginationOutputSchema = PaginationOutputSchema.extend({
  pageNumber: z.number().describe('Current page number (1-indexed)'),
  totalPages: z.number().describe('Total number of pages'),
  itemsInPage: z.number().describe('Number of items in current page')
})

/** Standard success response base */
export const SuccessResponseSchema = z.object({
  success: z.literal(true)
})

// ============================================================================
// Discovery Tool Outputs
// ============================================================================

/** grist_get_workspaces output */
export const GetWorkspacesOutputSchema = z.object({
  items: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).describe('Workspace ID'),
      name: z.string().describe('Workspace name'),
      org: z.union([z.string(), z.number()]).optional().describe('Organization name or ID'),
      orgDomain: z.string().optional().describe('Organization domain'),
      docCount: z.number().describe('Number of documents'),
      access: z.string().describe('Access level'),
      createdAt: z.string().datetime().optional().describe('Creation timestamp'),
      updatedAt: z.string().datetime().optional().describe('Last update timestamp')
    })
  ),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
  nextOffset: z.number().nullable()
})

/** grist_get_documents output */
export const GetDocumentsOutputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().describe('Document ID'),
      name: z.string().describe('Document name'),
      workspace: z
        .union([z.string(), z.object({ id: z.number(), name: z.string() })])
        .optional()
        .describe('Workspace name or details'),
      workspaceId: z.number().optional().describe('Workspace ID'),
      access: z.string().describe('Access level'),
      url: z.string().optional().describe('Document URL'),
      isPinned: z.boolean().optional().describe('Whether document is pinned'),
      createdAt: z.string().datetime().optional().describe('Creation timestamp'),
      updatedAt: z.string().datetime().optional().describe('Last update timestamp'),
      public: z.boolean().optional().describe('Whether document is public')
    })
  ),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
  nextOffset: z.number().nullable()
})

/** Column schema for full_schema detail level */
/**
 * Full column schema for API responses.
 * Note: Input uses `visibleCol` (string | number) for convenience.
 * Output provides `visibleCol` (numeric ID) and `visibleColName` (resolved name).
 */
const FullColumnSchema = z.object({
  id: z.string().describe('Column ID'),
  label: z.string().describe('Column label'),
  type: z.string().describe('Column type'),
  isFormula: z.boolean().describe('Whether column is a formula'),
  formula: z.string().nullable().describe('Formula expression if applicable'),
  widgetOptions: z
    .union([z.string(), z.record(z.string(), z.unknown()), z.null()])
    .describe('Widget options'),
  visibleCol: z.number().nullable().optional().describe('Visible column ID (numeric)'),
  visibleColName: z.string().nullable().optional().describe('Visible column name (resolved)')
})

/** grist_get_tables output */
export const GetTablesOutputSchema = z.object({
  docId: z.string().describe('Document ID'),
  tableCount: z.number().describe('Number of tables in response'),
  items: z.array(
    z.object({
      id: z.string().describe('Table ID'),
      columns: z
        .union([z.array(z.string()), z.array(FullColumnSchema)])
        .optional()
        .describe('Column names or full column details')
    })
  ),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
  nextOffset: z.number().nullable(),
  pageNumber: z.number(),
  totalPages: z.number(),
  itemsInPage: z.number()
})

// ============================================================================
// Reading Tool Outputs
// ============================================================================

/**
 * grist_get_records output.
 *
 * Uses z.looseObject() to allow dynamic column fields beyond the fixed `id`.
 * Each record item contains: { id: number, [columnName]: CellValue, ... }
 */
export const GetRecordsOutputSchema = z.object({
  docId: z.string().describe('Document ID'),
  tableId: z.string().describe('Table ID'),
  items: z.array(
    z.looseObject({
      id: z.number().describe('Row ID')
    })
  ),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
  nextOffset: z.number().nullable(),
  filters: z.record(z.string(), z.unknown()).optional().describe('Applied filters'),
  columns: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Selected columns'),
  formulaErrors: z
    .object({
      recordsWithErrors: z.number().describe('Count of records with formula errors'),
      affectedColumns: z.array(z.string()).describe('Columns with errors')
    })
    .optional()
    .describe('Formula error summary if any')
})

/** grist_query_sql output */
export const QuerySqlOutputSchema = z.object({
  records: z.array(z.record(z.string(), z.unknown())).describe('Query result rows'),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
  nextOffset: z.number().nullable()
})

// ============================================================================
// Record Operation Outputs
// ============================================================================

/** grist_add_records output */
export const AddRecordsOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string().describe('Document ID'),
  tableId: z.string().describe('Table ID'),
  recordsAdded: z.number().describe('Number of records added'),
  recordIds: z.array(z.number()).describe('IDs of added rows'),
  message: z.string().optional().describe('Success message')
})

/** grist_update_records output */
export const UpdateRecordsOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string().describe('Document ID'),
  tableId: z.string().describe('Table ID'),
  recordsUpdated: z.number().describe('Number of records updated'),
  message: z.string().optional().describe('Success message')
})

/** grist_upsert_records output */
export const UpsertRecordsOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string().describe('Document ID'),
  tableId: z.string().describe('Table ID'),
  recordsProcessed: z.number().describe('Total records processed'),
  recordIds: z.array(z.number()).describe('IDs of all affected rows'),
  message: z.string().optional().describe('Success message'),
  note: z.string().optional().describe('Additional notes')
})

/** grist_delete_records output */
export const DeleteRecordsOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string().describe('Document ID'),
  tableId: z.string().describe('Table ID'),
  recordsDeleted: z.number().describe('Number of records deleted'),
  message: z.string().optional().describe('Success message'),
  warning: z.string().optional().describe('Warning message')
})

// ============================================================================
// Table Operation Outputs
// ============================================================================

/** grist_create_table output */
export const CreateTableOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string().describe('Document ID'),
  tableId: z.string().describe('Created table ID'),
  tableName: z.string().describe('Table display name'),
  columnsCreated: z.number().describe('Number of columns created'),
  message: z.string().optional().describe('Success message'),
  url: z.string().optional().describe('URL to the new table'),
  warnings: z
    .array(
      z.object({
        column: z.string().describe('Column name'),
        issue: z.string().describe('Issue description'),
        suggestion: z.string().describe('Suggested fix')
      })
    )
    .optional()
    .describe('Validation warnings')
})

/** grist_rename_table output */
export const RenameTableOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string().describe('Document ID'),
  oldTableId: z.string().describe('Previous table ID'),
  newTableId: z.string().describe('New table ID'),
  message: z.string().optional().describe('Success message'),
  note: z.string().optional().describe('Additional notes')
})

/** grist_delete_table output */
export const DeleteTableOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string().describe('Document ID'),
  tableId: z.string().describe('Deleted table ID'),
  message: z.string().optional().describe('Success message'),
  warning: z.string().optional().describe('Warning message'),
  note: z.string().optional().describe('Additional notes')
})

/** grist_create_summary_table output */
export const CreateSummaryTableOutputSchema = z.object({
  success: z.literal(true),
  summaryTableId: z.string().describe('Created summary table ID'),
  sourceTable: z.string().describe('Source table ID'),
  groupByColumns: z.array(z.string()).describe('Columns used for grouping'),
  columns: z.array(z.string()).describe('All columns in summary table'),
  description: z.string().describe('Description of summary table')
})

// ============================================================================
// Column Operation Outputs
// ============================================================================

/** grist_manage_columns output */
export const ManageColumnsOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string().describe('Document ID'),
  tableId: z.string().describe('Table ID'),
  operationsPerformed: z.number().describe('Number of operations completed'),
  actions: z.array(z.string()).describe('Description of each action performed'),
  summary: z
    .object({
      added: z.number().describe('Number of columns added'),
      modified: z.number().describe('Number of columns modified'),
      deleted: z.number().describe('Number of columns deleted'),
      renamed: z.number().describe('Number of columns renamed')
    })
    .optional()
    .describe('Operation counts summary'),
  message: z.string().optional().describe('Success message'),
  details: z.array(z.string()).optional().describe('Detailed operation results'),
  hint: z.string().optional().describe('Usage hints')
})

/** grist_manage_conditional_rules output */
export const ManageConditionalRulesOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string().describe('Document ID'),
  tableId: z.string().describe('Table ID'),
  scope: z.string().describe('Rule scope (row/column/field)'),
  action: z.string().describe('Action performed'),
  rulesCount: z.number().optional().describe('Number of rules after operation'),
  rules: z
    .array(
      z.object({
        index: z.number().describe('Rule index'),
        formula: z.string().describe('Rule formula'),
        style: z.record(z.string(), z.unknown()).describe('Rule style')
      })
    )
    .optional()
    .describe('List of rules (for list action)')
})

// ============================================================================
// Document Operation Outputs
// ============================================================================

/** grist_create_document output */
export const CreateDocumentOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string().describe('Created document ID'),
  documentName: z.string().describe('Document name'),
  workspaceId: z.number().describe('Workspace ID'),
  url: z.string().describe('Document URL'),
  forkedFrom: z.string().nullable().optional().describe('Source document if forked'),
  message: z.string().optional().describe('Success message'),
  nextSteps: z.array(z.string()).optional().describe('Suggested next actions')
})

// ============================================================================
// Page/Widget Operation Outputs
// ============================================================================

/** Widget info in page structure */
const PageWidgetSchema = z.object({
  widgetId: z.number().describe('Widget section ID'),
  title: z.string().describe('Widget title'),
  widgetType: z.string().describe('Widget type (grid, card, card_list, chart, form, custom)'),
  tableId: z.string().describe('Data source table'),
  tableRef: z.number().describe('Table reference ID'),
  isSummaryTable: z.boolean().describe('Whether showing summary data'),
  summarySourceTable: z.string().optional().describe('Source table for summary'),
  groupByColumns: z.array(z.string()).optional().describe('Group-by columns for summary'),
  linkedTo: z
    .object({
      sourceWidgetId: z.number().describe('Source widget section ID'),
      sourceColRef: z.number().describe('Source column reference'),
      targetColRef: z.number().describe('Target column reference')
    })
    .optional()
    .describe('Link configuration'),
  chartConfig: z
    .object({
      chartType: z.string().describe('Chart type')
    })
    .optional()
    .describe('Chart configuration if applicable')
})

/** grist_get_pages output */
export const GetPagesOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string().describe('Document ID'),
  pages: z.array(
    z.object({
      pageId: z.number().describe('Page ID'),
      pageName: z.string().describe('Page name'),
      widgets: z.array(PageWidgetSchema).describe('Widgets on this page')
    })
  ),
  rawDataTables: z
    .array(
      z.object({
        tableId: z.string().describe('Table ID'),
        tableRef: z.number().describe('Table reference ID'),
        isSummaryTable: z.boolean().describe('Whether this is a summary table'),
        summarySourceTable: z.string().optional().describe('Source table for summary'),
        groupByColumns: z.array(z.string()).optional().describe('Group-by columns'),
        referencedOnPages: z.array(z.number()).describe('Page IDs referencing this table')
      })
    )
    .describe('Tables in Raw Data section'),
  summary: z.object({
    totalPages: z.number().describe('Total page count'),
    totalWidgets: z.number().describe('Total widget count'),
    totalTables: z.number().describe('Total table count'),
    summaryTables: z.number().describe('Summary table count')
  }),
  pagination: PaginationOutputSchema
})

/** grist_build_page output */
export const BuildPageOutputSchema = z.object({
  success: z.literal(true),
  pageName: z.string().describe('Page name'),
  viewId: z.number().describe('Created page/view ID'),
  pattern: z.string().describe('Page pattern used'),
  description: z.string().describe('Description of created page'),
  widgets: z.array(
    z.object({
      sectionId: z.number().describe('Widget section ID'),
      tableRef: z.number().describe('Table reference ID'),
      position: z.string().optional().describe('Widget position'),
      title: z.string().optional().describe('Widget title')
    })
  )
})

/** grist_configure_widget output */
export const ConfigureWidgetOutputSchema = z.object({
  success: z.literal(true),
  operationsCompleted: z.number().describe('Number of operations completed'),
  summary: z.array(z.string()).describe('Summary of each operation')
})

/** grist_update_page output */
export const UpdatePageOutputSchema = z.object({
  success: z.literal(true),
  operationsCompleted: z.number().describe('Number of operations completed'),
  summary: z.array(z.string()).describe('Summary of each operation')
})

// ============================================================================
// Webhook Operation Outputs
// ============================================================================

/** Webhook info schema */
const WebhookInfoSchema = z.object({
  id: z.string().describe('Webhook ID'),
  name: z.string().nullable().describe('Webhook name'),
  url: z.string().describe('Webhook URL'),
  tableId: z.string().describe('Source table'),
  eventTypes: z.array(z.string()).describe('Trigger events'),
  enabled: z.boolean().describe('Whether webhook is active'),
  isReadyColumn: z.string().nullable().describe('Ready column filter'),
  memo: z.string().nullable().describe('Webhook notes')
})

/** grist_manage_webhooks output for list action */
export const WebhookListOutputSchema = z.object({
  operation: z.literal('list'),
  docId: z.string().describe('Document ID'),
  webhookCount: z.number().describe('Number of webhooks'),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
  nextOffset: z.number().nullable(),
  pageNumber: z.number(),
  totalPages: z.number(),
  itemsInPage: z.number(),
  webhooks: z.array(WebhookInfoSchema)
})

/** grist_manage_webhooks output for create action */
export const WebhookCreateOutputSchema = z.object({
  operation: z.literal('create'),
  success: z.literal(true),
  docId: z.string().describe('Document ID'),
  webhookId: z.string().describe('Created webhook ID'),
  webhookUrl: z.string().describe('Webhook URL'),
  tableId: z.string().describe('Source table'),
  eventTypes: z.array(z.string()).describe('Trigger events')
})

/** grist_manage_webhooks output for update action */
export const WebhookUpdateOutputSchema = z.object({
  operation: z.literal('update'),
  success: z.literal(true),
  docId: z.string().describe('Document ID'),
  webhookId: z.string().describe('Updated webhook ID'),
  fieldsUpdated: z.array(z.string()).describe('Fields that were updated')
})

/** grist_manage_webhooks output for delete action */
export const WebhookDeleteOutputSchema = z.object({
  operation: z.literal('delete'),
  success: z.literal(true),
  docId: z.string().describe('Document ID'),
  webhookId: z.string().describe('Deleted webhook ID')
})

/** grist_manage_webhooks output for clear_queue action */
export const WebhookClearQueueOutputSchema = z.object({
  operation: z.literal('clear_queue'),
  success: z.literal(true),
  docId: z.string().describe('Document ID'),
  action: z.literal('cleared_webhook_queue').describe('Action performed')
})

/**
 * Combined webhook output schema.
 *
 * Uses z.looseObject() instead of z.union() because the MCP SDK's
 * normalizeObjectSchema() only accepts object schemas (def.type === 'object').
 * z.looseObject() is the Zod v4 replacement for deprecated .passthrough().
 */
export const ManageWebhooksOutputSchema = z.looseObject({
  operation: z.enum(['list', 'create', 'update', 'delete', 'clear_queue']),
  docId: z.string().describe('Document ID')
})

// ============================================================================
// Utility Tool Outputs
// ============================================================================

/** grist_help output */
export const HelpOutputSchema = z.object({
  toolName: z.string().describe('Tool name'),
  topic: z.string().describe('Documentation topic'),
  documentation: z.string().describe('Documentation content'),
  availableTopics: z.array(z.string()).describe('Available help topics')
})
