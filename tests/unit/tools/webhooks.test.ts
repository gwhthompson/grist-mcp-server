/**
 * Unit tests for webhooks.ts tools
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../../../src/registry/types.js'
import {
  ManageWebhooksSchema,
  ManageWebhooksTool,
  WEBHOOK_TOOLS
} from '../../../src/tools/webhooks.js'

// Valid Base58 22-char doc ID
const VALID_DOC_ID = 'aaaaaaaaaaaaaaaaaaaaaa'

describe('ManageWebhooksTool', () => {
  let context: ToolContext
  let mockClient: {
    get: ReturnType<typeof vi.fn>
    post: ReturnType<typeof vi.fn>
    patch: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn()
    }
    context = {
      client: mockClient as unknown as ToolContext['client'],
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      schemaCache: {} as ToolContext['schemaCache']
    }
  })

  describe('list operation', () => {
    it('lists webhooks', async () => {
      mockClient.get.mockResolvedValue({
        webhooks: [
          {
            id: 'wh1',
            fields: {
              name: 'Webhook 1',
              url: 'https://example.com/hook1',
              enabled: true,
              tableId: 'Users',
              eventTypes: ['add', 'update'],
              isReadyColumn: null,
              memo: null,
              unsubscribeKey: 'key1'
            }
          },
          {
            id: 'wh2',
            fields: {
              name: 'Webhook 2',
              url: 'https://example.com/hook2',
              enabled: false,
              tableId: 'Orders',
              eventTypes: ['add'],
              isReadyColumn: 'Ready',
              memo: 'Test webhook',
              unsubscribeKey: 'key2'
            }
          }
        ]
      })

      const tool = new ManageWebhooksTool(context)
      const result = await tool.execute({
        docId: VALID_DOC_ID,
        operations: [{ action: 'list' }]
      })

      expect(mockClient.get).toHaveBeenCalledWith(`/docs/${VALID_DOC_ID}/webhooks`)
      expect(result.structuredContent?.success).toBe(true)
      expect(result.structuredContent?.results[0].operation).toBe('list')
      expect(result.structuredContent?.results[0].webhookCount).toBe(2)
    })

    it('handles empty webhook list', async () => {
      mockClient.get.mockResolvedValue({ webhooks: [] })

      const tool = new ManageWebhooksTool(context)
      const result = await tool.execute({
        docId: VALID_DOC_ID,
        operations: [{ action: 'list' }]
      })

      expect(result.structuredContent?.success).toBe(true)
      expect(result.structuredContent?.results[0].webhookCount).toBe(0)
    })

    it('paginates webhook list', async () => {
      mockClient.get.mockResolvedValue({
        webhooks: Array.from({ length: 10 }, (_, i) => ({
          id: `wh${i}`,
          fields: {
            name: `Webhook ${i}`,
            url: `https://example.com/hook${i}`,
            enabled: true,
            tableId: 'Table',
            eventTypes: ['add'],
            isReadyColumn: null,
            memo: null,
            unsubscribeKey: `key${i}`
          }
        }))
      })

      const tool = new ManageWebhooksTool(context)
      const result = await tool.execute({
        docId: VALID_DOC_ID,
        operations: [{ action: 'list', limit: 3 }]
      })

      expect(result.structuredContent?.results[0].webhooks).toHaveLength(3)
      expect(result.structuredContent?.results[0].hasMore).toBe(true)
    })
  })

  describe('create operation', () => {
    it('creates a webhook', async () => {
      mockClient.post.mockResolvedValue({
        webhooks: [{ id: 'new-wh-id' }]
      })

      const tool = new ManageWebhooksTool(context)
      const result = await tool.execute({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'create',
            fields: {
              tableId: 'Users',
              url: 'https://example.com/webhook',
              eventTypes: ['add', 'update']
            }
          }
        ]
      })

      expect(mockClient.post).toHaveBeenCalledWith(
        `/docs/${VALID_DOC_ID}/webhooks`,
        expect.objectContaining({
          webhooks: [
            expect.objectContaining({
              fields: expect.objectContaining({
                tableId: 'Users',
                url: 'https://example.com/webhook',
                eventTypes: ['add', 'update']
              })
            })
          ]
        })
      )
      expect(result.structuredContent?.success).toBe(true)
      expect(result.structuredContent?.results[0].operation).toBe('create')
    })

    it('creates webhook with optional fields', async () => {
      mockClient.post.mockResolvedValue({
        webhooks: [{ id: 'new-wh-id' }]
      })

      const tool = new ManageWebhooksTool(context)
      const result = await tool.execute({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'create',
            fields: {
              tableId: 'Users',
              url: 'https://example.com/webhook',
              eventTypes: ['add'],
              name: 'My Webhook',
              memo: 'Webhook for user events',
              isReadyColumn: 'Ready',
              enabled: false
            }
          }
        ]
      })

      expect(mockClient.post).toHaveBeenCalledWith(
        `/docs/${VALID_DOC_ID}/webhooks`,
        expect.objectContaining({
          webhooks: [
            expect.objectContaining({
              fields: expect.objectContaining({
                name: 'My Webhook',
                memo: 'Webhook for user events',
                isReadyColumn: 'Ready',
                enabled: false
              })
            })
          ]
        })
      )
      expect(result.structuredContent?.success).toBe(true)
    })
  })

  describe('update operation', () => {
    // Valid UUID for webhook ID
    const VALID_WEBHOOK_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

    it('updates a webhook', async () => {
      mockClient.patch.mockResolvedValue({})

      const tool = new ManageWebhooksTool(context)
      const result = await tool.execute({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'update',
            webhookId: VALID_WEBHOOK_ID,
            fields: { enabled: false }
          }
        ]
      })

      expect(mockClient.patch).toHaveBeenCalledWith(
        `/docs/${VALID_DOC_ID}/webhooks/${VALID_WEBHOOK_ID}`,
        expect.objectContaining({
          enabled: false
        })
      )
      expect(result.structuredContent?.success).toBe(true)
      expect(result.structuredContent?.results[0].operation).toBe('update')
    })

    it('updates multiple fields', async () => {
      mockClient.patch.mockResolvedValue({})

      const tool = new ManageWebhooksTool(context)
      await tool.execute({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'update',
            webhookId: VALID_WEBHOOK_ID,
            fields: {
              name: 'Updated Name',
              url: 'https://new-url.com/hook',
              eventTypes: ['update']
            }
          }
        ]
      })

      expect(mockClient.patch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          name: 'Updated Name',
          url: 'https://new-url.com/hook',
          eventTypes: ['update']
        })
      )
    })
  })

  describe('delete operation', () => {
    const VALID_WEBHOOK_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

    it('deletes a webhook', async () => {
      mockClient.delete.mockResolvedValue({ success: true })

      const tool = new ManageWebhooksTool(context)
      const result = await tool.execute({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'delete',
            webhookId: VALID_WEBHOOK_ID
          }
        ]
      })

      expect(mockClient.delete).toHaveBeenCalledWith(
        `/docs/${VALID_DOC_ID}/webhooks/${VALID_WEBHOOK_ID}`
      )
      expect(result.structuredContent?.success).toBe(true)
      expect(result.structuredContent?.results[0].operation).toBe('delete')
    })
  })

  describe('clear_queue operation', () => {
    it('clears webhook queue', async () => {
      mockClient.delete.mockResolvedValue({})

      const tool = new ManageWebhooksTool(context)
      const result = await tool.execute({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'clear_queue'
          }
        ]
      })

      expect(mockClient.delete).toHaveBeenCalledWith(`/docs/${VALID_DOC_ID}/webhooks/queue`)
      expect(result.structuredContent?.success).toBe(true)
      expect(result.structuredContent?.results[0].operation).toBe('clear_queue')
    })
  })

  describe('multiple operations', () => {
    // Note: list and clear_queue must be alone, so we test create + delete
    const VALID_WEBHOOK_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

    it('executes multiple operations in sequence', async () => {
      mockClient.post.mockResolvedValue({ webhooks: [{ id: VALID_WEBHOOK_ID }] })
      mockClient.delete.mockResolvedValue({ success: true })

      const tool = new ManageWebhooksTool(context)
      const result = await tool.execute({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'create',
            fields: { tableId: 'Users', url: 'https://new.com/hook', eventTypes: ['add'] }
          },
          { action: 'delete', webhookId: VALID_WEBHOOK_ID }
        ]
      })

      expect(result.structuredContent?.operationsCompleted).toBe(2)
      expect(result.structuredContent?.results).toHaveLength(2)
    })

    it('returns partial failure on error', async () => {
      mockClient.post.mockResolvedValue({ webhooks: [{ id: VALID_WEBHOOK_ID }] })
      mockClient.delete.mockRejectedValue(new Error('Network error'))

      const tool = new ManageWebhooksTool(context)
      const result = await tool.execute({
        docId: VALID_DOC_ID,
        operations: [
          {
            action: 'create',
            fields: { tableId: 'Users', url: 'https://example.com/hook', eventTypes: ['add'] }
          },
          { action: 'delete', webhookId: VALID_WEBHOOK_ID }
        ]
      })

      expect(result.structuredContent?.success).toBe(false)
      expect(result.structuredContent?.partialFailure).toBeDefined()
      expect(result.structuredContent?.partialFailure?.operationIndex).toBe(1)
      expect(result.structuredContent?.operationsCompleted).toBe(1)
    })
  })
})

describe('ManageWebhooksSchema', () => {
  const VALID_WEBHOOK_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

  it('requires docId and operations', () => {
    const result = ManageWebhooksSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [{ action: 'list' }]
    })
    expect(result.success).toBe(true)
  })

  it('validates list operation', () => {
    const result = ManageWebhooksSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [{ action: 'list', limit: 10, offset: 0 }]
    })
    expect(result.success).toBe(true)
  })

  it('validates create operation with fields wrapper', () => {
    const result = ManageWebhooksSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'create',
          fields: {
            tableId: 'Users',
            url: 'https://example.com/hook',
            eventTypes: ['add']
          }
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects create without fields wrapper', () => {
    const result = ManageWebhooksSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'create',
          tableId: 'Users'
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('validates update operation with webhookId and fields', () => {
    const result = ManageWebhooksSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'update',
          webhookId: VALID_WEBHOOK_ID,
          fields: { enabled: false }
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects update without webhookId', () => {
    const result = ManageWebhooksSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'update',
          fields: { enabled: false }
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('validates delete operation with valid UUID', () => {
    const result = ManageWebhooksSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'delete',
          webhookId: VALID_WEBHOOK_ID
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects delete with invalid webhookId', () => {
    const result = ManageWebhooksSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'delete',
          webhookId: 'not-a-uuid'
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('validates clear_queue operation', () => {
    const result = ManageWebhooksSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'clear_queue'
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('validates eventTypes values (add and update only)', () => {
    const result = ManageWebhooksSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'create',
          fields: {
            tableId: 'Users',
            url: 'https://example.com/hook',
            eventTypes: ['add', 'update']
          }
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid eventTypes', () => {
    const result = ManageWebhooksSchema.safeParse({
      docId: VALID_DOC_ID,
      operations: [
        {
          action: 'create',
          fields: {
            tableId: 'Users',
            url: 'https://example.com/hook',
            eventTypes: ['delete'] // Invalid - only add/update allowed
          }
        }
      ]
    })
    expect(result.success).toBe(false)
  })
})

describe('WEBHOOK_TOOLS', () => {
  it('exports tool definitions', () => {
    expect(WEBHOOK_TOOLS.length).toBeGreaterThan(0)
  })

  it('includes grist_manage_webhooks tool', () => {
    const tool = WEBHOOK_TOOLS.find((t) => t.name === 'grist_manage_webhooks')
    expect(tool).toBeDefined()
    expect(tool?.category).toBe('webhooks')
  })

  it('has complete documentation', () => {
    const tool = WEBHOOK_TOOLS[0]
    expect(tool.docs.overview).toBeDefined()
    expect(tool.docs.examples.length).toBeGreaterThan(0)
  })

  it('has handler function', () => {
    expect(typeof WEBHOOK_TOOLS[0].handler).toBe('function')
  })
})
