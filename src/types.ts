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
  | ['BulkAddRecord', string, number[], BulkColValues]
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
 */
export interface ColumnInfo {
  type: string
  label?: string
  isFormula?: boolean
  formula?: string
  widgetOptions?: any
}

/**
 * Column definition for table creation
 */
export interface ColumnDefinition {
  colId: string
  type: string
  label?: string
  isFormula?: boolean
  formula?: string
  widgetOptions?: any
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
