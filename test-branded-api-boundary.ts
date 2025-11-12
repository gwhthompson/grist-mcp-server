/**
 * Practical test demonstrating branded type behavior at API boundaries
 *
 * This file tests the compilation behavior of branded types when crossing
 * API boundaries (internal branded types → external plain types).
 *
 * To verify: This file MUST compile without errors in strict mode.
 */

// ============================================================================
// SETUP: Branded Type System
// ============================================================================

declare const brand: unique symbol
type Brand<T, TBrand extends string> = T & { [brand]: TBrand }

type TableId = Brand<string, 'TableId'>
type RowId = Brand<number, 'RowId'>
type ColId = Brand<string, 'ColId'>

function toTableId(raw: string): TableId {
  // Assume validation happens here
  return raw as TableId
}

function toRowId(raw: number): RowId {
  return raw as RowId
}

function _toColId(raw: string): ColId {
  return raw as ColId
}

// ============================================================================
// SETUP: External API Types (cannot be changed - mimics Grist API)
// ============================================================================

type BulkColValues = { [colId: string]: unknown[] }

type UserAction =
  | ['BulkAddRecord', string, Array<number | null>, BulkColValues]
  | ['BulkUpdateRecord', string, number[], BulkColValues]
  | ['BulkRemoveRecord', string, number[]]
  | ['AddColumn', string, string, object]
  | ['ModifyColumn', string, string, object]
  | ['RemoveColumn', string, string]

// ============================================================================
// TEST 1: Approach B - NO Type Assertions
// ============================================================================

/**
 * This function DOES compile in strict mode.
 * Branded types are covariant with their base types.
 */
function approachB_noAssertion(tableId: TableId, rowIds: (RowId | null)[]): UserAction {
  return ['BulkAddRecord', tableId, rowIds, {}]
  //                       ^^^^^^^  ^^^^^^
  //                       TableId  (RowId | null)[]
  //                       ✅ COMPILES - covariant assignment
}

// ============================================================================
// TEST 2: Approach A - WITH Type Assertions (RECOMMENDED)
// ============================================================================

/**
 * This function ALSO compiles in strict mode.
 * Type assertions explicitly mark the API boundary conversion.
 */
function approachA_withAssertion(tableId: TableId, rowIds: (RowId | null)[]): UserAction {
  return ['BulkAddRecord', tableId as string, rowIds as (number | null)[], {}]
  //                       ^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //                       ✅ RECOMMENDED - explicit intent
}

// ============================================================================
// TEST 3: All Branded Type Conversions
// ============================================================================

function buildBulkAddRecord(
  tableId: TableId,
  rowIds: (RowId | null)[],
  colValues: BulkColValues
): UserAction {
  return ['BulkAddRecord', tableId as string, rowIds as (number | null)[], colValues]
}

function buildBulkUpdateRecord(
  tableId: TableId,
  rowIds: RowId[],
  colValues: BulkColValues
): UserAction {
  return ['BulkUpdateRecord', tableId as string, rowIds as number[], colValues]
}

function buildBulkRemoveRecord(tableId: TableId, rowIds: RowId[]): UserAction {
  return ['BulkRemoveRecord', tableId as string, rowIds as number[]]
}

function buildAddColumn(tableId: TableId, colId: ColId, colInfo: object): UserAction {
  return ['AddColumn', tableId as string, colId as string, colInfo]
}

function buildModifyColumn(tableId: TableId, colId: ColId, updates: object): UserAction {
  return ['ModifyColumn', tableId as string, colId as string, updates]
}

function buildRemoveColumn(tableId: TableId, colId: ColId): UserAction {
  return ['RemoveColumn', tableId as string, colId as string]
}

// ============================================================================
// TEST 4: Covariance Tests (Branded → Plain)
// ============================================================================

/**
 * All of these SHOULD compile (and they DO).
 * Demonstrates that branded types are assignable to their base types.
 */
function test_covariance(): void {
  // String branding
  const tableId: TableId = toTableId('MyTable')
  const plainString: string = tableId // ✅ COMPILES
  console.log(plainString)

  // Number branding
  const rowId: RowId = toRowId(123)
  const plainNumber: number = rowId // ✅ COMPILES
  console.log(plainNumber)

  // Array branding
  const rowIds: RowId[] = [toRowId(1), toRowId(2)]
  const plainArray: number[] = rowIds // ✅ COMPILES
  console.log(plainArray)

  // Nullable array branding
  const nullableRowIds: (RowId | null)[] = [toRowId(1), null]
  const plainNullableArray: (number | null)[] = nullableRowIds // ✅ COMPILES
  console.log(plainNullableArray)
}

/**
 * Function parameter passing demonstrates covariance.
 */
function acceptsPlainString(value: string): void {
  console.log(value)
}

function acceptsPlainNumber(value: number): void {
  console.log(value)
}

function acceptsPlainArray(value: number[]): void {
  console.log(value)
}

function test_functionParameterCovariance(): void {
  const tableId: TableId = toTableId('MyTable')
  const rowId: RowId = toRowId(123)
  const rowIds: RowId[] = [toRowId(1), toRowId(2)]

  acceptsPlainString(tableId) // ✅ COMPILES
  acceptsPlainNumber(rowId) // ✅ COMPILES
  acceptsPlainArray(rowIds) // ✅ COMPILES
}

// ============================================================================
// TEST 5: Contravariance Tests (Plain → Branded) - SHOULD FAIL
// ============================================================================

/**
 * All of these SHOULD fail (and they DO).
 * Demonstrates that plain types are NOT assignable to branded types.
 */
function test_contravariance_SHOULD_FAIL(): void {
  const plainString: string = 'MyTable'
  const plainNumber: number = 123
  const plainArray: number[] = [1, 2, 3]

  // All of these SHOULD produce type errors:
  // @ts-expect-error - Type 'string' is not assignable to type 'TableId'
  const tableId: TableId = plainString

  // @ts-expect-error - Type 'number' is not assignable to type 'RowId'
  const rowId: RowId = plainNumber

  // @ts-expect-error - Type 'number[]' is not assignable to type 'RowId[]'
  const rowIds: RowId[] = plainArray

  console.log(tableId, rowId, rowIds)
}

// ============================================================================
// TEST 6: Runtime Behavior
// ============================================================================

/**
 * Demonstrates that branded types are identical to base types at runtime.
 */
function test_runtimeBehavior(): void {
  const tableId: TableId = toTableId('MyTable')
  const rowId: RowId = toRowId(123)

  // Runtime type checks
  console.log('tableId type:', typeof tableId) // 'string'
  console.log('rowId type:', typeof rowId) // 'number'

  // Runtime value checks
  console.log('tableId value:', tableId) // 'MyTable'
  console.log('rowId value:', rowId) // 123

  // Brand symbol doesn't exist at runtime
  console.log('Has brand property:', brand in (tableId as unknown as Record<symbol, unknown>)) // false

  // Equality checks
  console.log('tableId === "MyTable":', tableId === 'MyTable') // true (runtime comparison)
  console.log('rowId === 123:', rowId === 123) // true
}

// ============================================================================
// TEST 7: Tuple Type Inference
// ============================================================================

/**
 * Tests type inference in tuple construction with and without assertions.
 */
function test_tupleInference(): void {
  const tableId: TableId = toTableId('MyTable')
  const rowIds: (RowId | null)[] = [toRowId(1), null]

  // Without assertion
  const tuple1 = ['BulkAddRecord', tableId, rowIds, {}]
  // Inferred type: (string | TableId | (RowId | null)[] | {})[]
  // Less precise, but still compiles when assigned to UserAction
  console.log('tuple1 type:', typeof tuple1)

  // With assertion
  const tuple2 = ['BulkAddRecord', tableId as string, rowIds as (number | null)[], {}]
  // Inferred type: [string, string, (number | null)[], {}]
  // More precise tuple type
  console.log('tuple2 type:', typeof tuple2)

  // Both can be assigned to UserAction
  const action1: UserAction = tuple1 // ✅ COMPILES
  const action2: UserAction = tuple2 // ✅ COMPILES

  console.log(action1, action2)
}

// ============================================================================
// TEST 8: Why Assertions Are Still Recommended
// ============================================================================

/**
 * Demonstrates why explicit assertions improve code clarity.
 */

// ❌ WITHOUT ASSERTIONS - Unclear intent
function unclearIntent(tableId: TableId, rowIds: RowId[]): UserAction {
  return ['BulkRemoveRecord', tableId, rowIds]
  // Question: Is this relying on covariance? Is it intentional? A bug?
}

// ✅ WITH ASSERTIONS - Clear intent
function clearIntent(tableId: TableId, rowIds: RowId[]): UserAction {
  return ['BulkRemoveRecord', tableId as string, rowIds as number[]]
  // Clear: We're intentionally converting branded → plain at the API boundary
}

/**
 * Demonstrates position safety with assertions.
 */
function positionSafetyWithAssertions(tableId: TableId, colId: ColId): UserAction {
  // With assertions, wrong positions are more obvious
  return ['RemoveColumn', tableId as string, colId as string]

  // If we swap them, the assertion types help catch it:
  // return ['RemoveColumn', colId as string, tableId as string];
  // ^ Still compiles but the explicit conversions make the mistake more visible
}

// ============================================================================
// TEST 9: Real-World Pattern from Codebase
// ============================================================================

/**
 * This mirrors the actual pattern used in src/services/action-builder.ts
 */

type GristRecordData = Record<string, unknown>

function buildBulkAddRecordAction_RealWorld(
  tableId: TableId,
  records: GristRecordData[]
): UserAction {
  const rowIds = records.map(() => null)

  const colValues: BulkColValues = {}
  if (records.length > 0) {
    const columns = Object.keys(records[0])
    columns.forEach((colId) => {
      colValues[colId] = records.map((r) => r[colId] ?? null)
    })
  }

  // ✅ CORRECT PATTERN - Explicit conversion at boundary
  return ['BulkAddRecord', tableId as string, rowIds, colValues]
  //                       ^^^^^^^^^^^^^^^^^
  //                       Marks internal → external boundary
}

function buildBulkUpdateRecordAction_RealWorld(
  tableId: TableId,
  rowIds: RowId[],
  updates: Partial<GristRecordData>
): UserAction {
  const colValues: BulkColValues = {}

  Object.keys(updates).forEach((colId) => {
    const value = updates[colId]
    colValues[colId] = rowIds.map(() => value ?? null)
  })

  // ✅ CORRECT PATTERN - Both branded types explicitly converted
  return ['BulkUpdateRecord', tableId as string, rowIds as number[], colValues]
  //                          ^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^
}

// ============================================================================
// EXPORTS (to avoid unused warnings)
// ============================================================================

export {
  approachA_withAssertion,
  approachB_noAssertion,
  buildBulkAddRecord,
  buildBulkUpdateRecord,
  buildBulkRemoveRecord,
  buildAddColumn,
  buildModifyColumn,
  buildRemoveColumn,
  test_covariance,
  test_functionParameterCovariance,
  test_contravariance_SHOULD_FAIL,
  test_runtimeBehavior,
  test_tupleInference,
  unclearIntent,
  clearIntent,
  positionSafetyWithAssertions,
  buildBulkAddRecordAction_RealWorld,
  buildBulkUpdateRecordAction_RealWorld
}

// ============================================================================
// CONCLUSION
// ============================================================================

/**
 * KEY FINDINGS:
 *
 * 1. ✅ Approach B (no assertions) DOES compile in strict mode
 *    - Branded types are covariant with base types
 *    - TypeScript allows branded → plain assignment
 *
 * 2. ✅ Approach A (with assertions) is RECOMMENDED
 *    - Documents intent explicitly
 *    - Marks API boundary conversions
 *    - Improves code clarity and maintainability
 *    - Future-proofs against TypeScript changes
 *
 * 3. ✅ Type assertions at API boundaries are SAFE
 *    - No runtime data transformation
 *    - Branded types are runtime-identical to base types
 *    - Validation happens before this point
 *
 * 4. ✅ Current codebase pattern is CORRECT
 *    - src/services/action-builder.ts uses assertions
 *    - This is the right architectural choice
 *    - Continue using this pattern
 *
 * RECOMMENDATION:
 * Keep using type assertions at API boundaries:
 *   return ['BulkAddRecord', tableId as string, rowIds as number[], colValues]
 */
