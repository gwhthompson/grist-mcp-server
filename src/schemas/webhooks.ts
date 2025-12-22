import { z } from 'zod'
import { DocIdSchema, parseJsonString, ResponseFormatSchema, TableIdSchema } from './common.js'

export const WebhookIdSchema = z.string().uuid({
  message:
    'Webhook ID must be a valid UUID (e.g., "a1b2c3d4-e5f6-7890-abcd-ef1234567890"). ' +
    'Get webhook IDs from grist_manage_webhooks with action="list".'
})

// ALLOWED_WEBHOOK_DOMAINS provides server-side SSRF protection
export const WebhookUrlSchema = z
  .httpUrl({ message: 'Must be a valid HTTP/HTTPS URL (e.g., "https://example.com/webhook")' })
  .max(2000, { message: 'URL must be 2000 characters or less' })
  .transform((url) => url.trim())
  .refine(
    (url) => {
      const privatePatterns = [
        /^https?:\/\/localhost(:|\/|$)/i,
        /^https?:\/\/127\.0\.0\.1(:|\/|$)/,
        /^https?:\/\/192\.168\./,
        /^https?:\/\/10\./,
        /^https?:\/\/172\.(1[6-9]|2[0-9]|3[01])\./
      ]
      return !privatePatterns.some((pattern) => pattern.test(url))
    },
    { error: 'Private IPs not allowed - use public endpoint or ngrok' }
  )
  .describe('public endpoint URL')

const SQL_RESERVED_KEYWORDS = new Set([
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'CREATE',
  'ALTER',
  'TABLE',
  'WHERE',
  'FROM',
  'JOIN',
  'UNION',
  'ORDER',
  'GROUP',
  'HAVING',
  'INTO',
  'VALUES',
  'SET',
  'AND',
  'OR',
  'NOT',
  'IN',
  'BETWEEN',
  'LIKE',
  'IS',
  'NULL'
])

export const WebhookColumnIdSchema = z
  .string()
  .min(1, { message: 'Column ID cannot be empty if specified' })
  .max(64, { message: 'Column ID must be 64 characters or less' })
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message: 'Column ID must be a valid Python identifier'
  })
  .refine((col) => !SQL_RESERVED_KEYWORDS.has(col.toUpperCase()), {
    error: 'Column ID cannot be an SQL reserved keyword'
  })
  .nullable()
  .optional()
  .describe('only fire when truthy')

export const WebhookEventTypeSchema = z.enum(['add', 'update'], {
  error:
    'Event type must be "add" or "update". ' +
    'Use ["add"] to trigger only on new records, ' +
    '["update"] for changes to existing records, ' +
    'or ["add", "update"] for both.'
})

export const WebhookFieldsSchema = z.strictObject({
  name: z
    .string()
    .min(1, { message: 'Webhook name cannot be empty' })
    .max(255, { message: 'Webhook name must be 255 characters or less' })
    .nullable()
    .optional(),
  memo: z
    .string()
    .max(1000, { message: 'Webhook memo must be 1000 characters or less' })
    .nullable()
    .optional(),
  url: WebhookUrlSchema,
  enabled: z.boolean().optional(),
  eventTypes: z
    .array(WebhookEventTypeSchema)
    .min(1, { message: 'At least one event type required' })
    .refine((types) => new Set(types).size === types.length, {
      error: 'Event types must be unique'
    })
    .describe('["add"], ["update"], or ["add","update"]'),
  isReadyColumn: WebhookColumnIdSchema,
  tableId: TableIdSchema
})

export const ListWebhooksOperationSchema = z
  .strictObject({
    action: z.literal('list'),
    offset: z.number().int().min(0).default(0).optional(),
    limit: z.number().int().min(1).max(1000).default(100).optional()
  })
  .describe('list webhooks')

export const CreateWebhookOperationSchema = z
  .strictObject({
    action: z.literal('create'),
    fields: WebhookFieldsSchema
  })
  .describe('create webhook')

const WebhookUpdateFieldsSchema = z
  .strictObject({
    name: z
      .string()
      .min(1, { message: 'Webhook name cannot be empty' })
      .max(255, { message: 'Webhook name must be 255 characters or less' })
      .nullable()
      .optional(),
    memo: z
      .string()
      .max(1000, { message: 'Webhook memo must be 1000 characters or less' })
      .nullable()
      .optional(),
    url: WebhookUrlSchema.optional(),
    enabled: z.boolean().optional(),
    eventTypes: z
      .array(WebhookEventTypeSchema)
      .min(1, { message: 'At least one event type required' })
      .refine((types) => new Set(types).size === types.length, {
        error: 'Event types must be unique'
      })
      .optional(),
    isReadyColumn: WebhookColumnIdSchema,
    tableId: TableIdSchema.optional()
  })
  .refine((fields) => Object.keys(fields).length > 0, {
    error: 'At least one field must be provided for update'
  })

export const UpdateWebhookOperationSchema = z
  .strictObject({
    action: z.literal('update'),
    webhookId: WebhookIdSchema,
    fields: WebhookUpdateFieldsSchema
  })
  .describe('update webhook')

export const DeleteWebhookOperationSchema = z
  .strictObject({
    action: z.literal('delete'),
    webhookId: WebhookIdSchema
  })
  .describe('delete webhook')

export const ClearQueueOperationSchema = z
  .strictObject({
    action: z.literal('clear_queue')
  })
  .describe('clear pending queue')

/**
 * Discriminated union of all webhook operations
 */
const RawWebhookOperationSchema = z.discriminatedUnion('action', [
  ListWebhooksOperationSchema,
  CreateWebhookOperationSchema,
  UpdateWebhookOperationSchema,
  DeleteWebhookOperationSchema,
  ClearQueueOperationSchema
])

export const WebhookOperationSchema = z.preprocess(parseJsonString, RawWebhookOperationSchema)

/** Operations array: list and clear_queue must be alone */
const WebhookOperationsArraySchema = z
  .array(WebhookOperationSchema)
  .min(1)
  .max(10)
  .refine(
    (ops) => {
      const hasSingleOnly = ops.some((op) => op.action === 'list' || op.action === 'clear_queue')
      if (hasSingleOnly && ops.length > 1) {
        return false
      }
      return true
    },
    { message: 'list and clear_queue must be sole operation' }
  )

export const ManageWebhooksSchema = z.strictObject({
  docId: DocIdSchema,
  operations: WebhookOperationsArraySchema,
  response_format: ResponseFormatSchema
})

export type ManageWebhooksInput = z.infer<typeof ManageWebhooksSchema>
export type WebhookOperation = z.infer<typeof WebhookOperationSchema>
export type WebhookFields = z.infer<typeof WebhookFieldsSchema>
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>
