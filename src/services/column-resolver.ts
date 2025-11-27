import type { GristClient } from './grist-client.js'

export interface ColumnInfo {
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

export interface ColumnsApiResponse {
  columns: ColumnInfo[]
}

/**
 * Resolves column name to numeric colRef for visibleCol references.
 * @throws {Error} if column not found or API request fails
 */
export async function resolveVisibleCol(
  client: GristClient,
  docId: string,
  foreignTableId: string,
  visibleCol: string | number
): Promise<number> {
  if (typeof visibleCol === 'number') {
    return visibleCol
  }

  const columnName = visibleCol

  try {
    const response = await client.get<ColumnsApiResponse>(
      `/docs/${docId}/tables/${foreignTableId}/columns`
    )

    const columns = response.columns || []

    const matchingColumn = columns.find((col) => col.id === columnName)

    if (!matchingColumn) {
      const availableColumns = columns.map((c) => c.id).join(', ')
      throw new Error(
        `Column '${columnName}' not found in table '${foreignTableId}'. ` +
          `Available columns: ${availableColumns || 'none'}. ` +
          `Column names are case-sensitive.`
      )
    }

    return matchingColumn.fields.colRef
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found in table')) {
        throw error
      }
      throw new Error(
        `Failed to resolve column '${columnName}' in table '${foreignTableId}': ${error.message}`
      )
    }
    throw error
  }
}

/** Extracts foreign table name from Ref/RefList column type (e.g., "Ref:People" → "People"). */
export function extractForeignTable(columnType: string): string | null {
  const match = columnType.match(/^(?:Ref|RefList):(.+)$/)
  return match ? match[1] : null
}

/** Type guard to check if column type is a reference (Ref or RefList). */
export function isReferenceType(columnType: string): boolean {
  return /^(?:Ref|RefList):/.test(columnType)
}

/**
 * Resolves numeric column ID to column name.
 * @throws {Error} if column ID not found or API request fails
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
 * Gets numeric colRef for a column by name.
 * @throws {Error} if column not found or API request fails
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
