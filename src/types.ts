export type ResponseFormat = 'json' | 'markdown'

export type DetailLevelWorkspace = 'summary' | 'detailed'
export type DetailLevelTable = 'names' | 'columns' | 'full_schema'

export interface PaginationParams {
  offset?: number
  limit?: number
}

export interface PaginationMetadata {
  total: number
  offset: number
  limit: number
  hasMore: boolean
  nextOffset: number | null
  pageNumber: number
  totalPages: number
  itemsInPage: number
}

export interface MCPToolResponse {
  content: Array<{
    type: 'text'
    text: string
  }>
  structuredContent?: { [x: string]: unknown }
  isError?: boolean
  [key: string]: unknown
}

export interface TruncationInfo {
  truncated: boolean
  itemsReturned: number
  itemsRequested: number
  truncationReason: string
  suggestions: string[]
}

export interface StandardErrorResponse {
  success: false
  error: string
  errorCode?: string
  context?: Record<string, unknown>
  retryable?: boolean
  suggestions?: string[]
  [key: string]: unknown
}

/**
 * User-facing cell value type. Plain arrays are used (not internal Grist markers).
 * Codecs in cell-codecs.ts handle transformation to/from API format.
 */
export type CellValue = null | string | number | boolean | (string | number)[]

export type ColValues = { [colId: string]: CellValue[] }

export type BulkColValues = { [colId: string]: CellValue[] }

export type SingleColValues = { [colId: string]: CellValue }

// ============================================================================
// UserAction Interfaces (Type-Safe)
// ============================================================================
// These interfaces provide compile-time safety for building user actions.
// They are converted to tuple format by serializeUserAction() before API calls.

/** Base interface for all user actions with discriminant */
interface UserActionBase {
  readonly action: string
}

// --- Record Operations ---

export interface BulkAddRecordAction extends UserActionBase {
  readonly action: 'BulkAddRecord'
  readonly tableId: string
  readonly rowIds: (number | null)[]
  readonly columns: BulkColValues
}

export interface BulkUpdateRecordAction extends UserActionBase {
  readonly action: 'BulkUpdateRecord'
  readonly tableId: string
  readonly rowIds: number[]
  readonly columns: BulkColValues
}

export interface BulkRemoveRecordAction extends UserActionBase {
  readonly action: 'BulkRemoveRecord'
  readonly tableId: string
  readonly rowIds: number[]
}

export interface UpdateRecordAction extends UserActionBase {
  readonly action: 'UpdateRecord'
  readonly tableId: string
  readonly rowId: number
  readonly fields: SingleColValues
}

export interface AddRecordAction extends UserActionBase {
  readonly action: 'AddRecord'
  readonly tableId: string
  readonly rowId: number | null
  readonly fields: SingleColValues
}

// --- Table Operations ---

export interface AddTableAction extends UserActionBase {
  readonly action: 'AddTable'
  readonly tableName: string
  readonly columns: ColumnDefinition[]
}

export interface RenameTableAction extends UserActionBase {
  readonly action: 'RenameTable'
  readonly tableId: string
  readonly newTableId: string
}

export interface RemoveTableAction extends UserActionBase {
  readonly action: 'RemoveTable'
  readonly tableId: string
}

// --- Column Operations ---

export interface AddColumnAction extends UserActionBase {
  readonly action: 'AddColumn'
  readonly tableId: string
  readonly colId: string
  readonly colInfo: ColumnInfo
}

export interface AddHiddenColumnAction extends UserActionBase {
  readonly action: 'AddHiddenColumn'
  readonly tableId: string
  readonly colId: string
  readonly colInfo: ColumnInfo
}

export interface ModifyColumnAction extends UserActionBase {
  readonly action: 'ModifyColumn'
  readonly tableId: string
  readonly colId: string
  readonly updates: Partial<ColumnInfo>
}

export interface RemoveColumnAction extends UserActionBase {
  readonly action: 'RemoveColumn'
  readonly tableId: string
  readonly colId: string
}

export interface RenameColumnAction extends UserActionBase {
  readonly action: 'RenameColumn'
  readonly tableId: string
  readonly oldColId: string
  readonly newColId: string
}

// --- Display Formula Operations ---

export interface SetDisplayFormulaAction extends UserActionBase {
  readonly action: 'SetDisplayFormula'
  readonly tableId: string
  readonly colId: string | null
  readonly fieldRef: number | null
  readonly formula: string
}

// --- Conditional Formatting Operations ---

export interface AddEmptyRuleAction extends UserActionBase {
  readonly action: 'AddEmptyRule'
  readonly tableId: string
  readonly fieldRef: number | null
  readonly colRef: number | null
}

// --- Page/Widget Operations ---

export interface CreateViewSectionAction extends UserActionBase {
  readonly action: 'CreateViewSection'
  readonly tableRef: number
  readonly viewRef: number
  readonly widgetType: string
  readonly visibleCols: number[] | null
  readonly title: string | null
}

// --- Metadata Table Updates ---

export interface UpdateMetadataAction extends UserActionBase {
  readonly action: 'UpdateMetadata'
  readonly metaTableId: string
  readonly rowId: number
  readonly updates: Record<string, unknown>
}

/**
 * Union of all typed user action interfaces.
 * Use this type for building actions in a type-safe way.
 */
export type UserActionObject =
  | BulkAddRecordAction
  | BulkUpdateRecordAction
  | BulkRemoveRecordAction
  | UpdateRecordAction
  | AddRecordAction
  | AddTableAction
  | RenameTableAction
  | RemoveTableAction
  | AddColumnAction
  | AddHiddenColumnAction
  | ModifyColumnAction
  | RemoveColumnAction
  | RenameColumnAction
  | SetDisplayFormulaAction
  | AddEmptyRuleAction
  | CreateViewSectionAction
  | UpdateMetadataAction

// ============================================================================
// UserAction Tuple Format (Wire Format for Grist API)
// ============================================================================
// This is the tuple format expected by the Grist API.
// Use serializeUserAction() to convert UserActionObject → UserActionTuple.

export type UserActionTuple =
  // Record operations
  | ['BulkAddRecord', string, (number | null)[], BulkColValues]
  | ['BulkUpdateRecord', string, number[], BulkColValues]
  | ['BulkRemoveRecord', string, number[]]
  | ['UpdateRecord', string, number, SingleColValues]
  | ['AddRecord', string, number | null, SingleColValues]
  // Table operations
  | ['AddTable', string, ColumnDefinition[]]
  | ['RenameTable', string, string]
  | ['RemoveTable', string]
  // Column operations
  | ['AddColumn', string, string, ColumnInfo]
  | ['AddHiddenColumn', string, string, ColumnInfo]
  | ['ModifyColumn', string, string, Partial<ColumnInfo>]
  | ['RemoveColumn', string, string]
  | ['RenameColumn', string, string, string]
  // Display formula operations
  | ['SetDisplayFormula', string, string | null, number | null, string]
  // Conditional formatting operations
  | ['AddEmptyRule', string, number | null, number | null]
  // Page/Widget operations
  | ['CreateViewSection', number, number, string, number[] | null, string | null]
  | ['RemoveView', number] // Removes page/view without deleting underlying tables
  // Metadata table updates
  | ['UpdateRecord', string, number, Record<string, unknown>]

/**
 * @deprecated Use UserActionObject for type-safe action building.
 * This alias is kept for backward compatibility with existing code.
 */
export type UserAction = UserActionTuple

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

export interface ColumnInfo {
  type: string

  label?: string

  isFormula?: boolean

  formula?: string

  // GOTCHA: visibleCol is NOT part of widgetOptions - it's a separate DB column
  // Reference: ./docs/reference/grist-database-schema.md line 130
  widgetOptions?: string | { [key: string]: unknown }

  // Stored separately from widgetOptions - not inside the JSON
  // Reference: ./docs/reference/grist-database-schema.md line 138
  visibleCol?: string | number

  // Reference: ./docs/reference/grist-database-schema.md line 181
  rules?: string
}

export interface ColumnDefinition {
  colId: string
  type: string
  label?: string
  isFormula?: boolean
  formula?: string
  widgetOptions?: string | { [key: string]: unknown }
  visibleCol?: string | number
}

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

export interface TableInfo {
  id: string
  fields: {
    id: number
    colId: string
    label: string
    type: string
    isFormula: boolean
    formula?: string
    widgetOptions?: string | Record<string, unknown>
  }[]
}

export interface TablesApiResponse {
  tables: TableInfo[]
}

export interface GristRecord {
  id: number
  fields: { [colId: string]: CellValue }
  errors?: { [colId: string]: string }
}

export interface UpsertRecord {
  require: { [colId: string]: CellValue }
  fields: { [colId: string]: CellValue }
}

export interface ApplyRequest {
  actions: UserAction[]
}

export interface ApplyResponse {
  actionNum: number
  actionHash: string | null
  retValues: unknown[]
  isModification: boolean
}

export interface SQLQueryResponse {
  records: Array<{ [key: string]: CellValue }>
  tableId?: string
}

export interface RecordsResponse {
  records: GristRecord[]
}

export interface UpsertResponse {
  records: number[]
}

export type WidgetType =
  | 'record'
  | 'single'
  | 'detail'
  | 'chart'
  | 'form'
  | 'custom'
  | 'custom.calendar'

export type LayoutSpec =
  | { type: 'leaf'; leaf: number }
  | { type: 'hsplit'; children: LayoutSpec[]; splitRatio: number }
  | { type: 'vsplit'; children: LayoutSpec[]; splitRatio: number }

export type PagePattern =
  | 'master_detail'
  | 'hierarchical'
  | 'chart_dashboard'
  | 'form_table'
  | 'custom'

export type ChartType = 'bar' | 'pie' | 'donut' | 'area' | 'line' | 'scatter' | 'kaplan_meier'

export interface ChartOptions {
  multiseries?: boolean
  lineConnectGaps?: boolean
  lineMarkers?: boolean
  stacked?: boolean
  errorBars?: boolean
  invertYAxis?: boolean
  logYAxis?: boolean
  orientation?: 'h' | 'v'
  donutHoleSize?: number
  showTotal?: boolean
  textSize?: number
  aggregate?: string
}

export interface CreateViewSectionResult {
  tableRef: number
  viewRef: number
  sectionRef: number
}
