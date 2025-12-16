/**
 * Grist API Test Helpers
 *
 * Higher-level helpers for common Grist API operations in tests
 */

import { inject } from 'vitest'
import type { ToolContext } from '../../src/registry/types.js'
import type { CellValue } from '../../src/schemas/api-responses.js'
import { GristClient } from '../../src/services/grist-client.js'
import { SchemaCache } from '../../src/services/schema-cache.js'
import type { DocId, TableId, WorkspaceId } from '../../src/types/advanced.js'

export interface TestContext {
  client: GristClient
  toolContext: ToolContext
  orgId?: number
  workspaceId?: WorkspaceId
  docId?: DocId
  tableId?: TableId
}

/**
 * Create a test Grist client using Vitest's inject() for proper test isolation.
 * Values are provided by globalSetup.ts via Vitest's provide/inject mechanism.
 */
export function createTestClient(url?: string, apiKey?: string): GristClient {
  const resolvedUrl = url ?? inject('GRIST_BASE_URL')
  const resolvedApiKey = apiKey ?? inject('GRIST_API_KEY')

  if (!resolvedUrl || !resolvedApiKey) {
    throw new Error(
      'GRIST_BASE_URL and GRIST_API_KEY not available. ' +
        'Ensure globalSetup.ts ran successfully.'
    )
  }

  return new GristClient(resolvedUrl, resolvedApiKey)
}

/**
 * Create a ToolContext from a GristClient for use in tests.
 * Each call creates a fresh SchemaCache to ensure test isolation.
 */
export function createToolContext(client: GristClient): ToolContext {
  const schemaCache = new SchemaCache(client)
  return { client, schemaCache }
}

/**
 * Get the first available organization
 * In Docker with GRIST_SINGLE_ORG=example, we must use the "example" org (id=3)
 */
export async function getFirstOrg(client: GristClient): Promise<number> {
  const orgs = await client.get<Array<{ id: number; domain: string }>>('/orgs')
  if (!orgs || orgs.length === 0) {
    throw new Error('No organizations found')
  }

  // In Docker setup with GRIST_SINGLE_ORG=example, documents must be created in the "example" org
  const exampleOrg = orgs.find((org) => org.domain === 'example')
  if (exampleOrg) {
    return exampleOrg.id
  }

  // Fallback to first org if "example" not found
  return orgs[0].id
}

/**
 * Get the first available workspace
 */
export async function getFirstWorkspace(client: GristClient, orgId: number): Promise<WorkspaceId> {
  const workspaces = await client.get<Array<{ id: number }>>(`/orgs/${orgId}/workspaces`)
  if (!workspaces || workspaces.length === 0) {
    throw new Error('No workspaces found')
  }
  return workspaces[0].id as WorkspaceId
}

/**
 * Create a test workspace
 */
export async function createTestWorkspace(
  client: GristClient,
  orgId: number,
  name: string = `Test Workspace ${Date.now()}`
): Promise<WorkspaceId> {
  const workspaceId = await client.post<number>(`/orgs/${orgId}/workspaces`, {
    name
  })
  return workspaceId as WorkspaceId
}

/**
 * Create a test document
 */
export async function createTestDocument(
  client: GristClient,
  workspaceId: WorkspaceId,
  name: string = `Test Document ${Date.now()}`
): Promise<DocId> {
  const docId = await client.post<string>(`/workspaces/${workspaceId}/docs`, {
    name
  })
  return docId as DocId
}

/**
 * Create a test table
 */
export async function createTestTable(
  client: GristClient,
  docId: DocId,
  tableId: string = `TestTable_${Date.now()}`,
  columns: Array<{ id: string; fields?: Record<string, unknown> }> = [
    { id: 'name', fields: { type: 'Text', label: 'Name' } },
    { id: 'value', fields: { type: 'Numeric', label: 'Value' } }
  ]
): Promise<TableId> {
  await client.post(`/docs/${docId}/tables`, {
    tables: [{ id: tableId, columns }]
  })
  return tableId as TableId
}

/**
 * Add test records to a table
 * Uses actual MCP tool to test real user experience with z.preprocess() auto-conversion
 */
export async function addTestRecords(
  client: GristClient,
  docId: DocId,
  tableId: TableId,
  records: Array<{ fields: Record<string, CellValue> }>
): Promise<number[]> {
  // Import MCP tool dynamically to avoid circular dependencies
  const { addRecords } = await import('../../src/tools/records.js')

  // Create tool context for the MCP tool
  const toolContext = createToolContext(client)

  // Use actual MCP tool - tests real user experience
  const response = await addRecords(toolContext, {
    docId,
    tableId,
    records: records.map((r) => r.fields),
    response_format: 'json'
  })

  // Extract data from MCP response
  if (response.isError) {
    throw new Error(response.content[0].text)
  }

  // Get record IDs from structured content
  const data = response.structuredContent as { record_ids?: number[] }
  return data.recordIds || []
}

/**
 * Delete a document (cleanup)
 */
export async function deleteDocument(client: GristClient, docId: DocId): Promise<void> {
  try {
    await client.delete(`/docs/${docId}`)
  } catch (error: unknown) {
    // Ignore 404 errors (already deleted)
    const err = error as { message?: string }
    if (!err.message?.includes('404')) {
      throw error
    }
  }
}

/**
 * Delete a workspace (cleanup)
 */
export async function deleteWorkspace(
  client: GristClient,
  workspaceId: WorkspaceId
): Promise<void> {
  try {
    await client.delete(`/workspaces/${workspaceId}`)
  } catch (error: unknown) {
    // Ignore 404 errors (already deleted)
    const err = error as { message?: string }
    if (!err.message?.includes('404')) {
      throw error
    }
  }
}

/**
 * Create a complete test context with org, workspace, doc, and table
 */
export async function createFullTestContext(
  client: GristClient,
  options: {
    workspaceName?: string
    docName?: string
    tableName?: string
    columns?: Array<{ id: string; fields?: Record<string, unknown> }>
  } = {}
): Promise<Required<TestContext>> {
  const orgId = await getFirstOrg(client)
  const workspaceId = await createTestWorkspace(client, orgId, options.workspaceName)
  const docId = await createTestDocument(client, workspaceId, options.docName)
  const tableId = await createTestTable(client, docId, options.tableName, options.columns)
  const toolContext = createToolContext(client)

  return {
    client,
    toolContext,
    orgId,
    workspaceId,
    docId,
    tableId
  }
}

/**
 * Cleanup test context (delete all created resources)
 */
export async function cleanupTestContext(context: Partial<TestContext>): Promise<void> {
  // Check for SKIP_CLEANUP environment variable
  if (process.env.SKIP_CLEANUP === 'true' || process.env.NO_CLEANUP === 'true') {
    console.log('⚠️  Cleanup skipped (SKIP_CLEANUP=true)')
    console.log(`   Workspace ID: ${context.workspaceId}`)
    console.log(`   Document ID: ${context.docId}`)
    console.log(`   Inspect at: http://localhost:8989`)
    return
  }

  if (context.docId && context.client) {
    await deleteDocument(context.client, context.docId)
  }
  if (context.workspaceId && context.client) {
    await deleteWorkspace(context.client, context.workspaceId)
  }
}

/**
 * Wait for a condition to be true (with timeout)
 */
export async function waitFor(
  condition: () => Promise<boolean> | boolean,
  options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
  const timeout = options.timeout || 5000
  const interval = options.interval || 100
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return
    }
    await sleep(interval)
  }

  throw new Error(options.message || `Condition not met within ${timeout}ms`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Get all records from a table
 *
 * Convenience wrapper for direct API access in tests.
 *
 * @example
 * ```typescript
 * const records = await getTableRecords(client, docId, 'Users')
 * expect(records).toHaveLength(3)
 * ```
 */
export async function getTableRecords(
  client: GristClient,
  docId: DocId,
  tableId: TableId
): Promise<Array<{ id: number; fields: Record<string, unknown> }>> {
  const response = await client.get<{
    records: Array<{ id: number; fields: Record<string, unknown> }>
  }>(`/docs/${docId}/tables/${tableId}/records`)
  return response.records || []
}

/**
 * Get a single record by ID
 *
 * @example
 * ```typescript
 * const record = await getRecordById(client, docId, 'Users', 42)
 * expect(record.fields.Email).toBe('alice@example.com')
 * ```
 */
export async function getRecordById(
  client: GristClient,
  docId: DocId,
  tableId: TableId,
  recordId: number
): Promise<{ id: number; fields: Record<string, unknown> }> {
  const response = await client.get<{
    records: Array<{ id: number; fields: Record<string, unknown> }>
  }>(`/docs/${docId}/tables/${tableId}/records?id=${recordId}`)
  if (!response.records || response.records.length === 0) {
    throw new Error(`Record ${recordId} not found in ${tableId}`)
  }
  return response.records[0]
}
