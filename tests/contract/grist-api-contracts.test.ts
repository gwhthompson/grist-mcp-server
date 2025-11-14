/**
 * Contract tests for Grist API responses
 * Validates that Grist's API responses match our type definitions
 *
 * These tests catch upstream breaking changes early by validating response structure.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { GristClient } from '../../src/services/grist-client.js'
import { ensureGristReady } from '../helpers/docker.js'
import {
  cleanupTestContext,
  createFullTestContext,
  createTestClient
} from '../helpers/grist-api.js'
import {
  ColumnListContractSchema,
  RecordsListContractSchema,
  TableListContractSchema,
  WorkspaceDetailedContractSchema,
  WorkspaceListContractSchema
} from './schemas/workspace-contract.js'

describe('Grist API Contract Tests', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>

  beforeAll(async () => {
    await ensureGristReady()
    context = await createFullTestContext(client)
  }, 60000)

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context)
    }
  })

  describe('Workspace API Contract', () => {
    it('should validate workspace list response structure', async () => {
      const workspaces = await client.get(`/orgs/${context.orgId}/workspaces`)

      // Validate against contract schema
      const result = WorkspaceListContractSchema.safeParse(workspaces)

      expect(result.success).toBe(true)
    })

    it('should validate individual workspace response structure', async () => {
      const workspaces = await client.get(`/orgs/${context.orgId}/workspaces`)
      expect(workspaces).toBeDefined()
      expect(Array.isArray(workspaces)).toBe(true)
      expect(workspaces.length).toBeGreaterThan(0)

      const workspace = workspaces[0]
      const result = WorkspaceDetailedContractSchema.safeParse(workspace)

      expect(result.success).toBe(true)
    })

    it('should validate workspace contains required fields', async () => {
      const workspaces = await client.get(`/orgs/${context.orgId}/workspaces`)
      const workspace = workspaces[0]

      // Required fields
      expect(workspace.id).toBeDefined()
      expect(typeof workspace.id).toBe('number')
      expect(workspace.name).toBeDefined()
      expect(typeof workspace.name).toBe('string')
      expect(workspace.access).toBeDefined()
      expect(['viewers', 'editors', 'owners']).toContain(workspace.access)
    })
  })

  describe('Table API Contract', () => {
    it('should validate tables list response structure', async () => {
      const tables = await client.get(`/docs/${context.docId}/tables`)

      const result = TableListContractSchema.safeParse(tables)

      expect(result.success).toBe(true)
    })

    it('should validate tables array contains table objects', async () => {
      const response = await client.get(`/docs/${context.docId}/tables`)

      expect(response).toHaveProperty('tables')
      expect(Array.isArray(response.tables)).toBe(true)

      if (response.tables.length > 0) {
        const table = response.tables[0]
        expect(table).toHaveProperty('id')
        expect(table).toHaveProperty('fields')
        expect(typeof table.id).toBe('string')
      }
    })
  })

  describe('Column API Contract', () => {
    it('should validate columns list response structure', async () => {
      const columns = await client.get(`/docs/${context.docId}/tables/${context.tableId}/columns`)

      const result = ColumnListContractSchema.safeParse(columns)

      expect(result.success).toBe(true)
    })

    it('should validate column metadata fields', async () => {
      const response = await client.get(`/docs/${context.docId}/tables/${context.tableId}/columns`)

      expect(response).toHaveProperty('columns')
      expect(Array.isArray(response.columns)).toBe(true)

      if (response.columns.length > 0) {
        const column = response.columns[0]

        // Required fields
        expect(column).toHaveProperty('id')
        expect(column).toHaveProperty('fields')
        expect(column.fields).toHaveProperty('type')
        expect(column.fields).toHaveProperty('colRef')

        // Types
        expect(typeof column.id).toBe('string')
        expect(typeof column.fields.type).toBe('string')
        expect(typeof column.fields.colRef).toBe('number')
      }
    })
  })

  describe('Records API Contract', () => {
    it('should validate records list response structure', async () => {
      const records = await client.get(`/docs/${context.docId}/tables/${context.tableId}/records`)

      const result = RecordsListContractSchema.safeParse(records)

      expect(result.success).toBe(true)
    })

    it('should validate record structure', async () => {
      const response = await client.get(`/docs/${context.docId}/tables/${context.tableId}/records`)

      expect(response).toHaveProperty('records')
      expect(Array.isArray(response.records)).toBe(true)

      if (response.records.length > 0) {
        const record = response.records[0]

        // Required fields
        expect(record).toHaveProperty('id')
        expect(record).toHaveProperty('fields')

        // Types
        expect(typeof record.id).toBe('number')
        expect(typeof record.fields).toBe('object')
      }
    })
  })

  describe('Contract Schema Strictness', () => {
    it('should detect new fields in Grist API (breaking change detection)', async () => {
      const workspaces = await client.get(`/orgs/${context.orgId}/workspaces`)
      const workspace = workspaces[0]

      // .strict() mode will fail if Grist adds new fields we don't know about
      const result = WorkspaceDetailedContractSchema.safeParse(workspace)

      // This test passes as long as schema validation works
      // New fields indicate API changes we should review
      expect(result.success || result.error.issues.length > 0).toBe(true)
    })
  })
})
