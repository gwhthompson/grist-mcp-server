import type { GristClient } from './grist-client.js'

/** Regex to extract foreign table from Ref/RefList type (e.g., "Ref:People" → "People") */
const REF_FOREIGN_TABLE_REGEX = /^(?:Ref|RefList):(.+)$/

/** Regex to check if column type is a reference type */
const REF_TYPE_CHECK_REGEX = /^(?:Ref|RefList):/

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
  const match = columnType.match(REF_FOREIGN_TABLE_REGEX)
  // Safe: regex capture group (.+) guarantees match[1] exists when match is truthy
  return match?.[1] ?? null
}

/** Type guard to check if column type is a reference (Ref or RefList). */
export function isReferenceType(columnType: string): boolean {
  return REF_TYPE_CHECK_REGEX.test(columnType)
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
