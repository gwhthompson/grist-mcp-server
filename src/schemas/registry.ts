/**
 * Centralized Schema Registry
 *
 * All schema registrations in one place for maintainability.
 * RULE: Only register schemas that are REUSED 2+ times within a single tool's inputSchema.
 * Single-use schemas are automatically inlined by Zod.
 */

import { z } from 'zod'
import {
  ExistingPaneSchema,
  LayoutNodeSchema,
  LinkSchema,
  LinkTargetSchema,
  NewPaneSchema
} from '../services/declarative-layout/schema.js'
import { PageRefSchema } from '../tools/manage-pages.js'
import { RecordDataSchema } from '../tools/manage-records.js'
import {
  ChoiceOptionsSchema,
  ColumnDefinitionSchema,
  ColumnStyleSchema,
  ColumnTypeLiteralSchema,
  VisibleColSchema
} from './column-types.js'
import { ColIdSchema, HexColorSchema, TableIdSchema } from './common.js'
import { BaseConditionalRuleSchema } from './conditional-rules.js'
import { UserWidgetTypeSchema } from './pages-widgets.js'
import {
  WebhookColumnIdSchema,
  WebhookEventTypeSchema,
  WebhookIdSchema,
  WebhookUrlSchema
} from './webhooks.js'

/**
 * Register schemas with z.globalRegistry for named JSON Schema $refs.
 * Must be called once at startup before any schema generation.
 */
export function registerSchemas(): void {
  // grist_manage_schema - reused across multiple operations
  TableIdSchema.register(z.globalRegistry, { id: 'tableId' }) // 6x
  ColIdSchema.register(z.globalRegistry, { id: 'colId' }) // 3x
  ColumnDefinitionSchema.register(z.globalRegistry, { id: 'ColumnDefinition' }) // 2x
  ColumnTypeLiteralSchema.register(z.globalRegistry, { id: 'columnType' }) // 3x
  ColumnStyleSchema.register(z.globalRegistry, { id: 'columnStyle' }) // 2x in ModifyColumn
  ChoiceOptionsSchema.register(z.globalRegistry, { id: 'choiceOptions' }) // 2x in ModifyColumn
  HexColorSchema.register(z.globalRegistry, { id: 'hexColor' }) // 12x in styles
  VisibleColSchema.register(z.globalRegistry, { id: 'visibleCol' }) // 2x
  BaseConditionalRuleSchema.register(z.globalRegistry, { id: 'conditionalRule' }) // 2x in update_table + rulesOptions

  // grist_manage_records - reused in add/update/upsert operations
  RecordDataSchema.register(z.globalRegistry, { id: 'recordData' }) // 4x

  // grist_manage_webhooks - reused in create/update operations
  WebhookIdSchema.register(z.globalRegistry, { id: 'webhookId' }) // 2x
  WebhookUrlSchema.register(z.globalRegistry, { id: 'webhookUrl' }) // 2x
  WebhookEventTypeSchema.register(z.globalRegistry, { id: 'webhookEventType' }) // 2x
  WebhookColumnIdSchema.register(z.globalRegistry, { id: 'webhookColumnId' }) // 2x

  // grist_manage_pages - reused in create/modify operations
  UserWidgetTypeSchema.register(z.globalRegistry, { id: 'pageWidgetType' }) // 2x

  // grist_manage_pages - declarative layout schemas
  LinkTargetSchema.register(z.globalRegistry, { id: 'linkTarget' }) // 9x
  LinkSchema.register(z.globalRegistry, { id: 'widgetLink' }) // 2x
  ExistingPaneSchema.register(z.globalRegistry, { id: 'existingPane' }) // 2x
  NewPaneSchema.register(z.globalRegistry, { id: 'newPane' }) // 2x
  PageRefSchema.register(z.globalRegistry, { id: 'pageRef' }) // 2x
  LayoutNodeSchema.register(z.globalRegistry, { id: 'layoutNode' }) // 2x (recursive)
}
