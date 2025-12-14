/**
 * FormTableBuilder - Creates pages with form entry + table view pattern.
 *
 * This pattern combines a data entry form widget with a table view
 * showing the same or related data.
 */

import type { BuildPageInput } from '../../schemas/pages-widgets.js'
import { toGristWidgetType } from '../../schemas/pages-widgets.js'
import { first } from '../../utils/array-helpers.js'
import {
  buildCreateViewSectionAction,
  buildHorizontalSplitLayout,
  buildVerticalSplitLayout
} from '../pages-builder.js'
import { PatternBuilder } from './pattern-builder.js'
import type { PatternBuildResult, WidgetInfo } from './types.js'

export type FormTableConfig = Extract<BuildPageInput['config'], { pattern: 'form_table' }>

export class FormTableBuilder extends PatternBuilder<FormTableConfig> {
  async build(config: FormTableConfig): Promise<PatternBuildResult> {
    const { tableRefsMap, pageName } = this.context

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
    const phase1Results = await this.executeCreateSections(
      [buildCreateViewSectionAction(formTableRef, 0, 'form', null, null)],
      `Creating form widget for ${config.form.table}`
    )

    if (phase1Results.length === 0) {
      throw new Error(
        'Failed to create form widget. No results returned from Grist API. ' +
          `Verify table "${config.form.table}" exists and you have sufficient permissions.`
      )
    }

    const firstResult = first(phase1Results, 'Creating form widget')
    const viewRef = firstResult.viewRef
    const formSectionRef = firstResult.sectionRef

    // Phase 2: Create table widget (add to same view)
    const phase2Results = await this.executeCreateSections(
      [
        buildCreateViewSectionAction(
          tableTableRef,
          viewRef,
          toGristWidgetType(config.table.widget_type),
          null,
          null
        )
      ],
      `Creating table widget for ${config.table.table}`
    )

    if (phase2Results.length === 0) {
      throw new Error(
        'Failed to create table widget. No results returned from Grist API. ' +
          `Verify table "${config.table.table}" exists and you have sufficient permissions.`
      )
    }

    const tableSectionRef = first(phase2Results, 'Creating table widget').sectionRef

    // Phase 3: Set widget titles
    const formTitle = config.form.title || `Form: ${config.form.table}`
    const tableTitle = config.table.title || `Table: ${config.table.table}`

    await this.setWidgetTitles([formSectionRef, tableSectionRef], [formTitle, tableTitle])

    // Phase 4: Set layout and page name
    const layout =
      config.split === 'horizontal'
        ? buildHorizontalSplitLayout(formSectionRef, tableSectionRef, 0.5)
        : buildVerticalSplitLayout(formSectionRef, tableSectionRef, 0.5)

    await this.setLayoutAndName(viewRef, layout)

    // Build result
    const widgets: WidgetInfo[] = [
      {
        sectionId: formSectionRef,
        tableRef: formTableRef,
        title: formTitle,
        widget_type: 'form',
        position: 'form'
      },
      {
        sectionId: tableSectionRef,
        tableRef: tableTableRef,
        title: tableTitle,
        widget_type: config.table.widget_type || 'grid',
        position: 'table'
      }
    ]

    return {
      success: true,
      pageName: pageName,
      viewId: viewRef,
      pattern: config.pattern,
      description: `Form-Table: ${config.form.table} form + ${config.table.table} table`,
      widgets
    }
  }
}
