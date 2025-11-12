#!/usr/bin/env node
/**
 * Grist MCP Server
 *
 * Production-ready Model Context Protocol server for Grist API integration.
 * Enables AI assistants to naturally interact with Grist documents, tables, and records.
 *
 * Features:
 * - 14 workflow-oriented tools covering all common Grist operations
 * - Dual format support (JSON and Markdown responses)
 * - Progressive detail levels (summary/detailed, names/columns/full_schema)
 * - Smart context management (25K character limits with intelligent truncation)
 * - Comprehensive error messages with actionable guidance
 * - Full type safety with Zod validation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { DEFAULT_BASE_URL } from './constants.js'
import { GristClient } from './services/grist-client.js'
import { ManageColumnsSchema, manageColumns } from './tools/columns.js'
// Import tool schemas and handlers
import {
  GetDocumentsSchema,
  GetTablesSchema,
  GetWorkspacesSchema,
  getDocuments,
  getTables,
  getWorkspaces
} from './tools/discovery.js'
import { CreateDocumentSchema, createDocument } from './tools/documents.js'
import { GetRecordsSchema, getRecords, QuerySQLSchema, querySql } from './tools/reading.js'
import {
  AddRecordsSchema,
  addRecords,
  DeleteRecordsSchema,
  deleteRecords,
  UpdateRecordsSchema,
  UpsertRecordsSchema,
  updateRecords,
  upsertRecords
} from './tools/records.js'
import {
  CreateTableSchema,
  createTable,
  DeleteTableSchema,
  deleteTable,
  RenameTableSchema,
  renameTable
} from './tools/tables.js'

// ============================================================================
// Main Server Initialization
// ============================================================================

async function main() {
  // Validate environment variables
  const apiKey = process.env.GRIST_API_KEY
  if (!apiKey) {
    console.error('ERROR: GRIST_API_KEY environment variable is required')
    console.error('Get your API key from: https://docs.getgrist.com/settings/keys')
    console.error('\nFor self-hosted Grist, also set GRIST_BASE_URL')
    process.exit(1)
  }

  const baseUrl = process.env.GRIST_BASE_URL || DEFAULT_BASE_URL

  // Create Grist API client
  const gristClient = new GristClient(baseUrl, apiKey)

  // Initialize MCP server
  const server = new McpServer({
    name: 'grist-mcp-server',
    version: '1.0.0'
  })

  // ============================================================================
  // Register Discovery & Navigation Tools (3 tools)
  // ============================================================================

  server.registerTool(
    'grist_get_workspaces',
    {
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
      inputSchema: GetWorkspacesSchema as any,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: any) => getWorkspaces(gristClient, params)
  )

  server.registerTool(
    'grist_get_documents',
    {
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
      inputSchema: GetDocumentsSchema as any,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: any) => getDocuments(gristClient, params)
  )

  server.registerTool(
    'grist_get_tables',
    {
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
      inputSchema: GetTablesSchema as any,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: any) => getTables(gristClient, params)
  )

  // ============================================================================
  // Register Data Reading Tools (2 tools)
  // ============================================================================

  server.registerTool(
    'grist_query_sql',
    {
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

4. Parameterized (safer):
   sql: "SELECT * FROM Contacts WHERE Region = $1"
   parameters: ["West"]
   → Prevents SQL injection

ERRORS:
- "SQL syntax error": Check query syntax → Verify table/column names with grist_get_tables
- "Table 'X' not found": Table doesn't exist → Use grist_get_tables to see available tables

SEE ALSO:
- grist_get_records: For simple single-table queries
- grist_get_tables: To see available tables/columns before querying`,
      inputSchema: QuerySQLSchema as any,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: any) => querySql(gristClient, params)
  )

  server.registerTool(
    'grist_get_records',
    {
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
      inputSchema: GetRecordsSchema as any,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: any) => getRecords(gristClient, params)
  )

  // ============================================================================
  // Register Record Operation Tools (4 tools)
  // ============================================================================

  server.registerTool(
    'grist_add_records',
    {
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
      inputSchema: AddRecordsSchema as any,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: any) => addRecords(gristClient, params)
  )

  server.registerTool(
    'grist_update_records',
    {
      title: 'Update Grist Records',
      description: `Modify existing records by row ID.

Use this when you have specific row IDs and want to update those exact records.

Parameters:
  - docId (string): Document ID
  - tableId (string): Table ID
  - rowIds (array): Array of row IDs to update (from grist_get_records). Max 500 per request
  - updates (object): Column values to set. Format: {"Column": value}
  - response_format ('json' | 'markdown'): Output format (default: 'markdown')

Example:
  rowIds: [1, 2, 3]
  updates: {"Status": "Complete", "CompletedDate": "2024-01-15"}

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
      inputSchema: UpdateRecordsSchema as any,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: any) => updateRecords(gristClient, params)
  )

  server.registerTool(
    'grist_upsert_records',
    {
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
      inputSchema: UpsertRecordsSchema as any,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: any) => upsertRecords(gristClient, params)
  )

  server.registerTool(
    'grist_delete_records',
    {
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
      inputSchema: DeleteRecordsSchema as any,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: any) => deleteRecords(gristClient, params)
  )

  // ============================================================================
  // Register Table Management Tools (3 tools)
  // ============================================================================

  server.registerTool(
    'grist_create_table',
    {
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
      inputSchema: CreateTableSchema as any,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: any) => createTable(gristClient, params)
  )

  server.registerTool(
    'grist_rename_table',
    {
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
      inputSchema: RenameTableSchema as any,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: any) => renameTable(gristClient, params)
  )

  server.registerTool(
    'grist_delete_table',
    {
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
      inputSchema: DeleteTableSchema as any,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: any) => deleteTable(gristClient, params)
  )

  // ============================================================================
  // Register Column Management Tool (1 tool)
  // ============================================================================

  server.registerTool(
    'grist_manage_columns',
    {
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
      inputSchema: ManageColumnsSchema as any,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: any) => manageColumns(gristClient, params)
  )

  // ============================================================================
  // Register Document Management Tool (1 tool)
  // ============================================================================

  server.registerTool(
    'grist_create_document',
    {
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
      inputSchema: CreateDocumentSchema as any,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: any) => createDocument(gristClient, params)
  )

  // ============================================================================
  // Connect Server to Transport
  // ============================================================================

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error('Grist MCP Server running on stdio')
  console.error(`Connected to: ${baseUrl}`)
  console.error('Ready to serve 14 Grist tools to AI assistants')
}

// Run the server
main().catch((error) => {
  console.error('Fatal server error:', error)
  process.exit(1)
})
