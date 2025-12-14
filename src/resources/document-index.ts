/**
 * Document Index Resource
 *
 * URI: grist://docs
 *
 * Returns a list of all accessible Grist documents with workspace info.
 * This is the entry point for resource discovery.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from '../registry/types.js'
import type { WorkspaceInfo } from '../types.js'

interface DocumentIndexEntry {
  id: string
  name: string
  workspace: {
    id: number
    name: string
  }
  access: string
}

/**
 * Fetch all accessible documents across all workspaces.
 */
async function fetchAllDocuments(context: ToolContext): Promise<DocumentIndexEntry[]> {
  const { client } = context
  const documents: DocumentIndexEntry[] = []
  const maxDocuments = 500 // Reasonable limit for resource listing

  const orgs = await client.get<Array<{ id: number; name: string }>>('/orgs')

  for (const org of orgs) {
    if (documents.length >= maxDocuments) break

    const workspaces = await client.get<WorkspaceInfo[]>(`/orgs/${org.id}/workspaces`)

    for (const ws of workspaces) {
      if (documents.length >= maxDocuments) break

      if (ws.docs) {
        for (const doc of ws.docs) {
          if (documents.length >= maxDocuments) break

          documents.push({
            id: doc.id,
            name: doc.name,
            workspace: {
              id: ws.id,
              name: ws.name
            },
            access: doc.access
          })
        }
      }
    }
  }

  return documents
}

/**
 * Register the document index resource.
 *
 * This is a static resource (not a template) that returns all accessible documents.
 */
export function registerDocumentIndexResource(server: McpServer, context: ToolContext): void {
  server.registerResource(
    'grist_documents',
    'grist://docs',
    {
      description: 'Index of all accessible Grist documents with workspace info',
      mimeType: 'application/json'
    },
    async (uri) => {
      const documents = await fetchAllDocuments(context)

      const content = {
        uri: uri.href,
        total: documents.length,
        documents: documents.map((doc) => ({
          id: doc.id,
          name: doc.name,
          workspace: doc.workspace.name,
          workspaceId: doc.workspace.id,
          access: doc.access,
          resource_uri: `grist://docs/${doc.id}`
        }))
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(content, null, 2)
          }
        ]
      }
    }
  )

  console.error('  Registered: grist://docs (document index)')
}
