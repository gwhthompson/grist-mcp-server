import type { GristClient } from '../../services/grist-client.js'
import type { SQLQueryResponse } from '../../types.js'

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
