import { READ_ONLY_ANNOTATIONS, type ToolContext, type ToolDefinition } from '../../registry/types.js'
import { type GetPagesInput, GetPagesSchema } from '../../schemas/pages-widgets.js'
import { getAllPages, getAllWidgetsOnPage } from '../../services/widget-resolver.js'
import type { SQLQueryResponse } from '../../types.js'
import { extractFields } from '../../utils/grist-field-extractor.js'
import { GristTool } from '../base/GristTool.js'

/**
 * Widget information with summary table detection
 */
interface WidgetDetail {
  widget_id: number
  title: string
  widget_type: string
  table_id: string
  table_ref: number
  is_summary_table: boolean
  summary_source_table?: string
  group_by_columns?: string[]
  linked_to?: {
    source_widget_id: number
    source_col_ref: number
    target_col_ref: number
  }
  chart_config?: {
    chart_type: string
  }
}

/**
 * Page information with widgets
 */
interface PageDetail {
  page_id: number
  page_name: string
  widgets: WidgetDetail[]
}

/**
 * Tables in Raw Data (not on any page)
 */
interface RawDataTable {
  table_id: string
  table_ref: number
  is_summary_table: boolean
  summary_source_table?: string
  group_by_columns?: string[]
  referenced_on_pages: number[]
}

/**
 * Full response structure
 */
interface GetPagesResponse {
  success: true
  doc_id: string
  pages: PageDetail[]
  raw_data_tables: RawDataTable[]
  summary: {
    total_pages: number
    total_widgets: number
    total_tables: number
    summary_tables: number
  }
  pagination: {
    total: number
    offset: number
    limit: number
    has_more: boolean
    next_offset: number | null
  }
}

class GetPagesTool extends GristTool<typeof GetPagesSchema, GetPagesResponse> {
  constructor(context: ToolContext) {
    super(context, GetPagesSchema)
  }

  protected async executeInternal(params: GetPagesInput): Promise<GetPagesResponse> {
    const { docId, detail_level = 'summary', limit = 50, offset = 0 } = params

    // Get all pages and their basic info
    const allPages = await getAllPages(this.client, docId)
    const totalPages = allPages.length

    // Apply pagination to pages
    const pages = allPages.slice(offset, offset + limit)
    const hasMore = offset + limit < totalPages

    // Get table metadata with summary info
    const tableMetadata = await this.getTableMetadata(docId)

    // Get widget linking info if detailed
    const widgetLinking =
      detail_level === 'detailed' ? await this.getWidgetLinking(docId) : new Map()

    // Get chart configs if detailed
    const chartConfigs =
      detail_level === 'detailed' ? await this.getChartConfigs(docId) : new Map()

    // Build page details with widgets
    const pageDetails: PageDetail[] = []
    const tablesOnPages = new Set<number>()

    for (const page of pages) {
      const widgets = await getAllWidgetsOnPage(this.client, docId, page.id)

      const widgetDetails: WidgetDetail[] = widgets.map((widget) => {
        const tableInfo = tableMetadata.get(widget.tableRef)
        tablesOnPages.add(widget.tableRef)

        const detail: WidgetDetail = {
          widget_id: widget.id,
          title: widget.title || `Untitled (${widget.parentKey})`,
          widget_type: this.mapWidgetType(widget.parentKey),
          table_id: tableInfo?.tableId || `unknown_${widget.tableRef}`,
          table_ref: widget.tableRef,
          is_summary_table: tableInfo?.isSummary || false
        }

        // Add summary table info
        if (tableInfo?.isSummary) {
          detail.summary_source_table = tableInfo.sourceTableId
          if (detail_level === 'detailed' && tableInfo.groupByColumns) {
            detail.group_by_columns = tableInfo.groupByColumns
          }
        }

        // Add linking info if detailed
        if (detail_level === 'detailed') {
          const linking = widgetLinking.get(widget.id)
          if (linking) {
            detail.linked_to = linking
          }

          const chartConfig = chartConfigs.get(widget.id)
          if (chartConfig) {
            detail.chart_config = chartConfig
          }
        }

        return detail
      })

      pageDetails.push({
        page_id: page.id,
        page_name: page.name,
        widgets: widgetDetails
      })
    }

    // Find tables not on any page (Raw Data)
    const rawDataTables: RawDataTable[] = []
    for (const [tableRef, info] of tableMetadata) {
      if (!tablesOnPages.has(tableRef)) {
        rawDataTables.push({
          table_id: info.tableId,
          table_ref: tableRef,
          is_summary_table: info.isSummary,
          summary_source_table: info.isSummary ? info.sourceTableId : undefined,
          group_by_columns: info.isSummary ? info.groupByColumns : undefined,
          referenced_on_pages: [] // Could be populated with page IDs if needed
        })
      }
    }

    // Count summary tables
    const summaryTableCount = Array.from(tableMetadata.values()).filter((t) => t.isSummary).length

    return {
      success: true,
      doc_id: docId,
      pages: pageDetails,
      raw_data_tables: rawDataTables,
      summary: {
        total_pages: totalPages,
        total_widgets: pageDetails.reduce((sum, p) => sum + p.widgets.length, 0),
        total_tables: tableMetadata.size,
        summary_tables: summaryTableCount
      },
      pagination: {
        total: totalPages,
        offset,
        limit,
        has_more: hasMore,
        next_offset: hasMore ? offset + limit : null
      }
    }
  }

  /**
   * Get table metadata including summary table info
   */
  private async getTableMetadata(
    docId: string
  ): Promise<
    Map<
      number,
      {
        tableId: string
        isSummary: boolean
        sourceTableId?: string
        groupByColumns?: string[]
      }
    >
  > {
    // Query tables with summary source info
    const tablesResponse = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `
        SELECT t.id, t.tableId, t.summarySourceTable,
               st.tableId as sourceTableId
        FROM _grist_Tables t
        LEFT JOIN _grist_Tables st ON t.summarySourceTable = st.id
        ORDER BY t.tableId
      `,
      args: []
    })

    const result = new Map<
      number,
      {
        tableId: string
        isSummary: boolean
        sourceTableId?: string
        groupByColumns?: string[]
      }
    >()

    // First pass: collect basic table info
    for (const record of tablesResponse.records) {
      const fields = extractFields(record)
      const id = fields.id as number
      const tableId = fields.tableId as string
      const summarySourceTable = fields.summarySourceTable as number
      const sourceTableId = fields.sourceTableId as string | null

      result.set(id, {
        tableId,
        isSummary: Boolean(summarySourceTable),
        sourceTableId: sourceTableId || undefined
      })
    }

    // Second pass: get group-by columns for summary tables
    const summaryTableRefs = Array.from(result.entries())
      .filter(([, info]) => info.isSummary)
      .map(([ref]) => ref)

    if (summaryTableRefs.length > 0) {
      const groupByResponse = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
        sql: `
          SELECT c.parentId as tableRef, c.colId
          FROM _grist_Tables_column c
          WHERE c.summarySourceCol != 0
          ORDER BY c.parentId, c.colId
        `,
        args: []
      })

      // Group by table
      const groupByMap = new Map<number, string[]>()
      for (const record of groupByResponse.records) {
        const fields = extractFields(record)
        const tableRef = fields.tableRef as number
        const colId = fields.colId as string

        const existing = groupByMap.get(tableRef) || []
        existing.push(colId)
        groupByMap.set(tableRef, existing)
      }

      // Update result with group-by columns
      for (const [tableRef, columns] of groupByMap) {
        const info = result.get(tableRef)
        if (info) {
          info.groupByColumns = columns
        }
      }
    }

    return result
  }

  /**
   * Get widget linking configuration
   */
  private async getWidgetLinking(
    docId: string
  ): Promise<
    Map<number, { source_widget_id: number; source_col_ref: number; target_col_ref: number }>
  > {
    const response = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `
        SELECT id, linkSrcSectionRef, linkSrcColRef, linkTargetColRef
        FROM _grist_Views_section
        WHERE linkSrcSectionRef != 0
      `,
      args: []
    })

    const result = new Map<
      number,
      { source_widget_id: number; source_col_ref: number; target_col_ref: number }
    >()

    for (const record of response.records) {
      const fields = extractFields(record)
      const id = fields.id as number
      const linkSrcSectionRef = fields.linkSrcSectionRef as number
      const linkSrcColRef = fields.linkSrcColRef as number
      const linkTargetColRef = fields.linkTargetColRef as number

      result.set(id, {
        source_widget_id: linkSrcSectionRef,
        source_col_ref: linkSrcColRef,
        target_col_ref: linkTargetColRef
      })
    }

    return result
  }

  /**
   * Get chart configurations
   */
  private async getChartConfigs(
    docId: string
  ): Promise<Map<number, { chart_type: string }>> {
    const response = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `
        SELECT id, chartType
        FROM _grist_Views_section
        WHERE chartType IS NOT NULL AND chartType != ''
      `,
      args: []
    })

    const result = new Map<number, { chart_type: string }>()

    for (const record of response.records) {
      const fields = extractFields(record)
      const id = fields.id as number
      const chartType = fields.chartType as string

      if (chartType) {
        result.set(id, { chart_type: chartType })
      }
    }

    return result
  }

  /**
   * Map internal Grist widget type to user-friendly type
   */
  private mapWidgetType(parentKey: string): string {
    const mapping: Record<string, string> = {
      record: 'grid',
      single: 'card',
      detail: 'card_list',
      chart: 'chart',
      form: 'form',
      custom: 'custom'
    }
    return mapping[parentKey] || parentKey
  }
}

export async function getPages(context: ToolContext, params: GetPagesInput) {
  const tool = new GetPagesTool(context)
  return tool.execute(params)
}

export const GET_PAGES_DEFINITION: ToolDefinition = {
  name: 'grist_get_pages',
  title: 'Get Pages',
  description:
    'List pages, widgets, and tables in a document.\n' +
    'Shows page structure, widget linking, summary tables, and Raw Data tables.\n' +
    'Params: docId, detail_level (summary/detailed), limit, offset\n' +
    'Ex: {docId:"abc123",detail_level:"detailed"}\n' +
    '->grist_help',
  purpose: 'Introspect document structure including pages, widgets, and summary tables',
  category: 'document_structure',
  inputSchema: GetPagesSchema,
  annotations: READ_ONLY_ANNOTATIONS,
  handler: getPages,
  docs: {
    overview:
      'Lists all pages and their widgets in a document. Shows summary table detection, ' +
      'widget linking configuration, and tables in Raw Data (not displayed on any page). ' +
      'Use detail_level="detailed" to include linking info, chart configs, and group-by columns. ' +
      'Supports pagination with limit/offset for large documents.',
    examples: [
      {
        desc: 'Get page summary',
        input: { docId: 'abc123' }
      },
      {
        desc: 'Get detailed page info',
        input: { docId: 'abc123', detail_level: 'detailed' }
      },
      {
        desc: 'Paginated request',
        input: { docId: 'abc123', limit: 10, offset: 0 }
      }
    ],
    errors: [
      { error: 'Document not found', solution: 'Verify docId is correct (22-char Base58)' },
      { error: 'Access denied', solution: 'Check API key has read access to document' }
    ],
    parameters:
      '**limit**: Maximum pages to return (1-100, default: 50)\n' +
      '**offset**: Starting position for pagination (default: 0)\n' +
      '**detail_level**: "summary" for basic info, "detailed" for linking and chart configs'
  }
}
