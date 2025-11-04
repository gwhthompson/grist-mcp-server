# Changelog

All notable changes to the Grist MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] - 2025-01-04

### Added
- **Tool consolidation:** `grist_get_documents` with 4 intelligent modes (get by ID, search by name, browse all, filter by workspace)
- **Search capability:** Added `name_contains` parameter to `grist_get_workspaces` and `grist_get_documents`
- **Mode indicators:** Responses now include mode field showing which operation was used (get_by_id, search, browse_all, workspace_filter)
- **Enhanced tool descriptions:** Added comprehensive USE WHEN / DON'T USE / EXAMPLES sections to priority tools
- **Performance guidance:** Added indicators (⚡FASTEST / 🔄SMARTEST / 🎯PRECISE) to help agents choose optimal tools
- **Decision matrices:** Added clear guidance for tool selection (SQL vs get_records, add vs upsert vs update)
- **Comprehensive error messages:** Multi-line format with possible causes, next steps, and concrete examples
- **Dynamic evaluations:** Evaluation suite now discovers document IDs dynamically (resilient to reseeds)

### Changed
- **BREAKING:** Renamed `grist_list_workspaces` to `grist_get_workspaces` for consistency
- **BREAKING:** Consolidated `grist_list_documents` and `grist_get_document` into single `grist_get_documents` tool
- **Tool count:** Reduced from 15 to 14 tools (consolidation improved usability)
- **Filter schema:** Updated description to clarify automatic array conversion and AND/OR logic
- **Error message ordering:** Table errors now checked before document errors (more specific errors)

### Fixed
- **CRITICAL:** Fixed `get_records` filter format - Now auto-converts `{"Status": "Active"}` to Grist array format `{"Status": ["Active"]}`
  - **Impact:** Filters were completely non-functional, now working correctly
  - **Root cause:** Grist API requires filter values as arrays
  - **Solution:** Automatic conversion in tool logic
- **HIGH:** Fixed `upsert_records` null safety - Added optional chaining to handle null responses
  - **Impact:** Tool crashed on certain Grist API responses
  - **Root cause:** Missing null check on `response.records`
  - **Solution:** Changed to `response?.records || []`
- **MEDIUM:** Fixed table error detection - Table-specific errors now show correct message
  - **Impact:** Invalid table IDs showed "Document not found" instead of "Table not found"
  - **Root cause:** Error regex checking order
  - **Solution:** Check table paths before document paths

### Improved
- **Error messages:** Enhanced 404 handling with resource-specific guidance (documents, workspaces, tables, organizations)
- **Tool descriptions:** Added ⚠️  WARNING to `grist_add_records` about duplicate behavior
- **Filter description:** Clarified AND/OR logic and auto-conversion in FilterSchema
- **Evaluation reliability:** Made verify-answers.ts discover document IDs dynamically instead of using hardcoded values

### Testing
- **Evaluation pass rate:** Improved from 90% (9/10) to 100% (10/10)
- **Workflow tests:** Created comprehensive testing suite with 88% success rate (7/8 passing + 1 expected behavior)
- **Bug discovery:** Found and fixed 3 critical bugs through comprehensive testing
- **Live validation:** All tools tested against Docker instance

### Documentation
- Moved historical planning documents to `archive/` directory
- Moved debug test scripts to `tests/` directory
- Created comprehensive audit report (archive/MCP_IMPLEMENTATION_AUDIT.md)
- Created testing improvements summary (archive/TESTING_IMPROVEMENTS.md)

---

## [1.0.0] - 2025-01-03

### Added
- Initial release of Grist MCP Server
- 15 workflow-oriented tools covering Grist API
- Dual format support (JSON and Markdown)
- Progressive detail levels (summary/detailed, names/columns/full_schema)
- Smart context management (25K character limit with intelligent truncation)
- Comprehensive error messages
- Full type safety with Zod validation
- Docker Compose setup for local testing
- Evaluation suite with 10 complex questions

### Tools (v1.0.0)
**Discovery & Navigation (4 tools):**
- grist_list_workspaces
- grist_list_documents
- grist_get_document
- grist_get_tables

**Data Reading (2 tools):**
- grist_query_sql
- grist_get_records

**Record Operations (4 tools):**
- grist_add_records
- grist_update_records
- grist_upsert_records
- grist_delete_records

**Table Management (3 tools):**
- grist_create_table
- grist_rename_table
- grist_delete_table

**Column Management (1 tool):**
- grist_manage_columns

**Document Management (1 tool):**
- grist_create_document

---

## Migration Guide: v1.0.0 → v1.2.0

### Breaking Changes

**Tool Name Changes:**

1. `grist_list_workspaces` → `grist_get_workspaces`
   - **Migration:** Replace tool name
   - **Parameters:** Compatible (new optional `name_contains` parameter)
   - **Example:** `grist_get_workspaces({limit: 10})` works the same

2. `grist_list_documents` → `grist_get_documents`
   - **Migration:** Replace tool name
   - **Parameters:** Superset (added `docId` and `name_contains`)
   - **Example:** `grist_get_documents({workspaceId: "3"})` works the same

3. `grist_get_document` → `grist_get_documents`
   - **Migration:** Add `docId` parameter instead
   - **Old:** `grist_get_document({docId: "abc"})`
   - **New:** `grist_get_documents({docId: "abc"})`

### Non-Breaking Improvements

All other tools unchanged. New parameters are optional, existing functionality preserved.

### Benefits of Upgrading

- ✅ Filters actually work (critical bug fixed)
- ✅ Simpler discovery (3 tools → 1 tool for documents)
- ✅ Better error messages (actionable guidance)
- ✅ Search capabilities (name_contains parameter)
- ✅ Performance guidance (choose optimal tools)

---

**For detailed bug fixes and improvements, see archive/TESTING_IMPROVEMENTS.md**
**For complete audit report, see archive/MCP_IMPLEMENTATION_AUDIT.md**
