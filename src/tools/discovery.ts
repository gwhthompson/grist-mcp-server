import { z } from 'zod'
import type { ToolCategory } from '../registry/tool-definitions.js'
import { READ_ONLY_ANNOTATIONS, type ToolContext, type ToolDefinition } from '../registry/types.js'

// Lazy imports to avoid circular dependency with tool-definitions.ts
// These are resolved at runtime when discoverTools is called
const getToolDefinitions = async () => {
  const { ALL_TOOLS, TOOLS_BY_CATEGORY } = await import('../registry/tool-definitions.js')
  return { ALL_TOOLS, TOOLS_BY_CATEGORY }
}

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

// =============================================================================
// grist_discover_tools - Progressive disclosure for tool schemas
// =============================================================================

const ToolCategorySchema = z.enum([
  'all',
  'discovery',
  'reading',
  'records',
  'tables',
  'columns',
  'documents',
  'document_structure',
  'webhooks',
  'utility'
])

export const DiscoverToolsSchema = z.strictObject({
  detail_level: z
    .enum(['names', 'descriptions', 'full'])
    .default('descriptions')
    .describe(
      'names: tool names only. descriptions: + one-line descriptions. full: + complete JSON schema'
    ),
  category: ToolCategorySchema.optional().describe('Filter by category. Omit for all tools'),
  tool_name: z
    .string()
    .optional()
    .describe('Get full schema for specific tool (overrides detail_level to "full")'),
  response_format: ResponseFormatSchema
})

export type DiscoverToolsInput = z.infer<typeof DiscoverToolsSchema>

interface ToolInfo {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  category?: string
  [key: string]: unknown
}

interface DiscoverToolsOutput {
  tools: ToolInfo[]
  total: number
  detail_level: string
  category?: string
  [key: string]: unknown
}

/**
 * Discover available Grist tools with progressive disclosure.
 * Use detail_level='names' for minimal tokens, 'descriptions' for quick overview,
 * or 'full' to get complete JSON schemas for specific tools.
 */
export async function discoverTools(
  _context: ToolContext,
  params: DiscoverToolsInput
): Promise<{
  content: Array<{ type: 'text'; text: string }>
  structuredContent: DiscoverToolsOutput
}> {
  const { detail_level, category, tool_name, response_format } = params

  // Lazy load to avoid circular dependency
  const { ALL_TOOLS, TOOLS_BY_CATEGORY } = await getToolDefinitions()

  // If specific tool requested, return full schema for that tool
  if (tool_name) {
    const tool = ALL_TOOLS.find((t) => t.name === tool_name)
    if (!tool) {
      const availableTools = ALL_TOOLS.map((t) => t.name).join(', ')
      throw new Error(`Tool "${tool_name}" not found. Available: ${availableTools}`)
    }

    const toolInfo: ToolInfo = {
      name: tool.name,
      description: tool.description,
      category: tool.category,
      inputSchema: z.toJSONSchema(tool.inputSchema, { reused: 'ref', io: 'input' }) as Record<
        string,
        unknown
      >
    }

    const result: DiscoverToolsOutput = {
      tools: [toolInfo],
      total: 1,
      detail_level: 'full'
    }

    if (response_format === 'json') {
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      }
    }

    // Markdown format
    let markdown = `## ${tool.name}\n\n`
    markdown += `**Description:** ${tool.description}\n\n`
    markdown += `**Category:** ${tool.category}\n\n`
    markdown += `**Input Schema:**\n\`\`\`json\n${JSON.stringify(toolInfo.inputSchema, null, 2)}\n\`\`\`\n`

    return {
      content: [{ type: 'text', text: markdown }],
      structuredContent: result
    }
  }

  // Get tools by category or all
  let tools: readonly ToolDefinition[]
  if (category && category !== 'all') {
    tools = TOOLS_BY_CATEGORY[category as ToolCategory] || []
  } else {
    tools = ALL_TOOLS
  }

  // Build tool info based on detail level
  const toolInfos: ToolInfo[] = tools.map((tool) => {
    if (detail_level === 'names') {
      return { name: tool.name }
    }
    if (detail_level === 'descriptions') {
      return { name: tool.name, description: tool.description, category: tool.category }
    }
    // full
    return {
      name: tool.name,
      description: tool.description,
      category: tool.category,
      inputSchema: z.toJSONSchema(tool.inputSchema, { reused: 'ref', io: 'input' }) as Record<
        string,
        unknown
      >
    }
  })

  const result: DiscoverToolsOutput = {
    tools: toolInfos,
    total: toolInfos.length,
    detail_level,
    ...(category && category !== 'all' ? { category } : {})
  }

  if (response_format === 'json') {
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    }
  }

  // Markdown format
  let markdown = `## Available Tools (${toolInfos.length})\n\n`
  if (category && category !== 'all') {
    markdown = `## ${category} Tools (${toolInfos.length})\n\n`
  }

  if (detail_level === 'names') {
    markdown += toolInfos.map((t) => `- ${t.name}`).join('\n')
  } else if (detail_level === 'descriptions') {
    markdown += '| Tool | Description |\n|------|-------------|\n'
    markdown += toolInfos.map((t) => `| \`${t.name}\` | ${t.description} |`).join('\n')
  } else {
    // full - show each tool with schema
    for (const tool of toolInfos) {
      markdown += `### ${tool.name}\n\n`
      markdown += `${tool.description}\n\n`
      markdown += `\`\`\`json\n${JSON.stringify(tool.inputSchema, null, 2)}\n\`\`\`\n\n`
    }
  }

  return {
    content: [{ type: 'text', text: markdown }],
    structuredContent: result
  }
}

export const GetWorkspacesSchema = z.strictObject({
  name_contains: z
    .string()
    .min(1, 'Search term must be at least 1 character')
    .max(100, 'Search term cannot exceed 100 characters')
    .optional()
    .describe('Filter by name (partial match)'),
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

  protected formatResponse(
    data: PaginatedResponse<FormattedWorkspace>,
    format: 'json' | 'markdown'
  ) {
    const { data: truncatedData } = truncateIfNeeded(data.items, format, {
      total: data.pagination.total,
      offset: data.pagination.offset,
      limit: data.pagination.limit,
      hasMore: data.pagination.hasMore,
      nextOffset: data.pagination.nextOffset
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

export const GetDocumentsSchema = z.strictObject({
  docId: DocIdSchema.optional().describe('Get specific document by ID'),
  name_contains: z
    .string()
    .min(1, 'Search term must be at least 1 character')
    .max(100, 'Search term cannot exceed 100 characters')
    .optional()
    .describe('Filter by name (partial match)'),
  workspaceId: WorkspaceIdSchema.optional().describe('Filter to workspace'),
  detail_level: z
    .enum(['summary', 'detailed'])
    .default('summary')
    .describe('summary: basic. detailed: +permissions, timestamps, urls'),
  response_format: ResponseFormatSchema,
  ...PaginationSchema.shape
})

export type GetDocumentsInput = z.infer<typeof GetDocumentsSchema>

interface FormattedDocument {
  id: string
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
        workspaceId: doc.workspace?.id,
        access: doc.access
      }
    }

    return {
      id: doc.id,
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

  protected formatResponse(
    data: PaginatedResponse<FormattedDocument>,
    format: 'json' | 'markdown'
  ) {
    const { data: truncatedData } = truncateIfNeeded(data.items, format, {
      total: data.pagination.total,
      offset: data.pagination.offset,
      limit: data.pagination.limit,
      hasMore: data.pagination.hasMore,
      nextOffset: data.pagination.nextOffset
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
        id: string
        label: string
        type: string
        isFormula: boolean
        formula: string | null
        widgetOptions: string | Record<string, unknown> | null
        visibleCol?: number | null
        visibleColName?: string | null
      }>
}

export class GetTablesTool extends GristTool<
  typeof GetTablesSchema,
  {
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
    const hasMore = offset + limit < total
    const nextOffset = hasMore ? offset + limit : null
    const itemsInPage = paginatedTables.length
    const pageNumber = Math.floor(offset / limit) + 1
    const totalPages = Math.ceil(total / limit)

    return {
      docId: params.docId,
      tableCount: itemsInPage,
      items: paginatedTables,
      total,
      offset,
      limit,
      hasMore,
      nextOffset,
      pageNumber,
      totalPages,
      itemsInPage
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
                  isFormula: c.fields.isFormula ?? false,
                  formula: c.fields.formula ?? null,
                  widgetOptions: parsedWidgetOptions,
                  visibleCol: c.fields.visibleCol ?? null,
                  visibleColName: visibleColName
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
    name: 'grist_discover_tools',
    title: 'Discover Tools',
    description: 'List available tools with progressive detail levels',
    purpose: 'Discover tool schemas on demand to reduce token usage',
    category: 'discovery',
    inputSchema: DiscoverToolsSchema,
    outputSchema: z.object({
      tools: z.array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          category: z.string().optional(),
          inputSchema: z.record(z.string(), z.unknown()).optional()
        })
      ),
      total: z.number(),
      detail_level: z.string(),
      category: z.string().optional()
    }),
    annotations: READ_ONLY_ANNOTATIONS,
    handler: discoverTools,
    core: true,
    docs: {
      overview:
        'Progressive disclosure for tool schemas. Use detail_level="names" (~50 tokens) for tool names, ' +
        '"descriptions" (~200 tokens) for overview, or "full" for complete JSON schemas. ' +
        'Filter by category or get specific tool schema with tool_name parameter.',
      examples: [
        { desc: 'List all tool names', input: { detail_level: 'names' } },
        {
          desc: 'Get schema category',
          input: { category: 'records', detail_level: 'descriptions' }
        },
        { desc: 'Get specific tool schema', input: { tool_name: 'grist_manage_records' } }
      ],
      errors: [
        { error: 'Tool not found', solution: 'Use detail_level="names" to see all available tools' }
      ]
    }
  },
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
    core: true,
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
    core: true,
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
    core: true,
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
