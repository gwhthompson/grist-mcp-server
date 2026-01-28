import type { ToolContext, ToolDefinition } from '../registry/types.js'
import { ManageWebhooksOutputSchema } from '../schemas/output-schemas.js'
import {
  type ManageWebhooksInput,
  ManageWebhooksSchema,
  type WebhookOperation
} from '../schemas/webhooks.js'
import type { WebhookId } from '../types/advanced.js'
import { defineBatchTool } from './factory/index.js'
import { nextSteps } from './utils/next-steps.js'
import { paginate } from './utils/pagination.js'

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

// Individual operation result types - must extend BaseOperationResult (action, success)
interface ListWebhooksResult {
  action: 'list'
  success: true
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
  action: 'create'
  success: true
  webhookId: string
  webhookUrl: string
  tableId: string
  eventTypes: string[]
}

interface UpdateWebhookResult {
  action: 'update'
  success: true
  webhookId: string
  fieldsUpdated: string[]
}

interface DeleteWebhookResult {
  action: 'delete'
  success: true
  webhookId: string
}

interface ClearQueueResult {
  action: 'clear_queue'
  success: true
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

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Execute a single webhook operation.
 */
function executeSingleOperation(
  ctx: ToolContext,
  docId: string,
  operation: WebhookOperation
): Promise<SingleOperationResult> {
  switch (operation.action) {
    case 'list':
      return handleList(ctx, docId, operation)
    case 'create':
      return handleCreate(ctx, docId, operation)
    case 'update':
      return handleUpdate(ctx, docId, operation)
    case 'delete':
      return handleDelete(ctx, docId, operation)
    case 'clear_queue':
      return handleClearQueue(ctx, docId)
    default:
      return assertUnreachable(operation)
  }
}

async function handleList(
  ctx: ToolContext,
  docId: string,
  operation: Extract<WebhookOperation, { action: 'list' }>
): Promise<ListWebhooksResult> {
  const response = await ctx.client.get<ListWebhooksResponse>(`/docs/${docId}/webhooks`)
  const allWebhooks = response.webhooks || []

  const paginated = paginate(allWebhooks, operation)
  const pageNumber = Math.floor(paginated.offset / paginated.limit) + 1
  const totalPages = Math.ceil(paginated.total / paginated.limit)

  return {
    action: 'list',
    success: true,
    webhookCount: paginated.items.length,
    total: paginated.total,
    offset: paginated.offset,
    limit: paginated.limit,
    hasMore: paginated.hasMore,
    nextOffset: paginated.nextOffset,
    pageNumber,
    totalPages,
    itemsInPage: paginated.items.length,
    webhooks: paginated.items.map((w) => ({
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

async function handleCreate(
  ctx: ToolContext,
  docId: string,
  operation: Extract<WebhookOperation, { action: 'create' }>
): Promise<CreateWebhookResult> {
  const response = await ctx.client.post<CreateWebhooksResponse>(`/docs/${docId}/webhooks`, {
    webhooks: [{ fields: operation.fields }]
  })

  const createdWebhook = response.webhooks[0]
  if (!createdWebhook) {
    throw new Error('Webhook creation response missing webhook data')
  }

  return {
    action: 'create',
    success: true,
    webhookId: createdWebhook.id,
    webhookUrl: operation.fields.url,
    tableId: operation.fields.tableId,
    eventTypes: operation.fields.eventTypes
  }
}

async function handleUpdate(
  ctx: ToolContext,
  docId: string,
  operation: Extract<WebhookOperation, { action: 'update' }>
): Promise<UpdateWebhookResult> {
  await ctx.client.patch(`/docs/${docId}/webhooks/${operation.webhookId}`, operation.fields)

  return {
    action: 'update',
    success: true,
    webhookId: operation.webhookId,
    fieldsUpdated: Object.keys(operation.fields)
  }
}

async function handleDelete(
  ctx: ToolContext,
  docId: string,
  operation: Extract<WebhookOperation, { action: 'delete' }>
): Promise<DeleteWebhookResult> {
  await ctx.client.delete<DeleteWebhookResponse>(`/docs/${docId}/webhooks/${operation.webhookId}`)

  return {
    action: 'delete',
    success: true,
    webhookId: operation.webhookId
  }
}

async function handleClearQueue(ctx: ToolContext, docId: string): Promise<ClearQueueResult> {
  await ctx.client.delete(`/docs/${docId}/webhooks/queue`)

  return {
    action: 'clear_queue',
    success: true
  }
}

function assertUnreachable(x: never): never {
  throw new Error(`Unexpected operation: ${JSON.stringify(x)}`)
}

// =============================================================================
// Tool Definition (Factory Pattern)
// =============================================================================

export const MANAGE_WEBHOOKS_TOOL = defineBatchTool<
  typeof ManageWebhooksSchema,
  WebhookOperation,
  SingleOperationResult,
  ManageWebhooksResponse
>({
  name: 'grist_manage_webhooks',
  title: 'Manage Webhooks',
  description: 'Create, update, delete, or list webhooks in batch for real-time notifications',
  purpose: 'Create and manage webhooks for real-time event notifications',
  category: 'webhooks',
  inputSchema: ManageWebhooksSchema,
  outputSchema: ManageWebhooksOutputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true, // Can delete webhooks
    idempotentHint: false,
    openWorldHint: true
  },

  getOperations: (params) => params.operations,
  getDocId: (params) => params.docId,
  getActionName: (operation) => operation.action,

  executeOperation(ctx, docId, operation, _index) {
    return executeSingleOperation(ctx, docId, operation)
  },

  buildSuccessResponse(docId, results, params) {
    return {
      success: true,
      docId,
      operationsCompleted: params.operations.length,
      results,
      message: `Successfully completed ${params.operations.length} webhook operation(s)`
    }
  },

  buildFailureResponse(docId, failedIndex, failedOperation, completedResults, errorMessage) {
    return {
      success: false,
      docId,
      operationsCompleted: failedIndex,
      results: completedResults,
      message: `Operation ${failedIndex + 1} (${failedOperation.action}) failed: ${errorMessage}`,
      partialFailure: {
        operationIndex: failedIndex,
        error: errorMessage,
        completedOperations: failedIndex
      }
    }
  },

  // biome-ignore lint/suspicious/useAwait: Factory type requires async return
  async afterExecute(result, params, _ctx) {
    const operations = params.operations
    const hasCreate = operations.some((op) => op.action === 'create')
    const hasDelete = operations.some((op) => op.action === 'delete')
    const hasUpdate = operations.some((op) => op.action === 'update')
    const hasList = operations.some((op) => op.action === 'list')
    const hasClearQueue = operations.some((op) => op.action === 'clear_queue')

    const builder = nextSteps()

    // Partial failure hints
    if (result.partialFailure) {
      builder
        .add(
          `Fix error in operation ${result.partialFailure.operationIndex}: ${result.partialFailure.error}`
        )
        .add(`Resume from operation index ${result.partialFailure.operationIndex}`)
    } else if (result.success) {
      // Empty list hint
      builder.addIfFn(hasList && result.results.length > 0, () => {
        const listResult = result.results.find((r) => r.action === 'list')
        if (listResult && 'webhooks' in listResult && listResult.webhooks.length === 0) {
          return 'No webhooks found. Use action="create" to set up webhook notifications'
        }
        return ''
      })

      // Create hints - one per created webhook
      if (hasCreate) {
        const createResults = result.results.filter((r) => r.action === 'create')
        for (const cr of createResults) {
          if ('tableId' in cr) {
            builder.add(`Test webhook by adding/updating records in "${cr.tableId}" table`)
          }
        }
      }

      builder
        .addIf(hasUpdate, 'Use action="list" to verify webhook configuration changes')
        .addIf(hasDelete, 'Verify webhook removed from receiving service')
        .addIf(hasClearQueue, 'Monitor webhook queue with action="list" to verify delivery')
    }

    return { ...result, nextSteps: builder.build() }
  },

  docs: {
    overview:
      'Batch webhook CRUD for real-time notifications. list and clear_queue must be solo operations.',
    examples: [
      {
        desc: 'Create webhook',
        input: {
          docId: 'abc123',
          operations: [
            {
              action: 'create',
              fields: { url: 'https://api.example.com/hook', tableId: 'Tasks', eventTypes: ['add'] }
            }
          ]
        }
      },
      {
        desc: 'List webhooks',
        input: { docId: 'abc123', operations: [{ action: 'list' }] }
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
})

export function manageWebhooks(context: ToolContext, params: ManageWebhooksInput) {
  return MANAGE_WEBHOOKS_TOOL.handler(context, params)
}

// Export tools array for registry
export const WEBHOOK_TOOLS: ReadonlyArray<ToolDefinition> = [MANAGE_WEBHOOKS_TOOL] as const
