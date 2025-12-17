/**
 * MCP Integration Tests - grist_create_document
 *
 * Tests the grist_create_document tool via MCP protocol.
 * Validates full stack: MCP → Zod validation → Tool → Grist API → Response formatting
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestWorkspace, getFirstOrg, type TestContext } from '../../helpers/grist-api.js'
import { createMCPTestClient, type MCPTestContext } from '../../helpers/mcp-test-client.js'

describe('grist_create_document', () => {
  let ctx: MCPTestContext
  let testWorkspaceId: number | null = null
  const createdDocIds: string[] = []
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
  }, 60000)

  afterAll(async () => {
    // Clean up created documents and workspace
    const client = apiContext.client
    if (client && testWorkspaceId) {
      // Delete all created documents
      for (const docId of createdDocIds) {
        try {
          await client.deleteDocument(docId)
        } catch {
          // Ignore errors for already deleted docs
        }
      }
      // Delete workspace
      try {
        await client.deleteWorkspace(testWorkspaceId)
      } catch {
        // Ignore workspace cleanup errors
      }
    }
    await ctx.cleanup()
  })

  // =========================================================================
  // Prerequisite Check
  // =========================================================================

  describe('prerequisite check', () => {
    it('has test workspace available', () => {
      if (!testWorkspaceId) {
        console.warn('No test workspace available - some tests will be skipped')
      }
    })
  })

  // =========================================================================
  // Success Cases
  // =========================================================================

  describe('success cases', () => {
    it('creates blank document with name and workspace', async () => {
      if (!testWorkspaceId) return

      const docName = `test-doc-${Date.now()}`

      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          name: docName,
          workspaceId: testWorkspaceId,
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()
      expect(result.content).toBeDefined()
      expect(result.content[0].type).toBe('text')

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
      expect(parsed.docId).toBeDefined()
      expect(parsed.documentName).toBe(docName)
      expect(parsed.workspaceId).toBe(testWorkspaceId)

      createdDocIds.push(parsed.docId)
    })

    it('returns document URL in response', async () => {
      if (!testWorkspaceId) return

      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          name: `test-url-doc-${Date.now()}`,
          workspaceId: testWorkspaceId,
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
      expect(parsed.url).toBeDefined()
      expect(parsed.url).toContain(parsed.docId)

      createdDocIds.push(parsed.docId)
    })
  })

  // =========================================================================
  // Fork Document
  // =========================================================================

  describe('fork document', () => {
    it('creates copy from existing document', async () => {
      if (!testWorkspaceId || createdDocIds.length === 0) return

      const sourceDocId = createdDocIds[0]

      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          name: `forked-doc-${Date.now()}`,
          workspaceId: testWorkspaceId,
          forkFromDocId: sourceDocId,
          response_format: 'json'
        }
      })

      // Debug output if error
      if (result.isError) {
        console.log('Fork document error:', (result.content[0] as { text: string }).text)
      }

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      const parsed = JSON.parse(text)

      expect(parsed.success).toBe(true)
      expect(parsed.docId).toBeDefined()
      // Forked doc should have different ID
      expect(parsed.docId).not.toBe(sourceDocId)

      createdDocIds.push(parsed.docId)
    })

    it('returns error for non-existent source document', async () => {
      if (!testWorkspaceId) return

      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          name: `fork-fail-${Date.now()}`,
          workspaceId: testWorkspaceId,
          forkFromDocId: 'abcdefghij1234567890ab', // Valid format but doesn't exist
          response_format: 'json'
        }
      })

      expect(result.isError).toBe(true)
    })
  })

  // =========================================================================
  // Response Format
  // =========================================================================

  describe('response format', () => {
    it('returns json format correctly', async () => {
      if (!testWorkspaceId) return

      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          name: `json-format-${Date.now()}`,
          workspaceId: testWorkspaceId,
          response_format: 'json'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      expect(() => JSON.parse(text)).not.toThrow()

      const parsed = JSON.parse(text)
      createdDocIds.push(parsed.docId)
    })

    it('returns markdown format correctly', async () => {
      if (!testWorkspaceId) return

      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          name: `markdown-format-${Date.now()}`,
          workspaceId: testWorkspaceId,
          response_format: 'markdown'
        }
      })

      expect(result.isError).toBeFalsy()

      const text = (result.content[0] as { text: string }).text
      expect(text).toMatch(/[#*-]|created|document|success/i)
    })
  })

  // =========================================================================
  // Error Cases
  // =========================================================================

  describe('error cases', () => {
    it('returns error for non-existent workspace', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          name: `fail-doc-${Date.now()}`,
          workspaceId: 999999, // Non-existent workspace
          response_format: 'json'
        }
      })

      expect(result.isError).toBe(true)
    })
  })

  // =========================================================================
  // Schema Validation
  // =========================================================================

  describe('schema validation', () => {
    it('rejects missing required name', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          workspaceId: 1,
          response_format: 'json'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects missing required workspaceId', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          name: 'Test Doc',
          response_format: 'json'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects empty name', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          name: '',
          workspaceId: 1,
          response_format: 'json'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid response_format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          name: 'Test Doc',
          workspaceId: 1,
          response_format: 'invalid'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects invalid forkFromDocId format', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          name: 'Test Doc',
          workspaceId: 1,
          forkFromDocId: 'invalid!'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects forkFromDocId with forbidden characters (0OIl)', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          name: 'Test Doc',
          workspaceId: 1,
          forkFromDocId: '0OIl567890123456789012'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects forkFromDocId with wrong length', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          name: 'Test Doc',
          workspaceId: 1,
          forkFromDocId: 'short'
        }
      })

      expect(result.isError).toBe(true)
    })

    it('rejects name exceeding max length', async () => {
      const result = await ctx.client.callTool({
        name: 'grist_create_document',
        arguments: {
          name: 'x'.repeat(201), // Max is 200
          workspaceId: 1,
          response_format: 'json'
        }
      })

      expect(result.isError).toBe(true)
    })
  })
})
