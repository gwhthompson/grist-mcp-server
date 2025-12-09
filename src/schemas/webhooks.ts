import { z } from 'zod'
import { DocIdSchema, ResponseFormatSchema, TableIdSchema } from './common.js'

export const WebhookIdSchema = z
  .string()
  .uuid({
    message:
      'Webhook ID must be a valid UUID (e.g., "a1b2c3d4-e5f6-7890-abcd-ef1234567890"). ' +
      'Get webhook IDs from grist_manage_webhooks with action="list".'
  })
  .describe('UUID of the webhook')

// ALLOWED_WEBHOOK_DOMAINS provides server-side SSRF protection
const WebhookUrlSchema = z
  .string()
  .url({ message: 'Must be a valid URL (e.g., "https://example.com/webhook")' })
  .max(2000, {
    message: 'URL must be 2000 characters or less (standard HTTP URL limit)'
  })
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
    {
      error:
        'URL appears to be localhost or a private IP address. ' +
        'Webhooks require publicly accessible endpoints. ' +
        'Use a service like ngrok for local development testing. ' +
        'Note: The Grist server administrator controls allowed domains via ALLOWED_WEBHOOK_DOMAINS.'
    }
  )
  .describe(
    'URL endpoint that will receive webhook POST requests with event data. ' +
      "Must be publicly accessible and in the server's ALLOWED_WEBHOOK_DOMAINS list. " +
      '(HTTPS recommended for security).'
  )

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

const WebhookColumnIdSchema = z
  .string()
  .min(1, { message: 'Column ID cannot be empty if specified' })
  .max(64, { message: 'Column ID must be 64 characters or less' })
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message:
      'Column ID must be a valid Python identifier (start with letter/underscore, ' +
      'contain only alphanumeric and underscores). Example: "IsReady", "Status", "Approved"'
  })
  .refine((col) => !SQL_RESERVED_KEYWORDS.has(col.toUpperCase()), {
    error: 'Column ID cannot be an SQL reserved keyword for security reasons'
  })
  .nullable()
  .optional()
  .describe(
    'Optional column ID. Webhook only fires when this column has a truthy value. ' +
      'Column must exist in the target table. Use for conditional webhooks ' +
      '(e.g., only send webhook when Status="Approved").'
  )

export const WebhookEventTypeSchema = z.enum(['add', 'update'], {
  error:
    'Event type must be "add" or "update". ' +
    'Use ["add"] to trigger only on new records, ' +
    '["update"] for changes to existing records, ' +
    'or ["add", "update"] for both.'
})

export const WebhookFieldsSchema = z
  .object({
    name: z
      .string()
      .min(1, { message: 'Webhook name cannot be empty' })
      .max(255, { message: 'Webhook name must be 255 characters or less' })
      .nullable()
      .optional()
      .describe('Human-readable name for the webhook (1-255 characters)'),

    memo: z
      .string()
      .max(1000, { message: 'Webhook memo must be 1000 characters or less' })
      .nullable()
      .optional()
      .describe('Description or notes about the webhook (max 1000 characters)'),

    url: WebhookUrlSchema,

    enabled: z
      .boolean()
      .optional()
      .describe('Whether the webhook is active. Default: true if omitted'),

    eventTypes: z
      .array(WebhookEventTypeSchema)
      .min(1, {
        message: 'At least one event type required. Use ["add"], ["update"], or ["add", "update"].'
      })
      .refine((types) => new Set(types).size === types.length, {
        error: 'Event types must be unique. Remove duplicate entries.'
      })
      .describe('Array of event types that trigger this webhook: "add", "update"'),

    isReadyColumn: WebhookColumnIdSchema,

    tableId: TableIdSchema
  })
  .strict()

export const ListWebhooksOperationSchema = z
  .object({
    action: z.literal('list'),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .optional()
      .describe('Starting position for pagination (default: 0)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .optional()
      .describe('Maximum webhooks to return (default: 100, max: 1000)')
  })
  .strict()
  .describe('List all webhooks for a document with usage statistics')

export const CreateWebhookOperationSchema = z
  .object({
    action: z.literal('create'),
    fields: WebhookFieldsSchema
  })
  .strict()
  .describe('Create a new webhook subscription for table changes')

const WebhookUpdateFieldsSchema = z
  .object({
    name: z
      .string()
      .min(1, { message: 'Webhook name cannot be empty' })
      .max(255, { message: 'Webhook name must be 255 characters or less' })
      .nullable()
      .optional()
      .describe('Human-readable name for the webhook (1-255 characters)'),

    memo: z
      .string()
      .max(1000, { message: 'Webhook memo must be 1000 characters or less' })
      .nullable()
      .optional()
      .describe('Description or notes about the webhook (max 1000 characters)'),

    url: WebhookUrlSchema.optional(),

    enabled: z.boolean().optional().describe('Whether the webhook is active.'),

    eventTypes: z
      .array(WebhookEventTypeSchema)
      .min(1, {
        message: 'At least one event type required. Use ["add"], ["update"], or ["add", "update"].'
      })
      .refine((types) => new Set(types).size === types.length, {
        error: 'Event types must be unique. Remove duplicate entries.'
      })
      .optional()
      .describe('Array of event types that trigger this webhook: "add", "update"'),

    isReadyColumn: WebhookColumnIdSchema,

    tableId: TableIdSchema.optional()
  })
  .strict()
  .refine((fields) => Object.keys(fields).length > 0, {
    error:
      'At least one field must be provided for update. ' +
      'Available fields: url, enabled, eventTypes, name, memo, isReadyColumn, tableId.'
  })

export const UpdateWebhookOperationSchema = z
  .object({
    action: z.literal('update'),
    webhookId: WebhookIdSchema,
    fields: WebhookUpdateFieldsSchema.describe(
      'Fields to update. Only provided fields will be modified'
    )
  })
  .strict()
  .describe('Update an existing webhook configuration')

export const DeleteWebhookOperationSchema = z
  .object({
    action: z.literal('delete'),
    webhookId: WebhookIdSchema
  })
  .strict()
  .describe('Delete a webhook subscription permanently')

export const ClearQueueOperationSchema = z
  .object({
    action: z.literal('clear_queue')
  })
  .strict()
  .describe(
    'Clear all pending webhook payloads in the queue. ' +
      'WARNING: This is destructive and cannot be undone. ' +
      'Use when webhook queue has backed up due to endpoint failures.'
  )

export const WebhookOperationSchema = z.discriminatedUnion('action', [
  ListWebhooksOperationSchema,
  CreateWebhookOperationSchema,
  UpdateWebhookOperationSchema,
  DeleteWebhookOperationSchema,
  ClearQueueOperationSchema
])

export const ManageWebhooksSchema = z
  .object({
    docId: DocIdSchema,
    operation: WebhookOperationSchema.describe(
      'Webhook operation to perform: list, create, update, delete, or clear_queue'
    ),
    response_format: ResponseFormatSchema
  })
  .strict()

export type ManageWebhooksInput = z.infer<typeof ManageWebhooksSchema>
export type WebhookOperation = z.infer<typeof WebhookOperationSchema>
export type WebhookFields = z.infer<typeof WebhookFieldsSchema>
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>
