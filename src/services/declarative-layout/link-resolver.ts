/**
 * Link resolver for declarative layouts.
 *
 * Transforms semantic link types (child_of, matched_by, etc.) to
 * Grist's internal format (linkSrcSectionRef, linkSrcColRef, linkTargetColRef).
 */

import { ValidationError } from '../../errors/ValidationError.js'
import type { GristClient } from '../grist-client.js'
import { resolveColumnNameToColRef } from '../widget-resolver.js'
import type { Link, WidgetId } from './schema.js'
import {
  isBreakdownOfLink,
  isChildOfLink,
  isDetailOfLink,
  isListedInLink,
  isMatchedByLink,
  isReferencedByLink,
  isSyncedWithLink
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
  // source_widget is optional in schema (auto-populated from top-level source by caller)
  if (link.source_widget === undefined) {
    throw new ValidationError('link', link, 'source_widget must be set before calling resolveLink')
  }
  const sourceSectionId = resolveWidgetId(link.source_widget, registry)

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
  if (isChildOfLink(link)) {
    return resolveChildOfLink(
      client,
      docId,
      sourceSectionId,
      sourceInfo,
      targetTableId,
      link.target_column
    )
  }

  if (isMatchedByLink(link)) {
    return resolveMatchedByLink(
      client,
      docId,
      sourceSectionId,
      sourceInfo,
      targetTableId,
      link.source_column,
      link.target_column
    )
  }

  if (isDetailOfLink(link)) {
    return resolveDetailOfLink(sourceSectionId, sourceInfo)
  }

  if (isBreakdownOfLink(link)) {
    return resolveBreakdownOfLink(sourceSectionId, sourceInfo)
  }

  if (isListedInLink(link)) {
    return resolveListedInLink(client, docId, sourceSectionId, sourceInfo, link.source_column)
  }

  if (isSyncedWithLink(link)) {
    return resolveSyncedWithLink(sourceSectionId, sourceInfo, targetTableId)
  }

  if (isReferencedByLink(link)) {
    return resolveReferencedByLink(
      client,
      docId,
      sourceSectionId,
      sourceInfo,
      targetTableId,
      link.source_column
    )
  }

  // TypeScript exhaustiveness check - should never reach here with discriminated union
  throw new ValidationError('link', link, `Unknown link type: ${(link as { type: string }).type}`)
}

// =============================================================================
// Widget ID Resolution
// =============================================================================

/**
 * Resolve a widget ID (section ID or local ID) to a section ID.
 */
function resolveWidgetId(widgetId: WidgetId, registry: WidgetRegistry): number {
  return registry.resolve(widgetId)
}

// =============================================================================
// Link Type Resolvers
// =============================================================================

/**
 * child_of: Master-detail filter (Row→Col)
 *
 * This widget shows records where target_column references the selected row in source.
 * Example: Products table filtered by selected Category
 */
async function resolveChildOfLink(
  client: GristClient,
  docId: string,
  sourceSectionId: number,
  sourceInfo: WidgetInfo,
  targetTableId: string,
  targetColumn: string
): Promise<ResolvedLink> {
  // Resolve target column (the Ref column in THIS table)
  const targetColRef = await resolveColumnNameToColRef(client, docId, targetTableId, targetColumn)

  // Validate column is a Ref/RefList pointing to source table
  await validateRefColumn(
    client,
    docId,
    targetColRef,
    sourceInfo.tableId,
    'Ref or RefList',
    `child_of link: target_column "${targetColumn}"`
  )

  return {
    linkSrcSectionRef: sourceSectionId,
    linkSrcColRef: 0, // Row selection from source
    linkTargetColRef: targetColRef
  }
}

/**
 * matched_by: Column matching filter (Col→Col)
 *
 * This widget filters by matching column values between source and target.
 * Both columns typically reference the same third table.
 * Example: Invoices and Payments both filtered by matching Customer
 */
async function resolveMatchedByLink(
  client: GristClient,
  docId: string,
  sourceSectionId: number,
  sourceInfo: WidgetInfo,
  targetTableId: string,
  sourceColumn: string,
  targetColumn: string
): Promise<ResolvedLink> {
  // Resolve both columns
  const sourceColRef = await resolveColumnNameToColRef(
    client,
    docId,
    sourceInfo.tableId,
    sourceColumn
  )
  const targetColRef = await resolveColumnNameToColRef(client, docId, targetTableId, targetColumn)

  return {
    linkSrcSectionRef: sourceSectionId,
    linkSrcColRef: sourceColRef,
    linkTargetColRef: targetColRef
  }
}

/**
 * detail_of: Summary-to-detail filter (Summary-Group)
 *
 * This widget shows detail records belonging to the selected summary group.
 * Source must be a summary table.
 * Example: Sales summary by Category → individual Sales records
 */
function resolveDetailOfLink(sourceSectionId: number, sourceInfo: WidgetInfo): ResolvedLink {
  // Source must be a summary table
  if (!sourceInfo.isSummaryTable) {
    throw new ValidationError(
      'link.detail_of',
      sourceSectionId,
      `detail_of link requires source to be a summary table. ` +
        `Widget ${sourceSectionId} shows "${sourceInfo.tableId}" which is not a summary table.`
    )
  }

  // Grist uses 0 for both colRefs; it infers the group relationship from the summary
  return {
    linkSrcSectionRef: sourceSectionId,
    linkSrcColRef: 0,
    linkTargetColRef: 0
  }
}

/**
 * breakdown_of: Summary drill-down (Summary hierarchy)
 *
 * This widget is a more detailed breakdown of the source summary.
 * Both source and target are summary tables with different groupby columns.
 * Example: Sales by Region → Sales by Region + Product
 */
function resolveBreakdownOfLink(sourceSectionId: number, sourceInfo: WidgetInfo): ResolvedLink {
  // Source must be a summary table
  if (!sourceInfo.isSummaryTable) {
    throw new ValidationError(
      'link.breakdown_of',
      sourceSectionId,
      `breakdown_of link requires source to be a summary table. ` +
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
 * listed_in: RefList display (Show Referenced Records)
 *
 * This widget shows records listed in the source's RefList column.
 * Example: Project's TeamMembers (RefList) → show those Employees
 */
async function resolveListedInLink(
  client: GristClient,
  docId: string,
  sourceSectionId: number,
  sourceInfo: WidgetInfo,
  sourceColumn: string
): Promise<ResolvedLink> {
  // Resolve the RefList column in source table
  const colRef = await resolveColumnNameToColRef(client, docId, sourceInfo.tableId, sourceColumn)

  // Validate column is a RefList type
  await validateRefListColumn(
    client,
    docId,
    colRef,
    `listed_in link: source_column "${sourceColumn}"`
  )

  return {
    linkSrcSectionRef: sourceSectionId,
    linkSrcColRef: colRef,
    linkTargetColRef: 0
  }
}

/**
 * synced_with: Cursor sync (Same-Table)
 *
 * This widget syncs its cursor position with the source widget.
 * Both widgets must show the same table. No filtering occurs.
 * Example: Grid view synced with Card view of the same table
 */
function resolveSyncedWithLink(
  sourceSectionId: number,
  sourceInfo: WidgetInfo,
  targetTableId: string
): ResolvedLink {
  // Sync requires same table
  if (sourceInfo.tableId !== targetTableId) {
    throw new ValidationError(
      'link.synced_with',
      sourceSectionId,
      `synced_with link requires both widgets to show the same table. ` +
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
 * referenced_by: Reference follow (Cursor via Ref)
 *
 * This widget shows the record referenced by the source's Ref column.
 * When you select a row in source, cursor jumps to the referenced record.
 * Example: Select an Order → cursor moves to the Order's Customer record
 */
async function resolveReferencedByLink(
  client: GristClient,
  docId: string,
  sourceSectionId: number,
  sourceInfo: WidgetInfo,
  targetTableId: string,
  sourceColumn: string
): Promise<ResolvedLink> {
  // Resolve the Ref column in source table
  const colRef = await resolveColumnNameToColRef(client, docId, sourceInfo.tableId, sourceColumn)

  // Validate column is a Ref type pointing to target table
  await validateRefColumn(
    client,
    docId,
    colRef,
    targetTableId,
    'Ref',
    `referenced_by link: source_column "${sourceColumn}"`
  )

  return {
    linkSrcSectionRef: sourceSectionId,
    linkSrcColRef: colRef,
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
  colRef: number,
  expectedTargetTable: string,
  expectedType: string,
  context: string
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
      `${context}: Column "${colId}" has type "${colType}", expected ${expectedType}. ` +
        `Only Reference columns can be used for this link type.`
    )
  }

  const targetTable = colType.split(':')[1]
  if (targetTable !== expectedTargetTable) {
    throw new ValidationError(
      'column',
      colId,
      `${context}: Column "${colId}" references "${targetTable}", not "${expectedTargetTable}". ` +
        `The reference column must point to the correct table for this link to work.`
    )
  }
}

/**
 * Validate that a column is a RefList type.
 */
async function validateRefListColumn(
  client: GristClient,
  docId: string,
  colRef: number,
  context: string
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
      `${context}: Column "${colId}" has type "${colType}", expected RefList. ` +
        `This link type requires a Reference List column.`
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
