/**
 * Column Resolver Service
 *
 * Handles resolution of column names to numeric column IDs for visibleCol properties.
 * This allows users to specify user-friendly column names (e.g., "Name") instead of
 * internal numeric IDs (e.g., 456) when setting visibleCol for Reference columns.
 */

import type { GristClient } from './grist-client.js'
import type { AnyWidgetOptions } from '../schemas/widget-options.js'

/**
 * Column information from Grist API
 */
interface ColumnInfo {
  id: string // Column ID (e.g., "Name", "Email")
  fields: {
    colRef: number // Numeric column reference ID
    type: string
    label?: string
    isFormula?: boolean
    formula?: string
    widgetOptions?: string // Widget options as JSON string
  }
}

/**
 * API response structure for column queries
 */
interface ColumnsApiResponse {
  columns: ColumnInfo[]
}

/**
 * Resolve a visibleCol value to a numeric column ID
 *
 * @param client - Grist API client
 * @param docId - Document ID containing the foreign table
 * @param foreignTableId - The foreign table ID (extracted from Ref:TableName or RefList:TableName)
 * @param visibleCol - Either a column name (string) or numeric column ID (number)
 * @returns Numeric column ID ready to use in Grist API
 * @throws {Error} if column name is not found or API request fails
 *
 * @example
 * ```typescript
 * // With string column name (auto-resolve)
 * const colId = await resolveVisibleCol(client, docId, "People", "Name")
 * // Returns: 456 (the numeric ID for the "Name" column)
 *
 * // With numeric column ID (pass through)
 * const colId = await resolveVisibleCol(client, docId, "People", 456)
 * // Returns: 456 (unchanged)
 * ```
 */
export async function resolveVisibleCol(
  client: GristClient,
  docId: string,
  foreignTableId: string,
  visibleCol: string | number
): Promise<number> {
  // If already numeric, return as-is (no resolution needed)
  if (typeof visibleCol === 'number') {
    return visibleCol
  }

  // String column name - need to resolve to numeric ID
  const columnName = visibleCol

  try {
    // Query the foreign table's columns
    const response = await client.get<ColumnsApiResponse>(
      `/docs/${docId}/tables/${foreignTableId}/columns`
    )

    const columns = response.columns || []

    // Find column by ID (case-sensitive exact match)
    const matchingColumn = columns.find((col) => col.id === columnName)

    if (!matchingColumn) {
      // Column not found - provide helpful error message
      const availableColumns = columns.map((c) => c.id).join(', ')
      throw new Error(
        `Column '${columnName}' not found in table '${foreignTableId}'. ` +
          `Available columns: ${availableColumns || 'none'}. ` +
          `Column names are case-sensitive.`
      )
    }

    // Return the numeric column reference ID
    return matchingColumn.fields.colRef
  } catch (error) {
    // Re-throw with more context if this is a generic error
    if (error instanceof Error) {
      if (error.message.includes('not found in table')) {
        // This is our error from above - re-throw as-is
        throw error
      }
      // API error - add context
      throw new Error(
        `Failed to resolve column '${columnName}' in table '${foreignTableId}': ${error.message}`
      )
    }
    throw error
  }
}

/**
 * Extract foreign table ID from a Ref or RefList type string
 *
 * @param columnType - Column type string (e.g., "Ref:People", "RefList:Tags")
 * @returns Foreign table ID or null if not a reference type
 *
 * @example
 * ```typescript
 * extractForeignTable("Ref:People")     // Returns: "People"
 * extractForeignTable("RefList:Tags")   // Returns: "Tags"
 * extractForeignTable("Text")           // Returns: null
 * ```
 */
export function extractForeignTable(columnType: string): string | null {
  const match = columnType.match(/^(?:Ref|RefList):(.+)$/)
  return match ? match[1] : null
}

/**
 * Check if a column type is a reference type that supports visibleCol
 *
 * @param columnType - Column type string
 * @returns True if this is a Ref or RefList type
 *
 * @example
 * ```typescript
 * isReferenceType("Ref:People")      // Returns: true
 * isReferenceType("RefList:Tags")    // Returns: true
 * isReferenceType("Text")            // Returns: false
 * ```
 */
export function isReferenceType(columnType: string): boolean {
  return /^(?:Ref|RefList):/.test(columnType)
}

/**
 * Get column name from numeric column ID (reverse of resolveVisibleCol)
 *
 * @param client - Grist API client
 * @param docId - Document ID
 * @param tableId - Table ID containing the column
 * @param numericColId - Numeric column reference ID
 * @returns Column name (colId)
 * @throws {Error} if column ID is not found
 *
 * @example
 * ```typescript
 * const colName = await getColumnNameFromId(client, docId, "People", 456)
 * // Returns: "Name"
 * ```
 */
export async function getColumnNameFromId(
  client: GristClient,
  docId: string,
  tableId: string,
  numericColId: number
): Promise<string> {
  try {
    const response = await client.get<ColumnsApiResponse>(
      `/docs/${docId}/tables/${tableId}/columns`
    )

    const columns = response.columns || []
    const matchingColumn = columns.find((col) => col.fields.colRef === numericColId)

    if (!matchingColumn) {
      throw new Error(
        `Column with ID ${numericColId} not found in table '${tableId}'. ` +
          `This may indicate an invalid visibleCol value.`
      )
    }

    return matchingColumn.id
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found in table')) {
        throw error
      }
      throw new Error(
        `Failed to resolve column ID ${numericColId} in table '${tableId}': ${error.message}`
      )
    }
    throw error
  }
}

/**
 * Get numeric column reference (colRef) for a column by its name
 *
 * @param client - Grist API client
 * @param docId - Document ID
 * @param tableId - Table ID containing the column
 * @param colId - Column name/ID
 * @returns Numeric column reference ID
 * @throws {Error} if column is not found
 *
 * @example
 * ```typescript
 * const colRef = await getColumnRef(client, docId, "Tasks", "Lead")
 * // Returns: 789 (the numeric colRef for the "Lead" column)
 * ```
 */
export async function getColumnRef(
  client: GristClient,
  docId: string,
  tableId: string,
  colId: string
): Promise<number> {
  try {
    const response = await client.get<ColumnsApiResponse>(
      `/docs/${docId}/tables/${tableId}/columns`
    )

    const columns = response.columns || []
    const matchingColumn = columns.find((col) => col.id === colId)

    if (!matchingColumn) {
      const availableColumns = columns.map((c) => c.id).join(', ')
      throw new Error(
        `Column '${colId}' not found in table '${tableId}'. ` +
          `Available columns: ${availableColumns || 'none'}.`
      )
    }

    return matchingColumn.fields.colRef
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found in table')) {
        throw error
      }
      throw new Error(
        `Failed to get column reference for '${colId}' in table '${tableId}': ${error.message}`
      )
    }
    throw error
  }
}
