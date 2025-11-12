# ADR 001: Branded Types at API Boundaries

**Date:** 2025-01-10
**Status:** ✅ Accepted
**Decision:** Use explicit type assertions when converting branded types to plain types at API boundaries

---

## Context

When implementing branded types (e.g., `TableId`, `RowId`) in an MCP server, we need to decide how to handle type conversions when constructing external API types (e.g., Grist `UserAction` tuples).

Two approaches are possible:

```typescript
// Approach A: With type assertion
return ['BulkAddRecord', tableId as string, rowIds as number[], colValues]

// Approach B: Without type assertion (also compiles)
return ['BulkAddRecord', tableId, rowIds, colValues]
```

**Why both compile:** TypeScript's structural type system allows branded types to be assigned to their base types due to covariance. The `[brand]` property is a phantom type marker that exists only at compile-time.

```typescript
type TableId = string & { [brand]: 'TableId' }

const branded: TableId = 'test' as TableId
const plain: string = branded  // ✅ COMPILES - covariant assignment
```

---

## Decision

**Use explicit type assertions (Approach A) when converting branded types to plain types at API boundaries.**

```typescript
// ✅ RECOMMENDED
return ['BulkAddRecord', tableId as string, rowIds as number[], colValues]
```

---

## Rationale

Despite both approaches compiling, type assertions serve **four critical purposes**:

### 1. Explicit Intent Documentation

```typescript
// ❌ WITHOUT ASSERTION - Intent unclear
return ['BulkAddRecord', tableId, rowIds, colValues]
// Is this relying on covariance? Bug? Intentional?

// ✅ WITH ASSERTION - Intent explicit
return ['BulkAddRecord', tableId as string, rowIds as number[], colValues]
// CLEAR: We're intentionally converting branded → plain at API boundary
```

The assertion **documents the conversion** happening at the boundary between your internal type-safe domain and the external API.

### 2. Type Safety Guarantees

Without assertions, you lose type checking in tuple positions:

```typescript
type UserAction = ['BulkAddRecord', string, number[], BulkColValues]

function buildAction(tableId: TableId, rowIds: RowId[]): UserAction {
  // ❌ Without assertion - wrong order compiles!
  return ['BulkAddRecord', rowIds, tableId, colValues]
  //       Tuple type inference is looser without explicit conversions

  // ✅ With assertion - wrong order caught
  return ['BulkAddRecord', rowIds as number[], tableId as string, colValues]
  //                       ^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^
  //                       Type error: position mismatch!
}
```

### 3. Future-Proofing

TypeScript's structural subtyping behavior for branded types could change:
- Future TS versions might tighten inference
- Structural assignability rules might become stricter
- Explicit assertions ensure forward compatibility

### 4. API Boundary Marker

Type assertions serve as **visual markers** in code reviews:

```typescript
export function buildBulkAddRecordAction(
  tableId: TableId,      // ← Internal domain (branded)
  rowIds: RowId[],       // ← Internal domain (branded)
  colValues: BulkColValues
): UserAction {          // ← External API (plain types)
  // Boundary crossing - explicit conversion
  return ['BulkAddRecord', tableId as string, rowIds as number[], colValues]
  //                       ^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^
  //                       API BOUNDARY CONVERSIONS
}
```

---

## Consequences

### Positive

- ✅ **Clear intent**: Boundary conversions are explicit and documented
- ✅ **Type safety**: Tuple position errors are caught
- ✅ **Maintainable**: Future developers understand the conversion
- ✅ **Safe**: No runtime transformation (branded types ARE their base types at runtime)
- ✅ **Standard pattern**: Follows TypeScript branded type best practices

### Negative

- ⚠️ **Slightly more verbose**: Requires `as string` / `as number[]` at boundaries
  - **Mitigation**: This is a feature, not a bug - verbosity adds clarity

### Neutral

- The assertions don't change runtime behavior (branded types are runtime-identical to base types)
- Both approaches compile successfully in strict mode

---

## Implementation Pattern

### ✅ Recommended Pattern

```typescript
// src/services/action-builder.ts

export function buildBulkAddRecordAction(
  tableId: TableId,
  rowIds: (RowId | null)[],
  colValues: BulkColValues
): UserAction {
  return ['BulkAddRecord', tableId as string, rowIds as (number | null)[], colValues]
}

export function buildBulkUpdateRecordAction(
  tableId: TableId,
  rowIds: RowId[],
  updates: Partial<GristRecordData>
): UserAction {
  const colValues: BulkColValues = { /* ... */ }
  return ['BulkUpdateRecord', tableId as string, rowIds as number[], colValues]
}

export function buildBulkRemoveRecordAction(
  tableId: TableId,
  rowIds: RowId[]
): UserAction {
  return ['BulkRemoveRecord', tableId as string, rowIds as number[]]
}
```

### Decision Matrix

| Scenario | Use Assertion? | Reason |
|----------|---------------|---------|
| Internal → External API | ✅ YES | Document boundary, ensure intent |
| External → Internal | ❌ NO | Use validation function (e.g., `toTableId()`) |
| Internal → Internal | ❌ NO | Keep branded types throughout |
| External → External | ❌ NO | No branded types involved |

### Complete Flow Example

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

---

## TypeScript Behavior Reference

### Covariance of Branded Types (Allowed)

```typescript
declare const brand: unique symbol
type Brand<T, TBrand> = T & { [brand]: TBrand }

type TableId = Brand<string, 'TableId'>
type RowId = Brand<number, 'RowId'>

// ✅ These ALL compile in strict mode:
const t1: TableId = 'test' as TableId
const p1: string = t1  // Covariant: branded → plain

const r1: RowId = 123 as RowId
const p2: number = r1  // Covariant: branded → plain

const arr1: RowId[] = [r1]
const arr2: number[] = arr1  // Covariant: branded[] → plain[]
```

### Contravariance (Reverse) Fails (Expected)

```typescript
// ❌ These FAIL (as expected):
const plain: string = 'test'
const branded: TableId = plain  // Error: Type 'string' is not assignable to type 'TableId'

const plainArr: number[] = [1, 2, 3]
const brandedArr: RowId[] = plainArr  // Error: Type 'number[]' is not assignable to type 'RowId[]'
```

This asymmetry is **intentional** and **correct** for branded types:
- **Internal → External** (covariant): Allowed (safe, intentional)
- **External → Internal** (contravariant): Forbidden (unsafe, requires validation)

---

## Alternatives Considered

### ❌ Alternative 1: Skip Assertions "Because It Compiles"

```typescript
// ❌ REJECTED - Compiles but loses intent
return ['BulkAddRecord', tableId, rowIds, colValues]
```

**Rejected because:**
- Intent is unclear
- No visual boundary marker
- Future TypeScript changes could break
- Harder to maintain

### ❌ Alternative 2: Generic UserAction Types

```typescript
// ❌ REJECTED - Leaks internal types to external API
type BulkAddRecord<TId = string, RId = number> =
  ['BulkAddRecord', TId, Array<RId | null>, BulkColValues]
```

**Rejected because:**
- External Grist API doesn't accept branded types
- Adds unnecessary complexity
- Doesn't solve the underlying issue

### ❌ Alternative 3: Generic Constraints

```typescript
// ❌ REJECTED - Overly complex, doesn't solve the problem
function buildBulkAddRecordAction<T extends string>(
  tableId: T,
  // ...
): BulkAddRecord {
  return ['BulkAddRecord', tableId, ...]  // Still need assertion!
}
```

**Rejected because:**
- Adds unnecessary type parameters
- Still requires assertions
- Increases complexity without benefit

---

## Related Files

- `src/types/advanced.ts` - Branded type definitions
- `src/services/action-builder.ts` - API boundary conversions (uses assertions)
- `src/tools/*.ts` - Entry points (use validation functions)

---

## References

- **TypeScript Handbook**: [Symbols and Brands](https://www.typescriptlang.org/docs/handbook/symbols.html)
- **Branded Types Article**: [Flavoring: Flexible Nominal Typing for TypeScript](https://spin.atomicobject.com/2018/01/15/typescript-flexible-nominal-typing/)
- **MCP Best Practices**: Use branded types internally, plain types at boundaries
- **Domain-Driven Design**: Bounded contexts with explicit boundary conversions

---

## Quick Reference

| Question | Answer |
|----------|--------|
| Does Approach B (no assertion) compile? | ✅ YES - branded types are covariant |
| Is Approach A (with assertion) correct? | ✅ YES - this is the recommended pattern |
| Are assertions safe? | ✅ YES - no runtime transformation |
| Should we keep using assertions? | ✅ YES - for clarity and maintainability |

---

**Decision confirmed:** Continue using explicit type assertions at API boundaries in `src/services/action-builder.ts`.
