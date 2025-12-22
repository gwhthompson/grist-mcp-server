/**
 * MCP Integration Tests - grist_manage_webhooks
 *
 * Tests the grist_manage_webhooks tool via MCP protocol.
 * Actions: list, create, update, delete, clear_queue
 * Validates full stack: MCP → Zod validation → Tool → Grist API → Response formatting
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestContext,
  createTestDocument,
  createTestWorkspace,
  getFirstOrg,
  type TestContext
} from '../../helpers/grist-api.js'
import { createMCPTestClient, type MCPTestContext } from '../../helpers/mcp-test-client.js'

describe('grist_manage_webhooks', () => {
  let ctx: MCPTestContext
  let testDocId: string | null = null
  let testWorkspaceId: number | null = null
  let createdWebhookId: string | null = null
  const apiContext: Partial<TestContext> = {}

  beforeAll(async () => {
    ctx = await createMCPTestClient()

    // Use the Grist client directly to create workspace in the right org
    const client = ctx.serverInstance.context.client

    // Get the correct org (example org in Docker setup)
    const orgId = await getFirstOrg(client)

    // Create a dedicated test workspace (not personal workspace 2)
    testWorkspaceId = await createTestWorkspace(client, orgId)
    apiContext.workspaceId = testWorkspaceId
    apiContext.client = client

    // Create test document using direct API
    testDocId = await createTestDocument(client, testWorkspaceId)
    apiContext.docId = testDocId

    // Create a test table
    const tableResult = await ctx.client.callTool({
      name: 'grist_manage_schema',
      arguments: {
        docId: testDocId,
        operations: [
          {
            action: 'create_table',
            name: 'WebhookTable',
            columns: [
              { colId: 'Name', type: 'Text' },
              { colId: 'Status', type: 'Text' }
            ]
          }
        ],
        response_format: 'json'
      }
    })

    if (tableResult.isError) {
      console.log('Failed to create table:', JSON.stringify(tableResult.content))
    }
  }, 120000)

  afterAll(async () => {
    // Cleanup created webhooks
    if (testDocId && createdWebhookId) {
      try {
        await ctx.client.callTool({
          name: 'grist_manage_webhooks',
          arguments: {
            docId: testDocId,
            operations: [{ action: 'delete', webhookId: createdWebhookId }],
            response_format: 'json'
          }
        })
      } catch {
        // Ignore cleanup errors
      }
    }
    await cleanupTestContext(apiContext)
    await ctx.cleanup()
  })

  // =========================================================================
  // Prerequisite Check
  // =========================================================================

  describe('prerequisite check', () => {
    it('has test document available', () => {
      if (!testDocId) {
        console.warn('No test document available - some tests will be skipped')
      }
    })
  })

  // =========================================================================
  // Action: list
  // =========================================================================

  describe('action: list', () => {
    it('lists webhooks for document', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: testDocId,
          operations: [{ action: 'list' }],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
    })

    it('supports pagination in list', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: testDocId,
          operations: [{ action: 'list', offset: 0, limit: 10 }],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
    })
  })

  // =========================================================================
  // Action: create
  // =========================================================================

  describe('action: create', () => {
    it('creates webhook with required fields', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create',
              fields: {
                url: 'https://webhook.site/test-endpoint',
                tableId: 'WebhookTable',
                eventTypes: ['add', 'update']
              }
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)

      // Store webhook ID for later tests
      if (parsed.results?.[0]?.webhookId) {
        createdWebhookId = parsed.results[0].webhookId
      }
    })

    it('creates webhook with all optional fields', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create',
              fields: {
                url: 'https://webhook.site/test-endpoint-2',
                tableId: 'WebhookTable',
                eventTypes: ['add'],
                name: 'Test Webhook',
                memo: 'Created by test',
                enabled: true
              }
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
    })
  })

  // =========================================================================
  // Action: update
  // =========================================================================

  describe('action: update', () => {
    it('updates webhook fields', async () => {
      if (!testDocId || !createdWebhookId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'update',
              webhookId: createdWebhookId,
              fields: { enabled: false }
            }
          ],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
    })

    it('returns error for non-existent webhook', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'update',
              webhookId: '00000000-0000-0000-0000-000000000000', // Valid UUID format but doesn't exist
              fields: { enabled: false }
            }
          ],
          response_format: 'json'
        }
      })

      // Batch tools return partial failure as success=false in content, not isError=true
      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(false)
      expect(parsed.partialFailure).toBeDefined()
    })
  })

  // =========================================================================
  // Action: delete
  // =========================================================================

  describe('action: delete', () => {
    let webhookToDeleteId: string | null = null

    beforeAll(async () => {
      if (!testDocId) return

      // Create a webhook to delete
      const createResult = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'create',
              fields: {
                url: 'https://webhook.site/delete-test',
                tableId: 'WebhookTable',
                eventTypes: ['add']
              }
            }
          ],
          response_format: 'json'
        }
      })

      if (!createResult.isError) {
        const createText = (createResult.content[0] as { text: string }).text
        const createParsed = JSON.parse(createText)
        webhookToDeleteId = createParsed.results?.[0]?.webhookId ?? null
      }
    })

    it('deletes webhook', async () => {
      if (!testDocId || !webhookToDeleteId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: testDocId,
          operations: [{ action: 'delete', webhookId: webhookToDeleteId }],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
    })

    it('returns error for non-existent webhook', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: testDocId,
          operations: [
            {
              action: 'delete',
              webhookId: '00000000-0000-0000-0000-000000000000'
            }
          ],
          response_format: 'json'
        }
      })

      // Batch tools return partial failure as success=false in content, not isError=true
      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(false)
      expect(parsed.partialFailure).toBeDefined()
    })
  })

  // =========================================================================
  // Action: clear_queue
  // =========================================================================

  describe('action: clear_queue', () => {
    it('clears webhook queue successfully', async () => {
      if (!testDocId) return

      // clear_queue is a document-level operation (no webhookId needed)
      // It clears all pending payloads for all webhooks in the document
      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: testDocId,
          operations: [{ action: 'clear_queue' }],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
    })

    it('rejects clear_queue with other operations', async () => {
      if (!testDocId) return

      // clear_queue must be the only operation (schema constraint)
      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: testDocId,
          operations: [{ action: 'clear_queue' }, { action: 'list' }],
          response_format: 'json'
        }
      })

      // Schema validation should reject this combination
      expect(result.isError).toBe(true)
    })
  })

  // =========================================================================
  // Response Format
  // =========================================================================

  describe('response format', () => {
    it('returns json format correctly', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: testDocId,
          operations: [{ action: 'list' }],
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      expect(() => JSON.parse(text)).not.toThrow()
    })

    it('returns markdown format correctly', async () => {
      if (!testDocId) return

      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: testDocId,
          operations: [{ action: 'list' }],
          response_format: 'markdown'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      expect(text).toMatch(/[#*-]|webhook|success/i)
    })
  })

  // =========================================================================
  // Schema Validation
  // =========================================================================

  describe('schema validation', () => {
    it('rejects missing required docId', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          operations: [{ action: 'list' }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects missing required operations', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: 'abcdefghij1234567890ab'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects empty operations array', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: []
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid action type', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [{ action: 'invalid' }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid docId format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: 'invalid!',
          operations: [{ action: 'list' }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid webhookId format (not UUID)', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [{ action: 'delete', webhookId: 'not-a-uuid' }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid response_format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [{ action: 'list' }],
          response_format: 'invalid'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects create without required fields', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [{ action: 'create', fields: {} }]
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid event types', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_manage_webhooks',
        arguments: {
          docId: 'abcdefghij1234567890ab',
          operations: [
            {
              action: 'create',
              fields: {
                url: 'https://webhook.site/test',
                tableId: 'Test',
                eventTypes: ['invalid_event']
              }
            }
          ]
        }
      })

      expect(result.isError).toBe(true)
    })
  })
})
