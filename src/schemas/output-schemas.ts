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
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
  nextOffset: z.number().nullable()
})

/** Extended pagination with page info */
export const ExtendedPaginationOutputSchema = PaginationOutputSchema.extend({
  pageNumber: z.number(),
  totalPages: z.number(),
  itemsInPage: z.number()
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
      id: z.union([z.string(), z.number()]),
      name: z.string(),
      org: z.union([z.string(), z.number()]).optional(),
      orgDomain: z.string().optional(),
      docCount: z.number(),
      access: z.string(),
      createdAt: z.iso.datetime().optional(),
      updatedAt: z.iso.datetime().optional()
    })
  ),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
  nextOffset: z.number().nullable(),
  nextSteps: z.array(z.string()).optional().describe('suggested next actions')
})

/** grist_get_documents output */
export const GetDocumentsOutputSchema = z.object({
  items: z.array(
    z.object({
      docId: z.string(),
      name: z.string(),
      workspace: z
        .union([z.string(), z.looseObject({ id: z.number(), name: z.string() })])
        .optional(),
      workspaceId: z.number().optional(),
      access: z.string(),
      url: z.string().optional(),
      isPinned: z.boolean().optional(),
      createdAt: z.iso.datetime().optional(),
      updatedAt: z.iso.datetime().optional(),
      public: z.boolean().optional()
    })
  ),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
  nextOffset: z.number().nullable(),
  nextSteps: z.array(z.string()).optional().describe('suggested next actions')
})

/**
 * Full column schema for API responses.
 * Note: Input uses `visibleCol` (string | number) for convenience.
 * Output provides `visibleCol` (numeric ID) and `visibleColName` (resolved name).
 */
const FullColumnSchema = z.object({
  colId: z.string(),
  label: z.string(),
  type: z.string(),
  isFormula: z.boolean(),
  formula: z.string().nullable(),
  widgetOptions: z.union([z.string(), z.record(z.string(), z.unknown()), z.null()]),
  visibleCol: z.number().nullable().optional(),
  visibleColName: z.string().nullable().optional().describe('resolved column name')
})

/** grist_get_tables output */
export const GetTablesOutputSchema = z.object({
  docId: z.string(),
  tableCount: z.number(),
  items: z.array(
    z.object({
      id: z.string(),
      columns: z.union([z.array(z.string()), z.array(FullColumnSchema)]).optional()
    })
  ),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
  nextOffset: z.number().nullable(),
  pageNumber: z.number(),
  totalPages: z.number(),
  itemsInPage: z.number(),
  nextSteps: z.array(z.string()).optional().describe('suggested next actions')
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
  docId: z.string(),
  tableId: z.string(),
  items: z.array(
    z.looseObject({
      id: z.number()
    })
  ),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
  nextOffset: z.number().nullable(),
  filters: z.record(z.string(), z.unknown()).optional(),
  columns: z.union([z.string(), z.array(z.string())]).optional(),
  formulaErrors: z
    .object({
      recordsWithErrors: z.number(),
      affectedColumns: z.array(z.string())
    })
    .optional()
    .describe('present if formula errors detected'),
  nextSteps: z.array(z.string()).optional().describe('suggested next actions')
})

/** grist_query_sql output */
export const QuerySqlOutputSchema = z.object({
  records: z.array(z.record(z.string(), z.unknown())),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
  nextOffset: z.number().nullable(),
  nextSteps: z.array(z.string()).optional().describe('suggested next actions')
})

// ============================================================================
// Record Operation Outputs (used internally and by tests)
// The MCP interface uses grist_manage_records for all record operations.
// ============================================================================

/** Add records operation output */
export const AddRecordsOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string(),
  tableId: z.string(),
  recordsAdded: z.number(),
  recordIds: z.array(z.number()),
  message: z.string().optional()
})

/** Update records operation output */
export const UpdateRecordsOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string(),
  tableId: z.string(),
  recordsUpdated: z.number(),
  message: z.string().optional()
})

/** Upsert records operation output */
export const UpsertRecordsOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string(),
  tableId: z.string(),
  recordsProcessed: z.number(),
  recordIds: z.array(z.number()),
  message: z.string().optional(),
  note: z.string().optional()
})

/** Delete records operation output */
export const DeleteRecordsOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string(),
  tableId: z.string(),
  recordsDeleted: z.number(),
  message: z.string().optional(),
  warning: z.string().optional()
})

// ============================================================================
// Table Operation Outputs
// ============================================================================

/** grist_create_table output */
export const CreateTableOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string(),
  tableId: z.string(),
  tableName: z.string(),
  columnsCreated: z.number(),
  message: z.string().optional(),
  url: z.string().optional(),
  warnings: z
    .array(
      z.object({
        column: z.string(),
        issue: z.string(),
        suggestion: z.string()
      })
    )
    .optional()
    .describe('validation issues if any')
})

/** grist_rename_table output */
export const RenameTableOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string(),
  oldTableId: z.string(),
  newTableId: z.string(),
  message: z.string().optional(),
  note: z.string().optional()
})

/** grist_delete_table output */
export const DeleteTableOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string(),
  tableId: z.string(),
  message: z.string().optional(),
  warning: z.string().optional(),
  note: z.string().optional()
})

/** grist_create_summary_table output */
export const CreateSummaryTableOutputSchema = z.object({
  success: z.literal(true),
  summaryTableId: z.string(),
  sourceTable: z.string(),
  groupByColumns: z.array(z.string()),
  columns: z.array(z.string()),
  description: z.string()
})

// ============================================================================
// Column Operation Outputs
// ============================================================================

/** grist_manage_columns output */
export const ManageColumnsOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string(),
  tableId: z.string(),
  operationsPerformed: z.number(),
  actions: z.array(z.string()),
  summary: z
    .object({
      added: z.number(),
      modified: z.number(),
      deleted: z.number(),
      renamed: z.number()
    })
    .optional(),
  message: z.string().optional(),
  details: z.array(z.string()).optional(),
  hint: z.string().optional()
})

/** grist_manage_conditional_rules output */
export const ManageConditionalRulesOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string(),
  tableId: z.string(),
  scope: z.string().describe('row/column/field'),
  action: z.string(),
  rulesCount: z.number().optional(),
  rules: z
    .array(
      z.object({
        index: z.number(),
        formula: z.string(),
        style: z.record(z.string(), z.unknown())
      })
    )
    .optional()
    .describe('rules list (for list action)')
})

// ============================================================================
// Document Operation Outputs
// ============================================================================

/** grist_create_document output */
export const CreateDocumentOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string(),
  documentName: z.string(),
  workspaceId: z.number(),
  url: z.string(),
  forkedFrom: z.string().nullable().optional().describe('source doc if copied'),
  message: z.string().optional(),
  nextSteps: z.array(z.string()).optional().describe('suggested next actions')
})

// ============================================================================
// Page/Widget Operation Outputs
// ============================================================================

/** Widget info in page structure */
const PageWidgetSchema = z.object({
  widgetId: z.number(),
  title: z.string(),
  widgetType: z.string().describe('grid/card/card_list/chart/form/custom'),
  tableId: z.string(),
  tableRef: z.number(),
  isSummaryTable: z.boolean(),
  summarySourceTable: z.string().optional(),
  groupByColumns: z.array(z.string()).optional(),
  linkedTo: z
    .object({
      sourceWidgetId: z.number(),
      sourceColRef: z.number(),
      targetColRef: z.number()
    })
    .optional()
    .describe('widget linking'),
  chartConfig: z
    .object({
      chartType: z.string()
    })
    .optional()
})

/** grist_get_pages output */
export const GetPagesOutputSchema = z.object({
  success: z.literal(true),
  docId: z.string(),
  pages: z.array(
    z.object({
      pageId: z.number(),
      pageName: z.string(),
      widgets: z.array(PageWidgetSchema)
    })
  ),
  rawDataTables: z.array(
    z.object({
      tableId: z.string(),
      tableRef: z.number(),
      isSummaryTable: z.boolean(),
      summarySourceTable: z.string().optional(),
      groupByColumns: z.array(z.string()).optional(),
      referencedOnPages: z.array(z.number())
    })
  ),
  summary: z.object({
    totalPages: z.number(),
    totalWidgets: z.number(),
    totalTables: z.number(),
    summaryTables: z.number()
  }),
  pagination: PaginationOutputSchema
})

/** grist_build_page output */
export const BuildPageOutputSchema = z.object({
  success: z.literal(true),
  pageName: z.string(),
  viewId: z.number(),
  pattern: z.string(),
  description: z.string(),
  widgets: z.array(
    z.object({
      sectionId: z.number(),
      tableRef: z.number(),
      position: z.string().optional(),
      title: z.string().optional()
    })
  )
})

/** grist_configure_widget output */
export const ConfigureWidgetOutputSchema = z.object({
  success: z.literal(true),
  operationsCompleted: z.number(),
  summary: z.array(z.string())
})

/** grist_update_page output */
export const UpdatePageOutputSchema = z.object({
  success: z.literal(true),
  operationsCompleted: z.number(),
  summary: z.array(z.string())
})

// ============================================================================
// Webhook Operation Outputs
// ============================================================================

/** Webhook info schema */
const WebhookInfoSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  url: z.string(),
  tableId: z.string(),
  eventTypes: z.array(z.string()).describe('add/update/delete'),
  enabled: z.boolean(),
  isReadyColumn: z.string().nullable().describe('filter column'),
  memo: z.string().nullable()
})

/** grist_manage_webhooks output for list action */
export const WebhookListOutputSchema = z.object({
  operation: z.literal('list'),
  docId: z.string(),
  webhookCount: z.number(),
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
  docId: z.string(),
  webhookId: z.string(),
  webhookUrl: z.string(),
  tableId: z.string(),
  eventTypes: z.array(z.string())
})

/** grist_manage_webhooks output for update action */
export const WebhookUpdateOutputSchema = z.object({
  operation: z.literal('update'),
  success: z.literal(true),
  docId: z.string(),
  webhookId: z.string(),
  fieldsUpdated: z.array(z.string())
})

/** grist_manage_webhooks output for delete action */
export const WebhookDeleteOutputSchema = z.object({
  operation: z.literal('delete'),
  success: z.literal(true),
  docId: z.string(),
  webhookId: z.string()
})

/** grist_manage_webhooks output for clear_queue action */
export const WebhookClearQueueOutputSchema = z.object({
  operation: z.literal('clear_queue'),
  success: z.literal(true),
  docId: z.string(),
  action: z.literal('cleared_webhook_queue')
})

/**
 * Combined webhook output schema.
 *
 * Uses z.looseObject() instead of z.union() because the MCP SDK's
 * normalizeObjectSchema() only accepts object schemas (def.type === 'object').
 * z.looseObject() is the Zod v4 replacement for deprecated .passthrough().
 */
export const ManageWebhooksOutputSchema = z.looseObject({
  success: z.boolean(),
  docId: z.string(),
  operationsCompleted: z.number(),
  results: z.array(
    z.looseObject({
      action: z.enum(['list', 'create', 'update', 'delete', 'clear_queue'])
    })
  ),
  message: z.string(),
  partialFailure: z
    .object({
      operationIndex: z.number(),
      error: z.string(),
      completedOperations: z.number()
    })
    .optional(),
  nextSteps: z.array(z.string()).optional().describe('suggested next actions')
})

// ============================================================================
// Utility Tool Outputs
// ============================================================================

/** Tool example schema */
const ToolExampleSchema = z.object({
  description: z.string(),
  input: z.record(z.string(), z.unknown())
})

/** Tool error schema */
const ToolErrorSchema = z.object({
  error: z.string(),
  cause: z.string().optional(),
  solution: z.string()
})

/** Single tool help schema */
const ToolHelpSchema = z.object({
  name: z.string(),
  overview: z.string().optional(),
  examples: z.array(ToolExampleSchema).optional(),
  errors: z.array(ToolErrorSchema).optional(),
  schema: z.record(z.string(), z.unknown()).optional()
})

/** Discovery response schema */
const DiscoveryResponseSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      summary: z.string(),
      category: z.string()
    })
  ),
  workflow: z.string(),
  tip: z.string()
})

/**
 * grist_help output - supports both new progressive disclosure and legacy format.
 *
 * Single object with all fields optional to avoid SDK union validation bug.
 * Response will have either:
 * - discovery (when no tools specified)
 * - tools + optional $defs (when tools specified)
 * - legacy fields (backward compatibility)
 */
export const HelpOutputSchema = z.object({
  // Progressive disclosure format
  discovery: DiscoveryResponseSchema.optional(),
  tools: z.record(z.string(), ToolHelpSchema).optional(),
  $defs: z.record(z.string(), z.unknown()).optional(),
  // Legacy format (deprecated but still supported)
  toolName: z.string().optional(),
  topic: z.string().optional(),
  documentation: z.string().optional(),
  availableTopics: z.array(z.string()).optional(),
  nextSteps: z.array(z.string()).optional().describe('suggested next actions')
})
