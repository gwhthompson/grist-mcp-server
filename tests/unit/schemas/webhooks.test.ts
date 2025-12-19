import { describe, expect, it } from 'vitest'
import {
  ClearQueueOperationSchema,
  CreateWebhookOperationSchema,
  DeleteWebhookOperationSchema,
  ListWebhooksOperationSchema,
  ManageWebhooksSchema,
  UpdateWebhookOperationSchema,
  WebhookColumnIdSchema,
  WebhookEventTypeSchema,
  WebhookFieldsSchema,
  WebhookIdSchema,
  WebhookOperationSchema,
  WebhookUrlSchema
} from '../../../src/schemas/webhooks.js'

describe('WebhookIdSchema', () => {
  it('accepts valid UUID', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    expect(WebhookIdSchema.parse(uuid)).toBe(uuid)
  })

  it('accepts uppercase UUID', () => {
    const uuid = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890'
    expect(WebhookIdSchema.parse(uuid)).toBe(uuid)
  })

  it('rejects invalid UUID', () => {
    expect(() => WebhookIdSchema.parse('not-a-uuid')).toThrow()
    expect(() => WebhookIdSchema.parse('')).toThrow()
    expect(() => WebhookIdSchema.parse('12345')).toThrow()
  })
})

describe('WebhookUrlSchema', () => {
  it('accepts valid HTTPS URL', () => {
    const url = 'https://example.com/webhook'
    expect(WebhookUrlSchema.parse(url)).toBe(url)
  })

  it('accepts valid HTTP URL', () => {
    const url = 'http://example.com/webhook'
    expect(WebhookUrlSchema.parse(url)).toBe(url)
  })

  it('trims whitespace', () => {
    expect(WebhookUrlSchema.parse('  https://example.com/webhook  ')).toBe(
      'https://example.com/webhook'
    )
  })

  it('rejects localhost URLs', () => {
    expect(() => WebhookUrlSchema.parse('http://localhost/webhook')).toThrow()
    expect(() => WebhookUrlSchema.parse('http://localhost:3000/webhook')).toThrow()
  })

  it('rejects 127.0.0.1 URLs', () => {
    expect(() => WebhookUrlSchema.parse('http://127.0.0.1/webhook')).toThrow()
    expect(() => WebhookUrlSchema.parse('http://127.0.0.1:8080/webhook')).toThrow()
  })

  it('rejects private IP addresses', () => {
    expect(() => WebhookUrlSchema.parse('http://192.168.1.1/webhook')).toThrow()
    expect(() => WebhookUrlSchema.parse('http://10.0.0.1/webhook')).toThrow()
    expect(() => WebhookUrlSchema.parse('http://172.16.0.1/webhook')).toThrow()
    expect(() => WebhookUrlSchema.parse('http://172.31.255.255/webhook')).toThrow()
  })

  it('accepts valid public domain URLs', () => {
    // Verify that non-private domains are accepted
    expect(WebhookUrlSchema.parse('https://api.example.com/webhook')).toBe(
      'https://api.example.com/webhook'
    )
  })

  it('rejects URLs over 2000 characters', () => {
    const longUrl = `https://example.com/${'a'.repeat(2000)}`
    expect(() => WebhookUrlSchema.parse(longUrl)).toThrow()
  })

  it('rejects invalid URLs', () => {
    expect(() => WebhookUrlSchema.parse('not-a-url')).toThrow()
    expect(() => WebhookUrlSchema.parse('ftp://example.com')).toThrow()
  })
})

describe('WebhookColumnIdSchema', () => {
  it('accepts valid column IDs', () => {
    expect(WebhookColumnIdSchema.parse('IsReady')).toBe('IsReady')
    expect(WebhookColumnIdSchema.parse('Status')).toBe('Status')
    expect(WebhookColumnIdSchema.parse('_private')).toBe('_private')
    expect(WebhookColumnIdSchema.parse('Column1')).toBe('Column1')
  })

  it('accepts null and undefined', () => {
    expect(WebhookColumnIdSchema.parse(null)).toBeNull()
    expect(WebhookColumnIdSchema.parse(undefined)).toBeUndefined()
  })

  it('rejects empty string', () => {
    expect(() => WebhookColumnIdSchema.parse('')).toThrow()
  })

  it('rejects invalid identifiers', () => {
    expect(() => WebhookColumnIdSchema.parse('123start')).toThrow()
    expect(() => WebhookColumnIdSchema.parse('with-dash')).toThrow()
    expect(() => WebhookColumnIdSchema.parse('with space')).toThrow()
  })

  it('rejects SQL reserved keywords', () => {
    expect(() => WebhookColumnIdSchema.parse('SELECT')).toThrow()
    expect(() => WebhookColumnIdSchema.parse('select')).toThrow()
    expect(() => WebhookColumnIdSchema.parse('INSERT')).toThrow()
    expect(() => WebhookColumnIdSchema.parse('DELETE')).toThrow()
    expect(() => WebhookColumnIdSchema.parse('DROP')).toThrow()
    expect(() => WebhookColumnIdSchema.parse('WHERE')).toThrow()
  })

  it('rejects column IDs over 64 characters', () => {
    const longId = 'a'.repeat(65)
    expect(() => WebhookColumnIdSchema.parse(longId)).toThrow()
  })
})

describe('WebhookEventTypeSchema', () => {
  it('accepts valid event types', () => {
    expect(WebhookEventTypeSchema.parse('add')).toBe('add')
    expect(WebhookEventTypeSchema.parse('update')).toBe('update')
  })

  it('rejects invalid event types', () => {
    expect(() => WebhookEventTypeSchema.parse('delete')).toThrow()
    expect(() => WebhookEventTypeSchema.parse('create')).toThrow()
    expect(() => WebhookEventTypeSchema.parse('')).toThrow()
  })
})

describe('WebhookFieldsSchema', () => {
  it('accepts valid webhook fields', () => {
    const fields = {
      name: 'My Webhook',
      url: 'https://example.com/webhook',
      eventTypes: ['add', 'update'],
      tableId: 'Users'
    }

    const result = WebhookFieldsSchema.parse(fields)
    expect(result.name).toBe('My Webhook')
    expect(result.url).toBe('https://example.com/webhook')
    expect(result.eventTypes).toEqual(['add', 'update'])
  })

  it('accepts minimal required fields', () => {
    const fields = {
      url: 'https://example.com/webhook',
      eventTypes: ['add'],
      tableId: 'Table1'
    }

    expect(() => WebhookFieldsSchema.parse(fields)).not.toThrow()
  })

  it('accepts optional fields', () => {
    const fields = {
      url: 'https://example.com/webhook',
      eventTypes: ['add'],
      tableId: 'Table1',
      memo: 'Test memo',
      enabled: false,
      isReadyColumn: 'IsApproved'
    }

    const result = WebhookFieldsSchema.parse(fields)
    expect(result.memo).toBe('Test memo')
    expect(result.enabled).toBe(false)
    expect(result.isReadyColumn).toBe('IsApproved')
  })

  it('rejects empty event types', () => {
    const fields = {
      url: 'https://example.com/webhook',
      eventTypes: [],
      tableId: 'Table1'
    }

    expect(() => WebhookFieldsSchema.parse(fields)).toThrow()
  })

  it('rejects duplicate event types', () => {
    const fields = {
      url: 'https://example.com/webhook',
      eventTypes: ['add', 'add'],
      tableId: 'Table1'
    }

    expect(() => WebhookFieldsSchema.parse(fields)).toThrow()
  })

  it('rejects name over 255 characters', () => {
    const fields = {
      name: 'a'.repeat(256),
      url: 'https://example.com/webhook',
      eventTypes: ['add'],
      tableId: 'Table1'
    }

    expect(() => WebhookFieldsSchema.parse(fields)).toThrow()
  })

  it('rejects memo over 1000 characters', () => {
    const fields = {
      url: 'https://example.com/webhook',
      eventTypes: ['add'],
      tableId: 'Table1',
      memo: 'a'.repeat(1001)
    }

    expect(() => WebhookFieldsSchema.parse(fields)).toThrow()
  })
})

describe('Operation Schemas', () => {
  describe('ListWebhooksOperationSchema', () => {
    it('accepts list action', () => {
      const result = ListWebhooksOperationSchema.parse({ action: 'list' })
      expect(result.action).toBe('list')
    })

    it('accepts pagination options', () => {
      const result = ListWebhooksOperationSchema.parse({
        action: 'list',
        offset: 10,
        limit: 50
      })
      expect(result.offset).toBe(10)
      expect(result.limit).toBe(50)
    })

    it('rejects invalid limit', () => {
      expect(() =>
        ListWebhooksOperationSchema.parse({
          action: 'list',
          limit: 0
        })
      ).toThrow()

      expect(() =>
        ListWebhooksOperationSchema.parse({
          action: 'list',
          limit: 1001
        })
      ).toThrow()
    })

    it('rejects negative offset', () => {
      expect(() =>
        ListWebhooksOperationSchema.parse({
          action: 'list',
          offset: -1
        })
      ).toThrow()
    })
  })

  describe('CreateWebhookOperationSchema', () => {
    it('accepts create action with fields', () => {
      const result = CreateWebhookOperationSchema.parse({
        action: 'create',
        fields: {
          url: 'https://example.com/webhook',
          eventTypes: ['add'],
          tableId: 'Users'
        }
      })
      expect(result.action).toBe('create')
      expect(result.fields.tableId).toBe('Users')
    })

    it('rejects create without fields', () => {
      expect(() =>
        CreateWebhookOperationSchema.parse({
          action: 'create'
        })
      ).toThrow()
    })
  })

  describe('UpdateWebhookOperationSchema', () => {
    it('accepts update action', () => {
      const result = UpdateWebhookOperationSchema.parse({
        action: 'update',
        webhookId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        fields: {
          enabled: false
        }
      })
      expect(result.action).toBe('update')
      expect(result.fields.enabled).toBe(false)
    })

    it('rejects update with empty fields', () => {
      expect(() =>
        UpdateWebhookOperationSchema.parse({
          action: 'update',
          webhookId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          fields: {}
        })
      ).toThrow()
    })
  })

  describe('DeleteWebhookOperationSchema', () => {
    it('accepts delete action', () => {
      const result = DeleteWebhookOperationSchema.parse({
        action: 'delete',
        webhookId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      })
      expect(result.action).toBe('delete')
    })

    it('rejects invalid webhook ID', () => {
      expect(() =>
        DeleteWebhookOperationSchema.parse({
          action: 'delete',
          webhookId: 'invalid'
        })
      ).toThrow()
    })
  })

  describe('ClearQueueOperationSchema', () => {
    it('accepts clear_queue action', () => {
      const result = ClearQueueOperationSchema.parse({ action: 'clear_queue' })
      expect(result.action).toBe('clear_queue')
    })
  })
})

describe('WebhookOperationSchema', () => {
  it('parses list operation', () => {
    const result = WebhookOperationSchema.parse({ action: 'list' })
    expect(result.action).toBe('list')
  })

  it('parses JSON string', () => {
    const result = WebhookOperationSchema.parse('{"action":"list"}')
    expect(result.action).toBe('list')
  })

  it('handles discriminated union correctly', () => {
    const create = WebhookOperationSchema.parse({
      action: 'create',
      fields: {
        url: 'https://example.com/webhook',
        eventTypes: ['add'],
        tableId: 'Table1'
      }
    })
    expect(create.action).toBe('create')

    const update = WebhookOperationSchema.parse({
      action: 'update',
      webhookId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      fields: { enabled: true }
    })
    expect(update.action).toBe('update')
  })
})

describe('ManageWebhooksSchema', () => {
  const validDocId = 'nwUhGmQzNjLJFyPpfn3Qrh'

  it('accepts valid input', () => {
    const input = {
      docId: validDocId,
      operations: [{ action: 'list' }]
    }

    const result = ManageWebhooksSchema.parse(input)
    expect(result.docId).toBe(validDocId)
    expect(result.operations).toHaveLength(1)
  })

  it('accepts multiple operations', () => {
    const input = {
      docId: validDocId,
      operations: [
        {
          action: 'create',
          fields: {
            url: 'https://example.com/webhook1',
            eventTypes: ['add'],
            tableId: 'Table1'
          }
        },
        {
          action: 'create',
          fields: {
            url: 'https://example.com/webhook2',
            eventTypes: ['update'],
            tableId: 'Table2'
          }
        }
      ]
    }

    const result = ManageWebhooksSchema.parse(input)
    expect(result.operations).toHaveLength(2)
  })

  it('rejects list with other operations', () => {
    const input = {
      docId: validDocId,
      operations: [
        { action: 'list' },
        {
          action: 'create',
          fields: {
            url: 'https://example.com/webhook',
            eventTypes: ['add'],
            tableId: 'Table1'
          }
        }
      ]
    }

    expect(() => ManageWebhooksSchema.parse(input)).toThrow()
  })

  it('rejects clear_queue with other operations', () => {
    const input = {
      docId: validDocId,
      operations: [
        { action: 'clear_queue' },
        {
          action: 'delete',
          webhookId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        }
      ]
    }

    expect(() => ManageWebhooksSchema.parse(input)).toThrow()
  })

  it('rejects empty operations array', () => {
    const input = {
      docId: validDocId,
      operations: []
    }

    expect(() => ManageWebhooksSchema.parse(input)).toThrow()
  })

  it('rejects more than 10 operations', () => {
    const input = {
      docId: validDocId,
      operations: Array(11)
        .fill(null)
        .map(() => ({
          action: 'create',
          fields: {
            url: 'https://example.com/webhook',
            eventTypes: ['add'],
            tableId: 'Table1'
          }
        }))
    }

    expect(() => ManageWebhooksSchema.parse(input)).toThrow()
  })
})
