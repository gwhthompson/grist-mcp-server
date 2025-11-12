/**
 * Remaining Tools Integration Tests
 *
 * Comprehensive integration tests for the 4 tools not yet tested:
 * - grist_create_table
 * - grist_rename_table
 * - grist_delete_table
 * - grist_create_document
 *
 * These tests run against a live Docker Grist instance to ensure 100% tool coverage.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  createTestClient,
  createFullTestContext,
  cleanupTestContext,
  addTestRecords
} from './helpers/grist-api.js'
import { ensureGristReady } from './helpers/docker.js'
import * as tables from '../src/tools/tables.js'
import * as documents from '../src/tools/documents.js'
import * as discovery from '../src/tools/discovery.js'
import type { GristClient } from '../src/services/grist-client.js'

describe('Remaining Tools - Complete Integration Tests', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>

  beforeAll(async () => {
    await ensureGristReady()

    // Create base test context
    context = await createFullTestContext(client, {
      workspaceName: 'Remaining Tools Test Workspace',
      docName: 'Remaining Tools Test Document',
      tableName: 'BaseTable',
      columns: [
        { colId: 'A', type: 'Text', label: 'Name' },
        { colId: 'B', type: 'Numeric', label: 'Value' }
      ]
    })
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  describe('grist_create_table', () => {
    it('should create a new table with columns', async () => {
      const result = await tables.createTable(client, {
        docId: context.docId,
        tableName: 'NewTestTable',
        columns: [
          { colId: 'FirstName', type: 'Text', label: 'First Name' },
          { colId: 'LastName', type: 'Text', label: 'Last Name' },
          { colId: 'Age', type: 'Numeric', label: 'Age' }
        ],
        response_format: 'json'
      })

      // Verify response structure
      expect(result.structuredContent).toBeDefined()
      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.table_id).toBe('NewTestTable')
      expect(result.structuredContent.table_name).toBe('NewTestTable')
      expect(result.structuredContent.columns_created).toBe(3)
      expect(result.structuredContent.message).toContain('Successfully created table')

      // Verify the table actually exists by listing tables
      const tablesResult = await discovery.getTables(client, {
        docId: context.docId,
        detail_level: 'names',
        response_format: 'json'
      })

      const tableIds = tablesResult.structuredContent.items.map((t: any) => t.id)
      expect(tableIds).toContain('NewTestTable')
    })

    it('should create an empty table with no columns', async () => {
      const result = await tables.createTable(client, {
        docId: context.docId,
        tableName: 'EmptyTable',
        columns: [],
        response_format: 'json'
      })

      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.table_id).toBe('EmptyTable')
      expect(result.structuredContent.columns_created).toBe(0)
    })

    it('should return markdown format when requested', async () => {
      const result = await tables.createTable(client, {
        docId: context.docId,
        tableName: 'MarkdownTable',
        columns: [{ colId: 'TestCol', type: 'Text' }],
        response_format: 'markdown'
      })

      expect(result.content).toBeDefined()
      expect(result.content[0]).toHaveProperty('type', 'text')
      expect(result.content[0].text).toContain('Successfully created table')
    })

    it('should handle table name validation errors', async () => {
      const result = await tables.createTable(client, {
        docId: context.docId,
        tableName: 'Invalid Table Name!', // Contains special characters
        columns: [],
        response_format: 'json'
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Invalid TableId format|validation/i)
    })

    it('should handle invalid document ID', async () => {
      const result = await tables.createTable(client, {
        docId: 'nonexistent-doc-id',
        tableName: 'TestTable',
        columns: [],
        response_format: 'json'
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/not found|404|does not exist/i)
    })
  })

  describe('grist_rename_table', () => {
    let testTableId: string

    beforeEach(async () => {
      // Create a table to rename in each test
      const createResult = await tables.createTable(client, {
        docId: context.docId,
        tableName: `RenameTestTable_${Date.now()}`,
        columns: [{ colId: 'TestCol', type: 'Text' }],
        response_format: 'json'
      })
      testTableId = createResult.structuredContent.table_id
    })

    it('should rename a table successfully', async () => {
      const newName = `RenamedTable_${Date.now()}`

      const result = await tables.renameTable(client, {
        docId: context.docId,
        tableId: testTableId,
        newTableId: newName,
        response_format: 'json'
      })

      // Verify response
      expect(result.structuredContent).toBeDefined()
      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.old_table_id).toBe(testTableId)
      expect(result.structuredContent.new_table_id).toBe(newName)
      expect(result.structuredContent.message).toContain('Successfully renamed table')

      // Verify the table exists with new name
      const tablesResult = await discovery.getTables(client, {
        docId: context.docId,
        detail_level: 'names',
        response_format: 'json'
      })

      const tableIds = tablesResult.structuredContent.items.map((t: any) => t.id)
      expect(tableIds).toContain(newName)
      expect(tableIds).not.toContain(testTableId) // Old name should not exist
    })

    it('should return markdown format when requested', async () => {
      const newName = `RenamedMarkdown_${Date.now()}`

      const result = await tables.renameTable(client, {
        docId: context.docId,
        tableId: testTableId,
        newTableId: newName,
        response_format: 'markdown'
      })

      expect(result.content).toBeDefined()
      expect(result.content[0]).toHaveProperty('type', 'text')
      expect(result.content[0].text).toContain('Successfully renamed table')
    })

    it('should handle non-existent table', async () => {
      const result = await tables.renameTable(client, {
        docId: context.docId,
        tableId: 'NonExistentTable',
        newTableId: 'NewName',
        response_format: 'json'
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toBeDefined()
    })

    it('should handle invalid new table name', async () => {
      const result = await tables.renameTable(client, {
        docId: context.docId,
        tableId: testTableId,
        newTableId: 'Invalid Name!', // Special characters
        response_format: 'json'
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/Invalid TableId format|Invalid value for parameter|validation/i)
    })
  })

  describe('grist_delete_table', () => {
    let testTableId: string

    beforeEach(async () => {
      // Create a table to delete in each test
      const createResult = await tables.createTable(client, {
        docId: context.docId,
        tableName: `DeleteTestTable_${Date.now()}`,
        columns: [
          { colId: 'Col1', type: 'Text' },
          { colId: 'Col2', type: 'Numeric' }
        ],
        response_format: 'json'
      })
      testTableId = createResult.structuredContent.table_id

      // Add some test data to verify it gets deleted
      await addTestRecords(client, context.docId, testTableId, [
        { fields: { Col1: 'Test1', Col2: 100 } },
        { fields: { Col1: 'Test2', Col2: 200 } }
      ])
    })

    it('should delete a table successfully', async () => {
      const result = await tables.deleteTable(client, {
        docId: context.docId,
        tableId: testTableId,
        response_format: 'json'
      })

      // Verify response
      expect(result.structuredContent).toBeDefined()
      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.table_id).toBe(testTableId)
      expect(result.structuredContent.message).toContain('Successfully deleted table')
      expect(result.structuredContent.warning).toContain('CANNOT BE UNDONE')

      // Verify the table no longer exists
      const tablesResult = await discovery.getTables(client, {
        docId: context.docId,
        detail_level: 'names',
        response_format: 'json'
      })

      const tableIds = tablesResult.structuredContent.items.map((t: any) => t.id)
      expect(tableIds).not.toContain(testTableId)
    })

    it('should return markdown format when requested', async () => {
      const result = await tables.deleteTable(client, {
        docId: context.docId,
        tableId: testTableId,
        response_format: 'markdown'
      })

      expect(result.content).toBeDefined()
      expect(result.content[0]).toHaveProperty('type', 'text')
      expect(result.content[0].text).toContain('Successfully deleted table')
      expect(result.content[0].text).toContain('CANNOT BE UNDONE')
    })

    it('should handle non-existent table', async () => {
      const result = await tables.deleteTable(client, {
        docId: context.docId,
        tableId: 'NonExistentTable',
        response_format: 'json'
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toBeDefined()
    })

    it('should handle invalid document ID', async () => {
      const result = await tables.deleteTable(client, {
        docId: 'invalid-doc-id',
        tableId: testTableId,
        response_format: 'json'
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/not found|404|does not exist/i)
    })
  })

  describe('grist_create_document', () => {
    let createdDocIds: string[] = []

    afterAll(async () => {
      // Clean up all created documents
      for (const docId of createdDocIds) {
        try {
          await client.delete(`/docs/${docId}`)
        } catch (error) {
          // Ignore cleanup errors
          console.warn(`Failed to clean up document ${docId}:`, error)
        }
      }
    })

    it('should create a new blank document', async () => {
      const docName = `Test Document ${Date.now()}`

      const result = await documents.createDocument(client, {
        name: docName,
        workspaceId: context.workspaceId,  // WorkspaceId is a number (branded type)
        response_format: 'json'
      })

      // Track for cleanup
      createdDocIds.push(result.structuredContent.document_id)

      // Verify response
      expect(result.structuredContent).toBeDefined()
      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.document_id).toBeDefined()
      expect(result.structuredContent.document_name).toBe(docName)
      expect(result.structuredContent.workspace_id).toBe(context.workspaceId)  // Number, not string
      expect(result.structuredContent.forked_from).toBeNull()
      expect(result.structuredContent.message).toContain('Successfully created new document')
      expect(result.structuredContent.url).toContain('/doc/')
      expect(result.structuredContent.next_steps).toBeInstanceOf(Array)
      expect(result.structuredContent.next_steps.length).toBeGreaterThan(0)

      // Verify the document exists by listing documents
      const docsResult = await discovery.getDocuments(client, {
        workspaceId: context.workspaceId,  // WorkspaceId is a number
        detail_level: 'summary',
        response_format: 'json'
      })

      const docIds = docsResult.structuredContent.items.map((d: any) => d.id)
      expect(docIds).toContain(result.structuredContent.document_id)
    })

    it('should create a forked document', async () => {
      const forkedDocName = `Forked Document ${Date.now()}`

      const result = await documents.createDocument(client, {
        name: forkedDocName,
        workspaceId: context.workspaceId,  // WorkspaceId is a number (branded type)
        forkFromDocId: context.docId, // Fork from our test document
        response_format: 'json'
      })

      // Track for cleanup
      createdDocIds.push(result.structuredContent.document_id)

      // Verify response
      expect(result.structuredContent.success).toBe(true)
      expect(result.structuredContent.document_id).toBeDefined()
      expect(result.structuredContent.forked_from).toBe(context.docId)
      expect(result.structuredContent.message).toContain('Successfully forked document')

      // Verify the forked document has the same tables as the source
      const sourceTables = await discovery.getTables(client, {
        docId: context.docId,
        detail_level: 'names',
        response_format: 'json'
      })

      const forkedTables = await discovery.getTables(client, {
        docId: result.structuredContent.document_id,
        detail_level: 'names',
        response_format: 'json'
      })

      expect(forkedTables.structuredContent.items.length).toBeGreaterThan(0)
      // The forked document should have at least some tables
      expect(forkedTables.structuredContent.items.length).toBeGreaterThanOrEqual(
        sourceTables.structuredContent.items.length
      )
    })

    it('should return markdown format when requested', async () => {
      const docName = `Markdown Doc ${Date.now()}`

      const result = await documents.createDocument(client, {
        name: docName,
        workspaceId: context.workspaceId,
        response_format: 'markdown'
      })

      // Track for cleanup
      createdDocIds.push(result.structuredContent.document_id)

      expect(result.content).toBeDefined()
      expect(result.content[0]).toHaveProperty('type', 'text')
      expect(result.content[0].text).toContain('Successfully created new document')
    })

    it('should handle invalid workspace ID', async () => {
      const result = await documents.createDocument(client, {
        name: 'Test Doc',
        workspaceId: '999999999', // Non-existent workspace
        response_format: 'json'
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toBeDefined()
    })

    it('should handle invalid fork source document ID', async () => {
      const result = await documents.createDocument(client, {
        name: 'Test Fork',
        workspaceId: context.workspaceId,
        forkFromDocId: 'nonexistent-doc-id',
        response_format: 'json'
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toBeDefined()
    })

    it('should handle document name validation', async () => {
      const result = await documents.createDocument(client, {
        name: '', // Empty name - should fail validation
        workspaceId: context.workspaceId,
        response_format: 'json'
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/name|validation|required/i)
    })
  })

  describe('Cross-tool Integration', () => {
    it('should create document, add table, rename it, and delete it', async () => {
      // 1. Create document
      const docResult = await documents.createDocument(client, {
        name: `Integration Test Doc ${Date.now()}`,
        workspaceId: context.workspaceId,
        response_format: 'json'
      })

      const docId = docResult.structuredContent.document_id

      try {
        // 2. Create table
        const tableResult = await tables.createTable(client, {
          docId,
          tableName: 'OriginalTable',
          columns: [{ colId: 'TestCol', type: 'Text', label: 'Test Column' }],
          response_format: 'json'
        })

        expect(tableResult.structuredContent.success).toBe(true)

        // 3. Rename table
        const renameResult = await tables.renameTable(client, {
          docId,
          tableId: 'OriginalTable',
          newTableId: 'RenamedTable',
          response_format: 'json'
        })

        expect(renameResult.structuredContent.success).toBe(true)

        // 4. Verify renamed table exists
        const tablesBeforeDelete = await discovery.getTables(client, {
          docId,
          detail_level: 'names',
          response_format: 'json'
        })

        const tableIdsBeforeDelete = tablesBeforeDelete.structuredContent.items.map((t: any) => t.id)
        expect(tableIdsBeforeDelete).toContain('RenamedTable')

        // 5. Delete table
        const deleteResult = await tables.deleteTable(client, {
          docId,
          tableId: 'RenamedTable',
          response_format: 'json'
        })

        expect(deleteResult.structuredContent.success).toBe(true)

        // 6. Verify table is gone
        const tablesAfterDelete = await discovery.getTables(client, {
          docId,
          detail_level: 'names',
          response_format: 'json'
        })

        const tableIdsAfterDelete = tablesAfterDelete.structuredContent.items.map((t: any) => t.id)
        expect(tableIdsAfterDelete).not.toContain('RenamedTable')
      } finally {
        // Cleanup: Delete the document
        try {
          await client.delete(`/docs/${docId}`)
        } catch (error) {
          console.warn(`Failed to clean up document ${docId}:`, error)
        }
      }
    })
  })
})
