import {
  type ToolContext,
  type ToolDefinition,
  WRITE_SAFE_ANNOTATIONS
} from '../../registry/types.js'
import { ApplyResponseSchema } from '../../schemas/api-responses.js'
import { CreateSummaryTableOutputSchema } from '../../schemas/output-schemas.js'
import {
  type CreateSummaryTableInput,
  CreateSummaryTableSchema
} from '../../schemas/summary-tables.js'
import { resolveColumnNameToColRef } from '../../services/widget-resolver.js'
import type { ApplyResponse, SQLQueryResponse, UserAction } from '../../types.js'
import { extractFields } from '../../utils/grist-field-extractor.js'
import { validateRetValues } from '../../validators/apply-response.js'
import { GristTool } from '../base/GristTool.js'

/**
 * Response structure for create summary table
 */
interface CreateSummaryTableResponse {
  success: true
  summary_table_id: string
  source_table: string
  group_by_columns: string[]
  columns: string[]
  description: string
}

class CreateSummaryTableTool extends GristTool<
  typeof CreateSummaryTableSchema,
  CreateSummaryTableResponse
> {
  constructor(context: ToolContext) {
    super(context, CreateSummaryTableSchema)
  }

  protected async executeInternal(
    params: CreateSummaryTableInput
  ): Promise<CreateSummaryTableResponse> {
    const { docId, sourceTable, groupByColumns } = params

    // 1. Resolve source table ref
    const sourceTableRef = await this.getTableRef(docId, sourceTable)

    // 2. Resolve column refs for group-by columns
    const groupByColRefs = await this.resolveGroupByColumns(docId, sourceTable, groupByColumns)

    // 3. Create summary section - this creates the summary table and an unwanted page
    // CreateViewSection: [sourceTableRef, viewRef, 'record', groupbyColRefs, tableRef]
    // viewRef=0 creates a new page, which we'll delete
    const createActions: UserAction[] = [
      ['CreateViewSection', sourceTableRef, 0, 'record', groupByColRefs, null]
    ]

    const createResponse = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      createActions,
      {
        schema: ApplyResponseSchema,
        context: `Creating summary table for ${sourceTable}`
      }
    )

    validateRetValues(createResponse, {
      context: `Creating summary table for ${sourceTable}`
    })

    // Extract the viewRef to delete and sectionRef to find the summary table
    const retValue = createResponse.retValues[0] as { viewRef: number; sectionRef: number }
    const viewRef = retValue.viewRef
    const sectionRef = retValue.sectionRef

    // 4. Handle page visibility based on keepPage option
    if (params.keepPage) {
      // Rename the view to be descriptive
      await this.renameView(docId, viewRef, sourceTable, groupByColumns)
    } else {
      // Remove only page/tabBar (keep view to preserve summary table)
      // RemoveView would cascade-delete sections and orphan the summary table
      await this.removePageAndTabBar(docId, viewRef)
    }

    // 5. Invalidate schema cache since we created a new table
    this.schemaCache.invalidateDocument(docId as never)

    // 6. Get the created summary table name from the section reference
    const summaryTableId = await this.getSummaryTableIdFromSection(docId, sectionRef)

    // 7. Get the columns in the summary table
    const columns = await this.getSummaryTableColumns(docId, summaryTableId)

    return {
      success: true,
      summary_table_id: summaryTableId,
      source_table: sourceTable,
      group_by_columns: groupByColumns,
      columns,
      description:
        `Created summary table "${summaryTableId}" from "${sourceTable}" ` +
        `grouped by ${groupByColumns.join(', ')}. ` +
        `Use this table in grist_build_page or grist_get_records.`
    }
  }

  /**
   * Get table ref from source table name
   */
  private async getTableRef(docId: string, tableName: string): Promise<number> {
    const tableRef = await this.schemaCache.getTableRef(docId as never, tableName)
    if (tableRef === null) {
      throw new Error(
        `Source table "${tableName}" not found. Use grist_get_tables to list available tables.`
      )
    }
    return tableRef
  }

  /**
   * Resolve group-by column names to column refs
   */
  private async resolveGroupByColumns(
    docId: string,
    tableName: string,
    columnNames: string[]
  ): Promise<number[]> {
    const colRefs: number[] = []

    for (const colName of columnNames) {
      const colRef = await resolveColumnNameToColRef(this.client, docId, tableName, colName)
      colRefs.push(colRef)
    }

    return colRefs
  }

  /**
   * Get the summary table ID from the created view section.
   * The section's tableRef points directly to the summary table.
   */
  private async getSummaryTableIdFromSection(docId: string, sectionRef: number): Promise<string> {
    const response = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `
        SELECT t.tableId
        FROM _grist_Views_section s
        JOIN _grist_Tables t ON s.tableRef = t.id
        WHERE s.id = ?
      `,
      args: [sectionRef]
    })

    if (response.records.length === 0) {
      throw new Error(
        `Could not find summary table for section ${sectionRef}. ` +
          `The CreateViewSection action may have failed. ` +
          `Try using grist_get_tables to verify document state.`
      )
    }

    const fields = extractFields(response.records[0])
    return fields.tableId as string
  }

  /**
   * Get columns in the summary table
   */
  private async getSummaryTableColumns(docId: string, tableId: string): Promise<string[]> {
    const response = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `
        SELECT c.colId
        FROM _grist_Tables_column c
        JOIN _grist_Tables t ON c.parentId = t.id
        WHERE t.tableId = ?
        ORDER BY c.colId
      `,
      args: [tableId]
    })

    return response.records.map((r) => {
      const fields = extractFields(r)
      return fields.colId as string
    })
  }

  /**
   * Remove the page and tabBar entries for a view, keeping the view itself.
   * This prevents cascade deletion that would orphan the summary table.
   *
   * RemoveView triggers _removeViewRecords() which cascades to delete all
   * associated view sections, leaving the summary table orphaned for garbage collection.
   * By only removing the page/tabBar entries, we keep the view "invisible" while
   * preserving the section chain that keeps the summary table alive.
   */
  private async removePageAndTabBar(docId: string, viewRef: number): Promise<void> {
    // Query for page and tabBar entries associated with this view
    const queryResponse = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `
        SELECT
          p.id as pageId,
          t.id as tabBarId
        FROM _grist_Views v
        LEFT JOIN _grist_Pages p ON p.viewRef = v.id
        LEFT JOIN _grist_TabBar t ON t.viewRef = v.id
        WHERE v.id = ?
        LIMIT 1
      `,
      args: [viewRef]
    })

    if (queryResponse.records.length === 0) {
      return // No page/tabBar to remove
    }

    const fields = extractFields(queryResponse.records[0])
    const removeActions: UserAction[] = []

    if (fields.pageId && typeof fields.pageId === 'number') {
      removeActions.push(['BulkRemoveRecord', '_grist_Pages', [fields.pageId]])
    }
    if (fields.tabBarId && typeof fields.tabBarId === 'number') {
      removeActions.push(['BulkRemoveRecord', '_grist_TabBar', [fields.tabBarId]])
    }

    if (removeActions.length > 0) {
      await this.client.post<ApplyResponse>(`/docs/${docId}/apply`, removeActions, {
        schema: ApplyResponseSchema,
        context: `Removing page/tabBar for summary table (keeping view to preserve table)`
      })
    }
  }

  /**
   * Rename the view to be descriptive when keepPage is true.
   */
  private async renameView(
    docId: string,
    viewRef: number,
    sourceTable: string,
    groupByColumns: string[]
  ): Promise<void> {
    const viewName = `Summary: ${sourceTable} by ${groupByColumns.join(', ')}`
    await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [['UpdateRecord', '_grist_Views', viewRef, { name: viewName }]],
      {
        schema: ApplyResponseSchema,
        context: `Renaming summary table view to "${viewName}"`
      }
    )
  }
}

export async function createSummaryTable(context: ToolContext, params: CreateSummaryTableInput) {
  const tool = new CreateSummaryTableTool(context)
  return tool.execute(params)
}

export const CREATE_SUMMARY_TABLE_DEFINITION: ToolDefinition = {
  name: 'grist_create_summary_table',
  title: 'Create Summary Table',
  description:
    'Create aggregated summary table from source table.\n' +
    'Groups data by specified columns, auto-generates count and SUM columns.\n' +
    'Params: docId, sourceTable, groupByColumns\n' +
    'Ex: {sourceTable:"Sales",groupByColumns:["Region","Year"]}',
  purpose: 'Create summary tables for aggregations and chart data sources',
  category: 'tables',
  inputSchema: CreateSummaryTableSchema,
  outputSchema: CreateSummaryTableOutputSchema,
  annotations: WRITE_SAFE_ANNOTATIONS,
  handler: createSummaryTable,
  docs: {
    overview:
      'Creates a summary table that aggregates data from a source table. ' +
      'Grist automatically generates a count column and SUM columns for numeric fields. ' +
      'Use the resulting summary table in charts, reports, or for lookup formulas. ' +
      'For custom aggregations (AVERAGE, MIN, MAX), add formula columns after creation.',
    examples: [
      {
        desc: 'Summary by single column',
        input: {
          docId: 'abc123',
          sourceTable: 'Sales',
          groupByColumns: ['Region']
        }
      },
      {
        desc: 'Summary by multiple columns',
        input: {
          docId: 'abc123',
          sourceTable: 'Investments',
          groupByColumns: ['funded_year', 'category_code']
        }
      }
    ],
    errors: [
      { error: 'Source table not found', solution: 'Check table name with grist_get_tables' },
      { error: 'Column not found', solution: 'Verify column names exist in source table' },
      {
        error: 'Summary table already exists',
        solution: 'Use grist_get_pages to find existing summary tables'
      }
    ]
  }
}
