# Grist MCP Server - Interactive Test Report

**Test Date:** 2025-12-09
**Test Document:** `jYkWyueuhLC418Mv8PtnAr` ("MCP Interactive Test")

---

## Summary

| Category | Status | Notes |
|----------|--------|-------|
| MCP Resources | PASS | Document index, schema, pages resources all work |
| Discovery Tools | PASS | Minor issue with workspace display in documents |
| Document/Table Creation | PASS | All column types work correctly |
| Record CRUD | PASS | Add, get, update, upsert, delete all functional |
| SQL Queries | PASS | JOINs, aggregations, WHERE clauses work |
| Schema Management | PASS | Column add/modify/rename/delete work |
| Page & Widget Building | PASS | Master-detail, chart dashboard patterns work |
| Widget Configuration | PASS | Sort, filter, linking work |
| Conditional Rules | **FAIL** | Output validation error on all operations |
| Webhooks | PASS | Create, list, update, delete all work |
| Summary Tables | PASS | Aggregation and grouping work correctly |

---

## Bugs Found

### BUG-001: Conditional Rules Output Validation Error (CRITICAL)

**Tool:** `grist_manage_conditional_rules`
**Severity:** Critical - Tool completely non-functional

**Error:**
```
MCP error -32602: Output validation error: Tool grist_manage_conditional_rules has an output schema but no structured content was provided
```

**Reproduction:**
- Any operation (add, list, update, remove) fails with the same error
- Tested with column scope, row scope - all fail

**Root Cause Hypothesis:**
The tool's `executeInternal()` method likely returns a response that doesn't match the defined output schema, or the tool is returning MCPToolResponse instead of raw data.

---

### BUG-002: Workspace ID Missing in Document Search Results

**Tool:** `grist_get_documents`
**Severity:** Low

**Observed Behavior:**
When searching documents by name, workspace info shows:
```json
{"workspace": {"id": 0, "name": "Unknown"}}
```

But the documents are actually in workspace 3 (Home).

**Expected Behavior:**
Workspace should show the correct ID and name.

---

### BUG-003: Column Modify Changes ColId When Setting Label

**Tool:** `grist_manage_columns` with `modify` action
**Severity:** Medium - Unexpected side effect

**Steps to Reproduce:**
1. Create table with column `Name` (colId: "Name", label: "Name")
2. Call `grist_manage_columns` with:
   ```json
   {"action": "modify", "colId": "Name", "label": "Product Name"}
   ```
3. Column ID changes from "Name" to "Product_Name"

**Expected Behavior:**
Modifying the label should NOT change the column ID. These should be independent properties.

**Actual Behavior:**
The column ID is automatically changed to match the label (with underscores replacing spaces).

---

## Improvements Suggested

### IMP-001: Better Widget Name Discovery

**Tool:** `grist_configure_widget`
**Current Behavior:**
When a widget name doesn't match, the error message suggests using section IDs but there's no easy way to discover them.

**Suggestion:**
1. Include widget IDs in `grist_get_pages` summary output
2. Or provide a "fuzzy match" suggestion when widget name is close

---

### IMP-002: Upsert Should Return Affected Record IDs

**Tool:** `grist_upsert_records`
**Current Behavior:**
Returns `record_ids: []` with a note that Grist API doesn't return IDs.

**Suggestion:**
Consider doing a follow-up query to return the affected record IDs, or at least return whether each operation was an insert vs update.

---

### IMP-003: Add Form Pattern to Page Builder

**Tool:** `grist_build_page`
**Current Behavior:**
Has `form_table` pattern but lacks a simple "form only" pattern.

**Suggestion:**
Add a `form` pattern for quickly creating data entry pages.

---

### IMP-004: Response Format Consistency

**Tools:** Various
**Observation:**
Some tools return markdown by default, others return JSON. The `response_format` parameter exists but default behavior varies.

**Suggestion:**
Standardize on JSON default for all tools when called programmatically via MCP.

---

### IMP-005: Resources Could Include Table Relationships

**Resource:** `grist://docs/{docId}`
**Current Behavior:**
Shows tables with columns but doesn't indicate relationships (Ref/RefList columns).

**Suggestion:**
Add a `relationships` section showing foreign key connections between tables.

---

## Schema Validation Notes

All tested schemas appear accurate based on actual usage:

1. **DocId Pattern:** `^[1-9A-HJ-NP-Za-km-z]{22}$` - Correctly validates Base58 22-char IDs
2. **TableId Pattern:** `^[A-Z_][A-Za-z0-9_]*$` - Works for standard table names
3. **Column Types:** All standard types (Text, Numeric, Int, Bool, Date, DateTime, Choice, ChoiceList, Ref, RefList) work correctly
4. **WidgetOptions:** Currency, choices, date formats all applied correctly
5. **Formula Columns:** Python formulas work (`$Price * $Quantity`)

---

## Test Data Created

The test created:
- 1 document with 3 tables (Products, Orders, Products_summary_Category)
- 5 pages including master-detail and chart dashboard
- Various records demonstrating all column types
- Webhook (created and deleted)
- Summary table with aggregations

Document can be viewed at: https://grist.gwht.uk/doc/jYkWyueuhLC418Mv8PtnAr

---

## Recommendations

1. **Priority 1:** Fix `grist_manage_conditional_rules` output schema validation
2. **Priority 2:** Fix workspace ID population in document search
3. **Priority 3:** Prevent column ID mutation when only modifying label
4. **Nice to have:** Implement suggested improvements

---

*Report generated via interactive MCP testing session*
