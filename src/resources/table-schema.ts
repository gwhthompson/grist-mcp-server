/**
 * Table Schema Resource
 *
 * URI Template: grist://docs/{docId}/tables/{tableId}
 *
 * Returns detailed column schema for a specific table.
 * More granular than the full document schema - useful when working with a single table.
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
import type { WorkspaceInfo } from '../types.js'

interface ColumnSchema {
  id: string
  label: string
  type: string
  is_formula: boolean
  formula: string | null
  widget_options: Record<string, unknown> | null
  visible_col: number | null
  visible_col_name: string | null
}

interface TableSchemaResult {
  document_id: string
  table_id: string
  column_count: number
  columns: ColumnSchema[]
}

/**
 * Fetch schema for a specific table.
 */
async function fetchTableSchema(
  context: ToolContext,
  docId: string,
  tableId: string
): Promise<TableSchemaResult> {
  const { client } = context

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
  }>(`/docs/${docId}/tables/${tableId}/columns`)

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
        widget_options: parsedWidgetOptions,
        visible_col: col.fields.visibleCol ?? null,
        visible_col_name: visibleColName
      }
    })
  )

  return {
    document_id: docId,
    table_id: tableId,
    column_count: columns.length,
    columns
  }
}

/**
 * List all available table schema resources.
 */
async function listTableSchemas(context: ToolContext) {
  const { client } = context
  const resources: Array<{ uri: string; name: string; description: string; mimeType: string }> = []
  const maxTables = 200

  const orgs = await client.get<Array<{ id: number }>>('/orgs')

  for (const org of orgs) {
    if (resources.length >= maxTables) break

    const workspaces = await client.get<WorkspaceInfo[]>(`/orgs/${org.id}/workspaces`)

    for (const ws of workspaces) {
      if (resources.length >= maxTables) break

      if (ws.docs) {
        for (const doc of ws.docs) {
          if (resources.length >= maxTables) break

          try {
            const tablesResponse = await client.get<{ tables: Array<{ id: string }> }>(
              `/docs/${doc.id}/tables`
            )

            for (const table of tablesResponse.tables || []) {
              if (resources.length >= maxTables) break

              resources.push({
                uri: `grist://docs/${doc.id}/tables/${table.id}`,
                name: `${table.id} in ${doc.name}`,
                description: `Schema for table "${table.id}" in document "${doc.name}"`,
                mimeType: 'application/json'
              })
            }
          } catch {
            // Skip documents we can't access
          }
        }
      }
    }
  }

  return { resources }
}

/**
 * Register the table schema resource template.
 */
export function registerTableSchemaResource(server: McpServer, context: ToolContext): void {
  const template = new ResourceTemplate('grist://docs/{docId}/tables/{tableId}', {
    list: async () => listTableSchemas(context),
    complete: undefined
  })

  server.registerResource(
    'grist_table_schema',
    template,
    {
      description: 'Detailed column schema for a specific Grist table',
      mimeType: 'application/json'
    },
    async (uri: URL, variables: Variables) => {
      const docId = variables.docId as string
      const tableId = variables.tableId as string

      if (!docId) {
        throw new Error('Document ID is required')
      }
      if (!tableId) {
        throw new Error('Table ID is required')
      }

      const schema = await fetchTableSchema(context, docId, tableId)

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

  console.error('  Registered: grist://docs/{docId}/tables/{tableId} (table schema)')
}
