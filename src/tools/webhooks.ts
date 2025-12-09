import { type ToolContext, type ToolDefinition, WRITE_SAFE_ANNOTATIONS } from '../registry/types.js'
import { ManageWebhooksOutputSchema } from '../schemas/output-schemas.js'
import {
  type ManageWebhooksInput,
  ManageWebhooksSchema,
  type WebhookOperation
} from '../schemas/webhooks.js'
import type { WebhookId } from '../types/advanced.js'
import type { MCPToolResponse } from '../types.js'
import { GristTool } from './base/GristTool.js'

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

/**
 * Class-based implementation of webhook management tool.
 * Standardizes webhook operations while maintaining custom formatting.
 */
export class ManageWebhooksTool extends GristTool<typeof ManageWebhooksSchema, OperationResult> {
  constructor(context: ToolContext) {
    super(context, ManageWebhooksSchema)
  }

  protected async executeInternal(params: ManageWebhooksInput): Promise<OperationResult> {
    const { docId, operation } = params

    switch (operation.action) {
      case 'list':
        return this.handleList(docId, operation)
      case 'create':
        return this.handleCreate(docId, operation)
      case 'update':
        return this.handleUpdate(docId, operation)
      case 'delete':
        return this.handleDelete(docId, operation)
      case 'clear_queue':
        return this.handleClearQueue(docId)
      default:
        return assertUnreachable(operation)
    }
  }

  private async handleList(
    docId: string,
    operation: Extract<WebhookOperation, { action: 'list' }>
  ): Promise<ListWebhooksResult> {
    const response = await this.client.get<ListWebhooksResponse>(`/docs/${docId}/webhooks`)
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

    return {
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
  }

  private async handleCreate(
    docId: string,
    operation: Extract<WebhookOperation, { action: 'create' }>
  ): Promise<CreateWebhookResult> {
    const response = await this.client.post<CreateWebhooksResponse>(`/docs/${docId}/webhooks`, {
      webhooks: [{ fields: operation.fields }]
    })

    const createdWebhook = response.webhooks[0]
    if (!createdWebhook) {
      throw new Error('Webhook creation response missing webhook data')
    }

    return {
      operation: 'create',
      success: true,
      document_id: docId,
      webhook_id: createdWebhook.id,
      webhook_url: operation.fields.url,
      table_id: operation.fields.tableId,
      event_types: operation.fields.eventTypes
    }
  }

  private async handleUpdate(
    docId: string,
    operation: Extract<WebhookOperation, { action: 'update' }>
  ): Promise<UpdateWebhookResult> {
    await this.client.patch(`/docs/${docId}/webhooks/${operation.webhookId}`, operation.fields)

    return {
      operation: 'update',
      success: true,
      document_id: docId,
      webhook_id: operation.webhookId,
      fields_updated: Object.keys(operation.fields)
    }
  }

  private async handleDelete(
    docId: string,
    operation: Extract<WebhookOperation, { action: 'delete' }>
  ): Promise<DeleteWebhookResult> {
    await this.client.delete<DeleteWebhookResponse>(
      `/docs/${docId}/webhooks/${operation.webhookId}`
    )

    return {
      operation: 'delete',
      success: true,
      document_id: docId,
      webhook_id: operation.webhookId
    }
  }

  private async handleClearQueue(docId: string): Promise<ClearQueueResult> {
    await this.client.delete(`/docs/${docId}/webhooks/queue`)

    return {
      operation: 'clear_queue',
      success: true,
      document_id: docId,
      action: 'cleared_webhook_queue'
    }
  }

  /**
   * Custom response formatting for webhooks to include rich markdown summaries.
   */
  protected formatResponse(data: OperationResult, format: 'json' | 'markdown'): MCPToolResponse {
    if (format === 'json') {
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data as unknown as Record<string, unknown>
      }
    }

    // Custom markdown formatting for each operation type
    const summary = this.generateMarkdownSummary(data)

    return {
      content: [{ type: 'text', text: summary }],
      structuredContent: data as unknown as Record<string, unknown>
    }
  }

  private generateMarkdownSummary(result: OperationResult): string {
    switch (result.operation) {
      case 'list':
        return this.formatListSummary(result)
      case 'create':
        return this.formatCreateSummary(result)
      case 'update':
        return this.formatUpdateSummary(result)
      case 'delete':
        return this.formatDeleteSummary(result)
      case 'clear_queue':
        return this.formatClearQueueSummary(result)
    }
  }

  private formatListSummary(result: ListWebhooksResult): string {
    if (result.webhooks.length === 0) {
      return `No webhooks found for document ${result.document_id}`
    }

    const enabledCount = result.webhooks.filter((w) => w.enabled).length
    let summary = `Found ${result.total} webhook(s) in document ${result.document_id} (showing ${result.webhooks.length})\n\n`

    summary += result.webhooks
      .map((w, i) => {
        let info = `${i + 1}. **${w.name || 'Unnamed'}** (${w.id})\n`
        info += `   - URL: ${w.url}\n`
        info += `   - Table: ${w.table_id}\n`
        info += `   - Events: ${w.event_types.join(', ')}\n`
        info += `   - Status: ${w.enabled ? 'Enabled' : 'Disabled'}\n`
        if (w.usage) {
          info += `   - Queue: ${w.usage.num_waiting} waiting, status: ${w.usage.status}\n`
          if (w.usage.last_error_message) {
            info += `   - Last Error: ${w.usage.last_error_message}\n`
          }
        }
        return info
      })
      .join('\n')

    summary += `\n**Summary:** ${enabledCount} enabled, ${result.webhooks.length - enabledCount} disabled`
    return summary
  }

  private formatCreateSummary(result: CreateWebhookResult): string {
    return (
      `Successfully created webhook\n\n` +
      `**Webhook ID:** ${result.webhook_id}\n` +
      `**URL:** ${result.webhook_url}\n` +
      `**Table:** ${result.table_id}\n` +
      `**Events:** ${result.event_types.join(', ')}`
    )
  }

  private formatUpdateSummary(result: UpdateWebhookResult): string {
    return (
      `Successfully updated webhook ${result.webhook_id}\n\n` +
      `**Updated fields:** ${result.fields_updated.join(', ')}`
    )
  }

  private formatDeleteSummary(result: DeleteWebhookResult): string {
    return `Successfully deleted webhook ${result.webhook_id}`
  }

  private formatClearQueueSummary(result: ClearQueueResult): string {
    return `Successfully cleared webhook queue for document ${result.document_id}`
  }

  /**
   * Override error handling to provide webhook-specific error messages.
   */
  protected formatError(error: Error): MCPToolResponse {
    const enhancedMessage = enhanceErrorMessage(error.message)
    return {
      content: [{ type: 'text', text: enhancedMessage }],
      isError: true
    }
  }
}

/**
 * Backward-compatible function wrapper.
 *
 * Note: Pre-validates params to throw Zod errors (maintaining original behavior).
 * The original implementation threw validation errors before the try/catch block.
 */
export async function manageWebhooks(
  context: ToolContext,
  params: unknown
): Promise<MCPToolResponse> {
  // Pre-validate to throw on errors (maintaining original behavior for tests)
  // The original implementation let Zod validation errors throw before the try/catch
  const validatedParams = ManageWebhooksSchema.parse(params)

  const tool = new ManageWebhooksTool(context)
  return tool.execute(validatedParams)
}

function enhanceErrorMessage(errorMessage: string): string {
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
        `Use action="list" to see available webhooks.`
      )
    }
    return (
      `Document not found. ` +
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
      `Webhook operation failed: Permission denied\n\n` +
      `Possible causes:\n` +
      `1. Domain restriction: Grist server may not allow webhooks to this domain\n` +
      `   - The ALLOWED_WEBHOOK_DOMAINS setting restricts webhook destinations\n` +
      `   - Contact your Grist administrator to allowlist the webhook domain\n` +
      `2. Insufficient permissions: Webhook operations require OWNER access\n` +
      `   - Verify you have owner permissions for this document\n` +
      `   - Editor access is NOT sufficient for webhook operations\n` +
      `3. Webhooks disabled: This Grist instance may have webhooks disabled\n\n` +
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
    description: 'Create, update, delete, or list webhooks for real-time notifications',
    purpose: 'Create and manage webhooks for real-time event notifications',
    category: 'webhooks',
    inputSchema: ManageWebhooksSchema,
    outputSchema: ManageWebhooksOutputSchema,
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
