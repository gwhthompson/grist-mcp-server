import { type ToolContext, type ToolDefinition, WRITE_SAFE_ANNOTATIONS } from '../registry/types.js'
import {
  type ManageWebhooksInput,
  ManageWebhooksSchema,
  type WebhookOperation
} from '../schemas/webhooks.js'
import { formatErrorResponse } from '../services/formatter.js'
import type { WebhookId } from '../types/advanced.js'
import type { MCPToolResponse } from '../types.js'

// Re-export schema and types for backward compatibility
export { ManageWebhooksSchema, type ManageWebhooksInput, type WebhookOperation }

interface WebhookUsage {
  numWaiting: number
  status: string
  updatedTime?: number | null
  lastSuccessTime?: number | null
  lastFailureTime?: number | null
  lastErrorMessage?: string | null
  lastHttpStatus?: number | null
  lastEventBatch?: {
    size: number
    attempts: number
    errorMessage?: string | null
    httpStatus?: number
    status: string
  } | null
}

interface Webhook {
  id: WebhookId // Use branded type for type safety
  fields: {
    name: string | null
    memo: string | null
    url: string
    enabled: boolean
    unsubscribeKey: string
    eventTypes: string[]
    isReadyColumn: string | null
    tableId: string
  }
  usage?: WebhookUsage | null
}

interface ListWebhooksResponse {
  webhooks: Webhook[]
}

interface CreateWebhooksResponse {
  webhooks: Array<{ id: WebhookId }>
}

interface DeleteWebhookResponse {
  success: boolean
}

type OperationResult =
  | ListWebhooksResult
  | CreateWebhookResult
  | UpdateWebhookResult
  | DeleteWebhookResult
  | ClearQueueResult

interface ListWebhooksResult {
  operation: 'list'
  document_id: string
  webhook_count: number
  total: number
  offset: number
  limit: number
  has_more: boolean
  next_offset: number | null
  page_number: number
  total_pages: number
  items_in_page: number
  webhooks: Array<{
    id: string
    name: string | null
    url: string
    enabled: boolean
    table_id: string
    event_types: string[]
    is_ready_column: string | null
    memo: string | null
    usage: WebhookUsageOutput | null
  }>
}

interface CreateWebhookResult {
  operation: 'create'
  success: true
  document_id: string
  webhook_id: string
  webhook_url: string
  table_id: string
  event_types: string[]
}

interface UpdateWebhookResult {
  operation: 'update'
  success: true
  document_id: string
  webhook_id: string
  fields_updated: string[]
}

interface DeleteWebhookResult {
  operation: 'delete'
  success: true
  document_id: string
  webhook_id: string
}

interface ClearQueueResult {
  operation: 'clear_queue'
  success: true
  document_id: string
  action: 'cleared_webhook_queue'
}

interface WebhookUsageOutput {
  num_waiting: number
  status: string
  updated_time?: number | null
  last_success_time?: number | null
  last_failure_time?: number | null
  last_error_message?: string | null
  last_http_status?: number | null
}

export async function manageWebhooks(
  context: ToolContext,
  params: unknown
): Promise<MCPToolResponse> {
  const { client } = context
  // Validate and parse input parameters (let validation errors throw)
  const validatedParams = ManageWebhooksSchema.parse(params)
  const { docId, operation, response_format = 'markdown' } = validatedParams

  try {
    let result: OperationResult | undefined
    let summary = ''

    switch (operation.action) {
      case 'list': {
        const response = await client.get<ListWebhooksResponse>(`/docs/${docId}/webhooks`)
        const allWebhooks = response.webhooks || []

        const offset = operation.offset ?? 0
        const limit = operation.limit ?? 100
        const total = allWebhooks.length
        const paginatedWebhooks = allWebhooks.slice(offset, offset + limit)
        const has_more = offset + limit < total
        const next_offset = has_more ? offset + limit : null
        const items_in_page = paginatedWebhooks.length
        const page_number = Math.floor(offset / limit) + 1
        const total_pages = Math.ceil(total / limit)

        result = {
          operation: 'list',
          document_id: docId,
          webhook_count: items_in_page,
          total,
          offset,
          limit,
          has_more,
          next_offset,
          page_number,
          total_pages,
          items_in_page,
          webhooks: paginatedWebhooks.map((w) => ({
            id: w.id,
            name: w.fields.name,
            url: w.fields.url,
            enabled: w.fields.enabled,
            table_id: w.fields.tableId,
            event_types: w.fields.eventTypes,
            is_ready_column: w.fields.isReadyColumn,
            memo: w.fields.memo,
            usage: w.usage
              ? {
                  num_waiting: w.usage.numWaiting,
                  status: w.usage.status,
                  last_success_time: w.usage.lastSuccessTime,
                  last_failure_time: w.usage.lastFailureTime,
                  last_error_message: w.usage.lastErrorMessage,
                  last_http_status: w.usage.lastHttpStatus
                }
              : null
          }))
        }

        if (allWebhooks.length === 0) {
          summary = `No webhooks found for document ${docId}`
        } else {
          const enabledCount = allWebhooks.filter((w) => w.fields.enabled).length
          summary = `Found ${allWebhooks.length} webhook(s) in document ${docId} (showing ${paginatedWebhooks.length})\n\n`
          summary += paginatedWebhooks
            .map((w, i) => {
              let info = `${i + 1}. **${w.fields.name || 'Unnamed'}** (${w.id})\n`
              info += `   - URL: ${w.fields.url}\n`
              info += `   - Table: ${w.fields.tableId}\n`
              info += `   - Events: ${w.fields.eventTypes.join(', ')}\n`
              info += `   - Status: ${w.fields.enabled ? '✅ Enabled' : '❌ Disabled'}\n`
              if (w.usage) {
                info += `   - Queue: ${w.usage.numWaiting} waiting, status: ${w.usage.status}\n`
                if (w.usage.lastErrorMessage) {
                  info += `   - Last Error: ${w.usage.lastErrorMessage}\n`
                }
              }
              return info
            })
            .join('\n')
          summary += `\n**Summary:** ${enabledCount} enabled, ${allWebhooks.length - enabledCount} disabled`
        }
        break
      }

      case 'create': {
        if (operation.action !== 'create') break

        const response = await client.post<CreateWebhooksResponse>(`/docs/${docId}/webhooks`, {
          webhooks: [{ fields: operation.fields }]
        })

        const webhookId = response.webhooks[0].id

        result = {
          operation: 'create',
          success: true,
          document_id: docId,
          webhook_id: webhookId,
          webhook_url: operation.fields.url,
          table_id: operation.fields.tableId,
          event_types: operation.fields.eventTypes
        }

        summary = `✅ Successfully created webhook\n\n`
        summary += `**Webhook ID:** ${webhookId}\n`
        summary += `**URL:** ${operation.fields.url}\n`
        summary += `**Table:** ${operation.fields.tableId}\n`
        summary += `**Events:** ${operation.fields.eventTypes.join(', ')}\n`
        if (operation.fields.name) {
          summary += `**Name:** ${operation.fields.name}\n`
        }
        summary += `**Status:** ${operation.fields.enabled !== false ? '✅ Enabled' : '❌ Disabled'}`
        break
      }

      case 'update': {
        if (operation.action !== 'update') break

        await client.patch(`/docs/${docId}/webhooks/${operation.webhookId}`, operation.fields)

        result = {
          operation: 'update',
          success: true,
          document_id: docId,
          webhook_id: operation.webhookId,
          fields_updated: Object.keys(operation.fields)
        }

        summary = `✅ Successfully updated webhook ${operation.webhookId}\n\n`
        summary += `**Updated fields:** ${Object.keys(operation.fields).join(', ')}`
        break
      }

      case 'delete': {
        if (operation.action !== 'delete') break

        await client.delete<DeleteWebhookResponse>(`/docs/${docId}/webhooks/${operation.webhookId}`)

        result = {
          operation: 'delete',
          success: true,
          document_id: docId,
          webhook_id: operation.webhookId
        }

        summary = `✅ Successfully deleted webhook ${operation.webhookId}`
        break
      }

      case 'clear_queue': {
        await client.delete(`/docs/${docId}/webhooks/queue`)

        result = {
          operation: 'clear_queue',
          success: true,
          document_id: docId,
          action: 'cleared_webhook_queue'
        }

        summary = `✅ Successfully cleared webhook queue for document ${docId}`
        break
      }

      default:
        return assertUnreachable(operation)
    }

    if (!result) {
      throw new Error('Operation did not assign a result')
    }

    if (response_format === 'json') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ],
        structuredContent: result as unknown as Record<string, unknown>
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: summary
        }
      ],
      structuredContent: result as unknown as Record<string, unknown>
    }
  } catch (error) {
    if (error instanceof Error) {
      return formatErrorResponse(enhanceErrorMessage(error.message, docId))
    }
    return formatErrorResponse(String(error))
  }
}

function enhanceErrorMessage(errorMessage: string, docId: string): string {
  const lowerMessage = errorMessage.toLowerCase()

  // ALLOWED_WEBHOOK_DOMAINS rejection
  if (
    lowerMessage.includes('domain') &&
    (lowerMessage.includes('not allowed') || lowerMessage.includes('not permitted'))
  ) {
    return (
      `Webhook domain not allowed by Grist server. ` +
      `The server administrator must add this domain to the ALLOWED_WEBHOOK_DOMAINS environment variable. ` +
      `This is a security feature that prevents webhooks from targeting internal services. ` +
      `Contact your Grist administrator to allowlist the webhook domain.`
    )
  }

  // Document not found
  if (lowerMessage.includes('404') || lowerMessage.includes('not found')) {
    if (lowerMessage.includes('webhook')) {
      return (
        `Webhook not found. The webhook may have been deleted or the webhook ID is incorrect. ` +
        `Use action="list" to see available webhooks for document "${docId}".`
      )
    }
    return (
      `Document not found (${docId}). ` +
      `Verify the docId is correct. ` +
      `Use grist_get_documents to list accessible documents.`
    )
  }

  if (
    lowerMessage.includes('403') ||
    lowerMessage.includes('forbidden') ||
    lowerMessage.includes('permission')
  ) {
    return (
      `Webhook operation failed: Permission denied for document "${docId}"\n\n` +
      `Possible causes:\n` +
      `1. Domain restriction: Grist server may not allow webhooks to this domain\n` +
      `   - The ALLOWED_WEBHOOK_DOMAINS setting restricts webhook destinations\n` +
      `   - Contact your Grist administrator to allowlist the webhook domain\n` +
      `2. Insufficient permissions: Webhook operations require OWNER access\n` +
      `   - Verify you have owner permissions for this document\n` +
      `   - Editor access is NOT sufficient for webhook operations\n` +
      `3. Webhooks disabled: This Grist instance may have webhooks disabled\n` +
      `   - Some Grist installations disable webhook functionality\n\n` +
      `Diagnostic steps:\n` +
      `- Try using a well-known webhook testing service (e.g., webhook.site)\n` +
      `- Check if other write operations (table creation) work with this document\n` +
      `- Contact your Grist administrator for server-side error logs\n\n` +
      `Original error: ${errorMessage}`
    )
  }

  // Rate limiting
  if (lowerMessage.includes('429') || lowerMessage.includes('rate limit')) {
    return (
      `Rate limit exceeded for Grist API. ` +
      `Please wait a moment before retrying. ` +
      `Consider reducing the frequency of webhook operations.`
    )
  }

  // Network/connection errors
  if (lowerMessage.includes('econnrefused') || lowerMessage.includes('connection refused')) {
    return (
      `Cannot connect to Grist server. ` +
      `Verify GRIST_BASE_URL is correct and the server is running. ` +
      `Current error: ${errorMessage}`
    )
  }

  if (lowerMessage.includes('etimedout') || lowerMessage.includes('timeout')) {
    return (
      `Request timed out. ` +
      `The Grist server may be overloaded or unreachable. ` +
      `Try again in a moment. ` +
      `Original error: ${errorMessage}`
    )
  }

  // Server errors
  if (lowerMessage.includes('500') || lowerMessage.includes('internal server error')) {
    return (
      `Grist server encountered an internal error. ` +
      `This may be a temporary issue. ` +
      `If the problem persists, contact your Grist administrator. ` +
      `Error: ${errorMessage}`
    )
  }

  return sanitizeErrorMessage(errorMessage)
}

function sanitizeErrorMessage(message: string): string {
  let sanitized = message

  sanitized = sanitized.replace(/api_key=[^&\s]+/gi, 'api_key=REDACTED')
  sanitized = sanitized.replace(/token=[^&\s]+/gi, 'token=REDACTED')
  sanitized = sanitized.replace(/bearer\s+[a-z0-9_-]+/gi, 'bearer REDACTED')

  sanitized = sanitized.replace(/\/Users\/[^\s]+/g, '[PATH]')
  sanitized = sanitized.replace(/\/Volumes\/[^\s]+/g, '[PATH]')
  sanitized = sanitized.replace(/C:\\Users\\[^\s]+/g, '[PATH]')

  return sanitized
}

function assertUnreachable(x: never): never {
  throw new Error(`Unexpected operation: ${JSON.stringify(x)}`)
}

// Tool definitions with complete documentation
export const WEBHOOK_TOOLS: ReadonlyArray<ToolDefinition> = [
  {
    name: 'grist_manage_webhooks',
    title: 'Manage Webhooks',
    description:
      'Manage webhooks for real-time notifications.\n' +
      'Actions: list, create, update, delete, clear_queue\n' +
      'Params: docId, operation (action + fields)\n' +
      'Ex: {operation:{action:"create",fields:{url:"https://x.com/hook",tableId:"Contacts",eventTypes:["add","update"]}}}\n' +
      '->grist_help',
    purpose: 'Create and manage webhooks for real-time event notifications',
    category: 'webhooks',
    inputSchema: ManageWebhooksSchema,
    annotations: WRITE_SAFE_ANNOTATIONS,
    handler: manageWebhooks,
    docs: {
      overview:
        'Manages webhooks for real-time notifications when table data changes. ' +
        'Webhooks POST to your URL when records are added or updated. ' +
        'Use isReadyColumn to fire only when a condition is met.',
      examples: [
        {
          desc: 'Create webhook',
          input: {
            docId: 'abc123',
            operation: {
              action: 'create',
              fields: {
                url: 'https://api.example.com/webhook',
                tableId: 'Customers',
                eventTypes: ['add', 'update'],
                name: 'Customer Sync'
              }
            }
          }
        },
        {
          desc: 'List webhooks',
          input: {
            docId: 'abc123',
            operation: { action: 'list' }
          }
        },
        {
          desc: 'Disable webhook',
          input: {
            docId: 'abc123',
            operation: {
              action: 'update',
              webhookId: 'abc-123-def',
              fields: { enabled: false }
            }
          }
        },
        {
          desc: 'Clear backed-up queue',
          input: {
            docId: 'abc123',
            operation: { action: 'clear_queue' }
          }
        }
      ],
      errors: [
        { error: 'Webhook not found', solution: 'Use action="list" to see webhook IDs' },
        { error: 'Domain not allowed', solution: 'Contact admin to allowlist webhook domain' },
        { error: 'Permission denied', solution: 'Webhook operations require OWNER access' }
      ],
      parameters:
        '**Create fields:** url (required), tableId (required), eventTypes (required: ["add", "update"]), name, memo, enabled, isReadyColumn\n' +
        '**Update fields:** url, tableId, eventTypes, name, memo, enabled, isReadyColumn'
    }
  }
] as const
