import {
  type ToolContext,
  type ToolDefinition,
  WRITE_SAFE_ANNOTATIONS
} from '../../registry/types.js'
import { ApplyResponseSchema } from '../../schemas/api-responses.js'
import { UpdatePageOutputSchema } from '../../schemas/output-schemas.js'
import { type UpdatePageInput, UpdatePageSchema } from '../../schemas/pages-widgets.js'
import { getPageByName } from '../../services/widget-resolver.js'
import type { ApplyResponse, SQLQueryResponse, UserAction } from '../../types.js'
import { validateRetValues } from '../../validators/apply-response.js'
import { GristTool } from '../base/GristTool.js'

class UpdatePageTool extends GristTool<typeof UpdatePageSchema, unknown> {
  constructor(context: ToolContext) {
    super(context, UpdatePageSchema)
  }

  protected async executeInternal(params: UpdatePageInput) {
    const { docId, operations } = params
    const actions: UserAction[] = []
    const summary: string[] = []

    // Track in-flight renames for atomicity within the batch
    // Maps old name -> new name for renames that haven't been committed yet
    const pageNameMap = new Map<string, string>()

    // Cache page info to avoid duplicate lookups
    // Keyed by CURRENT name (after any renames)
    const pageInfoCache = new Map<string, { id: number; viewRef: number; pagePos: number }>()

    /**
     * Resolves a page name, accounting for in-flight renames in the current batch.
     * - If the name was renamed earlier in this batch, throws an error with guidance
     * - If the name is a NEW name from an earlier rename, uses cached info
     * - Otherwise, fetches from database and caches the result
     */
    const resolvePageName = async (
      pageName: string
    ): Promise<{ id: number; viewRef: number; pagePos: number }> => {
      // Check if this page was renamed in an earlier operation (using OLD name = error)
      const newNameFromRename = pageNameMap.get(pageName)
      if (newNameFromRename) {
        throw new Error(
          `Page "${pageName}" was renamed to "${newNameFromRename}" in an earlier operation. ` +
            `Use "${newNameFromRename}" instead.`
        )
      }

      // Check cache (includes pages renamed TO this name)
      const cached = pageInfoCache.get(pageName)
      if (cached) {
        return cached
      }

      // Fetch from database
      const page = await getPageByName(this.client, docId, pageName)
      pageInfoCache.set(pageName, page)
      return page
    }

    for (const op of operations) {
      switch (op.action) {
        case 'rename': {
          // Get page viewRef by name (using resolver for atomicity)
          const page = await resolvePageName(op.page_name)

          // Track this rename for subsequent operations
          pageNameMap.set(op.page_name, op.new_name)
          // Cache the page info under the NEW name so subsequent ops can find it
          pageInfoCache.set(op.new_name, page)

          // UpdateRecord to _grist_Views to change name
          actions.push(['UpdateRecord', '_grist_Views', page.viewRef, { name: op.new_name }])
          summary.push(`Renamed "${op.page_name}" to "${op.new_name}"`)
          break
        }

        case 'reorder': {
          // Get target page (using resolver for atomicity)
          const targetPage = await resolvePageName(op.page_name)
          let newPagePos: number

          if (typeof op.position === 'number') {
            // Absolute position
            newPagePos = op.position
          } else if ('before' in op.position) {
            // Position before another page (using resolver for atomicity)
            const refPage = await resolvePageName(op.position.before)
            // Fractional positioning: Use reference page's position - 0.5 to insert before.
            // This avoids reordering all pages - Grist will sort by pagePos automatically.
            newPagePos = refPage.pagePos - 0.5
          } else {
            // Position after another page (using resolver for atomicity)
            const refPage = await resolvePageName(op.position.after)
            // Fractional positioning: Use reference page's position + 0.5 to insert after.
            newPagePos = refPage.pagePos + 0.5
          }

          // UpdateRecord to _grist_Pages with new pagePos
          actions.push(['UpdateRecord', '_grist_Pages', targetPage.id, { pagePos: newPagePos }])
          summary.push(`Moved "${op.page_name}" to position ${newPagePos}`)
          break
        }

        case 'delete': {
          // Get page info (using resolver for atomicity)
          const page = await resolvePageName(op.page_name)

          // Delete page from _grist_Pages
          actions.push(['BulkRemoveRecord', '_grist_Pages', [page.id]])
          summary.push(`Deleted page "${op.page_name}" (id: ${page.id})`)

          // Optionally delete underlying data tables
          if (op.delete_data) {
            // Query to find table IDs associated with widgets on this page
            const tablesResp = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
              sql: `
                SELECT DISTINCT t.id, t.tableId
                FROM _grist_Views_section vs
                JOIN _grist_Tables t ON vs.tableRef = t.id
                WHERE vs.parentId = ?
              `,
              args: [page.viewRef]
            })

            const tableIds: Array<{ id: number; tableId: string }> = tablesResp.records.map((r) => {
              const rec = r as Record<string, unknown>
              const fields = rec.fields as Record<string, unknown> | undefined
              return {
                id: (fields?.id || rec.id) as number,
                tableId: (fields?.tableId || rec.tableId) as string
              }
            })

            // Delete each table
            for (const table of tableIds) {
              actions.push(['RemoveTable', table.tableId])
              summary.push(
                `⚠️  DELETED TABLE "${table.tableId}" (id: ${table.id}) - DATA PERMANENTLY LOST`
              )
            }
          }
          break
        }

        // NOTE: Page duplication removed in v2.2.5
        // Reason: Implementation was incomplete and created corrupt page state (wrong tables, no linking, missing configs).
        // For agents: Use grist_build_page to create new pages programmatically.

        default: {
          const _exhaustive: never = op
          throw new Error(`Unknown operation`)
        }
      }
    }

    // Execute all actions
    const updatePageResponse = await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      actions,
      {
        schema: ApplyResponseSchema,
        context: `Updating ${operations.length} page operation(s)`
      }
    )

    validateRetValues(updatePageResponse, {
      context: `Updating ${operations.length} page operation(s)`
    })

    // Return plain data - GristTool base class will handle formatting via formatResponse()
    return {
      success: true,
      operations_completed: operations.length,
      summary
    } as unknown
  }
}

export async function updatePage(context: ToolContext, params: UpdatePageInput) {
  const tool = new UpdatePageTool(context)
  return tool.execute(params)
}

export const UPDATE_PAGE_DEFINITION: ToolDefinition = {
  name: 'grist_update_page',
  title: 'Update Page',
  description:
    'Rename, reorder, or delete pages.\n' +
    'NOT FOR: New pages -> use grist_build_page; widgets -> use grist_configure_widget\n' +
    'Params: docId, operations (action: rename/reorder/delete)\n' +
    'Ex: {operations:[{action:"rename",page_name:"Old",new_name:"New"}]}',
  purpose: 'Rename, reorder, or delete existing pages',
  category: 'document_structure',
  inputSchema: UpdatePageSchema,
  outputSchema: UpdatePageOutputSchema,
  annotations: WRITE_SAFE_ANNOTATIONS,
  handler: updatePage,
  docs: {
    overview:
      'Manages existing pages. Rename pages, reorder them in the navigation, or delete them. ' +
      'Use delete_data=true to also delete underlying tables (destructive).',
    examples: [
      {
        desc: 'Rename page',
        input: {
          docId: 'abc123',
          operations: [{ action: 'rename', page_name: 'Old Name', new_name: 'New Name' }]
        }
      },
      {
        desc: 'Reorder page',
        input: {
          docId: 'abc123',
          operations: [{ action: 'reorder', page_name: 'Dashboard', position: { after: 'Home' } }]
        }
      },
      {
        desc: 'Delete page',
        input: {
          docId: 'abc123',
          operations: [{ action: 'delete', page_name: 'Obsolete', delete_data: false }]
        }
      }
    ],
    errors: [
      { error: 'Page not found', solution: 'Check spelling (case-sensitive)' },
      { error: 'Cannot delete last page', solution: 'Create another page first' }
    ]
  }
}
