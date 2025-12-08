import { z } from 'zod'
import {
  DESTRUCTIVE_ANNOTATIONS,
  type ToolContext,
  type ToolDefinition,
  WRITE_IDEMPOTENT_ANNOTATIONS,
  WRITE_SAFE_ANNOTATIONS
} from '../registry/types.js'
import { ApplyResponseSchema } from '../schemas/api-responses.js'
import {
  ColumnDefinitionSchema,
  DocIdSchema,
  ResponseFormatSchema,
  TableIdSchema
} from '../schemas/common.js'
import {
  CreateTableOutputSchema,
  DeleteTableOutputSchema,
  RenameTableOutputSchema
} from '../schemas/output-schemas.js'
import {
  buildAddTableAction,
  buildRemoveTableAction,
  buildRenameTableAction
} from '../services/action-builder.js'
import {
  extractForeignTable,
  isReferenceType,
  resolveVisibleCol
} from '../services/column-resolver.js'
import { serializeUserAction } from '../services/grist-client.js'
import {
  VisibleColService,
  type VisibleColSetupParams
} from '../services/visiblecol-service.js'
import { toTableId } from '../types/advanced.js'
import type { ApplyResponse, ColumnDefinition } from '../types.js'
import { validateRetValues } from '../validators/apply-response.js'
import { GristTool } from './base/GristTool.js'

export const CreateTableSchema = z
  .object({
    docId: DocIdSchema,
    tableName: z
      .string()
      .min(1)
      .max(100)
      .describe(
        'Name for the new table. Use alphanumeric characters and underscores. Example: "Contacts", "Sales_Data"'
      ),
    columns: z
      .array(ColumnDefinitionSchema)
      .min(0)
      .max(100)
      .describe(
        'Array of column definitions to create with the table. Can be empty to create table with default columns'
      ),
    response_format: ResponseFormatSchema
  })
  .strict()

export type CreateTableInput = z.infer<typeof CreateTableSchema>

export class CreateTableTool extends GristTool<typeof CreateTableSchema, unknown> {
  constructor(context: ToolContext) {
    super(context, CreateTableSchema)
  }

  private async resolveVisibleColInColumns(
    docId: string,
    columns: ColumnDefinition[]
  ): Promise<ColumnDefinition[]> {
    return Promise.all(
      columns.map(async (col) => {
        // No visibleCol? Return unchanged
        if (!col.visibleCol) return col

        // Already numeric? Return unchanged
        if (typeof col.visibleCol === 'number') return col

        // Validate prerequisites
        if (!col.type) {
          throw new Error(
            `Column "${col.colId}" has visibleCol but no type. ` +
              `Provide column type (e.g., "Ref:People") when using visibleCol.`
          )
        }

        if (!isReferenceType(col.type)) {
          throw new Error(
            `Column "${col.colId}" has visibleCol but type "${col.type}" is not a reference. ` +
              `visibleCol only applies to Ref/RefList columns.`
          )
        }

        // Extract foreign table and resolve string name to numeric ID
        const foreignTable = extractForeignTable(col.type)
        if (!foreignTable) {
          throw new Error(
            `Failed to extract table name from type "${col.type}". ` +
              `Expected format: "Ref:TableName" or "RefList:TableName"`
          )
        }

        const numericId = await resolveVisibleCol(this.client, docId, foreignTable, col.visibleCol)

        return { ...col, visibleCol: numericId }
      })
    )
  }

  protected async executeInternal(params: CreateTableInput) {
    // Resolve any string visibleCol values to numeric IDs
    const resolvedColumns = await this.resolveVisibleColInColumns(params.docId, params.columns)

    // Build action with resolved columns
    const action = buildAddTableAction(toTableId(params.tableName), resolvedColumns)
    const response = await this.client.post<ApplyResponse>(
      `/docs/${params.docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Creating table ${params.tableName}`
      }
    )

    const retValues = validateRetValues(response, { context: `AddTable ${params.tableName}` })
    const retValue = retValues[0]

    if (!retValue || typeof retValue !== 'object' || !('table_id' in retValue)) {
      throw new Error(
        `AddTable action returned unexpected value: ${JSON.stringify(retValue)}. ` +
          `Expected metadata object with table_id field.`
      )
    }

    let tableId: string
    if (typeof retValue === 'object' && retValue !== null && 'table_id' in retValue) {
      tableId = (retValue as { table_id: string }).table_id
    } else {
      tableId = params.tableName
    }

    // Check if any columns have visibleCol that needs SetDisplayFormula
    const visibleColColumns = resolvedColumns.filter(
      (col) => col.visibleCol && col.type && isReferenceType(col.type)
    )

    // Track errors from visibleCol setup
    const displayFormulaErrors: Array<{ colId: string; error: string }> = []

    if (visibleColColumns.length > 0) {
      // Query table columns to get colRefs (AddTable response doesn't include them)
      const columnsResponse = await this.client.get<{
        columns: Array<{ id: string; fields: { colRef: number } }>
      }>(`/docs/${params.docId}/tables/${tableId}/columns`)

      const columns = columnsResponse.columns || []

      // Build VisibleColSetupParams for each column
      const setupParams: VisibleColSetupParams[] = []
      for (const col of visibleColColumns) {
        const columnInfo = columns.find((c) => c.id === col.colId)
        if (!columnInfo) {
          displayFormulaErrors.push({
            colId: col.colId,
            error: `Column "${col.colId}" not found in created table`
          })
          continue
        }

        setupParams.push({
          docId: params.docId,
          tableId,
          colId: col.colId,
          colRef: columnInfo.fields.colRef,
          visibleCol: col.visibleCol as number,
          columnType: col.type as string
        })
      }

      // Use VisibleColService for batch setup
      if (setupParams.length > 0) {
        const visibleColService = new VisibleColService(this.client)
        const results = await visibleColService.setupBatch(setupParams)
        const summary = VisibleColService.summarizeResults(results)

        // Add any errors to our tracking
        for (const err of summary.errors) {
          displayFormulaErrors.push(err)
        }
      }
    }

    return {
      success: true,
      document_id: params.docId,
      table_id: tableId,
      table_name: params.tableName,
      columns_created: params.columns.length,
      message:
        displayFormulaErrors.length > 0
          ? `Table "${params.tableName}" created with ${params.columns.length} column(s). ` +
            `Warning: ${displayFormulaErrors.length} display formula(s) failed to set.`
          : `Successfully created table "${params.tableName}" with ${params.columns.length} column(s)`,
      url: `${this.client.getBaseUrl()}/doc/${params.docId}/p/${tableId}`,
      ...(displayFormulaErrors.length > 0 && {
        warnings: displayFormulaErrors.map((e) => ({
          column: e.colId,
          issue: `Failed to set display formula: ${e.error}`,
          suggestion: `Use grist_manage_columns to set visibleCol manually: {action: "modify", colId: "${e.colId}", visibleCol: "..."}`
        }))
      })
    }
  }
}

export async function createTable(context: ToolContext, params: CreateTableInput) {
  const tool = new CreateTableTool(context)
  return tool.execute(params)
}

export const RenameTableSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    newTableId: z
      .string()
      .min(1)
      .max(100)
      .describe('New table name. Must be unique within the document'),
    response_format: ResponseFormatSchema
  })
  .strict()

export type RenameTableInput = z.infer<typeof RenameTableSchema>

export class RenameTableTool extends GristTool<typeof RenameTableSchema, unknown> {
  constructor(context: ToolContext) {
    super(context, RenameTableSchema)
  }

  protected async executeInternal(params: RenameTableInput) {
    const action = buildRenameTableAction(toTableId(params.tableId), toTableId(params.newTableId))
    const response = await this.client.post<ApplyResponse>(
      `/docs/${params.docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Renaming table ${params.tableId} to ${params.newTableId}`
      }
    )

    validateRetValues(response, {
      context: `RenameTable ${params.tableId} to ${params.newTableId}`
    })

    return {
      success: true,
      document_id: params.docId,
      old_table_id: params.tableId,
      new_table_id: params.newTableId,
      message: `Successfully renamed table from "${params.tableId}" to "${params.newTableId}"`,
      note: 'References to this table in formulas will be automatically updated'
    }
  }
}

export async function renameTable(context: ToolContext, params: RenameTableInput) {
  const tool = new RenameTableTool(context)
  return tool.execute(params)
}

export const DeleteTableSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema,
    response_format: ResponseFormatSchema
  })
  .strict()

export type DeleteTableInput = z.infer<typeof DeleteTableSchema>

export class DeleteTableTool extends GristTool<typeof DeleteTableSchema, unknown> {
  constructor(context: ToolContext) {
    super(context, DeleteTableSchema)
  }

  protected async executeInternal(params: DeleteTableInput) {
    const action = buildRemoveTableAction(toTableId(params.tableId))
    const response = await this.client.post<ApplyResponse>(
      `/docs/${params.docId}/apply`,
      [serializeUserAction(action)],
      {
        schema: ApplyResponseSchema,
        context: `Deleting table ${params.tableId}`
      }
    )

    validateRetValues(response, { context: `RemoveTable ${params.tableId}` })

    return {
      success: true,
      document_id: params.docId,
      table_id: params.tableId,
      message: `Successfully deleted table "${params.tableId}"`,
      warning:
        'THIS OPERATION CANNOT BE UNDONE. All data in the table has been permanently deleted.',
      note: 'If this was a mistake, you may be able to restore from document history if available'
    }
  }
}

export async function deleteTable(context: ToolContext, params: DeleteTableInput) {
  const tool = new DeleteTableTool(context)
  return tool.execute(params)
}

export const TABLE_TOOLS: ReadonlyArray<ToolDefinition> = [
  {
    name: 'grist_create_table',
    title: 'Create Grist Table',
    description: `Create table with column definitions.
Types: Text, Numeric, Int, Bool, Date, DateTime, Choice, ChoiceList, Ref:Table, RefList:Table
Params: docId, tableName, columns:[{colId,type,label,widgetOptions}]
Ex: {tableName:"Contacts",columns:[{colId:"Name",type:"Text"}]}`,
    purpose: 'Create table with columns',
    category: 'tables',
    inputSchema: CreateTableSchema,
    outputSchema: CreateTableOutputSchema,
    annotations: WRITE_SAFE_ANNOTATIONS,
    handler: createTable,
    docs: {
      overview:
        'Create a table with columns. Column types: Text, Numeric, Int, Bool, Date, DateTime, Choice, ChoiceList, Ref:TableName, RefList:TableName, Attachments.',
      examples: [
        {
          desc: 'Create table with columns',
          input: {
            docId: 'abc123',
            tableName: 'Contacts',
            columns: [
              { colId: 'Name', type: 'Text', label: 'Full Name' },
              { colId: 'Email', type: 'Text' },
              {
                colId: 'Status',
                type: 'Choice',
                widgetOptions: { choices: ['Active', 'Inactive'] }
              }
            ]
          }
        },
        {
          desc: 'Currency column',
          input: {
            docId: 'abc123',
            tableName: 'Orders',
            columns: [
              {
                colId: 'Total',
                type: 'Numeric',
                widgetOptions: { numMode: 'currency', currency: 'USD', decimals: 2 }
              }
            ]
          }
        }
      ],
      errors: [
        { error: 'Table already exists', solution: 'Use grist_manage_columns to modify' },
        { error: 'Invalid column type', solution: 'Use supported types listed in description' }
      ]
    }
  },
  {
    name: 'grist_rename_table',
    title: 'Rename Grist Table',
    description: `Rename table (updates references automatically).
Params: docId, tableId (current), newTableId
Ex: {tableId:"OldName",newTableId:"NewName"}`,
    purpose: 'Rename table',
    category: 'tables',
    inputSchema: RenameTableSchema,
    outputSchema: RenameTableOutputSchema,
    annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    handler: renameTable,
    docs: {
      overview: 'Rename a table. Updates references automatically.',
      examples: [
        {
          desc: 'Rename table',
          input: { docId: 'abc123', tableId: 'OldName', newTableId: 'NewName' }
        }
      ],
      errors: [
        { error: 'Table not found', solution: 'Use grist_get_tables' },
        { error: 'Table already exists', solution: 'Choose different name' }
      ]
    }
  },
  {
    name: 'grist_delete_table',
    title: 'Delete Grist Table',
    description: `Permanently delete table and all data (CANNOT be undone).
Params: docId, tableId
Ex: {tableId:"ObsoleteTable"}`,
    purpose: 'Delete table permanently',
    category: 'tables',
    inputSchema: DeleteTableSchema,
    outputSchema: DeleteTableOutputSchema,
    annotations: DESTRUCTIVE_ANNOTATIONS,
    handler: deleteTable,
    docs: {
      overview: 'Delete a table and all data. Cannot be undone.',
      examples: [{ desc: 'Delete table', input: { docId: 'abc123', tableId: 'ObsoleteTable' } }],
      errors: [
        { error: 'Table not found', solution: 'Use grist_get_tables' },
        { error: 'Table is referenced', solution: 'Delete referencing columns first' }
      ]
    }
  }
] as const
