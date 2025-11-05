/**
 * Grist API Test Helpers
 *
 * Higher-level helpers for common Grist API operations in tests
 */

import { GristClient } from '../../src/services/grist-client.js';
import type { DocId, TableId, WorkspaceId, ColId } from '../../src/types/advanced.js';

export interface TestContext {
  client: GristClient;
  orgId?: number;
  workspaceId?: WorkspaceId;
  docId?: DocId;
  tableId?: TableId;
}

/**
 * Create a test Grist client
 */
export function createTestClient(
  url: string = process.env.GRIST_URL || 'http://localhost:8989',
  apiKey: string = process.env.GRIST_API_KEY || 'test_api_key'
): GristClient {
  return new GristClient(url, apiKey);
}

/**
 * Get the first available organization
 * In Docker with GRIST_SINGLE_ORG=example, we must use the "example" org (id=3)
 */
export async function getFirstOrg(client: GristClient): Promise<number> {
  const orgs = await client.get<Array<{ id: number; domain: string }>>('/orgs');
  if (!orgs || orgs.length === 0) {
    throw new Error('No organizations found');
  }

  // In Docker setup with GRIST_SINGLE_ORG=example, documents must be created in the "example" org
  const exampleOrg = orgs.find(org => org.domain === 'example');
  if (exampleOrg) {
    return exampleOrg.id;
  }

  // Fallback to first org if "example" not found
  return orgs[0].id;
}

/**
 * Get the first available workspace
 */
export async function getFirstWorkspace(client: GristClient, orgId: number): Promise<WorkspaceId> {
  const workspaces = await client.get<Array<{ id: number }>>(`/orgs/${orgId}/workspaces`);
  if (!workspaces || workspaces.length === 0) {
    throw new Error('No workspaces found');
  }
  return workspaces[0].id as WorkspaceId;
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
  });
  return workspaceId as WorkspaceId;
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
  });
  return docId as DocId;
}

/**
 * Create a test table
 */
export async function createTestTable(
  client: GristClient,
  docId: DocId,
  tableId: string = `TestTable_${Date.now()}`,
  columns: Array<{ id: string; fields?: any }> = [
    { id: 'name', fields: { type: 'Text', label: 'Name' } },
    { id: 'value', fields: { type: 'Numeric', label: 'Value' } }
  ]
): Promise<TableId> {
  await client.post(`/docs/${docId}/tables`, {
    tables: [{ id: tableId, columns }]
  });
  return tableId as TableId;
}

/**
 * Add test records to a table
 */
export async function addTestRecords(
  client: GristClient,
  docId: DocId,
  tableId: TableId,
  records: Array<{ fields: Record<string, any> }>
): Promise<number[]> {
  const response = await client.post<{ records: Array<{ id: number }> }>(
    `/docs/${docId}/tables/${tableId}/records`,
    { records }
  );
  return response.records.map(r => r.id);
}

/**
 * Delete a document (cleanup)
 */
export async function deleteDocument(client: GristClient, docId: DocId): Promise<void> {
  try {
    await client.delete(`/docs/${docId}`);
  } catch (error) {
    // Ignore 404 errors (already deleted)
    if (!(error as any).message?.includes('404')) {
      throw error;
    }
  }
}

/**
 * Delete a workspace (cleanup)
 */
export async function deleteWorkspace(client: GristClient, workspaceId: WorkspaceId): Promise<void> {
  try {
    await client.delete(`/workspaces/${workspaceId}`);
  } catch (error) {
    // Ignore 404 errors (already deleted)
    if (!(error as any).message?.includes('404')) {
      throw error;
    }
  }
}

/**
 * Create a complete test context with org, workspace, doc, and table
 */
export async function createFullTestContext(
  client: GristClient,
  options: {
    workspaceName?: string;
    docName?: string;
    tableName?: string;
    columns?: Array<{ id: string; fields?: any }>;
  } = {}
): Promise<Required<TestContext>> {
  const orgId = await getFirstOrg(client);
  const workspaceId = await createTestWorkspace(client, orgId, options.workspaceName);
  const docId = await createTestDocument(client, workspaceId, options.docName);
  const tableId = await createTestTable(client, docId, options.tableName, options.columns);

  return {
    client,
    orgId,
    workspaceId,
    docId,
    tableId
  };
}

/**
 * Cleanup test context (delete all created resources)
 */
export async function cleanupTestContext(context: Partial<TestContext>): Promise<void> {
  // Check for SKIP_CLEANUP environment variable
  if (process.env.SKIP_CLEANUP === 'true' || process.env.NO_CLEANUP === 'true') {
    console.log('⚠️  Cleanup skipped (SKIP_CLEANUP=true)');
    console.log(`   Workspace ID: ${context.workspaceId}`);
    console.log(`   Document ID: ${context.docId}`);
    console.log(`   Inspect at: http://localhost:8989`);
    return;
  }

  if (context.docId) {
    await deleteDocument(context.client!, context.docId);
  }
  if (context.workspaceId) {
    await deleteWorkspace(context.client!, context.workspaceId);
  }
}

/**
 * Wait for a condition to be true (with timeout)
 */
export async function waitFor(
  condition: () => Promise<boolean> | boolean,
  options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
  const timeout = options.timeout || 5000;
  const interval = options.interval || 100;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(interval);
  }

  throw new Error(options.message || `Condition not met within ${timeout}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
