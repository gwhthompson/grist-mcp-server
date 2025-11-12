# Testing Guide - Grist MCP Server

**Last Updated:** January 12, 2025
**Current Version:** v1.2.2
**Test Status:** ✅ 350/350 PASSING

---

## Quick Start

### Prerequisites

**Docker Setup Required:** Tests run against a live Grist instance in Docker.

See **[DOCKER_SETUP.md](DOCKER_SETUP.md)** for complete Docker configuration and troubleshooting.

### Run All Tests

```bash
# 1. Ensure Docker Grist is running (see DOCKER_SETUP.md)
docker compose up -d && sleep 12
export GRIST_API_KEY=test_api_key
export GRIST_BASE_URL=http://localhost:8989

# 2. Run test suite
npm test
```

### Test Results
```bash
Test Files: 17 passed (17)
Tests: 350 passed (350)
Duration: ~40s
```

---

## Test Suite Overview

### Test Coverage (17 Test Files)

**Tool Integration Tests:**
- `tests/workspaces.test.ts` - Workspace discovery and listing
- `tests/documents.test.ts` - Document creation and retrieval
- `tests/tables.test.ts` - Table management (create, rename, delete)
- `tests/columns.test.ts` - Column operations (add, update, remove)
- `tests/records.test.ts` - Record CRUD operations
- `tests/sql.test.ts` - SQL query execution
- `tests/visiblecol.test.ts` - Display column auto-resolution (15 tests)

**Column Type Tests:**
- `tests/column-types.test.ts` - All 11 Grist column types
  - Text, Numeric, Int, Bool
  - Date, DateTime
  - Choice, ChoiceList
  - Ref, RefList
  - Attachments

**Widget Options Tests:**
- `tests/widget-options.test.ts` - Widget configuration by type
  - NumericWidgetOptions (currency, decimals, numMode)
  - DateWidgetOptions (dateFormat, isCustomDateFormat)
  - DateTimeWidgetOptions (dateFormat + timeFormat)
  - ChoiceWidgetOptions (choices, choiceOptions)
  - ChoiceListWidgetOptions (same as Choice)

**Validation Tests:**
- `tests/improvement-validation.test.ts` - CellValue encoding validation (27 tests)
  - Schema validation for primitives and encoded arrays
  - Encoding helper tests (createList, createDate, createDateTime)
  - Tool description verification
- `tests/negative-tests.test.ts` - Error handling and edge cases
- `tests/pagination.test.ts` - Pagination and limits
- `tests/response-formats.test.ts` - JSON vs Markdown output

**Integration Tests:**
- `tests/integration.test.ts` - End-to-end workflows
- `tests/error-handling.test.ts` - Error message quality

---

## Test Categories

### 1. Tool Coverage (All 15 Tools Tested)

**Discovery (3 tools):**
- ✅ grist_get_workspaces - List workspaces with filtering
- ✅ grist_get_documents - List documents with pagination
- ✅ grist_get_tables - Get table schemas with columns

**Reading (2 tools):**
- ✅ grist_query_sql - SQL queries with parameterization
- ✅ grist_get_records - Record retrieval with filtering

**Records (4 tools):**
- ✅ grist_add_records - Single and bulk record creation
- ✅ grist_update_records - Partial record updates
- ✅ grist_upsert_records - Insert or update logic
- ✅ grist_delete_records - Safe record deletion

**Tables (3 tools):**
- ✅ grist_create_table - Table creation with initial columns
- ✅ grist_rename_table - Table renaming
- ✅ grist_delete_table - Safe table deletion

**Columns (1 tool):**
- ✅ grist_manage_columns - Unified column CRUD operations
  - Add columns with all types
  - Update column properties
  - Remove columns safely

**Documents (1 tool):**
- ✅ grist_create_document - Document creation in workspaces

### 2. Column Type Coverage (All 11 Types)

| Type | CellValue Format | Widget Options | Test Coverage |
|------|------------------|----------------|---------------|
| Text | String | - | ✅ Full |
| Numeric | Number | currency, decimals, numMode | ✅ Full |
| Int | Number | - | ✅ Full |
| Bool | Boolean | - | ✅ Full |
| Date | `["d", timestamp]` | dateFormat | ✅ Full |
| DateTime | `["D", timestamp, tz]` | dateFormat, timeFormat | ✅ Full |
| Choice | String | choices, choiceOptions | ✅ Full |
| ChoiceList | `["L", ...items]` | choices, choiceOptions | ✅ Full |
| Ref | Number (row ID) | visibleCol (auto-resolved) | ✅ Full |
| RefList | `["L", ...ids]` | visibleCol | ✅ Full |
| Attachments | Number (attachment ID) | - | ✅ Full |

### 3. CellValue Encoding (Critical Testing)

**Primitive Types:**
```typescript
✅ Text: "Hello World"
✅ Numeric: 42.5
✅ Int: 42
✅ Bool: true
```

**Encoded Types (Grist-specific):**
```typescript
✅ ChoiceList: ["L", "VIP", "Active", "Premium"]
✅ Date: ["d", 1705276800000]  // Unix timestamp
✅ DateTime: ["D", 1705276800000, "America/New_York"]
✅ RefList: ["L", 1, 2, 3]  // Row IDs
```

**Validation Tests (27 tests):**
- ✅ Rejects incorrectly encoded arrays (e.g., `['VIP', 'Active']` without "L")
- ✅ Accepts all correctly encoded formats
- ✅ Validates encoding helpers produce correct output
- ✅ Verifies tool descriptions include encoding guides

### 4. Widget Options Validation

**Cross-field Validation:**
```typescript
✅ NumericWidgetOptions:
   - currency required when numMode='currency'
   - decimals range: 0-20

✅ DateWidgetOptions:
   - dateFormat required
   - isCustomDateFormat with custom formats

✅ DateTimeWidgetOptions:
   - Both dateFormat AND timeFormat required
```

**Value Validation:**
```typescript
✅ Currency codes: ISO 4217 (165 valid codes)
✅ Colors: Hex #RRGGBB format only
✅ Choices: Max 1,000 items, 1-255 chars each
✅ Decimals: 0-20 range (JavaScript precision limit)
```

---

## Docker Integration

Tests run against a live Grist instance in Docker. For complete Docker setup, configuration, and troubleshooting, see:

**📖 [DOCKER_SETUP.md](DOCKER_SETUP.md)** - Complete Docker configuration guide

**Quick setup:**
```bash
docker compose up -d && sleep 12
export GRIST_API_KEY=test_api_key
export GRIST_BASE_URL=http://localhost:8989
```

---

## Test Helpers

### CellValue Encoding Helpers

Located in `tests/helpers/cell-values.ts` (will be moved to production):

```typescript
import { createList, createDate, createDateTime } from './tests/helpers/cell-values.js'

// ChoiceList: Requires "L" prefix
createList('option1', 'option2')
// Returns: ["L", "option1", "option2"]

// Date: Requires "d" prefix + Unix timestamp
createDate(Date.parse('2024-01-15'))
// Returns: ["d", 1705276800000]

// DateTime: Requires "D" prefix + timestamp + timezone
createDateTime(Date.parse('2024-01-15'), 'UTC')
// Returns: ["D", 1705276800000, "UTC"]
```

### Production Helpers

Located in `src/encoding/cell-value-helpers.ts`:

```typescript
import {
  createList,
  createDate,
  createDateTime,
  createReference,
  createReferenceList
} from '../src/encoding/cell-value-helpers.js'
```

---

## Test Data Patterns

### Document Structure
```typescript
// Created per test file to ensure isolation
const testDoc = await createDocument({
  name: 'Test Document',
  workspaceId: testWorkspaceId
})
```

### Table Creation
```typescript
// All 11 column types tested
await createTable({
  docId: testDoc.id,
  tableId: 'Products',
  columns: [
    { colId: 'Name', type: 'Text' },
    { colId: 'Price', type: 'Numeric' },
    { colId: 'InStock', type: 'Bool' },
    { colId: 'Tags', type: 'ChoiceList' },
    { colId: 'ReleaseDate', type: 'Date' }
  ]
})
```

### Record Operations
```typescript
// Bulk add with encoding
await addRecords({
  docId: testDoc.id,
  tableId: 'Products',
  records: [
    {
      Name: 'Widget A',
      Price: 29.99,
      InStock: true,
      Tags: createList('Popular', 'New'),
      ReleaseDate: createDate(Date.parse('2024-01-15'))
    }
  ]
})
```

---

## Negative Testing

Located in `tests/negative-tests.test.ts`:

### What Gets Tested

**Widget Options Validation:**
- ❌ Invalid numMode values
- ❌ Invalid currency codes
- ❌ Negative decimals
- ❌ Invalid color formats

**Choice Constraints:**
- ❌ Values not in choices list (Grist accepts, but documents behavior)
- ❌ choiceOptions for non-existent choices

**CellValue Encoding:**
- ❌ Missing "L" prefix for ChoiceList
- ❌ Missing timezone for DateTime
- ❌ Malformed encoded arrays

**API Constraints:**
- ❌ Invalid DocId format
- ❌ Python keywords in TableId/ColId
- ❌ Reserved prefixes (gristHelper_)

### Test Philosophy

Following MCP best practices:
- ✅ Tests verify tool behavior, not just happy paths
- ✅ Error messages are actionable and guide agents
- ✅ Tests validate that invalid inputs are properly handled
- ✅ Edge cases and boundary conditions are tested
- ✅ Documents actual Grist behavior for agent reference

---

## Continuous Integration

### Pre-commit Checks
```bash
npm run format    # Biome format
npm run lint      # Biome lint
npm run build     # TypeScript compilation
```

### Full Test Run
```bash
npm run check     # Format + Lint
npm run build     # Compile TypeScript
npm test          # Run all tests against Docker
```

### Test Coverage Goals
- ✅ All 15 tools tested
- ✅ All 11 column types tested
- ✅ All widget options tested
- ✅ All CellValue encodings tested
- ✅ Error handling tested
- ✅ Edge cases documented

---

## Common Test Issues

### Docker Issues
**Symptoms:** Connection refused, 401 Unauthorized, 404 Not Found

**Solution:** See **[DOCKER_SETUP.md](DOCKER_SETUP.md)** for:
- Docker container not ready
- API key not working
- Wrong base URL configuration
- Port conflicts
- Volume permission issues

### CellValue Encoding Errors
**Symptom:** 500 errors when adding records

**Solution:** Use encoding helpers from `tests/helpers/cell-values.ts`
```typescript
import { createList, createDate, createDateTime } from './tests/helpers/cell-values.js'

// ❌ WRONG
Tags: ['VIP', 'Active']  // Missing "L" prefix

// ✅ CORRECT
Tags: createList('VIP', 'Active')  // Returns ["L", "VIP", "Active"]
```

---

## Test Maintenance

### Adding New Tests

**1. Create test file:**
```bash
touch tests/my-feature.test.ts
```

**2. Use existing patterns:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestEnvironment, cleanupTestEnvironment } from './helpers/setup.js'

describe('My Feature', () => {
  let testEnv: TestEnvironment

  beforeAll(async () => {
    testEnv = await setupTestEnvironment()
  })

  afterAll(async () => {
    await cleanupTestEnvironment(testEnv)
  })

  it('should test feature X', async () => {
    // Test implementation
  })
})
```

**3. Run specific test:**
```bash
npm test tests/my-feature.test.ts
```

### Updating Test Data

**Keep test data isolated:**
- Create documents per test file
- Clean up after tests (or use test:no-cleanup for debugging)
- Use unique table/column names to avoid conflicts

**Use helpers for complex data:**
- CellValue encoding: Use `createList()`, `createDate()`, etc.
- Widget options: Use shared schema builders
- API calls: Use GristClient methods

---

## Test Results Interpretation

### Success Output
```bash
✓ tests/workspaces.test.ts (15 tests) 2.1s
✓ tests/documents.test.ts (18 tests) 2.4s
✓ tests/tables.test.ts (22 tests) 3.1s
...
Test Files: 17 passed (17)
Tests: 350 passed (350)
Duration: 42.71s
```

### Failure Output
```bash
✖ tests/my-feature.test.ts (1 failed, 9 passed)

FAIL tests/my-feature.test.ts > My Feature > should test X
AssertionError: expected 5 to equal 10

Expected: 10
Received: 5
```

### Debug Failed Tests
```bash
# Run single test file
npm test tests/my-feature.test.ts

# Run with verbose output
npm test -- --reporter=verbose

# Keep test data for inspection
npm run test:no-cleanup
```

---

## Quality Metrics

### Current Status
- **Test Files:** 17 (all passing)
- **Total Tests:** 350 (all passing)
- **Tool Coverage:** 15/15 (100%)
- **Column Type Coverage:** 11/11 (100%)
- **Widget Options Coverage:** All variants tested
- **CellValue Encoding:** All types tested
- **Duration:** ~40s (varies by system)

### Quality Standards Maintained
✅ Zero flaky tests (deterministic)
✅ Fast execution (<1 minute)
✅ Full cleanup (no test pollution)
✅ Clear error messages
✅ Comprehensive edge case coverage

---

## Summary

The Grist MCP Server has **comprehensive test coverage** with:

✅ **350 tests** across 17 test files
✅ **All 15 tools** tested against live Docker Grist
✅ **All 11 column types** with proper CellValue encoding
✅ **Widget options** validated for all types
✅ **Negative tests** documenting edge cases
✅ **Integration tests** for end-to-end workflows

**Status:** Production-ready with excellent test coverage

**Next Steps:**
- Run `npm test` to verify your environment
- Add new tests for new features
- Maintain 100% tool coverage
- Keep test execution fast (<1 minute)

---

**Related Documentation:**
- **Docker setup:** [DOCKER_SETUP.md](DOCKER_SETUP.md)
- **CellValue encoding:** `tests/helpers/cell-values.ts` and `src/encoding/cell-value-helpers.ts`
- **Test patterns:** Existing test files in `tests/` directory
