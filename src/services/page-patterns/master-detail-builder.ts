/**
 * MasterDetailBuilder - Creates pages with linked master-detail widgets.
 *
 * This pattern creates two linked widgets where selecting a row in the
 * master widget filters the detail widget to show related records.
 */

import type { BuildPageInput } from '../../schemas/pages-widgets.js'
import { toGristWidgetType } from '../../schemas/pages-widgets.js'
import { first } from '../../utils/array-helpers.js'
import {
  buildCreateViewSectionAction,
  buildHorizontalSplitLayout,
  buildVerticalSplitLayout,
  buildWidgetLinkAction
} from '../pages-builder.js'
import { resolveColumnNameToColRef } from '../widget-resolver.js'
import { PatternBuilder } from './pattern-builder.js'
import type { PatternBuildResult, WidgetInfo } from './types.js'

export type MasterDetailConfig = Extract<BuildPageInput['config'], { pattern: 'master_detail' }>

export class MasterDetailBuilder extends PatternBuilder<MasterDetailConfig> {
  async build(config: MasterDetailConfig): Promise<PatternBuildResult> {
    const { tableRefsMap, pageName, docId, client } = this.context

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
    const phase1Results = await this.executeCreateSections(
      [
        buildCreateViewSectionAction(
          masterTableRef,
          0, // viewRef=0 creates new view/page
          toGristWidgetType(config.master.widget_type),
          null,
          null
        )
      ],
      `Creating master widget for ${config.master.table}`
    )

    if (phase1Results.length === 0) {
      throw new Error(
        'Failed to create master widget. No results returned from Grist API. ' +
          `Verify table "${config.master.table}" exists and you have sufficient permissions.`
      )
    }

    const firstResult = first(phase1Results, 'Creating master widget')
    const viewRef = firstResult.viewRef
    const masterSectionRef = firstResult.sectionRef

    // Phase 2: Create detail widget (add to same view)
    const phase2Results = await this.executeCreateSections(
      [
        buildCreateViewSectionAction(
          detailTableRef,
          viewRef, // Use viewRef from phase 1 to add to same page
          toGristWidgetType(config.detail.widget_type),
          null,
          null
        )
      ],
      `Creating detail widget for ${config.detail.table}`
    )

    if (phase2Results.length === 0) {
      throw new Error(
        'Failed to create detail widget. No results returned from Grist API. ' +
          `Verify table "${config.detail.table}" exists and you have sufficient permissions.`
      )
    }

    const detailSectionRef = first(phase2Results, 'Creating detail widget').sectionRef

    // Phase 3: Set widget titles
    const masterTitle = config.master.title || `Master: ${config.master.table}`
    const detailTitle = config.detail.title || `Detail: ${config.detail.table}`

    await this.setWidgetTitles([masterSectionRef, detailSectionRef], [masterTitle, detailTitle])

    // Phase 4: Set layout
    const layout =
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

    await this.setLayoutAndName(viewRef, layout)

    // Phase 5: Configure widget linking
    const linkColRef = await resolveColumnNameToColRef(
      client,
      docId,
      config.detail.table,
      config.detail.link_field
    )

    await this.executeActions(
      [buildWidgetLinkAction(detailSectionRef, masterSectionRef, 0, linkColRef)],
      'Linking master and detail widgets'
    )

    // Build result
    const widgets: WidgetInfo[] = [
      {
        sectionId: masterSectionRef,
        tableRef: masterTableRef,
        position: 'master',
        title: masterTitle
      },
      {
        sectionId: detailSectionRef,
        tableRef: detailTableRef,
        position: 'detail',
        title: detailTitle
      }
    ]

    return {
      success: true,
      pageName: pageName,
      viewId: viewRef,
      pattern: config.pattern,
      description: `Master-Detail: ${config.master.table} (${config.master.widget_type}) ← ${config.detail.table} (${config.detail.widget_type})`,
      widgets
    }
  }
}
