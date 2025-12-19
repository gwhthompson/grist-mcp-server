/**
 * Domain Page and Widget Schemas
 *
 * Canonical shapes for Grist page/widget entities.
 * These schemas enable omnidirectional verification for page operations:
 *
 *     WRITE (create_page) ──► Grist ──► READ (getPage) ──► VERIFY (deepEqual)
 *
 * Key design decisions:
 * - DomainWidget includes viewId for context (knowing which page it belongs to)
 * - Link fields are stored as numeric refs matching Grist's internal representation
 * - DomainPage optionally includes widgets for full layout verification
 */

import { z } from 'zod'
import { registerSchema } from '../registry.js'

// =============================================================================
// Widget Schema
// =============================================================================

/**
 * Widget type enum - the display type for a view section.
 */
export const WidgetTypeSchema = z
  .enum([
    'record', // Grid view
    'single', // Detail view / card
    'detail', // Same as single
    'chart', // Chart visualization
    'custom', // Custom widget
    'form' // Form view
  ])
  .describe('Widget display type')

/**
 * Domain Widget Schema - the canonical shape for a Grist widget (view section).
 *
 * Represents a widget's metadata and configuration.
 * This shape is used for both reading widgets and verifying writes.
 *
 * @example
 * ```typescript
 * const widget: DomainWidget = {
 *   sectionId: 101,
 *   viewId: 42,
 *   tableId: 'Contacts',
 *   widgetType: 'record',
 *   title: 'Contact List'
 * }
 * ```
 */
export const DomainWidgetSchema = registerSchema(
  z.object({
    sectionId: z.number().int().positive().describe('Widget section ID'),
    viewId: z.number().int().positive().describe('Parent page view ID'),
    tableId: z.string().describe('Table this widget displays'),
    tableRef: z.number().optional().describe('Table reference ID'),
    widgetType: z.string().describe('Widget type (record, chart, etc.)'),
    title: z.string().optional().describe('Widget title'),
    // Link configuration
    linkSrcSectionRef: z.number().optional().describe('Source widget for linking'),
    linkSrcColRef: z.number().optional().describe('Source column for linking'),
    linkTargetColRef: z.number().optional().describe('Target column for linking'),
    // Summary table info
    summarySourceTable: z.number().optional().describe('Source table ref for summary widgets')
  }),
  {
    endpoint: '/docs/{docId}/tables/_grist_Views_section/records',
    userAction: 'CreateViewSection',
    verifyFields: ['tableId', 'widgetType', 'title'],
    displayName: 'Widget'
  }
)

export type DomainWidget = z.infer<typeof DomainWidgetSchema>

// =============================================================================
// Page Schema
// =============================================================================

/**
 * Domain Page Schema - the canonical shape for a Grist page (view).
 *
 * Represents a page's metadata. For full layout, includes widgets.
 *
 * @example
 * ```typescript
 * const page: DomainPage = {
 *   viewId: 42,
 *   docId: 'abc123',
 *   name: 'Company Dashboard',
 *   pagePos: 1,
 *   widgets: [
 *     { sectionId: 101, viewId: 42, tableId: 'Companies', widgetType: 'record' },
 *     { sectionId: 102, viewId: 42, tableId: 'Contacts', widgetType: 'card_list' }
 *   ]
 * }
 * ```
 */
export const DomainPageSchema = registerSchema(
  z.object({
    viewId: z.number().int().positive().describe('Page view ID'),
    docId: z.string().describe('Document containing this page'),
    name: z.string().describe('Page name'),
    pagePos: z.number().nullish().describe('Page position in navigation'),
    pageId: z.number().nullish().describe('Page record ID in _grist_Pages'),
    widgets: z.array(DomainWidgetSchema).optional().describe('Widgets on this page')
  }),
  {
    endpoint: '/docs/{docId}/tables/_grist_Views/records',
    userAction: 'AddView',
    verifyFields: ['name'],
    displayName: 'Page'
  }
)

export type DomainPage = z.infer<typeof DomainPageSchema>

// =============================================================================
// Input Schemas
// =============================================================================

/**
 * Input for creating a page with widgets.
 */
export const CreatePageInputSchema = z.object({
  name: z.string().min(1).max(100),
  layout: z.record(z.string(), z.unknown()).optional().describe('Declarative layout specification')
})

export type CreatePageInput = z.infer<typeof CreatePageInputSchema>

/**
 * Input for configuring a widget.
 */
export const ConfigureWidgetInputSchema = z.object({
  title: z.string().optional(),
  sortColRefs: z.string().optional().describe('Serialized sort specification')
})

export type ConfigureWidgetInput = z.infer<typeof ConfigureWidgetInputSchema>

/**
 * Input for linking widgets.
 */
export const LinkWidgetInputSchema = z.object({
  linkSrcSectionRef: z.number().optional(),
  linkSrcColRef: z.number().optional(),
  linkTargetColRef: z.number().optional()
})

export type LinkWidgetInput = z.infer<typeof LinkWidgetInputSchema>

// =============================================================================
// Result Types (Following VerifiedResult<T> interface from types.ts)
// =============================================================================

import type {
  VerifiedBatchResult,
  VerifiedDeleteResult,
  VerifiedResult
} from '../operations/types.js'

/**
 * Result of creating a page.
 * Extends VerifiedResult<DomainPage> with additional sectionIds.
 */
export interface CreatePageResult extends VerifiedResult<DomainPage> {
  sectionIds: number[]
}

/**
 * Result of renaming a page.
 * Extends VerifiedResult<DomainPage> with oldName for context.
 */
export interface RenamePageResult extends VerifiedResult<DomainPage> {
  oldName: string
}

/**
 * Result of deleting a page.
 * Extends VerifiedDeleteResult with page context.
 */
export interface DeletePageResult extends VerifiedDeleteResult {
  viewId: number
  name: string
}

/**
 * Result of reordering pages.
 * Uses VerifiedBatchResult pattern for multiple pages.
 */
export interface ReorderPagesResult extends VerifiedBatchResult<DomainPage> {
  newOrder: string[]
}

/**
 * Result of configuring a widget.
 * Standard VerifiedResult<DomainWidget>.
 */
export interface ConfigureWidgetResult extends VerifiedResult<DomainWidget> {}

/**
 * Result of linking widgets.
 * Extends VerifiedResult<DomainWidget> with source widget info.
 */
export interface LinkWidgetResult extends VerifiedResult<DomainWidget> {
  sourceWidget?: DomainWidget
}

/**
 * Result of removing a widget.
 * Extends VerifiedDeleteResult with widget context.
 */
export interface RemoveWidgetResult extends VerifiedDeleteResult {
  sectionId: number
}

// =============================================================================
// Layout Operation Types (Domain layer wrapping declarative-layout service)
// =============================================================================

/**
 * Widget info for layout operations.
 * Simplified view of widget metadata for layout display.
 */
export interface LayoutWidgetInfo {
  section: number
  table: string
  widget: string
  title?: string
}

/**
 * Result of getting layout.
 * Read-only operation, no verification needed.
 */
export interface GetLayoutResult {
  entity: DomainPage
  layout: unknown // LayoutNode from declarative-layout
  widgets: LayoutWidgetInfo[]
}

/**
 * Result of setting layout.
 * Extends VerifiedResult<DomainPage> with layout change stats.
 */
export interface SetLayoutResult extends VerifiedResult<DomainPage> {
  widgetsAdded: number
  widgetsRemoved: number
}

/**
 * Input for creating a page with declarative layout.
 */
export interface CreatePageWithLayoutInput {
  name: string
  layout: unknown // LayoutNode from declarative-layout
}
