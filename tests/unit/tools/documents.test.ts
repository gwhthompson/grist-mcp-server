/**
 * Unit tests for documents.ts tool
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../../../src/registry/types.js'
import {
  CREATE_DOCUMENT_TOOL,
  createDocument,
  DOCUMENT_TOOLS
} from '../../../src/tools/documents.js'

describe('grist_create_document', () => {
  let context: ToolContext
  let mockClient: {
    post: ReturnType<typeof vi.fn>
    getBaseUrl: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockClient = {
      post: vi.fn(),
      getBaseUrl: vi.fn().mockReturnValue('https://grist.example.com')
    }
    context = {
      client: mockClient as unknown as ToolContext['client'],
      schemaCache: {} as ToolContext['schemaCache']
    }
  })

  describe('execute', () => {
    it('creates a new document', async () => {
      mockClient.post.mockResolvedValue('newDocId123')

      const result = await CREATE_DOCUMENT_TOOL.handler(context, {
        name: 'My New Document',
        workspaceId: 123
      })

      expect(mockClient.post).toHaveBeenCalledWith('/workspaces/123/docs', {
        name: 'My New Document'
      })
      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.docId).toBe('newDocId123')
      expect(result.structuredContent.documentName).toBe('My New Document')
      expect(result.structuredContent.workspaceId).toBe(123)
      expect(result.structuredContent.url).toBe('https://grist.example.com/doc/newDocId123')
      expect(result.structuredContent.forkedFrom).toBeNull()
    })

    it('forks an existing document', async () => {
      mockClient.post.mockResolvedValue('forkedDocId456')
      // Valid Base58 22-char doc ID
      const sourceDocId = 'aaaaaaaaaaaaaaaaaaaaaa'

      const result = await CREATE_DOCUMENT_TOOL.handler(context, {
        name: 'Forked Document',
        workspaceId: 456,
        forkFromDocId: sourceDocId
      })

      expect(mockClient.post).toHaveBeenCalledWith(`/docs/${sourceDocId}/copy`, {
        workspaceId: 456,
        documentName: 'Forked Document',
        asTemplate: false
      })
      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.docId).toBe('forkedDocId456')
      expect(result.structuredContent.forkedFrom).toBe(sourceDocId)
      expect(result.structuredContent.message).toContain('forked')
    })

    it('handles response as object with id property', async () => {
      mockClient.post.mockResolvedValue({ id: 'objDocId' })

      const result = await CREATE_DOCUMENT_TOOL.handler(context, {
        name: 'Test Doc',
        workspaceId: 100
      })

      expect(result.structuredContent.docId).toBe('objDocId')
    })

    it('handles forked response as object with id property', async () => {
      mockClient.post.mockResolvedValue({ id: 'forkedObjId' })
      // Valid Base58 22-char doc ID
      const sourceDocId = 'bbbbbbbbbbbbbbbbbbbbbb'

      const result = await CREATE_DOCUMENT_TOOL.handler(context, {
        name: 'Forked Doc',
        workspaceId: 100,
        forkFromDocId: sourceDocId
      })

      expect(result.structuredContent.docId).toBe('forkedObjId')
    })

    it('returns nextSteps with helpful suggestions', async () => {
      mockClient.post.mockResolvedValue('doc123')

      const result = await CREATE_DOCUMENT_TOOL.handler(context, {
        name: 'Test',
        workspaceId: 1
      })

      expect(result.structuredContent.nextSteps).toContain(
        'Use grist_get_tables with docId="doc123" to see table structure'
      )
      expect(result.structuredContent.nextSteps).toContain(
        "Use grist_manage_schema with action='create_table' to add tables"
      )
      expect(
        result.structuredContent.nextSteps.some((s: string) =>
          s.includes('https://grist.example.com')
        )
      ).toBe(true)
    })
  })
})

describe('createDocument', () => {
  it('creates tool and executes', async () => {
    const mockClient = {
      post: vi.fn().mockResolvedValue('docId'),
      getBaseUrl: vi.fn().mockReturnValue('https://example.com')
    }
    const context: ToolContext = {
      client: mockClient as unknown as ToolContext['client'],
      schemaCache: {} as ToolContext['schemaCache']
    }

    const result = await createDocument(context, {
      name: 'Test',
      workspaceId: 1
    })

    expect(result.structuredContent.success).toBe(true)
  })
})

describe('DOCUMENT_TOOLS', () => {
  it('exports tool definitions', () => {
    expect(DOCUMENT_TOOLS).toHaveLength(1)
    expect(DOCUMENT_TOOLS[0].name).toBe('grist_create_document')
  })

  it('has complete documentation', () => {
    const tool = DOCUMENT_TOOLS[0]
    expect(tool.docs.overview).toBeDefined()
    expect(tool.docs.examples.length).toBeGreaterThan(0)
    expect(tool.docs.errors.length).toBeGreaterThan(0)
  })

  it('has correct category', () => {
    expect(DOCUMENT_TOOLS[0].category).toBe('documents')
  })

  it('has handler function', () => {
    expect(typeof DOCUMENT_TOOLS[0].handler).toBe('function')
  })
})
