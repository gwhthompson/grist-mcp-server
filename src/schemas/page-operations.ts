/**
 * Zod schemas for page management operations.
 *
 * Extracted from manage-pages.ts to keep tool files focused on routing/handlers.
 */

import { z } from 'zod'
import {
  LayoutNodeSchema,
  LinkSchema,
  WidgetIdSchema
} from '../services/declarative-layout/index.js'
import { createBatchOutputSchema, GenericOperationResultSchema } from './batch-operation-schemas.js'
import { DocIdSchema, jsonSafe, jsonSafeArray, ResponseFormatSchema } from './common.js'

// =============================================================================
// Shared Schemas
// =============================================================================

/** Page reference: name (string) or viewId (number) */
export const PageRefSchema = z
  .union([z.string().min(1), z.number().int().positive()])
  .meta({ id: 'PageRef' })

// =============================================================================
// Layout Operation Schemas
// =============================================================================

const CreatePageOperationSchema = z
  .object({
    action: z.literal('create_page'),
    name: z.string().min(1).max(100).describe('Page name (not "title")'),
    layout: LayoutNodeSchema.describe(
      'Layout: {table: "TableName"} for single widget, or {cols: [...]} / {rows: [...]} for multi-widget'
    )
  })
  .describe('create page')

const SetLayoutOperationSchema = z
  .object({
    action: z.literal('set_layout'),
    page: PageRefSchema.describe('name or viewId'),
    layout: LayoutNodeSchema,
    remove: jsonSafe(z.array(z.number().int().positive()))
      .optional()
      .describe('sectionIds to remove')
  })
  .describe('update layout')

const GetLayoutOperationSchema = z
  .object({
    action: z.literal('get_layout'),
    page: PageRefSchema.describe('name or viewId')
  })
  .describe('get layout')

// =============================================================================
// Metadata Operation Schemas
// =============================================================================

const RenamePageOperationSchema = z
  .object({
    action: z.literal('rename_page'),
    page: z.string().min(1),
    newName: z.string().min(1).max(100)
  })
  .describe('rename page')

const DeletePageOperationSchema = z
  .object({
    action: z.literal('delete_page'),
    page: z.string().min(1),
    deleteData: z.boolean().default(false).describe('also delete tables')
  })
  .describe('delete page')

const ReorderPagesOperationSchema = z
  .object({
    action: z.literal('reorder_pages'),
    order: jsonSafe(z.array(z.string().min(1)).min(1)).describe('page names in order')
  })
  .describe('reorder pages')

// =============================================================================
// Config Operation Schema
// =============================================================================

const ConfigureWidgetOperationSchema = z
  .object({
    action: z.literal('configure_widget'),
    page: z.string().min(1),
    widget: z.string().min(1).describe('widget title'),
    title: z.string().optional(),
    sortBy: z
      .array(z.union([z.number(), z.string()]))
      .optional()
      .describe('e.g. ["-Date", "Amount"]')
  })
  .describe('configure widget')

// =============================================================================
// Link Operation Schema (Architecture B)
// =============================================================================

/** Link specification for connecting two widgets */
const LinkSpecSchema = z
  .object({
    source: WidgetIdSchema,
    target: WidgetIdSchema,
    link: LinkSchema
  })
  .describe('widget link spec')

/** Architecture B: Configure widget links using sectionIds from create_page response */
const LinkWidgetsOperationSchema = z
  .object({
    action: z.literal('link_widgets'),
    viewId: z.number().int().positive(),
    links: jsonSafeArray(LinkSpecSchema, { min: 1, max: 20 })
  })
  .describe('link widgets')

// =============================================================================
// Discriminated Union and Main Schema
// =============================================================================

const PageOperationSchema = z.discriminatedUnion('action', [
  CreatePageOperationSchema,
  SetLayoutOperationSchema,
  GetLayoutOperationSchema,
  RenamePageOperationSchema,
  DeletePageOperationSchema,
  ReorderPagesOperationSchema,
  ConfigureWidgetOperationSchema,
  LinkWidgetsOperationSchema
])

export const ManagePagesSchema = z.strictObject({
  docId: DocIdSchema,
  operations: jsonSafeArray(PageOperationSchema, { min: 1, max: 20 }),
  response_format: ResponseFormatSchema
})

export type ManagePagesInput = z.infer<typeof ManagePagesSchema>
export type PageOperation = z.infer<typeof PageOperationSchema>

// =============================================================================
// Output Schema
// =============================================================================

export const ManagePagesOutputSchema = createBatchOutputSchema(GenericOperationResultSchema)
