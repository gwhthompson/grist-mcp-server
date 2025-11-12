/**
 * Tool Definitions Registry
 *
 * Centralized metadata, schemas, and handlers for all MCP tools.
 * This file provides a type-safe registry of tool definitions that can be
 * programmatically registered with the MCP server.
 *
 * Architecture:
 * - Uses Zod schemas for runtime validation and type inference
 * - Branded types from advanced.ts for ID type safety
 * - Generic ToolDefinition type for compile-time safety
 * - Centralized annotations for MCP server hints
 */

import type { z } from 'zod'
import type { GristClient } from '../services/grist-client.js'
import { ManageColumnsSchema, manageColumns } from '../tools/columns.js'

// Import all schemas
import {
  GetDocumentsSchema,
  GetTablesSchema,
  GetWorkspacesSchema,
  getDocuments,
  getTables,
  getWorkspaces
} from '../tools/discovery.js'
import { CreateDocumentSchema, createDocument } from '../tools/documents.js'
import { GetRecordsSchema, getRecords, QuerySQLSchema, querySql } from '../tools/reading.js'
import {
  AddRecordsSchema,
  addRecords,
  DeleteRecordsSchema,
  deleteRecords,
  UpdateRecordsSchema,
  UpsertRecordsSchema,
  updateRecords,
  upsertRecords
} from '../tools/records.js'
import {
  CreateTableSchema,
  createTable,
  DeleteTableSchema,
  deleteTable,
  RenameTableSchema,
  renameTable
} from '../tools/tables.js'
import type { MCPToolResponse } from '../types.js'

// ============================================================================
// Advanced Type Definitions
// ============================================================================

/**
 * MCP tool annotations interface
 * These hints help AI assistants understand tool behavior and safety
 */
export interface ToolAnnotations {
  readonly readOnlyHint: boolean // Tool only reads data
  readonly destructiveHint: boolean // Tool deletes/destroys data
  readonly idempotentHint: boolean // Safe to retry/repeat
  readonly openWorldHint: boolean // Can discover new information
}

/**
 * Generic tool handler function type
 * Infers parameter types from Zod schema for full type safety
 *
 * @template TSchema - Zod schema defining input parameters
 */
export type ToolHandler<TSchema extends z.ZodTypeAny> = (
  client: GristClient,
  params: z.infer<TSchema>
) => Promise<MCPToolResponse>

/**
 * Complete tool definition with schema, metadata, and handler
 *
 * @template TSchema - Zod schema for input validation and type inference
 */
export interface ToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: TSchema
  readonly annotations: ToolAnnotations
  readonly handler: ToolHandler<TSchema>
}

/**
 * Tool category grouping for organizational clarity
 */
export type ToolCategory = 'discovery' | 'reading' | 'records' | 'tables' | 'columns' | 'documents'

/**
 * Categorized tool definition with category metadata
 */
export interface CategorizedToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny>
  extends ToolDefinition<TSchema> {
  readonly category: ToolCategory
}

// ============================================================================
// Annotation Presets (DRY pattern for common configurations)
// ============================================================================

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
} as const

const WRITE_SAFE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true
} as const

const WRITE_IDEMPOTENT_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
} as const

const DESTRUCTIVE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true
} as const

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Discovery & Navigation Tools (3 tools)
 * Enable exploration of workspaces, documents, and table structures
 */
export const DISCOVERY_TOOLS: ReadonlyArray<CategorizedToolDefinition> = [
  {
    category: 'discovery',
    name: 'grist_get_workspaces',
    title: 'Get Workspaces',
    description: `Get workspaces with flexible filtering and detail control

This tool retrieves Grist workspaces. Use parameters to control:
- WHICH workspaces: name_contains
- HOW MUCH detail: detail_level (summary/detailed)
- HOW MANY: limit, offset

MODES (automatic based on parameters):

1. BROWSE ALL: No filters
   Input: {limit: 20}
   Output: All accessible workspaces
   Use when: Exploring available workspaces

2. SEARCH: Provide name_contains
   Input: {name_contains: "Sales"}
   Output: Workspaces with "Sales" in name
   Use when: Finding specific workspace

EXAMPLES:
{limit: 20, detail_level: "summary"}              → Browse all
{name_contains: "Sales", limit: 5}                → Find Sales workspaces
{name_contains: "Team", detail_level: "detailed"} → Search with full metadata

SEE ALSO:
- grist_get_documents: To find documents within workspaces
- grist_create_document: To create documents in a workspace (v2.0)`,
    inputSchema: GetWorkspacesSchema,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: getWorkspaces
  },
  {
    category: 'discovery',
    name: 'grist_get_documents',
    title: 'Get Documents',
    description: `Get documents with flexible filtering and detail control

This tool retrieves Grist documents. Use parameters to control:
- WHICH documents: docId, name_contains, workspaceId
- HOW MUCH detail: detail_level (summary/detailed)
- HOW MANY: limit, offset

MODES (automatic based on parameters):

1. GET BY ID: Provide docId
   Input: {docId: "abc123"}
   Output: Single document with metadata
   Use when: You know the exact document ID
   Fastest option - direct access

2. SEARCH BY NAME: Provide name_contains
   Input: {name_contains: "Customer CRM", limit: 5}
   Output: Documents matching "Customer CRM"
   Use when: You know part of the document name
   Returns 1-5 matches typically

3. BROWSE ALL: No filters
   Input: {limit: 20, detail_level: "summary"}
   Output: First 20 accessible documents
   Use when: Exploring available documents

4. FILTER BY WORKSPACE: Provide workspaceId
   Input: {workspaceId: "ws_789", limit: 10}
   Output: Documents in that workspace
   Use when: Working within specific workspace

DETAIL LEVELS:
- summary: name, id, workspace, access (fast, ~50 tokens/doc)
- detailed: + permissions, timestamps, urls, isPinned (~150 tokens/doc)

Start with summary, upgrade to detailed only if needed.

PERFORMANCE TIPS:
- If you know docId: Use it (fastest - 1 API call)
- If you know name: Use name_contains (fast - filters in memory)
- Browse all: More expensive (fetches all docs, then filters)

EXAMPLES:

{docId: "qBbArddFDSrKd2jpv3uZTj"}
→ Get specific document

{name_contains: "CRM"}
→ Find all documents with "CRM" in name

{name_contains: "Customer CRM", limit: 3}
→ Find top 3 matches for "Customer CRM"

{workspaceId: "3", limit: 10}
→ Get documents in workspace 3

{limit: 20, detail_level: "summary"}
→ Browse first 20 documents (lightweight)

{name_contains: "Sales", workspaceId: "ws_789"}
→ Find "Sales" documents in specific workspace

ERRORS:
- "Document not found (ID: 'X')": Invalid docId or no access
  → Try grist_get_documents without filters to see accessible docs

- "Workspace not found": Invalid workspaceId
  → Use grist_get_workspaces to find valid workspace IDs

- "No documents found matching 'X'": Search returned no results
  → Try broader search term or remove filters

SEE ALSO:
- grist_get_workspaces: To find workspace IDs first
- grist_get_tables: To explore document structure
- grist_query_sql: To query document data`,
    inputSchema: GetDocumentsSchema,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: getDocuments
  },
  {
    category: 'discovery',
    name: 'grist_get_tables',
    title: 'Get Grist Table Structure',
    description: `Understand data structure and schema within a document.

This tool retrieves table information with configurable detail levels. Essential for understanding database structure before reading or modifying data. Does NOT return document metadata (use grist_get_document for that).

Parameters:
  - docId (string): Document ID from grist_list_documents
  - tableId (string, optional): Specific table to retrieve. Omit to get all tables
  - detail_level ('names' | 'columns' | 'full_schema'): Amount of information
    - 'names': Just table IDs
    - 'columns': Table IDs + column names (default)
    - 'full_schema': + types, formulas, widget options (most verbose)

    ⚠️ IMPORTANT: widgetOptions are ONLY returned with detail_level='full_schema'
    To verify widget options after setting them, use detail_level='full_schema'

  - response_format ('json' | 'markdown'): Output format (default: 'markdown')

Returns (JSON format):
  {
    "document_id": string,
    "table_count": number,
    "tables": [{
      "id": string,
      "columns": [
        {
          "id": string,
          "label": string,
          "type": string,      // "Text", "Numeric", "Date", "Ref", etc.
          "is_formula": boolean,
          "formula": string | null
        }
      ]
    }]
  }

Use when:
  - Before reading data to understand structure
  - Before adding records to know column names
  - Analyzing database schema
  - Finding table names for SQL queries

Don't use when:
  - Need actual data (use grist_get_records or grist_query_sql)
  - Need document metadata (use grist_get_document)

Error Handling:
  - Returns 404 if document or table not found
  - Lists available tables if specific tableId not found`,
    inputSchema: GetTablesSchema,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: getTables
  }
] as const

/**
 * Data Reading Tools (2 tools)
 * SQL queries and simple record retrieval
 */
export const READING_TOOLS: ReadonlyArray<CategorizedToolDefinition> = [
  {
    category: 'reading',
    name: 'grist_query_sql',
    title: 'Query Grist with SQL',
    description: `Execute SQL queries for complex analytics and data retrieval.

USE THIS TOOL WHEN:
✅ Need to JOIN data across multiple tables
   Example: Combine Customers + Orders tables
✅ Need aggregations (SUM, AVG, COUNT, GROUP BY)
   Example: "Calculate average deal value by region"
✅ Complex filtering with multiple conditions
   Example: WHERE Status='Active' AND (Priority=1 OR Priority=2)
✅ You know SQL and the query is complex
   Performance: Handles complex logic efficiently

DON'T USE WHEN:
❌ Simple single-table fetch → Use grist_get_records (simpler, no SQL needed)
❌ Don't know table structure → Use grist_get_tables first
❌ Just need all records from one table → Use grist_get_records (easier)

WHEN TO CHOOSE: grist_query_sql vs grist_get_records

Use grist_query_sql if:
- Multiple tables involved (JOINs)
- Need aggregations (SUM, AVG, COUNT)
- Complex WHERE clauses with OR/AND
- You're comfortable with SQL

Use grist_get_records if:
- Single table
- Simple filters like {"Status": "Active"}
- Don't know SQL
- Want simpler syntax

Parameters:
  - docId (string): Document ID
  - sql (string): SQL query. Table names = Grist table IDs
  - parameters (array, optional): For $1, $2 placeholders
  - response_format, offset, limit

EXAMPLES:

1. JOIN across tables:
   sql: "SELECT c.Name, o.Total FROM Customers c JOIN Orders o ON c.id = o.Customer"
   → Returns customer names with their order totals

2. Aggregation:
   sql: "SELECT Region, AVG(Sales) as AvgSales FROM Data GROUP BY Region"
   → Returns average sales by region

3. Complex filter:
   sql: "SELECT * FROM Tasks WHERE Status='Open' AND (Priority=1 OR AssignedTo='John')"
   → Returns high-priority or John's open tasks

4. Parameterized (safer - SQLite style):
   sql: "SELECT * FROM Contacts WHERE Region = ?"
   parameters: ["West"]
   → Prevents SQL injection. Use ? placeholders (not $1, $2)

ERRORS:
- "SQL syntax error": Check query syntax → Verify table/column names with grist_get_tables
- "Table 'X' not found": Table doesn't exist → Use grist_get_tables to see available tables

SEE ALSO:
- grist_get_records: For simple single-table queries
- grist_get_tables: To see available tables/columns before querying`,
    inputSchema: QuerySQLSchema,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: querySql
  },
  {
    category: 'reading',
    name: 'grist_get_records',
    title: 'Get Grist Records',
    description: `Simple record fetching without SQL knowledge required.

USE THIS TOOL WHEN:
✅ Simple single-table data fetch
   Example: Get all active contacts
✅ Don't know SQL (this is easier!)
   No SQL syntax required
✅ Basic filtering like {"Status": "Active"}
   Simple key-value filters
✅ Want specific columns only
   Example: Just get Name and Email columns
✅ Fastest for simple queries
   Performance: Direct table access, no SQL parsing

DON'T USE WHEN:
❌ Need to JOIN multiple tables → Use grist_query_sql
❌ Need aggregations (SUM, AVG, COUNT) → Use grist_query_sql
❌ Complex OR/AND logic → Use grist_query_sql

WHEN TO CHOOSE: grist_get_records vs grist_query_sql

Use grist_get_records if:
- Single table only
- Simple filters (Status="Active", Priority=1)
- Don't know SQL
- Want fastest performance for simple queries

Use grist_query_sql if:
- Multiple tables (JOINs)
- Aggregations needed
- Complex WHERE with OR/AND
- You know SQL

Parameters:
  - docId (string): Document ID
  - tableId (string): Table ID
  - filters (object, optional): {"ColumnName": value}
  - columns (array, optional): ["Col1", "Col2"] for specific columns only
  - response_format, offset, limit

EXAMPLES:

1. Get all active contacts:
   {tableId: "Contacts", filters: {"Status": "Active"}}
   → Returns all contacts where Status is Active

2. Get high-priority tasks:
   {tableId: "Tasks", filters: {"Priority": 1}}
   → Returns all Priority 1 tasks

3. Multiple filters (AND logic):
   {tableId: "Contacts", filters: {"Status": "Active", "Region": "West"}}
   → Returns contacts that are BOTH Active AND in West region

4. Filter by multiple values (IN clause):
   {tableId: "Tasks", filters: {"Priority": ["in", [1, 2]]}}
   → Returns tasks with Priority 1 OR 2

5. Get specific columns only:
   {tableId: "Contacts", columns: ["Name", "Email"]}
   → Returns only Name and Email (saves tokens!)

ERRORS:
- "Table 'X' not found": Invalid table → Use grist_get_tables to see available tables
- "Column 'X' not found": Invalid column in filter → Use grist_get_tables to see columns

SEE ALSO:
- grist_query_sql: For complex queries with JOINs or aggregations
- grist_get_tables: To see available tables and columns`,
    inputSchema: GetRecordsSchema,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: getRecords
  }
] as const

/**
 * Record Operation Tools (4 tools)
 * CRUD operations for record data
 */
export const RECORD_TOOLS: ReadonlyArray<CategorizedToolDefinition> = [
  {
    category: 'records',
    name: 'grist_add_records',
    title: 'Add Grist Records',
    description: `Insert new records into a table (fastest for bulk inserts).

USE THIS TOOL WHEN:
✅ All records are definitely NEW (no duplicates)
   Example: First-time data import
✅ Speed matters most
   Performance: FASTEST - Direct insert, no duplicate checking
✅ Initial data population
   Example: Importing clean CSV with no existing data
✅ Creating test data
   Example: Seeding database with sample records

⚠️  WARNING: This tool DOES NOT check for duplicates!
   If you add the same record twice, it will create two separate records.
   For sync workflows, use grist_upsert_records instead.

DON'T USE WHEN:
❌ Records might already exist → Use grist_upsert_records (handles duplicates)
❌ Syncing data from external source → Use grist_upsert_records (idempotent)
❌ CSV might have duplicates → Use grist_upsert_records (safer)
❌ API integration sync → Use grist_upsert_records (prevents errors)

WHEN TO CHOOSE: grist_add_records vs grist_upsert_records

Use grist_add_records if:
- 100% certain records are new
- No existing data in table
- Speed is critical
- Will error if duplicate exists (that's OK)

Use grist_upsert_records if:
- Records might already exist
- Syncing from external source (API, CSV)
- Want "add or update" behavior
- Need idempotent operations
- Don't want errors on duplicates

Parameters:
  - docId, tableId, response_format
  - records (array): Max 500 per request

📝 CELLVALUE ENCODING (CRITICAL!)

Grist uses special encoding for complex data types. Using wrong encoding causes 500 errors!

1. **Text, Number, Boolean**: Use values directly
   ✅ {"Name": "John", "Age": 30, "IsActive": true}

2. **ChoiceList** (multiple selection): Add "L" prefix
   ❌ WRONG: {"Tags": ["VIP", "Active"]}
   ✅ RIGHT: {"Tags": ["L", "VIP", "Active"]}

3. **Date**: Use ["d", timestamp_milliseconds]
   ❌ WRONG: {"JoinDate": "2024-01-15"}
   ❌ WRONG: {"JoinDate": 1705276800}
   ✅ RIGHT: {"JoinDate": ["d", 1705276800000]}
   💡 Get timestamp: Date.parse("2024-01-15") → 1705276800000

4. **DateTime**: Use ["D", timestamp, timezone]
   ❌ WRONG: {"CreatedAt": 1705276800000}
   ✅ RIGHT: {"CreatedAt": ["D", 1705276800000, "UTC"]}
   ✅ RIGHT: {"CreatedAt": ["D", 1705276800000, "America/New_York"]}

5. **Reference** (Ref column): Use ["R", row_id]
   ✅ {"Manager": ["R", 456]}

6. **ReferenceList** (RefList column): Use ["r", [row_ids]]
   ✅ {"TeamMembers": ["r", [10, 11, 12]]}

⚠️  Most Common Mistake: Forgetting type prefixes ("L", "d", "D") causes 500 errors!

COMPLETE ENCODING EXAMPLE:
{
  "records": [{
    "Name": "John Smith",                       // Text - use directly
    "Age": 30,                                   // Int - use directly
    "Salary": 75000.50,                          // Numeric - use directly
    "IsActive": true,                            // Bool - use directly
    "Tags": ["L", "VIP", "Manager", "Remote"],  // ChoiceList - "L" prefix!
    "HireDate": ["d", 1705276800000],           // Date - "d" + timestamp
    "LastLogin": ["D", 1705276800000, "UTC"],   // DateTime - "D" + timestamp + tz
    "Manager": ["R", 456],                       // Ref - "R" + row_id
    "DirectReports": ["r", [10, 11, 12]]        // RefList - "r" + array of row_ids
  }]
}

EXAMPLES:

1. Add new contacts (first time):
   {
     records: [
       {"Name": "John Doe", "Email": "john@example.com", "Status": "Active"},
       {"Name": "Jane Smith", "Email": "jane@example.com", "Status": "Active"}
     ]
   }
   → Inserts 2 new records, returns row IDs

2. Bulk import from clean source:
   {records: [...100 new records...]}
   → Fast bulk insert

ERRORS:
- "Column 'X' not found": Invalid column name → Use grist_get_tables to see schema
- "Type mismatch": Wrong data type → Check grist_get_tables for column types
- "Duplicate key": Record already exists → Use grist_upsert_records instead

PERFORMANCE:
⚡ FASTEST: grist_add_records (no checks)
🔄 SMARTEST: grist_upsert_records (handles duplicates)

SEE ALSO:
- grist_upsert_records: For sync workflows (handles add OR update)
- grist_update_records: To modify existing records by row ID`,
    inputSchema: AddRecordsSchema,
    annotations: WRITE_SAFE_ANNOTATIONS,
    handler: addRecords
  },
  {
    category: 'records',
    name: 'grist_update_records',
    title: 'Update Grist Records',
    description: `Modify existing records by row ID.

Use this when you have specific row IDs and want to update those exact records.

Parameters:
  - docId (string): Document ID
  - tableId (string): Table ID
  - rowIds (array): Array of row IDs to update (from grist_get_records). Max 500 per request
  - updates (object): Column values to set. Format: {"Column": value}
  - response_format ('json' | 'markdown'): Output format (default: 'markdown')

📝 CELLVALUE ENCODING - Same as grist_add_records!

Use encoded formats for: ChoiceList ["L", ...], Date ["d", timestamp], DateTime ["D", timestamp, tz], Reference ["R", id], RefList ["r", [ids]].
See grist_add_records description for complete encoding guide.

Example:
  rowIds: [1, 2, 3]
  updates: {"Status": "Complete", "CompletedDate": ["d", 1705276800000]}

Returns (JSON format):
  {
    "success": true,
    "records_updated": number
  }

Use when:
  - Have specific row IDs to update
  - Batch updating multiple records with same values
  - Updating by ID (not by unique field)

Don't use when:
  - Don't have row IDs (use grist_upsert_records)
  - Need "add or update" behavior (use grist_upsert_records)
  - Adding new records (use grist_add_records)

Error Handling:
  - Returns 404 if row IDs don't exist
  - Returns error if column doesn't exist`,
    inputSchema: UpdateRecordsSchema,
    annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    handler: updateRecords
  },
  {
    category: 'records',
    name: 'grist_upsert_records',
    title: 'Upsert Grist Records',
    description: `Add new records OR update existing ones (smart sync tool).

⭐ CRITICAL FOR SYNC WORKFLOWS - Use this for CSV imports, API syncs, and data integration!

USE THIS TOOL WHEN:
✅ Syncing data from external source (API, database, CSV)
   Example: Daily sync from Salesforce
✅ CSV import that might have duplicates
   Safely handles existing records
✅ Don't know if records already exist
   Idempotent - safe to run multiple times
✅ Need "add OR update" behavior
   Example: Import customer list, update if exists, add if new
✅ Data integration workflows
   Example: Sync between Grist and external system

DON'T USE WHEN:
❌ All records are definitely new → Use grist_add_records (faster)
❌ Have specific row IDs to update → Use grist_update_records (simpler)
❌ Just adding test data → Use grist_add_records (no overhead)

WHEN TO CHOOSE: grist_upsert_records vs grist_add_records

Use grist_upsert_records (SMARTEST) if:
- Syncing from external source
- CSV might have existing records
- Want idempotent operations (safe to retry)
- Need "add or update" logic
- Don't want duplicate errors

Use grist_add_records (FASTEST) if:
- 100% certain records are new
- Initial data load
- Speed is critical
- OK with error if duplicate exists

Parameters:
  - docId, tableId, response_format
  - records (array): Each record has:
    - require: Unique identifier to match on
    - fields: Values to set/update
  - onMany: 'first' | 'none' | 'all' (default: 'first')
  - add: true to insert if not found (default: true)
  - update: true to modify if found (default: true)

📝 CELLVALUE ENCODING - Same as grist_add_records!

Use encoded formats for: ChoiceList ["L", ...], Date ["d", timestamp], DateTime ["D", timestamp, tz], Reference ["R", id], RefList ["r", [ids]].
See grist_add_records description for complete encoding guide.

EXAMPLES:

1. Sync contacts by email (most common):
   {
     records: [
       {
         "require": {"Email": "john@example.com"},
         "fields": {"Name": "John Doe", "Status": "Active", "LastSync": "2024-01-15"}
       }
     ]
   }
   → If email exists: Updates Name, Status, LastSync
   → If email doesn't exist: Adds new record
   → Idempotent: Safe to run daily

2. Sync customers by external ID:
   {
     records: [
       {
         "require": {"CustomerID": "SF-12345"},
         "fields": {"Name": "Acme Corp", "Status": "VIP"}
       }
     ]
   }
   → Matches on CustomerID, updates or adds

3. Update-only mode (no adds):
   {
     records: [{...}],
     add: false,
     update: true
   }
   → Only updates existing, skips new records

ERRORS:
- "Column 'X' not found": Invalid column → Use grist_get_tables to see schema
- "Multiple records match": Multiple found → Use onMany parameter to specify behavior

PERFORMANCE:
⚡ FASTEST: grist_add_records (no duplicate check)
🔄 SMARTEST: grist_upsert_records (idempotent, safe)
🎯 PRECISE: grist_update_records (by row ID)

SEE ALSO:
- grist_add_records: For bulk insert of new records (faster)
- grist_update_records: To modify records by row ID`,
    inputSchema: UpsertRecordsSchema,
    annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    handler: upsertRecords
  },
  {
    category: 'records',
    name: 'grist_delete_records',
    title: 'Delete Grist Records',
    description: `Permanently remove records from a table.

WARNING: This operation cannot be undone. Deleted records are permanently removed.

Parameters:
  - docId (string): Document ID
  - tableId (string): Table ID
  - rowIds (array): Array of row IDs to delete (from grist_get_records). Max 500 per request
  - response_format ('json' | 'markdown'): Output format (default: 'markdown')

Returns (JSON format):
  {
    "success": true,
    "records_deleted": number,
    "warning": "This operation cannot be undone..."
  }

Use when:
  - Cleaning up test data
  - Removing obsolete records
  - Batch deletion by ID

Don't use when:
  - Want to archive instead of delete (use grist_update_records to set Status="Archived")
  - Uncertain about deletion (consider archiving first)

Error Handling:
  - Returns 404 if row IDs don't exist
  - Returns permission error if insufficient access`,
    inputSchema: DeleteRecordsSchema,
    annotations: DESTRUCTIVE_ANNOTATIONS,
    handler: deleteRecords
  }
] as const

/**
 * Table Management Tools (3 tools)
 * Schema operations for table lifecycle
 */
export const TABLE_TOOLS: ReadonlyArray<CategorizedToolDefinition> = [
  {
    category: 'tables',
    name: 'grist_create_table',
    title: 'Create Grist Table',
    description: `Create a new table with initial column structure.

Use this to add new data structures to a document. Tables are created with specified columns plus default Grist columns (id, manualSort).

Parameters:
  - docId (string): Document ID
  - tableName (string): Table identifier. Use alphanumeric and underscores
  - columns (array): Column definitions. Each has:
    - colId (string): Column identifier
    - type (string): Data type ("Text", "Numeric", "Int", "Bool", "Date", "DateTime", "Choice", "ChoiceList", "Ref", "RefList", "Attachments")
    - label (string, optional): Human-readable label
    - formula (string, optional): Formula code if formula column
    - isFormula (boolean, optional): Set true for formula columns
    - widgetOptions (object, optional): Widget-specific options
  - response_format ('json' | 'markdown'): Output format (default: 'markdown')

Example columns:
  [
    {"colId": "Name", "type": "Text", "label": "Full Name"},
    {"colId": "Email", "type": "Text"},
    {"colId": "JoinDate", "type": "Date"},
    {"colId": "Status", "type": "Choice", "widgetOptions": {"choices": ["Active", "Inactive"]}}
  ]

Returns (JSON format):
  {
    "success": true,
    "table_id": string,
    "columns_created": number,
    "url": string
  }

Use when:
  - Building new database structures
  - Creating CRM, project trackers, etc.
  - Adding data models to documents

Don't use when:
  - Table already exists (use grist_manage_columns to add columns)

Error Handling:
  - Returns error if table name already exists
  - Returns error if invalid column type`,
    inputSchema: CreateTableSchema,
    annotations: WRITE_SAFE_ANNOTATIONS,
    handler: createTable
  },
  {
    category: 'tables',
    name: 'grist_rename_table',
    title: 'Rename Grist Table',
    description: `Change a table's identifier.

Use this to rename tables for better organization or clarity. References from formulas and other tables are automatically updated.

Parameters:
  - docId (string): Document ID
  - tableId (string): Current table identifier
  - newTableId (string): New table identifier
  - response_format ('json' | 'markdown'): Output format (default: 'markdown')

Returns (JSON format):
  {
    "success": true,
    "old_table_id": string,
    "new_table_id": string
  }

Use when:
  - Improving table naming conventions
  - Reorganizing database structure
  - Fixing naming mistakes

Don't use when:
  - Want to change display label only (not currently supported)

Error Handling:
  - Returns error if old table doesn't exist
  - Returns error if new name conflicts with existing table`,
    inputSchema: RenameTableSchema,
    annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    handler: renameTable
  },
  {
    category: 'tables',
    name: 'grist_delete_table',
    title: 'Delete Grist Table',
    description: `Permanently remove a table and all its data.

WARNING: This operation CANNOT be undone. All data in the table will be permanently deleted.

Parameters:
  - docId (string): Document ID
  - tableId (string): Table identifier to delete
  - response_format ('json' | 'markdown'): Output format (default: 'markdown')

Returns (JSON format):
  {
    "success": true,
    "table_id": string,
    "warning": "THIS OPERATION CANNOT BE UNDONE..."
  }

Use when:
  - Removing obsolete tables
  - Cleaning up test structures
  - Certain about deletion

Don't use when:
  - Uncertain about deletion (backup first)
  - Other tables reference this table (may break references)

Error Handling:
  - Returns 404 if table doesn't exist
  - May return warning if table is referenced`,
    inputSchema: DeleteTableSchema,
    annotations: DESTRUCTIVE_ANNOTATIONS,
    handler: deleteTable
  }
] as const

/**
 * Column Management Tools (1 tool)
 * Consolidated column lifecycle operations
 */
export const COLUMN_TOOLS: ReadonlyArray<CategorizedToolDefinition> = [
  {
    category: 'columns',
    name: 'grist_manage_columns',
    title: 'Manage Grist Columns',
    description: `Complete column lifecycle management: add, modify, delete, and rename columns.

This consolidated tool handles all column operations atomically. Multiple operations execute together - if any fails, all are rolled back. More context-efficient than separate tools for each operation.

Parameters:
  - docId (string): Document ID
  - tableId (string): Table ID
  - operations (array): Column operations to perform (max 50). Each operation has:
    - action: "add" | "modify" | "delete" | "rename"

    For action="add":
      - colId (string): Column identifier
      - type (string): Data type
      - label (string, optional): Display label
      - formula (string, optional): Formula code
      - isFormula (boolean, optional): True for formula columns
      - widgetOptions (object, optional): Widget options

    For action="modify":
      - colId (string): Column to modify
      - type, label, formula, isFormula, widgetOptions (all optional)

    For action="delete":
      - colId (string): Column to remove

    For action="rename":
      - oldColId (string): Current column ID
      - newColId (string): New column ID

  - response_format ('json' | 'markdown'): Output format (default: 'markdown')

📝 WIDGET OPTIONS BY COLUMN TYPE

Widget options control how columns are displayed and formatted. Here are the valid options for each type:

**Numeric/Int columns:**
- numMode: "currency" | "decimal" | "percent" | "scientific" (display format)
- currency: ISO 4217 code - REQUIRED if numMode="currency" (e.g., "USD", "EUR", "GBP")
- decimals: 0-20 (minimum decimal places to show)
- maxDecimals: 0-20 (maximum decimal places)
- numSign: "parens" (show negative numbers in parentheses)
Example: {"numMode": "currency", "currency": "USD", "decimals": 2}

**Date columns:**
- dateFormat: Moment.js format string (e.g., "YYYY-MM-DD", "MM/DD/YYYY", "MMM D, YYYY")
- isCustomDateFormat: true if using custom format
Example: {"dateFormat": "MMM D, YYYY"}

**DateTime columns:**
- dateFormat: Date part format (e.g., "YYYY-MM-DD")
- timeFormat: Time part format (e.g., "HH:mm:ss", "h:mm A")
- isCustomDateFormat, isCustomTimeFormat: Booleans
Example: {"dateFormat": "YYYY-MM-DD", "timeFormat": "HH:mm:ss"}

**Choice/ChoiceList columns:**
- choices: Array of available options (max 1000 items, each 1-255 chars)
- choiceOptions: Per-choice styling - {"Option": {"fillColor": "#RRGGBB", "textColor": "#RRGGBB"}}
Example: {"choices": ["Todo", "Done"], "choiceOptions": {"Done": {"fillColor": "#10B981"}}}

**Reference (Ref/RefList) columns:**
- visibleCol: Which column from the referenced table to display
  ⚠️ Set at TOP-LEVEL of operation (NOT in widgetOptions!)

  **HOW IT WORKS:**

  1. You provide visibleCol at operation level:
     • String column name: "Email", "Name", "FirstName" (RECOMMENDED - auto-resolved)
     • Numeric column ID: 456, 789 (advanced - pass-through)

  2. MCP server resolves string names to numeric IDs (via API call to foreign table)

  3. Grist receives numeric visibleCol and automatically:
     • Creates hidden gristHelper_Display column
     • Sets up display formula ($RefColumn.VisibleColumn)
     • Manages the display logic

  **Example:**
  {
    "action": "add",
    "colId": "Manager",
    "type": "Ref:People",
    "visibleCol": "Email"  // ← Top-level, NOT in widgetOptions!
  }

  **Why top-level?** visibleCol is a column property (like type, formula), not a display widget option.
  Grist stores it separately in the _grist_Tables_column table's visibleCol field.

**All column types (visual styling):**
- fillColor: Background color as hex "#RRGGBB" (e.g., "#FF0000") - NO CSS names, NO shorthand
- textColor: Text color as hex "#RRGGBB"
- fontBold: Boolean (bold text)
- fontItalic: Boolean (italic text)
- fontUnderline: Boolean (underlined text)
- fontStrikethrough: Boolean (strikethrough text)
- alignment: "left" | "center" | "right"
- wrap: Boolean (text wrapping enabled)

**Validation notes:**
- Unknown options are rejected (schema uses .strict())
- Color values must be hex format (CSS color names not accepted)
- Currency codes validated against ISO 4217 list (165 codes)
- Column/table IDs cannot use Python keywords (for, class, if, def, etc.)

📖 See docs/VALIDATION_RULES.md for complete validation constraints.

Example operations:
  [
    {
      "action": "add",
      "colId": "Phone",
      "type": "Text",
      "label": "Phone Number"
    },
    {
      "action": "modify",
      "colId": "Status",
      "type": "Choice",
      "widgetOptions": {"choices": ["Active", "Inactive", "Pending"]}
    },
    {
      "action": "rename",
      "oldColId": "Email",
      "newColId": "EmailAddress"
    },
    {
      "action": "delete",
      "colId": "OldColumn"
    }
  ]

Returns (JSON format):
  {
    "success": true,
    "operations_completed": number,
    "summary": {
      "added": number,
      "modified": number,
      "deleted": number,
      "renamed": number
    },
    "details": [string, ...]
  }

Use when:
  - Adding new columns to tables
  - Modifying column properties (type, label, formula)
  - Removing obsolete columns
  - Renaming columns
  - Schema migrations requiring multiple changes

Don't use when:
  - Creating new tables (use grist_create_table)
  - Just need to read schema (use grist_get_tables)

Error Handling:
  - Returns error if column doesn't exist (for modify/delete/rename)
  - Returns error if column already exists (for add)
  - All operations rolled back if any fails (atomic)`,
    inputSchema: ManageColumnsSchema,
    annotations: WRITE_SAFE_ANNOTATIONS,
    handler: manageColumns
  }
] as const

/**
 * Document Management Tools (1 tool)
 * Document creation and forking
 */
export const DOCUMENT_TOOLS: ReadonlyArray<CategorizedToolDefinition> = [
  {
    category: 'documents',
    name: 'grist_create_document',
    title: 'Create Grist Document',
    description: `Create a new Grist document or fork from existing document.

Use this to create blank documents or copy existing ones with all structure and data. Forking is useful for templates or creating test environments.

Parameters:
  - name (string): Document name
  - workspaceId (string): Workspace ID from grist_list_workspaces
  - forkFromDocId (string, optional): Document to fork from. Creates copy with same structure and data
  - response_format ('json' | 'markdown'): Output format (default: 'markdown')

Returns (JSON format):
  {
    "success": true,
    "document_id": string,
    "document_name": string,
    "workspace_id": string,
    "url": string,
    "forked_from": string | null,
    "next_steps": [string, ...]
  }

Use when:
  - Creating new databases from scratch
  - Forking templates for new projects
  - Creating test/development copies
  - Setting up new workspaces

Don't use when:
  - Just need to add tables to existing document (use grist_create_table)
  - Want to move document between workspaces

Error Handling:
  - Returns 404 if workspace doesn't exist or inaccessible
  - Returns 404 if forkFromDocId doesn't exist
  - Returns permission error if insufficient workspace access`,
    inputSchema: CreateDocumentSchema,
    annotations: WRITE_SAFE_ANNOTATIONS,
    handler: createDocument
  }
] as const

// ============================================================================
// Complete Tool Registry
// ============================================================================

/**
 * All tools in a single flat array for easy iteration
 * Maintains registration order for consistent tool ordering
 */
export const ALL_TOOLS: ReadonlyArray<CategorizedToolDefinition> = [
  ...DISCOVERY_TOOLS,
  ...READING_TOOLS,
  ...RECORD_TOOLS,
  ...TABLE_TOOLS,
  ...COLUMN_TOOLS,
  ...DOCUMENT_TOOLS
] as const

/**
 * Tool registry organized by category
 * Useful for category-based filtering or documentation generation
 */
export const TOOLS_BY_CATEGORY: Readonly<
  Record<ToolCategory, ReadonlyArray<CategorizedToolDefinition>>
> = {
  discovery: DISCOVERY_TOOLS,
  reading: READING_TOOLS,
  records: RECORD_TOOLS,
  tables: TABLE_TOOLS,
  columns: COLUMN_TOOLS,
  documents: DOCUMENT_TOOLS
} as const

/**
 * Tool lookup by name for O(1) access
 * Useful for dynamic tool resolution
 */
export const TOOLS_BY_NAME: Readonly<Record<string, CategorizedToolDefinition>> = ALL_TOOLS.reduce(
  (acc, tool) => {
    acc[tool.name] = tool
    return acc
  },
  {} as Record<string, CategorizedToolDefinition>
)

// ============================================================================
// Utility Types for External Consumers
// ============================================================================

/**
 * Extract all tool names as a union type
 * Useful for type-safe tool name validation
 *
 * @example
 * const toolName: ToolName = 'grist_get_workspaces' // OK
 * const invalid: ToolName = 'invalid_tool' // Type error
 */
export type ToolName = (typeof ALL_TOOLS)[number]['name']

/**
 * Get the input type for a specific tool by name
 * Uses conditional types to infer the correct Zod schema type
 *
 * @example
 * type Params = ToolInputType<'grist_get_workspaces'>
 * // Infers: z.infer<typeof GetWorkspacesSchema>
 */
export type ToolInputType<T extends ToolName> = Extract<
  (typeof ALL_TOOLS)[number],
  { name: T }
> extends { inputSchema: infer S extends z.ZodTypeAny }
  ? z.infer<S>
  : never

/**
 * Get the handler function type for a specific tool
 */
export type ToolHandlerType<T extends ToolName> = Extract<
  (typeof ALL_TOOLS)[number],
  { name: T }
>['handler']
