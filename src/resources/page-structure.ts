/**
 * Page Structure Resource
 *
 * URI Template: grist://docs/{docId}/pages
 *
 * Returns page and widget configuration for a Grist document.
 * Useful for understanding document layout before using grist_build_page.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js'
import type { ToolContext } from '../registry/types.js'
import { getAllPages, getAllWidgetsOnPage } from '../services/widget-resolver.js'
import type { SQLQueryResponse, WorkspaceInfo } from '../types.js'
import { extractFields } from '../utils/grist-field-extractor.js'

interface WidgetInfo {
  id: number
  title: string
  type: string
  tableId: string
  tableRef: number
}

interface PageInfo {
  id: number
  name: string
  widgets: WidgetInfo[]
}

interface PageStructureResult {
  docId: string
  pageCount: number
  pages: PageInfo[]
}

/**
 * Map Grist's internal widget type to friendly name.
 */
function mapWidgetType(parentKey: string): string {
  const typeMap: Record<string, string> = {
    record: 'Table',
    single: 'Card',
    detail: 'Card List',
    chart: 'Chart',
    custom: 'Custom',
    form: 'Form'
  }
  return typeMap[parentKey] || parentKey
}

/**
 * Fetch page structure for a document.
 */
async function fetchPageStructure(
  context: ToolContext,
  docId: string
): Promise<PageStructureResult> {
  const { client } = context

  // Get all pages
  const allPages = await getAllPages(client, docId)

  // Get table metadata for mapping tableRef to tableId
  const tableMetadata = new Map<number, string>()
  try {
    const tablesResult = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: 'SELECT id, tableId FROM _grist_Tables',
      args: []
    })

    for (const record of tablesResult.records) {
      const fields = extractFields(record)
      const id = fields.id as number
      const tableId = fields.tableId as string
      if (id && tableId) {
        tableMetadata.set(id, tableId)
      }
    }
  } catch {
    // Table metadata may not be available
  }

  // Build page details with widgets
  const pages: PageInfo[] = []

  for (const page of allPages) {
    const widgets = await getAllWidgetsOnPage(client, docId, page.id)

    const widgetInfos: WidgetInfo[] = widgets.map((widget) => ({
      id: widget.id,
      title: widget.title || `Untitled (${widget.parentKey})`,
      type: mapWidgetType(widget.parentKey),
      tableId: tableMetadata.get(widget.tableRef) || `table_ref_${widget.tableRef}`,
      tableRef: widget.tableRef
    }))

    pages.push({
      id: page.id,
      name: page.name,
      widgets: widgetInfos
    })
  }

  return {
    docId: docId,
    pageCount: pages.length,
    pages
  }
}

/**
 * List all available page structure resources.
 */
async function listPageStructures(context: ToolContext) {
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
            uri: `grist://docs/${doc.id}/pages`,
            name: `${doc.name} pages`,
            description: `Page structure for document "${doc.name}"`,
            mimeType: 'application/json'
          })
        }
      }
    }
  }

  return { resources }
}

/**
 * Register the page structure resource template.
 */
export function registerPageStructureResource(server: McpServer, context: ToolContext): void {
  const template = new ResourceTemplate('grist://docs/{docId}/pages', {
    list: async () => listPageStructures(context),
    complete: undefined
  })

  server.registerResource(
    'grist_page_structure',
    template,
    {
      description: 'Page and widget configuration for a Grist document',
      mimeType: 'application/json'
    },
    async (uri: URL, variables: Variables) => {
      const docId = variables.docId as string

      if (!docId) {
        throw new Error('Document ID is required')
      }

      const structure = await fetchPageStructure(context, docId)

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(structure, null, 2)
          }
        ]
      }
    }
  )

  console.error('  Registered: grist://docs/{docId}/pages (page structure)')
}
