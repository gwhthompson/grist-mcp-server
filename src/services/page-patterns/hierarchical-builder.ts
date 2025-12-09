/**
 * HierarchicalBuilder - Creates pages with drill-down summary levels.
 *
 * This pattern creates multiple summary widgets where selecting a row
 * in one level filters the next level, enabling hierarchical data exploration.
 */

import type { BuildPageInput } from '../../schemas/pages-widgets.js'
import { getFirstSectionId } from '../../tools/pages/shared.js'
import type { LayoutSpec, UserAction } from '../../types.js'
import { at, first } from '../../utils/array-helpers.js'
import {
  buildColumnRefsMap,
  buildCreateViewSectionAction,
  buildLeafLayout,
  buildVerticalSplitLayout,
  buildWidgetLinkAction
} from '../pages-builder.js'
import { PatternBuilder } from './pattern-builder.js'
import type { PatternBuildResult, WidgetInfo } from './types.js'

export type HierarchicalConfig = Extract<BuildPageInput['config'], { pattern: 'hierarchical' }>

export class HierarchicalBuilder extends PatternBuilder<HierarchicalConfig> {
  async build(config: HierarchicalConfig): Promise<PatternBuildResult> {
    const { tableRefsMap, pageName, docId, client, schemaCache } = this.context

    // Build column references map for groupBy columns
    const columnRefs: string[] = []
    config.levels.forEach((level) => {
      level.group_by.forEach((colName) => {
        columnRefs.push(`${level.table}.${colName}`)
      })
    })
    const colRefsMap = await buildColumnRefsMap(client, docId, columnRefs)

    // Validate all tables exist and ensure at least one level
    if (config.levels.length === 0) {
      throw new Error('Hierarchical pattern requires at least one level')
    }

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
    const firstLevel = config.levels[0] as (typeof config.levels)[number]
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
    const phase1Results = await this.executeCreateSections(
      [buildCreateViewSectionAction(firstTableRef, 0, 'record', firstGroupbyColRefs, null)],
      `Creating first hierarchical level for ${firstLevel.table}`
    )

    if (phase1Results.length === 0) {
      throw new Error(
        'Failed to create first hierarchical level. No results returned from Grist API. ' +
          `Verify table "${firstLevel.table}" exists and you have sufficient permissions.`
      )
    }

    const firstResult = first(phase1Results, 'Creating first hierarchical level')
    const viewRef = firstResult.viewRef
    const sectionRefs = [firstResult.sectionRef]
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

      const remainingResults = await this.executeCreateSections(
        remainingActions,
        'Creating additional hierarchical levels'
      )

      sectionRefs.push(...remainingResults.map((r) => r.sectionRef))
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
    const layout = this.buildHierarchicalLayout(sectionRefs)
    await this.setLayoutAndName(viewRef, layout)

    // Phase 4: Link each level to the next (drill-down behavior)
    if (sectionRefs.length > 1) {
      const linkActions: UserAction[] = []
      for (let i = 0; i < sectionRefs.length - 1; i++) {
        // Safe: loop bounds guarantee both sectionRefs[i+1] and sectionRefs[i] exist
        linkActions.push(
          buildWidgetLinkAction(sectionRefs[i + 1] as number, sectionRefs[i] as number, 0, 0)
        )
      }

      await this.executeActions(linkActions, 'Linking hierarchical levels')
    }

    // Phase 5: Set widget titles
    const titles = config.levels.map(
      (level, i) =>
        level.title || `Level ${i + 1}: ${level.table} (by ${level.group_by.join(', ')})`
    )

    await this.setWidgetTitles(sectionRefs, titles)

    // Invalidate schema cache after creating summary tables
    schemaCache.invalidateDocument(docId as never)

    // Query for the created summary table names
    const summaryTableNames = await this.getSummaryTableNames(config.levels)

    // Build result
    const widgets: WidgetInfo[] = config.levels.map((level, i) => ({
      section_id: sectionRefs[i] as number,
      table_ref: tableRefs[i] as number,
      title: titles[i] as string,
      widget_type: level.widget_type || 'grid',
      position: `level_${i + 1}`,
      summary_table_id: summaryTableNames[i] as string
    }))

    return {
      success: true,
      page_name: pageName,
      view_id: viewRef,
      pattern: config.pattern,
      description: `Hierarchical: ${config.levels.length} levels`,
      widgets
    }
  }

  /**
   * Build layout for hierarchical pattern.
   */
  private buildHierarchicalLayout(sectionRefs: number[]): LayoutSpec {
    const firstSectionRef = first(sectionRefs, 'Hierarchical pattern requires at least one level')

    if (sectionRefs.length === 1) {
      return buildLeafLayout(firstSectionRef)
    }

    if (sectionRefs.length === 2) {
      return buildVerticalSplitLayout(
        firstSectionRef,
        at(sectionRefs, 1, 'Hierarchical pattern second level'),
        0.5
      )
    }

    // For 3+ levels, create nested vertical splits
    let layout = buildVerticalSplitLayout(
      firstSectionRef,
      at(sectionRefs, 1, 'Hierarchical pattern second level'),
      0.5
    )

    for (let i = 2; i < sectionRefs.length; i++) {
      layout = buildVerticalSplitLayout(
        getFirstSectionId(layout),
        at(sectionRefs, i, `Hierarchical pattern level ${i + 1}`),
        0.5
      )
    }

    return layout
  }

  /**
   * Query for the summary table names created by the hierarchical pattern.
   * Summary tables are auto-named: {SourceTable}_summary_{GroupBy1}_{GroupBy2}
   */
  private async getSummaryTableNames(
    levels: Array<{ table: string; group_by: string[] }>
  ): Promise<string[]> {
    const { docId, schemaCache } = this.context

    // Fetch fresh table list after cache invalidation
    const tableRefs = await schemaCache.getTableRefs(docId as never)
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
      const firstGroupByCol = level.group_by[0] ?? ''
      const match = tableNames.find(
        (name) => name.startsWith(expectedPrefix) && name.includes(firstGroupByCol)
      )
      return match ?? expectedName // Return expected name even if not found
    })
  }
}
