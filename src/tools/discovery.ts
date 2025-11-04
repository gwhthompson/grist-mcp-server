/**
 * Discovery & Navigation Tools
 *
 * These tools enable agents to discover and navigate Grist's organizational structure:
 * - grist_get_workspaces: Get/search/browse workspaces
 * - grist_get_documents: Get/search/browse documents (consolidated)
 * - grist_get_tables: Understand data structure within a document
 */

import { z } from 'zod'
import {
  DetailLevelTableSchema,
  DetailLevelWorkspaceSchema,
  DocIdSchema,
  PaginationSchema,
  ResponseFormatSchema,
  TableIdSchema,
  WorkspaceIdSchema
} from '../schemas/common.js'
import { formatErrorResponse, formatToolResponse, truncateIfNeeded } from '../services/formatter.js'
import type { GristClient } from '../services/grist-client.js'
import type { DocumentInfo, WorkspaceInfo } from '../types.js'

// ============================================================================
// 1. GRIST_GET_WORKSPACES
// ============================================================================

export const GetWorkspacesSchema = z
  .object({
    name_contains: z
      .string()
      .optional()
      .describe(
        'Optional: Filter workspaces by name. Case-insensitive partial matching. ' +
          "Example: 'Sales' matches 'Sales Team', 'Regional Sales', etc. " +
          'Leave empty to list all accessible workspaces.'
      ),
    detail_level: DetailLevelWorkspaceSchema,
    response_format: ResponseFormatSchema,
    ...PaginationSchema.shape
  })
  .strict()

export type GetWorkspacesInput = z.infer<typeof GetWorkspacesSchema>

export async function getWorkspaces(client: GristClient, params: GetWorkspacesInput) {
  try {
    // Fetch organizations first
    const orgs = await client.get<Array<{ id: number; name: string; domain: string }>>('/orgs')

    // Fetch workspaces from each org
    const allWorkspaces: WorkspaceInfo[] = []

    for (const org of orgs) {
      const workspacesResponse = await client.get<WorkspaceInfo[]>(`/orgs/${org.id}/workspaces`)
      allWorkspaces.push(...workspacesResponse)
    }

    // Apply name filter if provided
    let filteredWorkspaces = allWorkspaces
    if (params.name_contains) {
      const searchTerm = params.name_contains.toLowerCase()
      filteredWorkspaces = allWorkspaces.filter((ws) => ws.name.toLowerCase().includes(searchTerm))
    }

    const total = filteredWorkspaces.length

    // Apply pagination
    const start = params.offset
    const end = Math.min(start + params.limit, total)
    const paginatedWorkspaces = filteredWorkspaces.slice(start, end)

    // Format based on detail level
    const formattedWorkspaces = paginatedWorkspaces.map((ws) => {
      if (params.detail_level === 'summary') {
        return {
          id: ws.id,
          name: ws.name,
          org: ws.orgName || ws.org,
          doc_count: ws.docs?.length || 0,
          access: ws.access
        }
      } else {
        return {
          id: ws.id,
          name: ws.name,
          org: ws.orgName || ws.org,
          org_domain: ws.orgDomain,
          doc_count: ws.docs?.length || 0,
          access: ws.access,
          created_at: ws.createdAt,
          updated_at: ws.updatedAt
        }
      }
    })

    // Build response data
    const _responseData = {
      total,
      offset: params.offset,
      limit: params.limit,
      has_more: end < total,
      next_offset: end < total ? end : null,
      mode: params.name_contains ? 'search' : 'browse_all',
      search_term: params.name_contains,
      workspaces: formattedWorkspaces
    }

    // Check for truncation
    const { data } = truncateIfNeeded(formattedWorkspaces, params.response_format, {
      total,
      offset: params.offset,
      limit: params.limit,
      has_more: end < total,
      next_offset: end < total ? end : null,
      detail_level: params.detail_level
    })

    return formatToolResponse(data, params.response_format)
  } catch (error) {
    return formatErrorResponse(error instanceof Error ? error.message : String(error))
  }
}

// ============================================================================
// 2. GRIST_GET_DOCUMENTS (Consolidated from list + get)
// ============================================================================

export const GetDocumentsSchema = z
  .object({
    docId: DocIdSchema.optional().describe(
      'Optional: Get specific document by ID. If provided, returns single document. ' +
        "Example: 'qBbArddFDSrKd2jpv3uZTj'"
    ),

    name_contains: z
      .string()
      .optional()
      .describe(
        'Optional: Search documents by name. Case-insensitive partial matching. ' +
          "Example: 'CRM' matches 'Customer CRM', 'Sales CRM System', etc. " +
          'Leave empty to list all accessible documents.'
      ),

    workspaceId: WorkspaceIdSchema.optional().describe(
      'Optional: Filter to documents in specific workspace. ' +
        "Example: 'ws_123' or '3' (numeric ID)"
    ),

    detail_level: z
      .enum(['summary', 'detailed'])
      .default('summary')
      .describe(
        'Control metadata depth:\n' +
          '- summary: name, id, workspace (fast, minimal tokens)\n' +
          '- detailed: + permissions, timestamps, urls (comprehensive)'
      ),

    response_format: ResponseFormatSchema,
    ...PaginationSchema.shape
  })
  .strict()

export type GetDocumentsInput = z.infer<typeof GetDocumentsSchema>

// Helper functions for getDocuments

async function fetchDocumentById(client: GristClient, docId: string): Promise<DocumentInfo> {
  return await client.get<DocumentInfo>(`/docs/${docId}`)
}

async function fetchDocumentsByWorkspace(
  client: GristClient,
  workspaceId: string
): Promise<DocumentInfo[]> {
  const response = await client.get<{ docs: DocumentInfo[] }>(`/workspaces/${workspaceId}`)
  return response.docs || []
}

async function fetchAllDocuments(client: GristClient): Promise<DocumentInfo[]> {
  const documents: DocumentInfo[] = []
  const orgs = await client.get<Array<{ id: number }>>('/orgs')

  for (const org of orgs) {
    const workspaces = await client.get<WorkspaceInfo[]>(`/orgs/${org.id}/workspaces`)

    for (const ws of workspaces) {
      if (ws.docs) {
        documents.push(...ws.docs)
      }
    }
  }

  return documents
}

function formatDocument(
  doc: DocumentInfo,
  detailLevel: string,
  baseUrl: string
): Record<string, any> {
  if (detailLevel === 'summary') {
    return {
      id: doc.id,
      name: doc.name,
      workspace: doc.workspace?.name,
      workspace_id: doc.workspace?.id,
      access: doc.access
    }
  }

  return {
    id: doc.id,
    name: doc.name,
    workspace: doc.workspace || { id: 0, name: 'Unknown' },
    access: doc.access,
    url: `${baseUrl}/doc/${doc.id}`,
    is_pinned: doc.isPinned || false,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
    public: doc.public || false
  }
}

function applyNameFilter(documents: DocumentInfo[], nameContains?: string): DocumentInfo[] {
  if (!nameContains) {
    return documents
  }

  const searchTerm = nameContains.toLowerCase()
  return documents.filter((doc) => doc.name.toLowerCase().includes(searchTerm))
}

function applyPagination<T>(items: T[], offset: number, limit: number): T[] {
  const start = offset
  const end = Math.min(start + limit, items.length)
  return items.slice(start, end)
}

function determineMode(params: GetDocumentsInput): string {
  if (params.name_contains) {
    return 'search'
  }
  if (params.workspaceId) {
    return 'workspace_filter'
  }
  return 'browse_all'
}

export async function getDocuments(client: GristClient, params: GetDocumentsInput) {
  try {
    const baseUrl = client.getBaseUrl()

    // Mode 1: Get by ID (if docId provided)
    if (params.docId) {
      const doc = await fetchDocumentById(client, params.docId)
      const formattedDoc = formatDocument(doc, params.detail_level, baseUrl)

      const { data } = truncateIfNeeded([formattedDoc], params.response_format, {
        total: 1,
        offset: 0,
        limit: 1,
        has_more: false,
        mode: 'get_by_id',
        detail_level: params.detail_level
      })

      return formatToolResponse(data, params.response_format)
    }

    // Mode 2-4: List/search/filter documents
    const documents = params.workspaceId
      ? await fetchDocumentsByWorkspace(client, params.workspaceId)
      : await fetchAllDocuments(client)

    // Apply name filter if provided
    const filtered = applyNameFilter(documents, params.name_contains)
    const total = filtered.length

    // Apply pagination
    const paginatedDocs = applyPagination(filtered, params.offset, params.limit)

    // Format documents
    const formattedDocs = paginatedDocs.map((doc) =>
      formatDocument(doc, params.detail_level, baseUrl)
    )

    // Calculate pagination metadata
    const end = params.offset + paginatedDocs.length
    const mode = determineMode(params)

    // Check for truncation
    const { data } = truncateIfNeeded(formattedDocs, params.response_format, {
      total,
      offset: params.offset,
      limit: params.limit,
      has_more: end < total,
      next_offset: end < total ? end : null,
      mode,
      search_term: params.name_contains,
      workspace_id: params.workspaceId,
      detail_level: params.detail_level
    })

    return formatToolResponse(data, params.response_format)
  } catch (error) {
    return formatErrorResponse(error instanceof Error ? error.message : String(error))
  }
}

// ============================================================================
// 3. GRIST_GET_TABLES
// ============================================================================

export const GetTablesSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema.optional(),
    detail_level: DetailLevelTableSchema,
    response_format: ResponseFormatSchema
  })
  .strict()

export type GetTablesInput = z.infer<typeof GetTablesSchema>

export async function getTables(client: GristClient, params: GetTablesInput) {
  try {
    // Fetch tables from API
    const response = await client.get<{ tables: any[] }>(`/docs/${params.docId}/tables`)
    let tableList = response.tables || []

    // Filter by tableId if specified
    if (params.tableId) {
      tableList = tableList.filter((t) => t.id === params.tableId)
      if (tableList.length === 0) {
        return formatErrorResponse(
          `Table '${params.tableId}' not found in document. ` +
            `Use grist_get_tables without tableId to see all available tables.`
        )
      }
    }

    // Format based on detail level
    let formattedTables: any[]

    if (params.detail_level === 'names') {
      // Just table names
      formattedTables = tableList.map((t) => ({
        id: t.id
      }))
    } else if (params.detail_level === 'columns' || params.detail_level === 'full_schema') {
      // Need to fetch columns for each table
      formattedTables = await Promise.all(
        tableList.map(async (t) => {
          const columnsResponse = await client.get<{ columns: any[] }>(
            `/docs/${params.docId}/tables/${t.id}/columns`
          )
          const columns = columnsResponse.columns || []

          if (params.detail_level === 'columns') {
            // Just column names
            return {
              id: t.id,
              columns: columns.map((c) => c.id)
            }
          } else {
            // Full schema
            return {
              id: t.id,
              columns: columns.map((c) => ({
                id: c.id,
                label: c.fields.label || c.id,
                type: c.fields.type,
                is_formula: c.fields.isFormula || false,
                formula: c.fields.formula || null,
                widget_options:
                  c.fields.widgetOptions && c.fields.widgetOptions !== ''
                    ? typeof c.fields.widgetOptions === 'string'
                      ? JSON.parse(c.fields.widgetOptions)
                      : c.fields.widgetOptions
                    : null
              }))
            }
          }
        })
      )
    } else {
      formattedTables = tableList.map((t) => ({ id: t.id }))
    }

    const responseData = {
      document_id: params.docId,
      table_count: formattedTables.length,
      tables: formattedTables
    }

    return formatToolResponse(responseData, params.response_format)
  } catch (error) {
    return formatErrorResponse(error instanceof Error ? error.message : String(error))
  }
}
