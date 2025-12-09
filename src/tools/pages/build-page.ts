import {
  SLOW_OPERATION_ANNOTATIONS,
  type ToolContext,
  type ToolDefinition,
  WRITE_SAFE_ANNOTATIONS
} from '../../registry/types.js'
import { BuildPageOutputSchema } from '../../schemas/output-schemas.js'
import { type BuildPageInput, BuildPageSchema } from '../../schemas/pages-widgets.js'
import {
  ChartDashboardBuilder,
  CustomBuilder,
  FormTableBuilder,
  HierarchicalBuilder,
  MasterDetailBuilder,
  type PatternContext
} from '../../services/page-patterns/index.js'
import { GristTool } from '../base/GristTool.js'

class BuildPageTool extends GristTool<typeof BuildPageSchema, unknown> {
  constructor(context: ToolContext) {
    super(context, BuildPageSchema)
  }

  protected formatResponse(
    data: unknown,
    format: 'json' | 'markdown'
  ): {
    content: Array<{ type: 'text'; text: string }>
    structuredContent?: { [x: string]: unknown }
  } {
    const pageData = data as Record<string, unknown>

    if (format === 'json') {
      return {
        content: [{ type: 'text', text: JSON.stringify(pageData, null, 2) }],
        structuredContent: pageData
      }
    }

    // Custom markdown format for pages
    const markdown = `# Page Created: ${pageData.page_name}

**Pattern:** ${pageData.pattern}
**Description:** ${pageData.description}

## Created Resources

| Resource | ID | Details |
|----------|-----|---------|
| Page (View) | ${pageData.view_id} | "${pageData.page_name}" |
${(pageData.widgets as Array<{ section_id: number; table_ref: number }>).map((w, i) => `| Widget ${i + 1} | ${w.section_id} | Table: ${w.table_ref} |`).join('\n')}

## Next Steps

- View the page in Grist UI
- Use \`grist_configure_widget\` to modify widget settings
- Use \`grist_update_page\` to rename or reorganize pages
`

    return {
      content: [{ type: 'text', text: markdown }],
      structuredContent: pageData
    }
  }

  private async getTableRefsMap(docId: string): Promise<Map<string, number>> {
    return this.schemaCache.getTableRefs(docId as never) // DocId is branded type, cast for cache API
  }

  /**
   * Create a PatternContext for pattern builders.
   */
  private createPatternContext(
    docId: string,
    pageName: string,
    tableRefsMap: Map<string, number>
  ): PatternContext {
    return {
      client: this.client,
      schemaCache: this.schemaCache,
      docId,
      pageName,
      tableRefsMap
    }
  }

  protected async executeInternal(params: BuildPageInput) {
    const { docId, page_name, config } = params

    // Get table references
    const tableRefsMap = await this.getTableRefsMap(docId)

    // Create pattern context
    const context = this.createPatternContext(docId, page_name, tableRefsMap)

    // Dispatch to appropriate pattern builder
    switch (config.pattern) {
      case 'master_detail': {
        const builder = new MasterDetailBuilder(context)
        return builder.build(config)
      }

      case 'form_table': {
        const builder = new FormTableBuilder(context)
        return builder.build(config)
      }

      case 'hierarchical': {
        const builder = new HierarchicalBuilder(context)
        return builder.build(config)
      }

      case 'chart_dashboard': {
        const builder = new ChartDashboardBuilder(context)
        return builder.build(config)
      }

      case 'custom': {
        const builder = new CustomBuilder(context)
        return builder.build(config)
      }

      default: {
        // TypeScript exhaustiveness check - all patterns handled above
        const _exhaustive: never = config
        throw new Error(`Unknown pattern`)
      }
    }
  }
}

export async function buildPage(context: ToolContext, params: BuildPageInput) {
  const tool = new BuildPageTool(context)
  return tool.execute(params)
}

export const BUILD_PAGE_DEFINITION: ToolDefinition = {
  name: 'grist_build_page',
  title: 'Build Page',
  description: 'Create pages with widget patterns (master-detail, hierarchical, chart dashboard)',
  purpose: 'Create pages with pre-configured widget layouts and linking',
  category: 'document_structure',
  inputSchema: BuildPageSchema,
  outputSchema: BuildPageOutputSchema,
  annotations: { ...WRITE_SAFE_ANNOTATIONS, ...SLOW_OPERATION_ANNOTATIONS },
  handler: buildPage,
  docs: {
    overview:
      'Creates pages with widget patterns. Master-detail links two tables. ' +
      'Hierarchical creates drill-down summaries (auto-creates summary tables). ' +
      'Chart dashboard combines charts with selectors. ' +
      'Custom allows arbitrary widget arrangements. ' +
      '**Note:** chart_dashboard with selector requires all charts to use the same table as the selector (for proper linking). ' +
      'To use charts from different tables, either omit the selector or use the custom pattern with manual linking. ' +
      'For charts with existing summary tables, use grist_create_summary_table first, then reference the summary table in chart_dashboard.',
    examples: [
      {
        desc: 'Master-detail page',
        input: {
          docId: 'abc123',
          page_name: 'Customer Orders',
          config: {
            pattern: 'master_detail',
            master: { table: 'Customers', widget_type: 'card_list', width: 40 },
            detail: { table: 'Orders', widget_type: 'grid', link_field: 'CustomerRef' },
            split: 'horizontal'
          }
        }
      },
      {
        desc: 'Hierarchical drill-down',
        input: {
          docId: 'abc123',
          page_name: 'Investment Analysis',
          config: {
            pattern: 'hierarchical',
            levels: [
              { table: 'Investments', group_by: ['funded_year'] },
              { table: 'Investments', group_by: ['funded_year', 'category_code'] },
              { table: 'Investments', group_by: ['funded_year', 'category_code', 'company_name'] }
            ]
          }
        }
      },
      {
        desc: 'Chart dashboard',
        input: {
          docId: 'abc123',
          page_name: 'Sales Dashboard',
          config: {
            pattern: 'chart_dashboard',
            selector: { table: 'Regions', widget_type: 'card_list' },
            charts: [
              { table: 'Sales', widget_type: 'chart', chart_type: 'bar' },
              { table: 'Sales', widget_type: 'chart', chart_type: 'pie' }
            ]
          }
        }
      }
    ],
    errors: [
      { error: 'Table not found', solution: 'Use grist_get_tables (case-sensitive)' },
      { error: "Column 'link_field' not found", solution: 'Verify it is a Reference column' },
      {
        error: 'Summary table not found',
        solution: 'Use grist_create_summary_table to create it first, or use hierarchical pattern'
      }
    ],
    parameters:
      '**Patterns:** master_detail, hierarchical, chart_dashboard, form_table, custom\n' +
      '**Widget types:** grid, card, card_list, chart, form, custom\n' +
      '**Summary tables:** Hierarchical pattern auto-creates summary tables. ' +
      'For custom dashboards, use grist_create_summary_table first.'
  }
}
