/**
 * ChartDashboardBuilder - Creates pages with multiple charts and optional selector.
 *
 * This pattern creates a dashboard with one or more chart widgets,
 * optionally linked to a selector widget for filtering.
 */

import type { BuildPageInput } from '../../schemas/pages-widgets.js'
import { toGristWidgetType } from '../../schemas/pages-widgets.js'
import { at, first } from '../../utils/array-helpers.js'
import type { LayoutSpec, UserAction, WidgetType } from '../../types.js'
import {
  buildChartConfigAction,
  buildCreateViewSectionAction,
  buildHorizontalSplitLayout,
  buildLeafLayout,
  buildVerticalSplitLayout,
  buildWidgetLinkAction,
  configureChartAxes
} from '../pages-builder.js'
import { getFirstSectionId } from '../../tools/pages/shared.js'
import { PatternBuilder } from './pattern-builder.js'
import type { PatternBuildResult, WidgetInfo } from './types.js'

export type ChartDashboardConfig = Extract<BuildPageInput['config'], { pattern: 'chart_dashboard' }>

export class ChartDashboardBuilder extends PatternBuilder<ChartDashboardConfig> {
  async build(config: ChartDashboardConfig): Promise<PatternBuildResult> {
    const { tableRefsMap, pageName, docId, client } = this.context

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

    // Validate chart tables and ensure at least one chart
    if (config.charts.length === 0) {
      throw new Error('Chart dashboard pattern requires at least one chart')
    }

    for (const chart of config.charts) {
      const tableRef = tableRefsMap.get(chart.table)
      if (!tableRef) {
        throw new Error(`Chart table "${chart.table}" not found`)
      }
    }

    // Phase 1: Create first widget (selector or first chart)
    const { firstTableRef, firstWidgetType } = this.getFirstWidgetInfo(
      config,
      hasSelector,
      selectorTableRef,
      tableRefsMap
    )

    const phase1Results = await this.executeCreateSections(
      [buildCreateViewSectionAction(firstTableRef, 0, firstWidgetType, null, null)],
      hasSelector
        ? 'Creating selector widget for chart dashboard'
        : 'Creating first chart widget for chart dashboard'
    )

    if (phase1Results.length === 0) {
      throw new Error(
        'Failed to create first widget. No results returned from Grist API. ' +
          'Verify tables exist and you have sufficient permissions.'
      )
    }

    const firstResult = first(phase1Results, 'Chart dashboard first widget')
    const viewRef = firstResult.viewRef
    const sectionRefs = [firstResult.sectionRef]
    const tableRefs = [firstTableRef]

    // Phase 2: Create remaining widgets (batch all in single request)
    const remainingWidgets = this.getRemainingWidgets(config, hasSelector, tableRefsMap)

    if (remainingWidgets.length > 0) {
      const remainingActions: UserAction[] = remainingWidgets.map((w) =>
        buildCreateViewSectionAction(w.tableRef, viewRef, w.widgetType, null, null)
      )

      const remainingResults = await this.executeCreateSections(
        remainingActions,
        'Creating additional chart widgets'
      )

      sectionRefs.push(...remainingResults.map((r) => r.sectionRef))
      tableRefs.push(...remainingWidgets.map((w) => w.tableRef))
    }

    // Phase 3: Set layout and page name
    const chartSectionRefs = sectionRefs.slice(chartStartIndex)
    const layout = this.buildDashboardLayout(hasSelector, sectionRefs, chartSectionRefs)
    await this.setLayoutAndName(viewRef, layout)

    // Phase 4: Configure each chart (type, options, and axes)
    await this.configureCharts(config, sectionRefs, chartStartIndex, docId, client)

    // Phase 5: Link charts to selector (if present)
    if (hasSelector && selectorIndex >= 0) {
      await this.linkChartsToSelector(config, sectionRefs, selectorIndex, chartStartIndex)
    }

    // Phase 6: Set widget titles
    await this.setDashboardWidgetTitles(config, hasSelector, sectionRefs, selectorIndex, chartStartIndex)

    // Build result
    const widgets = this.buildWidgetResults(
      config,
      hasSelector,
      sectionRefs,
      tableRefs,
      selectorTableRef,
      selectorIndex,
      chartStartIndex
    )

    return {
      success: true,
      page_name: pageName,
      view_id: viewRef,
      pattern: config.pattern,
      description: `Chart Dashboard: ${config.charts.length} charts${hasSelector ? ' + selector' : ''}`,
      widgets
    }
  }

  /**
   * Get info for the first widget to create.
   */
  private getFirstWidgetInfo(
    config: ChartDashboardConfig,
    hasSelector: boolean,
    selectorTableRef: number | undefined,
    tableRefsMap: ReadonlyMap<string, number>
  ): { firstTableRef: number; firstWidgetType: WidgetType } {
    if (hasSelector && selectorTableRef) {
      return {
        firstTableRef: selectorTableRef,
        firstWidgetType: toGristWidgetType(config.selector?.widget_type ?? 'grid')
      }
    }

    // First chart
    const firstChart = config.charts[0] as (typeof config.charts)[number]
    const chartTableRef = tableRefsMap.get(firstChart.table)
    if (chartTableRef === undefined) {
      throw new Error(`Table ref not found for chart: ${firstChart.table}`)
    }
    return {
      firstTableRef: chartTableRef,
      firstWidgetType: 'chart'
    }
  }

  /**
   * Get remaining widgets to create after the first.
   */
  private getRemainingWidgets(
    config: ChartDashboardConfig,
    hasSelector: boolean,
    tableRefsMap: ReadonlyMap<string, number>
  ): Array<{ tableRef: number; widgetType: WidgetType }> {
    const remainingWidgets: Array<{ tableRef: number; widgetType: WidgetType }> = []

    if (hasSelector) {
      // Add all charts
      for (const chart of config.charts) {
        const tableRef = tableRefsMap.get(chart.table)
        if (tableRef === undefined) {
          throw new Error(`Table ref not found for chart: ${chart.table}`)
        }
        remainingWidgets.push({ tableRef, widgetType: 'chart' })
      }
    } else {
      // Add remaining charts (skip first)
      for (let i = 1; i < config.charts.length; i++) {
        const chart = config.charts[i] as (typeof config.charts)[number]
        const tableRef = tableRefsMap.get(chart.table)
        if (tableRef === undefined) {
          throw new Error(`Table ref not found for chart: ${chart.table}`)
        }
        remainingWidgets.push({ tableRef, widgetType: 'chart' })
      }
    }

    return remainingWidgets
  }

  /**
   * Build the dashboard layout.
   */
  private buildDashboardLayout(
    hasSelector: boolean,
    sectionRefs: number[],
    chartSectionRefs: number[]
  ): LayoutSpec {
    if (hasSelector && chartSectionRefs.length > 0) {
      // Selector on left, charts on right (nested vertical splits)
      const chartsLayout = this.buildChartsLayout(chartSectionRefs)
      return buildHorizontalSplitLayout(
        first(sectionRefs, 'Chart dashboard selector'),
        getFirstSectionId(chartsLayout),
        0.3
      )
    }

    // No selector - just charts stacked vertically
    return this.buildChartsLayout(sectionRefs)
  }

  /**
   * Build layout for charts (vertical stack).
   */
  private buildChartsLayout(chartSectionRefs: number[]): LayoutSpec {
    const firstChartRef = first(chartSectionRefs, 'Chart dashboard first chart')

    if (chartSectionRefs.length === 1) {
      return buildLeafLayout(firstChartRef)
    }

    let layout = buildVerticalSplitLayout(
      firstChartRef,
      at(chartSectionRefs, 1, 'Chart dashboard second chart'),
      0.5
    )

    for (let i = 2; i < chartSectionRefs.length; i++) {
      layout = buildVerticalSplitLayout(
        getFirstSectionId(layout),
        at(chartSectionRefs, i, `Chart dashboard chart ${i + 1}`),
        0.5
      )
    }

    return layout
  }

  /**
   * Configure each chart (type, options, and axes).
   */
  private async configureCharts(
    config: ChartDashboardConfig,
    sectionRefs: number[],
    chartStartIndex: number,
    docId: string,
    client: typeof this.context.client
  ): Promise<void> {
    for (let i = 0; i < config.charts.length; i++) {
      const chart = config.charts[i] as (typeof config.charts)[number]
      const chartSectionIndex = chartStartIndex + i
      const sectionRef = sectionRefs[chartSectionIndex] as number

      // Configure chart type and options
      if (chart.chart_type || chart.chart_options) {
        const chartType = chart.chart_type || 'bar'
        await this.executeActions(
          [buildChartConfigAction(sectionRef, chartType, chart.chart_options)],
          `Configuring chart ${i + 1} (${chartType})`
        )
      }

      // Configure chart axes (x_axis first, then y_axis series)
      if (chart.x_axis || (chart.y_axis && chart.y_axis.length > 0)) {
        const axisActions = await configureChartAxes(
          client,
          docId,
          sectionRef,
          chart.table,
          chart.x_axis,
          chart.y_axis
        )

        if (axisActions.length > 0) {
          await this.executeActions(axisActions, `Configuring chart ${i + 1} axes`)
        }
      }
    }
  }

  /**
   * Link charts to selector widget.
   */
  private async linkChartsToSelector(
    config: ChartDashboardConfig,
    sectionRefs: number[],
    selectorIndex: number,
    chartStartIndex: number
  ): Promise<void> {
    const selectorSectionRef = sectionRefs[selectorIndex] as number

    const linkActions: UserAction[] = config.charts.map((_, i) => {
      const chartSectionIndex = chartStartIndex + i
      return buildWidgetLinkAction(sectionRefs[chartSectionIndex] as number, selectorSectionRef, 0, 0)
    })

    await this.executeActions(linkActions, 'Linking charts to selector')
  }

  /**
   * Set widget titles for the dashboard.
   */
  private async setDashboardWidgetTitles(
    config: ChartDashboardConfig,
    hasSelector: boolean,
    sectionRefs: number[],
    selectorIndex: number,
    chartStartIndex: number
  ): Promise<void> {
    const titleActions: UserAction[] = []

    // Selector title
    if (hasSelector && config.selector) {
      const selectorTitle = config.selector.title || `Selector: ${config.selector.table}`
      titleActions.push([
        'UpdateRecord',
        '_grist_Views_section',
        sectionRefs[selectorIndex] as number,
        { title: selectorTitle }
      ])
    }

    // Chart titles
    for (let i = 0; i < config.charts.length; i++) {
      const chart = config.charts[i] as (typeof config.charts)[number]
      const chartSectionIndex = chartStartIndex + i
      const chartTitle = chart.title || `Chart ${i + 1}: ${chart.table}`
      titleActions.push([
        'UpdateRecord',
        '_grist_Views_section',
        sectionRefs[chartSectionIndex] as number,
        { title: chartTitle }
      ])
    }

    if (titleActions.length > 0) {
      await this.executeActions(titleActions, 'Setting widget titles for chart dashboard')
    }
  }

  /**
   * Build widget results for the response.
   */
  private buildWidgetResults(
    config: ChartDashboardConfig,
    hasSelector: boolean,
    sectionRefs: number[],
    tableRefs: number[],
    selectorTableRef: number | undefined,
    selectorIndex: number,
    chartStartIndex: number
  ): WidgetInfo[] {
    const widgets: WidgetInfo[] = []

    if (hasSelector && config.selector && selectorTableRef !== undefined) {
      widgets.push({
        section_id: sectionRefs[selectorIndex] as number,
        table_ref: selectorTableRef,
        title: config.selector.title || `Selector: ${config.selector.table}`,
        widget_type: config.selector.widget_type || 'grid',
        position: 'selector'
      })
    }

    for (let i = 0; i < config.charts.length; i++) {
      const chart = config.charts[i] as (typeof config.charts)[number]
      const chartSectionIndex = chartStartIndex + i
      widgets.push({
        section_id: sectionRefs[chartSectionIndex] as number,
        table_ref: tableRefs[chartSectionIndex] as number,
        title: chart.title || `Chart ${i + 1}: ${chart.table}`,
        widget_type: 'chart',
        position: `chart_${i + 1}`
      })
    }

    return widgets
  }
}
