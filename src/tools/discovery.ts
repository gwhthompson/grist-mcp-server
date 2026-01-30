import { z } from 'zod'
import { READ_ONLY_ANNOTATIONS, type ToolContext, type ToolDefinition } from '../registry/types.js'
import {
  DetailLevelTableSchema,
  DetailLevelWorkspaceSchema,
  DocIdSchema,
  PaginationSchema,
  ResponseFormatSchema,
  TableIdSchema,
  WorkspaceIdSchema
} from '../schemas/common.js'
import {
  GetDocumentsOutputSchema,
  GetTablesOutputSchema,
  GetWorkspacesOutputSchema
} from '../schemas/output-schemas.js'
import {
  extractForeignTable,
  getColumnNameFromId,
  isReferenceType
} from '../services/column-resolver.js'
import type { DocumentInfo, TablesApiResponse, WorkspaceInfo } from '../types.js'
import { log } from '../utils/logger.js'
import { definePaginatedTool, defineStandardTool } from './factory/index.js'
import { nextSteps } from './utils/next-steps.js'
import { paginate } from './utils/pagination.js'

// =============================================================================
// Get Workspaces Tool
// =============================================================================

export const GetWorkspacesSchema = z.strictObject({
  name_contains: z
    .string()
    .min(1, 'Search term must be at least 1 character')
    .max(100, 'Search term cannot exceed 100 characters')
    .optional()
    .describe('substring match'),
  detail_level: DetailLevelWorkspaceSchema,
  response_format: ResponseFormatSchema,
  ...PaginationSchema.shape
})

export type GetWorkspacesInput = z.infer<typeof GetWorkspacesSchema>

interface FormattedWorkspace {
  id: string | number
  name: string
  org: string | number | undefined
  orgDomain?: string
  docCount: number
  access: string
  createdAt?: string
  updatedAt?: string
}

function formatWorkspace(ws: WorkspaceInfo, detailLevel: string): FormattedWorkspace {
  const base = {
    id: ws.id,
    name: ws.name,
    org: ws.orgName || ws.org,
    docCount: ws.docs?.length || 0,
    access: ws.access
  }

  if (detailLevel === 'detailed') {
    return {
      ...base,
      orgDomain: ws.orgDomain,
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt
    }
  }

  return base
}

export const GET_WORKSPACES_TOOL = definePaginatedTool<
  typeof GetWorkspacesSchema,
  FormattedWorkspace
>({
  name: 'grist_get_workspaces',
  title: 'Get Workspaces',
  description: 'List accessible workspaces',
  purpose: 'List and filter workspaces',
  category: 'discovery',
  inputSchema: GetWorkspacesSchema,
  outputSchema: GetWorkspacesOutputSchema,
  annotations: READ_ONLY_ANNOTATIONS,
  core: true,

  async fetchItems(ctx, params) {
    const maxWorkspaces = 1000

    const orgs = await ctx.client.get<Array<{ id: number; name: string; domain: string }>>('/orgs')

    const allWorkspaces: WorkspaceInfo[] = []
    for (const org of orgs) {
      if (allWorkspaces.length >= maxWorkspaces) {
        log.warn('GetWorkspaces reached max workspaces during fetch', {
          fetched: allWorkspaces.length,
          max: maxWorkspaces
        })
        break
      }

      const workspacesResponse = await ctx.client.get<WorkspaceInfo[]>(`/orgs/${org.id}/workspaces`)

      const wsToAdd = workspacesResponse.slice(0, maxWorkspaces - allWorkspaces.length)
      allWorkspaces.push(...wsToAdd)
    }

    return allWorkspaces.map((ws) => formatWorkspace(ws, params.detail_level))
  },

  filterItems(items, params) {
    if (!params.name_contains) {
      return items
    }

    const searchTerm = params.name_contains.toLowerCase()
    return items.filter((ws) => ws.name.toLowerCase().includes(searchTerm))
  },

  // biome-ignore lint/suspicious/useAwait: Factory type requires async return
  async afterExecute(result, _params, _ctx) {
    const firstWs = result.items[0]

    return {
      ...result,
      nextSteps: nextSteps()
        .addIf(
          !!firstWs,
          `Use grist_get_documents with workspaceId=${firstWs?.id} to list documents in "${firstWs?.name}"`
        )
        .addPaginationHint(result, 'workspaces')
        .build()
    }
  },

  docs: {
    overview:
      'List workspaces with filtering. Use browse mode ({limit: 20}) to see all, or search mode ({name_contains: "Sales"}) to filter. Detail levels: summary (name, ID, access, doc count ~50 tokens) or detailed (+ timestamps ~150 tokens).',
    examples: [
      { desc: 'List all workspaces', input: { limit: 20, detail_level: 'summary' } },
      { desc: 'Search by name', input: { name_contains: 'Sales', limit: 5 } }
    ],
    errors: [
      {
        error: 'No workspaces found matching "X"',
        solution: 'Remove name_contains to see all accessible workspaces'
      }
    ]
  }
})

export function getWorkspaces(context: ToolContext, params: GetWorkspacesInput) {
  return GET_WORKSPACES_TOOL.handler(context, params)
}

// =============================================================================
// Get Documents Tool
// =============================================================================

export const GetDocumentsSchema = z.strictObject({
  docId: DocIdSchema.optional(),
  name_contains: z
    .string()
    .min(1, 'Search term must be at least 1 character')
    .max(100, 'Search term cannot exceed 100 characters')
    .optional()
    .describe('substring match'),
  workspaceId: WorkspaceIdSchema.optional().describe('filter to workspace'),
  detail_level: z
    .enum(['summary', 'detailed'])
    .default('summary')
    .describe('summary: basic. detailed: +permissions, timestamps'),
  response_format: ResponseFormatSchema,
  ...PaginationSchema.shape
})

export type GetDocumentsInput = z.infer<typeof GetDocumentsSchema>

interface FormattedDocument {
  docId: string
  name: string
  workspace?: string | { id: number; name: string }
  workspaceId?: number | string
  access: string
  url?: string
  isPinned?: boolean
  createdAt?: string
  updatedAt?: string
  public?: boolean
}

function formatDocument(
  doc: DocumentInfo,
  detailLevel: string,
  baseUrl: string
): FormattedDocument {
  if (detailLevel === 'summary') {
    return {
      docId: doc.id,
      name: doc.name,
      workspace: doc.workspace?.name,
      workspaceId: doc.workspace?.id,
      access: doc.access
    }
  }

  return {
    docId: doc.id,
    name: doc.name,
    workspace: doc.workspace,
    access: doc.access,
    url: `${baseUrl}/doc/${doc.id}`,
    isPinned: doc.isPinned || false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    public: doc.public || false
  }
}

async function fetchAllDocuments(
  ctx: ToolContext,
  detailLevel: string,
  maxDocuments = 1000
): Promise<FormattedDocument[]> {
  const baseUrl = ctx.client.getBaseUrl()
  const documents: FormattedDocument[] = []
  const orgs = await ctx.client.get<Array<{ id: number }>>('/orgs')

  for (const org of orgs) {
    if (documents.length >= maxDocuments) {
      log.warn('GetDocuments reached max documents during fetch', {
        fetched: documents.length,
        max: maxDocuments
      })
      break
    }

    const workspaces = await ctx.client.get<WorkspaceInfo[]>(`/orgs/${org.id}/workspaces`)

    for (const ws of workspaces) {
      if (documents.length >= maxDocuments) break

      if (ws.docs) {
        const docsToAdd = ws.docs
          .slice(0, maxDocuments - documents.length)
          .map((doc) => formatDocument(doc, detailLevel, baseUrl))
        documents.push(...docsToAdd)
      }
    }
  }

  return documents
}

export const GET_DOCUMENTS_TOOL = definePaginatedTool<typeof GetDocumentsSchema, FormattedDocument>(
  {
    name: 'grist_get_documents',
    title: 'Get Documents',
    description: 'Find documents by ID, name, or workspace',
    purpose: 'Find documents by ID, name, or workspace',
    category: 'discovery',
    inputSchema: GetDocumentsSchema,
    outputSchema: GetDocumentsOutputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
    core: true,

    async fetchItems(ctx, params) {
      const baseUrl = ctx.client.getBaseUrl()

      if (params.docId) {
        const doc = await ctx.client.get<DocumentInfo>(`/docs/${params.docId}`)
        return [formatDocument(doc, params.detail_level, baseUrl)]
      }

      if (params.workspaceId) {
        const response = await ctx.client.get<{ docs: DocumentInfo[] }>(
          `/workspaces/${params.workspaceId}`
        )
        const docs = response.docs || []
        return docs.map((doc) => formatDocument(doc, params.detail_level, baseUrl))
      }

      return await fetchAllDocuments(ctx, params.detail_level)
    },

    filterItems(items, params) {
      if (!params.name_contains) {
        return items
      }

      const searchTerm = params.name_contains.toLowerCase()
      return items.filter((doc) => doc.name.toLowerCase().includes(searchTerm))
    },

    // biome-ignore lint/suspicious/useAwait: Factory type requires async return
    async afterExecute(result, params, _ctx) {
      const firstDoc = result.items[0]

      return {
        ...result,
        nextSteps: nextSteps()
          .addIf(
            !!firstDoc,
            `Use grist_get_tables with docId="${firstDoc?.docId}" to see table schema`
          )
          .addIf(
            !!params.docId && result.items.length === 1,
            'Use grist_get_records to query data from tables'
          )
          .addPaginationHint(result, 'documents')
          .build()
      }
    },

    docs: {
      overview:
        'Find documents by ID (fastest), name search, workspace filter, or browse all. Detail levels: summary (name, id, workspace, access ~50 tokens/doc) or detailed (+ permissions, timestamps, urls ~150 tokens/doc).',
      examples: [
        { desc: 'Get by ID', input: { docId: 'qBbArddFDSrKd2jpv3uZTj' } },
        { desc: 'Search by name', input: { name_contains: 'CRM', limit: 5 } },
        { desc: 'Filter by workspace', input: { workspaceId: 3, limit: 10 } }
      ],
      errors: [
        { error: 'Document not found', solution: 'Use grist_get_documents without filters' },
        { error: 'Workspace not found', solution: 'Use grist_get_workspaces to find IDs' }
      ]
    }
  }
)

export function getDocuments(context: ToolContext, params: GetDocumentsInput) {
  return GET_DOCUMENTS_TOOL.handler(context, params)
}

// =============================================================================
// Get Tables Tool
// =============================================================================

export const GetTablesSchema = z.strictObject({
  docId: DocIdSchema,
  tableId: TableIdSchema.optional(),
  detail_level: DetailLevelTableSchema,
  response_format: ResponseFormatSchema,
  ...PaginationSchema.shape
})

export type GetTablesInput = z.infer<typeof GetTablesSchema>

interface FormattedTable {
  id: string
  columns?:
    | string[]
    | Array<{
        colId: string
        label: string
        type: string
        isFormula: boolean
        formula: string | null
        widgetOptions: string | Record<string, unknown> | null
        visibleCol?: number | null
        visibleColName?: string | null
      }>
}

interface GetTablesOutput {
  docId: string
  tableCount: number
  items: FormattedTable[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
  nextOffset: number | null
  pageNumber: number
  totalPages: number
  itemsInPage: number
  nextSteps?: string[]
}

interface ColumnApiResponse {
  id: string
  fields: {
    label?: string
    type: string
    isFormula?: boolean
    formula?: string | null
    widgetOptions?: string | Record<string, unknown>
    visibleCol?: number
  }
}

function parseWidgetOptions(
  raw: string | Record<string, unknown> | undefined
): string | Record<string, unknown> | null {
  if (!raw || raw === '') return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

async function resolveVisibleColName(
  client: ToolContext['client'],
  docId: string,
  type: string,
  visibleCol: number | undefined
): Promise<string | null> {
  if (!visibleCol || !isReferenceType(type)) return null

  const foreignTable = extractForeignTable(type)
  if (!foreignTable) return null

  try {
    return await getColumnNameFromId(client, docId, foreignTable, visibleCol)
  } catch (error) {
    // Non-critical - visible column name is a convenience enhancement
    log.debug(
      'Failed to resolve visibleColName',
      { docId, foreignTable, visibleCol },
      error instanceof Error ? error : undefined
    )
    return null
  }
}

async function formatTables(
  ctx: ToolContext,
  tables: Array<{ id: string }>,
  params: GetTablesInput
): Promise<FormattedTable[]> {
  if (params.detail_level === 'names') {
    return tables.map((t) => ({ id: t.id }))
  }

  if (params.detail_level === 'columns' || params.detail_level === 'full_schema') {
    return await Promise.all(
      tables.map(async (t) => {
        const columnsResponse = await ctx.client.get<{
          columns: ColumnApiResponse[]
        }>(`/docs/${params.docId}/tables/${t.id}/columns`)
        const columns = columnsResponse.columns || []

        if (params.detail_level === 'columns') {
          return {
            id: t.id,
            columns: columns.map((c) => c.id)
          }
        }

        return {
          id: t.id,
          columns: await Promise.all(
            columns.map(async (c) => ({
              colId: c.id,
              label: c.fields.label ?? c.id,
              type: c.fields.type,
              isFormula: c.fields.isFormula ?? false,
              formula: c.fields.formula ?? null,
              widgetOptions: parseWidgetOptions(c.fields.widgetOptions),
              visibleCol: c.fields.visibleCol ?? null,
              visibleColName: await resolveVisibleColName(
                ctx.client,
                params.docId,
                c.fields.type,
                c.fields.visibleCol
              )
            }))
          )
        }
      })
    )
  }

  return tables.map((t) => ({ id: t.id }))
}

export const GET_TABLES_TOOL = defineStandardTool<typeof GetTablesSchema, GetTablesOutput>({
  name: 'grist_get_tables',
  title: 'Get Grist Table Structure',
  description: 'Get table and column schema',
  purpose: 'Get table structure and schema',
  category: 'discovery',
  inputSchema: GetTablesSchema,
  outputSchema: GetTablesOutputSchema,
  annotations: READ_ONLY_ANNOTATIONS,
  core: true,

  async execute(ctx, params) {
    const response = await ctx.client.get<TablesApiResponse>(`/docs/${params.docId}/tables`)
    let tableList = response.tables || []

    if (params.tableId) {
      tableList = tableList.filter((t) => t.id === params.tableId)
      if (tableList.length === 0) {
        throw new Error(
          `Table '${params.tableId}' not found in document. ` +
            `Use grist_get_tables without tableId to see all available tables.`
        )
      }
    }

    const formattedTables = await formatTables(ctx, tableList, params)
    const paginated = paginate(formattedTables, params)
    const pageNumber = Math.floor(paginated.offset / paginated.limit) + 1
    const totalPages = Math.ceil(paginated.total / paginated.limit)

    return {
      docId: params.docId,
      tableCount: paginated.items.length,
      items: paginated.items,
      total: paginated.total,
      offset: paginated.offset,
      limit: paginated.limit,
      hasMore: paginated.hasMore,
      nextOffset: paginated.nextOffset,
      pageNumber,
      totalPages,
      itemsInPage: paginated.items.length
    }
  },

  // biome-ignore lint/suspicious/useAwait: Factory type requires async return
  async afterExecute(result, params, _ctx) {
    const firstTable = result.items[0]

    return {
      ...result,
      nextSteps: nextSteps()
        .addIf(
          !!firstTable,
          `Use grist_get_records with docId="${params.docId}" and tableId="${firstTable?.id}" to query data`
        )
        .addIf(!!firstTable, 'Use grist_manage_records to add, update, or delete records')
        .addPaginationHint(result, 'tables')
        .build()
    }
  },

  docs: {
    overview:
      'Get table structure and schema. Detail levels: names (table IDs only ~20 tokens/table), columns (+ column names ~50 tokens/table), or full_schema (+ types, formulas, widget options ~200 tokens/table). Columns use `colId` to match grist_manage_schema input format. Note: widgetOptions only returned with full_schema.',
    examples: [
      { desc: 'List table names', input: { docId: 'abc123', detail_level: 'names' } },
      {
        desc: 'Get column names',
        input: { docId: 'abc123', tableId: 'Contacts', detail_level: 'columns' }
      },
      {
        desc: 'Full schema',
        input: { docId: 'abc123', tableId: 'Products', detail_level: 'full_schema' }
      }
    ],
    errors: [
      { error: 'Document not found', solution: 'Use grist_get_documents to find IDs' },
      { error: 'Table not found', solution: 'Use grist_get_tables without tableId' }
    ]
  }
})

export function getTables(context: ToolContext, params: GetTablesInput) {
  return GET_TABLES_TOOL.handler(context, params)
}

// =============================================================================
// Tool Definitions Export
// =============================================================================

export const DISCOVERY_TOOLS: ReadonlyArray<ToolDefinition> = [
  GET_WORKSPACES_TOOL,
  GET_DOCUMENTS_TOOL,
  GET_TABLES_TOOL
] as const
