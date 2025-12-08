/**
 * Widget Resolver Service
 *
 * Handles resolution of page/widget names to numeric IDs.
 * Allows users to specify user-friendly names instead of internal numeric IDs.
 *
 * Reference: ./docs/reference/grist-pages-widgets.md
 */

import { ValidationError } from '../errors/ValidationError.js'
import type { SQLQueryResponse } from '../types.js'
import { first } from '../utils/array-helpers.js'
import { extractFields } from '../utils/grist-field-extractor.js'
import type { GristClient } from './grist-client.js'

/**
 * Type guard utilities for safely extracting typed values from Grist API responses
 */

/**
 * Assert and extract a number from an API response field
 * @throws {TypeError} if value is not a number
 */
function assertNumber(value: unknown, fieldName: string, context?: string): number {
  if (typeof value !== 'number') {
    const contextMsg = context ? ` in ${context}` : ''
    throw new TypeError(
      `Expected ${fieldName} to be a number${contextMsg}, got ${typeof value}. ` +
        `This may indicate an API response format change or invalid data in Grist metadata tables.`
    )
  }
  return value
}

/**
 * Assert and extract a string from an API response field
 * @throws {TypeError} if value is not a string
 */
function assertString(value: unknown, fieldName: string, context?: string): string {
  if (typeof value !== 'string') {
    const contextMsg = context ? ` in ${context}` : ''
    throw new TypeError(
      `Expected ${fieldName} to be a string${contextMsg}, got ${typeof value}. ` +
        `This may indicate an API response format change or invalid data in Grist metadata tables.`
    )
  }
  return value
}

/**
 * Safely extract number for error messages (returns fallback on type mismatch)
 * Use this for error message generation where we want to be defensive
 */
function safeExtractNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback
}

/**
 * Safely extract string for error messages (returns fallback on type mismatch)
 * Use this for error message generation where we want to be defensive
 */
function safeExtractString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

/**
 * Page information from _grist_Views table
 */
export interface PageInfo {
  id: number // View ID
  name: string // Page name
}

/**
 * Widget information from _grist_Views_section table
 */
export interface WidgetInfo {
  id: number // Section ID
  parentId: number // View ID (page)
  tableRef: number // Source table reference
  title: string // Widget title
  parentKey: string // Widget type
}

/**
 * Resolve a page name to numeric view ID
 *
 * @param client - Grist API client
 * @param docId - Document ID
 * @param pageName - Page name (or numeric ID)
 * @returns Numeric view ID
 * @throws {ValidationError} if page name is not found
 *
 * @example
 * ```typescript
 * // With string page name (auto-resolve)
 * const viewId = await resolvePageNameToViewId(client, docId, "Sales Dashboard")
 * // Returns: 42 (the numeric ID for the "Sales Dashboard" page)
 *
 * // With numeric ID (pass through)
 * const viewId = await resolvePageNameToViewId(client, docId, 42)
 * // Returns: 42 (unchanged)
 * ```
 */
export async function resolvePageNameToViewId(
  client: GristClient,
  docId: string,
  pageName: string | number
): Promise<number> {
  // If already numeric, return as-is (no resolution needed)
  if (typeof pageName === 'number') {
    return pageName
  }

  try {
    // Query _grist_Views table for page with matching name
    const query = `SELECT id, name FROM _grist_Views WHERE name = ?`
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: query,
      args: [pageName]
    })

    const pages = response.records || []

    if (pages.length === 0) {
      // Page not found - query all pages for helpful error message
      const allPagesResponse = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
        sql: 'SELECT name FROM _grist_Views ORDER BY name',
        args: []
      })

      const availablePages = allPagesResponse.records
        .map((r) => {
          const fields = extractFields(r)
          // Use safe extraction for error message generation (defensive)
          return safeExtractString(fields.name, 'unknown')
        })
        .join(', ')

      throw new ValidationError(
        'page_name',
        pageName,
        `Page "${pageName}" not found in document. ` +
          `Available pages: ${availablePages || 'none'}. ` +
          `Page names are case-sensitive. ` +
          `Try: grist_query_sql with "SELECT name FROM _grist_Views" to list all pages.`
      )
    }

    const fields = extractFields(pages[0])
    return assertNumber(fields.id, 'view id', '_grist_Views')
  } catch (error) {
    // Re-throw ValidationErrors as-is
    if (error instanceof ValidationError) {
      throw error
    }

    // API error - add context
    if (error instanceof Error) {
      throw new Error(`Failed to resolve page name "${pageName}": ${error.message}`)
    }

    throw error
  }
}

/**
 * Resolve a widget name to numeric section ID
 *
 * @param client - Grist API client
 * @param docId - Document ID
 * @param viewId - View ID (page) containing the widget
 * @param widgetName - Widget name/title (or numeric ID)
 * @returns Numeric section ID
 * @throws {ValidationError} if widget name is not found on page
 *
 * @example
 * ```typescript
 * // With string widget name (auto-resolve)
 * const sectionId = await resolveWidgetNameToSectionId(client, docId, 42, "Sales Table")
 * // Returns: 123 (the numeric ID for the "Sales Table" widget)
 *
 * // With numeric ID (pass through)
 * const sectionId = await resolveWidgetNameToSectionId(client, docId, 42, 123)
 * // Returns: 123 (unchanged)
 * ```
 */
export async function resolveWidgetNameToSectionId(
  client: GristClient,
  docId: string,
  viewId: number,
  widgetName: string | number
): Promise<number> {
  // If already numeric, return as-is (no resolution needed)
  if (typeof widgetName === 'number') {
    return widgetName
  }

  try {
    // Query _grist_Views_section table for widget with matching title
    const query = `
      SELECT id, title, parentId, tableRef, parentKey
      FROM _grist_Views_section
      WHERE parentId = ? AND title = ?
    `
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: query,
      args: [viewId, widgetName]
    })

    const widgets = response.records || []

    if (widgets.length === 0) {
      // Widget not found - query all widgets on this page for helpful error message
      const allWidgetsResponse = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
        sql: 'SELECT id, title, parentKey FROM _grist_Views_section WHERE parentId = ? ORDER BY id',
        args: [viewId]
      })

      const availableWidgets = allWidgetsResponse.records
        .map((r) => {
          const fields = extractFields(r)
          // Use safe extraction for error message generation (defensive)
          const id = safeExtractNumber(fields.id, 0)
          const title = safeExtractString(fields.title, '')
          const parentKey = safeExtractString(fields.parentKey, 'unknown')

          // Handle empty titles - show section ID for debugging
          const displayName =
            title && title.trim() !== '' ? `"${title}"` : `Untitled Widget (section_id: ${id})`

          return `${displayName} (${parentKey})`
        })
        .join(', ')

      throw new ValidationError(
        'widget',
        widgetName,
        `Widget "${widgetName}" not found on page (viewId=${viewId}). ` +
          `Available widgets: ${availableWidgets || 'none'}. ` +
          `Widget names are case-sensitive. ` +
          `\n\nTip: Many Grist widgets have empty titles. You can use the numeric section ID instead of the widget name. ` +
          `Example: Use 5 instead of "Sales Table". ` +
          `Try: grist_query_sql with "SELECT id, title, parentKey FROM _grist_Views_section WHERE parentId = ${viewId}" to list all widgets on this page.`
      )
    }

    // Extract ID from the matched widget - handle both nested and flat record structures
    const matchedWidget = widgets[0]
    const fields = extractFields(matchedWidget)
    const widgetId = safeExtractNumber(fields.id, 0)

    if (widgetId === 0) {
      throw new Error(
        `Widget "${widgetName}" was found but has invalid ID structure. ` +
          `Record structure: ${JSON.stringify(matchedWidget)}`
      )
    }

    return widgetId
  } catch (error) {
    // Re-throw ValidationErrors as-is
    if (error instanceof ValidationError) {
      throw error
    }

    // API error - add context
    if (error instanceof Error) {
      throw new Error(
        `Failed to resolve widget name "${widgetName}" on page (viewId=${viewId}): ${error.message}`
      )
    }

    throw error
  }
}

/**
 * Get all pages in a document
 *
 * Useful for caching and validation.
 *
 * @param client - Grist API client
 * @param docId - Document ID
 * @returns Array of page information
 */
export async function getAllPages(client: GristClient, docId: string): Promise<PageInfo[]> {
  try {
    // Only return views that have a _grist_Pages entry (visible pages)
    // Views without _grist_Pages entries are "hidden" (e.g., summary tables with keepPage: false)
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `
        SELECT v.id, v.name
        FROM _grist_Views v
        INNER JOIN _grist_Pages p ON p.viewRef = v.id
        ORDER BY p.pagePos, v.name
      `,
      args: []
    })

    return response.records.map((r) => {
      const rec = r as Record<string, unknown>
      const fields = rec.fields as Record<string, unknown> | undefined
      return {
        id: assertNumber(fields?.id || rec.id, 'page id', '_grist_Views'),
        name: assertString(fields?.name || rec.name, 'page name', '_grist_Views')
      }
    })
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch pages: ${error.message}`)
    }
    throw error
  }
}

/**
 * Get page details by page name
 *
 * Returns page ID, viewRef, and current position for page updates.
 *
 * @param client - Grist API client
 * @param docId - Document ID
 * @param pageName - Page name
 * @returns Page details with ID, viewRef, and pagePos
 * @throws {ValidationError} if page name is not found
 */
export async function getPageByName(
  client: GristClient,
  docId: string,
  pageName: string
): Promise<{ id: number; viewRef: number; pagePos: number }> {
  try {
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `
        SELECT p.id, p.viewRef, p.pagePos, v.name
        FROM _grist_Pages p
        JOIN _grist_Views v ON p.viewRef = v.id
        WHERE v.name = ?
      `,
      args: [pageName]
    })

    if (response.records.length === 0) {
      // Get all pages for error message
      const allPages = await getAllPages(client, docId)
      const availablePages = allPages.map((p) => p.name).join(', ')

      throw new ValidationError(
        'page',
        pageName,
        `Page "${pageName}" not found. ` +
          `Available pages: ${availablePages || 'none'}. ` +
          `Page names are case-sensitive.`
      )
    }

    const fields = extractFields(first(response.records, `Page "${pageName}"`))
    return {
      id: assertNumber(fields.id, 'page id', '_grist_Pages'),
      viewRef: assertNumber(fields.viewRef, 'view ref', '_grist_Pages'),
      pagePos: assertNumber(fields.pagePos, 'page position', '_grist_Pages')
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error
    }

    if (error instanceof Error) {
      throw new Error(`Failed to get page by name "${pageName}": ${error.message}`)
    }

    throw error
  }
}

/**
 * Get all widgets on a specific page
 *
 * Useful for caching and validation.
 *
 * @param client - Grist API client
 * @param docId - Document ID
 * @param viewId - View ID (page)
 * @returns Array of widget information
 */
export async function getAllWidgetsOnPage(
  client: GristClient,
  docId: string,
  viewId: number
): Promise<WidgetInfo[]> {
  try {
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `
        SELECT id, parentId, tableRef, title, parentKey
        FROM _grist_Views_section
        WHERE parentId = ?
        ORDER BY title
      `,
      args: [viewId]
    })

    return response.records.map((r) => {
      const rec = r as Record<string, unknown>
      const fields = rec.fields as Record<string, unknown> | undefined
      return {
        id: assertNumber(fields?.id || rec.id, 'widget id', '_grist_Views_section'),
        parentId: assertNumber(
          fields?.parentId || rec.parentId,
          'parent view id',
          '_grist_Views_section'
        ),
        tableRef: assertNumber(
          fields?.tableRef || rec.tableRef,
          'table ref',
          '_grist_Views_section'
        ),
        title: safeExtractString(fields?.title ?? rec.title, ''),
        parentKey: assertString(
          fields?.parentKey || rec.parentKey,
          'widget type',
          '_grist_Views_section'
        )
      }
    })
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch widgets for page (viewId=${viewId}): ${error.message}`)
    }
    throw error
  }
}

/**
 * Resolve column name to column ID within a specific table
 *
 * Helper for resolving link_field references in widget configurations.
 *
 * @param client - Grist API client
 * @param docId - Document ID
 * @param tableId - Table name
 * @param columnName - Column name (or numeric ID)
 * @returns Numeric column ID
 * @throws {ValidationError} if column name is not found
 */
export async function resolveColumnNameToColRef(
  client: GristClient,
  docId: string,
  tableId: string,
  columnName: string | number
): Promise<number> {
  // Validate tableId is not undefined/null/empty
  if (!tableId || tableId === 'undefined' || tableId === 'null') {
    throw new ValidationError(
      'tableId',
      tableId,
      `Cannot resolve column reference: tableId is ${tableId ? `"${tableId}"` : 'undefined or empty'}. ` +
        `This usually means a widget references a table that has been deleted. ` +
        `The widget's metadata contains a tableRef that points to a non-existent table in _grist_Tables. ` +
        `Try: grist_query_sql with "SELECT id, tableId FROM _grist_Tables" to verify which tables exist.`
    )
  }

  // If already numeric, return as-is
  if (typeof columnName === 'number') {
    return columnName
  }

  try {
    // Query _grist_Tables_column for column with matching colId
    const query = `
      SELECT c.id as colRef, c.colId
      FROM _grist_Tables_column c
      JOIN _grist_Tables t ON c.parentId = t.id
      WHERE t.tableId = ? AND c.colId = ?
    `
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: query,
      args: [tableId, columnName]
    })

    const columns = response.records || []

    if (columns.length === 0) {
      // Column not found - query all columns for helpful error message
      const allColumnsResponse = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
        sql: `
          SELECT c.colId
          FROM _grist_Tables_column c
          JOIN _grist_Tables t ON c.parentId = t.id
          WHERE t.tableId = ?
          ORDER BY c.colId
        `,
        args: [tableId]
      })

      const availableColumns = allColumnsResponse.records
        .map((r) => {
          const fields = extractFields(r)
          // Use safe extraction for error message generation (defensive)
          return safeExtractString(fields.colId, 'unknown')
        })
        .join(', ')

      throw new ValidationError(
        'column',
        columnName,
        `Column "${columnName}" not found in table "${tableId}". ` +
          `Available columns: ${availableColumns || 'none'}. ` +
          `Column names are case-sensitive.`
      )
    }

    const fields = extractFields(columns[0])
    return assertNumber(fields.colRef, 'column ref', `_grist_Tables_column for ${tableId}`)
  } catch (error) {
    // Re-throw ValidationErrors as-is
    if (error instanceof ValidationError) {
      throw error
    }

    // API error - add context
    if (error instanceof Error) {
      throw new Error(
        `Failed to resolve column "${columnName}" in table "${tableId}": ${error.message}`
      )
    }

    throw error
  }
}
