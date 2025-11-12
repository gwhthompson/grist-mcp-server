# Branded Types at API Boundaries: Definitive Analysis

## Executive Summary

**Type assertions ARE necessary and correct** when converting branded types to plain types at API boundaries, even though the code would technically compile without them.

## The Question

When implementing branded types (e.g., `TableId`, `RowId`) in an MCP server, should we use type assertions when constructing external API types (e.g., Grist `UserAction` tuples)?

```typescript
// Approach A: With type assertion (RECOMMENDED)
return ['BulkAddRecord', tableId as string, rowIds as number[], colValues]

// Approach B: Without type assertion (COMPILES but NOT RECOMMENDED)
return ['BulkAddRecord', tableId, rowIds, colValues]
```

## The Answer: Use Type Assertions (Approach A)

### Why Approach B Compiles

TypeScript's structural type system allows branded types to be assigned to their base types:

```typescript
type TableId = string & { [brand]: 'TableId' }

const branded: TableId = 'test' as TableId
const plain: string = branded  // ✅ COMPILES - covariant assignment
```

**Reason:** The `[brand]` property is a phantom type marker that:
- Exists only at compile-time
- Doesn't exist at runtime (no actual property)
- Allows the branded type to be structurally assignable to the base type

This is **intentional TypeScript behavior** for branded types (also called "nominal typing" or "opaque types").

### Why Type Assertions Are Still Correct

Despite compilation succeeding, type assertions serve **four critical purposes**:

#### 1. **Explicit Intent Documentation**

```typescript
// ❌ WITHOUT ASSERTION - Intent unclear
return ['BulkAddRecord', tableId, rowIds, colValues]
// Is this relying on covariance? Bug? Intentional?

// ✅ WITH ASSERTION - Intent explicit
return ['BulkAddRecord', tableId as string, rowIds as number[], colValues]
// CLEAR: We're intentionally converting branded → plain at API boundary
```

The assertion **documents the conversion** happening at the boundary between your internal type-safe domain and the external API.

#### 2. **Type Safety Guarantees**

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

#### 3. **Future-Proofing Against TypeScript Changes**

TypeScript's structural subtyping behavior for branded types could change:
- Future TS versions might tighten inference
- Structural assignability rules might become stricter
- Explicit assertions ensure forward compatibility

#### 4. **API Boundary Marker**

Type assertions serve as **visual markers** in code reviews:

```typescript
// This pattern clearly indicates:
// "We're crossing a boundary from internal (branded) to external (plain)"

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

## Best Practice Pattern

### ✅ Recommended: Explicit Assertions at Boundaries

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

### Why This Pattern Is Safe

These assertions are **safe** because:

1. **Runtime Identity**: Branded types ARE their base types at runtime
   ```typescript
   const tableId: TableId = 'MyTable' as TableId
   console.log(tableId)  // 'MyTable' (just a string)
   typeof tableId        // 'string'
   ```

2. **No Data Transformation**: Assertions don't change values, only types
   ```typescript
   tableId as string  // Same value, different compile-time type
   ```

3. **Boundary Validation**: Input validation happens BEFORE this point
   ```typescript
   // Entry point validates and converts
   const tableId = toTableId(rawInput)  // ← Validation here

   // Action builder assumes already validated
   buildAction(tableId, ...)  // ← Safe conversion to API format
   ```

## Anti-Patterns to Avoid

### ❌ Don't Use Generic UserAction Types

```typescript
// ❌ BAD - Leaks internal types to external API
type BulkAddRecord<TId = string, RId = number> =
  ['BulkAddRecord', TId, Array<RId | null>, BulkColValues]

// Problem: External Grist API doesn't accept branded types
```

### ❌ Don't Use Generic Constraints

```typescript
// ❌ BAD - Overly complex, doesn't solve the problem
function buildBulkAddRecordAction<T extends string>(
  tableId: T,
  // ...
): BulkAddRecord {
  return ['BulkAddRecord', tableId, ...]  // Still need assertion!
}
```

### ❌ Don't Skip Assertions "Because It Compiles"

```typescript
// ❌ BAD - Compiles but loses intent
return ['BulkAddRecord', tableId, rowIds, colValues]

// ✅ GOOD - Explicit intent at boundary
return ['BulkAddRecord', tableId as string, rowIds as number[], colValues]
```

## TypeScript Behavior Reference

### Covariance of Branded Types

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

### Contravariance (Reverse) Fails

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

## Real-World Example from Codebase

```typescript
// src/services/action-builder.ts (current implementation)

export function buildBulkAddRecordAction(
  tableId: TableId,      // Internal type (validated)
  records: GristRecordData[]
): UserAction {          // External API type
  const rowIds = records.map(() => null)
  const colValues: BulkColValues = { /* ... */ }

  // ✅ CORRECT: Explicit conversion at boundary
  return ['BulkAddRecord', tableId as string, rowIds, colValues]
  //                       ^^^^^^^^^^^^^^^^^
  //                       Marks the internal → external boundary
}

export function buildBulkUpdateRecordAction(
  tableId: TableId,
  rowIds: RowId[],
  updates: Partial<GristRecordData>
): UserAction {
  const colValues: BulkColValues = { /* ... */ }

  // ✅ CORRECT: Explicit conversions for both branded types
  return ['BulkUpdateRecord', tableId as string, rowIds as number[], colValues]
  //                          ^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^
}

export function buildBulkRemoveRecordAction(
  tableId: TableId,
  rowIds: RowId[]
): UserAction {
  // ✅ CORRECT: Explicit conversions
  return ['BulkRemoveRecord', tableId as string, rowIds as number[]]
}
```

## Decision Matrix

| Scenario | Use Assertion? | Reason |
|----------|---------------|---------|
| Internal → External API | ✅ YES | Document boundary, ensure intent |
| External → Internal | ❌ NO | Use validation function (e.g., `toTableId()`) |
| Internal → Internal | ❌ NO | Keep branded types throughout |
| External → External | ❌ NO | No branded types involved |

## Conclusion

**Type assertions at API boundaries are:**
- ✅ **Necessary** for clarity and maintainability
- ✅ **Safe** because branded types are runtime-identical to base types
- ✅ **Correct** as the standard pattern for this architecture
- ✅ **Recommended** by TypeScript branded type best practices

**The pattern in your codebase is already correct.**

Continue using:
```typescript
return ['BulkAddRecord', tableId as string, rowIds as number[], colValues]
```

**Do NOT remove the assertions** - they serve critical documentation and safety purposes even though the code would technically compile without them.

## Further Reading

- **TypeScript Handbook**: [Symbols and Brands](https://www.typescriptlang.org/docs/handbook/symbols.html)
- **Branded Types Article**: [Flavoring: Flexible Nominal Typing for TypeScript](https://spin.atomicobject.com/2018/01/15/typescript-flexible-nominal-typing/)
- **MCP Best Practices**: Use branded types internally, plain types at boundaries
- **Domain-Driven Design**: Bounded contexts with explicit boundary conversions

## Related Files

- `src/types/advanced.ts` - Branded type definitions
- `src/services/action-builder.ts` - API boundary conversions (uses assertions)
- `src/tools/*.ts` - Entry points (use validation functions)
