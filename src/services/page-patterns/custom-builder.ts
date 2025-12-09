/**
 * CustomBuilder - Creates pages with arbitrary widget arrangements.
 *
 * This pattern allows users to define multiple widgets with custom
 * layouts and optional linking between them.
 */

import type { BuildPageInput } from '../../schemas/pages-widgets.js'
import { toGristWidgetType } from '../../schemas/pages-widgets.js'
import type { LayoutSpec, UserAction } from '../../types.js'
import { at, first } from '../../utils/array-helpers.js'
import {
  buildCreateViewSectionAction,
  buildLeafLayout,
  buildVerticalSplitLayout,
  buildWidgetLinkAction
} from '../pages-builder.js'
import { resolveColumnNameToColRef } from '../widget-resolver.js'
import { PatternBuilder } from './pattern-builder.js'
import type { PatternBuildResult, WidgetInfo } from './types.js'

export type CustomConfig = Extract<BuildPageInput['config'], { pattern: 'custom' }>

export class CustomBuilder extends PatternBuilder<CustomConfig> {
  async build(config: CustomConfig): Promise<PatternBuildResult> {
    const { tableRefsMap, pageName, docId, client } = this.context

    // Validate all tables exist and ensure at least one widget
    if (config.widgets.length === 0) {
      throw new Error('Custom pattern requires at least one widget')
    }

    for (const widget of config.widgets) {
      const tableRef = tableRefsMap.get(widget.table)
      if (!tableRef) {
        throw new Error(
          `Table "${widget.table}" not found. Verify table exists using grist_get_tables with docId="${docId}" first.`
        )
      }
    }

    // Safe: length check above guarantees config.widgets[0] exists
    const firstWidget = config.widgets[0] as (typeof config.widgets)[number]
    const firstTableRef = tableRefsMap.get(firstWidget.table) ?? 0

    // Phase 1: Create first widget (generates new view)
    const phase1Results = await this.executeCreateSections(
      [
        buildCreateViewSectionAction(
          firstTableRef,
          0, // Create new view
          toGristWidgetType(firstWidget.widget_type),
          null,
          null
        )
      ],
      'Creating first widget for custom pattern'
    )

    if (phase1Results.length === 0) {
      throw new Error('Failed to create first widget. No results returned from Grist API.')
    }

    const firstResult = first(phase1Results, 'Creating first widget')
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

      const remainingResults = await this.executeCreateSections(
        remainingActions,
        'Creating additional widgets for custom pattern'
      )
      sectionRefs.push(...remainingResults.map((r) => r.sectionRef))
    }

    // Phase 3: Set layout
    let layout: LayoutSpec
    if (config.layout) {
      layout = config.layout as LayoutSpec
    } else {
      layout = this.buildDefaultLayout(sectionRefs)
    }

    await this.setLayoutAndName(viewRef, layout)

    // Phase 4: Set widget titles if specified
    const titleActions: UserAction[] = []
    for (let i = 0; i < config.widgets.length; i++) {
      // Safe: loop bound guarantees config.widgets[i] and sectionRefs[i] exist
      const widget = config.widgets[i] as (typeof config.widgets)[number]
      const sectionRef = sectionRefs[i] as number
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
      await this.executeActions(titleActions, 'Setting widget titles for custom pattern')
    }

    // Phase 5: Handle widget linking if specified
    await this.configureWidgetLinks(config, sectionRefs, docId, client)

    // Build result
    const widgets: WidgetInfo[] = sectionRefs.map((sectionRef, i) => {
      // Safe: sectionRefs and config.widgets have same length from construction
      const widget = config.widgets[i] as (typeof config.widgets)[number]
      return {
        section_id: sectionRef,
        table_ref: tableRefsMap.get(widget.table) ?? 0,
        title: widget.title ?? widget.table
      }
    })

    return {
      success: true,
      page_name: pageName,
      view_id: viewRef,
      pattern: config.pattern,
      description: `Custom pattern: ${config.widgets.length} widgets`,
      widgets
    }
  }

  /**
   * Build default vertical layout for multiple sections.
   */
  private buildDefaultLayout(sectionRefs: number[]): LayoutSpec {
    const firstSectionRef = first(sectionRefs, 'Layout requires at least one widget')

    if (sectionRefs.length === 1) {
      return buildLeafLayout(firstSectionRef)
    }

    if (sectionRefs.length === 2) {
      return buildVerticalSplitLayout(
        firstSectionRef,
        at(sectionRefs, 1, 'Custom pattern second widget'),
        0.5
      )
    }

    // For 3+ widgets, create nested vertical splits
    let currentLayout: LayoutSpec = buildVerticalSplitLayout(
      firstSectionRef,
      at(sectionRefs, 1, 'Custom pattern second widget'),
      0.5
    )

    for (let i = 2; i < sectionRefs.length; i++) {
      currentLayout = buildVerticalSplitLayout(
        firstSectionRef,
        at(sectionRefs, i, `Custom pattern widget ${i + 1}`),
        0.5
      )
    }

    return currentLayout
  }

  /**
   * Configure widget links based on link_to and link_field properties.
   */
  private async configureWidgetLinks(
    config: CustomConfig,
    sectionRefs: number[],
    docId: string,
    client: typeof this.context.client
  ): Promise<void> {
    for (let i = 0; i < config.widgets.length; i++) {
      // Safe: loop bound guarantees config.widgets[i] exists
      const widget = config.widgets[i] as (typeof config.widgets)[number]

      if (widget.link_to && widget.link_field) {
        const sourceWidgetIndex = config.widgets.findIndex(
          (w) => (w.title || w.table) === widget.link_to
        )

        if (sourceWidgetIndex >= 0) {
          // Safe: findIndex returned valid index, and i is in range
          const sourceSectionRef = sectionRefs[sourceWidgetIndex] as number
          const targetSectionRef = sectionRefs[i] as number

          const linkColRef = await resolveColumnNameToColRef(
            client,
            docId,
            widget.table,
            String(widget.link_field)
          )

          await this.executeActions(
            [buildWidgetLinkAction(targetSectionRef, sourceSectionRef, 0, linkColRef)],
            `Linking widget "${widget.title || widget.table}" to "${widget.link_to}"`
          )
        }
      }
    }
  }
}
