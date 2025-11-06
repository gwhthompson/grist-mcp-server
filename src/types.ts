/**
 * Type definitions for Grist MCP Server
 * These types are based on grist-core/app/common but adapted for MCP use
 */

// ============================================================================
// MCP-Specific Types
// ============================================================================

export type ResponseFormat = 'json' | 'markdown'

export type DetailLevelWorkspace = 'summary' | 'detailed'
export type DetailLevelTable = 'names' | 'columns' | 'full_schema'

export interface PaginationParams {
  offset?: number // Default: 0
  limit?: number // Default: 100, Max: 1000
}

export interface PaginationMetadata {
  total: number
  offset: number
  limit: number
  has_more: boolean
  next_offset: number | null
}

export interface MCPToolResponse {
  content: Array<{
    type: 'text'
    text: string // Markdown or JSON string based on response_format
  }>
  structuredContent?: any // Always include - machine-readable data
  isError?: boolean // True for error responses
  [key: string]: unknown // Index signature for MCP SDK compatibility
}

export interface TruncationInfo {
  truncated: boolean
  items_returned: number
  items_requested: number
  truncation_reason: string
  suggestions: string[]
}

// ============================================================================
// Grist API Types (based on grist-core/app/common)
// ============================================================================

/**
 * Cell value types from Grist
 */
export type CellValue = null | string | number | boolean | [string, ...unknown[]] // Grist encoded values

/**
 * Column values in columnar format
 */
export type ColValues = { [colId: string]: CellValue[] }

/**
 * Bulk column values for bulk operations
 */
export type BulkColValues = { [colId: string]: CellValue[] }

/**
 * UserAction types for document mutations
 * Format: [actionType, ...args]
 */
export type UserAction =
  // Record operations
  | ['BulkAddRecord', string, (number | null)[], BulkColValues] // null for new records
  | ['BulkUpdateRecord', string, number[], BulkColValues]
  | ['BulkRemoveRecord', string, number[]]
  // Table operations
  | ['AddTable', string, ColumnDefinition[]]
  | ['RenameTable', string, string]
  | ['RemoveTable', string]
  // Column operations
  | ['AddColumn', string, string, ColumnInfo]
  | ['ModifyColumn', string, string, Partial<ColumnInfo>]
  | ['RemoveColumn', string, string]
  | ['RenameColumn', string, string, string]
  // Display formula operations
  | ['SetDisplayFormula', string, string | null, number | null, string]

/**
 * Column type definitions
 */
export type ColumnType =
  | 'Text'
  | 'Numeric'
  | 'Int'
  | 'Bool'
  | 'Date'
  | 'DateTime'
  | 'Choice'
  | 'ChoiceList'
  | 'Ref'
  | 'RefList'
  | 'Attachments'

/**
 * Column information structure
 *
 * Based on Grist's _grist_Tables_column schema where widgetOptions and visibleCol
 * are stored in separate database columns.
 *
 * Reference: ./docs/reference/grist-database-schema.md lines 122-143
 */
export interface ColumnInfo {
  /** Column type (e.g., "Text", "Numeric", "Ref:People", "RefList:Tags") */
  type: string

  /** Human-readable label for the column */
  label?: string

  /** Whether this is a formula column */
  isFormula?: boolean

  /** Python formula expression (if isFormula is true) */
  formula?: string

  /**
   * Widget display options as JSON string or object.
   *
   * The MCP server accepts objects for convenience and stringifies them before
   * sending to Grist. The Grist API requires a JSON string.
   *
   * Examples:
   * - Numeric: { "numMode": "currency", "currency": "USD" }
   * - Choice: { "choices": ["Red", "Blue", "Green"] }
   * - Text: { "alignment": "right", "wrap": true }
   *
   * IMPORTANT: Do NOT put visibleCol in widgetOptions - it's a separate field.
   * The server extracts visibleCol from widgetOptions if provided there for
   * convenience, but it's stored separately in Grist's database.
   *
   * Reference: ./docs/reference/grist-database-schema.md line 130
   */
  widgetOptions?: string | { [key: string]: unknown }

  /**
   * For Ref/RefList columns: specifies which column to display from referenced table.
   *
   * This is stored in a SEPARATE database column from widgetOptions
   * (_grist_Tables_column.visibleCol, not inside widgetOptions JSON).
   *
   * Value must be a numeric column reference (colRef).
   * The MCP server auto-resolves string column names to numeric IDs.
   *
   * Example: 456 (displays column with colRef=456 from the foreign table)
   *
   * Note: Users may provide this in widgetOptions.visibleCol for convenience.
   * The server extracts it and places it here as a top-level field.
   *
   * Reference: ./docs/reference/grist-database-schema.md line 138
   */
  visibleCol?: number
}

/**
 * Column definition for table creation
 *
 * Identical to ColumnInfo but includes colId (required for table creation).
 */
export interface ColumnDefinition {
  /** Column identifier (e.g., "Email", "Phone_Number") */
  colId: string

  /** Column type (e.g., "Text", "Numeric", "Ref:People") */
  type: string

  /** Human-readable label for the column */
  label?: string

  /** Whether this is a formula column */
  isFormula?: boolean

  /** Python formula expression (if isFormula is true) */
  formula?: string

  /**
   * Widget display options as JSON string or object.
   * See ColumnInfo.widgetOptions for details.
   */
  widgetOptions?: string | { [key: string]: unknown }

  /**
   * For Ref/RefList columns: specifies which column to display from referenced table.
   * See ColumnInfo.visibleCol for details.
   */
  visibleCol?: number
}

/**
 * Workspace information from API
 */
export interface WorkspaceInfo {
  id: number
  name: string
  org: string
  orgDomain?: string
  orgName?: string
  access: string
  docs?: DocumentInfo[]
  createdAt?: string
  updatedAt?: string
}

/**
 * Document information from API
 */
export interface DocumentInfo {
  id: string
  name: string
  workspace?: {
    id: number
    name: string
  }
  access: string
  isPinned?: boolean
  createdAt?: string
  updatedAt?: string
  urlId?: string
  trunkId?: string
  type?: string
  public?: boolean
}

/**
 * Table information from API
 */
export interface TableInfo {
  id: string
  fields: {
    id: number
    colId: string
    label: string
    type: string
    isFormula: boolean
    formula?: string
    widgetOptions?: any
  }[]
}

/**
 * API response for GET /docs/{docId}/tables
 */
export interface TablesApiResponse {
  tables: TableInfo[]
}

/**
 * Record structure for API operations
 */
export interface Record {
  id: number
  fields: { [colId: string]: CellValue }
}

/**
 * Upsert record format for PUT /records endpoint
 */
export interface UpsertRecord {
  require: { [colId: string]: CellValue }
  fields: { [colId: string]: CellValue }
}

/**
 * Apply endpoint request
 */
export interface ApplyRequest {
  actions: UserAction[]
}

/**
 * Apply endpoint response
 */
export interface ApplyResponse {
  actionNum: number
  retValues: any[]
}

/**
 * Query SQL response
 */
export interface SQLQueryResponse {
  records: Array<{ [key: string]: CellValue }>
  tableId?: string
}

/**
 * Records response from GET /tables/{tableId}/records
 */
export interface RecordsResponse {
  records: Record[]
}

/**
 * Upsert response from PUT /tables/{tableId}/records
 */
export interface UpsertResponse {
  records: number[] // Array of record IDs
}
