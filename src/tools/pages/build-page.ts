import {
  SLOW_OPERATION_ANNOTATIONS,
  type ToolContext,
  type ToolDefinition,
  WRITE_SAFE_ANNOTATIONS
} from '../../registry/types.js'
import { ApplyResponseSchema } from '../../schemas/api-responses.js'
import {
  type BuildPageInput,
  BuildPageSchema,
  toGristWidgetType
} from '../../schemas/pages-widgets.js'
import {
  buildChartConfigAction,
  buildColumnRefsMap,
  buildCreateViewSectionAction,
  buildHorizontalSplitLayout,
  buildLeafLayout,
  buildUpdateLayoutAction,
  buildVerticalSplitLayout,
  buildWidgetLinkAction,
  configureChartAxes,
  type MasterDetailConfig,
  processCreateViewSectionResults
} from '../../services/pages-builder.js'
import { resolveColumnNameToColRef } from '../../services/widget-resolver.js'
import type { ApplyResponse, LayoutSpec, UserAction, WidgetType } from '../../types.js'
import { validateRetValues } from '../../validators/apply-response.js'
import { GristTool } from '../base/GristTool.js'
import { getFirstSectionId } from './shared.js'

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

  private async buildMasterDetailPage(
    docId: string,
    page_name: string,
    config: MasterDetailConfig,
    tableRefsMap: Map<string, number>
  ) {
    // Validate table references
    const masterTableRef = tableRefsMap.get(config.master.table)
    const detailTableRef = tableRefsMap.get(config.detail.table)

    if (!masterTableRef || !detailTableRef) {
      throw new Error(
        `Tables not found in document. Master: "${config.master.table}", Detail: "${config.detail.table}". ` +
          `Verify tables exist using grist_get_tables with docId="${docId}" first.`
      )
    }

    // Phase 1: Create master widget (creates new view/page)
    const masterAction = buildCreateViewSectionAction(
      masterTableRef,
      0, // viewRef=0 creates new view/page
      toGristWidgetType(config.master.widget_type),
      null,
      null
    )

    const phase1Response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [masterAction],
      {
        schema: ApplyResponseSchema,
        context: 'Creating master widget for master-detail page'
      }
    )

    const phase1RetValues = validateRetValues(phase1Response, {
      context: `Creating master widget for ${config.master.table}`
    })
    const phase1Results = processCreateViewSectionResults(phase1RetValues)

    if (phase1Results.length === 0) {
      throw new Error(
        'Failed to create master widget. No results returned from Grist API. ' +
          `Verify table "${config.master.table}" exists and you have sufficient permissions.`
      )
    }

    const viewRef = phase1Results[0].viewRef
    const masterSectionRef = phase1Results[0].sectionRef

    // Phase 2: Create detail widget (add to same view)
    const detailAction = buildCreateViewSectionAction(
      detailTableRef,
      viewRef, // Use viewRef from phase 1 to add to same page
      toGristWidgetType(config.detail.widget_type),
      null,
      null
    )

    const phase2Response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [detailAction],
      {
        schema: ApplyResponseSchema,
        context: 'Creating detail widget for master-detail page'
      }
    )

    const phase2RetValues = validateRetValues(phase2Response, {
      context: `Creating detail widget for ${config.detail.table}`
    })
    const phase2Results = processCreateViewSectionResults(phase2RetValues)

    if (phase2Results.length === 0) {
      throw new Error(
        'Failed to create detail widget. No results returned from Grist API. ' +
          `Verify table "${config.detail.table}" exists and you have sufficient permissions.`
      )
    }

    const detailSectionRef = phase2Results[0].sectionRef

    // Phase 3: Set widget titles (use user-provided titles or generate defaults)
    const masterTitle = config.master.title || `Master: ${config.master.table}`
    const detailTitle = config.detail.title || `Detail: ${config.detail.table}`

    const phase3Response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [
        ['UpdateRecord', '_grist_Views_section', masterSectionRef, { title: masterTitle }],
        ['UpdateRecord', '_grist_Views_section', detailSectionRef, { title: detailTitle }]
      ],
      {
        schema: ApplyResponseSchema,
        context: 'Setting widget titles for master-detail page'
      }
    )

    validateRetValues(phase3Response, { context: 'Setting widget titles' })

    // Phase 4: Set layout
    const layout: LayoutSpec =
      config.split === 'horizontal'
        ? buildHorizontalSplitLayout(
            masterSectionRef,
            detailSectionRef,
            (config.master.width || 50) / 100
          )
        : buildVerticalSplitLayout(
            masterSectionRef,
            detailSectionRef,
            (config.master.width || 50) / 100
          )

    const phase4Response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [
        buildUpdateLayoutAction(viewRef, layout),
        ['UpdateRecord', '_grist_Views', viewRef, { name: page_name }]
      ],
      {
        schema: ApplyResponseSchema,
        context: 'Setting page layout for master-detail page'
      }
    )

    validateRetValues(phase4Response, { context: 'Setting page layout' })

    // Phase 5: Configure widget linking
    const linkColRef = await resolveColumnNameToColRef(
      this.client,
      docId,
      config.detail.table,
      config.detail.link_field
    )

    const phase5Response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [buildWidgetLinkAction(detailSectionRef, masterSectionRef, 0, linkColRef)],
      {
        schema: ApplyResponseSchema,
        context: 'Linking master and detail widgets'
      }
    )

    validateRetValues(phase5Response, { context: 'Linking master and detail widgets' })

    // Return data only - GristTool.execute() will format it
    const description = `Master-Detail: ${config.master.table} (${config.master.widget_type}) ← ${config.detail.table} (${config.detail.widget_type})`

    return {
      success: true,
      page_name,
      view_id: viewRef,
      pattern: config.pattern,
      description,
      widgets: [
        {
          section_id: masterSectionRef,
          table_ref: masterTableRef,
          position: 'master',
          title: masterTitle
        },
        {
          section_id: detailSectionRef,
          table_ref: detailTableRef,
          position: 'detail',
          title: detailTitle
        }
      ]
    }
  }

  private async buildCustomPatternPage(
    docId: string,
    page_name: string,
    config: Extract<BuildPageInput['config'], { pattern: 'custom' }>,
    tableRefsMap: Map<string, number>
  ) {
    // Validate all tables exist
    for (const widget of config.widgets) {
      const tableRef = tableRefsMap.get(widget.table)
      if (!tableRef) {
        throw new Error(
          `Table "${widget.table}" not found. Verify table exists using grist_get_tables with docId="${docId}" first.`
        )
      }
    }

    // Phase 1: Create first widget (generates new view)
    const firstTableRef = tableRefsMap.get(config.widgets[0].table) || 0
    const phase1Response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [
        buildCreateViewSectionAction(
          firstTableRef,
          0, // Create new view
          toGristWidgetType(config.widgets[0].widget_type),
          null,
          null
        )
      ],
      {
        schema: ApplyResponseSchema,
        context: 'Creating first widget for custom pattern'
      }
    )

    const p1RetValues = validateRetValues(phase1Response, { context: 'Creating first widget' })
    const firstResult = processCreateViewSectionResults(p1RetValues)[0]
    const viewRef = firstResult.viewRef
    const sectionRefs = [firstResult.sectionRef]

    // Phase 2: Create remaining widgets (reuse view from first widget)
    if (config.widgets.length > 1) {
      const remainingActions = config.widgets.slice(1).map((widget) => {
        const tableRef = tableRefsMap.get(widget.table) || 0
        return buildCreateViewSectionAction(
          tableRef,
          viewRef, // Reuse view created by first widget
          toGristWidgetType(widget.widget_type),
          null,
          null
        )
      })

      const phase2Response = await this.client.post<ApplyResponse>(
        `/docs/${docId}/apply`,
        remainingActions,
        {
          schema: ApplyResponseSchema,
          context: 'Creating additional widgets for custom pattern'
        }
      )

      const p2RetValues = validateRetValues(phase2Response, {
        context: 'Creating additional widgets'
      })
      const remainingResults = processCreateViewSectionResults(p2RetValues)
      sectionRefs.push(...remainingResults.map((r) => r.sectionRef))
    }

    // Phase 3: Set layout
    let layout: LayoutSpec
    if (config.layout) {
      layout = config.layout as LayoutSpec
    } else {
      // Default: arrange all widgets vertically
      if (sectionRefs.length === 1) {
        layout = buildLeafLayout(sectionRefs[0])
      } else if (sectionRefs.length === 2) {
        layout = buildVerticalSplitLayout(sectionRefs[0], sectionRefs[1], 0.5)
      } else {
        // For 3+ widgets, create nested vertical splits
        let currentLayout: LayoutSpec = buildVerticalSplitLayout(
          sectionRefs[0],
          sectionRefs[1],
          0.5
        )
        for (let i = 2; i < sectionRefs.length; i++) {
          currentLayout = buildVerticalSplitLayout(sectionRefs[0], sectionRefs[i], 0.5)
        }
        layout = currentLayout
      }
    }

    const phase3Response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [
        buildUpdateLayoutAction(viewRef, layout),
        ['UpdateRecord', '_grist_Views', viewRef, { name: page_name }]
      ],
      {
        schema: ApplyResponseSchema,
        context: 'Setting layout for custom pattern page'
      }
    )

    validateRetValues(phase3Response, { context: 'Setting custom pattern layout' })

    // Phase 4: Set widget titles if specified
    const titleActions: UserAction[] = []
    for (let i = 0; i < config.widgets.length; i++) {
      const widget = config.widgets[i]
      const sectionRef = sectionRefs[i]
      const updates: Record<string, unknown> = {}

      if (widget.title) {
        updates.title = widget.title
      }
      if (widget.description) {
        updates.description = widget.description
      }

      if (Object.keys(updates).length > 0) {
        titleActions.push(['UpdateRecord', '_grist_Views_section', sectionRef, updates])
      }
    }

    if (titleActions.length > 0) {
      const phase4Response = await this.client.post<ApplyResponse>(
        `/docs/${docId}/apply`,
        titleActions,
        {
          schema: ApplyResponseSchema,
          context: 'Setting widget titles for custom pattern'
        }
      )

      validateRetValues(phase4Response, { context: 'Setting widget titles' })
    }

    // Phase 5: Handle widget linking if specified
    for (let i = 0; i < config.widgets.length; i++) {
      const widget = config.widgets[i]
      if (widget.link_to && widget.link_field) {
        const sourceWidgetIndex = config.widgets.findIndex(
          (w) => (w.title || w.table) === widget.link_to
        )

        if (sourceWidgetIndex >= 0) {
          const sourceSectionRef = sectionRefs[sourceWidgetIndex]
          const targetSectionRef = sectionRefs[i]

          const linkColRef = await resolveColumnNameToColRef(
            this.client,
            docId,
            widget.table,
            String(widget.link_field)
          )

          const linkResp = await this.client.post<ApplyResponse>(
            `/docs/${docId}/apply`,
            [buildWidgetLinkAction(targetSectionRef, sourceSectionRef, 0, linkColRef)],
            {
              schema: ApplyResponseSchema,
              context: `Linking widget "${widget.title || widget.table}" to "${widget.link_to}"`
            }
          )

          validateRetValues(linkResp, {
            context: `Linking widget ${widget.title || widget.table}`
          })
        }
      }
    }

    // Return data
    const description = `Custom pattern: ${config.widgets.length} widgets`
    return {
      success: true,
      page_name,
      view_id: viewRef,
      pattern: config.pattern,
      description,
      widgets: sectionRefs.map((sectionRef, i) => ({
        section_id: sectionRef,
        table_ref: tableRefsMap.get(config.widgets[i].table) || 0,
        title: config.widgets[i].title || config.widgets[i].table
      }))
    }
  }

  private async buildFormTablePage(
    docId: string,
    page_name: string,
    config: Extract<BuildPageInput['config'], { pattern: 'form_table' }>,
    tableRefsMap: Map<string, number>
  ) {
    // Validate table references
    const formTableRef = tableRefsMap.get(config.form.table)
    const tableTableRef = tableRefsMap.get(config.table.table)

    if (!formTableRef) {
      throw new Error(`Form table "${config.form.table}" not found`)
    }
    if (!tableTableRef) {
      throw new Error(`Table "${config.table.table}" not found`)
    }

    // Phase 1: Create form widget (creates new view/page)
    const phase1Response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [buildCreateViewSectionAction(formTableRef, 0, 'form', null, null)],
      {
        schema: ApplyResponseSchema,
        context: 'Creating form widget for form-table page'
      }
    )

    const phase1RetValues = validateRetValues(phase1Response, {
      context: `Creating form widget for ${config.form.table}`
    })
    const phase1Results = processCreateViewSectionResults(phase1RetValues)

    if (phase1Results.length === 0) {
      throw new Error(
        'Failed to create form widget. No results returned from Grist API. ' +
          `Verify table "${config.form.table}" exists and you have sufficient permissions.`
      )
    }

    const viewRef = phase1Results[0].viewRef
    const formSectionRef = phase1Results[0].sectionRef

    // Phase 2: Create table widget (add to same view)
    const phase2Response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [
        buildCreateViewSectionAction(
          tableTableRef,
          viewRef, // Use viewRef from phase 1 to add to same page
          toGristWidgetType(config.table.widget_type),
          null,
          null
        )
      ],
      {
        schema: ApplyResponseSchema,
        context: 'Creating table widget for form-table page'
      }
    )

    const phase2RetValues = validateRetValues(phase2Response, {
      context: `Creating table widget for ${config.table.table}`
    })
    const phase2Results = processCreateViewSectionResults(phase2RetValues)

    if (phase2Results.length === 0) {
      throw new Error(
        'Failed to create table widget. No results returned from Grist API. ' +
          `Verify table "${config.table.table}" exists and you have sufficient permissions.`
      )
    }

    const tableSectionRef = phase2Results[0].sectionRef

    // Phase 3: Set widget titles
    const formTitle = config.form.title || `Form: ${config.form.table}`
    const tableTitle = config.table.title || `Table: ${config.table.table}`

    const phase3Response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [
        ['UpdateRecord', '_grist_Views_section', formSectionRef, { title: formTitle }],
        ['UpdateRecord', '_grist_Views_section', tableSectionRef, { title: tableTitle }]
      ],
      {
        schema: ApplyResponseSchema,
        context: 'Setting widget titles for form-table page'
      }
    )

    validateRetValues(phase3Response, { context: 'Setting widget titles' })

    // Phase 4: Set layout and page name
    const layout: LayoutSpec =
      config.split === 'horizontal'
        ? buildHorizontalSplitLayout(formSectionRef, tableSectionRef, 0.5)
        : buildVerticalSplitLayout(formSectionRef, tableSectionRef, 0.5)

    const phase4Response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [
        buildUpdateLayoutAction(viewRef, layout),
        ['UpdateRecord', '_grist_Views', viewRef, { name: page_name }]
      ],
      {
        schema: ApplyResponseSchema,
        context: 'Setting page layout for form-table page'
      }
    )

    validateRetValues(phase4Response, { context: 'Setting page layout' })

    // Return data
    const description = `Form-Table: ${config.form.table} form + ${config.table.table} table`
    return {
      success: true,
      page_name,
      view_id: viewRef,
      pattern: config.pattern,
      description,
      widgets: [
        {
          section_id: formSectionRef,
          table_ref: formTableRef,
          title: formTitle,
          widget_type: 'form',
          position: 'form'
        },
        {
          section_id: tableSectionRef,
          table_ref: tableTableRef,
          title: tableTitle,
          widget_type: config.table.widget_type || 'grid',
          position: 'table'
        }
      ]
    }
  }

  private async buildHierarchicalPage(
    docId: string,
    page_name: string,
    config: Extract<BuildPageInput['config'], { pattern: 'hierarchical' }>,
    tableRefsMap: Map<string, number>
  ) {
    // Build column references map for groupBy columns
    const columnRefs: string[] = []
    config.levels.forEach((level) => {
      level.group_by.forEach((colName) => {
        columnRefs.push(`${level.table}.${colName}`)
      })
    })
    const colRefsMap = await buildColumnRefsMap(this.client, docId, columnRefs)

    // Validate all tables exist
    for (const level of config.levels) {
      const tableRef = tableRefsMap.get(level.table)
      if (!tableRef) {
        throw new Error(
          `Table "${level.table}" not found in document. ` +
            `Verify tables exist using grist_get_tables with docId="${docId}" first.`
        )
      }
    }

    // Get first level info
    const firstLevel = config.levels[0]
    const firstTableRef = tableRefsMap.get(firstLevel.table)
    if (firstTableRef === undefined) {
      throw new Error(`Table ref not found for: ${firstLevel.table}`)
    }
    const firstGroupbyColRefs = firstLevel.group_by.map((colName) => {
      const colKey = `${firstLevel.table}.${colName}`
      const colRef = colRefsMap.get(colKey)
      if (!colRef) {
        throw new Error(`Column "${colName}" not found in table "${firstLevel.table}"`)
      }
      return colRef
    })

    // Phase 1: Create first level widget (creates new view/page)
    const phase1Response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [buildCreateViewSectionAction(firstTableRef, 0, 'record', firstGroupbyColRefs, null)],
      {
        schema: ApplyResponseSchema,
        context: 'Creating first hierarchical level'
      }
    )

    const phase1RetValues = validateRetValues(phase1Response, {
      context: `Creating first hierarchical level for ${firstLevel.table}`
    })
    const phase1Results = processCreateViewSectionResults(phase1RetValues)

    if (phase1Results.length === 0) {
      throw new Error(
        'Failed to create first hierarchical level. No results returned from Grist API. ' +
          `Verify table "${firstLevel.table}" exists and you have sufficient permissions.`
      )
    }

    const viewRef = phase1Results[0].viewRef
    const sectionRefs = [phase1Results[0].sectionRef]
    const tableRefs = [firstTableRef]

    // Phase 2: Create remaining levels (batch all in single request)
    if (config.levels.length > 1) {
      const remainingActions: UserAction[] = config.levels.slice(1).map((level) => {
        const tableRef = tableRefsMap.get(level.table)
        if (tableRef === undefined) {
          throw new Error(`Table ref not found for: ${level.table}`)
        }
        const groupbyColRefs = level.group_by.map((colName) => {
          const colKey = `${level.table}.${colName}`
          const colRef = colRefsMap.get(colKey)
          if (colRef === undefined) {
            throw new Error(`Column ref not found for: ${colKey}`)
          }
          return colRef
        })
        return buildCreateViewSectionAction(
          tableRef,
          viewRef, // Use viewRef from phase 1 to add to same page
          'record',
          groupbyColRefs,
          null
        )
      })

      const phase2Response = await this.client.post<ApplyResponse>(
        `/docs/${docId}/apply`,
        remainingActions,
        {
          schema: ApplyResponseSchema,
          context: 'Creating additional hierarchical levels'
        }
      )

      const phase2RetValues = validateRetValues(phase2Response, {
        context: 'Creating additional hierarchical levels'
      })
      const phase2Results = processCreateViewSectionResults(phase2RetValues)

      sectionRefs.push(...phase2Results.map((r) => r.sectionRef))
      tableRefs.push(
        ...config.levels.slice(1).map((l) => {
          const ref = tableRefsMap.get(l.table)
          if (ref === undefined) {
            throw new Error(`Table ref not found for: ${l.table}`)
          }
          return ref
        })
      )
    }

    // Phase 3: Set layout
    let layout: LayoutSpec
    if (sectionRefs.length === 1) {
      layout = buildLeafLayout(sectionRefs[0])
    } else if (sectionRefs.length === 2) {
      layout = buildVerticalSplitLayout(sectionRefs[0], sectionRefs[1], 0.5)
    } else {
      layout = buildVerticalSplitLayout(sectionRefs[0], sectionRefs[1], 0.5)
      for (let i = 2; i < sectionRefs.length; i++) {
        layout = buildVerticalSplitLayout(getFirstSectionId(layout), sectionRefs[i], 0.5)
      }
    }

    const layoutResp = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [
        buildUpdateLayoutAction(viewRef, layout),
        ['UpdateRecord', '_grist_Views', viewRef, { name: page_name }]
      ],
      {
        schema: ApplyResponseSchema,
        context: 'Setting hierarchical pattern layout'
      }
    )

    validateRetValues(layoutResp, { context: 'Setting hierarchical layout' })

    // Phase 4: Link each level to the next (drill-down behavior)
    if (sectionRefs.length > 1) {
      // Batch all link actions together
      const linkActions: UserAction[] = []
      for (let i = 0; i < sectionRefs.length - 1; i++) {
        linkActions.push(buildWidgetLinkAction(sectionRefs[i + 1], sectionRefs[i], 0, 0))
      }

      const linkResp = await this.client.post<ApplyResponse>(
        `/docs/${docId}/apply`,
        linkActions,
        {
          schema: ApplyResponseSchema,
          context: 'Linking hierarchical levels'
        }
      )

      validateRetValues(linkResp, { context: 'Linking hierarchical levels' })
    }

    // Phase 5: Set widget titles
    const titles = config.levels.map(
      (level, i) =>
        level.title || `Level ${i + 1}: ${level.table} (by ${level.group_by.join(', ')})`
    )
    const titleActions: UserAction[] = config.levels.map((_, i) => [
      'UpdateRecord',
      '_grist_Views_section',
      sectionRefs[i],
      { title: titles[i] }
    ])

    const titleResp = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      titleActions,
      {
        schema: ApplyResponseSchema,
        context: 'Setting widget titles for hierarchical page'
      }
    )

    validateRetValues(titleResp, { context: 'Setting widget titles' })

    // IMPORTANT: Invalidate schema cache after creating summary tables
    // CreateViewSection with groupbyColRefs creates new summary tables that
    // won't be in the cached tableRefs until invalidated
    this.schemaCache.invalidateDocument(docId as never)

    // Query for the created summary table names
    // Summary tables are named: {SourceTable}_summary_{GroupBy1}_{GroupBy2}
    const summaryTableNames = await this.getSummaryTableNames(docId, config.levels)

    // Return data
    const description = `Hierarchical: ${config.levels.length} levels`
    return {
      success: true,
      page_name,
      view_id: viewRef,
      pattern: config.pattern,
      description,
      widgets: config.levels.map((level, i) => ({
        section_id: sectionRefs[i],
        table_ref: tableRefs[i],
        title: titles[i],
        widget_type: level.widget_type || 'grid',
        position: `level_${i + 1}`,
        summary_table_id: summaryTableNames[i] // NEW: Include created summary table name
      }))
    }
  }

  /**
   * Query for the summary table names created by the hierarchical pattern.
   * Summary tables are auto-named: {SourceTable}_summary_{GroupBy1}_{GroupBy2}
   */
  private async getSummaryTableNames(
    docId: string,
    levels: Array<{ table: string; group_by: string[] }>
  ): Promise<string[]> {
    // Fetch fresh table list after cache invalidation
    const tableRefs = await this.schemaCache.getTableRefs(docId as never)
    const tableNames = Array.from(tableRefs.keys())

    return levels.map((level) => {
      // Expected pattern: {Table}_summary_{col1}_{col2}
      const expectedPrefix = `${level.table}_summary_`
      const expectedSuffix = level.group_by.join('_')
      const expectedName = `${expectedPrefix}${expectedSuffix}`

      // Try exact match first
      if (tableNames.includes(expectedName)) {
        return expectedName
      }

      // Fall back to prefix match (Grist may use different naming)
      const match = tableNames.find(
        (name) => name.startsWith(expectedPrefix) && name.includes(level.group_by[0])
      )
      return match || expectedName // Return expected name even if not found (for debugging)
    })
  }

  private async buildChartDashboardPage(
    docId: string,
    page_name: string,
    config: Extract<BuildPageInput['config'], { pattern: 'chart_dashboard' }>,
    tableRefsMap: Map<string, number>
  ) {
    // Determine widget order: selector (optional) + charts
    const hasSelector = !!config.selector
    const selectorIndex = hasSelector ? 0 : -1
    const chartStartIndex = hasSelector ? 1 : 0

    // Validate selector table if present
    let selectorTableRef: number | undefined
    if (config.selector) {
      selectorTableRef = tableRefsMap.get(config.selector.table)
      if (!selectorTableRef) {
        throw new Error(`Selector table "${config.selector.table}" not found`)
      }
    }

    // Validate chart tables
    for (const chart of config.charts) {
      const tableRef = tableRefsMap.get(chart.table)
      if (!tableRef) {
        throw new Error(`Chart table "${chart.table}" not found`)
      }
    }

    // Phase 1: Create first widget (selector or first chart)
    let firstTableRef: number
    let firstWidgetType: WidgetType
    if (hasSelector && selectorTableRef) {
      firstTableRef = selectorTableRef
      firstWidgetType = toGristWidgetType(config.selector?.widget_type ?? 'grid')
    } else {
      const chartTableRef = tableRefsMap.get(config.charts[0].table)
      if (chartTableRef === undefined) {
        throw new Error(`Table ref not found for chart: ${config.charts[0].table}`)
      }
      firstTableRef = chartTableRef
      firstWidgetType = 'chart'
    }

    const phase1Response = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [buildCreateViewSectionAction(firstTableRef, 0, firstWidgetType, null, null)],
      {
        schema: ApplyResponseSchema,
        context: hasSelector
          ? 'Creating selector widget for chart dashboard'
          : 'Creating first chart widget for chart dashboard'
      }
    )

    const phase1RetValues = validateRetValues(phase1Response, {
      context: hasSelector ? 'Creating selector widget' : 'Creating first chart widget'
    })
    const phase1Results = processCreateViewSectionResults(phase1RetValues)

    if (phase1Results.length === 0) {
      throw new Error(
        'Failed to create first widget. No results returned from Grist API. ' +
          'Verify tables exist and you have sufficient permissions.'
      )
    }

    const viewRef = phase1Results[0].viewRef
    const sectionRefs = [phase1Results[0].sectionRef]
    const tableRefs = [firstTableRef]

    // Phase 2: Create remaining widgets (batch all in single request)
    const remainingWidgets: Array<{ tableRef: number; widgetType: WidgetType }> = []

    if (hasSelector) {
      // Add all charts
      for (const chart of config.charts) {
        const tableRef = tableRefsMap.get(chart.table)
        if (tableRef === undefined) {
          throw new Error(`Table ref not found for chart: ${chart.table}`)
        }
        remainingWidgets.push({
          tableRef,
          widgetType: 'chart'
        })
      }
    } else {
      // Add remaining charts (skip first)
      for (let i = 1; i < config.charts.length; i++) {
        const tableRef = tableRefsMap.get(config.charts[i].table)
        if (tableRef === undefined) {
          throw new Error(`Table ref not found for chart: ${config.charts[i].table}`)
        }
        remainingWidgets.push({
          tableRef,
          widgetType: 'chart'
        })
      }
    }

    if (remainingWidgets.length > 0) {
      const remainingActions: UserAction[] = remainingWidgets.map((w) =>
        buildCreateViewSectionAction(w.tableRef, viewRef, w.widgetType, null, null)
      )

      const phase2Response = await this.client.post<ApplyResponse>(
        `/docs/${docId}/apply`,
        remainingActions,
        {
          schema: ApplyResponseSchema,
          context: 'Creating additional chart widgets'
        }
      )

      const phase2RetValues = validateRetValues(phase2Response, {
        context: 'Creating additional chart widgets'
      })
      const phase2Results = processCreateViewSectionResults(phase2RetValues)

      sectionRefs.push(...phase2Results.map((r) => r.sectionRef))
      tableRefs.push(...remainingWidgets.map((w) => w.tableRef))
    }

    // Phase 3: Set layout and page name
    let layout: LayoutSpec
    const chartSectionRefs = sectionRefs.slice(chartStartIndex)

    if (hasSelector && chartSectionRefs.length > 0) {
      // Selector on left, charts on right (nested vertical splits)
      let chartsLayout: LayoutSpec
      if (chartSectionRefs.length === 1) {
        chartsLayout = buildLeafLayout(chartSectionRefs[0])
      } else {
        chartsLayout = buildVerticalSplitLayout(chartSectionRefs[0], chartSectionRefs[1], 0.5)
        for (let i = 2; i < chartSectionRefs.length; i++) {
          chartsLayout = buildVerticalSplitLayout(
            getFirstSectionId(chartsLayout),
            chartSectionRefs[i],
            0.5
          )
        }
      }
      layout = buildHorizontalSplitLayout(sectionRefs[0], getFirstSectionId(chartsLayout), 0.3)
    } else {
      // No selector - just charts stacked vertically
      if (sectionRefs.length === 1) {
        layout = buildLeafLayout(sectionRefs[0])
      } else {
        layout = buildVerticalSplitLayout(sectionRefs[0], sectionRefs[1], 0.5)
        for (let i = 2; i < sectionRefs.length; i++) {
          layout = buildVerticalSplitLayout(getFirstSectionId(layout), sectionRefs[i], 0.5)
        }
      }
    }

    const layoutResp = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [
        buildUpdateLayoutAction(viewRef, layout),
        ['UpdateRecord', '_grist_Views', viewRef, { name: page_name }]
      ],
      {
        schema: ApplyResponseSchema,
        context: 'Setting chart dashboard layout'
      }
    )

    validateRetValues(layoutResp, { context: 'Setting chart dashboard layout' })

    // Phase 4: Configure each chart (type, options, and axes)
    for (let i = 0; i < config.charts.length; i++) {
      const chart = config.charts[i]
      const chartSectionIndex = chartStartIndex + i
      const sectionRef = sectionRefs[chartSectionIndex]

      // Configure chart type and options
      if (chart.chart_type || chart.chart_options) {
        const chartType = chart.chart_type || 'bar'
        const chartConfigResp = await this.client.post<ApplyResponse>(
          `/docs/${docId}/apply`,
          [buildChartConfigAction(sectionRef, chartType, chart.chart_options)],
          {
            schema: ApplyResponseSchema,
            context: `Configuring chart ${i + 1} (${chartType})`
          }
        )

        validateRetValues(chartConfigResp, { context: `Configuring chart ${i + 1}` })
      }

      // Configure chart axes (x_axis first, then y_axis series)
      if (chart.x_axis || (chart.y_axis && chart.y_axis.length > 0)) {
        const axisActions = await configureChartAxes(
          this.client,
          docId,
          sectionRef,
          chart.table, // tableId needed to query column references
          chart.x_axis,
          chart.y_axis
        )

        if (axisActions.length > 0) {
          const axisResp = await this.client.post<ApplyResponse>(
            `/docs/${docId}/apply`,
            axisActions,
            {
              schema: ApplyResponseSchema,
              context: `Configuring chart ${i + 1} axes`
            }
          )

          validateRetValues(axisResp, { context: `Configuring chart ${i + 1} axes` })
        }
      }
    }

    // Phase 5: Link charts to selector (if present)
    if (hasSelector && selectorIndex >= 0) {
      const selectorSectionRef = sectionRefs[selectorIndex]

      // Batch all link actions
      const linkActions: UserAction[] = config.charts.map((_, i) => {
        const chartSectionIndex = chartStartIndex + i
        return buildWidgetLinkAction(sectionRefs[chartSectionIndex], selectorSectionRef, 0, 0)
      })

      const linkResp = await this.client.post<ApplyResponse>(
        `/docs/${docId}/apply`,
        linkActions,
        {
          schema: ApplyResponseSchema,
          context: 'Linking charts to selector'
        }
      )

      validateRetValues(linkResp, { context: 'Linking charts to selector' })
    }

    // Phase 6: Set widget titles
    const titleActions: UserAction[] = []

    // Selector title
    if (hasSelector && config.selector) {
      const selectorTitle = config.selector.title || `Selector: ${config.selector.table}`
      titleActions.push([
        'UpdateRecord',
        '_grist_Views_section',
        sectionRefs[selectorIndex],
        { title: selectorTitle }
      ])
    }

    // Chart titles
    for (let i = 0; i < config.charts.length; i++) {
      const chart = config.charts[i]
      const chartSectionIndex = chartStartIndex + i
      const chartTitle = chart.title || `Chart ${i + 1}: ${chart.table}`
      titleActions.push([
        'UpdateRecord',
        '_grist_Views_section',
        sectionRefs[chartSectionIndex],
        { title: chartTitle }
      ])
    }

    if (titleActions.length > 0) {
      const titleResp = await this.client.post<ApplyResponse>(
        `/docs/${docId}/apply`,
        titleActions,
        {
          schema: ApplyResponseSchema,
          context: 'Setting widget titles for chart dashboard'
        }
      )

      validateRetValues(titleResp, { context: 'Setting widget titles' })
    }

    // Build return data
    const widgets: Array<{
      section_id: number
      table_ref: number
      title: string
      widget_type?: string
      position?: string
    }> = []

    if (hasSelector && config.selector && selectorTableRef !== undefined) {
      widgets.push({
        section_id: sectionRefs[selectorIndex],
        table_ref: selectorTableRef,
        title: config.selector.title || `Selector: ${config.selector.table}`,
        widget_type: config.selector.widget_type || 'grid',
        position: 'selector'
      })
    }

    for (let i = 0; i < config.charts.length; i++) {
      const chart = config.charts[i]
      const chartSectionIndex = chartStartIndex + i
      widgets.push({
        section_id: sectionRefs[chartSectionIndex],
        table_ref: tableRefs[chartSectionIndex],
        title: chart.title || `Chart ${i + 1}: ${chart.table}`,
        widget_type: 'chart',
        position: `chart_${i + 1}`
      })
    }

    const description = `Chart Dashboard: ${config.charts.length} charts${hasSelector ? ' + selector' : ''}`
    return {
      success: true,
      page_name,
      view_id: viewRef,
      pattern: config.pattern,
      description,
      widgets
    }
  }

  protected async executeInternal(params: BuildPageInput) {
    const { docId, page_name, config } = params

    // Get table references
    const tableRefsMap = await this.getTableRefsMap(docId)

    // Special handling for master_detail pattern (two-phase creation)
    if (config.pattern === 'master_detail') {
      return this.buildMasterDetailPage(docId, page_name, config, tableRefsMap)
    }

    // Build actions based on pattern (master_detail handled above)
    switch (config.pattern) {
      case 'custom': {
        // Custom pattern requires special handling for multi-widget pages
        // Cannot be handled in the main switch - use special method
        return this.buildCustomPatternPage(docId, page_name, config, tableRefsMap)
      }

      case 'form_table': {
        // Form-table pattern requires two-phase creation for widgets on same page
        return this.buildFormTablePage(docId, page_name, config, tableRefsMap)
      }

      case 'hierarchical': {
        // Hierarchical pattern requires two-phase creation for widgets on same page
        return this.buildHierarchicalPage(docId, page_name, config, tableRefsMap)
      }

      case 'chart_dashboard': {
        // Chart dashboard requires two-phase creation for widgets on same page
        return this.buildChartDashboardPage(docId, page_name, config, tableRefsMap)
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
  description:
    'Create pages with widget patterns.\n' +
    'Patterns: master_detail, hierarchical, chart_dashboard, form_table, custom\n' +
    'Widgets: grid, card, card_list, chart, form, custom\n' +
    'Params: docId, page_name, config\n' +
    'Ex: {page_name:"Dashboard",config:{pattern:"master_detail",master:{table:"Customers"},detail:{table:"Orders",link_field:"CustomerRef"}}}\n' +
    '->grist_help',
  purpose: 'Create pages with pre-configured widget layouts and linking',
  category: 'document_structure',
  inputSchema: BuildPageSchema,
  annotations: { ...WRITE_SAFE_ANNOTATIONS, ...SLOW_OPERATION_ANNOTATIONS },
  handler: buildPage,
  docs: {
    overview:
      'Creates pages with widget patterns. Master-detail links two tables. ' +
      'Hierarchical creates drill-down summaries (auto-creates summary tables). ' +
      'Chart dashboard combines charts with selectors. ' +
      'Custom allows arbitrary widget arrangements. ' +
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
