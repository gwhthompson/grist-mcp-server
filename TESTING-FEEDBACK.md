# Grist MCP Server - Comprehensive Testing Feedback

**Test Date:** 2025-12-09
**Tester:** Claude (AI Agent as End User)
**MCP Spec Reference:** https://modelcontextprotocol.io/llms-full.txt
**Test Document Created:** `mesQbz4vPTQwSRNur7g3A5` (MCP Server Test - Feedback Session)

---

## Executive Summary

The Grist MCP Server is a **well-designed, comprehensive implementation** that covers the full Grist API surface. The tool naming, documentation, and overall UX are excellent. There are a few areas for improvement, primarily around data validation edge cases and minor schema inconsistencies.

**Overall Rating: 8.5/10**

---

## Strengths

### 1. Excellent Tool Naming Convention
- Consistent `grist_{verb}_{noun}` pattern (e.g., `grist_get_records`, `grist_add_records`)
- Names are clear, predictable, and follow MCP best practices
- Easy to discover related tools

### 2. Outstanding Documentation System
The `grist_help` tool is excellent:
- Multiple topics: `overview`, `examples`, `errors`, `parameters`, `full`
- Concise, actionable information
- Examples are practical and copy-pasteable

### 3. Excellent Error Messages
Most error messages are:
- **Actionable**: Include suggestions like "Use grist_get_tables to see available tables"
- **Detailed**: Explain what went wrong and why
- **Contextual**: Include relevant identifiers (doc ID, table name, etc.)

Example of excellent error handling:
```
Table not found (ID: 'NonExistentTable'). Possible causes: invalid table ID
(check spelling/case), table was deleted/renamed, or wrong document.
Use grist_get_tables to see available tables and verify ID matches exactly.
```

### 4. Strong Input Validation
- DocId validation is strict (22 chars, Base58, excludes ambiguous chars 0OIl)
- TableId pattern validation (uppercase start, Python identifier rules)
- Clear validation error messages with exact constraints

Example validation error:
```json
{
  "origin": "string",
  "code": "invalid_format",
  "format": "regex",
  "pattern": "/^[1-9A-HJ-NP-Za-km-z]{22}$/",
  "path": ["docId"],
  "message": "Document ID must be Base58 format (22 chars, excludes 0OIl which are visually ambiguous)"
}
```

### 5. Comprehensive MCP Resources
- Exposes document schemas as resources (`grist://docs/{id}`)
- Table schemas available (`grist://docs/{id}/tables/{tableId}`)
- Page structures exposed (`grist://docs/{id}/pages`)
- Good resource descriptions

### 6. Helpful Response Metadata
Most responses include:
- `success` boolean
- Descriptive `message`
- `next_steps` suggestions (especially on create operations)
- URL links to created resources
- Pagination info (`has_more`, `next_offset`)

Example create response:
```json
{
  "success": true,
  "document_id": "mesQbz4vPTQwSRNur7g3A5",
  "document_name": "MCP Server Test - Feedback Session",
  "url": "https://grist.gwht.uk/doc/mesQbz4vPTQwSRNur7g3A5",
  "next_steps": [
    "Use grist_get_tables with docId=\"mesQbz4vPTQwSRNur7g3A5\" to see table structure",
    "Use grist_create_table to add tables",
    "Access document at: https://grist.gwht.uk/doc/mesQbz4vPTQwSRNur7g3A5"
  ]
}
```

### 7. Powerful Query Capabilities
- SQL support via `grist_query_sql` enables JOINs and aggregations
- Filter support on `grist_get_records`
- Column selection to reduce payload

### 8. Advanced Page Building
The `grist_build_page` patterns are well-designed:
- `master_detail`, `hierarchical`, `chart_dashboard`, `form_table`, `custom`
- Automatic widget linking
- Sensible defaults

---

## Issues & Recommendations

### Critical Issues

#### 1. Invalid Reference Values Silently Accepted
**Severity:** High
**Tool:** `grist_add_records`

**Issue:** Adding records with invalid `Ref` column values (e.g., referencing non-existent row ID 999) succeeds without warning.

**Test Case:**
```json
{
  "tableId": "Orders",
  "records": [{"Customer": 999, "Amount": 100}]
}
```
**Result:** Record created with `Customer: 999` even though no customer with ID 999 exists.

**Verification:**
```json
{"id":4,"OrderNum":"ORD-004","Customer":999,"Amount":100,"OrderDate":null,"Status":""}
```

**Impact:** Data integrity issues; orphan references created silently.

**Recommendation:**
- Add optional `validate_references: true` parameter
- Or at minimum, return a warning in the response when orphan references are detected
- Consider: Should this be the default behavior or opt-in validation?

---

#### 2. Invalid Choice Values Silently Accepted
**Severity:** High
**Tool:** `grist_add_records`

**Issue:** Choice columns accept values not in the defined choices list.

**Test Case:**
```json
{
  "tableId": "Customers",
  "records": [{"Tier": "InvalidTier"}]
}
```
**Result:** Record created with `Tier: "InvalidTier"` despite choices being `["Bronze", "Silver", "Gold", "Platinum"]`.

**Impact:** Choice columns lose their enumeration guarantee; data quality issues.

**Recommendation:**
- Validate Choice/ChoiceList values against defined choices
- Return error or warning for invalid values
- This matches Grist UI behavior which shows warnings for invalid choices

---

#### 3. Update Non-Existent Rows Returns 500 Error
**Severity:** Medium
**Tool:** `grist_update_records`

**Issue:** Attempting to update a non-existent row ID returns a generic 500 server error instead of a clear "row not found" message.

**Test Case:**
```json
{
  "tableId": "Customers",
  "rowIds": [999],
  "updates": {"Tier": "Gold"}
}
```
**Result:**
```
Grist server error (500). This is a temporary server issue.
Try again in a few moments.
```

**Impact:** Users can't distinguish between actual server errors and invalid row IDs.

**Recommendation:**
- Catch this specific case and return a clear "Row ID(s) not found: [999]" error
- List which row IDs were invalid
- This is a user error, not a server error

---

### Medium Priority Issues

#### 4. Column Rename Side Effect Not Documented
**Severity:** Medium
**Tool:** `grist_manage_columns`

**Issue:** When modifying a column's `label` via `grist_manage_columns`, Grist may also rename the `colId` if they were previously linked.

**Test Case:**
1. Create column with `colId: "Name"`, `label: "Full Name"` → actual colId becomes `Name`
2. Later modify: `action: "modify", colId: "Name", label: "Customer Name"`
3. The `colId` silently changes from `Name` to `Customer_Name`

**Impact:** Breaks references to the column by old name; formulas may error.

**Verification:** After modifying label to "Customer Name", `grist_get_tables` showed:
```json
{"id": "Customer_Name", "columns": ["Customer_Name", "Email", ...]}
```

**Recommendation:**
- Document this behavior clearly in `grist_manage_columns` help
- Add `untieColIdFromLabel: true` option explanation prominently
- Consider returning the new colId in the response when it changes
- Warn users if colId will change due to label modification

---

#### 5. Help Tool "parameters" Topic Is Sparse
**Severity:** Low
**Tool:** `grist_help`

**Issue:** The `parameters` topic returns only "See tool description for parameter details" without actual parameter documentation.

**Test Case:**
```json
{"tool_name": "grist_get_records", "topic": "parameters"}
```
**Result:** `"See tool description for parameter details."`

**Recommendation:** Either:
- Populate the parameters topic with useful content (parameter names, types, defaults, constraints)
- Remove it from `available_topics`
- Or link to where parameter docs can be found

---

#### 6. SQL Query Output Format Differs from grist_get_records
**Severity:** Low
**Tool:** `grist_query_sql`

**Issue:** SQL returns a different structure than `grist_get_records`.

**grist_get_records format:**
```json
{"items": [{"id": 1, "Name": "Alice", "Active": true}]}
```

**grist_query_sql format:**
```json
{"records": [{"fields": {"Name": "Alice", "Active": 1}}]}
```

**Differences:**
- `records` vs `items` wrapper
- `fields` nesting vs flat object
- Booleans as 0/1 vs true/false
- No `id` field unless explicitly selected

**Recommendation:**
- Document the format differences clearly
- Or add a `normalize_output: true` option to match grist_get_records format
- This is not necessarily a bug - SQL output may need to match raw SQLite types

---

### Low Priority Issues

#### 7. delete_records filter Destructive Operation Warning
**Severity:** Low (UX Enhancement)
**Tool:** `grist_delete_records`

**Issue:** Filter-based deletion is supported and works well, but could benefit from a preview/dry-run mode.

**Test Case:**
```json
{
  "tableId": "Customers",
  "filters": {"Active": false}
}
```
**Result:** Successfully deleted 1 record. Response included:
```json
{
  "deleted_row_ids": [3],
  "warning": "This operation cannot be undone. Deleted records are permanently removed.",
  "filters_used": {"Active": false}
}
```

**Recommendation:**
- Add `dry_run: true` parameter that returns `would_delete_row_ids` without actually deleting
- Helps users verify filters before destructive operation

---

#### 8. Widget Identification Could Be Clearer
**Severity:** Low
**Tool:** `grist_configure_widget`

**Issue:** `grist_configure_widget` accepts widget by either name or ID, but doesn't clearly indicate which was matched.

**Test Case:**
```json
{
  "action": "sort",
  "widget": 10,
  "sort_spec": ["Customer_Name"]
}
```

**Recommendation:**
- In responses, include both the widget ID and title that was matched
- Add example in help showing ID vs name usage clearly

---

## Schema Consistency Analysis

### Positive Observations

1. **Consistent Parameter Naming:**
   - `docId` everywhere (not `documentId` or `doc_id`)
   - `tableId` everywhere (not `table` or `table_name`)
   - `response_format` consistent across all tools

2. **Consistent Pagination:**
   - `limit`, `offset`, `has_more`, `next_offset` pattern used consistently
   - `total` count included where applicable

3. **Consistent ID Formats:**
   - DocId: 22-char Base58 everywhere
   - TableId: PascalCase pattern everywhere
   - WebhookId: UUID format

### Minor Inconsistencies

1. **Response Wrapper:**
   - Some tools: `{"success": true, "items": [...]}`
   - Other tools: `{"total": X, "items": [...]}` without explicit success
   - Recommendation: Standardize on always including `success` boolean

2. **Column References:**
   - Some contexts accept `colId` as string only
   - Others accept `colId` or numeric column ID
   - `visibleCol` can be string name or numeric ID (this is documented and good)
   - Recommendation: Be consistent or document clearly which tools accept both

---

## UX Recommendations

### 1. Add Schema Validation Tool
Consider adding a `grist_validate_schema` tool that:
- Validates column types against data
- Checks for orphan references
- Verifies formula syntax
- Returns a report of issues

### 2. Add Dry-Run Mode for Destructive Operations
For `grist_delete_records`, `grist_delete_table`, etc.:
- Add `dry_run: true` parameter
- Returns what would be deleted without executing
- Helps prevent accidents

### 3. Improve Webhook Status Visibility
The `grist_manage_webhooks` list operation could include:
- Last trigger timestamp
- Success/failure count
- Last error message if applicable

### 4. Column Change Detection
When modifying columns, return:
- What actually changed
- If colId changed (label linkage)
- Any formula references that might be affected

---

## Compliance with MCP Spec

### Fully Compliant
- Tool naming follows conventions
- JSON Schema for all inputs
- Structured error responses
- Proper content type handling
- No stdout pollution (proper logging assumed)

### Already Well Implemented
- Tool descriptions are clear
- Examples provided (via help system)
- Error handling is structured
- Resources expose useful data

---

## Test Coverage Summary

| Category | Tools Tested | Pass | Issues |
|----------|-------------|------|--------|
| Discovery | 4 | 4 | 0 |
| Records CRUD | 5 | 4 | 1 (validation) |
| Tables/Columns | 5 | 4 | 1 (rename side-effect) |
| Pages/Widgets | 4 | 4 | 0 |
| Webhooks | 3 | 3 | 0 |
| SQL/Queries | 1 | 1 | 0 |
| Help System | 1 | 1 | 1 (sparse params topic) |
| Conditional Rules | 1 | 1 | 0 |

---

## Test Artifacts Created

**Document:** `mesQbz4vPTQwSRNur7g3A5` (MCP Server Test - Feedback Session)

**Tables Created:**
- Customers (with Phone, Revenue columns added during testing)
- Orders (with Ref:Customers)
- Orders_summary_Status

**Pages Created:**
- Customer Orders Dashboard (master-detail pattern)

**Features Tested:**
- Document creation
- Table creation with all column types
- Record CRUD operations
- Upsert operations
- Filter-based deletion
- Column management (add, modify)
- Page building with patterns
- Widget configuration (sort, filter, link)
- Conditional formatting
- Webhook management
- Summary table creation
- SQL queries with JOINs

---

## Conclusion

The Grist MCP Server is **production-ready** and provides an excellent developer experience. The issues identified are edge cases that don't block core functionality. The server follows MCP best practices and provides comprehensive access to Grist's capabilities.

**Priority Fixes:**
1. Add reference/choice validation (or at least warnings)
2. Better error for updating non-existent rows (not 500)
3. Document column rename behavior when label changes

**Future Enhancements:**
1. Dry-run mode for destructive operations
2. Schema validation tool
3. Enhanced webhook status reporting
4. Normalize SQL output format option
