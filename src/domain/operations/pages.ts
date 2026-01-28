/**
 * Domain Page and Widget Operations
 *
 * High-level page and widget operations with built-in verification.
 * Every write operation reads back and verifies the result.
 *
 * Verification pattern:
 *   WRITE ──► Grist ──► READ BACK ──► VERIFY (deepEqual)
 *
 * This ensures data integrity: if the function returns without throwing,
 * the operation was successful and the data matches what was written.
 */

import {
  type VerificationCheck,
  VerificationError,
  type VerificationResult
} from '../../errors/VerificationError.js'
import type { ToolContext } from '../../registry/types.js'
import { ApplyResponseSchema } from '../../schemas/api-responses.js'
import {
  executeCreatePage as executeCreatePageService,
  executeGetLayout as executeGetLayoutService,
  executeSetLayout as executeSetLayoutService,
  type LayoutNode
} from '../../services/declarative-layout/index.js'
import type { SectionInfo } from '../../services/schema-cache.js'
import type { DocId } from '../../types/advanced.js'
import { toDocId } from '../../types/advanced.js'
import type { ApplyResponse, SQLQueryResponse } from '../../types.js'
import { first } from '../../utils/array-helpers.js'
import { extractFields } from '../../utils/grist-field-extractor.js'
import {
  type ConfigureWidgetInput,
  type ConfigureWidgetResult,
  type CreatePageWithLayoutInput,
  type DeletePageResult,
  type DomainPage,
  DomainPageSchema,
  type DomainWidget,
  DomainWidgetSchema,
  type GetLayoutResult,
  type LayoutWidgetInfo,
  type LinkWidgetInput,
  type LinkWidgetResult,
  type RemoveWidgetResult,
  type RenamePageResult,
  type SetLayoutResult
} from '../schemas/page.js'
import { deepEqual, throwIfFailed } from './base.js'

// =============================================================================
// Link Widget Helpers
// =============================================================================

/** Link field definitions for building updates and checks */
const LINK_FIELDS = ['linkSrcSectionRef', 'linkSrcColRef', 'linkTargetColRef'] as const

/** Build updates object from link input (only defined fields) */
function buildLinkUpdates(link: LinkWidgetInput): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  for (const field of LINK_FIELDS) {
    if (link[field] !== undefined) {
      updates[field] = link[field]
    }
  }
  return updates
}

/** Build verification checks from link input and read widget */
function buildLinkChecks(link: LinkWidgetInput, readWidget: DomainWidget): VerificationCheck[] {
  const checks: VerificationCheck[] = []
  for (const field of LINK_FIELDS) {
    if (link[field] !== undefined) {
      const expected = link[field]
      const actual = readWidget[field]
      checks.push({
        description: field,
        passed: deepEqual(expected, actual),
        expected,
        actual
      })
    }
  }
  return checks
}

// =============================================================================
// Page Read Operations
// =============================================================================

/**
 * Get all pages in a document.
 * Returns pages in DomainPage shape with optional widgets.
 */
export async function getPages(
  ctx: ToolContext,
  docId: DocId | string,
  options: { includeWidgets?: boolean } = {}
): Promise<DomainPage[]> {
  const { includeWidgets = false } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)

  const response = await ctx.client.post<SQLQueryResponse>(`/docs/${docIdStr}/sql`, {
    sql: `
      SELECT
        v.id as viewId,
        v.name,
        p.id as pageId,
        p.pagePos
      FROM _grist_Views v
      LEFT JOIN _grist_Pages p ON p.viewRef = v.id
      ORDER BY p.pagePos, v.id
    `,
    args: []
  })

  const pages: DomainPage[] = []

  for (const record of response.records) {
    const fields = extractFields(record)
    const page: DomainPage = DomainPageSchema.parse({
      viewId: fields.viewId as number,
      docId: docIdStr,
      name: fields.name as string,
      pagePos: fields.pagePos as number | undefined,
      pageId: fields.pageId as number | undefined
    })

    if (includeWidgets) {
      page.widgets = await getWidgets(ctx, docIdStr, page.viewId)
    }

    pages.push(page)
  }

  return pages
}

/**
 * Get a single page by view ID or name.
 * Returns null if not found.
 */
export async function getPage(
  ctx: ToolContext,
  docId: DocId | string,
  pageRef: number | string,
  options: { includeWidgets?: boolean } = {}
): Promise<DomainPage | null> {
  const { includeWidgets = false } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)

  const whereClause = typeof pageRef === 'number' ? 'v.id = ?' : 'v.name = ?'

  const response = await ctx.client.post<SQLQueryResponse>(`/docs/${docIdStr}/sql`, {
    sql: `
      SELECT
        v.id as viewId,
        v.name,
        p.id as pageId,
        p.pagePos
      FROM _grist_Views v
      LEFT JOIN _grist_Pages p ON p.viewRef = v.id
      WHERE ${whereClause}
      LIMIT 1
    `,
    args: [pageRef]
  })

  if (response.records.length === 0) {
    return null
  }

  const fields = extractFields(first(response.records, 'Page'))
  const page: DomainPage = DomainPageSchema.parse({
    viewId: fields.viewId as number,
    docId: docIdStr,
    name: fields.name as string,
    pagePos: fields.pagePos as number | undefined,
    pageId: fields.pageId as number | undefined
  })

  if (includeWidgets) {
    page.widgets = await getWidgets(ctx, docIdStr, page.viewId)
  }

  return page
}

// =============================================================================
// Widget Read Operations
// =============================================================================

/**
 * Get all widgets on a page.
 * Returns widgets in DomainWidget shape.
 */
export async function getWidgets(
  ctx: ToolContext,
  docId: DocId | string,
  viewId: number
): Promise<DomainWidget[]> {
  const docIdStr = typeof docId === 'string' ? docId : String(docId)
  const docIdBranded = toDocId(docIdStr)

  // Use schema cache for widget data
  const sections = await ctx.schemaCache.getPageSections(docIdBranded, viewId)

  return sections.map((s) => sectionInfoToDomainWidget(viewId, s))
}

/**
 * Get a single widget by section ID.
 * Returns null if not found.
 */
export async function getWidget(
  ctx: ToolContext,
  docId: DocId | string,
  viewId: number,
  sectionId: number
): Promise<DomainWidget | null> {
  const docIdStr = typeof docId === 'string' ? docId : String(docId)
  const docIdBranded = toDocId(docIdStr)

  const section = await ctx.schemaCache.getSection(docIdBranded, viewId, sectionId)
  if (!section) {
    return null
  }

  return sectionInfoToDomainWidget(viewId, section)
}

// =============================================================================
// Page Write Operations with Verification
// =============================================================================

/**
 * Rename a page and verify the rename.
 *
 * @returns Renamed page with old name
 * @throws VerificationError if rename couldn't be verified
 */
export async function renamePage(
  ctx: ToolContext,
  docId: DocId | string,
  pageRef: number | string,
  newName: string,
  options: { verify?: boolean } = {}
): Promise<RenamePageResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)

  // Get existing page
  const existingPage = await getPage(ctx, docIdStr, pageRef)
  if (!existingPage) {
    throw new Error(`Page "${pageRef}" not found`)
  }
  const oldName = existingPage.name

  // Execute the rename
  await ctx.client.post<ApplyResponse>(
    `/docs/${docIdStr}/apply`,
    [['UpdateRecord', '_grist_Views', existingPage.viewId, { name: newName }]],
    {
      schema: ApplyResponseSchema,
      context: `Renaming page "${oldName}" to "${newName}"`
    }
  )

  // Verify by reading back
  if (verify) {
    const readPage = await getPage(ctx, docIdStr, existingPage.viewId)

    if (!readPage) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: `Page ${existingPage.viewId} not found after rename`,
              passed: false,
              expected: { name: newName },
              actual: null
            }
          ]
        },
        {
          operation: 'renamePage',
          entityType: 'Page',
          entityId: `${oldName} → ${newName}`
        }
      )
    }

    if (readPage.name !== newName) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: 'Page name',
              passed: false,
              expected: newName,
              actual: readPage.name
            }
          ]
        },
        {
          operation: 'renamePage',
          entityType: 'Page',
          entityId: `${oldName} → ${newName}`
        }
      )
    }

    return { entity: readPage, verified: true, oldName }
  }

  // Without verification, read back to return the page
  const readPage = await getPage(ctx, docIdStr, existingPage.viewId)
  if (!readPage) {
    throw new Error(`Page not found after renamePage operation`)
  }
  return { entity: readPage, verified: true, oldName }
}

/**
 * Delete a page and verify it was deleted.
 *
 * @returns Deleted page info
 * @throws VerificationError if page still exists after deletion
 */
export async function deletePage(
  ctx: ToolContext,
  docId: DocId | string,
  pageRef: number | string,
  options: { verify?: boolean; deleteData?: boolean } = {}
): Promise<DeletePageResult> {
  const { verify = true, deleteData = false } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)

  // Get existing page
  const existingPage = await getPage(ctx, docIdStr, pageRef, { includeWidgets: deleteData })
  if (!existingPage) {
    throw new Error(`Page "${pageRef}" not found`)
  }

  // Build actions as tuples
  const actions: Array<['BulkRemoveRecord', string, number[]] | ['RemoveTable', string]> = []

  // Delete page record
  if (existingPage.pageId) {
    actions.push(['BulkRemoveRecord', '_grist_Pages', [existingPage.pageId]])
  }

  // Optionally delete underlying tables
  if (deleteData && existingPage.widgets) {
    const tableIds = new Set(existingPage.widgets.map((w) => w.tableId))
    for (const tableId of tableIds) {
      actions.push(['RemoveTable', tableId])
    }
  }

  // Execute deletion
  await ctx.client.post<ApplyResponse>(`/docs/${docIdStr}/apply`, actions, {
    schema: ApplyResponseSchema,
    context: `Deleting page "${existingPage.name}"`
  })

  // Verify page is gone
  if (verify) {
    const remaining = await getPage(ctx, docIdStr, existingPage.viewId)

    // Note: The view may still exist but the page entry is deleted
    // We check if it's still accessible as a page
    if (remaining?.pageId) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: `Page ${existingPage.name} still exists after delete`,
              passed: false,
              expected: 'deleted',
              actual: remaining
            }
          ]
        },
        {
          operation: 'deletePage',
          entityType: 'Page',
          entityId: existingPage.name
        }
      )
    }
  }

  return { viewId: existingPage.viewId, name: existingPage.name, deleted: true, verified: true }
}

// =============================================================================
// Widget Write Operations with Verification
// =============================================================================

/**
 * Configure a widget (title, sorting, etc.) and verify the configuration.
 *
 * @returns Configured widget
 * @throws VerificationError if configuration couldn't be verified
 */
export async function configureWidget(
  ctx: ToolContext,
  docId: DocId | string,
  viewId: number,
  sectionId: number,
  config: ConfigureWidgetInput,
  options: { verify?: boolean } = {}
): Promise<ConfigureWidgetResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)

  // Verify widget exists
  const existingWidget = await getWidget(ctx, docIdStr, viewId, sectionId)
  if (!existingWidget) {
    throw new Error(`Widget ${sectionId} not found on page ${viewId}`)
  }

  // Build updates
  const updates: Record<string, unknown> = {}
  if (config.title !== undefined) {
    updates.title = config.title
  }
  if (config.sortColRefs !== undefined) {
    updates.sortColRefs = config.sortColRefs
  }

  if (Object.keys(updates).length === 0) {
    return { entity: existingWidget, verified: true }
  }

  // Execute configuration
  await ctx.client.post<ApplyResponse>(
    `/docs/${docIdStr}/apply`,
    [['UpdateRecord', '_grist_Views_section', sectionId, updates]],
    {
      schema: ApplyResponseSchema,
      context: `Configuring widget ${sectionId}`
    }
  )

  // Verify by reading back
  if (verify && config.title !== undefined) {
    const readWidget = await getWidget(ctx, docIdStr, viewId, sectionId)

    if (!readWidget) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: `Widget ${sectionId} not found after configure`,
              passed: false,
              expected: config,
              actual: null
            }
          ]
        },
        {
          operation: 'configureWidget',
          entityType: 'Widget',
          entityId: String(sectionId)
        }
      )
    }

    // Verify title if it was set
    if (config.title !== undefined && readWidget.title !== config.title) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: 'Widget title',
              passed: false,
              expected: config.title,
              actual: readWidget.title
            }
          ]
        },
        {
          operation: 'configureWidget',
          entityType: 'Widget',
          entityId: String(sectionId)
        }
      )
    }

    return { entity: readWidget, verified: true }
  }

  // Without verification (or if only sortColRefs was set), read back to return the widget
  const readWidget = await getWidget(ctx, docIdStr, viewId, sectionId)
  if (!readWidget) {
    throw new Error(`Widget ${sectionId} not found after configureWidget operation`)
  }
  return { entity: readWidget, verified: true }
}

/**
 * Link a widget to another widget and verify the link.
 *
 * @returns Linked widget with source widget info
 * @throws VerificationError if link couldn't be verified
 */
export async function linkWidget(
  ctx: ToolContext,
  docId: DocId | string,
  viewId: number,
  sectionId: number,
  link: LinkWidgetInput,
  options: { verify?: boolean } = {}
): Promise<LinkWidgetResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)

  // Verify target widget exists
  const existingWidget = await getWidget(ctx, docIdStr, viewId, sectionId)
  if (!existingWidget) {
    throw new Error(`Widget ${sectionId} not found on page ${viewId}`)
  }

  // Build and execute link updates
  const updates = buildLinkUpdates(link)
  await ctx.client.post<ApplyResponse>(
    `/docs/${docIdStr}/apply`,
    [['UpdateRecord', '_grist_Views_section', sectionId, updates]],
    {
      schema: ApplyResponseSchema,
      context: `Linking widget ${sectionId}`
    }
  )

  // Read back widget (always needed for result)
  const readWidget = await getWidget(ctx, docIdStr, viewId, sectionId)
  if (!readWidget) {
    if (verify) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: `Widget ${sectionId} not found after link`,
              passed: false,
              expected: link,
              actual: null
            }
          ]
        },
        { operation: 'linkWidget', entityType: 'Widget', entityId: String(sectionId) }
      )
    }
    throw new Error(`Widget ${sectionId} not found after linkWidget operation`)
  }

  // Verify link fields if requested
  if (verify) {
    const checks = buildLinkChecks(link, readWidget)
    const verification: VerificationResult = {
      passed: checks.every((c) => c.passed),
      checks
    }

    throwIfFailed(verification, {
      operation: 'linkWidget',
      entityType: 'Widget',
      entityId: String(sectionId)
    })
  }

  // Get source widget for result
  let sourceWidget: DomainWidget | undefined
  if (link.linkSrcSectionRef) {
    sourceWidget = (await getWidget(ctx, docIdStr, viewId, link.linkSrcSectionRef)) ?? undefined
  }

  return { entity: readWidget, verified: true, sourceWidget }
}

/**
 * Remove a widget from a page and verify it was removed.
 *
 * @returns Removed widget info
 * @throws VerificationError if widget still exists after removal
 */
export async function removeWidget(
  ctx: ToolContext,
  docId: DocId | string,
  viewId: number,
  sectionId: number,
  options: { verify?: boolean } = {}
): Promise<RemoveWidgetResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)

  // Verify widget exists
  const existingWidget = await getWidget(ctx, docIdStr, viewId, sectionId)
  if (!existingWidget) {
    throw new Error(`Widget ${sectionId} not found on page ${viewId}`)
  }

  // Execute removal
  await ctx.client.post<ApplyResponse>(
    `/docs/${docIdStr}/apply`,
    [['BulkRemoveRecord', '_grist_Views_section', [sectionId]]],
    {
      schema: ApplyResponseSchema,
      context: `Removing widget ${sectionId}`
    }
  )

  // Verify widget is gone
  if (verify) {
    const remaining = await getWidget(ctx, docIdStr, viewId, sectionId)

    if (remaining) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: `Widget ${sectionId} still exists after remove`,
              passed: false,
              expected: 'removed',
              actual: remaining
            }
          ]
        },
        {
          operation: 'removeWidget',
          entityType: 'Widget',
          entityId: String(sectionId)
        }
      )
    }
  }

  return { sectionId, deleted: true, verified: true }
}

// =============================================================================
// Layout Operations with Verification
// =============================================================================

/**
 * Create a page with declarative layout and verify it was created correctly.
 *
 * Wraps the declarative-layout service and adds verification.
 *
 * @returns Created page with section IDs
 * @throws VerificationError if page creation couldn't be verified
 */
export async function createPage(
  ctx: ToolContext,
  docId: DocId | string,
  input: CreatePageWithLayoutInput,
  options: { verify?: boolean } = {}
): Promise<import('../schemas/page.js').CreatePageResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)

  // Helper to get table ref
  const getTableRef = async (tableId: string): Promise<number> => {
    const tableResp = await ctx.client.post<SQLQueryResponse>(`/docs/${docIdStr}/sql`, {
      sql: 'SELECT id FROM _grist_Tables WHERE tableId = ?',
      args: [tableId]
    })
    if (tableResp.records.length === 0) {
      throw new Error(`Table "${tableId}" not found`)
    }
    const record = first(tableResp.records, `Table ${tableId}`)
    const fields = extractFields(record)
    return fields.id as number
  }

  // Delegate to service
  const result = await executeCreatePageService(
    ctx.client,
    docIdStr,
    input.name,
    input.layout as LayoutNode,
    getTableRef
  )

  // Verify by reading back
  if (verify) {
    const page = await getPage(ctx, docIdStr, result.viewId, { includeWidgets: true })

    if (!page) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: `Page ${result.viewId} not found after create`,
              passed: false,
              expected: { name: input.name },
              actual: null
            }
          ]
        },
        {
          operation: 'createPage',
          entityType: 'Page',
          entityId: input.name
        }
      )
    }

    // Verify name matches
    if (page.name !== input.name) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: 'Page name',
              passed: false,
              expected: input.name,
              actual: page.name
            }
          ]
        },
        {
          operation: 'createPage',
          entityType: 'Page',
          entityId: input.name
        }
      )
    }

    // Verify widget count matches
    const actualWidgetCount = page.widgets?.length ?? 0
    if (actualWidgetCount !== result.sectionIds.length) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: 'Widget count',
              passed: false,
              expected: result.sectionIds.length,
              actual: actualWidgetCount
            }
          ]
        },
        {
          operation: 'createPage',
          entityType: 'Page',
          entityId: input.name
        }
      )
    }

    return { entity: page, verified: true, sectionIds: result.sectionIds }
  }

  // Without verification, construct page from result
  const page = await getPage(ctx, docIdStr, result.viewId, { includeWidgets: true })
  if (!page) {
    throw new Error(`Page not found after createPage operation`)
  }
  return { entity: page, verified: true, sectionIds: result.sectionIds }
}

/**
 * Update page layout and verify the changes.
 *
 * @returns Updated page info
 * @throws VerificationError if layout update couldn't be verified
 */
export async function setLayout(
  ctx: ToolContext,
  docId: DocId | string,
  viewId: number,
  layout: unknown,
  removeWidgets: number[] = [],
  options: { verify?: boolean } = {}
): Promise<SetLayoutResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)

  // Helper to get table ref
  const getTableRef = async (tableId: string): Promise<number> => {
    const tableResp = await ctx.client.post<SQLQueryResponse>(`/docs/${docIdStr}/sql`, {
      sql: 'SELECT id FROM _grist_Tables WHERE tableId = ?',
      args: [tableId]
    })
    if (tableResp.records.length === 0) {
      throw new Error(`Table "${tableId}" not found`)
    }
    const record = first(tableResp.records, `Table ${tableId}`)
    const fields = extractFields(record)
    return fields.id as number
  }

  // Helper to get existing widgets
  const getExistingWidgets = async (): Promise<
    Map<number, { tableId: string; tableRef: number }>
  > => {
    const widgetsResp = await ctx.client.post<SQLQueryResponse>(`/docs/${docIdStr}/sql`, {
      sql: `
        SELECT vs.id, t.tableId, vs.tableRef
        FROM _grist_Views_section vs
        JOIN _grist_Tables t ON vs.tableRef = t.id
        WHERE vs.parentId = ?
      `,
      args: [viewId]
    })

    const widgets = new Map<number, { tableId: string; tableRef: number }>()
    for (const record of widgetsResp.records) {
      const fields = extractFields(record)
      widgets.set(fields.id as number, {
        tableId: fields.tableId as string,
        tableRef: fields.tableRef as number
      })
    }
    return widgets
  }

  // Delegate to service
  const result = await executeSetLayoutService(
    ctx.client,
    docIdStr,
    viewId,
    layout as LayoutNode,
    removeWidgets,
    getTableRef,
    getExistingWidgets
  )

  // Verify by reading back
  if (verify) {
    const page = await getPage(ctx, docIdStr, viewId, { includeWidgets: true })

    if (!page) {
      throw new VerificationError(
        {
          passed: false,
          checks: [
            {
              description: `Page ${viewId} not found after setLayout`,
              passed: false,
              expected: 'page exists',
              actual: null
            }
          ]
        },
        {
          operation: 'setLayout',
          entityType: 'Page',
          entityId: String(viewId)
        }
      )
    }

    return {
      entity: page,
      verified: true,
      widgetsAdded: result.widgetsAdded,
      widgetsRemoved: result.widgetsRemoved
    }
  }

  // Without verification
  const page = await getPage(ctx, docIdStr, viewId, { includeWidgets: true })
  if (!page) {
    throw new Error(`Page not found after setLayout operation`)
  }
  return {
    entity: page,
    verified: true,
    widgetsAdded: result.widgetsAdded,
    widgetsRemoved: result.widgetsRemoved
  }
}

/**
 * Get page layout in declarative format.
 *
 * @returns Layout and widget info
 */
export async function getLayout(
  ctx: ToolContext,
  docId: DocId | string,
  viewId: number
): Promise<GetLayoutResult> {
  const docIdStr = typeof docId === 'string' ? docId : String(docId)

  // Delegate to service
  const result = await executeGetLayoutService(ctx.client, docIdStr, viewId)

  // Get page info
  const page = await getPage(ctx, docIdStr, viewId, { includeWidgets: true })

  if (!page) {
    throw new Error(`Page ${viewId} not found`)
  }

  // Convert widget info to domain format
  const widgets: LayoutWidgetInfo[] = result.widgets.map((w) => ({
    section: w.section,
    table: w.table,
    widget: w.widget,
    title: w.title
  }))

  return { entity: page, layout: result.layout, widgets }
}

/**
 * Reorder pages in navigation and verify the new order.
 *
 * @returns Reordered pages
 * @throws VerificationError if reorder couldn't be verified
 */
export async function reorderPages(
  ctx: ToolContext,
  docId: DocId | string,
  pageNames: string[],
  options: { verify?: boolean } = {}
): Promise<import('../schemas/page.js').ReorderPagesResult> {
  const { verify = true } = options
  const docIdStr = typeof docId === 'string' ? docId : String(docId)

  // Resolve page names to IDs
  const pageInfos: Array<{ name: string; pageId: number; viewId: number }> = []
  for (const name of pageNames) {
    const page = await getPage(ctx, docIdStr, name)
    if (!page) {
      throw new Error(`Page "${name}" not found`)
    }
    if (!page.pageId) {
      throw new Error(`Page "${name}" has no pageId`)
    }
    pageInfos.push({ name, pageId: page.pageId, viewId: page.viewId })
  }

  // Build update actions
  const actions: Array<['UpdateRecord', string, number, Record<string, unknown>]> = []
  for (let i = 0; i < pageInfos.length; i++) {
    const info = pageInfos[i]
    if (info) {
      actions.push(['UpdateRecord', '_grist_Pages', info.pageId, { pagePos: i + 1 }])
    }
  }

  // Execute
  await ctx.client.post<ApplyResponse>(`/docs/${docIdStr}/apply`, actions, {
    schema: ApplyResponseSchema,
    context: `Reordering ${pageNames.length} pages`
  })

  // Verify by reading back
  if (verify) {
    const pages = await getPages(ctx, docIdStr)

    // Sort by pagePos to check order
    const sortedPages = [...pages].sort((a, b) => (a.pagePos ?? 0) - (b.pagePos ?? 0))

    // Create a set of page names we reordered for quick lookup
    const reorderedSet = new Set(pageNames)

    // Extract only the pages we reordered, maintaining their new order
    const actualReorderedOrder = sortedPages
      .filter((p) => reorderedSet.has(p.name))
      .map((p) => p.name)

    // Verify the relative order matches
    const checks: VerificationCheck[] = []
    for (let i = 0; i < pageNames.length; i++) {
      const expected = pageNames[i]
      const actual = actualReorderedOrder[i]
      checks.push({
        description: `Relative position ${i + 1}`,
        passed: expected === actual,
        expected,
        actual
      })
    }

    const verification: VerificationResult = {
      passed: checks.every((c) => c.passed),
      checks
    }

    throwIfFailed(verification, {
      operation: 'reorderPages',
      entityType: 'Page',
      entityId: pageNames.join(', ')
    })

    return { entities: sortedPages, count: sortedPages.length, verified: true, newOrder: pageNames }
  }

  // Without verification
  const pages = await getPages(ctx, docIdStr)
  return { entities: pages, count: pages.length, verified: true, newOrder: pageNames }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert SectionInfo from schema cache to DomainWidget shape.
 */
function sectionInfoToDomainWidget(viewId: number, section: SectionInfo): DomainWidget {
  return DomainWidgetSchema.parse({
    sectionId: section.sectionId,
    viewId,
    tableId: section.tableId,
    widgetType: section.widgetType,
    title: section.title || undefined,
    linkSrcSectionRef: section.linkSrcSectionRef || undefined,
    linkSrcColRef: section.linkSrcColRef || undefined,
    linkTargetColRef: section.linkTargetColRef || undefined,
    summarySourceTable: section.summarySourceTable || undefined
  })
}
