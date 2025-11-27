# Exploratory Tests

This directory contains **exploratory tests** that document **undocumented Grist API behavior** not covered in the official Grist API documentation.

## Purpose

These tests are NOT part of the regular test suite. They:
1. **Document actual Grist API behavior** (what formats are accepted/returned)
2. **Serve as reference** when debugging edge cases
3. **Validate assumptions** about Grist's internal encoding
4. **Test the raw Grist API directly** (bypassing the MCP layer)

## When to Run

Run these tests manually when you need to:
- Verify how Grist handles a specific data type
- Debug unexpected encoding/decoding behavior
- Understand what formats Grist accepts vs. returns
- Investigate API edge cases

## Running Exploratory Tests

```bash
# Start Grist container manually
docker run -d --name grist-mcp-test -p 8989:8484 \
  -e GRIST_BOOT_KEY=test_boot_key \
  -e GRIST_FORCE_LOGIN=true \
  -e GRIST_DEFAULT_EMAIL=test@example.com \
  -e GRIST_SINGLE_ORG=example \
  gristlabs/grist:latest

# Wait and bootstrap API key
sleep 10
API_KEY=$(curl -sf http://localhost:8989/api/profile/apiKey -H "x-boot-key: test_boot_key" | tr -d '"')
export GRIST_API_KEY=$API_KEY
export GRIST_BASE_URL=http://localhost:8989

# Run a specific exploratory test
tsx tests/exploratory/grist-raw-api-datetime-test.ts
tsx tests/exploratory/grist-raw-api-reference-test.ts
tsx tests/exploratory/test-upsert-api.ts

# Cleanup
docker rm -f grist-mcp-test
```

## Test Files

### `grist-raw-api-datetime-test.ts`
**Documents:** Date and DateTime column behavior

**Key Findings:**
- Grist ACCEPTS plain timestamps for Date columns (e.g., `1705276800`)
- Grist ACCEPTS encoded format for Date (e.g., `['d', 1705276800]`)
- Grist ACCEPTS plain timestamps for DateTime columns
- Grist ACCEPTS encoded format for DateTime (e.g., `['D', 1705320600, 'UTC']`)
- Grist RETURNS **plain timestamps** for both Date and DateTime (NOT encoded arrays)

**Why Important:** The official docs don't specify which formats are accepted on input vs. returned on output.

### `grist-raw-api-reference-test.ts`
**Documents:** Reference and RefList column behavior

**Key Findings:**
- Grist ACCEPTS plain numbers for Ref columns (e.g., `456`)
- Grist REJECTS plain arrays for RefList (e.g., `[1, 2, 3]`)
- Grist ACCEPTS encoded format for RefList (e.g., `['L', 1, 2, 3]`)
- Grist RETURNS plain numbers for Ref (NOT encoded)
- Grist RETURNS encoded arrays for RefList (e.g., `['L', 1, 2, 3]`)
- Null references return `0`, not `null`
- Empty RefList returns `null`, not `['L']`

**Why Important:** RefList encoding is asymmetric (requires encoding on input, already encoded on output).

### `test-upsert-api.ts`
**Documents:** Upsert API edge cases

**Key Findings:**
- Upsert uses `require` field for matching existing records
- Upsert returns response with updated record IDs
- Case-sensitivity and whitespace matter in `require` field matching

**Why Important:** Helps debug why upsert might create duplicates instead of updating.

## Relationship to Integration Tests

**Integration tests** (in `tests/integration/`) verify the **MCP server's behavior** - they test the complete pipeline including preprocessing, validation, and encoding.

**Exploratory tests** verify **Grist's raw API behavior** - they bypass the MCP server entirely and test Grist directly.

### When to Add New Exploratory Tests

Add a new exploratory test when:
1. You discover undocumented Grist API behavior
2. Official Grist docs are ambiguous or incomplete
3. You need to verify assumptions about encoding formats
4. You're debugging an edge case and want to isolate Grist's behavior

### When NOT to Add Exploratory Tests

Don't add exploratory tests for:
1. Testing MCP tool behavior (use integration tests)
2. Testing validation logic (use unit tests)
3. Testing documented Grist API features (use contract tests)

## Maintenance

These tests:
- Are NOT run by `npm test` (excluded from vitest config)
- Should be run manually when needed
- May need updates if Grist API changes
- Should remain minimal (2-5 files max)

## See Also

- `docs/GRIST_API_BEHAVIOR.md` - Consolidated findings from exploratory tests
- `tests/integration/` - Full MCP server workflow tests
- `tests/contract/` - Grist API compatibility tests
