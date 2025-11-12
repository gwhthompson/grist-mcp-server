# Type Assertion Decision: Branded Types at API Boundaries

## TL;DR

**✅ Type assertions ARE necessary and correct** when converting branded types to plain types at API boundaries.

```typescript
// ✅ CORRECT - Continue using this pattern
return ['BulkAddRecord', tableId as string, rowIds as number[], colValues]

// ❌ AVOID - Compiles but loses clarity
return ['BulkAddRecord', tableId, rowIds, colValues]
```

## Quick Reference

| Question | Answer |
|----------|--------|
| Does Approach B (no assertion) compile? | ✅ YES - branded types are covariant |
| Is Approach A (with assertion) correct? | ✅ YES - this is the recommended pattern |
| Are assertions safe? | ✅ YES - no runtime transformation |
| Should we keep using assertions? | ✅ YES - for clarity and maintainability |

## Why Both Compile

TypeScript's structural type system allows:

```typescript
type TableId = string & { [brand]: 'TableId' }

const branded: TableId = 'test' as TableId
const plain: string = branded  // ✅ Covariant assignment - compiles
```

The `[brand]` property is a **phantom type** that:
- Exists only at compile-time
- Doesn't exist at runtime
- Allows structural assignability to base type

## Why Use Assertions Anyway

### 1. **Explicit Intent**
```typescript
// Clear: "We're crossing an API boundary"
return ['BulkAddRecord', tableId as string, rowIds as number[], colValues]

// Unclear: "Is this intentional? A bug? Relying on covariance?"
return ['BulkAddRecord', tableId, rowIds, colValues]
```

### 2. **Visual Boundary Marker**
```typescript
export function buildBulkAddRecordAction(
  tableId: TableId,      // ← Internal domain (branded)
  rowIds: RowId[],       // ← Internal domain (branded)
  colValues: BulkColValues
): UserAction {          // ← External API (plain)
  // Assertions mark the boundary crossing
  return ['BulkAddRecord', tableId as string, rowIds as number[], colValues]
  //                       ^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^
  //                       BOUNDARY CONVERSIONS
}
```

### 3. **Future-Proofing**
- TypeScript's structural assignability rules could change
- Explicit assertions ensure forward compatibility
- Makes intent clear even if TS behavior evolves

### 4. **Code Review Clarity**
- Assertions signal "intentional conversion"
- Easier to spot unintentional type mixing
- Documents architectural decisions

## Verification Test

The file `test-branded-api-boundary.ts` demonstrates:

✅ Approach B (no assertions) **does compile**
✅ Approach A (with assertions) **is recommended**
✅ Covariance (branded → plain) **is allowed**
❌ Contravariance (plain → branded) **is forbidden**
✅ Runtime behavior **is identical**

## Pattern to Follow

```typescript
// Entry point: Validate and convert to branded types
const tableId = toTableId(rawTableId)  // Validation + branding
const rowIds = rawRowIds.map(toRowId)  // Validation + branding

// Internal: Use branded types throughout
const result = await someInternalFunction(tableId, rowIds)

// API boundary: Explicit conversion to plain types
return ['BulkAddRecord', tableId as string, rowIds as number[], colValues]
//                       ^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^
//                       Internal → External conversion
```

## Decision Matrix

| Context | Pattern | Reason |
|---------|---------|--------|
| **Internal → External API** | Use assertions | Mark boundary, document intent |
| **External → Internal** | Use validation functions | Ensure type safety |
| **Internal → Internal** | No conversion | Keep branded types |
| **External → External** | No conversion | No branded types |

## Examples from Codebase

```typescript
// src/services/action-builder.ts - Current implementation (CORRECT)

export function buildBulkAddRecordAction(
  tableId: TableId,
  records: GristRecordData[]
): UserAction {
  const rowIds = records.map(() => null)
  const colValues: BulkColValues = { /* ... */ }

  return ['BulkAddRecord', tableId as string, rowIds, colValues]
  //                       ^^^^^^^^^^^^^^^^^  ✅ Explicit boundary conversion
}

export function buildBulkUpdateRecordAction(
  tableId: TableId,
  rowIds: RowId[],
  updates: Partial<GristRecordData>
): UserAction {
  const colValues: BulkColValues = { /* ... */ }

  return ['BulkUpdateRecord', tableId as string, rowIds as number[], colValues]
  //                          ^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^  ✅ Both converted
}

export function buildBulkRemoveRecordAction(
  tableId: TableId,
  rowIds: RowId[]
): UserAction {
  return ['BulkRemoveRecord', tableId as string, rowIds as number[]]
  //                          ^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^  ✅ Explicit conversions
}
```

## Alternatives Considered

### ❌ Generic UserAction Types
```typescript
// Doesn't work - external API doesn't accept branded types
type BulkAddRecord<TId = string, RId = number> =
  ['BulkAddRecord', TId, Array<RId | null>, BulkColValues]
```

### ❌ Generic Constraints
```typescript
// Overly complex, doesn't solve the problem
function buildBulkAddRecordAction<T extends string>(
  tableId: T,
  // ...
): BulkAddRecord {
  return ['BulkAddRecord', tableId, ...]  // Still need assertion!
}
```

### ✅ Current Pattern (Recommended)
```typescript
// Simple, clear, explicit
function buildBulkAddRecordAction(
  tableId: TableId,
  rowIds: (RowId | null)[],
  colValues: BulkColValues
): UserAction {
  return ['BulkAddRecord', tableId as string, rowIds as (number | null)[], colValues]
}
```

## Final Recommendation

**Continue using the current pattern in `src/services/action-builder.ts`:**

1. ✅ Type assertions are **safe** (no runtime transformation)
2. ✅ Type assertions are **clear** (document boundary crossings)
3. ✅ Type assertions are **correct** (standard TS pattern)
4. ✅ Type assertions are **maintainable** (explicit intent)

**Do NOT remove the assertions** - they serve critical purposes beyond compilation.

## Related Documentation

- `docs/BRANDED_TYPES_API_BOUNDARY.md` - Complete analysis
- `test-branded-api-boundary.ts` - Verification tests
- `src/types/advanced.ts` - Branded type definitions
- `src/services/action-builder.ts` - Production implementation

---

**Date:** 2025-01-10
**Status:** ✅ CONFIRMED - Current implementation is correct
