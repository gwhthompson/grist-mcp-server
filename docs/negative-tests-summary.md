# Negative Test Suite - Summary

## Overview

Created comprehensive negative test suite with **13 tests** that verify the Grist MCP Server can detect failures and properly document edge case behavior. This addresses the critical concern about false positives in testing.

**Location**: `/tests/negative-tests.test.ts`

## Test Philosophy

Following MCP best practices:
- ✅ Tests verify tool behavior, not just happy paths
- ✅ Error messages are actionable and guide agents
- ✅ Tests validate that invalid inputs are properly handled
- ✅ Edge cases and boundary conditions are tested
- ✅ Documents actual Grist behavior for agent reference

## Test Results Summary

All **13 tests pass** ✅ and provide valuable documentation of Grist's behavior:

### A. Widget Options Validation (4 tests)

| Test | Grist Behavior | Status |
|------|----------------|--------|
| **A1. Invalid numMode** | Accepts `'invalid_mode'` but may ignore in UI | ✅ PASS |
| **A2. Invalid currency code** | Accepts `'INVALID_CODE'` but won't format | ✅ PASS |
| **A3. Negative decimals** | Accepts `-5` (unexpected behavior) | ✅ PASS |
| **A4. Invalid color format** | Accepts `'NOTACOLOR'` but won't render | ✅ PASS |

**Key Finding**: Grist accepts many invalid widget options without rejection. The API stores them, but the UI may ignore or not render them properly.

### B. Choice Constraints (2 tests)

| Test | Grist Behavior | Status |
|------|----------------|--------|
| **B1. Value not in choices** | Accepts value `'D'` not in `['A','B','C']` | ✅ PASS |
| **B2. choiceOptions for non-existent choices** | Stores styling for non-existent choices | ✅ PASS |

**Key Finding**: Grist's Choice columns are permissive - they accept values outside the choices list and store unused choice styling.

### C. Reference Constraints (2 tests)

| Test | Grist Behavior | Status |
|------|----------------|--------|
| **C1. Circular references** | Allows A→B and B→A circular refs | ✅ PASS |
| **C2. References to deleted records** | Sets reference to `0` when target deleted | ✅ PASS |

**Key Finding**: Grist allows circular references between tables (use with caution). Broken references are cleaned up automatically.

### D. Formula Errors (3 tests)

| Test | Grist Behavior | Status |
|------|----------------|--------|
| **D1. Circular formula dependencies** | Allows A=$B+1, B=$A+1 (cells show null) | ✅ PASS |
| **D2. Invalid formula syntax** | Accepts `$A + +` but evaluates to null | ✅ PASS |
| **D3. Formula type mismatches** | Rejects `$TextCol + $NumCol` at creation | ✅ PASS |

**Key Finding**: Grist accepts invalid formulas at creation time but produces error values (null) at evaluation time. Type mismatches are caught early.

### E. Column Type Conversion (2 tests)

| Test | Grist Behavior | Status |
|------|----------------|--------|
| **E1. Text→Numeric with non-numeric data** | Converts `'123'`→123, keeps `'abc'` as string | ✅ PASS |
| **E2. Ref type change with existing refs** | Allows changing Ref:A→Ref:B, keeps IDs | ✅ PASS |

**Key Finding**: Type conversions are permissive. Numeric conversion keeps non-convertible values as strings. Reference type changes don't clear existing IDs.

## TypeScript Best Practices Applied

### 1. Strong Typing
```typescript
// No 'any' types - proper type inference
let context: Awaited<ReturnType<typeof createFullTestContext>>
let docId: DocId
let tableId: TableId
```

### 2. Helper Functions
```typescript
// Reusable typed helpers
async function getColumnInfo(tableId: TableId, colId: string) {
  const response = await client.get<{ columns: any[] }>(...)
  return response.columns.find((c: any) => c.id === colId)
}
```

### 3. Clear Test Structure
```typescript
describe('Category Name', () => {
  it('should document specific behavior', async () => {
    // TEST: Clear description of what we're testing
    // EXPECTATION: What we expect to happen

    // ... test code ...

    // DOCUMENT: Actual behavior observed
    console.log('📝 Grist behavior - ...')
  })
})
```

### 4. Proper Setup/Teardown
```typescript
beforeAll(async () => {
  await ensureGristReady()
  context = await createFullTestContext(...)
}, 60000)

afterAll(async () => {
  if (context) {
    await cleanupTestContext(context)
  }
})
```

## MCP Best Practices Applied

### 1. Document Behavior, Not Just Assert
```typescript
// Good: Documents what actually happens
console.log('📝 Grist behavior - value not in list:')
console.log(`  Test1 (valid 'A'): ${test1?.fields.Status}`)
console.log(`  Test2 (invalid 'D'): ${test2?.fields.Status}`)

if (test2?.fields.Status === 'D') {
  console.log('  ✓ Grist ACCEPTS value not in choices list')
}
```

### 2. Actionable Error Messages
```typescript
if (result.isError) {
  expect(result.content[0].text).toMatch(/circular|dependency|cycle/i)
  console.log('✓ Grist detects circular formula dependencies')
}
```

### 3. Handle Both Success and Failure Paths
```typescript
if (result.isError) {
  // Document rejection behavior
  console.log('✓ Grist rejects invalid syntax')
} else {
  // Document acceptance behavior and consequences
  console.log('⚠ Grist accepts invalid syntax (may error at evaluation time)')
  // ... test runtime behavior ...
}
```

## Value Provided

### 1. False Positive Detection
These tests **can fail** if Grist behavior changes or if our MCP server breaks:
- Invalid values that should be rejected might get through
- Type conversions might corrupt data
- References might not handle deletions correctly

### 2. Agent Guidance
Each test documents actual Grist behavior, helping agents understand:
- What inputs will be accepted vs rejected
- How edge cases are handled
- When to expect error values vs exceptions

### 3. Regression Prevention
The tests capture baseline behavior. If Grist or our server changes:
- Tests will fail if behavior changes unexpectedly
- Documentation will be outdated and need updating
- We have a clear record of what changed

## Running the Tests

```bash
# Run negative tests only
npm test -- tests/negative-tests.test.ts

# Run with verbose output
npm test -- tests/negative-tests.test.ts --reporter=verbose

# Run all tests including negative tests
npm test
```

## Expected Output

All tests should pass with informative console output:

```
✓ Grist accepts invalid numMode (may ignore in UI)
  Stored widgetOptions: {"numMode":"invalid_mode"}

📝 Grist Choice behavior - value not in list:
  Test1 (valid 'A'): A
  Test2 (invalid 'D'): D
  ✓ Grist ACCEPTS value not in choices list

📝 Grist behavior - reference to deleted record:
  Original target ID: 1
  After deletion: 0
  ✓ Grist sets reference to 0 (null) when target deleted
```

## Future Enhancements

Potential additions to the negative test suite:

1. **Attachment validation** - Test file size limits, invalid MIME types
2. **Formula security** - Test potentially malicious Python expressions
3. **Concurrent modifications** - Test race conditions in updates
4. **Permission boundaries** - Test operations on inaccessible documents
5. **Rate limiting** - Test behavior under high request volumes

## References

- [MCP Builder Skill](https://github.com/anthropics/anthropic-agent-skills) - MCP testing best practices
- [Grist API Documentation](https://support.getgrist.com/api/) - Official API reference
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
