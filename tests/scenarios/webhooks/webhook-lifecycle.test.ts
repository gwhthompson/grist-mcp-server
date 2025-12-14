/**
 * Webhook Management Integration Tests
 *
 * Comprehensive integration tests for webhook operations:
 * - grist_manage_webhooks (list, create, update, delete, clear_queue)
 *
 * These tests run against a live Docker Grist instance.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as webhooks from '../../../src/tools/webhooks.js'
import { ensureGristReady } from '../../helpers/docker.js'
import {
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../../helpers/grist-api.js'

describe('Webhook Management - Integration Tests', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>
  const createdWebhookIds: string[] = []

  beforeAll(async () => {
    await ensureGristReady()

    // Create base test context with a table for webhook testing
    context = await createFullTestContext(client, {
      workspaceName: 'Webhook Test Workspace',
      docName: 'Webhook Test Document',
      tableName: 'TestTable',
      columns: [
        { colId: 'Name', type: 'Text', label: 'Name' },
        { colId: 'Email', type: 'Text', label: 'Email' },
        { colId: 'Status', type: 'Choice', label: 'Status' }
      ]
    })
  }, 60000)

  afterAll(async () => {
    // Clean up all created webhooks
    for (const webhookId of createdWebhookIds) {
      try {
        await webhooks.manageWebhooks(context.toolContext, {
          docId: context.docId,
          operation: {
            action: 'delete',
            webhookId
          },
          response_format: 'json'
        })
      } catch {
        // Ignore errors during cleanup
      }
    }

    if (context) {
      await cleanupTestContext(context)
    }
  }, 60000)

  describe('List Webhooks', () => {
    it('should list all webhooks for a document (initially empty)', async () => {
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'list'
        },
        response_format: 'json'
      })

      expect(result.structuredContent).toBeDefined()
      expect(result.structuredContent.docId).toBe(context.docId)
      expect(result.structuredContent.webhookCount).toBeGreaterThanOrEqual(0)
      expect(result.structuredContent.webhooks).toBeInstanceOf(Array)
    })

    it('should return markdown format when requested', async () => {
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'list'
        },
        response_format: 'markdown'
      })

      expect(result.content).toBeDefined()
      expect(result.content[0]).toHaveProperty('type', 'text')
      expect(typeof result.content[0].text).toBe('string')
    })
  })

  describe('Create Webhook', () => {
    it('should create a new webhook with all fields', async () => {
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'create',
          fields: {
            name: 'Test Webhook',
            memo: 'Integration test webhook',
            url: 'https://webhook.site/test-webhook',
            tableId: context.tableId,
            eventTypes: ['add', 'update'],
            enabled: true,
            isReadyColumn: null
          }
        },
        response_format: 'json'
      })

      expect(result.structuredContent).toBeDefined()
      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.webhookId).toBeDefined()
      expect(typeof result.structuredContent.webhookId).toBe('string')
      expect(result.structuredContent.webhookUrl).toBe('https://webhook.site/test-webhook')
      expect(result.structuredContent.tableId).toBe(context.tableId)

      // Store for cleanup
      createdWebhookIds.push(result.structuredContent.webhookId as string)
    })

    it('should create a webhook with minimal fields', async () => {
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'create',
          fields: {
            url: 'https://example.com/minimal-webhook',
            tableId: context.tableId,
            eventTypes: ['add']
          }
        },
        response_format: 'json'
      })

      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.webhookId).toBeDefined()

      createdWebhookIds.push(result.structuredContent.webhookId as string)
    })

    it('should create a webhook for only update events', async () => {
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'create',
          fields: {
            url: 'https://example.com/update-only',
            tableId: context.tableId,
            eventTypes: ['update'],
            enabled: true
          }
        },
        response_format: 'json'
      })

      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.eventTypes).toEqual(['update'])

      createdWebhookIds.push(result.structuredContent.webhookId as string)
    })

    it('should handle non-existent table', async () => {
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'create',
          fields: {
            url: 'https://webhook.site/test',
            tableId: 'NonExistentTable',
            eventTypes: ['add']
          }
        },
        response_format: 'json'
      })

      // This might succeed in creation but fail on delivery
      // or it might error immediately depending on Grist version
      expect(result.structuredContent).toBeDefined()
    })
  })

  describe('Update Webhook', () => {
    let webhookId: string

    beforeAll(async () => {
      // Create a webhook to update
      const createResult = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'create',
          fields: {
            name: 'Webhook to Update',
            url: 'https://example.com/original',
            tableId: context.tableId,
            eventTypes: ['add'],
            enabled: true
          }
        },
        response_format: 'json'
      })

      webhookId = createResult.structuredContent.webhookId as string
      createdWebhookIds.push(webhookId)
    })

    it('should update webhook URL', async () => {
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'update',
          webhookId,
          fields: {
            url: 'https://example.com/updated'
          }
        },
        response_format: 'json'
      })

      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.webhookId).toBe(webhookId)
      expect(result.structuredContent.fieldsUpdated).toContain('url')
    })

    it('should disable a webhook', async () => {
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'update',
          webhookId,
          fields: {
            enabled: false
          }
        },
        response_format: 'json'
      })

      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.fieldsUpdated).toContain('enabled')
    })

    it('should update multiple fields at once', async () => {
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'update',
          webhookId,
          fields: {
            name: 'Updated Webhook Name',
            memo: 'Updated memo',
            enabled: true
          }
        },
        response_format: 'json'
      })

      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.fieldsUpdated).toEqual(
        expect.arrayContaining(['name', 'memo', 'enabled'])
      )
    })

    it('should handle non-existent webhook ID (valid UUID format)', async () => {
      // Use a valid UUID format that doesn't exist
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'update',
          webhookId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          fields: {
            enabled: false
          }
        },
        response_format: 'json'
      })

      expect(result).toHaveErrorResponse(/not found|404|does not exist/i)
    })
  })

  describe('Delete Webhook', () => {
    it('should delete a webhook successfully', async () => {
      // Create a webhook to delete
      const createResult = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'create',
          fields: {
            name: 'Webhook to Delete',
            url: 'https://example.com/to-delete',
            tableId: context.tableId,
            eventTypes: ['add']
          }
        },
        response_format: 'json'
      })

      const webhookId = createResult.structuredContent.webhookId as string

      // Delete the webhook
      const deleteResult = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'delete',
          webhookId
        },
        response_format: 'json'
      })

      expect(deleteResult.structuredContent.success).toBe(true)
      expect(deleteResult.structuredContent.webhookId).toBe(webhookId)

      // Verify it's deleted by listing webhooks
      const listResult = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'list'
        },
        response_format: 'json'
      })

      const webhookIds = (listResult.structuredContent.webhooks as Array<{ id: string }>).map(
        (w) => w.id
      )
      expect(webhookIds).not.toContain(webhookId)
    })

    it('should handle non-existent webhook deletion (valid UUID format)', async () => {
      // Use a valid UUID format that doesn't exist
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'delete',
          webhookId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        },
        response_format: 'json'
      })

      expect(result).toHaveErrorResponse(/not found|404|does not exist/i)
    })
  })

  describe('Clear Webhook Queue', () => {
    it('should clear webhook queue successfully', async () => {
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'clear_queue'
        },
        response_format: 'json'
      })

      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.docId).toBe(context.docId)
      expect(result.structuredContent.action).toBe('cleared_webhook_queue')
    })

    it('should return markdown format for clear queue', async () => {
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'clear_queue'
        },
        response_format: 'markdown'
      })

      expect(result.content[0].text).toContain('Successfully cleared webhook queue')
    })
  })

  describe('Complete Webhook Lifecycle', () => {
    it('should create, list, update, and delete a webhook', async () => {
      // 1. Create webhook
      const createResult = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'create',
          fields: {
            name: 'Lifecycle Test Webhook',
            url: 'https://example.com/lifecycle',
            tableId: context.tableId,
            eventTypes: ['add', 'update'],
            enabled: true
          }
        },
        response_format: 'json'
      })

      expect(createResult.structuredContent.success).toBe(true)
      const webhookId = createResult.structuredContent.webhookId as string

      // 2. List and verify webhook exists
      const listResult1 = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'list'
        },
        response_format: 'json'
      })

      const webhook = (listResult1.structuredContent.webhooks as Array<{ id: string }>).find(
        (w) => w.id === webhookId
      )
      expect(webhook).toBeDefined()

      // 3. Update webhook
      const updateResult = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'update',
          webhookId,
          fields: {
            name: 'Updated Lifecycle Webhook',
            enabled: false
          }
        },
        response_format: 'json'
      })

      expect(updateResult.structuredContent.success).toBe(true)

      // 4. Delete webhook
      const deleteResult = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'delete',
          webhookId
        },
        response_format: 'json'
      })

      expect(deleteResult.structuredContent.success).toBe(true)

      // 5. Verify webhook is gone
      const listResult2 = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'list'
        },
        response_format: 'json'
      })

      const deletedWebhook = (listResult2.structuredContent.webhooks as Array<{ id: string }>).find(
        (w) => w.id === webhookId
      )
      expect(deletedWebhook).toBeUndefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid document ID', async () => {
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: 'NonExistentDoc123456AB', // Valid Base58 format (22 chars) but doesn't exist
        operation: {
          action: 'list'
        },
        response_format: 'json'
      })

      expect(result).toHaveErrorResponse(/not found|404|does not exist/i)
    })

    it('should validate event types', async () => {
      await expect(
        webhooks.manageWebhooks(context.toolContext, {
          docId: context.docId,
          operation: {
            action: 'create',
            fields: {
              url: 'https://example.com/invalid',
              tableId: context.tableId,
              // @ts-expect-error Testing invalid event type
              eventTypes: ['invalid-event']
            }
          },
          response_format: 'json'
        })
      ).rejects.toThrow(/add|update|event type/i)
    })
  })

  describe('Enhanced Schema Validation', () => {
    it('should reject invalid UUID format for webhookId', async () => {
      await expect(
        webhooks.manageWebhooks(context.toolContext, {
          docId: context.docId,
          operation: {
            action: 'delete',
            // @ts-expect-error Testing invalid UUID
            webhookId: 'not-a-valid-uuid'
          },
          response_format: 'json'
        })
      ).rejects.toThrow(/UUID|webhook.*ID/i)
    })

    it('should reject localhost URLs', async () => {
      await expect(
        webhooks.manageWebhooks(context.toolContext, {
          docId: context.docId,
          operation: {
            action: 'create',
            fields: {
              url: 'http://localhost:3000/webhook',
              tableId: context.tableId,
              eventTypes: ['add']
            }
          },
          response_format: 'json'
        })
      ).rejects.toThrow(/localhost|private|publicly accessible/i)
    })

    it('should reject private IP addresses', async () => {
      await expect(
        webhooks.manageWebhooks(context.toolContext, {
          docId: context.docId,
          operation: {
            action: 'create',
            fields: {
              url: 'http://192.168.1.1/webhook',
              tableId: context.tableId,
              eventTypes: ['add']
            }
          },
          response_format: 'json'
        })
      ).rejects.toThrow(/private|publicly accessible|192\.168/i)
    })

    it('should trim whitespace from URLs', async () => {
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'create',
          fields: {
            url: '  https://webhook.site/test  ',
            tableId: context.tableId,
            eventTypes: ['add'],
            name: 'Trimmed URL Test'
          }
        },
        response_format: 'json'
      })

      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.webhookUrl).toBe('https://webhook.site/test')

      // Clean up
      if (result.structuredContent.webhookId) {
        createdWebhookIds.push(result.structuredContent.webhookId as string)
      }
    })

    it('should reject duplicate event types', async () => {
      await expect(
        webhooks.manageWebhooks(context.toolContext, {
          docId: context.docId,
          operation: {
            action: 'create',
            fields: {
              url: 'https://webhook.site/test',
              tableId: context.tableId,
              // @ts-expect-error Testing duplicate event types
              eventTypes: ['add', 'add', 'update']
            }
          },
          response_format: 'json'
        })
      ).rejects.toThrow(/unique|duplicate/i)
    })

    it('should reject empty event types array', async () => {
      await expect(
        webhooks.manageWebhooks(context.toolContext, {
          docId: context.docId,
          operation: {
            action: 'create',
            fields: {
              url: 'https://webhook.site/test',
              tableId: context.tableId,
              // @ts-expect-error Testing empty event types
              eventTypes: []
            }
          },
          response_format: 'json'
        })
      ).rejects.toThrow(/at least one|event type/i)
    })

    it('should reject invalid isReadyColumn format', async () => {
      await expect(
        webhooks.manageWebhooks(context.toolContext, {
          docId: context.docId,
          operation: {
            action: 'create',
            fields: {
              url: 'https://webhook.site/test',
              tableId: context.tableId,
              eventTypes: ['add'],
              isReadyColumn: '123InvalidStart' // Must start with letter or underscore
            }
          },
          response_format: 'json'
        })
      ).rejects.toThrow(/Python identifier|column/i)
    })

    it('should reject oversized webhook name', async () => {
      await expect(
        webhooks.manageWebhooks(context.toolContext, {
          docId: context.docId,
          operation: {
            action: 'create',
            fields: {
              url: 'https://webhook.site/test',
              tableId: context.tableId,
              eventTypes: ['add'],
              name: 'x'.repeat(256) // Max is 255
            }
          },
          response_format: 'json'
        })
      ).rejects.toThrow(/255 characters/i)
    })

    it('should reject update with no fields', async () => {
      await expect(
        webhooks.manageWebhooks(context.toolContext, {
          docId: context.docId,
          operation: {
            action: 'update',
            webhookId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            // @ts-expect-error Testing empty fields
            fields: {}
          },
          response_format: 'json'
        })
      ).rejects.toThrow(/at least one field/i)
    })

    it('should reject malformed URLs', async () => {
      await expect(
        webhooks.manageWebhooks(context.toolContext, {
          docId: context.docId,
          operation: {
            action: 'create',
            fields: {
              url: 'not-a-valid-url',
              tableId: context.tableId,
              eventTypes: ['add']
            }
          },
          response_format: 'json'
        })
      ).rejects.toThrow(/valid URL/i)
    })

    it('should reject URLs longer than 2000 characters', async () => {
      const longUrl = `https://example.com/${'a'.repeat(2000)}`
      await expect(
        webhooks.manageWebhooks(context.toolContext, {
          docId: context.docId,
          operation: {
            action: 'create',
            fields: {
              url: longUrl,
              tableId: context.tableId,
              eventTypes: ['add']
            }
          },
          response_format: 'json'
        })
      ).rejects.toThrow(/2000 characters/i)
    })

    it('should handle webhook names with Unicode characters', async () => {
      const result = await webhooks.manageWebhooks(context.toolContext, {
        docId: context.docId,
        operation: {
          action: 'create',
          fields: {
            name: '🎉 Sales Alert 中文 مرحبا',
            url: 'https://webhook.site/unicode-test',
            tableId: context.tableId,
            eventTypes: ['add']
          }
        },
        response_format: 'json'
      })

      const webhookId = result.structuredContent.webhookId as string
      createdWebhookIds.push(webhookId)

      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.webhookId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    })

    it('should reject SQL keywords in isReadyColumn', async () => {
      const sqlKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'WHERE']

      for (const keyword of sqlKeywords) {
        await expect(
          webhooks.manageWebhooks(context.toolContext, {
            docId: context.docId,
            operation: {
              action: 'create',
              fields: {
                url: 'https://webhook.site/sql-test',
                tableId: context.tableId,
                eventTypes: ['add'],
                isReadyColumn: keyword
              }
            },
            response_format: 'json'
          })
        ).rejects.toThrow(/SQL reserved keyword/i)
      }
    })

    it('should enforce isReadyColumn length limit', async () => {
      const longColumnId = 'A'.repeat(65)

      await expect(
        webhooks.manageWebhooks(context.toolContext, {
          docId: context.docId,
          operation: {
            action: 'create',
            fields: {
              url: 'https://webhook.site/long-column',
              tableId: context.tableId,
              eventTypes: ['add'],
              isReadyColumn: longColumnId
            }
          },
          response_format: 'json'
        })
      ).rejects.toThrow(/64 characters or less/i)
    })
  })
})
