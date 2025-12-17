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

// Individual operation result types
interface ListWebhooksResult {
  operation: 'list'
  webhookCount: number
  total: number
  offset: number
  limit: number
  hasMore: boolean
  nextOffset: number | null
  pageNumber: number
  totalPages: number
  itemsInPage: number
  webhooks: Array<{
    id: string
    name: string | null
    url: string
    enabled: boolean
    tableId: string
    eventTypes: string[]
    isReadyColumn: string | null
    memo: string | null
    usage: WebhookUsageOutput | null
  }>
}

interface CreateWebhookResult {
  operation: 'create'
  success: true
  webhookId: string
  webhookUrl: string
  tableId: string
  eventTypes: string[]
}

interface UpdateWebhookResult {
  operation: 'update'
  success: true
  webhookId: string
  fieldsUpdated: string[]
}

interface DeleteWebhookResult {
  operation: 'delete'
  success: true
  webhookId: string
}

interface ClearQueueResult {
  operation: 'clear_queue'
  success: true
  action: 'cleared_webhook_queue'
}

interface WebhookUsageOutput {
  numWaiting: number
  status: string
  updatedTime?: number | null
  lastSuccessTime?: number | null
  lastFailureTime?: number | null
  lastErrorMessage?: string | null
  lastHttpStatus?: number | null
}

// Single operation result (without docId - added at batch level)
type SingleOperationResult =
  | ListWebhooksResult
  | CreateWebhookResult
  | UpdateWebhookResult
  | DeleteWebhookResult
  | ClearQueueResult

// Batch response structure
interface ManageWebhooksResponse {
  success: boolean
  docId: string
  operationsCompleted: number
  results: SingleOperationResult[]
  message: string
  partialFailure?: {
    operationIndex: number
    error: string
    completedOperations: number
  }
  nextSteps?: string[]
}

/**
 * Class-based implementation of webhook management tool.
 * Standardizes webhook operations while maintaining custom formatting.
 */
export class ManageWebhooksTool extends GristTool<
  typeof ManageWebhooksSchema,
  ManageWebhooksResponse
> {
  constructor(context: ToolContext) {
    super(context, ManageWebhooksSchema)
  }

  protected async executeInternal(params: ManageWebhooksInput): Promise<ManageWebhooksResponse> {
    const { docId, operations } = params
    const results: SingleOperationResult[] = []

    // Execute operations sequentially
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i]
      if (!operation) continue

      try {
        const result = await this.executeOperation(docId, operation)
        results.push(result)
      } catch (error) {
        // For single-operation batches, throw the error for proper MCP error response
        // For multi-operation batches, return partial failure info
        if (operations.length === 1) {
          throw error
        }

        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          docId,
          operationsCompleted: i,
          results,
          message: `Operation ${i + 1} (${operation.action}) failed: ${errorMessage}`,
          partialFailure: {
            operationIndex: i,
            error: errorMessage,
            completedOperations: i
          }
        }
      }
    }

    return {
      success: true,
      docId,
      operationsCompleted: operations.length,
      results,
      message: `Successfully completed ${operations.length} webhook operation(s)`
    }
  }

  protected async afterExecute(
    result: ManageWebhooksResponse,
    params: ManageWebhooksInput
  ): Promise<ManageWebhooksResponse> {
    const nextSteps: string[] = []

    if (result.partialFailure) {
      nextSteps.push(
        `Fix error in operation ${result.partialFailure.operationIndex}: ${result.partialFailure.error}`
      )
      nextSteps.push(`Resume from operation index ${result.partialFailure.operationIndex}`)
    } else if (result.success) {
      // Generate contextual next steps based on operations performed
      const operations = params.operations
      const hasCreate = operations.some((op) => op.action === 'create')
      const hasDelete = operations.some((op) => op.action === 'delete')
      const hasUpdate = operations.some((op) => op.action === 'update')
      const hasList = operations.some((op) => op.action === 'list')
      const hasClearQueue = operations.some((op) => op.action === 'clear_queue')

      if (hasList && result.results.length > 0) {
        const listResult = result.results.find((r) => r.operation === 'list')
        if (listResult && 'webhooks' in listResult && listResult.webhooks.length === 0) {
          nextSteps.push(`No webhooks found. Use action="create" to set up webhook notifications`)
        }
      }

      if (hasCreate) {
        const createResults = result.results.filter((r) => r.operation === 'create')
        for (const cr of createResults) {
          if ('tableId' in cr) {
            nextSteps.push(`Test webhook by adding/updating records in "${cr.tableId}" table`)
          }
        }
      }

      if (hasUpdate) {
        nextSteps.push(`Use action="list" to verify webhook configuration changes`)
      }

      if (hasDelete) {
        nextSteps.push(`Verify webhook removed from receiving service`)
      }

      if (hasClearQueue) {
        nextSteps.push(`Monitor webhook queue with action="list" to verify delivery`)
      }
    }

    return { ...result, nextSteps: nextSteps.length > 0 ? nextSteps : undefined }
  }

  private async executeOperation(
    docId: string,
    operation: WebhookOperation
  ): Promise<SingleOperationResult> {
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
    const hasMore = offset + limit < total
    const nextOffset = hasMore ? offset + limit : null
    const itemsInPage = paginatedWebhooks.length
    const pageNumber = Math.floor(offset / limit) + 1
    const totalPages = Math.ceil(total / limit)

    return {
      operation: 'list',
      webhookCount: itemsInPage,
      total,
      offset,
      limit,
      hasMore,
      nextOffset,
      pageNumber,
      totalPages,
      itemsInPage,
      webhooks: paginatedWebhooks.map((w) => ({
        id: w.id,
        name: w.fields.name,
        url: w.fields.url,
        enabled: w.fields.enabled,
        tableId: w.fields.tableId,
        eventTypes: w.fields.eventTypes,
        isReadyColumn: w.fields.isReadyColumn,
        memo: w.fields.memo,
        usage: w.usage
          ? {
              numWaiting: w.usage.numWaiting,
              status: w.usage.status,
              lastSuccessTime: w.usage.lastSuccessTime,
              lastFailureTime: w.usage.lastFailureTime,
              lastErrorMessage: w.usage.lastErrorMessage,
              lastHttpStatus: w.usage.lastHttpStatus
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
      webhookId: createdWebhook.id,
      webhookUrl: operation.fields.url,
      tableId: operation.fields.tableId,
      eventTypes: operation.fields.eventTypes
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
      webhookId: operation.webhookId,
      fieldsUpdated: Object.keys(operation.fields)
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
      webhookId: operation.webhookId
    }
  }

  private async handleClearQueue(docId: string): Promise<ClearQueueResult> {
    await this.client.delete(`/docs/${docId}/webhooks/queue`)

    return {
      operation: 'clear_queue',
      success: true,
      action: 'cleared_webhook_queue'
    }
  }

  /**
   * Custom response formatting for webhooks to include rich markdown summaries.
   */
  protected formatResponse(
    data: ManageWebhooksResponse,
    format: 'json' | 'markdown'
  ): MCPToolResponse {
    if (format === 'json') {
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data as unknown as Record<string, unknown>
      }
    }

    // Custom markdown formatting for batch results
    const summary = this.generateBatchMarkdownSummary(data)

    return {
      content: [{ type: 'text', text: summary }],
      structuredContent: data as unknown as Record<string, unknown>
    }
  }

  private generateBatchMarkdownSummary(response: ManageWebhooksResponse): string {
    if (!response.success && response.partialFailure) {
      let summary = `**Partial Failure** - ${response.operationsCompleted}/${response.results.length + 1} operations completed\n\n`
      summary += `**Error at operation ${response.partialFailure.operationIndex + 1}:** ${response.partialFailure.error}\n\n`

      if (response.results.length > 0) {
        summary += `**Completed operations:**\n`
        summary += response.results
          .map((r, i) => `${i + 1}. ${this.formatSingleResult(r)}`)
          .join('\n')
      }
      return summary
    }

    // All operations succeeded
    const firstResult = response.results[0]
    if (response.results.length === 1 && firstResult) {
      // Single operation - format directly
      return this.formatSingleResultDetailed(firstResult, response.docId)
    }

    // Multiple operations
    let summary = `**Successfully completed ${response.operationsCompleted} operation(s)**\n\n`
    summary += response.results.map((r, i) => `${i + 1}. ${this.formatSingleResult(r)}`).join('\n')
    return summary
  }

  private formatSingleResult(result: SingleOperationResult): string {
    switch (result.operation) {
      case 'list':
        return `Listed ${result.total} webhooks (showing ${result.webhookCount})`
      case 'create':
        return `Created webhook ${result.webhookId} for table ${result.tableId}`
      case 'update':
        return `Updated webhook ${result.webhookId} (fields: ${result.fieldsUpdated.join(', ')})`
      case 'delete':
        return `Deleted webhook ${result.webhookId}`
      case 'clear_queue':
        return `Cleared webhook queue`
    }
  }

  private formatSingleResultDetailed(result: SingleOperationResult, docId: string): string {
    switch (result.operation) {
      case 'list':
        return this.formatListSummary(result, docId)
      case 'create':
        return this.formatCreateSummary(result)
      case 'update':
        return this.formatUpdateSummary(result)
      case 'delete':
        return this.formatDeleteSummary(result)
      case 'clear_queue':
        return this.formatClearQueueSummary(docId)
    }
  }

  private formatListSummary(result: ListWebhooksResult, docId: string): string {
    if (result.webhooks.length === 0) {
      return `No webhooks found for document ${docId}`
    }

    const enabledCount = result.webhooks.filter((w) => w.enabled).length
    let summary = `Found ${result.total} webhook(s) in document ${docId} (showing ${result.webhooks.length})\n\n`

    summary += result.webhooks
      .map((w, i) => {
        let info = `${i + 1}. **${w.name || 'Unnamed'}** (${w.id})\n`
        info += `   - URL: ${w.url}\n`
        info += `   - Table: ${w.tableId}\n`
        info += `   - Events: ${w.eventTypes.join(', ')}\n`
        info += `   - Status: ${w.enabled ? 'Enabled' : 'Disabled'}\n`
        if (w.usage) {
          info += `   - Queue: ${w.usage.numWaiting} waiting, status: ${w.usage.status}\n`
          if (w.usage.lastErrorMessage) {
            info += `   - Last Error: ${w.usage.lastErrorMessage}\n`
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
      `**Webhook ID:** ${result.webhookId}\n` +
      `**URL:** ${result.webhookUrl}\n` +
      `**Table:** ${result.tableId}\n` +
      `**Events:** ${result.eventTypes.join(', ')}`
    )
  }

  private formatUpdateSummary(result: UpdateWebhookResult): string {
    return (
      `Successfully updated webhook ${result.webhookId}\n\n` +
      `**Updated fields:** ${result.fieldsUpdated.join(', ')}`
    )
  }

  private formatDeleteSummary(result: DeleteWebhookResult): string {
    return `Successfully deleted webhook ${result.webhookId}`
  }

  private formatClearQueueSummary(docId: string): string {
    return `Successfully cleared webhook queue for document ${docId}`
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
    description: 'Create, update, delete, or list webhooks in batch for real-time notifications',
    purpose: 'Create and manage webhooks for real-time event notifications',
    category: 'webhooks',
    inputSchema: ManageWebhooksSchema,
    outputSchema: ManageWebhooksOutputSchema,
    annotations: WRITE_SAFE_ANNOTATIONS,
    handler: manageWebhooks,
    docs: {
      overview:
        'Manages webhooks for real-time notifications when table data changes. ' +
        'Batch multiple create/update/delete operations in a single call. ' +
        'Note: list and clear_queue must be the only operation if used.',
      examples: [
        {
          desc: 'Create multiple webhooks',
          input: {
            docId: 'abc123',
            operations: [
              {
                action: 'create',
                fields: {
                  url: 'https://api.example.com/customers',
                  tableId: 'Customers',
                  eventTypes: ['add', 'update'],
                  name: 'Customer Sync'
                }
              },
              {
                action: 'create',
                fields: {
                  url: 'https://api.example.com/orders',
                  tableId: 'Orders',
                  eventTypes: ['add'],
                  name: 'Order Notifications'
                }
              }
            ]
          }
        },
        {
          desc: 'List webhooks',
          input: {
            docId: 'abc123',
            operations: [{ action: 'list' }]
          }
        },
        {
          desc: 'Update and delete webhooks',
          input: {
            docId: 'abc123',
            operations: [
              { action: 'update', webhookId: 'uuid-1', fields: { enabled: false } },
              { action: 'delete', webhookId: 'uuid-2' }
            ]
          }
        },
        {
          desc: 'Clear backed-up queue',
          input: {
            docId: 'abc123',
            operations: [{ action: 'clear_queue' }]
          }
        }
      ],
      errors: [
        { error: 'Webhook not found', solution: 'Use action="list" to see webhook IDs' },
        { error: 'Domain not allowed', solution: 'Contact admin to allowlist webhook domain' },
        { error: 'Permission denied', solution: 'Webhook operations require OWNER access' },
        {
          error: 'list/clear_queue with other operations',
          solution: 'list and clear_queue must be the only operation in the array'
        }
      ],
      parameters:
        '**Create fields:** url (required), tableId (required), eventTypes (required: ["add", "update"]), name, memo, enabled, isReadyColumn\n' +
        '**Update fields:** url, tableId, eventTypes, name, memo, enabled, isReadyColumn'
    }
  }
] as const
