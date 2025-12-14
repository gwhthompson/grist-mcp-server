/**
 * Document Schema Resource
 *
 * URI Template: grist://docs/{docId}
 *
 * Returns complete schema for a Grist document including all tables and columns.
 * This is the primary value resource for LLM context loading.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js'
import type { ToolContext } from '../registry/types.js'
import {
  extractForeignTable,
  getColumnNameFromId,
  isReferenceType
} from '../services/column-resolver.js'
import type { DocumentInfo, WorkspaceInfo } from '../types.js'

interface ColumnSchema {
  id: string
  label: string
  type: string
  is_formula: boolean
  formula: string | null
  widgetOptions: Record<string, unknown> | null
  visibleCol: number | null
  visibleColName: string | null
}

interface TableSchema {
  id: string
  columns: ColumnSchema[]
}

interface DocumentSchema {
  docId: string
  documentName: string
  workspace: string | null
  tableCount: number
  tables: TableSchema[]
}

/**
 * Fetch document info to get name and workspace.
 */
async function fetchDocumentInfo(
  context: ToolContext,
  docId: string
): Promise<{ name: string; workspace: string | null }> {
  const { client } = context

  try {
    const doc = await client.get<DocumentInfo>(`/docs/${docId}`)
    return {
      name: doc.name,
      workspace: doc.workspace?.name ?? null
    }
  } catch {
    return { name: 'Unknown', workspace: null }
  }
}

/**
 * Fetch complete schema for a document.
 */
async function fetchDocumentSchema(context: ToolContext, docId: string): Promise<DocumentSchema> {
  const { client } = context

  // Fetch document info
  const docInfo = await fetchDocumentInfo(context, docId)

  // Fetch all tables
  const tablesResponse = await client.get<{ tables: Array<{ id: string }> }>(
    `/docs/${docId}/tables`
  )
  const tableList = tablesResponse.tables || []

  // Fetch columns for each table
  const tables: TableSchema[] = await Promise.all(
    tableList.map(async (table) => {
      const columnsResponse = await client.get<{
        columns: Array<{
          id: string
          fields: {
            label?: string
            type: string
            isFormula?: boolean
            formula?: string | null
            widgetOptions?: string | Record<string, unknown>
            visibleCol?: number
          }
        }>
      }>(`/docs/${docId}/tables/${table.id}/columns`)

      const columns: ColumnSchema[] = await Promise.all(
        (columnsResponse.columns || []).map(async (col) => {
          let parsedWidgetOptions: Record<string, unknown> | null = null
          if (col.fields.widgetOptions && col.fields.widgetOptions !== '') {
            parsedWidgetOptions =
              typeof col.fields.widgetOptions === 'string'
                ? JSON.parse(col.fields.widgetOptions)
                : (col.fields.widgetOptions as Record<string, unknown>)
          }

          let visibleColName: string | null = null
          if (col.fields.visibleCol && isReferenceType(col.fields.type)) {
            const foreignTable = extractForeignTable(col.fields.type)
            if (foreignTable) {
              try {
                visibleColName = await getColumnNameFromId(
                  client,
                  docId,
                  foreignTable,
                  col.fields.visibleCol
                )
              } catch {
                visibleColName = null
              }
            }
          }

          return {
            id: col.id,
            label: col.fields.label ?? col.id,
            type: col.fields.type,
            is_formula: col.fields.isFormula ?? false,
            formula: col.fields.formula ?? null,
            widgetOptions: parsedWidgetOptions,
            visibleCol: col.fields.visibleCol ?? null,
            visibleColName: visibleColName
          }
        })
      )

      return {
        id: table.id,
        columns
      }
    })
  )

  return {
    docId: docId,
    documentName: docInfo.name,
    workspace: docInfo.workspace,
    tableCount: tables.length,
    tables
  }
}

/**
 * List all available document schema resources.
 */
async function listDocumentSchemas(context: ToolContext) {
  const { client } = context
  const resources: Array<{ uri: string; name: string; description: string; mimeType: string }> = []
  const maxDocuments = 100

  const orgs = await client.get<Array<{ id: number }>>('/orgs')

  for (const org of orgs) {
    if (resources.length >= maxDocuments) break

    const workspaces = await client.get<WorkspaceInfo[]>(`/orgs/${org.id}/workspaces`)

    for (const ws of workspaces) {
      if (resources.length >= maxDocuments) break

      if (ws.docs) {
        for (const doc of ws.docs) {
          if (resources.length >= maxDocuments) break

          resources.push({
            uri: `grist://docs/${doc.id}`,
            name: `${doc.name} schema`,
            description: `Schema for document "${doc.name}" in workspace "${ws.name}"`,
            mimeType: 'application/json'
          })
        }
      }
    }
  }

  return { resources }
}

/**
 * Register the document schema resource template.
 */
export function registerDocumentSchemaResource(server: McpServer, context: ToolContext): void {
  const template = new ResourceTemplate('grist://docs/{docId}', {
    list: async () => listDocumentSchemas(context),
    complete: undefined
  })

  server.registerResource(
    'grist_document_schema',
    template,
    {
      description: 'Complete schema for a Grist document including all tables and columns',
      mimeType: 'application/json'
    },
    async (uri: URL, variables: Variables) => {
      const docId = variables.docId as string

      if (!docId) {
        throw new Error('Document ID is required')
      }

      const schema = await fetchDocumentSchema(context, docId)

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(schema, null, 2)
          }
        ]
      }
    }
  )

  console.error('  Registered: grist://docs/{docId} (document schema)')
}
