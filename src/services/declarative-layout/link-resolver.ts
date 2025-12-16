/**
 * Link resolver for declarative layouts.
 *
 * Transforms semantic link types (sync, select, filter, etc.) to
 * Grist's internal format (linkSrcSectionRef, linkSrcColRef, linkTargetColRef).
 */

import { ValidationError } from '../../errors/ValidationError.js'
import type { GristClient } from '../grist-client.js'
import { resolveColumnNameToColRef } from '../widget-resolver.js'
import type { Link, LinkTarget } from './schema.js'
import {
  isCustomLink,
  isFilterLink,
  isGroupLink,
  isRefsLink,
  isSelectLink,
  isSummaryLink,
  isSyncLink
} from './schema.js'
import type { WidgetRegistry } from './widget-registry.js'

// =============================================================================
// Types
// =============================================================================

export interface ResolvedLink {
  linkSrcSectionRef: number
  linkSrcColRef: number
  linkTargetColRef: number
}

export interface WidgetInfo {
  sectionId: number
  tableId: string
  tableRef: number
  widgetType: string
  isSummaryTable?: boolean
}

// =============================================================================
// Main Resolver
// =============================================================================

/**
 * Resolve a semantic link to Grist's internal format.
 *
 * @param client - GristClient for database queries
 * @param docId - Document ID
 * @param targetSectionId - The widget being linked (target)
 * @param targetTableId - Table of the target widget
 * @param link - The link configuration from the layout
 * @param registry - Widget registry for local ID resolution
 * @param getWidgetInfo - Function to get widget metadata
 * @returns Resolved link with colRef values
 */
export async function resolveLink(
  client: GristClient,
  docId: string,
  targetSectionId: number,
  targetTableId: string,
  link: Link,
  registry: WidgetRegistry,
  getWidgetInfo: (sectionId: number) => Promise<WidgetInfo>
): Promise<ResolvedLink> {
  // Resolve source section ID (may be local ID or numeric)
  const sourceSectionId = resolveTarget(link, registry)

  // Self-link check
  if (sourceSectionId === targetSectionId) {
    throw new ValidationError(
      'link',
      link,
      `Cannot link widget ${targetSectionId} to itself. ` +
        `Source and target must be different widgets.`
    )
  }

  // Get source widget info
  const sourceInfo = await getWidgetInfo(sourceSectionId)

  // Chart cannot be link source
  if (sourceInfo.widgetType === 'chart') {
    throw new ValidationError(
      'link',
      link,
      `Cannot use chart widget (section ${sourceSectionId}) as link source. ` +
        `Charts don't support row selection. Use a grid, card, or form widget as source.`
    )
  }

  // Dispatch to specific resolver based on link type
  if (isSyncLink(link)) {
    return resolveSyncLink(sourceSectionId, sourceInfo, targetTableId)
  }

  if (isSelectLink(link)) {
    return resolveSelectLink(
      client,
      docId,
      sourceSectionId,
      sourceInfo,
      targetTableId,
      link.select.col
    )
  }

  if (isFilterLink(link)) {
    return resolveFilterLink(client, docId, sourceSectionId, sourceInfo, targetTableId, link.filter)
  }

  if (isGroupLink(link)) {
    return resolveGroupLink(sourceSectionId, sourceInfo)
  }

  if (isSummaryLink(link)) {
    return resolveSummaryLink(sourceSectionId, sourceInfo)
  }

  if (isRefsLink(link)) {
    return resolveRefsLink(client, docId, sourceSectionId, sourceInfo, link.refs.col)
  }

  if (isCustomLink(link)) {
    return resolveCustomLink(sourceSectionId)
  }

  throw new ValidationError('link', link, 'Unknown link type')
}

// =============================================================================
// Link Target Resolution
// =============================================================================

/**
 * Extract the source target from a link and resolve via registry.
 */
function resolveTarget(link: Link, registry: WidgetRegistry): number {
  let target: LinkTarget

  if (isSyncLink(link)) target = link.sync
  else if (isSelectLink(link)) target = link.select.from
  else if (isFilterLink(link)) target = link.filter.from
  else if (isGroupLink(link)) target = link.group
  else if (isSummaryLink(link)) target = link.summary
  else if (isRefsLink(link)) target = link.refs.from
  else if (isCustomLink(link)) target = link.custom
  else throw new Error('Unknown link type')

  return registry.resolve(target)
}

// =============================================================================
// Link Type Resolvers
// =============================================================================

/**
 * Sync link: cursor sync between widgets showing same table.
 */
function resolveSyncLink(
  sourceSectionId: number,
  sourceInfo: WidgetInfo,
  targetTableId: string
): ResolvedLink {
  // Sync requires same table
  if (sourceInfo.tableId !== targetTableId) {
    throw new ValidationError(
      'link.sync',
      sourceSectionId,
      `Sync link requires both widgets to show the same table. ` +
        `Source shows "${sourceInfo.tableId}", target shows "${targetTableId}".`
    )
  }

  return {
    linkSrcSectionRef: sourceSectionId,
    linkSrcColRef: 0,
    linkTargetColRef: 0
  }
}

/**
 * Select link: cursor follows a Reference column.
 */
async function resolveSelectLink(
  client: GristClient,
  docId: string,
  sourceSectionId: number,
  sourceInfo: WidgetInfo,
  targetTableId: string,
  colId: string
): Promise<ResolvedLink> {
  // Resolve column name to colRef
  const colRef = await resolveColumnNameToColRef(client, docId, sourceInfo.tableId, colId)

  // Validate column is a Ref type pointing to target table
  await validateRefColumn(client, docId, sourceInfo.tableRef, colRef, targetTableId, 'Ref')

  return {
    linkSrcSectionRef: sourceSectionId,
    linkSrcColRef: colRef,
    linkTargetColRef: 0
  }
}

/**
 * Filter link: filter target by source selection.
 */
async function resolveFilterLink(
  client: GristClient,
  docId: string,
  sourceSectionId: number,
  sourceInfo: WidgetInfo,
  targetTableId: string,
  filter: { from: LinkTarget; col?: string; to: string }
): Promise<ResolvedLink> {
  // Resolve target column
  const targetColRef = await resolveColumnNameToColRef(client, docId, targetTableId, filter.to)

  // If source column specified (col→col filter)
  if (filter.col) {
    const sourceColRef = await resolveColumnNameToColRef(
      client,
      docId,
      sourceInfo.tableId,
      filter.col
    )

    return {
      linkSrcSectionRef: sourceSectionId,
      linkSrcColRef: sourceColRef,
      linkTargetColRef: targetColRef
    }
  }

  // Row→col filter: target column must be Ref/RefList pointing to source table
  await validateRefColumn(
    client,
    docId,
    0,
    targetColRef,
    sourceInfo.tableId,
    'Ref or RefList',
    targetTableId
  )

  return {
    linkSrcSectionRef: sourceSectionId,
    linkSrcColRef: 0,
    linkTargetColRef: targetColRef
  }
}

/**
 * Group link: show records belonging to selected summary group.
 */
function resolveGroupLink(sourceSectionId: number, sourceInfo: WidgetInfo): ResolvedLink {
  // Source must be a summary table
  if (!sourceInfo.isSummaryTable) {
    throw new ValidationError(
      'link.group',
      sourceSectionId,
      `Group link requires source to be a summary table. ` +
        `Widget ${sourceSectionId} shows "${sourceInfo.tableId}" which is not a summary table.`
    )
  }

  // Use special "group" marker for srcColRef
  // In Grist, this is represented as a special value
  return {
    linkSrcSectionRef: sourceSectionId,
    linkSrcColRef: 0, // Group links use 0, Grist infers from summary relationship
    linkTargetColRef: 0
  }
}

/**
 * Summary link: link summary table to its source or more detailed summary.
 */
function resolveSummaryLink(sourceSectionId: number, sourceInfo: WidgetInfo): ResolvedLink {
  // Source must be a summary table
  if (!sourceInfo.isSummaryTable) {
    throw new ValidationError(
      'link.summary',
      sourceSectionId,
      `Summary link requires source to be a summary table. ` +
        `Widget ${sourceSectionId} shows "${sourceInfo.tableId}" which is not a summary table.`
    )
  }

  return {
    linkSrcSectionRef: sourceSectionId,
    linkSrcColRef: 0,
    linkTargetColRef: 0
  }
}

/**
 * Refs link: show records referenced by a RefList column.
 */
async function resolveRefsLink(
  client: GristClient,
  docId: string,
  sourceSectionId: number,
  sourceInfo: WidgetInfo,
  colId: string
): Promise<ResolvedLink> {
  // Resolve column name to colRef
  const colRef = await resolveColumnNameToColRef(client, docId, sourceInfo.tableId, colId)

  // Validate column is a RefList type
  await validateRefListColumn(client, docId, sourceInfo.tableRef, colRef)

  return {
    linkSrcSectionRef: sourceSectionId,
    linkSrcColRef: colRef,
    linkTargetColRef: 0
  }
}

/**
 * Custom link: for custom widgets with allowSelectBy.
 */
function resolveCustomLink(sourceSectionId: number): ResolvedLink {
  // Custom links just need the source section
  // The custom widget handles the actual filtering logic
  return {
    linkSrcSectionRef: sourceSectionId,
    linkSrcColRef: 0,
    linkTargetColRef: 0
  }
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate that a column is a Ref type pointing to the expected table.
 */
async function validateRefColumn(
  client: GristClient,
  docId: string,
  _tableRef: number,
  colRef: number,
  expectedTargetTable: string,
  expectedType: string,
  _actualTableId?: string
): Promise<void> {
  const response = await client.post<{ records: Array<{ fields: Record<string, unknown> }> }>(
    `/docs/${docId}/sql`,
    {
      sql: `
        SELECT type, colId
        FROM _grist_Tables_column
        WHERE id = ?
      `,
      args: [colRef]
    }
  )

  const record = response.records[0]
  if (!record) {
    throw new ValidationError('colRef', colRef, `Column with id ${colRef} not found`)
  }

  const colType = record.fields.type as string
  const colId = record.fields.colId as string

  // Extract target table from Ref type (e.g., "Ref:Companies" → "Companies")
  if (!colType.startsWith('Ref:') && !colType.startsWith('RefList:')) {
    throw new ValidationError(
      'column',
      colId,
      `Column "${colId}" has type "${colType}", expected ${expectedType}. ` +
        `Only Reference columns can be used for this link type.`
    )
  }

  const targetTable = colType.split(':')[1]
  if (targetTable !== expectedTargetTable) {
    throw new ValidationError(
      'column',
      colId,
      `Column "${colId}" references "${targetTable}", not "${expectedTargetTable}". ` +
        `The reference column must point to the target table for this link to work.`
    )
  }
}

/**
 * Validate that a column is a RefList type.
 */
async function validateRefListColumn(
  client: GristClient,
  docId: string,
  _tableRef: number,
  colRef: number
): Promise<void> {
  const response = await client.post<{ records: Array<{ fields: Record<string, unknown> }> }>(
    `/docs/${docId}/sql`,
    {
      sql: `
        SELECT type, colId
        FROM _grist_Tables_column
        WHERE id = ?
      `,
      args: [colRef]
    }
  )

  const record = response.records[0]
  if (!record) {
    throw new ValidationError('colRef', colRef, `Column with id ${colRef} not found`)
  }

  const colType = record.fields.type as string
  const colId = record.fields.colId as string

  if (!colType.startsWith('RefList:')) {
    throw new ValidationError(
      'column',
      colId,
      `Column "${colId}" has type "${colType}", expected RefList. ` +
        `The refs link type requires a Reference List column.`
    )
  }
}

// =============================================================================
// Batch Link Configuration
// =============================================================================

/**
 * Build UserActions to configure all pending links.
 */
export function buildLinkActions(
  resolvedLinks: Array<{ sectionId: number; resolved: ResolvedLink }>
): Array<['UpdateRecord', '_grist_Views_section', number, Record<string, unknown>]> {
  return resolvedLinks.map(({ sectionId, resolved }) => [
    'UpdateRecord',
    '_grist_Views_section',
    sectionId,
    {
      linkSrcSectionRef: resolved.linkSrcSectionRef,
      linkSrcColRef: resolved.linkSrcColRef,
      linkTargetColRef: resolved.linkTargetColRef
    }
  ])
}
