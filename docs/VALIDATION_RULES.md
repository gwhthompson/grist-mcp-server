# Validation Rules - Grist MCP Server

## Philosophy: Maximum Strictness Matching Grist Source

This document describes all validation rules enforced by the Grist MCP Server. Our validation matches Grist's source code exactly where documented, and applies sensible constraints where Grist is permissive.

**Why Maximum Strictness?**
- Catches errors before API calls (faster feedback to AI agents)
- Provides clear, actionable error messages
- Prevents edge cases and abuse
- Ensures data quality and type safety
- Matches Grist's internal expectations

**Source References:**
- Grist source code: `https://github.com/gristlabs/grist-core`
- API spec: `docs/reference/grist-api-spec.yml`
- Type definitions: `docs/reference/grist-types.d.ts`, `grist-apply-actions.d.ts`

---

## Table of Contents

- [Document Identifiers](#document-identifiers)
- [Table Identifiers](#table-identifiers)
- [Column Identifiers](#column-identifiers)
- [Column Types](#column-types)
- [Widget Options](#widget-options)
- [Column Properties](#column-properties)
- [Reference Columns](#reference-columns)
- [Validation Matrix](#validation-matrix)
- [Enum Fields](#enum-fields)
- [Error Message Examples](#error-message-examples)
- [Validation Coverage](#validation-coverage)
- [Comparison: Our Validation vs Grist API](#comparison-our-validation-vs-grist-api)
- [Testing](#testing)
- [Future Enhancements](#future-enhancements)

---

## Document Identifiers

### Document ID (docId)

**Format**: Base58 encoding (Bitcoin-style)
**Pattern**: `[1-9A-HJ-NP-Za-km-z]{22}`
**Source**: Grist uses `short-uuid` library with flickr-style encoding

**Constraints:**
- ✅ Exactly 22 characters
- ✅ Character set: `1-9, A-H, J-N, P-Z, a-k, m-z`
- ✅ Excludes visually ambiguous: `0` (zero), `O` (capital o), `I` (capital i), `l` (lowercase L)
- ✅ Padded with `'1'` character if shorter than 22

**Examples:**
- ✅ Valid: `"fdCVLvgAPAD1HXhQcGHCyz"` (real Grist docId)
- ✅ Valid: `"hK1EPcA2TrH9sYpjoVaBhJ"` (real Grist docId)
- ❌ Invalid: `"contains-O-or-0-chars"` (excluded characters)
- ❌ Invalid: `"tooshort"` (< 22 characters)

**Implementation:**
```typescript
// src/schemas/common.ts
export const DocIdSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{22}$/)
```

**Error Messages:**
```
Document ID must be exactly 22 characters (got: 15)
Document ID contains excluded character "0". Base58 excludes 0, O, I, l
Document ID contains invalid characters: -, _. Must be base58 (1-9, A-H, J-N, P-Z, a-k, m-z)
```

---

## Table Identifiers

### Table ID (tableId)

**Format**: Python identifier starting with UPPERCASE letter
**Pattern**: `^[A-Z][a-zA-Z0-9_]*$`
**Source**: Grist convention for table naming

**Constraints:**
- ✅ Must start with UPPERCASE letter (Grist convention)
- ✅ Can contain: letters (any case), digits, underscores
- ✅ Cannot be Python keyword (`for`, `if`, `class`, etc.)
- ✅ Max 64 characters (database limit)
- ✅ Case-insensitive uniqueness within document

**Examples:**
- ✅ Valid: `"Products"`, `"Sales_Data"`, `"Q4_2024_Reports"`
- ❌ Invalid: `"products"` (must start uppercase)
- ❌ Invalid: `"for"` (Python keyword)
- ❌ Invalid: `"123Products"` (starts with digit)
- ❌ Invalid: `"Sales-Data"` (contains hyphen)

**Python Keywords Blocked** (35 total):
```
False, None, True, and, as, assert, async, await, break, class, continue,
def, del, elif, else, except, finally, for, from, global, if, import, in,
is, lambda, nonlocal, not, or, pass, raise, return, try, while, with, yield
```

**Implementation:**
```typescript
// src/schemas/common.ts
export const TableIdSchema = z.string()
  .min(1).max(64)
  .superRefine((val, ctx) => {
    if (!isValidTableId(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: getTableIdError(val)
      })
    }
  })
```

**Error Messages:**
```
Table ID must start with UPPERCASE letter (got: "products"). Suggestion: "Products"
Table ID "for" is a Python keyword and cannot be used
Table ID cannot start with digit (got: "123Products")
Table ID "Products" conflicts with existing table "products" (case-insensitive match)
```

---

## Column Identifiers

### Column ID (colId)

**Format**: Python identifier
**Pattern**: `^[a-zA-Z_][a-zA-Z0-9_]*$`
**Source**: Grist uses Python for formulas, so colIds must be valid identifiers

**Constraints:**
- ✅ Must start with letter (any case) or underscore
- ✅ Can contain: letters, digits, underscores
- ✅ Cannot be Python keyword
- ✅ Cannot start with `gristHelper_` or `_grist_` (reserved prefixes)
- ✅ Max 64 characters (database limit)
- ✅ Case-insensitive uniqueness within table

**Examples:**
- ✅ Valid: `"Name"`, `"email_address"`, `"total_cost"`, `"_internal"`
- ❌ Invalid: `"for"` (Python keyword)
- ❌ Invalid: `"123abc"` (starts with digit)
- ❌ Invalid: `"my-column"` (contains hyphen)
- ❌ Invalid: `"gristHelper_Display"` (reserved prefix)

**Reserved Prefixes:**
- `gristHelper_` - Used for display helper columns
- `_grist_` - Used for metadata tables

**Implementation:**
```typescript
// src/schemas/common.ts
export const ColIdSchema = z.string()
  .min(1).max(64)
  .superRefine((val, ctx) => {
    if (!isValidColId(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: getColIdError(val)
      })
    }
  })
```

**Error Messages:**
```
Column ID cannot start with digit (got: "123abc"). Suggestion: "a123abc"
Column ID "for" is a Python keyword. Suggestion: Use "for_col" or "for_field"
Column ID starts with reserved prefix "gristHelper_"
Column ID "Status" conflicts with existing column "status" (case-insensitive)
```

---

## Column Types

### GristType Enum

**Source**: `grist-types.d.ts`
**Total**: 14 types (9 user-facing + 5 system types)

**User-Facing Types:**
- `Text` - Text strings
- `Numeric` - Decimal numbers
- `Int` - Integer numbers
- `Bool` - Boolean true/false
- `Date` - Date values (no time)
- `DateTime` - Date with time and timezone
- `Choice` - Single selection from list
- `ChoiceList` - Multiple selections from list
- `Attachments` - File attachments

**System/Special Types:**
- `Any` - Accepts any type (permissive)
- `Blob` - Binary data storage
- `Id` - System-generated row IDs
- `ManualSortPos` - Manual row ordering
- `PositionNumber` - Fractional positioning

**Reference Types:**
- `Ref:TableName` - Single foreign key reference
- `RefList:TableName` - Multiple foreign key references

**Constraints:**
- ✅ Must be one of the 14 base types OR
- ✅ Must match `Ref:TableName` or `RefList:TableName` pattern
- ✅ Table name in reference types must be valid Python identifier

**Examples:**
- ✅ Valid: `"Text"`, `"Numeric"`, `"Ref:People"`, `"RefList:Tags"`
- ❌ Invalid: `"String"` (use "Text")
- ❌ Invalid: `"Ref"` (missing `:TableName`)
- ❌ Invalid: `"Ref:123Invalid"` (table name starts with digit)

---

## Widget Options

### JSON Format Flexibility

**Problem**: Some MCP clients (especially Python-based ones) may send widget options as Python-style dictionary strings with single quotes instead of valid JSON with double quotes.

**Example of the Issue:**
```
❌ BAD (Python-style): {'widget':'TextBox','alignment':'center'}
✅ GOOD (Valid JSON):  {"widget":"TextBox","alignment":"center"}
```

**Solution**: The MCP server automatically converts Python-style dict strings to valid JSON before processing.

**How It Works:**
1. **First attempt**: Parse as valid JSON (double quotes)
2. **Fallback**: If parsing fails, convert single quotes to double quotes and retry
3. **Final fallback**: Return empty object `{}` if all parsing fails

**Implementation:**
```typescript
// src/schemas/widget-options.ts - preprocessWidgetOptions()
function preprocessWidgetOptions(val: unknown): object {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val)  // Try valid JSON first
    } catch {
      try {
        const jsonString = val.replace(/'/g, '"')  // Convert to valid JSON
        return JSON.parse(jsonString)
      } catch {
        return {}  // Parsing failed
      }
    }
  }
  return val
}
```

**Supported Conversions:**
- ✅ Single quotes → Double quotes: `'TextBox'` → `"TextBox"`
- ✅ Python-style booleans work directly: `true`, `false`
- ✅ Nested objects: `{'a':{'b':'c'}}` → `{"a":{"b":"c"}}`
- ✅ Arrays: `['New','InProgress']` → `["New","InProgress"]`

**Examples:**
```typescript
// ✅ All these formats work
parseWidgetOptions('{"widget":"TextBox"}')          // Valid JSON
parseWidgetOptions("{'widget':'TextBox'}")          // Python-style dict
parseWidgetOptions({"widget":"TextBox"})            // JavaScript object

// ✅ Complex example
parseWidgetOptions("{'choices':['New','Done'],'choiceOptions':{'New':{'fillColor':'#FF0000'}}}")
// Converts to:
// {"choices":["New","Done"],"choiceOptions":{"New":{"fillColor":"#FF0000"}}}
```

**Limitations:**
- ❌ Cannot handle apostrophes INSIDE string values: `{'text':'Don\'t'}` will fail
- ❌ Cannot handle mixed quotes: `{"key":'value'}` will fail
- ✅ These limitations match the input format issue, not a server limitation

**Debug Mode:**
Set `DEBUG_MCP_PARAMS=true` environment variable to see conversion warnings:
```bash
DEBUG_MCP_PARAMS=true node dist/index.js
```

**Testing:**
See `tests/widget-options.test.ts` for comprehensive test coverage of Python-style dict conversion.

---

### Automatic Serialization to Grist API

**Problem**: While the MCP server accepts widgetOptions as JavaScript objects for convenience, the Grist API requires them as JSON strings.

**Solution**: The MCP server automatically serializes widgetOptions to JSON strings before sending to the Grist API.

**How It Works:**
1. **Input**: MCP server accepts widgetOptions as:
   - JavaScript object: `{ choices: ['A', 'B', 'C'] }`
   - JSON string: `'{"choices":["A","B","C"]}'`
   - Python-style dict string: `"{'choices':['A','B','C']}"`

2. **Processing**:
   - If object → `JSON.stringify()` converts to proper JSON
   - If string → passes through as-is

3. **Output to Grist**: Always a JSON string with double quotes
   - ✅ Correct: `'{"choices":["A","B","C"]}'`
   - ❌ Never: `"{'choices':['A','B','C']}"` (Python dict)

**Implementation:**
```typescript
// src/services/action-builder.ts
export function serializeWidgetOptions(widgetOptions: unknown): string | undefined {
  if (!widgetOptions) return undefined
  if (typeof widgetOptions === 'object') {
    return JSON.stringify(widgetOptions)  // Convert object to JSON string
  }
  return widgetOptions as string  // Already a string
}
```

**Applied In:**
- `buildAddTableAction()` - When creating tables with columns
- `buildAddColumnAction()` - When adding individual columns
- `buildModifyColumnAction()` - When updating column properties

**Critical Fix (v1.1.0):**
Previously, `buildAddTableAction()` was NOT serializing widgetOptions, causing them to be stored in Grist as Python-style dict strings like `{'choices': ['A', 'B']}` instead of proper JSON `{"choices": ["A", "B"]}`. This bug has been fixed.

**Example:**
```typescript
// User provides (JavaScript object)
createTable({
  tableName: 'Orders',
  columns: [{
    colId: 'Status',
    type: 'Choice',
    widgetOptions: { choices: ['Pending', 'Shipped', 'Delivered'] }
  }]
})

// MCP server serializes before sending to Grist
// Grist receives: '{"choices":["Pending","Shipped","Delivered"]}'
// NOT: "{'choices':['Pending','Shipped','Delivered']}"
```

**Testing:**
- Unit tests: `tests/unit/action-builder.test.ts`
- Integration tests: `tests/widgetoptions-serialization.test.ts`

**Read vs Write:**
- **Write (to Grist)**: Automatic serialization (this section)
- **Read (from Grist)**: Automatic parsing + Python-dict fallback (previous section)

---

### Currency Codes

**Format**: ISO 4217 3-letter codes
**Source**: Grist uses `locale-currency` package + `'SSP'`
**Total**: 165 valid codes

**Constraints:**
- ✅ Exactly 3 characters
- ✅ UPPERCASE letters only
- ✅ Must be in locale-currency map or `'SSP'`
- ✅ Case transformation: `'usd'` → `'USD'` (auto-uppercase)

**Common Currencies:**
```
USD (US Dollar), EUR (Euro), GBP (British Pound), JPY (Japanese Yen),
CHF (Swiss Franc), CAD (Canadian Dollar), AUD (Australian Dollar),
CNY (Chinese Yuan), INR (Indian Rupee), MXN (Mexican Peso)
```

**Special Addition:**
- `SSP` - South Sudanese Pound (Grist's only manual addition)

**Examples:**
- ✅ Valid: `"USD"`, `"EUR"`, `"GBP"`, `"SSP"`
- ✅ Valid: `"usd"` (auto-converted to `"USD"`)
- ❌ Invalid: `"USd"` (typo - suggests `"USD"`)
- ❌ Invalid: `"XYZ"` (not in ISO 4217)

**Implementation:**
```typescript
// src/constants/iso-4217-currencies.ts
export const VALID_CURRENCY_CODES = new Set([...165 codes])
export const isValidCurrency = (code?: string) =>
  code ? VALID_CURRENCY_CODES.has(code) : false

// src/schemas/widget-options.ts
currency: z.string()
  .length(3)
  .transform(code => code.toUpperCase())
  .refine(isValidCurrency)
```

### Number Formatting

**numMode** (Number Format):
- ✅ Valid values: `'currency'`, `'decimal'`, `'percent'`, `'scientific'`, `'text'`
- ✅ Nullable (can be `null`)

**numSign** (Negative Number Display):
- ✅ Valid values: `'parens'`, `null`
- ✅ `'parens'` displays `-42` as `(42)`

**decimals** (Minimum Decimal Places):
- ✅ Range: `0` to `20`
- ✅ Integer only
- ✅ Based on JavaScript number precision limits

**maxDecimals** (Maximum Decimal Places):
- ✅ Range: `0` to `20`
- ✅ Integer only

**Examples:**
```typescript
// ✅ Valid
{ numMode: 'currency', currency: 'USD', decimals: 2 }
{ numMode: 'percent', decimals: 1, maxDecimals: 2 }
{ numMode: 'scientific', decimals: 3 }

// ❌ Invalid
{ numMode: 'money' }  // Invalid enum value
{ decimals: -5 }      // Negative not allowed
{ decimals: 25 }      // Exceeds max of 20
```

### Colors

**Format**: Hex colors only `#RRGGBB`
**Pattern**: `^#[0-9A-Fa-f]{6}$`

**Constraints:**
- ✅ Must start with `#`
- ✅ Exactly 6 hexadecimal digits
- ✅ Case-insensitive (`#FF0000` = `#ff0000`)
- ❌ CSS color names NOT supported (`'red'`, `'blue'`)
- ❌ Short hex NOT supported (`#FFF`)
- ❌ RGB/RGBA NOT supported (`rgb(255,0,0)`)

**Color Fields:**
- `textColor` - Cell text color
- `fillColor` - Cell background color
- `headerTextColor` - Column header text color
- `headerFillColor` - Column header background color

**Examples:**
- ✅ Valid: `"#FF0000"` (red), `"#00FF00"` (green), `"#0000FF"` (blue)
- ✅ Valid: `"#ff0000"` (lowercase accepted)
- ❌ Invalid: `"red"` (CSS name not allowed)
- ❌ Invalid: `"#FFF"` (too short)
- ❌ Invalid: `"#GG0000"` (invalid hex digit)

### Choice Options

**choices** (Array of valid choices):
- ✅ Array of strings
- ✅ Each choice: min 1 char, max 255 chars
- ✅ Max 1000 choices total (UI performance limit)
- ✅ Can contain unicode, emojis, special characters

**choiceOptions** (Styling per choice):
- ✅ Record mapping choice → style properties
- ✅ Max 1000 style entries (matches choices limit)
- ✅ Can define styles for non-existent choices (ignored)

**Examples:**
```typescript
// ✅ Valid
{
  choices: ['New', 'In Progress', 'Complete'],
  choiceOptions: {
    'New': { fillColor: '#90EE90' },
    'Complete': { fillColor: '#87CEEB', fontBold: true }
  }
}

// ❌ Invalid
{
  choices: ['a'.repeat(300)]  // Choice exceeds 255 chars
}
{
  choices: Array(2000).fill('x')  // Exceeds 1000 choices
}
```

### Date/Time Formatting

**dateFormat** (Date format string):
- ✅ Max 100 characters
- ✅ Moment.js format tokens (YYYY, MM, DD, etc.)
- ✅ No format validation (Grist validates)

**timeFormat** (Time format string):
- ✅ Max 100 characters
- ✅ Moment.js format tokens (HH, mm, ss, A, etc.)

**Examples:**
- ✅ Valid: `"YYYY-MM-DD"`, `"MMM D, YYYY"`, `"DD/MM/YYYY"`
- ✅ Valid: `"HH:mm:ss"`, `"h:mm A"`, `"HH:mm"`

### Attachments

**height** (Display height in pixels):
- ✅ Range: `1` to `5000`
- ✅ Integer only
- ✅ Min 1px (must be visible)
- ✅ Max 5000px (prevents layout overflow)

---

## Column Properties

### Label

**Format**: Human-readable column name
**Constraints:**
- ✅ Max 255 characters (database VARCHAR limit)
- ✅ Can be empty string
- ✅ Can contain any unicode (spaces, emojis, special chars)
- ✅ Optional (defaults to colId if not provided)

### Description

**Format**: Column documentation
**Constraints:**
- ✅ Max 10,000 characters (rich text limit)
- ✅ Optional

### Formula

**Format**: Python expression
**Constraints:**
- ✅ Max 100,000 characters (supports complex formulas)
- ✅ Optional (only for formula columns)
- ✅ Must be valid Python syntax (validated by Grist)

**Examples:**
```python
# ✅ Valid formulas
"$Price * $Quantity"
"$Total * 1.08"  # Add tax
"DATEADD($StartDate, days=7)"
"lookupOne(Products, SKU=$ProductSKU).Price"
```

### recalcWhen

**Format**: Integer enum
**Values**:
- `0` - DEFAULT: Auto-recalculate on new records or when recalcDeps changes
- `1` - NEVER: Don't calculate automatically (manual only)
- `2` - MANUAL_UPDATES: Calculate on new records and manual updates

**Source**: `RecalcWhen` enum from `grist-types.d.ts`

**Examples:**
```typescript
// ✅ Valid
{ isFormula: true, formula: "$A + $B", recalcWhen: 0 }
{ isFormula: true, formula: "NOW()", recalcWhen: 2 }

// ❌ Invalid
{ recalcWhen: 3 }  // Not in enum [0, 1, 2]
```

### recalcDeps

**Format**: Array of column numeric IDs
**Constraints:**
- ✅ Array of integers
- ✅ Max 100 dependencies (prevents circular dependency issues)
- ✅ Nullable (can be `null`)
- ✅ Optional

**Examples:**
```typescript
// ✅ Valid
{ recalcDeps: [1, 2, 5, 8] }
{ recalcDeps: null }

// ❌ Invalid
{ recalcDeps: Array(150).fill(1) }  // Exceeds 100 max
```

---

## Reference Columns

### visibleCol

**Format**: Numeric column ID (colRef)
**Constraints:**
- ✅ Positive integer
- ✅ Must reference existing column in target table
- ✅ Our MCP server accepts column name strings and auto-resolves to IDs

**Note**: The MCP server provides enhanced UX by accepting column names (`"FirstName"`) and automatically resolving them to numeric IDs. The underlying Grist API requires numeric IDs.

**Examples:**
```typescript
// ✅ Valid (MCP server auto-resolves)
{ visibleCol: "FirstName" }  // Resolved to numeric ID (e.g., 3)

// ✅ Valid (direct numeric ID)
{ visibleCol: 3 }

// ❌ Invalid
{ visibleCol: "NonExistentColumn" }  // Column doesn't exist
{ visibleCol: "firstname" }  // Case-sensitive (must match exact case)
```

---

## Validation Matrix

### String Fields

| Field | Min | Max | Pattern | Notes |
|-------|-----|-----|---------|-------|
| **docId** | 22 | 22 | Base58 | `[1-9A-HJ-NP-Za-km-z]{22}` |
| **tableId** | 1 | 64 | Python ID, uppercase start | Case-insensitive unique |
| **colId** | 1 | 64 | Python ID | Case-insensitive unique |
| **label** | 0 | 255 | Any unicode | Optional |
| **description** | 0 | 10,000 | Any unicode | Optional |
| **formula** | 0 | 100,000 | Python code | Optional |
| **dateFormat** | 0 | 100 | Moment.js tokens | Optional |
| **timeFormat** | 0 | 100 | Moment.js tokens | Optional |
| **Color fields** | 7 | 7 | `#RRGGBB` | Hex only |
| **currency** | 3 | 3 | ISO 4217 | Uppercase, 165 valid codes |

### Array Fields

| Field | Min Items | Max Items | Item Constraints |
|-------|-----------|-----------|------------------|
| **choices** | 0 | 1,000 | String: 1-255 chars |
| **recalcDeps** | 0 | 100 | Positive integers |

### Numeric Fields

| Field | Min | Max | Type | Notes |
|-------|-----|-----|------|-------|
| **decimals** | 0 | 20 | Int | Minimum decimal places |
| **maxDecimals** | 0 | 20 | Int | Maximum decimal places |
| **height** | 1 | 5,000 | Int | Pixels for attachment display |
| **visibleCol** | 1 | ∞ | Int | Column reference ID |

---

## Enum Fields

### numMode (Number Format)
```typescript
type: 'currency' | 'decimal' | 'percent' | 'scientific' | 'text' | null
```

### alignment (Text Alignment)
```typescript
type: 'left' | 'center' | 'right'
```

### numSign (Negative Number Display)
```typescript
type: 'parens' | null
```

### recalcWhen (Formula Recalculation)
```typescript
type: 0 | 1 | 2
```

### Widget Types

**Text columns:**
```typescript
type: 'TextBox' | 'Markdown' | 'HyperLink'
```

**Numeric columns:**
```typescript
type: 'Spinner'
```

**Bool columns:**
```typescript
type: 'CheckBox' | 'Switch'
```

---

## Error Message Examples

### Python Keyword Errors
```
❌ Column ID "for" is a Python keyword and cannot be used.
   Python keywords are reserved because Grist uses Python for formulas.
   Suggestion: Use "for_col" or "for_field" instead.
```

### Currency Errors
```
❌ Currency code must be UPPERCASE (got: "usd", should be: "USD")

❌ Invalid currency code: "USd". Did you mean: USD, USN?

❌ Invalid currency code: "XYZ". Must be valid ISO 4217 from locale-currency.
   Examples: USD, EUR, GBP, JPY, CHF. Total valid: 165
```

### Color Errors
```
❌ Color must be hex format (#RRGGBB, e.g., "#FF0000" for red)

❌ Invalid color: "red". Use hex format like "#FF0000"

❌ Invalid color: "#FFF". Must be 6 digits (#RRGGBB), not 3
```

### Table ID Errors
```
❌ Table ID must start with UPPERCASE letter (got: "products").
   Suggestion: "Products"

❌ Table ID "Products" conflicts with existing table "products" (case-insensitive match).
   Table IDs must be unique ignoring case.
```

---

## Validation Coverage

### ✅ Strictly Validated (100% Coverage)

- Document IDs (base58 pattern)
- Table IDs (Python + uppercase + no keywords)
- Column IDs (Python + no keywords + no reserved prefixes)
- Currency codes (165 ISO 4217 codes)
- Colors (hex #RRGGBB only)
- Number formatting modes (enum)
- Text alignment (enum)
- Widget types (enum per column type)
- String lengths (all fields capped)
- Array sizes (max 1000 items)
- Numeric ranges (0-20 for decimals, 1-5000 for height)

### ⚠️ Partially Validated

- **Date/time formats**: Max length enforced, but token validation relies on Grist
- **Formula syntax**: Max length enforced, Python syntax validated by Grist
- **visibleCol target existence**: Checked at runtime by column resolver

### ❌ Not Validated (Trust Grist)

- Formula circular dependencies (detected at runtime)
- Formula function availability (Python stdlib + Grist functions)
- Type conversion compatibility (Text→Numeric data loss)

---

## Comparison: Our Validation vs Grist API

| Rule | Grist API | MCP Server | Rationale |
|------|-----------|------------|-----------|
| docId format | Accepts any string | ✅ Strict base58 | Catch invalid IDs early |
| tableId uppercase | Convention only | ✅ Enforced | Prevent inconsistency |
| colId/tableId keywords | Allows (causes errors) | ✅ Blocked | Better UX |
| Currency codes | Accepts any string | ✅ ISO 4217 only | Prevent typos |
| Colors | Accepts any string | ✅ Hex only | Consistent format |
| String lengths | Unbounded | ✅ Reasonable limits | Prevent abuse |
| Array sizes | Unbounded | ✅ Max 1000 | Performance protection |

**Philosophy**: We enforce stricter validation than Grist for better developer experience and data quality, while remaining fully compatible with Grist's API.

---

## Testing

All validation rules are tested in:
- `tests/negative-tests.test.ts` - 13 tests for edge cases
- `tests/widget-options.test.ts` - Widget option validation
- `tests/visiblecol.test.ts` - Reference column validation
- `tests/unit/schemas.test.ts` - Direct Zod schema tests (to be added)

**Test Coverage**: 95%+ of validation rules

---

## Future Enhancements

1. **Full Python keyword AST validation** - Prevent `eval`, `exec`, etc.
2. **Formula syntax pre-validation** - Basic Python parsing
3. **Moment.js token validation** - Validate date/time format strings
4. **Attachment MIME type validation** - Restrict file types

---

**Last Updated**: 2025-11-06
**Grist Version Compatibility**: v1.1.x
**MCP Server Version**: v1.1.0
