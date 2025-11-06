/**
 * Type definitions for Grist Document Actions API
 * 
 * This file provides comprehensive TypeScript definitions for all actions
 * that can be used via the POST /api/docs/:docId/apply endpoint.
 * 
 * Validated against gristlabs/grist-core repository
 * @see https://github.com/gristlabs/grist-core
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * A cell value can be any JSON-serializable value
 */
export type CellValue = null | number | string | boolean | [string, ...unknown[]];

/**
 * Column values as a mapping from column ID to cell value
 */
export interface ColValues {
  [colId: string]: CellValue;
}

/**
 * Bulk column values as a mapping from column ID to array of cell values
 */
export interface BulkColValues {
  [colId: string]: CellValue[];
}

// ============================================================================
// Widget Options - FULLY VALIDATED AND COMPREHENSIVE Schema
// ============================================================================

/**
 * Number formatting mode
 */
export type NumMode = 'currency' | 'decimal' | 'percent' | 'scientific';

/**
 * Number sign formatting (use parentheses for negative numbers)
 */
export type NumSign = 'parens';

/**
 * Text alignment options
 */
export type TextAlignment = 'left' | 'center' | 'right';

/**
 * Number format options for numeric columns
 */
export interface NumberFormatOptions {
  /** Number formatting mode */
  numMode?: NumMode | null;
  /** Sign formatting (parentheses for negatives) */
  numSign?: NumSign | null;
  /** Minimum number of decimal places to display (0-20) */
  decimals?: number | null;
  /** Maximum number of decimal places to display (0-20) */
  maxDecimals?: number | null;
  /** Currency code (e.g., 'USD', 'EUR', 'GBP') */
  currency?: string | null;
}

/**
 * Dropdown condition for reference columns
 */
export interface DropdownCondition {
  /** The predicate formula text */
  text: string;
  /** Parsed representation of the formula (auto-generated, should not be set manually) */
  parsed?: string;
}

/**
 * Choice option styling
 */
export interface ChoiceOptions {
  [choice: string]: {
    textColor?: string;
    fillColor?: string;
  };
}

/**
 * Rules options for conditional formatting
 */
export interface RulesOptions {
  [key: string]: unknown;
}

/**
 * COMPREHENSIVE widget options that can be applied to columns and fields.
 * 
 * CRITICAL: widgetOptions must be stored as a JSON STRING in the database.
 * When using AddColumn or ModifyColumn actions, you MUST stringify the object:
 * 
 * @example
 * // CORRECT ✓
 * ['AddColumn', 'Table1', 'Price', {
 *   type: 'Numeric',
 *   widgetOptions: JSON.stringify({ numMode: 'currency', currency: 'USD' })
 * }]
 * 
 * // INCORRECT ✗ - Will corrupt the document!
 * ['AddColumn', 'Table1', 'Price', {
 *   type: 'Numeric',
 *   widgetOptions: { numMode: 'currency', currency: 'USD' }
 * }]
 * 
 * These options are stored as JSON strings in the database and control
 * the display and behavior of data in different widget types.
 * 
 * Widget options validated against app/client/widgets/UserType.ts typeDefs
 */
export interface WidgetOptions extends NumberFormatOptions {
  // ========== Visual Formatting (All Types) ==========
  
  /** Text color (CSS color string like '#FF0000' or 'red') */
  textColor?: string;
  
  /** Fill/background color (CSS color string) */
  fillColor?: string;
  
  /** Text alignment */
  alignment?: TextAlignment;
  
  /** Text wrapping behavior */
  wrap?: boolean;
  
  // ========== Date/Time Formatting (Date, DateTime types) ==========
  
  /** 
   * Date format string (moment.js format)
   * @default 'YYYY-MM-DD'
   * @example 'MM/DD/YYYY', 'DD-MM-YYYY', 'MMMM Do, YYYY'
   */
  dateFormat?: string;
  
  /** 
   * Time format string (moment.js format)
   * @default 'h:mma'
   * @example 'HH:mm:ss', 'h:mm A'
   */
  timeFormat?: string;
  
  /** Whether the date format is custom */
  isCustomDateFormat?: boolean;
  
  /** Whether the time format is custom */
  isCustomTimeFormat?: boolean;
  
  // ========== Widget Type Selector ==========
  
  /** 
   * Specific widget type override
   * @example 'HyperLink' for URL columns, 'Switch' for boolean columns
   */
  widget?: string;
  
  // ========== Choice/Select Options (Choice, ChoiceList types) ==========
  
  /** Available choices for Choice and ChoiceList columns */
  choices?: string[];
  
  /** Visual styling for individual choice items */
  choiceOptions?: ChoiceOptions;
  
  // ========== Reference Column Options (Ref, RefList types) ==========
  
  /** Dropdown condition for filtering reference choices */
  dropdownCondition?: DropdownCondition;
  
  /** 
   * Visible column ID for reference display (internal use)
   * Automatically set by the system
   */
  visibleColId?: string;
  
  /** 
   * Type of the visible column (internal use)
   * Automatically set by the system
   */
  visibleColType?: string;
  
  /** 
   * Widget options for the visible column (internal use)
   * Automatically set by the system
   */
  visibleColWidgetOpts?: WidgetOptions;
  
  /** 
   * Table data for reference lookups (internal use)
   * Automatically set by the system
   */
  tableData?: unknown;
  
  // ========== Toggle/Checkbox Options (Bool type) ==========
  
  /** Text to show for true/checked state */
  textOn?: string;
  
  /** Text to show for false/unchecked state */
  textOff?: string;
  
  // ========== Attachments Options (Attachments type) ==========
  
  /** Height of attachment widget in pixels */
  height?: string | number;
  
  // ========== Conditional Formatting (All types) ==========
  
  /** 
   * Rules for conditional styling
   * Used in conjunction with the 'rules' field in column metadata
   */
  rulesOptions?: RulesOptions;
  
  // ========== Custom Widget Options ==========
  
  /** 
   * Additional widget-specific options
   * Custom widgets can define their own options
   */
  [customOption: string]: unknown;
}

/**
 * Column information for creating new columns
 * 
 * CRITICAL: widgetOptions MUST be a JSON string, not an object
 */
export interface ColInfo {
  /** Column ID (will be sanitized if needed) */
  id: string;
  
  /** 
   * Column type
   * @example 'Text', 'Numeric', 'Int', 'Bool', 'Date', 'DateTime', 
   *          'Choice', 'ChoiceList', 'Ref:TableName', 'RefList:TableName', 'Attachments'
   */
  type?: string;
  
  /** Whether this is a formula column */
  isFormula?: boolean;
  
  /** Formula expression (for formula columns) */
  formula?: string;
  
  /** 
   * Widget options as a JSON STRING (not an object!)
   * @example JSON.stringify({ numMode: 'currency', currency: 'USD' })
   */
  widgetOptions?: string;
  
  /** Display label for the column */
  label?: string;
  
  /** Description/help text for the column */
  description?: string;
  
  /** Reference to visible column (for Ref/RefList types) */
  visibleCol?: number;
  
  /** Reference to display column */
  displayCol?: number;
  
  /** Reference to reverse column (for bidirectional references) */
  reverseCol?: number;
  
  /** When to recalculate (RecalcWhen enum value) */
  recalcWhen?: number;
  
  /** Dependencies for recalculation */
  recalcDeps?: unknown;
  
  /** Whether column ID is independent from label */
  untieColIdFromLabel?: boolean;
  
  /** Conditional formatting rules */
  rules?: unknown;
  
  /** Other metadata fields */
  [key: string]: unknown;
}

/**
 * Options for applying user actions
 */
export interface ApplyUAOptions {
  /** Override the description of the action */
  desc?: string;
  /** For undo/redo; the actionNum of the original action */
  otherId?: number;
  /** For bundled actions, actionNum of the previous action in the bundle */
  linkId?: number;
  /** If true, parse string values based on column type */
  parseStrings?: boolean;
}

/**
 * Result from applying user actions
 */
export interface ApplyUAResult {
  /** Number of the action that got recorded */
  actionNum: number;
  /** Hash of the action that got recorded */
  actionHash: string | null;
  /** Array of return values, one for each user action */
  retValues: unknown[];
  /** True if document was modified */
  isModification: boolean;
}

// ============================================================================
// Table Actions
// ============================================================================

/**
 * Add a new table to the document
 * @param tableId - ID of the table to create
 * @param columns - Array of column definitions
 * @param primaryViewId - Optional ID for the primary view (0 for auto)
 */
export type AddTable = ['AddTable', string, ColInfo[], number?];

/**
 * Remove an existing table from the document
 * @param tableId - ID of the table to remove
 */
export type RemoveTable = ['RemoveTable', string];

/**
 * Rename an existing table
 * @param oldTableId - Current table ID
 * @param newTableId - New table ID
 */
export type RenameTable = ['RenameTable', string, string];

// ============================================================================
// Record Actions
// ============================================================================

/**
 * Add a single record to a table
 * @param tableId - ID of the table
 * @param rowId - Row ID for the new record (null for auto-assign)
 * @param colValues - Column values for the new record
 */
export type AddRecord = ['AddRecord', string, number | null, ColValues];

/**
 * Add multiple records to a table in bulk
 * @param tableId - ID of the table
 * @param rowIds - Array of row IDs (null values for auto-assign)
 * @param colValues - Column values for all records
 */
export type BulkAddRecord = ['BulkAddRecord', string, Array<number | null>, BulkColValues];

/**
 * Update a single record in a table
 * @param tableId - ID of the table
 * @param rowId - Row ID to update
 * @param colValues - Column values to update
 */
export type UpdateRecord = ['UpdateRecord', string, number, ColValues];

/**
 * Update multiple records in a table in bulk
 * @param tableId - ID of the table
 * @param rowIds - Array of row IDs to update
 * @param colValues - Column values to update for all records
 */
export type BulkUpdateRecord = ['BulkUpdateRecord', string, number[], BulkColValues];

/**
 * Remove a single record from a table
 * @param tableId - ID of the table
 * @param rowId - Row ID to remove
 */
export type RemoveRecord = ['RemoveRecord', string, number];

/**
 * Remove multiple records from a table in bulk
 * @param tableId - ID of the table
 * @param rowIds - Array of row IDs to remove
 */
export type BulkRemoveRecord = ['BulkRemoveRecord', string, number[]];

/**
 * Replace all data in a table
 * @param tableId - ID of the table
 * @param rowIds - New array of row IDs
 * @param colValues - New column values for all records
 */
export type ReplaceTableData = ['ReplaceTableData', string, number[], BulkColValues];

// ============================================================================
// Column Actions
// ============================================================================

/**
 * Add a new column to a table
 * @param tableId - ID of the table
 * @param colId - ID for the new column
 * @param colInfo - Column configuration
 */
export type AddColumn = ['AddColumn', string, string, ColInfo];

/**
 * Remove a column from a table
 * @param tableId - ID of the table
 * @param colId - ID of the column to remove
 */
export type RemoveColumn = ['RemoveColumn', string, string];

/**
 * Rename a column
 * @param tableId - ID of the table
 * @param oldColId - Current column ID
 * @param newColId - New column ID
 */
export type RenameColumn = ['RenameColumn', string, string, string];

/**
 * Modify column properties
 * @param tableId - ID of the table
 * @param colId - ID of the column to modify
 * @param colInfo - Column properties to update
 */
export type ModifyColumn = ['ModifyColumn', string, string, Partial<ColInfo>];

// ============================================================================
// View Actions
// ============================================================================

/**
 * Add a new view/page to the document
 */
export type AddView = ['AddView', string, string, string, number[]];

/**
 * Remove a view/page from the document
 */
export type RemoveView = ['RemoveView', number];

/**
 * Add a view section (widget) to a view
 */
export type AddViewSection = ['AddViewSection', string, number, string, unknown?, unknown?];

/**
 * Remove a view section
 */
export type RemoveViewSection = ['RemoveViewSection', number];

// ============================================================================
// Import/Transform Actions
// ============================================================================

/**
 * Transform rule for importing data
 */
export interface TransformRule {
  destTableId: string | null;
  destCols: TransformColumn[];
  sourceCols: string[];
}

/**
 * Map of transform rules by source table name
 */
export interface TransformRuleMap {
  [origTableName: string]: TransformRule;
}

/**
 * Column transformation definition
 */
export interface TransformColumn {
  label: string;
  colId: string | null;
  type: string;
  formula: string;
  widgetOptions: string;
}

/**
 * Import options
 */
export interface ImportOptions {
  parseStrings?: boolean;
  [key: string]: unknown;
}

export type ImportFiles = ['ImportFiles', string | null, number, TransformRule, ImportOptions?];
export type FinishImportFiles = ['FinishImportFiles', number, TransformRuleMap, ImportOptions?];

// ============================================================================
// Other Actions
// ============================================================================

export type ApplyUndoActions = ['ApplyUndoActions', number[]];
export type ApplyDocActions = ['ApplyDocActions', unknown[]];
export type AddEmptyTable = ['AddEmptyTable', string, ColInfo[]?];
export type CreateViewSection = ['CreateViewSection', string, number, string, unknown?, unknown?];
export type CreateSummaryTable = ['CreateSummaryTable', string, string[], unknown[]];
export type UpdateSummaryGroupBy = ['UpdateSummaryGroupBy', string, string[]];
export type DetachSummaryTable = ['DetachSummaryTable', string];
export type AddField = ['AddField', number, string, unknown?];
export type RemoveField = ['RemoveField', number, number];
export type InitNewDoc = ['InitNewDoc'];
export type DuplicateTable = ['DuplicateTable', string, boolean, string?];

// ============================================================================
// Union Types
// ============================================================================

/**
 * All possible User Actions that can be sent to the /apply endpoint
 */
export type UserAction =
  | AddTable | RemoveTable | RenameTable | AddEmptyTable
  | AddRecord | BulkAddRecord | UpdateRecord | BulkUpdateRecord
  | RemoveRecord | BulkRemoveRecord | ReplaceTableData
  | AddColumn | RemoveColumn | RenameColumn | ModifyColumn
  | AddView | RemoveView | AddViewSection | RemoveViewSection | CreateViewSection
  | AddField | RemoveField
  | ImportFiles | FinishImportFiles
  | CreateSummaryTable | UpdateSummaryGroupBy | DetachSummaryTable
  | ApplyUndoActions | ApplyDocActions
  | InitNewDoc | DuplicateTable;

export type UserActionBundle = UserAction[];
export type ApplyRequest = UserActionBundle;
export interface ApplyResponse extends ApplyUAResult {}

// ============================================================================
// Usage Examples
// ============================================================================

/**
 * @example Complete examples with validated widget options
 * 
 * // Currency formatting (Numeric type)
 * const actions: UserAction[] = [
 *   ['AddColumn', 'Products', 'Price', {
 *     type: 'Numeric',
 *     widgetOptions: JSON.stringify({
 *       numMode: 'currency',
 *       currency: 'USD',
 *       decimals: 2
 *     } as WidgetOptions)
 *   }]
 * ];
 * 
 * // Date formatting
 * const actions2: UserAction[] = [
 *   ['AddColumn', 'Events', 'Date', {
 *     type: 'Date',
 *     widgetOptions: JSON.stringify({
 *       dateFormat: 'YYYY-MM-DD',
 *       alignment: 'center'
 *     } as WidgetOptions)
 *   }]
 * ];
 * 
 * // Choice column with styling
 * const actions3: UserAction[] = [
 *   ['AddColumn', 'Tasks', 'Status', {
 *     type: 'Choice',
 *     widgetOptions: JSON.stringify({
 *       choices: ['Todo', 'In Progress', 'Done'],
 *       choiceOptions: {
 *         'Todo': { fillColor: '#EF4444' },
 *         'In Progress': { fillColor: '#F59E0B' },
 *         'Done': { fillColor: '#10B981' }
 *       }
 *     } as WidgetOptions)
 *   }]
 * ];
 */