# Grist MCP Server - Implementation Guide

**Status:** Planning/Reference Document (Implementation Complete)

> **Note:** This is the original planning and architecture document. The implementation is complete.
> For usage, see [README.md](README.md). For validation, see [LIVE_VALIDATION_REPORT.md](LIVE_VALIDATION_REPORT.md).

---

## 📋 Table of Contents

### Part 1: Project Overview & Architecture
- [1.1 Project Overview](#11-project-overview)
- [1.2 Target Users & Use Cases](#12-target-users--use-cases)
- [1.3 Tool Architecture (15 Tools)](#13-tool-architecture-15-tools)
- [1.4 MCP Server Initialization](#14-mcp-server-initialization)
- [1.5 Type System Strategy](#15-type-system-strategy)
- [1.6 Authentication & Configuration](#16-authentication--configuration)

### Part 2: Response & Data Handling
- [2.1 Response Format System](#21-response-format-system)
- [2.2 Pagination Standard](#22-pagination-standard)
- [2.3 Character Limit Strategy](#23-character-limit-strategy)
- [2.4 Error Handling Philosophy](#24-error-handling-philosophy)

### Part 3: Shared Services & Utilities
- [3.1 GristClient Service](#31-gristclient-service)
- [3.2 Action Builder Patterns](#32-action-builder-patterns)
- [3.3 Formatter Service](#33-formatter-service)
- [3.4 Common Zod Schemas](#34-common-zod-schemas)

### Part 4: Tool Specifications
- [4.1 Discovery & Navigation Tools (4 tools)](#41-discovery--navigation-tools)
- [4.2 Data Reading Tools (2 tools)](#42-data-reading-tools)
- [4.3 Record Operation Tools (4 tools)](#43-record-operation-tools)
- [4.4 Table Management Tools (3 tools)](#44-table-management-tools)
- [4.5 Column Management Tool (1 tool)](#45-column-management-tool)
- [4.6 Document Management Tool (1 tool)](#46-document-management-tool)

### Part 5: Workflow Validation
- [5.1 Complete Workflow Mappings](#51-complete-workflow-mappings)
- [5.2 Tool Overlap Decision Trees](#52-tool-overlap-decision-trees)

### Part 6: Implementation Guide
- [6.1 Phase 1: Project Setup (30 min)](#61-phase-1-project-setup)
- [6.2 Phase 2: Core Infrastructure (2 hours)](#62-phase-2-core-infrastructure)
- [6.3 Phase 3: Tool Implementation (4-6 hours)](#63-phase-3-tool-implementation)
- [6.4 Phase 4: Server Integration (1 hour)](#64-phase-4-server-integration)
- [6.5 Phase 5: Build & Testing (1 hour)](#65-phase-5-build--testing)
- [6.6 Phase 6: Evaluation Questions (2 hours)](#66-phase-6-evaluation-questions)
- [6.7 Phase 7: Documentation (1 hour)](#67-phase-7-documentation)
- [6.8 Phase 8: Quality Review (1 hour)](#68-phase-8-quality-review)

### Part 7: Quality & Testing
- [7.1 Quality Standards](#71-quality-standards)
- [7.2 Testing Strategy](#72-testing-strategy)
- [7.3 Evaluation Questions](#73-evaluation-questions)
- [7.4 Success Criteria](#74-success-criteria)

### Part 8: MCP Alignment & Best Practices
- [8.1 MCP TypeScript SDK Alignment](#81-mcp-typescript-sdk-alignment)
- [8.2 What We Got Right](#82-what-we-got-right)
- [8.3 Clarifications Made](#83-clarifications-made)
- [8.4 Future Enhancements](#84-future-enhancements)

### Appendices
- [Appendix A: Complete Zod Schemas](#appendix-a-complete-zod-schemas)
- [Appendix B: API Interaction Examples](#appendix-b-api-interaction-examples)
- [Appendix C: Error Message Templates](#appendix-c-error-message-templates)

---

# Part 1: Project Overview & Architecture

## 1.1 Project Overview

### Purpose
Build a production-ready Model Context Protocol (MCP) server for Grist that enables AI assistants to naturally interact with Grist documents, tables, and records through conversational interfaces.

### Goals
1. **Workflow-Oriented Design**: Tools that enable complete workflows, not just API endpoint wrappers
2. **Context Efficiency**: Optimize for LLM context limits with detail_level parameters
3. **Type Safety**: Strict TypeScript with comprehensive Zod validation
4. **Developer Experience**: Clear error messages, comprehensive documentation
5. **Production Ready**: Robust error handling, retry logic, rate limiting awareness

### Key Features
- ✅ 15 workflow-oriented tools covering all common Grist operations
- ✅ Dual format support (JSON and Markdown responses)
- ✅ Progressive detail levels (summary/detailed, names/columns/full_schema)
- ✅ Smart context management (25K character limits with intelligent truncation)
- ✅ Comprehensive error messages with actionable guidance
- ✅ Full type safety (strict TypeScript, comprehensive Zod validation)
- ✅ Support for both Grist Cloud and self-hosted instances

---

## 1.2 Target Users & Use Cases

### Primary Users
- Data analysts using AI assistants to query and analyze Grist data
- Teams using AI to automate Grist workflows (data syncing, reporting)
- Developers building AI-powered applications on top of Grist
- No-code users leveraging AI to create and manage Grist databases

### Core Use Cases

**1. Database Creation & Schema Design**
- "Create a CRM database for my sales team"
- "Add analytics columns to track customer metrics"
- "Restructure this table to normalize the data"

**2. Data Synchronization & Import**
- "Import this CSV into my Contacts table"
- "Sync external API data with this table daily"
- "Update records that exist, add new ones"

**3. Data Analysis & Querying**
- "Find all high-value customers from Q4 2024"
- "Show me sales trends across regions"
- "Calculate average deal size by industry"

**4. Document Discovery & Navigation**
- "Find my team's project tracking database"
- "Show me all documents in the Sales workspace"
- "What tables exist in this document?"

**5. Bulk Operations & Automation**
- "Archive all completed projects"
- "Update status for all overdue tasks"
- "Delete test records from last week"

---

## 1.3 Tool Architecture (15 Tools)

### Design Principles

#### 1. Build for Workflows, Not API Endpoints
✅ **DO**: `grist_manage_columns` (handles add/modify/delete/rename in one tool)
❌ **DON'T**: `add_column`, `modify_column`, `delete_column` (bloat, confusion)

#### 2. Optimize for Limited Context
✅ Use `detail_level` parameters: "summary" | "detailed" | "names" | "columns" | "full_schema"
✅ CHARACTER_LIMIT of 25,000 with truncation guidance
✅ Pagination with clear metadata

#### 3. Provide Actionable Error Messages
✅ "Authentication failed. Check that GRIST_API_KEY is valid"
✅ "Permission denied. API key lacks access. Try listing accessible documents first"
❌ "Error 403"

#### 4. Clear Separation of Concerns
✅ `grist_get_document` → document metadata (name, workspace, permissions)
✅ `grist_get_tables` → data structure (tables, columns, schema)
❌ Don't mix these - different workflows, different context needs

### Complete Tool List

#### **Discovery & Navigation (4 tools)**

**1. grist_list_workspaces**
- **Purpose:** Discover where documents can be created
- **Parameters:** detail_level (summary/detailed), response_format, pagination
- **Returns:** Workspace ID, name, org name, doc count (summary) OR + permissions, timestamps (detailed)
- **Annotations:** readOnlyHint=true, openWorldHint=true

**2. grist_list_documents**
- **Purpose:** Find and browse documents
- **Parameters:** workspaceId filter (optional), detail_level, pagination, response_format
- **Returns:** Doc ID, name, workspace, access level
- **Annotations:** readOnlyHint=true, openWorldHint=true

**3. grist_get_document**
- **Purpose:** Get document container metadata
- **Parameters:** docId, response_format
- **Returns:** Document name, workspace info, permissions, URLs, timestamps, table count
- **Does NOT return:** Table names or schema (use grist_get_tables)
- **Annotations:** readOnlyHint=true, openWorldHint=true

**4. grist_get_tables**
- **Purpose:** Understand data structure
- **Parameters:** docId, detail_level (names|columns|full_schema), optional tableId, response_format
- **Returns:** Table information based on detail_level
- **Does NOT return:** Document metadata (use grist_get_document)
- **Annotations:** readOnlyHint=true, openWorldHint=true

#### **Data Reading (2 tools)**

**5. grist_query_sql**
- **Purpose:** Complex analytics with SQL
- **Parameters:** docId, sql, parameters (optional), pagination, response_format
- **Returns:** Query results with pagination
- **Use when:** JOINs, aggregations, complex filtering
- **Annotations:** readOnlyHint=true, openWorldHint=true

**6. grist_get_records**
- **Purpose:** Simple record fetching without SQL
- **Parameters:** docId, tableId, filters (optional), column selection, pagination, response_format
- **Returns:** Records matching filters
- **Use when:** Basic queries, no SQL knowledge needed
- **Annotations:** readOnlyHint=true, openWorldHint=true

#### **Record Operations (4 tools)**

**7. grist_add_records**
- **Purpose:** Insert new records
- **Uses:** BulkAddRecord action via /apply endpoint
- **Parameters:** docId, tableId, records (array of objects, max 500)
- **Returns:** Added record IDs
- **Annotations:** destructiveHint=false, idempotentHint=false, openWorldHint=true

**8. grist_update_records**
- **Purpose:** Modify existing records
- **Uses:** BulkUpdateRecord action via /apply endpoint
- **Parameters:** docId, tableId, rowIds (max 500), updates
- **Returns:** Updated count
- **Annotations:** destructiveHint=false, idempotentHint=true, openWorldHint=true

**9. grist_upsert_records** ⭐ CRITICAL FOR SYNC WORKFLOWS
- **Purpose:** Add or update if exists (sync workflows)
- **Uses:** PUT /records endpoint with require/fields format
- **Parameters:** docId, tableId, records with unique identifiers, onMany, add, update flags
- **Returns:** Added/updated breakdown
- **Why critical:** Essential for data synchronization (CSV imports, API syncs)
- **Annotations:** destructiveHint=false, idempotentHint=true, openWorldHint=true

**10. grist_delete_records**
- **Purpose:** Remove records
- **Uses:** BulkRemoveRecord action via /apply endpoint
- **Parameters:** docId, tableId, rowIds (max 500)
- **Returns:** Deleted count
- **Annotations:** destructiveHint=true, idempotentHint=true, openWorldHint=true

#### **Table Management (3 tools)**

**11. grist_create_table**
- **Purpose:** Create table with initial columns
- **Uses:** AddTable action via /apply endpoint
- **Parameters:** docId, tableName, columns (array with type, label, formula)
- **Returns:** New table ID
- **Annotations:** destructiveHint=false, idempotentHint=false, openWorldHint=true

**12. grist_rename_table**
- **Purpose:** Rename table
- **Uses:** RenameTable action via /apply endpoint
- **Parameters:** docId, tableId, newTableId
- **Returns:** Success confirmation
- **Annotations:** destructiveHint=false, idempotentHint=true, openWorldHint=true

**13. grist_delete_table**
- **Purpose:** Remove table (WARNING: data loss)
- **Uses:** RemoveTable action via /apply endpoint
- **Parameters:** docId, tableId
- **Returns:** Success confirmation
- **Annotations:** destructiveHint=true, idempotentHint=true, openWorldHint=true

#### **Column Management (1 tool)**

**14. grist_manage_columns** ⭐ KEY WORKFLOW TOOL
- **Purpose:** Complete column lifecycle management (add/modify/delete/rename)
- **Uses:** Multiple actions via /apply endpoint (atomic execution)
- **Parameters:** docId, tableId, operations array (max 50 operations)
- **Operations:**
  - action="add": Create new column (colId, type, formula, label, widgetOptions)
  - action="modify": Change column properties
  - action="delete": Remove column
  - action="rename": Change column ID
- **Why consolidated:** Most schema changes involve multiple columns (context-efficient, atomic)
- **Annotations:** destructiveHint=false (for add/modify), idempotentHint=false, openWorldHint=true

#### **Document Management (1 tool)**

**15. grist_create_document**
- **Purpose:** Create or fork documents
- **Uses:** POST /api/workspaces/{workspaceId}/docs
- **Parameters:** name, workspaceId, optional forkFromDocId
- **Consolidates:** Document creation and forking (forking IS creation with template)
- **Returns:** New document ID and URL
- **Annotations:** destructiveHint=false, idempotentHint=false, openWorldHint=true

### Tools We Decided NOT to Include

❌ **Individual column tools** (add_column, modify_column, etc.)
- Rationale: grist_manage_columns handles all cases, reduces bloat, improves atomicity

❌ **grist_execute_actions** (raw UserActions)
- Rationale: After analysis, focused tools cover all common workflows
- Alternative: Can add later if advanced users need it

❌ **grist_list_organizations**
- Rationale: Workspaces are the actionable level, org info included in workspace listing

❌ **grist_fork_document** (separate tool)
- Rationale: Consolidated into create_document via forkFromDocId parameter

---

## 1.4 MCP Server Initialization

### Server Setup (Official TypeScript SDK Pattern)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Initialize MCP server
const server = new McpServer({
    name: 'grist-mcp-server',
    version: '1.0.0'
});

// Register all 15 tools here...
// (See Part 4 for complete tool specifications)

// Set up stdio transport (for Claude Desktop)
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Transport Configuration

**Primary:** stdio transport (for Claude Desktop integration)

**Why stdio:**
- Standard input/output communication
- Works seamlessly with Claude Desktop
- No HTTP server needed
- Simple process-based communication

**Optional Enhancement (Future v1.1):**
```typescript
// Notification debouncing for performance optimization
const server = new McpServer(
  {
    name: 'grist-mcp-server',
    version: '1.0.0'
  },
  {
    debouncedNotificationMethods: [
      'notifications/tools/list_changed'
    ]
  }
);
```

### Tool Registration Pattern

```typescript
server.registerTool(
    'grist_tool_name',
    {
        title: 'Human-Readable Tool Title',
        description: 'Comprehensive multi-paragraph description...',
        inputSchema: ToolZodSchema,  // Zod schema for validation
        outputSchema: { result: z.object({...}) },  // Optional output schema
        annotations: {
            readOnlyHint: true,           // For read-only operations
            destructiveHint: false,       // For non-destructive operations
            idempotentHint: true,         // If repeated calls have same effect
            openWorldHint: true           // Always true (external Grist instance)
        }
    },
    async (params) => {
        try {
            // 1. Validate params (automatic via Zod)
            // 2. Call Grist API via GristClient
            // 3. Format response
            return formatToolResponse(result, params.response_format);
        } catch (error) {
            // 4. Return actionable error
            return {
                content: [{
                    type: 'text',
                    text: 'Actionable error message with next steps...'
                }],
                isError: true  // Enables programmatic error detection
            };
        }
    }
);
```

---

## 1.5 Type System Strategy

### Source: Import from grist-core Codebase

**Location:** `/Volumes/george/Developer/grist-core/app/common/`

**Key Files:**
- `DocActions.ts` - UserAction types (BulkAddRecord, BulkUpdateRecord, etc.)
- `UserAPI.ts` - API request/response types
- `GristData.ts` - CellValue, ColValues, BulkColValues
- `ActiveDocAPI.ts` - Document operation types

### Approach

1. **Import relevant interfaces and types** from grist-core
2. **Adapt for MCP server use** (simplify where needed)
3. **Maintain compatibility** with Grist API expectations
4. **Add MCP-specific types** (ResponseFormat, DetailLevel, etc.)

### MCP-Specific Type Definitions

```typescript
// src/types/mcp.ts
export type ResponseFormat = 'json' | 'markdown';

export type DetailLevelWorkspace = 'summary' | 'detailed';
export type DetailLevelTable = 'names' | 'columns' | 'full_schema';

export interface PaginationParams {
    offset?: number;  // Default: 0
    limit?: number;   // Default: 100, Max: 1000
}

export interface PaginationMetadata {
    total: number;
    offset: number;
    limit: number;
    has_more: boolean;
    next_offset: number | null;
}

export interface MCPToolResponse {
    content: Array<{
        type: 'text';
        text: string;  // Markdown or JSON string based on response_format
    }>;
    structuredContent: any;  // Always include - machine-readable data
    isError?: boolean;       // True for error responses
}

export interface TruncationInfo {
    truncated: boolean;
    items_returned: number;
    items_requested: number;
    truncation_reason: string;
    suggestions: string[];
}
```

---

## 1.6 Authentication & Configuration

### Authentication Strategy

**Priority Order:**
1. `GRIST_API_KEY` environment variable (primary)
2. Error with clear instructions if missing

**Implementation:**
```typescript
// src/index.ts - Startup validation
const apiKey = process.env.GRIST_API_KEY;
if (!apiKey) {
    console.error("ERROR: GRIST_API_KEY environment variable is required");
    console.error("Get your API key from: https://docs.getgrist.com/settings/keys");
    process.exit(1);
}
```

**Usage:**
- Header: `Authorization: Bearer ${apiKey}`
- Include in all API requests via GristClient service

### Instance Configuration

**Base URL:**
```typescript
const baseUrl = process.env.GRIST_BASE_URL || "https://docs.getgrist.com";
```

**Supports:**
- ✅ Grist Cloud (docs.getgrist.com) - default
- ✅ Self-hosted instances - set GRIST_BASE_URL environment variable

**Example Claude Desktop Configuration:**
```json
{
  "mcpServers": {
    "grist": {
      "command": "node",
      "args": ["/path/to/grist-mcp-server/dist/index.js"],
      "env": {
        "GRIST_API_KEY": "your_api_key_here",
        "GRIST_BASE_URL": "https://docs.getgrist.com"
      }
    }
  }
}
```

---

# Part 2: Response & Data Handling

## 2.1 Response Format System

### MCP Response Structure (Critical)

**All tools return BOTH text content AND structured data:**

```typescript
// src/services/formatter.ts
export function formatToolResponse(
  data: any,
  format: 'json' | 'markdown'
): MCPToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: format === 'markdown'
          ? formatAsMarkdown(data)
          : JSON.stringify(data, null, 2)
      }
    ],
    structuredContent: data  // ALWAYS include - enables programmatic access
  };
}
```

### Key Points

- **`content[0].text`**: Human-readable output
  - Controlled by `response_format` parameter
  - Either Markdown (human-friendly) OR JSON string (structured)

- **`structuredContent`**: Machine-readable data object
  - ALWAYS included regardless of format
  - Enables programmatic access by clients
  - Actual data object, not stringified

- **Both returned simultaneously** for maximum flexibility

### Two Dimensions of Configurability

**1. Format (all tools):**
- `response_format`: "markdown" | "json"
- Default: "markdown" (human-readable)
- JSON: For programmatic processing

**2. Detail Level (applicable tools):**
- **Workspaces/Documents:** "summary" | "detailed"
  - summary: Name, ID, doc count only
  - detailed: + permissions, timestamps, full metadata

- **Tables:** "names" | "columns" | "full_schema"
  - names: Table names only
  - columns: + column names
  - full_schema: + types, formulas, widgetOptions

- **Records:** Column selection for field filtering
  - Specify exact columns to return
  - Reduces context usage

### Response Format Examples

**Markdown Format:**
```markdown
# Workspaces

Found 3 workspaces

## Sales Team (ID: ws_123)
- Organization: Acme Corp
- Documents: 12
- Access: Owner

## Marketing (ID: ws_456)
- Organization: Acme Corp
- Documents: 8
- Access: Editor
```

**JSON Format:**
```json
{
  "total": 3,
  "workspaces": [
    {
      "id": "ws_123",
      "name": "Sales Team",
      "org": "Acme Corp",
      "doc_count": 12,
      "access": "Owner"
    },
    {
      "id": "ws_456",
      "name": "Marketing",
      "org": "Acme Corp",
      "doc_count": 8,
      "access": "Editor"
    }
  ]
}
```

**Complete Response Structure:**
```typescript
{
  content: [
    {
      type: 'text',
      text: '# Workspaces\n\nFound 3 workspaces...'  // Markdown string
    }
  ],
  structuredContent: {
    total: 3,
    workspaces: [...]  // Actual data object
  }
}
```

### Benefits

- **Agents choose appropriate detail** for their context budget
- **Reduces unnecessary data transfer**
- **Clearer mental model** of what each tool returns
- **Maximum flexibility** - human OR machine readable

---

## 2.2 Pagination Standard

All tools that return lists use consistent offset/limit pagination.

### Parameters

Every paginated tool accepts:

```typescript
{
  offset?: number;      // Starting position (0-indexed), default: 0
  limit?: number;       // Number of items to return, default: 100, max: 1000
}
```

**Rationale for offset/limit vs cursor:**
- Simpler for agents to understand and use
- Allows jumping to specific positions
- Works well with Grist's SQL-based API
- Consistent with common REST API patterns

### Response Metadata

Every paginated response includes:

```typescript
{
  total: number;           // Total items available
  offset: number;          // Current offset (echoed from request)
  limit: number;           // Items per page (echoed from request)
  has_more: boolean;       // True if more items exist beyond current page
  next_offset: number | null;  // Suggested offset for next page (null if no more)
  items: T[];              // Actual data (workspaces, documents, records, etc.)
}
```

### Format Examples

**Markdown Format:**
```markdown
Showing 100-199 of 350 total items

To see more results, use: offset=200, limit=100
```

**JSON Format:**
```json
{
  "total": 350,
  "offset": 100,
  "limit": 100,
  "has_more": true,
  "next_offset": 200,
  "workspaces": [...]
}
```

### Pagination with CHARACTER_LIMIT

When response hits CHARACTER_LIMIT before completing the page:

```typescript
{
  total: 350,
  offset: 100,
  limit: 100,                 // Requested
  has_more: true,
  next_offset: 150,            // Adjusted based on what fit
  truncated: true,             // CHARACTER_LIMIT hit
  items_returned: 50,          // Only 50 of 100 requested items fit
  truncation_reason: "Character limit exceeded. Use offset=150 to continue.",
  suggestions: [
    "Use offset=150 to continue from where you left off",
    "Reduce detail_level from 'detailed' to 'summary'",
    "Select specific columns instead of all columns",
    "Add filters to reduce result set"
  ],
  items: [...]                 // 50 items that fit
}
```

### Tool-Specific Pagination

**Paginated Tools:**
1. `grist_list_workspaces` - Pagination on workspaces
2. `grist_list_documents` - Pagination on documents
3. `grist_get_tables` - No pagination needed (typically <100 tables per doc)
4. `grist_query_sql` - Pagination on query results
5. `grist_get_records` - Pagination on records

**Non-Paginated Tools:**
- All tools that operate on specific items (get_document, create_*, update_*, delete_*)
- Tools that return fixed-size results

### Example Usage Pattern

**Agent discovers pagination is needed:**
```typescript
// First request
grist_list_documents({limit: 100})

// Response indicates more exist
{
  total: 250,
  has_more: true,
  next_offset: 100,
  documents: [...]
}

// Agent continues
grist_list_documents({offset: 100, limit: 100})

// Response
{
  total: 250,
  has_more: true,
  next_offset: 200,
  documents: [...]
}
```

---

## 2.3 Character Limit Strategy

### Constants

```typescript
export const CHARACTER_LIMIT = 25000;  // ~6,000 tokens at 4 chars/token
export const TRUNCATION_WARNING_THRESHOLD = 20000;  // Warn when approaching limit
```

### Truncation Rules

**1. Never Truncate Mid-Record**

```typescript
// BAD - breaks JSON structure
{
  "records": [
    {"Name": "Alice", "Email": "alice@..."},
    {"Name": "Bob", "Emai...  // TRUNCATED MID-RECORD - INVALID JSON
  ]
}

// GOOD - complete records only
{
  "records": [
    {"Name": "Alice", "Email": "alice@example.com"},
    {"Name": "Bob", "Email": "bob@example.com"}
  ],
  "truncated": true,
  "items_returned": 2,
  "items_requested": 10
}
```

**2. Truncation Priority Order**

When response exceeds CHARACTER_LIMIT, truncate in this order:

1. **Records/Items** - Return fewer complete items
2. **Columns** - If detail_level="full_schema", switch to "columns"
3. **Descriptions** - Shorten field descriptions
4. **Metadata** - Keep essential, drop nice-to-have fields

**Never truncate:**
- IDs (always include item identifiers)
- Error messages
- Pagination metadata
- Truncation guidance

### Truncation Response Format

**JSON Format:**
```json
{
  "total": 1000,
  "offset": 0,
  "limit": 100,
  "items_returned": 45,
  "has_more": true,
  "next_offset": 45,
  "truncated": true,
  "truncation_reason": "Character limit exceeded (25,000 characters)",
  "suggestions": [
    "Use offset=45 to continue from where truncation occurred",
    "Reduce detail_level from 'detailed' to 'summary'",
    "Select specific columns instead of all columns",
    "Add filters to reduce result set"
  ],
  "records": [
    // 45 complete records that fit within limit
  ]
}
```

**Markdown Format:**
```markdown
# Query Results

Found 1000 records (showing first 45)

## Records

1. **Alice Johnson** (alice@example.com)
   - Company: Acme Corp
   - Deal Value: $50,000

...

45. **Sam Wilson** (sam@example.com)
    - Company: Beta LLC
    - Deal Value: $25,000

---

⚠️ **Response Truncated** (character limit: 25,000)

**Retrieved:** 45 of 100 requested records
**Total Available:** 1000 records

**To continue:**
- Use `offset=45, limit=100` to get next batch
- Or reduce detail: Use `detail_level="summary"`
- Or filter results: Add `filters={Status: "Active"}`
```

### Implementation Pattern

```typescript
function formatResponse(data: any[], responseFormat: "json" | "markdown"): string {
  let result: string;
  let itemsIncluded = 0;

  if (responseFormat === "json") {
    result = formatAsJSON(data);
  } else {
    result = formatAsMarkdown(data);
  }

  // Check character limit
  if (result.length > CHARACTER_LIMIT) {
    // Binary search to find how many items fit
    itemsIncluded = findMaxItemsThatFit(data, responseFormat, CHARACTER_LIMIT);

    // Rebuild with truncated data
    const truncatedData = data.slice(0, itemsIncluded);
    result = formatWithTruncation(truncatedData, {
      total: data.length,
      itemsIncluded,
      truncated: true,
      suggestions: generateTruncationSuggestions(data, itemsIncluded)
    });
  }

  return result;
}

function generateTruncationSuggestions(
  data: any[],
  itemsIncluded: number
): string[] {
  const suggestions = [
    `Use offset=${itemsIncluded} to continue from where truncation occurred`
  ];

  // Context-specific suggestions
  if (currentDetailLevel === "detailed") {
    suggestions.push("Reduce detail_level from 'detailed' to 'summary'");
  }

  if (allColumnsSelected) {
    suggestions.push("Select specific columns instead of all columns");
  }

  if (!hasFilters) {
    suggestions.push("Add filters to reduce result set");
  }

  return suggestions;
}
```

### Progressive Loading Strategy

Agents should use this pattern for large datasets:

```typescript
// Step 1: Get count with minimal detail
grist_get_records({
  docId,
  tableId,
  columns: ["id"],
  limit: 1
})
// Response: {total: 10000, ...}

// Step 2: Agent decides approach based on size
if (total < 100) {
  // Small - get all at once
  grist_get_records({limit: 100})
} else if (total < 1000) {
  // Medium - paginate through all
  // Multiple requests with offset
} else {
  // Large - use filters or SQL
  grist_query_sql({sql: "SELECT ... WHERE ..."})
}
```

---

## 2.4 Error Handling Philosophy

### Principles

1. **Errors are learning opportunities** - guide agent toward correct usage
2. **Be specific** - include IDs, URLs, exact parameters that failed
3. **Suggest next steps** - what should agent try instead?
4. **No internal leakage** - don't expose stack traces or internal errors

### Error Response Format

**All error responses include `isError: true` flag:**

```typescript
try {
    // Operation
    const result = await gristClient.get(...);
    return formatToolResponse(result, responseFormat);
} catch (error) {
    return {
        content: [
            {
                type: 'text',
                text: 'Document not found. Verify docId is correct. Try grist_list_documents first.'
            }
        ],
        isError: true  // Enables clients to detect errors programmatically
    };
}
```

### Example Error Messages

```typescript
// BAD
"Error 404"

// GOOD
"Document not found. Verify docId='abc123' is correct. Try listing accessible documents with grist_list_documents first."

// BAD
"Invalid request"

// GOOD
"Column 'Status' does not exist in table 'Tasks'. Current columns: ['Name', 'Priority', 'Assignee']. Use grist_get_tables to see full schema."
```

### Status Code Mapping

Translate HTTP status codes to actionable messages:

**401 Unauthorized:**
```
Authentication failed. Check that GRIST_API_KEY is valid and not expired.
Get your API key from: https://docs.getgrist.com/settings/keys
```

**403 Forbidden:**
```
Permission denied for [operation] on [resource]. API key lacks required access.
Try using grist_list_documents to see which documents you can access.
```

**404 Not Found:**
```
[Resource type] not found. Verify [resourceType]='[resourceId]' is correct.
Try [suggested_tool] to see available [resources].

Examples:
- Document not found. Verify docId='abc123' is correct. Try grist_list_documents to see accessible documents.
- Table not found. Verify tableId='Contacts' exists in document. Use grist_get_tables to see all tables.
```

**429 Rate Limit:**
```
Rate limit exceeded. The Grist server is limiting your requests.
Wait 60 seconds before retrying this operation.
```

**5xx Server Error:**
```
Grist server error ([status code]). This is a temporary server issue.
Try again in a few moments. If problem persists, check Grist status page.
```

### GristClient Error Handling

```typescript
// src/services/grist-client.ts
private handleError(error: unknown, method: string, path: string): Error {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const message = error.response?.data?.error?.message || error.message;

    switch (status) {
      case 401:
        return new Error(
          `Authentication failed. Check that GRIST_API_KEY is valid and not expired. ` +
          `Get your API key from: ${this.baseUrl}/settings/keys`
        );

      case 403:
        return new Error(
          `Permission denied for ${method} ${path}. API key lacks required access. ` +
          `Try using grist_list_documents to see which documents you can access.`
        );

      case 404:
        const resourceMatch = path.match(/\/(docs|workspaces|tables)\/([^/]+)/);
        const resourceType = resourceMatch?.[1] || 'resource';
        const resourceId = resourceMatch?.[2] || 'unknown';
        return new Error(
          `${resourceType} not found. Verify ${resourceType}Id='${resourceId}' is correct. ` +
          `Try grist_list_${resourceType} to see available ${resourceType}.`
        );

      case 429:
        return new Error(
          `Rate limit exceeded. Wait 60 seconds before retrying.`
        );

      case 500:
      case 502:
      case 503:
      case 504:
        return new Error(
          `Grist server error (${status}). Try again in a few moments. ` +
          `If problem persists, check https://status.getgrist.com`
        );

      default:
        return new Error(
          `Request failed: ${message}. ${method} ${path} returned status ${status}.`
        );
    }
  }

  // Non-Axios errors
  return new Error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
}
```

---

# Part 3: Shared Services & Utilities

## 3.1 GristClient Service

HTTP client for all Grist API interactions with comprehensive error handling.

### Complete Implementation

```typescript
// src/services/grist-client.ts
import axios, { AxiosInstance, AxiosError } from 'axios';

export class GristClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;

    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });
  }

  /**
   * GET request with error handling
   */
  async get<T>(path: string, params?: Record<string, any>): Promise<T> {
    try {
      const response = await this.client.get<T>(path, { params });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'GET', path);
    }
  }

  /**
   * POST request with error handling
   */
  async post<T>(path: string, data: any): Promise<T> {
    try {
      const response = await this.client.post<T>(path, data);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'POST', path);
    }
  }

  /**
   * PUT request with error handling
   */
  async put<T>(path: string, data: any): Promise<T> {
    try {
      const response = await this.client.put<T>(path, data);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'PUT', path);
    }
  }

  /**
   * DELETE request with error handling
   */
  async delete<T>(path: string): Promise<T> {
    try {
      const response = await this.client.delete<T>(path);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'DELETE', path);
    }
  }

  /**
   * Transform errors into agent-friendly messages
   */
  private handleError(error: unknown, method: string, path: string): Error {
    // See Section 2.4 for complete error handling implementation
    // ...
  }
}
```

---

## 3.2 Action Builder Patterns

Abstract UserAction construction for type safety and consistency.

### Purpose

Instead of manually constructing Grist UserAction arrays, use helper functions that:
- Provide type safety (TypeScript validates structure)
- Ensure consistent formatting
- Are easier to test
- Hide internal Grist action format details

### Implementation

```typescript
// src/services/action-builder.ts
import { UserAction, BulkColValues } from '@gristlabs/grist-core/app/common/DocActions';

/**
 * Build BulkAddRecord action
 * Converts array of record objects to Grist's columnar format
 */
export function buildBulkAddRecordAction(
  tableId: string,
  records: Record<string, any>[]
): UserAction {
  const rowIds = records.map((_, i) => null); // Grist assigns IDs

  // Convert row-oriented to column-oriented format
  const colValues: BulkColValues = {};
  if (records.length > 0) {
    Object.keys(records[0]).forEach(colId => {
      colValues[colId] = records.map(r => r[colId]);
    });
  }

  return ['BulkAddRecord', tableId, rowIds, colValues];
}

/**
 * Build BulkUpdateRecord action
 */
export function buildBulkUpdateRecordAction(
  tableId: string,
  rowIds: number[],
  updates: Record<string, any>
): UserAction {
  // Convert updates to column format
  const colValues: BulkColValues = {};
  Object.keys(updates).forEach(colId => {
    colValues[colId] = rowIds.map(() => updates[colId]);
  });

  return ['BulkUpdateRecord', tableId, rowIds, colValues];
}

/**
 * Build BulkRemoveRecord action
 */
export function buildBulkRemoveRecordAction(
  tableId: string,
  rowIds: number[]
): UserAction {
  return ['BulkRemoveRecord', tableId, rowIds];
}

/**
 * Build AddColumn action
 */
export function buildAddColumnAction(
  tableId: string,
  colId: string,
  colInfo: {
    type: string;
    label?: string;
    isFormula?: boolean;
    formula?: string;
    widgetOptions?: any;
  }
): UserAction {
  return ['AddColumn', tableId, colId, colInfo];
}

/**
 * Build ModifyColumn action
 */
export function buildModifyColumnAction(
  tableId: string,
  colId: string,
  updates: Partial<{
    type: string;
    label: string;
    isFormula: boolean;
    formula: string;
    widgetOptions: any;
  }>
): UserAction {
  return ['ModifyColumn', tableId, colId, updates];
}

/**
 * Build RemoveColumn action
 */
export function buildRemoveColumnAction(
  tableId: string,
  colId: string
): UserAction {
  return ['RemoveColumn', tableId, colId];
}

/**
 * Build RenameColumn action
 */
export function buildRenameColumnAction(
  tableId: string,
  oldColId: string,
  newColId: string
): UserAction {
  return ['RenameColumn', tableId, oldColId, newColId];
}

/**
 * Build AddTable action
 */
export function buildAddTableAction(
  tableName: string,
  columns: Array<{
    colId: string;
    type: string;
    label?: string;
    isFormula?: boolean;
    formula?: string;
    widgetOptions?: any;
  }>
): UserAction {
  return ['AddTable', tableName, columns];
}

/**
 * Build RenameTable action
 */
export function buildRenameTableAction(
  tableId: string,
  newTableId: string
): UserAction {
  return ['RenameTable', tableId, newTableId];
}

/**
 * Build RemoveTable action
 */
export function buildRemoveTableAction(
  tableId: string
): UserAction {
  return ['RemoveTable', tableId];
}
```

### Example Usage

```typescript
// Instead of this:
const action = ['BulkAddRecord', tableId, rowIds, {
  Name: ['Alice', 'Bob'],
  Email: ['a@example.com', 'b@example.com']
}];

// Use this:
const action = buildBulkAddRecordAction(tableId, [
  { Name: 'Alice', Email: 'a@example.com' },
  { Name: 'Bob', Email: 'b@example.com' }
]);
```

---

## 3.3 Formatter Service

Handles response formatting with both human-readable and machine-readable outputs.

### Implementation

```typescript
// src/services/formatter.ts
import { MCPToolResponse, TruncationInfo } from '../types/mcp';
import { CHARACTER_LIMIT } from '../constants';

/**
 * Format tool response with both text and structured content
 * CRITICAL: Always include BOTH content and structuredContent
 */
export function formatToolResponse(
  data: any,
  format: 'json' | 'markdown'
): MCPToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: format === 'markdown'
          ? formatAsMarkdown(data)
          : JSON.stringify(data, null, 2)
      }
    ],
    structuredContent: data  // ALWAYS include - enables programmatic access
  };
}

/**
 * Format data as Markdown string
 */
export function formatAsMarkdown(data: any): string {
  // Implementation depends on data structure
  // Examples:

  if (Array.isArray(data)) {
    return formatArrayAsMarkdown(data);
  }

  if (typeof data === 'object' && data !== null) {
    return formatObjectAsMarkdown(data);
  }

  return String(data);
}

/**
 * Format array as Markdown list
 */
function formatArrayAsMarkdown(items: any[]): string {
  // Custom formatting based on item structure
  // See Appendix B for complete examples
  return items.map((item, i) => `${i + 1}. ${formatItemAsMarkdown(item)}`).join('\n');
}

/**
 * Format object as Markdown sections
 */
function formatObjectAsMarkdown(obj: any): string {
  // Custom formatting based on object structure
  // See Appendix B for complete examples
  return Object.entries(obj)
    .map(([key, value]) => `**${key}:** ${value}`)
    .join('\n');
}

/**
 * Check if response exceeds character limit and truncate if needed
 */
export function truncateIfNeeded(
  data: any[],
  format: 'json' | 'markdown'
): { text: string; truncationInfo?: TruncationInfo } {
  let result = format === 'json'
    ? JSON.stringify(data, null, 2)
    : formatAsMarkdown(data);

  if (result.length <= CHARACTER_LIMIT) {
    return { text: result };
  }

  // Binary search to find max items that fit
  const itemsIncluded = findMaxItemsThatFit(data, format, CHARACTER_LIMIT);
  const truncatedData = data.slice(0, itemsIncluded);

  result = format === 'json'
    ? JSON.stringify(truncatedData, null, 2)
    : formatAsMarkdown(truncatedData);

  return {
    text: result,
    truncationInfo: {
      truncated: true,
      items_returned: itemsIncluded,
      items_requested: data.length,
      truncation_reason: `Character limit exceeded (${CHARACTER_LIMIT} characters)`,
      suggestions: generateTruncationSuggestions(data, itemsIncluded)
    }
  };
}

/**
 * Binary search to find maximum items that fit within character limit
 */
function findMaxItemsThatFit(
  data: any[],
  format: 'json' | 'markdown',
  limit: number
): number {
  let left = 1;
  let right = data.length;
  let best = 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const subset = data.slice(0, mid);
    const text = format === 'json'
      ? JSON.stringify(subset, null, 2)
      : formatAsMarkdown(subset);

    if (text.length <= limit) {
      best = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return best;
}

/**
 * Generate context-specific truncation suggestions
 */
function generateTruncationSuggestions(
  data: any[],
  itemsIncluded: number
): string[] {
  const suggestions = [
    `Use offset=${itemsIncluded} to continue from where truncation occurred`
  ];

  // Add context-specific suggestions based on data structure
  // (detail level, column selection, filters, etc.)

  return suggestions;
}
```

---

## 3.4 Common Zod Schemas

Reusable Zod schemas for consistent validation across all tools.

### Implementation

```typescript
// src/types/common-schemas.ts
import { z } from "zod";

// Response format enum
export const ResponseFormatSchema = z.enum(["json", "markdown"])
  .default("markdown")
  .describe("Output format: 'json' for structured data, 'markdown' for human-readable");

// Detail level enums
export const DetailLevelWorkspaceSchema = z.enum(["summary", "detailed"])
  .default("summary")
  .describe("'summary': Name, ID, doc count only. 'detailed': + permissions, timestamps");

export const DetailLevelTableSchema = z.enum(["names", "columns", "full_schema"])
  .default("columns")
  .describe("'names': Table names only. 'columns': + column names. 'full_schema': + types, formulas");

// Pagination schema
export const PaginationSchema = z.object({
  offset: z.number()
    .int()
    .min(0)
    .default(0)
    .describe("Starting position (0-indexed)"),
  limit: z.number()
    .int()
    .min(1)
    .max(1000)
    .default(100)
    .describe("Number of items to return (max 1000)")
});

// Common ID schemas
export const DocIdSchema = z.string()
  .min(1)
  .describe("Document ID (from grist_list_documents). Example: 'doc_abc123'");

export const TableIdSchema = z.string()
  .min(1)
  .describe("Table ID (from grist_get_tables). Example: 'Contacts', 'Sales_Data'");

export const WorkspaceIdSchema = z.string()
  .min(1)
  .describe("Workspace ID (from grist_list_workspaces). Example: 'ws_abc123'");

// Column type enum
export const ColumnTypeSchema = z.enum([
  "Text", "Numeric", "Int", "Bool", "Date", "DateTime",
  "Choice", "ChoiceList", "Ref", "RefList", "Attachments"
]).describe("Column data type");
```

---

*[Continued in next section due to length...]*

**This master document continues with:**
- Part 4: Complete Tool Specifications with Zod Schemas
- Part 5: Workflow Validation (10 workflows)
- Part 6: Implementation Guide (8 phases with checklists)
- Part 7: Quality & Testing (standards, evaluation questions)
- Part 8: MCP Alignment (what we got right, clarifications)
- Appendices: Complete schemas, API examples, error templates

**Total Length:** ~3,500 lines
**Status:** Implementation-ready single source of truth

---

Would you like me to complete the remaining sections (Parts 4-8 and Appendices) in this file?
# Part 4: Tool Specifications

## Complete Zod Schemas Reference

**All 15 tool schemas are fully specified in `PLANNING_ADDITIONS.md` lines 649-1026.**

**Key schemas (use these as templates):**

### Discovery Tools
- `ListWorkspacesSchema`, `ListDocumentsSchema`, `GetDocumentSchema`, `GetTablesSchema`

### Reading Tools  
- `QuerySQLSchema`, `GetRecordsSchema`

### Record Operations
- `AddRecordsSchema`, `UpdateRecordsSchema`, `UpsertRecordsSchema`, `DeleteRecordsSchema`

### Table Management
- `CreateTableSchema` (with `ColumnDefinitionSchema`), `RenameTableSchema`, `DeleteTableSchema`

### Column Management
- `ManageColumnsSchema` (with discriminated union `ColumnOperationSchema` for add/modify/delete/rename)

### Document Management
- `CreateDocumentSchema`

**Implementation tip:** All schemas use `.strict()` and include comprehensive `.describe()` documentation.

---

# Part 5: Workflow Validation

## Key Workflow Examples

**See `PLANNING_ADDITIONS.md` lines 7-336 for complete 10-workflow validation.**

### Critical Workflows

**1. CRM Creation (6 steps)**
```
list_workspaces → create_document → create_table (Contacts) 
→ create_table (Deals) → create_table (Activities) → manage_columns
```
✅ Validates: Document creation, multiple table creation, column management

**2. CSV Sync (4 steps)**
```
list_documents → get_tables → get_records (check existing) → upsert_records
```
✅ Validates: Discovery, upsert critical for sync workflows

**3. Data Analysis (4 steps)**
```
list_documents → get_tables (full_schema) → query_sql (analytics) 
→ query_sql (trends)
```
✅ Validates: SQL queries with JOINs, schema discovery

**Result:** All 15 tools validated across 10 complete workflows in PLANNING_ADDITIONS.md

## Tool Overlap Decision: Upsert vs Add vs Update

**Use `add_records` when:**
- All records are definitely new
- Performance matters (faster than upsert)
- Don't need to check for existing

**Use `update_records` when:**
- Have specific row IDs to update
- Records definitely exist
- Modifying specific known records

**Use `upsert_records` when:**
- Syncing data (CSV import, API sync)
- Don't know if records exist
- Need "add if new, update if exists" behavior
- **Most common for data integration workflows**

---

# Part 6: Implementation Guide

## 8-Phase Implementation (12-15 hours total)

**Detailed checklists in `IMPLEMENTATION_CHECKLIST.md`**

### Phase 1: Project Setup (30 min)
- [ ] Initialize package.json, tsconfig.json (strict mode)
- [ ] Install dependencies: `@modelcontextprotocol/sdk`, `axios`, `zod@3`
- [ ] Create directory structure: `src/{tools,services,types,constants}`, `evaluations/`
- [ ] Verify `npm run build` works

### Phase 2: Core Infrastructure (2 hours)
- [ ] Constants: CHARACTER_LIMIT, pagination defaults
- [ ] Types: Grist types, MCP types, common interfaces
- [ ] GristClient: HTTP client with status code error handling
- [ ] Action builders: 10 functions for UserAction construction
- [ ] Formatters: formatToolResponse (content + structuredContent), truncation
- [ ] Common schemas: ResponseFormat, DetailLevel, Pagination, IDs

### Phase 3: Tool Implementation (4-6 hours)
- [ ] **Discovery (4 tools):** list_workspaces, list_documents, get_document, get_tables
- [ ] **Reading (2 tools):** query_sql, get_records
- [ ] **Records (4 tools):** add_records, update_records, upsert_records, delete_records
- [ ] **Tables (3 tools):** create_table, rename_table, delete_table
- [ ] **Columns (1 tool):** manage_columns (with discriminated union)
- [ ] **Documents (1 tool):** create_document

**For each tool:** Zod schema, comprehensive description, error handling, response formatting

### Phase 4: Server Integration (1 hour)
- [ ] Create `src/index.ts`
- [ ] Initialize McpServer, validate environment variables
- [ ] Register all 15 tools with `server.registerTool()`
- [ ] Connect stdio transport
- [ ] Test server starts without errors

### Phase 5: Build & Testing (1 hour)
- [ ] Run `npm run build`, fix TypeScript errors
- [ ] Configure Claude Desktop with API key
- [ ] Test each tool category (discovery, reading, mutations)
- [ ] Test error scenarios (invalid API key, missing resources)
- [ ] Test response formats (JSON vs Markdown)

### Phase 6: Evaluation Questions (2 hours)
- [ ] Create test Grist workspace with known data
- [ ] Write 10 complex questions (5-20 tool calls each) in `evaluations/grist_evaluation.xml`
- [ ] Manually solve each question to verify answers
- [ ] Ensure all questions are read-only and stable

### Phase 7: Documentation (1 hour)
- [ ] Complete README.md (installation, configuration, usage, troubleshooting)
- [ ] Add JSDoc comments to all public functions
- [ ] Document complex algorithms (truncation, action building)

### Phase 8: Quality Review (1 hour)
- [ ] **Code quality:** No duplication, consistent formatting, type safety
- [ ] **MCP best practices:** Tool annotations, error messages, character limits
- [ ] **TypeScript quality:** Strict mode, no `any`, explicit return types
- [ ] **Success criteria:** All 15 tools working, comprehensive validation, documentation complete

---

# Part 7: Quality & Testing

## Quality Standards

### Code Quality Checklist
- ✅ **DRY:** Shared HTTP client, action builders, formatters (no duplication)
- ✅ **Type Safety:** Strict TypeScript, no `any` types, explicit return types
- ✅ **Error Handling:** All API calls have try-catch with actionable messages
- ✅ **Consistency:** Similar operations return similar formats

### MCP Best Practices Checklist
- ✅ Tool names: `grist_verb_noun` convention
- ✅ Tool descriptions: Comprehensive (Use when, Don't use when, Errors)
- ✅ Error messages: Actionable with next steps
- ✅ Response structure: Both `content` (text) and `structuredContent` (data)
- ✅ Tool annotations: Correct readOnlyHint, destructiveHint, idempotentHint
- ✅ Character limits: 25K enforced with truncation
- ✅ Pagination: offset/limit with metadata
- ✅ openWorldHint: true (external Grist instance)

### TypeScript Quality Checklist
- ✅ Strict mode enabled
- ✅ Zod schemas with `.strict()`
- ✅ Promise<T> return types explicit
- ✅ No unused variables or imports

## Testing Strategy

### Manual Testing
1. **Authentication:** Valid key, invalid key, missing key
2. **Each tool category:** Discovery, reading, mutations, table mgmt
3. **Error scenarios:** 401, 403, 404, 429, validation errors
4. **Response formats:** JSON vs Markdown
5. **Detail levels:** summary vs detailed, names vs columns vs full_schema
6. **Pagination:** offset/limit, has_more, next_offset
7. **Character limit:** Truncation with large datasets

### Evaluation Testing
- 10 complex questions requiring 5-20 tool calls each
- Read-only operations only
- Stable answers (won't change over time)
- Tests tool coordination and workflow completion
- Validates LLM can effectively use tools together

## Evaluation Questions

**Create 10 questions in `evaluations/grist_evaluation.xml`:**

**Examples (see PLANNING_ADDITIONS.md for complete set):**

1. Schema analysis question (requires get_tables + analysis)
2. Cross-table analytics (requires SQL with JOINs)
3. Permission audit (requires list_workspaces, list_documents, get_document)
4. Data volume assessment (requires get_records with count)
5. Reference integrity check (requires get_tables, query_sql for orphaned refs)
6. Formula validation (requires get_tables with full_schema)
7. Recent changes audit (requires get_records with date filters)
8. Duplicate detection (requires query_sql with GROUP BY HAVING)
9. Column usage analysis (requires schema + data inspection)
10. Performance impact prediction (requires schema analysis + row counts)

**Format:**
```xml
<evaluation>
  <qa_pair>
    <question>Your complex question here</question>
    <answer>Single verifiable answer</answer>
  </qa_pair>
  <!-- 9 more qa_pairs -->
</evaluation>
```

---

# Part 8: MCP Alignment & Best Practices

## What We Got Right (95% Aligned)

✅ **Workflow-oriented design** - Tools enable complete workflows, not just API wrappers
✅ **Context optimization** - detail_level parameters, 25K character limits, pagination
✅ **Actionable errors** - Status codes → helpful guidance with next steps
✅ **Type safety** - Strict TypeScript + comprehensive Zod validation
✅ **Tool annotations** - Proper use of readOnlyHint, destructiveHint, idempotentHint
✅ **Comprehensive descriptions** - Use when, Don't use when, Error handling docs

## Clarifications Made

Based on official MCP TypeScript SDK review:

1. **Server initialization pattern** - Added McpServer + StdioServerTransport code
2. **Response structure** - Clarified BOTH content (text) AND structuredContent (data) required
3. **Error response flag** - Added `isError: true` for programmatic error detection

## Future Enhancements (v1.1+)

### Optional MCP Features (Not Needed for v1.0)
- **Resources:** Expose Grist documents as browsable resources (`grist://doc/{docId}`)
- **Prompts:** Templates for common queries ("Analyze table", "Create CRM")
- **Dynamic tool management:** Enable/disable tools based on permissions
- **User input elicitation:** Confirmation prompts for destructive operations

### v1.1 Considerations
- Batch operations (apply multiple changes across documents)
- Document templates (create from template)
- Formula assistance (validate/suggest formulas)
- Attachment handling (upload/download files)

### v2.0 Considerations
- Real-time updates via webhooks
- Collaborative editing awareness
- Advanced ACL management
- Data validation and constraints

---

# Success Criteria

## Must Have (Launch Blockers)
- [ ] All 15 tools implemented and tested
- [ ] Comprehensive Zod validation for all inputs
- [ ] Both Grist Cloud and self-hosted support
- [ ] API key authentication working
- [ ] JSON and Markdown response formats
- [ ] detail_level parameters for context optimization
- [ ] CHARACTER_LIMIT enforcement (25K)
- [ ] Tool annotations correct
- [ ] Type-safe (strict TypeScript, no `any`)
- [ ] `npm run build` succeeds
- [ ] Actionable error messages for all scenarios
- [ ] DRY code (no duplication)
- [ ] README with installation and usage
- [ ] Works with Claude Desktop or MCP Inspector

## Should Have (Quality Targets)
- [ ] 10 evaluation questions created and validated
- [ ] Average response time <2s for simple operations
- [ ] Comprehensive inline documentation (JSDoc)
- [ ] Troubleshooting guide in README

---

# Quick Start

## Ready to implement? Start here:

```bash
cd grist-mcp-server

# Phase 1: Setup (30 min)
npm init -y
npm install @modelcontextprotocol/sdk axios zod@3 typescript @types/node
npx tsc --init  # Enable strict mode
mkdir -p src/{tools,services,types,constants} evaluations

# Phase 2: Core Infrastructure (2 hours)
# Create constants, types, GristClient, action builders, formatters
# Reference Part 3 for complete specifications

# Phase 3: Implement 15 tools (4-6 hours)
# Reference Part 4 and PLANNING_ADDITIONS.md for complete Zod schemas

# Phase 4-8: Integration, Testing, Evaluation, Documentation, Review
# Follow IMPLEMENTATION_CHECKLIST.md for detailed steps
```

**Get Grist API key:** https://docs.getgrist.com/settings/keys

**Reference documents:**
- This guide: Architecture and specifications
- `PLANNING_ADDITIONS.md`: Complete Zod schemas, API examples, workflows
- `IMPLEMENTATION_CHECKLIST.md`: Detailed phase-by-phase tasks
- `GAP_ANALYSIS.md`: MCP alignment assessment

---

**Status:** ✅ Ready for Implementation
**Estimated Time:** 12-15 hours
**Next Step:** Run `npm init` and start Phase 1

