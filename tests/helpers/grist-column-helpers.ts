/**
 * Grist Column Helper Functions
 *
 * Centralized helpers for working with Grist column metadata in tests.
 * Eliminates duplication of column query logic across integration tests.
 */

import type { GristClient } from '../../src/client.js'
import type { DocId, TableId } from '../../src/schemas/ids.js'
import type { WidgetOptions } from '../../src/schemas/widget-options.js'
import type { GristColumnMetadata, GristColumnsResponse } from './test-types.js'

/**
 * Get column metadata by column ID
 *
 * @example
 * ```typescript
 * const col = await getColumnInfo(client, docId, 'Users', 'Email')
 * console.log(col.fields.type) // 'Text'
 * ```
 */
export async function getColumnInfo(
  client: GristClient,
  docId: DocId,
  tableId: TableId,
  colId: string
): Promise<GristColumnMetadata> {
  const response = await client.get<GristColumnsResponse>(
    `/docs/${docId}/tables/${tableId}/columns`
  )
  const column = response.columns.find((c) => c.id === colId)
  if (!column) {
    throw new Error(`Column ${colId} not found in table ${tableId}`)
  }
  return column
}

/**
 * Get numeric column reference (colRef) by column ID
 *
 * @example
 * ```typescript
 * const colRef = await getColumnNumericId(client, docId, 'Users', 'Email')
 * // Returns numeric ID like 42
 * ```
 */
export async function getColumnNumericId(
  client: GristClient,
  docId: DocId,
  tableId: TableId,
  colId: string
): Promise<number> {
  const col = await getColumnInfo(client, docId, tableId, colId)
  if (!col.fields.colRef) {
    throw new Error(`Column ${colId} has no colRef`)
  }
  return col.fields.colRef
}

/**
 * Parse widgetOptions JSON from column metadata
 *
 * Returns null if no widgetOptions or if parsing fails.
 *
 * @example
 * ```typescript
 * const col = await getColumnInfo(client, docId, 'Products', 'Price')
 * const opts = parseWidgetOptions(col)
 * if (opts && opts.numMode === 'currency') {
 *   console.log(opts.currency) // 'USD'
 * }
 * ```
 */
export function parseWidgetOptions(column: GristColumnMetadata): Partial<WidgetOptions> | null {
  if (!column.fields.widgetOptions) return null

  try {
    return JSON.parse(column.fields.widgetOptions) as Partial<WidgetOptions>
  } catch (_error) {
    console.error('Failed to parse widgetOptions:', column.fields.widgetOptions)
    return null
  }
}

/**
 * Get all columns for a table
 *
 * @example
 * ```typescript
 * const columns = await getAllColumns(client, docId, 'Users')
 * const emailCol = columns.find(c => c.id === 'Email')
 * ```
 */
export async function getAllColumns(
  client: GristClient,
  docId: DocId,
  tableId: TableId
): Promise<GristColumnMetadata[]> {
  const response = await client.get<GristColumnsResponse>(
    `/docs/${docId}/tables/${tableId}/columns`
  )
  return response.columns || []
}

/**
 * Find column by label (not ID)
 *
 * Useful when column ID differs from label.
 *
 * @example
 * ```typescript
 * const col = await getColumnByLabel(client, docId, 'People', 'Email Address')
 * console.log(col?.id) // 'Email'
 * ```
 */
export async function getColumnByLabel(
  client: GristClient,
  docId: DocId,
  tableId: TableId,
  label: string
): Promise<GristColumnMetadata | undefined> {
  const columns = await getAllColumns(client, docId, tableId)
  return columns.find((c) => c.fields.label === label)
}
