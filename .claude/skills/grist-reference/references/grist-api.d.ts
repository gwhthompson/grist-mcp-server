/**
 * Grist API Type Definitions - v3.0.0
 *
 * Complete TypeScript definitions for Grist REST API, UserActions, and data structures.
 * All wire formats verified against source code and actual API behavior.
 *
 * @see https://support.getgrist.com/api
 * @see https://github.com/gristlabs/grist-core
 *
 * Last updated: 2025-11-17
 * Schema version: 44
 * Source: grist-core commit a2b1a344
 */

// ============================================================================
// PERMISSION SYSTEM REFERENCE
// ============================================================================

/**
 * GRIST PERMISSION LEVELS
 * ========================
 *
 * **Document-Level Permissions:**
 * - OWNER: Full control including ACL management, webhooks, schema changes
 * - EDITOR: Can modify data and structure, execute most UserActions
 * - VIEWER: Read-only access to data and metadata
 *
 * **Special Permissions:**
 * - canCopyEverything: Required for SQL endpoint and downloads (OWNER always has this)
 *   - Granted if user has full document access OR explicit FullCopies ACL permission
 *   - Blocked for users with granular row/column ACL restrictions
 *
 * **Granular ACL:**
 * - Row-level and column-level access control rules
 * - Further restricts permissions beyond role-based access
 * - Blocks certain UserActions (see SPECIAL_ACTIONS below)
 *
 * ============================================================================
 * ENDPOINT PERMISSIONS QUICK REFERENCE
 * ============================================================================
 *
 * **VIEWER** can access:
 * - GET /records, /tables, /columns, /attachments
 * - Export endpoints (if canCopyEverything)
 * - POST /sql (if canCopyEverything - requires full access)
 * - GET /docs/:docId/download (if canCopyEverything)
 * - POST /docs/:docId/fork
 *
 * **EDITOR** can access:
 * - All VIEWER permissions
 * - POST/PATCH/DELETE /records, /tables, /columns
 * - POST /attachments (upload)
 * - POST /apply (most UserActions - see permissions below)
 * - Most schema modification operations
 *
 * **OWNER** can access:
 * - All EDITOR permissions
 * - Modify ACL rules (UpdateRecord on _grist_ACLRules table)
 * - POST /webhooks (create/manage webhooks)
 * - POST /attachments/removeUnused, /attachments/verifyFiles
 * - Special UserActions (GenImporterView, UpdateSummaryViewSection, etc.)
 * - Always has canCopyEverything
 *
 * ============================================================================
 * USERACTION PERMISSIONS
 * ============================================================================
 *
 * **General Rules:**
 * 1. VIEWER role CANNOT execute ANY UserActions
 * 2. Minimum EDITOR role required for all data/schema modifications
 * 3. ONLY OWNER can modify access control rules (_grist_ACLRules, _grist_ACLResources, _grist_Shares)
 * 4. Users with granular ACL cannot execute SPECIAL_ACTIONS
 *
 * **SPECIAL_ACTIONS** (Require OWNER or EDITOR with full access):
 * - InitNewDoc, GenImporterView
 * - UpdateSummaryViewSection, DetachSummaryViewSection
 * - CreateViewSection, AddView
 * - All view/section operations with granular access restrictions
 *
 * **Permission Errors:**
 * - ErrorWithCode('ACL_DENY', message) thrown when permission check fails
 * - Example: "Only owners can modify access rules"
 * - Example: "Only owners or editors can modify documents"
 *
 * @see /app/server/lib/GranularAccess.ts:576-592 (canApplyBundle)
 * @see /app/server/lib/GranularAccess.ts:97-105 (SPECIAL_ACTIONS)
 */

// ============================================================================
// WIRE FORMAT TYPES
// ============================================================================

/**
 * GristObjCode: Type codes for encoded CellValues
 *
 * Wire Format: All encoded values are arrays starting with a code character.
 * These codes indicate how to interpret the remaining array elements.
 *
 * @see /app/plugin/GristData.ts:4-18
 */
export enum GristObjCode {
  List = "L", // ["L", item1, item2, ...] - ChoiceList, RefList (non-empty), Attachments
  LookUp = "l", // ["l", value, options] - Lookup results
  Dict = "O", // ["O", {key: value}] - Dictionary objects
  DateTime = "D", // ["D", timestamp_seconds, timezone] - DateTime with timezone
  Date = "d", // ["d", timestamp_seconds] - Date (midnight UTC)
  Skip = "S", // ["S"] - Skip placeholder
  Censored = "C", // ["C"] - Censored by access control
  Reference = "R", // ["R", tableId, rowId] - Reference in Any column
  ReferenceList = "r", // ["r", tableId, [rowIds]] - ReferenceList in Any column
  Exception = "E", // ["E", name, message, details] - Formula error
  Pending = "P", // ["P"] - Pending/Loading value
  Unmarshallable = "U", // ["U", repr] - Value that couldn't be unmarshalled
  Versions = "V", // ["V", version_obj] - Versioned values
}

/**
 * CellValue: Universal type for cell content in Grist
 *
 * Wire Format: CellValues are transmitted exactly as stored:
 * - Primitives (string, number, boolean, null) are sent as-is
 * - Complex types use GristObjCode encoding (arrays starting with code character)
 * - NO automatic simplification or conversion occurs
 *
 * CRITICAL: This is the EXACT wire format. The API does NOT simplify encoded values.
 * If data is stored as ["L", 1, 2], it's returned as ["L", 1, 2], never as [1, 2].
 *
 * @see /app/plugin/GristData.ts:46
 * @see Wire format research: /app/server/lib/DocApi.ts:318-323
 */
export type CellValue =
  | number
  | string
  | boolean
  | null
  | [GristObjCode, ...unknown[]];

/**
 * Specific CellValue types by column type (Wire Format)
 *
 * These represent the EXACT format sent/received over the API.
 */

/** Text column value - always a plain string or null */
export type TextValue = string | null;

/** Numeric column value - always a plain number or null */
export type NumericValue = number | null;

/** Int column value - always a plain number or null */
export type IntValue = number | null;

/** Bool column value - boolean or null (stored as 0/1 in SQLite) */
export type BoolValue = boolean | null;

/**
 * Date column value
 * - null: empty
 * - number: Unix timestamp in SECONDS (midnight UTC)
 * - ["d", seconds]: Encoded format (rare, usually just number)
 *
 * CRITICAL: Timestamps are in SECONDS, not milliseconds.
 * JavaScript Date.now() returns milliseconds - divide by 1000.
 */
export type DateValue = null | number | [GristObjCode.Date, number];

/**
 * DateTime column value
 * - null: empty
 * - number: Unix timestamp in SECONDS
 * - ["D", seconds, timezone]: Encoded format with timezone
 *
 * CRITICAL: Timestamps are in SECONDS, not milliseconds.
 */
export type DateTimeValue =
  | null
  | number
  | [GristObjCode.DateTime, number, string];

/** Choice column value - plain string or null */
export type ChoiceValue = string | null;

/**
 * ChoiceList column value
 * - null: empty
 * - ["L", choice1, choice2, ...]: Non-empty (choices are strings)
 * - ["L"]: Also valid for empty (though null preferred)
 *
 * Note: ChoiceList accepts both null and ["L"] for empty values.
 */
export type ChoiceListValue = null | [GristObjCode.List, ...string[]];

/**
 * Ref column value - row ID or 0 for no reference
 *
 * CRITICAL: Ref columns use 0 for "no reference", NOT null.
 * - 0: no reference (empty)
 * - positive integer: row ID in referenced table
 * - null: INVALID (may cause errors)
 */
export type RefValue = number; // 0 for no reference, positive for row ID

/**
 * RefList column value
 * - null: empty (ONLY valid empty value)
 * - ["L", id1, id2, ...]: Non-empty (IDs are integers)
 *
 * CRITICAL: RefList empty is ONLY null, NEVER ["L"].
 * This differs from ChoiceList which accepts both null and ["L"].
 *
 * Storage: null when empty
 * Formulas: See empty RecordSet []
 * Wire: null when empty, ["L", ...numbers] when non-empty
 */
export type RefListValue = null | [GristObjCode.List, ...number[]];

/**
 * Attachments column value (same as RefList - references _grist_Attachments table)
 * - null: no attachments
 * - ["L", id1, id2, ...]: Attachment IDs
 */
export type AttachmentsValue = RefListValue;

/**
 * Reference in Any column (includes table ID)
 * - ["R", tableId, rowId]: Reference with explicit table
 */
export type ReferenceAnyValue = [GristObjCode.Reference, string, number];

/**
 * ReferenceList in Any column (includes table ID)
 * - ["r", tableId, [id1, id2, ...]]: Reference list with explicit table
 */
export type ReferenceListAnyValue = [
  GristObjCode.ReferenceList,
  string,
  number[],
];

// ============================================================================
// COLUMN DATA STRUCTURES
// ============================================================================

/**
 * ColValues: Column values for a single record (record-oriented)
 *
 * Used in: AddRecord, UpdateRecord, AddOrUpdateRecord
 */
export interface ColValues {
  [colId: string]: CellValue;
}

/**
 * BulkColValues: Column values for multiple records (column-oriented)
 *
 * Used in: BulkAddRecord, BulkUpdateRecord, BulkAddOrUpdateRecord, ReplaceTableData
 *
 * Format: Each property is an array of values, all arrays must be same length.
 * Index i across all arrays represents one record.
 *
 * Example:
 * ```typescript
 * {
 *   "Name": ["Alice", "Bob", "Charlie"],
 *   "Age": [30, 25, 35],
 *   "Active": [true, true, false]
 * }
 * // Represents 3 records
 * ```
 */
export interface BulkColValues {
  [colId: string]: CellValue[];
}

/**
 * ColInfo: Column metadata for creating/modifying columns
 *
 * Used in: AddColumn, ModifyColumn, AddTable
 */
export interface ColInfo {
  /** Column type: "Text", "Numeric", "Ref:TableName", etc. */
  type?: string;
  /** true for formula columns, false for data columns */
  isFormula?: boolean;
  /** Formula text (e.g., "$Price * $Quantity") */
  formula?: string;
  /** Widget options as JSON STRING (not object!) */
  widgetOptions?: string;
  /** Display label */
  label?: string;
  /** Conditional style rules */
  rules?: any[];
  /** When to recalculate */
  recalcWhen?: number;
  /** Recalculation dependencies */
  recalcDeps?: any[];
  /** Visible column reference (for Ref/RefList display) */
  visibleCol?: number;
  /** Position in table */
  _position?: number;
}

/**
 * ColInfoWithId: Column metadata with required id field
 *
 * Used in: AddTable
 */
export interface ColInfoWithId extends ColInfo {
  id: string;
}

// ============================================================================
// WIDGET OPTIONS (WIRE FORMAT)
// ============================================================================

/**
 * CRITICAL: Widget Options Wire Format
 * =====================================
 *
 * Widget options are stored and transmitted as JSON STRINGS, not objects.
 *
 * Database: _grist_Tables_column.widgetOptions is type TEXT
 * API Requests: widgetOptions must be a JSON string
 * API Responses: widgetOptions is returned as a JSON string
 *
 * CORRECT:
 * ```typescript
 * {
 *   "widgetOptions": "{\"numMode\":\"currency\",\"currency\":\"USD\"}"
 * }
 * ```
 *
 * WRONG:
 * ```typescript
 * {
 *   "widgetOptions": {"numMode": "currency"}  // Will fail!
 * }
 * ```
 *
 * @see /sandbox/grist/schema.py:68
 * @see Test evidence: /test/server/lib/DocApi.ts:908,930,952
 */
export type WidgetOptionsJSON = string; // JSON-serialized widget options

// ============================================================================
// WIDGET OPTIONS (LOGICAL TYPES - For Development)
// ============================================================================

/**
 * These interfaces represent the PARSED content of WidgetOptions.
 * Use these for type-safe development, but remember to JSON.stringify()
 * before sending to the API.
 */

/** Number display modes */
export type NumMode = "currency" | "decimal" | "percent" | "scientific";

/** Number sign display */
export type NumSign = "parens"; // Use (123) for negative numbers

/**
 * Base formatting options (conditional styling)
 * These can be applied to any column type via conditional formatting rules.
 */
export interface FormatOptions {
  /** CSS color for text */
  textColor?: string;
  /** CSS color for background */
  fillColor?: string;
  /** Bold text */
  fontBold?: boolean;
  /** Italic text */
  fontItalic?: boolean;
  /** Underlined text */
  fontUnderline?: boolean;
  /** Strikethrough text */
  fontStrikethrough?: boolean;
}

/**
 * Number formatting options
 * Used by: Numeric, Int column types
 */
export interface NumberFormatOptions extends FormatOptions {
  /** Display mode: currency, decimal, percent, scientific */
  numMode?: NumMode | null;
  /** Use parentheses for negative numbers */
  numSign?: NumSign | null;
  /** Minimum fraction digits (0-20) */
  decimals?: number | null;
  /** Maximum fraction digits (0-20) */
  maxDecimals?: number | null;
  /** ISO currency code (e.g., "USD", "EUR") */
  currency?: string | null;
}

/**
 * Choice styling options (per-choice colors and formatting)
 */
export interface ChoiceOption {
  textColor?: string;
  fillColor?: string;
  fontBold?: boolean;
  fontItalic?: boolean;
  fontUnderline?: boolean;
  fontStrikethrough?: boolean;
}

/**
 * Choice options map (choice name -> styling)
 */
export interface ChoiceOptions {
  [choice: string]: ChoiceOption;
}

/**
 * Base text options (alignment and wrapping)
 */
interface BaseTextOptions extends FormatOptions {
  alignment?: "left" | "center" | "right";
  wrap?: boolean;
}

/** Options for Any column type */
export interface AnyWidgetOptions extends BaseTextOptions {}

/** Options for Text column type */
export interface TextWidgetOptions extends BaseTextOptions {
  /** Set to 'Markdown' or 'HyperLink' to use those widgets */
  widget?: "Markdown" | "HyperLink";
}

/** Options for Numeric column type */
export interface NumericWidgetOptions
  extends BaseTextOptions,
    NumberFormatOptions {}

/** Options for Int column type */
export interface IntWidgetOptions extends BaseTextOptions, NumberFormatOptions {
  /** Defaults to 0 for integers */
  decimals?: number | null;
}

/** Options for Bool column type */
export interface BoolWidgetOptions extends FormatOptions {
  /** Only for TextBox widget */
  alignment?: "left" | "center" | "right";
  /** Only for TextBox widget */
  wrap?: boolean;
}

/** Options for Date column type */
export interface DateWidgetOptions extends FormatOptions {
  /** Date format string (e.g., "YYYY-MM-DD", "MM/DD/YYYY") */
  dateFormat?: string;
  /** Whether using custom date format */
  isCustomDateFormat?: boolean;
  alignment?: "left" | "center" | "right";
}

/** Options for DateTime column type */
export interface DateTimeWidgetOptions extends FormatOptions {
  /** Date format string */
  dateFormat?: string;
  /** Time format string (e.g., "HH:mm:ss", "h:mma") */
  timeFormat?: string;
  /** Whether using custom date format */
  isCustomDateFormat?: boolean;
  /** Whether using custom time format */
  isCustomTimeFormat?: boolean;
  alignment?: "left" | "center" | "right";
}

/** Options for Choice column type */
export interface ChoiceWidgetOptions extends BaseTextOptions {
  /** Available choices */
  choices?: string[];
  /** Per-choice styling */
  choiceOptions?: ChoiceOptions;
}

/** Options for ChoiceList column type */
export interface ChoiceListWidgetOptions extends BaseTextOptions {
  /** Available choices */
  choices?: string[];
  /** Per-choice styling */
  choiceOptions?: ChoiceOptions;
}

/** Options for Ref column type */
export interface RefWidgetOptions extends BaseTextOptions {}

/** Options for RefList column type */
export interface RefListWidgetOptions extends BaseTextOptions {}

/** Options for Attachments column type */
export interface AttachmentsWidgetOptions extends FormatOptions {
  /** Height in pixels or CSS value */
  height?: string;
}

/**
 * Generic widget options (union of all possible options)
 */
export interface WidgetOptions extends FormatOptions {
  // Common
  alignment?: "left" | "center" | "right";
  wrap?: boolean;
  widget?: string;

  // Numeric, Int
  numMode?: NumMode | null;
  numSign?: NumSign | null;
  decimals?: number | null;
  maxDecimals?: number | null;
  currency?: string | null;

  // Date, DateTime
  dateFormat?: string;
  timeFormat?: string;
  isCustomDateFormat?: boolean;
  isCustomTimeFormat?: boolean;

  // Choice, ChoiceList
  choices?: string[];
  choiceOptions?: ChoiceOptions;

  // Attachments
  height?: string;
}

/**
 * Type-safe widget options map
 */
export interface WidgetOptionsByType {
  Any: AnyWidgetOptions;
  Text: TextWidgetOptions;
  Numeric: NumericWidgetOptions;
  Int: IntWidgetOptions;
  Bool: BoolWidgetOptions;
  Date: DateWidgetOptions;
  DateTime: DateTimeWidgetOptions;
  Choice: ChoiceWidgetOptions;
  ChoiceList: ChoiceListWidgetOptions;
  Ref: RefWidgetOptions;
  RefList: RefListWidgetOptions;
  Attachments: AttachmentsWidgetOptions;
  Blob: FormatOptions;
  Id: FormatOptions;
  ManualSortPos: FormatOptions;
  PositionNumber: FormatOptions;
}

// ============================================================================
// GRIST TYPES
// ============================================================================

/**
 * Grist column types
 */
export type GristType =
  | "Any"
  | "Attachments"
  | "Blob"
  | "Bool"
  | "Choice"
  | "ChoiceList"
  | "Date"
  | "DateTime"
  | "Id"
  | "Int"
  | "ManualSortPos"
  | "Numeric"
  | "PositionNumber"
  | "Ref"
  | "RefList"
  | "Text";

/**
 * View widget types (for view sections)
 */
export type ViewWidgetType =
  | "record" // Table
  | "detail" // Card List
  | "single" // Card
  | "chart" // Chart
  | "custom" // Custom Widget
  | "form" // Form
  | "custom.calendar"; // Calendar

/**
 * Cell widget types (for individual columns)
 */
export type CellWidgetType =
  | "TextBox" // All types
  | "Markdown" // Text only
  | "HyperLink" // Text only
  | "Spinner" // Numeric, Int
  | "CheckBox" // Bool
  | "Switch" // Bool
  | "Reference" // Ref, RefList
  | "Attachments"; // Attachments

// ============================================================================
// USERACTION TYPES (All 43 Actions with Permissions)
// ============================================================================

/**
 * Options for upsert operations (BulkAddOrUpdateRecord, AddOrUpdateRecord)
 *
 * @see /sandbox/grist/useractions.py:1027
 */
export interface UpsertOptions {
  /** Which records to update when multiple match (default: "first") */
  onMany?: "first" | "all" | "none";
  /** Allow updating existing records (default: true) */
  update?: boolean;
  /** Allow adding new records (default: true) */
  add?: boolean;
  /** Allow empty require dict - matches all records (default: false) */
  allowEmptyRequire?: boolean;
}

// ----------------------------------------------------------------------------
// Document Actions
// ----------------------------------------------------------------------------

/**
 * InitNewDoc: Initialize a new document
 *
 * @permission OWNER or EDITOR with full access (no granular ACL)
 * @permission-granular FORBIDDEN for users with row/column ACL
 * @see /sandbox/grist/useractions.py:307
 */
export type InitNewDoc = ["InitNewDoc"];

/**
 * ApplyDocActions: Apply a list of document actions
 *
 * @permission EDITOR minimum (subject to individual action permissions)
 * @see /sandbox/grist/useractions.py:334
 */
export type ApplyDocActions = ["ApplyDocActions", DocAction[]];

/**
 * ApplyUndoActions: Apply undo actions in reversed order
 *
 * @permission EDITOR minimum
 * @see /sandbox/grist/useractions.py:339
 */
export type ApplyUndoActions = ["ApplyUndoActions", DocAction[]];

/**
 * Calculate: Trigger calculation of dirty cells
 *
 * @permission EDITOR minimum
 * @see /sandbox/grist/useractions.py:344
 */
export type Calculate = ["Calculate"];

/**
 * UpdateCurrentTime: Update NOW() formula results
 *
 * @permission EDITOR minimum
 * @see /sandbox/grist/useractions.py:352
 */
export type UpdateCurrentTime = ["UpdateCurrentTime"];

/**
 * RespondToRequests: Provide responses for REQUEST() function calls
 *
 * @permission EDITOR minimum
 * @see /sandbox/grist/useractions.py:360
 */
export type RespondToRequests = [
  "RespondToRequests",
  { [key: string]: any },
  string[],
];

/**
 * RemoveStaleObjects: Remove transform columns and temporary tables
 *
 * @permission EDITOR minimum
 * @see /sandbox/grist/useractions.py:1620
 */
export type RemoveStaleObjects = ["RemoveStaleObjects"];

// ----------------------------------------------------------------------------
// Record Operations
// ----------------------------------------------------------------------------

/**
 * AddRecord: Add a single record to a table
 *
 * @permission EDITOR + row-level ACL (must have create permission)
 * @permission-acl Subject to row/column ACL rules
 * @returns number - The row ID of the added record
 * @see /sandbox/grist/useractions.py:383
 *
 * @example
 * ["AddRecord", "Table1", null, {"Name": "Alice", "Age": 30}]
 */
export type AddRecord = ["AddRecord", string, number | null, ColValues];

/**
 * BulkAddRecord: Add multiple records in bulk
 *
 * @permission EDITOR + row-level ACL
 * @permission-acl Subject to row/column ACL rules
 * @returns number[] - Array of row IDs
 * @see /sandbox/grist/useractions.py:389
 *
 * @example
 * ["BulkAddRecord", "Table1", [null, null], {"Name": ["Alice", "Bob"], "Age": [30, 25]}]
 */
export type BulkAddRecord = [
  "BulkAddRecord",
  string,
  (number | null)[],
  BulkColValues,
];

/**
 * ReplaceTableData: Replace all data in a table
 *
 * @permission EDITOR + table-level permissions
 * @permission-acl Must have delete and create permissions
 * @see /sandbox/grist/useractions.py:397
 */
export type ReplaceTableData = [
  "ReplaceTableData",
  string,
  number[],
  BulkColValues,
];

/**
 * UpdateRecord: Update a single record
 *
 * @permission EDITOR + row-level ACL
 * @permission-acl Subject to row/column ACL rules
 * @see /sandbox/grist/useractions.py:557
 *
 * @example
 * ["UpdateRecord", "Table1", 5, {"Status": "active"}]
 */
export type UpdateRecord = ["UpdateRecord", string, number, ColValues];

/**
 * BulkUpdateRecord: Update multiple records in bulk
 *
 * @permission EDITOR + row-level ACL
 * @permission-acl Subject to row/column ACL rules
 * @see /sandbox/grist/useractions.py:562
 *
 * @example
 * ["BulkUpdateRecord", "Table1", [1, 2, 3], {"Status": ["active", "active", "inactive"]}]
 */
export type BulkUpdateRecord = [
  "BulkUpdateRecord",
  string,
  number[],
  BulkColValues,
];

/**
 * BulkAddOrUpdateRecord: Upsert multiple records based on lookup criteria
 *
 * @permission EDITOR + row-level ACL
 * @permission-acl Subject to row/column ACL rules
 * @see /sandbox/grist/useractions.py:1027
 *
 * @example
 * ["BulkAddOrUpdateRecord", "Table1",
 *   {"Email": ["a@example.com", "b@example.com"]},  // require (lookup)
 *   {"Name": ["Alice", "Bob"], "Status": ["active", "active"]},  // values to set
 *   {"onMany": "first", "update": true, "add": true}  // options
 * ]
 */
export type BulkAddOrUpdateRecord = [
  "BulkAddOrUpdateRecord",
  string,
  BulkColValues,
  BulkColValues,
  UpsertOptions,
];

/**
 * AddOrUpdateRecord: Upsert a single record based on lookup criteria
 *
 * @permission EDITOR + row-level ACL
 * @permission-acl Subject to row/column ACL rules
 * @see /sandbox/grist/useractions.py:1129
 *
 * @example
 * ["AddOrUpdateRecord", "Table1",
 *   {"Email": "alice@example.com"},  // require (lookup)
 *   {"Name": "Alice", "Status": "active"},  // values to set
 *   {"onMany": "first"}  // options
 * ]
 */
export type AddOrUpdateRecord = [
  "AddOrUpdateRecord",
  string,
  ColValues,
  ColValues,
  UpsertOptions,
];

/**
 * RemoveRecord: Remove a single record
 *
 * @permission EDITOR + row-level ACL (must have delete permission)
 * @permission-acl Subject to row/column ACL rules
 * @see /sandbox/grist/useractions.py:1178
 */
export type RemoveRecord = ["RemoveRecord", string, number];

/**
 * BulkRemoveRecord: Remove multiple records in bulk
 *
 * @permission EDITOR + row-level ACL
 * @permission-acl Subject to row/column ACL rules
 * @see /sandbox/grist/useractions.py:1182
 */
export type BulkRemoveRecord = ["BulkRemoveRecord", string, number[]];

// ----------------------------------------------------------------------------
// Column Operations
// ----------------------------------------------------------------------------

/**
 * AddColumn: Add a column to a table (visible in raw data view)
 *
 * @permission EDITOR (OWNER for schema changes on some deployments)
 * @permission-acl May require schema edit permission
 * @returns {colRef: number, colId: string}
 * @see /sandbox/grist/useractions.py:1454
 *
 * @example
 * ["AddColumn", "Table1", "NewCol", {"type": "Text", "label": "New Column"}]
 */
export type AddColumn = ["AddColumn", string, string | null, ColInfo];

/**
 * AddHiddenColumn: Add a hidden column (not added to view sections)
 *
 * @permission EDITOR
 * @returns {colRef: number, colId: string}
 * @see /sandbox/grist/useractions.py:1508
 */
export type AddHiddenColumn = ["AddHiddenColumn", string, string | null, ColInfo];

/**
 * AddVisibleColumn: Add a column visible in all 'record' views
 *
 * @permission EDITOR
 * @returns {colRef: number, colId: string}
 * @see /sandbox/grist/useractions.py:1513
 */
export type AddVisibleColumn = ["AddVisibleColumn", string, string | null, ColInfo];

/**
 * RemoveColumn: Remove a column from a table
 *
 * @permission EDITOR (OWNER for schema changes on some deployments)
 * @permission-note Cannot remove group-by columns from summary tables
 * @see /sandbox/grist/useractions.py:1582
 */
export type RemoveColumn = ["RemoveColumn", string, string];

/**
 * RenameColumn: Rename a column
 *
 * @permission EDITOR
 * @returns string - The actual new column ID (sanitized)
 * @see /sandbox/grist/useractions.py:1590
 */
export type RenameColumn = ["RenameColumn", string, string, string];

/**
 * ModifyColumn: Modify column properties
 *
 * @permission EDITOR (OWNER for schema changes on some deployments)
 * @permission-note May trigger type conversion and data migration
 * @see /sandbox/grist/useractions.py:1656
 */
export type ModifyColumn = [
  "ModifyColumn",
  string,
  string,
  Partial<ColInfo>,
];

/**
 * SetDisplayFormula: Set a display formula for a field or column
 *
 * @permission EDITOR
 * @see /sandbox/grist/useractions.py:1598
 */
export type SetDisplayFormula = [
  "SetDisplayFormula",
  string,
  number | null,
  number | null,
  string,
];

/**
 * ConvertFromColumn: Convert column data using external JS logic
 *
 * @permission EDITOR
 * @see /sandbox/grist/useractions.py:1748
 */
export type ConvertFromColumn = [
  "ConvertFromColumn",
  string,
  string,
  string,
  string,
  string,
  number,
];

/**
 * CopyFromColumn: Copy column schema and data
 *
 * @permission EDITOR
 * @see /sandbox/grist/useractions.py:1784
 */
export type CopyFromColumn = [
  "CopyFromColumn",
  string,
  string,
  string,
  string | null,
];

/**
 * MaybeCopyDisplayFormula: Copy displayCol if source has one
 *
 * @permission EDITOR
 * @see /sandbox/grist/useractions.py:1850
 */
export type MaybeCopyDisplayFormula = ["MaybeCopyDisplayFormula", number, number];

/**
 * RenameChoices: Update choice names in Choice/ChoiceList column
 *
 * @permission EDITOR
 * @see /sandbox/grist/useractions.py:1865
 */
export type RenameChoices = [
  "RenameChoices",
  string,
  string,
  { [oldName: string]: string },
];

/**
 * AddReverseColumn: Add a reverse reference column
 *
 * @permission EDITOR
 * @returns {colRef: number, colId: string}
 * @see /sandbox/grist/useractions.py:1941
 */
export type AddReverseColumn = ["AddReverseColumn", string, string];

/**
 * AddEmptyRule: Add an empty conditional style rule
 *
 * @permission EDITOR
 * @see /sandbox/grist/useractions.py:1907
 */
export type AddEmptyRule = [
  "AddEmptyRule",
  string,
  number | null,
  number | null,
];

// ----------------------------------------------------------------------------
// Table Operations
// ----------------------------------------------------------------------------

/**
 * AddEmptyTable: Add an empty table with default columns (A, B, C)
 *
 * @permission EDITOR (OWNER for schema changes on some deployments)
 * @returns {id: number, table_id: string, columns: string[], views: any[]}
 * @see /sandbox/grist/useractions.py:2007
 */
export type AddEmptyTable = ["AddEmptyTable", string];

/**
 * AddTable: Add a table with specified columns
 *
 * @permission EDITOR (OWNER for schema changes on some deployments)
 * @returns {id: number, table_id: string, columns: string[], views: any[]}
 * @see /sandbox/grist/useractions.py:2017
 */
export type AddTable = ["AddTable", string, ColInfoWithId[]];

/**
 * AddRawTable: Add a table without a primary view (no page)
 *
 * @permission EDITOR
 * @returns {id: number, table_id: string, columns: string[]}
 * @see /sandbox/grist/useractions.py:2028
 */
export type AddRawTable = ["AddRawTable", string];

/**
 * RemoveTable: Remove a table and all associated metadata
 *
 * @permission EDITOR (OWNER for schema changes on some deployments)
 * @see /sandbox/grist/useractions.py:2123
 */
export type RemoveTable = ["RemoveTable", string];

/**
 * RenameTable: Rename a table
 *
 * @permission EDITOR
 * @permission-note Cannot rename summary tables directly
 * @returns string - The actual new table ID (sanitized)
 * @see /sandbox/grist/useractions.py:2131
 */
export type RenameTable = ["RenameTable", string, string];

/**
 * DuplicateTable: Duplicate a table structure and optionally its data
 *
 * @permission EDITOR
 * @permission-note Cannot duplicate hidden or summary tables
 * @returns {id: number, table_id: string, raw_section_id: number}
 * @see /sandbox/grist/useractions.py:2140
 */
export type DuplicateTable = ["DuplicateTable", string, string, boolean];

/**
 * GenImporterView: Generate an importer view for importing data
 *
 * @permission OWNER or EDITOR with full access (no granular ACL)
 * @permission-granular FORBIDDEN for users with row/column ACL
 * @permission-note Used internally during import workflows
 * @see /sandbox/grist/useractions.py:2509
 */
export type GenImporterView = [
  "GenImporterView",
  string,
  string,
  object | null,
  object | null,
];

// ----------------------------------------------------------------------------
// View Operations
// ----------------------------------------------------------------------------

/**
 * CreateViewSection: Create a new view section (can create table/view if needed)
 *
 * @permission OWNER or EDITOR with full access (no granular ACL)
 * @permission-granular FORBIDDEN for users with row/column ACL
 * @returns {tableRef: number, viewRef: number, sectionRef: number}
 * @see /sandbox/grist/useractions.py:2302
 */
export type CreateViewSection = [
  "CreateViewSection",
  number,
  number,
  string,
  number[] | null,
  string,
];

/**
 * UpdateSummaryViewSection: Update summary section grouping columns
 *
 * @permission OWNER or EDITOR with full access (no granular ACL)
 * @permission-granular FORBIDDEN for users with row/column ACL
 * @see /sandbox/grist/useractions.py:2355
 */
export type UpdateSummaryViewSection = [
  "UpdateSummaryViewSection",
  number,
  number[],
];

/**
 * DetachSummaryViewSection: Convert summary section to real table
 *
 * @permission OWNER or EDITOR with full access (no granular ACL)
 * @permission-granular FORBIDDEN for users with row/column ACL
 * @see /sandbox/grist/useractions.py:2366
 */
export type DetachSummaryViewSection = ["DetachSummaryViewSection", number];

/**
 * AddView: Create a new view and include it in tab bar
 *
 * @permission OWNER or EDITOR with full access (no granular ACL)
 * @permission-granular FORBIDDEN for users with row/column ACL
 * @returns {id: number, sections: number[]}
 * @see /sandbox/grist/useractions.py:2382
 */
export type AddView = ["AddView", string, string, string];

/**
 * RemoveView: Remove a view (DEPRECATED)
 *
 * @deprecated Use ["RemoveRecord", "_grist_Views", viewId] instead
 * @permission EDITOR
 * @see /sandbox/grist/useractions.py:2426
 */
export type RemoveView = ["RemoveView", number];

/**
 * AddViewSection: Create view section records (DEPRECATED)
 *
 * @deprecated Use CreateViewSection instead
 * @permission EDITOR
 * @returns {id: number}
 * @see /sandbox/grist/useractions.py:2440
 */
export type AddViewSection = [
  "AddViewSection",
  string,
  string,
  number,
  string,
];

/**
 * RemoveViewSection: Remove a view section (DEPRECATED)
 *
 * @deprecated Use ["RemoveRecord", "_grist_Views_section", sectionId] instead
 * @permission EDITOR
 * @see /sandbox/grist/useractions.py:2455
 */
export type RemoveViewSection = ["RemoveViewSection", number];

// ----------------------------------------------------------------------------
// Union Types
// ----------------------------------------------------------------------------

/**
 * DocAction: Lower-level actions from sandbox (used in ApplyDocActions)
 */
export type DocAction =
  | AddRecord
  | BulkAddRecord
  | UpdateRecord
  | BulkUpdateRecord
  | RemoveRecord
  | BulkRemoveRecord
  | ReplaceTableData
  | AddColumn
  | RemoveColumn
  | RenameColumn
  | ModifyColumn
  | AddTable
  | RemoveTable
  | RenameTable;

/**
 * UserAction: All user actions (can be applied via applyUserActions)
 *
 * Total: 43 actions
 */
export type UserAction =
  | InitNewDoc
  | ApplyDocActions
  | ApplyUndoActions
  | Calculate
  | UpdateCurrentTime
  | RespondToRequests
  | RemoveStaleObjects
  | AddRecord
  | BulkAddRecord
  | ReplaceTableData
  | UpdateRecord
  | BulkUpdateRecord
  | BulkAddOrUpdateRecord
  | AddOrUpdateRecord
  | RemoveRecord
  | BulkRemoveRecord
  | AddColumn
  | AddHiddenColumn
  | AddVisibleColumn
  | RemoveColumn
  | RenameColumn
  | ModifyColumn
  | SetDisplayFormula
  | ConvertFromColumn
  | CopyFromColumn
  | MaybeCopyDisplayFormula
  | RenameChoices
  | AddReverseColumn
  | AddEmptyRule
  | AddEmptyTable
  | AddTable
  | AddRawTable
  | RemoveTable
  | RenameTable
  | DuplicateTable
  | GenImporterView
  | CreateViewSection
  | UpdateSummaryViewSection
  | DetachSummaryViewSection
  | AddView
  | RemoveView
  | AddViewSection
  | RemoveViewSection;

// ============================================================================
// REST API TYPES
// ============================================================================

/**
 * REST API request/response types
 * All endpoints documented with permission requirements
 */

/** Record in record-oriented format (GET/POST /records) */
export interface Record {
  id: number;
  fields: { [colId: string]: CellValue };
}

/** New record (POST /records) - id assigned by server */
export interface NewRecord {
  fields?: { [colId: string]: CellValue };
}

/** Records POST request body */
export interface RecordsPost {
  records: [NewRecord, ...NewRecord[]];
}

/** Records PATCH request body */
export interface RecordsPatch {
  records: [Record, ...Record[]];
}

/** Records PUT request body (upsert) */
export interface RecordsPut {
  records: [AddOrUpdateRecord, ...AddOrUpdateRecord[]];
}

/**
 * SQL query request body (POST /sql)
 *
 * @permission VIEWER + canCopyEverything
 * @permission-note canCopyEverything = full access OR FullCopies ACL permission
 * @permission-note Blocked for users with granular row/column ACL
 *
 * Security: Query wrapped as `select * from (USER_QUERY)` to force SELECT
 * Dialect: SQLite
 * Operations: SELECT only (no INSERT/UPDATE/DELETE/DDL)
 *
 * @see /app/server/lib/runSQLQuery.ts:34
 */
export interface SqlPost {
  /** SQL query (SELECT only) */
  sql: string;
  /** Positional parameters for prepared statement (optional) */
  args?: any[] | null;
  /** Timeout in milliseconds (optional, can only reduce from server default) */
  timeout?: number;
}

/**
 * SQL query response
 */
export interface SqlResponse {
  /** The executed statement */
  statement: string;
  /** Result records */
  records: Array<{
    fields: { [colId: string]: any };
  }>;
}

/** Attachment store types */
export type AttachmentStore = "internal" | "external";

// ============================================================================
// ADDITIONAL API TYPES (from original file)
// ============================================================================

export interface RowRecord {
  id: number;
  [colId: string]: CellValue;
}

export interface RowRecords {
  id: number[];
  [colId: string]: CellValue[];
}

export type UIRowId = number | "new";

export interface CursorPos {
  rowId?: UIRowId;
  rowIndex?: number;
  fieldIndex?: number;
  sectionId?: number;
  linkingRowIds?: UIRowId[];
}

export type ComponentKind = "safeBrowser" | "safePython" | "unsafeNode";
export type RenderTarget = "fullscreen" | number;

export interface RenderOptions {
  height?: string;
}

export interface GristAPI {
  render(
    path: string,
    target: RenderTarget,
    options?: RenderOptions,
  ): Promise<number>;
  dispose(procId: number): Promise<void>;
  subscribe(tableId: string): Promise<void>;
  unsubscribe(tableId: string): Promise<void>;
}

export interface AccessTokenOptions {
  readOnly?: boolean;
  ttlMsecs?: number;
}

export interface AccessTokenResult {
  token: string;
  baseUrl: string;
  ttlMsecs: number;
}

export interface ApplyUAOptions {
  desc?: string;
  otherId?: number;
  linkId?: number;
  parseStrings?: boolean;
}

export interface ApplyUAResult {
  actionNum: number;
  actionHash: string | null;
  retValues: any[];
  isModification: boolean;
}

export interface GristDocAPI {
  getDocName(): Promise<string>;
  listTables(): Promise<string[]>;
  fetchTable(tableId: string): Promise<RowRecords>;
  applyUserActions(
    actions: any[][],
    options?: ApplyUAOptions,
  ): Promise<ApplyUAResult>;
  getAccessToken(options: AccessTokenOptions): Promise<AccessTokenResult>;
}

export interface FetchSelectedOptions {
  keepEncoded?: boolean;
  format?: "rows" | "columns";
  includeColumns?: "shown" | "normal" | "all";
  expandRefs?: boolean;
}

export interface GristView {
  fetchSelectedTable(
    options?: FetchSelectedOptions,
  ): Promise<RowRecords | RowRecord[]>;
  fetchSelectedRecord(
    rowId: number,
    options?: FetchSelectedOptions,
  ): Promise<RowRecord>;
  allowSelectBy(): Promise<void>;
  setSelectedRows(rowIds: number[] | null): Promise<void>;
  setCursorPos(pos: CursorPos): Promise<void>;
}

export interface ColumnToMap {
  name: string;
  title?: string | null;
  description?: string | null;
  type?: string;
  optional?: boolean;
  allowMultiple?: boolean;
  strictType?: boolean;
}

export type ColumnsToMap = (string | ColumnToMap)[];

export interface InteractionOptionsRequest {
  requiredAccess?: string;
  hasCustomOptions?: boolean;
  columns?: ColumnsToMap;
  allowSelectBy?: boolean;
}

export interface InteractionOptions {
  accessLevel: string;
}

export interface WidgetColumnMap {
  [key: string]: string | string[] | null;
}

export interface CustomSectionAPI {
  configure(customOptions: InteractionOptionsRequest): Promise<void>;
  mappings(): Promise<WidgetColumnMap | null>;
}

export interface WidgetAPI {
  getOptions(): Promise<object | null>;
  setOptions(options: { [key: string]: any }): Promise<void>;
  clearOptions(): Promise<void>;
  setOption(key: string, value: any): Promise<void>;
  getOption(key: string): Promise<any>;
}

export interface ReadyPayload {
  requiredAccess?: string;
  columns?: ColumnsToMap;
  allowSelectBy?: boolean;
  onEditOptions?: () => unknown;
}

export type RecordId = number;

export interface MinimalRecord {
  id: number;
}

export interface OpOptions {
  parseStrings?: boolean;
}

export interface TableOperations {
  create(records: NewRecord, options?: OpOptions): Promise<MinimalRecord>;
  create(records: NewRecord[], options?: OpOptions): Promise<MinimalRecord[]>;
  update(records: Record | Record[], options?: OpOptions): Promise<void>;
  destroy(recordIds: RecordId | RecordId[]): Promise<void>;
  upsert(
    records: AddOrUpdateRecord | AddOrUpdateRecord[],
    options?: UpsertOptions,
  ): Promise<void>;
  getTableId(): Promise<string>;
}

export interface GristColumn {
  id: string;
  type: string;
}

export interface GristTable {
  table_name: string | null;
  column_metadata: GristColumn[];
  table_data: any[][];
}

export interface GristTables {
  tables: GristTable[];
}

export interface FileContent {
  content: any;
  name: string;
}

export interface FileListItem {
  kind: "fileList";
  files: FileContent[];
}

export interface URL {
  kind: "url";
  url: string;
}

export interface ImportSource {
  item: FileListItem | URL;
  options?: string | ArrayBuffer;
  description?: string;
}

export interface ImportSourceAPI {
  getImportSource(): Promise<ImportSource | undefined>;
}

export interface ImportProcessorAPI {
  processImport(source: ImportSource): Promise<GristTable[]>;
}

export interface FileSource {
  path: string;
  origName: string;
}

export interface ParseOptions {
  NUM_ROWS?: number;
  SCHEMA?: ParseOptionSchema[];
  WARNING?: string;
}

export interface ParseOptionSchema {
  name: string;
  type: string;
  visible: boolean;
}

export interface ParseFileResult extends GristTables {
  parseOptions: ParseOptions;
}

export interface EditOptionsAPI {
  getParseOptions(parseOptions?: ParseOptions): Promise<ParseOptions>;
}

export interface ParseFileAPI {
  parseFile(
    file: FileSource,
    parseOptions?: ParseOptions,
  ): Promise<ParseFileResult>;
}

export interface Storage {
  getItem(key: string): any;
  hasItem(key: string): boolean;
  setItem(key: string, value: any): void;
  removeItem(key: string): void;
  clear(): void;
}

export interface TableColValues {
  id: number[];
  [colId: string]: CellValue[];
}

export interface TableRecordValue {
  id: number | string;
  fields: { [colId: string]: CellValue };
}

export interface TableRecordValues {
  records: TableRecordValue[];
}

export interface WebhookFields {
  url: string;
  authorization?: string;
  eventTypes: Array<"add" | "update">;
  tableId: string;
  watchedColIds?: string[];
  enabled?: boolean;
  isReadyColumn?: string | null;
  name?: string;
  memo?: string;
}

export interface WebhookSubscribe {
  url: string;
  authorization?: string;
  eventTypes: Array<"add" | "update">;
  watchedColIds?: string[];
  enabled?: boolean;
  isReadyColumn?: string | null;
  name?: string;
  memo?: string;
}

export type WebhookBatchStatus = "success" | "failure" | "rejected";
export type WebhookStatus =
  | "idle"
  | "sending"
  | "retrying"
  | "postponed"
  | "error"
  | "invalid";

export interface WebhookUsage {
  numWaiting: number;
  status: WebhookStatus;
  updatedTime?: number | null;
  lastSuccessTime?: number | null;
  lastFailureTime?: number | null;
  lastErrorMessage?: string | null;
  lastHttpStatus?: number | null;
  lastEventBatch?: {
    size: number;
    errorMessage: string | null;
    httpStatus: number | null;
    status: WebhookBatchStatus;
    attempts: number;
  } | null;
  numSuccess?: {
    pastHour: number;
    past24Hours: number;
  };
}

export interface WebhookSummary {
  id: string;
  fields: {
    url: string;
    authorization?: string;
    unsubscribeKey: string;
    eventTypes: string[];
    isReadyColumn: string | null;
    tableId: string;
    watchedColIds?: string[];
    enabled: boolean;
    name: string;
    memo: string;
  };
  usage: WebhookUsage | null;
}

export interface WebhookSummaryCollection {
  webhooks: WebhookSummary[];
}

export interface WebhookUpdate {
  id: string;
  fields: {
    url?: string;
    authorization?: string;
    eventTypes?: Array<"add" | "update">;
    tableId?: string;
    watchedColIds?: string[];
    enabled?: boolean;
    isReadyColumn?: string | null;
    name?: string;
    memo?: string;
  };
}

export type BasicRole = "owners" | "editors" | "viewers";
export type NonMemberRole = BasicRole | "guests";
export type NonGuestRole = BasicRole | "members";
export type Role = NonMemberRole | "members";

export type SortPref = "name" | "date";
export type ViewPref = "list" | "icons";
export type ThemeAppearance = "light" | "dark";
export type ThemeName = "GristLight" | "GristDark" | "HighContrastLight";

export interface ThemePrefs {
  appearance: ThemeAppearance;
  syncWithOS: boolean;
  colors: {
    light: ThemeName;
    dark: ThemeName;
  };
}

export type BehavioralPrompt =
  | "referenceColumns"
  | "referenceColumnsConfig"
  | "rawDataPage"
  | "accessRules"
  | "filterButtons"
  | "nestedFiltering"
  | "pageWidgetPicker"
  | "pageWidgetPickerSelectBy"
  | "editCardLayout"
  | "addNew"
  | "rickRow"
  | "calendarConfig";

export interface BehavioralPromptPrefs {
  dontShowTips: boolean;
  dismissedTips: BehavioralPrompt[];
}

export type DismissedPopup =
  | "deleteRecords"
  | "deleteFields"
  | "formulaHelpInfo"
  | "formulaAssistantInfo"
  | "supportGrist"
  | "publishForm"
  | "unpublishForm"
  | "upgradeNewAssistant";

export type WelcomePopup = "coachingCall";

export interface DismissedReminder {
  id: WelcomePopup;
  lastDismissedAt: number;
  nextAppearanceAt: number | null;
  timesDismissed: number;
}

export interface UserPrefs {
  showNewUserQuestions?: boolean;
  theme?: ThemePrefs;
  dismissedPopups?: DismissedPopup[];
  behavioralPrompts?: BehavioralPromptPrefs;
  dismissedWelcomePopups?: DismissedReminder[];
  locale?: string;
  onlyShowDocuments?: boolean;
}

export interface UserOrgPrefs {
  docMenuSort?: SortPref;
  docMenuView?: ViewPref;
  seenExamples?: number[];
  showGristTour?: boolean;
  seenDocTours?: string[];
}

export interface OrgPrefs {
  customLogoUrl?: string | null;
}

export interface DocPrefs {
  notifications?: object;
}

export interface FullDocPrefs {
  docDefaults: DocPrefs;
  currentUser: DocPrefs;
}

export interface CommonProperties {
  name: string;
  createdAt: string;
  updatedAt: string;
  removedAt?: string;
  public?: boolean;
}

export type DocumentType = null | "template" | "tutorial";

export interface DocumentIcon {
  backgroundColor?: string;
  color?: string;
  emoji?: string | null;
}

export interface DocumentAppearance {
  icon?: DocumentIcon | null;
}

export interface TutorialMetadata {
  lastSlideIndex?: number;
  percentComplete?: number;
}

export interface DocumentOptions {
  description?: string | null;
  icon?: string | null;
  openMode?: "default" | "fork" | null;
  externalId?: string | null;
  tutorial?: TutorialMetadata | null;
  appearance?: DocumentAppearance | null;
  allowIndex?: boolean;
}

export interface DocumentProperties extends CommonProperties {
  isPinned: boolean;
  urlId: string | null;
  trunkId: string | null;
  type: DocumentType | null;
  options: DocumentOptions | null;
}

export interface FullUser {
  id: number;
  email: string;
  name: string;
  picture?: string | null;
  anonymous?: boolean;
  loginEmail?: string;
  loginMethod?: string;
  locale?: string;
  ref?: string | null;
  prefs?: UserPrefs;
  createdAt?: string;
  firstLoginAt?: string;
}

export interface UserProfile {
  email: string;
  name: string;
  picture?: string;
  anonymous?: boolean;
  loginEmail?: string;
  loginMethod?: string;
  locale?: string;
}

export interface Features {
  vanityDomain?: boolean;
  workspaces?: boolean;
}

export interface Product {
  id: number;
  name: string;
  features: Features;
}

export interface BillingAccount {
  id: number;
  individual: boolean;
  product: Product;
  stripePlanId: string;
  isManager: boolean;
  inGoodStanding: boolean;
  features?: Features;
  externalOptions?: {
    invoiceId?: string;
  };
}

export interface OrganizationProperties extends CommonProperties {
  domain: string | null;
  userOrgPrefs?: UserOrgPrefs;
  orgPrefs?: OrgPrefs;
  userPrefs?: UserPrefs;
}

export interface Organization extends OrganizationProperties {
  id: number;
  owner: FullUser | null;
  billingAccount?: BillingAccount;
  host: string | null;
  access: Role;
}

export interface WorkspaceProperties extends CommonProperties {}

export interface Fork {
  id: string;
  trunkId: string;
  updatedAt: string;
  options: DocumentOptions | null;
}

export interface Workspace extends WorkspaceProperties {
  id: number;
  docs: Document[];
  org: Organization;
  orgDomain?: string;
  access: Role;
  owner?: FullUser;
  isSupportWorkspace?: boolean;
}

export interface Document extends DocumentProperties {
  id: string;
  workspace: Workspace;
  access: Role;
  trunkAccess?: Role | null;
  forks?: Fork[];
}

export enum AccessLevel {
  none = "none",
  read_table = "read table",
  full = "full",
}

export interface WidgetAuthor {
  name: string;
  url?: string;
}

export interface ICustomWidget {
  name: string;
  widgetId: string;
  url: string;
  accessLevel?: AccessLevel;
  renderAfterReady?: boolean;
  published?: boolean;
  source?: {
    pluginId: string;
    name: string;
  };
  description?: string;
  authors?: WidgetAuthor[];
  lastUpdatedAt?: string;
  isGristLabsMaintained?: boolean;
}

export interface QueryFilters {
  [colId: string]: CellValue[];
}

export type QueryOperation = "in" | "intersects" | "empty";
export type DestId = string | null | "";

export interface TransformColumn {
  label: string;
  colId: string | null;
  type: string;
  formula: string;
  widgetOptions: string;
}

export interface TransformRule {
  destTableId: DestId;
  destCols: TransformColumn[];
  sourceCols: string[];
}

export interface TransformRuleMap {
  [origTableName: string]: TransformRule;
}

export interface MergeStrategy {
  type:
    | "replace-with-nonblank-source"
    | "replace-all-fields"
    | "replace-blank-fields-only";
}

export interface MergeOptions {
  mergeCols: string[];
  mergeStrategy: MergeStrategy;
}

export interface ImportOptions {
  parseOptions?: ParseOptions;
  mergeOptionMaps?: { [origTableName: string]: MergeOptions | undefined }[];
}

export interface MapColumnNamesOptions {
  columns?: ColumnsToMap;
  mappings?: WidgetColumnMap | null;
  reverse?: boolean;
}

export interface GristPluginAPI {
  readonly api: GristAPI;
  readonly docApi: GristDocAPI & GristView;
  readonly viewApi: GristView;
  readonly widgetApi: WidgetAPI;
  readonly sectionApi: CustomSectionAPI;
  readonly selectedTable: TableOperations;

  ready(settings?: ReadyPayload): void;
  getTable(tableId?: string): TableOperations;
  getAccessToken(options?: AccessTokenOptions): Promise<AccessTokenResult>;
  fetchSelectedTable(
    options?: FetchSelectedOptions,
  ): Promise<RowRecords | RowRecord[]>;
  fetchSelectedRecord(
    rowId: number,
    options?: FetchSelectedOptions,
  ): Promise<RowRecord>;
  onRecord(
    callback: (data: RowRecord | null, mappings: WidgetColumnMap | null) => any,
    options?: FetchSelectedOptions,
  ): void;
  onNewRecord(callback: (mappings: WidgetColumnMap | null) => any): void;
  onRecords(
    callback: (data: RowRecord[], mappings: WidgetColumnMap | null) => any,
    options?: FetchSelectedOptions,
  ): void;
  onOptions(
    callback: (options: any, settings: InteractionOptions) => any,
  ): void;
  allowSelectBy(): Promise<void>;
  setSelectedRows(rowIds: number[] | null): Promise<void>;
  setCursorPos(pos: CursorPos): Promise<void>;
  getOption(key: string): Promise<any>;
  setOption(key: string, value: any): Promise<void>;
  setOptions(options: { [key: string]: any }): Promise<void>;
  getOptions(): Promise<object | null>;
  clearOptions(): Promise<void>;
  mapColumnNames(data: any, options?: MapColumnNamesOptions): any;
  mapColumnNamesBack(
    data: any,
    options?: Omit<MapColumnNamesOptions, "reverse">,
  ): any;
}

declare global {
  const grist: GristPluginAPI;
}

// ============================================================================
// CELLVALUE ENCODING REFERENCE
// ============================================================================

/**
 * CELLVALUE ENCODING BY COLUMN TYPE
 * ==================================
 *
 * Wire Format: This shows the EXACT format sent/received over the API.
 * No automatic conversion or simplification occurs.
 *
 * | Column Type | Empty Value | Non-Empty Example | Notes |
 * |-------------|-------------|-------------------|-------|
 * | Text | "" or null | "hello" | Plain string |
 * | Numeric | null | 123.45 | Plain number |
 * | Int | null | 42 | Plain number |
 * | Bool | null | true | Plain boolean |
 * | Date | null | 1704067200 or ["d", 1704067200] | Seconds since epoch |
 * | DateTime | null | 1704067200 or ["D", 1704067200, "UTC"] | Seconds + timezone |
 * | Choice | null | "Option A" | Plain string |
 * | ChoiceList | null or ["L"] | ["L", "A", "B"] | Array with code "L" |
 * | Ref | 0 | 17 | Row ID (0 = no reference) |
 * | RefList | null | ["L", 1, 2, 3] | NEVER ["L"] when empty! |
 * | Attachments | null | ["L", 123, 456] | Same as RefList |
 * | Reference (Any) | null | ["R", "Table", 17] | Includes table ID |
 * | ReferenceList (Any) | null | ["r", "Table", [1, 2]] | Includes table ID |
 *
 * CRITICAL NOTES:
 * ===============
 * 1. **RefList empty is null, NOT ["L"]** - This differs from ChoiceList!
 * 2. **Ref uses 0 for no reference, NOT null** - Only Ref type has this behavior
 * 3. **Timestamps are in SECONDS** - Not milliseconds (divide Date.now() by 1000)
 * 4. **WidgetOptions are JSON strings** - Not objects in API requests/responses
 * 5. **Direct pass-through** - Values are returned exactly as stored, no simplification
 *
 * @see Wire format verification: /app/server/lib/DocApi.ts:318-323
 * @see Type defaults: /app/common/gristTypes.ts:40
 */

export {};
