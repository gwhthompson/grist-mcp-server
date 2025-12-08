import type { GristClient } from '../../services/grist-client.js'
import type { LayoutSpec, SQLQueryResponse } from '../../types.js'

/**
 * Gets the first section ID from a layout specification.
 * Recursively traverses split layouts to find the leftmost/topmost leaf.
 */
export function getFirstSectionId(layout: LayoutSpec): number {
  if (layout.type === 'leaf') {
    return layout.leaf
  }
  // For split layouts, get the first child's section
  if (layout.children && layout.children.length > 0) {
    // Safe: length check guarantees children[0] exists
    return getFirstSectionId(layout.children[0] as LayoutSpec)
  }
  return 0
}

/**
 * Fetches table metadata for a list of widget section IDs.
 * Returns a map of sectionId -> { tableRef, tableId }.
 */
export async function fetchWidgetTableMetadata(
  client: GristClient,
  docId: string,
  sectionIds: number[]
): Promise<Map<number, { tableRef: number; tableId: string }>> {
  const placeholders = sectionIds.map(() => '?').join(',')
  const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
    sql: `
      SELECT vs.id as section_id, vs.tableRef, t.tableId
      FROM _grist_Views_section vs
      JOIN _grist_Tables t ON vs.tableRef = t.id
      WHERE vs.id IN (${placeholders})
    `,
    args: sectionIds
  })

  const metadata = new Map<number, { tableRef: number; tableId: string }>()
  for (const record of response.records) {
    // Handle both nested {fields: {...}} and flat {...} response structures
    const data = (record as Record<string, unknown>).fields
      ? ((record as Record<string, unknown>).fields as Record<string, unknown>)
      : (record as Record<string, unknown>)

    metadata.set(data.section_id as number, {
      tableRef: data.tableRef as number,
      tableId: data.tableId as string
    })
  }
  return metadata
}
