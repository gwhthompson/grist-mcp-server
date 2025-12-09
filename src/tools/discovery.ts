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
import { truncateIfNeeded } from '../services/formatter.js'
import type { DocumentInfo, WorkspaceInfo } from '../types.js'
import { GristTool } from './base/GristTool.js'
import { PaginatedGristTool, type PaginatedResponse } from './base/PaginatedGristTool.js'

export const GetWorkspacesSchema = z
  .object({
    name_contains: z
      .string()
      .min(1, 'Search term must be at least 1 character')
      .max(100, 'Search term cannot exceed 100 characters')
      .optional()
      .describe(
        'Optional: Filter workspaces by name. Case-insensitive partial matching. ' +
          "Example: 'Sales' matches 'Sales Team', 'Regional Sales', etc. " +
          'Leave empty to list all accessible workspaces.'
      ),
    detail_level: DetailLevelWorkspaceSchema,
    response_format: ResponseFormatSchema
  })
  .extend(PaginationSchema.shape)
  .strict()

export type GetWorkspacesInput = z.infer<typeof GetWorkspacesSchema>

interface FormattedWorkspace {
  id: string | number
  name: string
  org: string | number | undefined
  org_domain?: string
  doc_count: number
  access: string
  created_at?: string
  updated_at?: string
}

export class GetWorkspacesTool extends PaginatedGristTool<
  typeof GetWorkspacesSchema,
  FormattedWorkspace,
  PaginatedResponse<FormattedWorkspace>
> {
  constructor(context: ToolContext) {
    super(context, GetWorkspacesSchema)
  }

  protected async fetchItems(params: GetWorkspacesInput): Promise<FormattedWorkspace[]> {
    const maxWorkspaces = 1000

    const orgs = await this.client.get<Array<{ id: number; name: string; domain: string }>>('/orgs')

    const allWorkspaces: WorkspaceInfo[] = []
    for (const org of orgs) {
      if (allWorkspaces.length >= maxWorkspaces) {
        console.error(
          `[GetWorkspaces] Reached max workspaces during fetch: ${allWorkspaces.length}/${maxWorkspaces}`
        )
        break
      }

      const workspacesResponse = await this.client.get<WorkspaceInfo[]>(
        `/orgs/${org.id}/workspaces`
      )

      const wsToAdd = workspacesResponse.slice(0, maxWorkspaces - allWorkspaces.length)
      allWorkspaces.push(...wsToAdd)
    }

    return allWorkspaces.map((ws) => this.formatWorkspace(ws, params.detail_level))
  }

  protected filterItems(
    items: FormattedWorkspace[],
    params: GetWorkspacesInput
  ): FormattedWorkspace[] {
    if (!params.name_contains) {
      return items
    }

    const searchTerm = params.name_contains.toLowerCase()
    return items.filter((ws) => ws.name.toLowerCase().includes(searchTerm))
  }

  private formatWorkspace(ws: WorkspaceInfo, detailLevel: string): FormattedWorkspace {
    const base = {
      id: ws.id,
      name: ws.name,
      org: ws.orgName || ws.org,
      doc_count: ws.docs?.length || 0,
      access: ws.access
    }

    if (detailLevel === 'detailed') {
      return {
        ...base,
        org_domain: ws.orgDomain,
        created_at: ws.createdAt,
        updated_at: ws.updatedAt
      }
    }

    return base
  }

  protected formatResponse(
    data: PaginatedResponse<FormattedWorkspace>,
    format: 'json' | 'markdown'
  ) {
    const { data: truncatedData } = truncateIfNeeded(data.items, format, {
      total: data.pagination.total,
      offset: data.pagination.offset,
      limit: data.pagination.limit,
      has_more: data.pagination.has_more,
      next_offset: data.pagination.next_offset
    })

    return super.formatResponse(
      truncatedData as unknown as PaginatedResponse<FormattedWorkspace>,
      format
    )
  }
}

export async function getWorkspaces(context: ToolContext, params: GetWorkspacesInput) {
  const tool = new GetWorkspacesTool(context)
  return tool.execute(params)
}

export const GetDocumentsSchema = z
  .object({
    docId: DocIdSchema.optional().describe(
      'Optional: Get specific document by ID. If provided, returns single document. ' +
        "Example: 'qBbArddFDSrKd2jpv3uZTj'"
    ),
    name_contains: z
      .string()
      .min(1, 'Search term must be at least 1 character')
      .max(100, 'Search term cannot exceed 100 characters')
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
          '- detailed: + permissions, timestamps, urls'
      ),
    response_format: ResponseFormatSchema
  })
  .extend(PaginationSchema.shape)
  .strict()

export type GetDocumentsInput = z.infer<typeof GetDocumentsSchema>

interface FormattedDocument {
  id: string
  name: string
  workspace?: string | { id: number; name: string }
  workspace_id?: number | string
  access: string
  url?: string
  is_pinned?: boolean
  created_at?: string
  updated_at?: string
  public?: boolean
}

export class GetDocumentsTool extends PaginatedGristTool<
  typeof GetDocumentsSchema,
  FormattedDocument,
  PaginatedResponse<FormattedDocument>
> {
  constructor(context: ToolContext) {
    super(context, GetDocumentsSchema)
  }

  protected async fetchItems(params: GetDocumentsInput): Promise<FormattedDocument[]> {
    const baseUrl = this.client.getBaseUrl()

    if (params.docId) {
      const doc = await this.client.get<DocumentInfo>(`/docs/${params.docId}`)
      return [this.formatDocument(doc, params.detail_level, baseUrl)]
    }

    if (params.workspaceId) {
      const response = await this.client.get<{ docs: DocumentInfo[] }>(
        `/workspaces/${params.workspaceId}`
      )
      const docs = response.docs || []
      return docs.map((doc) => this.formatDocument(doc, params.detail_level, baseUrl))
    }

    return await this.fetchAllDocuments(baseUrl, params.detail_level)
  }

  protected filterItems(
    items: FormattedDocument[],
    params: GetDocumentsInput
  ): FormattedDocument[] {
    if (!params.name_contains) {
      return items
    }

    const searchTerm = params.name_contains.toLowerCase()
    return items.filter((doc) => doc.name.toLowerCase().includes(searchTerm))
  }

  private async fetchAllDocuments(
    baseUrl: string,
    detailLevel: string,
    maxDocuments = 1000
  ): Promise<FormattedDocument[]> {
    const documents: FormattedDocument[] = []
    const orgs = await this.client.get<Array<{ id: number }>>('/orgs')

    for (const org of orgs) {
      if (documents.length >= maxDocuments) {
        console.error(
          `[GetDocuments] Reached max documents during fetch: ${documents.length}/${maxDocuments}`
        )
        break
      }

      const workspaces = await this.client.get<WorkspaceInfo[]>(`/orgs/${org.id}/workspaces`)

      for (const ws of workspaces) {
        if (documents.length >= maxDocuments) break

        if (ws.docs) {
          const docsToAdd = ws.docs
            .slice(0, maxDocuments - documents.length)
            .map((doc) => this.formatDocument(doc, detailLevel, baseUrl))
          documents.push(...docsToAdd)
        }
      }
    }

    return documents
  }

  private formatDocument(
    doc: DocumentInfo,
    detailLevel: string,
    baseUrl: string
  ): FormattedDocument {
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

  protected formatResponse(
    data: PaginatedResponse<FormattedDocument>,
    format: 'json' | 'markdown'
  ) {
    const { data: truncatedData } = truncateIfNeeded(data.items, format, {
      total: data.pagination.total,
      offset: data.pagination.offset,
      limit: data.pagination.limit,
      has_more: data.pagination.has_more,
      next_offset: data.pagination.next_offset
    })

    return super.formatResponse(
      truncatedData as unknown as PaginatedResponse<FormattedDocument>,
      format
    )
  }
}

export async function getDocuments(context: ToolContext, params: GetDocumentsInput) {
  const tool = new GetDocumentsTool(context)
  return tool.execute(params)
}

export const GetTablesSchema = z
  .object({
    docId: DocIdSchema,
    tableId: TableIdSchema.optional(),
    detail_level: DetailLevelTableSchema,
    response_format: ResponseFormatSchema
  })
  .extend(PaginationSchema.shape)
  .strict()

export type GetTablesInput = z.infer<typeof GetTablesSchema>

interface FormattedTable {
  id: string
  columns?:
    | string[]
    | Array<{
        id: string
        label: string
        type: string
        is_formula: boolean
        formula: string | null
        widget_options: string | Record<string, unknown> | null
        visible_col?: number | null
        visible_col_name?: string | null
      }>
}

export class GetTablesTool extends GristTool<
  typeof GetTablesSchema,
  {
    document_id: string
    table_count: number
    items: FormattedTable[]
    total: number
    offset: number
    limit: number
    has_more: boolean
    next_offset: number | null
    page_number: number
    total_pages: number
    items_in_page: number
  }
> {
  constructor(context: ToolContext) {
    super(context, GetTablesSchema)
  }

  protected async executeInternal(params: GetTablesInput) {
    const response = await this.client.get<import('../types.js').TablesApiResponse>(
      `/docs/${params.docId}/tables`
    )
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

    const formattedTables = await this.formatTables(tableList, params)

    const offset = params.offset ?? 0
    const limit = params.limit ?? 100
    const total = formattedTables.length
    const paginatedTables = formattedTables.slice(offset, offset + limit)
    const has_more = offset + limit < total
    const next_offset = has_more ? offset + limit : null
    const items_in_page = paginatedTables.length
    const page_number = Math.floor(offset / limit) + 1
    const total_pages = Math.ceil(total / limit)

    return {
      document_id: params.docId,
      table_count: items_in_page,
      items: paginatedTables,
      total,
      offset,
      limit,
      has_more,
      next_offset,
      page_number,
      total_pages,
      items_in_page
    }
  }

  private async formatTables(
    tables: Array<{ id: string }>,
    params: GetTablesInput
  ): Promise<FormattedTable[]> {
    if (params.detail_level === 'names') {
      return tables.map((t) => ({ id: t.id }))
    }

    if (params.detail_level === 'columns' || params.detail_level === 'full_schema') {
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

      return Promise.all(
        tables.map(async (t) => {
          const columnsResponse = await this.client.get<{
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
              columns.map(async (c) => {
                let parsedWidgetOptions: string | Record<string, unknown> | null = null
                if (c.fields.widgetOptions && c.fields.widgetOptions !== '') {
                  parsedWidgetOptions =
                    typeof c.fields.widgetOptions === 'string'
                      ? JSON.parse(c.fields.widgetOptions)
                      : c.fields.widgetOptions
                }

                let visibleColName: string | null = null
                if (c.fields.visibleCol && isReferenceType(c.fields.type)) {
                  const foreignTable = extractForeignTable(c.fields.type)
                  if (foreignTable) {
                    try {
                      visibleColName = await getColumnNameFromId(
                        this.client,
                        params.docId,
                        foreignTable,
                        c.fields.visibleCol
                      )
                    } catch {
                      visibleColName = null
                    }
                  }
                }

                return {
                  id: c.id,
                  label: c.fields.label ?? c.id,
                  type: c.fields.type,
                  is_formula: c.fields.isFormula ?? false,
                  formula: c.fields.formula ?? null,
                  widget_options: parsedWidgetOptions,
                  visible_col: c.fields.visibleCol ?? null,
                  visible_col_name: visibleColName
                }
              })
            )
          }
        })
      )
    }

    return tables.map((t) => ({ id: t.id }))
  }
}

export async function getTables(context: ToolContext, params: GetTablesInput) {
  const tool = new GetTablesTool(context)
  return tool.execute(params)
}

export const DISCOVERY_TOOLS: ReadonlyArray<ToolDefinition> = [
  {
    name: 'grist_get_workspaces',
    title: 'Get Workspaces',
    description: 'List accessible workspaces',
    purpose: 'List and filter workspaces',
    category: 'discovery',
    inputSchema: GetWorkspacesSchema,
    outputSchema: GetWorkspacesOutputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: getWorkspaces,
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
  },
  {
    name: 'grist_get_documents',
    title: 'Get Documents',
    description: 'Find documents by ID, name, or workspace',
    purpose: 'Find documents by ID, name, or workspace',
    category: 'discovery',
    inputSchema: GetDocumentsSchema,
    outputSchema: GetDocumentsOutputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: getDocuments,
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
  },
  {
    name: 'grist_get_tables',
    title: 'Get Grist Table Structure',
    description: 'Get table and column schema',
    purpose: 'Get table structure and schema',
    category: 'discovery',
    inputSchema: GetTablesSchema,
    outputSchema: GetTablesOutputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: getTables,
    docs: {
      overview:
        'Get table structure and schema. Detail levels: names (table IDs only ~20 tokens/table), columns (+ column names ~50 tokens/table), or full_schema (+ types, formulas, widget options ~200 tokens/table). Note: widgetOptions only returned with full_schema.',
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
  }
] as const
