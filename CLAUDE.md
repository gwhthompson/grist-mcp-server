# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Agent & Skill Usage (MANDATORY)

**⚠️ CRITICAL: Before starting ANY work, determine which agents/skills apply and invoke them FIRST.**

### 1. Context7 MCP Tool (Documentation Fetching)

**ALWAYS fetch documentation BEFORE implementing:**

```typescript
// For Zod validation work - REQUIRED
mcp__context7__get-library-docs({
  context7CompatibleLibraryID: "/websites/v3_zod_dev",
  topic: "refinements, error handling, preprocessing, transforms",
  tokens: 8000
})
```

**Use Context7 when:**
- Writing or modifying Zod schemas (fetch Zod v3 docs)
- Working with any external library (fetch current docs)
- Implementing features from specifications (fetch API docs)
- Unsure about library API changes

**Why:** This codebase uses Zod v3 (not v4). Fetching wrong version docs leads to errors.

### 2. javascript-typescript:typescript-pro Agent

**INVOKE THIS AGENT when performing:**
- TypeScript error analysis or debugging
- Code refactoring with type safety concerns
- Complex type inference implementation
- Generic type pattern design
- Schema validation logic

**How to invoke:**
```typescript
Task({
  subagent_type: "javascript-typescript:typescript-pro",
  description: "Analyze TypeScript inference issue",
  prompt: "Review this schema and identify type safety improvements..."
})
```

### 3. typescript-advanced-types Skill

**INVOKE THIS SKILL before working with:**
- Branded types (DocId, TableId, RowId, Timestamp, CurrencyCode)
- Conditional types (WorkspaceResult, TableResult, AsyncState)
- Template literal types (API paths, reference types)
- Discriminated unions (CellValue variants, Result<T,E>)
- Mapped types or complex generic constraints

**How to invoke:**
```typescript
Skill({ skill: "typescript-advanced-types" })
```

### 4. mcp-builder Skill

**INVOKE THIS SKILL when:**
- Creating ANY new MCP tool
- Modifying existing tool schemas
- Validating tool response formats
- Ensuring MCP protocol compliance
- Reviewing tool annotations and metadata
- Designing workflow-centric APIs

**How to invoke:**
```typescript
Skill({ skill: "mcp-builder" })
```

---

## Reference Documentation (CRITICAL)

**Always Reference `./docs/reference/` for Grist API specifications (READ-ONLY)**

This directory contains **authoritative Grist API documentation** that you MUST reference:

- **`grist-api-spec.yml`** - Complete OpenAPI specification for REST endpoints
- **`grist-types.d.ts`** - TypeScript type definitions (CellValue, GristObjCode, column types)
- **`grist-apply-actions.d.ts`** - UserAction tuple types (AddTable, BulkAddRecord, etc.)
- **`grist-database-schema.md`** - Metadata schema v44 (18 internal tables)

**⚠️ CRITICAL: NEVER MODIFY FILES IN `docs/reference/`**

These files are **documentation of the upstream Grist API**, not our production code.

- ❌ **DO NOT** add branded types to these files
- ❌ **DO NOT** add imports to `src/` from these files
- ❌ **DO NOT** change type signatures in these files
- ✅ **DO** reference them for understanding Grist's API contract
- ✅ **DO** copy patterns to new files in `src/types/` if needed

**When to use each:**
- Building API requests? → Check `grist-api-spec.yml` for endpoint signatures
- Working with CellValues? → Reference `grist-types.d.ts` for encoding formats
- Creating UserActions? → Reference `grist-apply-actions.d.ts` for tuple structures
- Need metadata info? → Reference `grist-database-schema.md`

**Where to add branded types:**
- `src/types.ts` - Production type definitions with branded CellValue
- `src/types/advanced.ts` - Branded ID types (DocId, TableId, etc.)
- `src/encoding/cell-value-builders.ts` - Branded CellValue types
- `src/services/action-builder.ts` - Functions that use branded types internally

---

## Zod v3 (NOT v4) - CRITICAL

**⚠️ This codebase uses Zod v3 (not v4)**

Always fetch Zod v3 documentation via Context7 **BEFORE** writing validation code:

```typescript
mcp__context7__get-library-docs({
  context7CompatibleLibraryID: "/websites/v3_zod_dev",
  topic: "refinements, error handling, preprocessing, transforms",
  tokens: 8000
})
```

**Why Zod v3 docs are critical:**
- `.refine()` and `.superRefine()` syntax differs from v4
- Custom error maps use `setErrorMap()` (different API in v4)
- `.preprocess()` and `.transform()` patterns are v3-specific
- Type inference with discriminated unions has v3-specific patterns
- Using v4 docs will cause compilation errors

---

## Critical Grist API Patterns (EASY TO GET WRONG)

### 1. UserAction Format

```typescript
// ❌ WRONG - Common mistake
await client.post(`/docs/${docId}/apply`, {
  actions: [["AddTable", "TableName", [...]]]
})

// ✅ CORRECT - Send array directly
await client.post(`/docs/${docId}/apply`, [
  ["AddTable", "TableName", [...]]
])
```

**Why:** Grist API expects `UserAction[]` directly, not wrapped in `{actions: ...}`.

**Reference:** `docs/reference/grist-apply-actions.d.ts`

### 2. Widget Options Processing Chain

The MCP server handles **three input formats** transparently:

```typescript
// Input (any of these work)
widgetOptions: { choices: ['A', 'B'] }           // JavaScript object
widgetOptions: '{"choices":["A","B"]}'           // JSON string
widgetOptions: "{'choices':['A','B']}"           // Python dict string

// Processing flow
1. Preprocess: Python dict → valid JSON
2. Validate: Zod schema with cross-field checks
3. Serialize: Object → JSON string
4. Send to Grist: '{"choices":["A","B"]}'
```

**Implementation:**
- Preprocessing: `src/schemas/widget-options.ts`
- Serialization: `src/services/action-builder.ts`

### 3. visibleCol Auto-Resolution

For Reference columns, users can specify column **names** (auto-resolved) or numeric IDs:

```typescript
// User provides at top-level (NOT in widgetOptions!)
{
  action: 'add',
  colId: 'Manager',
  type: 'Ref:People',
  visibleCol: "Name"  // String name (recommended)
}

// MCP server resolves to numeric ID (before API call)
const numericId = await resolveVisibleCol(client, docId, "People", "Name")

// Sent to Grist API
visibleCol: 456  // Numeric ID at top-level
```

**Implementation:** `src/services/column-resolver.ts`

**Note:** visibleCol is a column property (like type, formula), NOT a widget option. Set at operation top-level.

### 4. CellValue Encoding (Critical for Correctness)

Grist uses a **special encoding format** for complex data types. This is the #1 source of user confusion.

**The Problem:**
- ❌ Plain arrays/values don't work: `["option1", "option2"]`
- ✅ Must use Grist encoding: `["L", "option1", "option2"]`

**Current Solution (Test Helpers):**

Located in `tests/helpers/cell-values.ts`:

```typescript
import { createList, createDate, createDateTime } from './tests/helpers/cell-values.js'

// ChoiceList: Requires "L" prefix
createList('option1', 'option2')  // Returns: ["L", "option1", "option2"]

// Date: Requires "d" prefix + Unix timestamp
createDate(Date.parse('2024-01-15'))  // Returns: ["d", 1705276800000]

// DateTime: Requires "D" prefix + timestamp + timezone
createDateTime(Date.parse('2024-01-15'), 'UTC')  // Returns: ["D", 1705276800000, "UTC"]
```

**GristObjCode Reference:**
```typescript
enum GristObjCode {
  List = "L",           // ChoiceList, RefList
  Date = "d",           // Date columns
  DateTime = "D",       // DateTime columns
  Reference = "R",      // Ref columns
  ReferenceList = "r",  // RefList columns
  // ... see grist-types.d.ts for complete list
}
```

**⚠️ Common Mistake:**

```typescript
// ❌ WRONG - This will fail with 500 error
await client.post(`/docs/${docId}/apply`, [
  ['BulkAddRecord', 'Products', [null], {
    Tags: [['Popular', 'New']]  // Missing "L" prefix!
  }]
])

// ✅ CORRECT - Use encoding helper
await client.post(`/docs/${docId}/apply`, [
  ['BulkAddRecord', 'Products', [null], {
    Tags: [createList('Popular', 'New')]  // Returns ["L", "Popular", "New"]
  }]
])
```

---

## Validation Rules (Non-Obvious Constraints)

### Identifiers

- **DocId**: Base58, exactly 22 chars, excludes `0OIl` (visually ambiguous)
- **TableId**: UPPERCASE start, Python identifier, **NO Python keywords**
- **ColId**: Python identifier, **NO Python keywords**, **NO `gristHelper_` prefix**

**Why Python keywords?** Grist uses Python for formulas. Keywords like `for`, `class`, `if`, `def` are forbidden in table/column names.

### Widget Options Constraints

- **Currency**: 165 ISO 4217 codes only (auto-uppercase)
- **Colors**: Hex `#RRGGBB` format only (no CSS names, no shorthand `#FFF`)
- **Choices**: Max 1,000 items, 1-255 characters each
- **Decimals**: 0-20 range (JavaScript precision limit)

### Cross-Field Dependencies

```typescript
// Example: numMode='currency' requires currency code
.superRefine((data, ctx) => {
  if (data.numMode === 'currency' && !data.currency) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'currency field is required when numMode is "currency"'
    })
  }
})
```

**Pattern used in:**
- NumericWidgetOptions (currency/numMode)
- DateWidgetOptions (dateFormat required)
- DateTimeWidgetOptions (dateFormat + timeFormat required)

---

## Docker Testing (MANDATORY)

### Critical Setup Pattern

```yaml
# compose.yml - CRITICAL: post_start sets API key
services:
  grist:
    image: gristlabs/grist:latest
    ports: ["8989:8484"]
    environment:
      GRIST_API_KEY: test_api_key
    post_start:  # Injects API key into database after startup
      - command: "node -e ..." # Complex initialization script
```

**Why post_start?** Grist doesn't accept API keys via environment variables alone. The key must be injected into the database after Grist boots.

### Test Workflow

```bash
# 1. Start Docker container
docker compose up -d

# 2. CRITICAL: Wait for post_start initialization
sleep 12

# 3. Set environment variables
export GRIST_API_KEY=test_api_key
export GRIST_BASE_URL=http://localhost:8989  # NO /api suffix

# 4. Run tests
npm run build
npm test
```

---

## MCP Protocol Compliance

### Tool Naming Convention

```typescript
'grist_{verb}_{noun}'

// Examples:
'grist_list_documents'
'grist_add_records'
'grist_manage_columns'  // Consolidated CRUD operations
```

### Annotations (Use Presets)

```typescript
// From tool-definitions.ts
READ_ONLY_ANNOTATIONS        // No mutations (list, get)
WRITE_SAFE_ANNOTATIONS       // Safe mutations (add, update)
WRITE_IDEMPOTENT_ANNOTATIONS // Can retry safely (upsert)
DESTRUCTIVE_ANNOTATIONS      // Data loss risk (delete)
```

### Dual Response Format (ALWAYS)

```typescript
return {
  content: [{ type: 'text', text: markdownOutput }],  // Human-readable
  structuredContent: jsonOutput  // Machine-readable
}
```

---

## Error Handling Pattern

### Actionable Errors with Suggestions

```typescript
// ✅ GOOD - Specific guidance
throw new Error(
  `Document not found. Verify docId="${docId}" is correct. ` +
  `Try listing accessible documents with grist_list_documents first.`
)

// ❌ BAD - No context or guidance
throw new Error('docs not found')
```

### Automatic Sanitization

The `GristClient` automatically redacts sensitive data from errors:
- API keys/tokens
- Email addresses (partially redacted)
- Long IDs (40+ characters)
- File paths containing usernames

---

## TypeScript Configuration

**Non-negotiable settings:**

```json
{
  "strict": true,              // All strict flags enabled
  "module": "Node16",          // ESM with .js extensions required
  "target": "ES2022",
  "moduleResolution": "Node16"
}
```

**Import extensions:** ALWAYS use `.js` even for `.ts` files (Node16 requirement):

```typescript
import { GristClient } from './services/grist-client.js'  // ✅ Correct
import { GristClient } from './services/grist-client'     // ❌ Wrong
```

---

## Common Pitfalls to Avoid

1. **UserAction format** - Send array directly, not `{actions: [...]}`
2. **GRIST_BASE_URL** - Never include `/api` suffix (added automatically by client)
3. **Docker post_start** - Wait 12 seconds after `docker compose up -d`
4. **visibleCol** - Auto-resolve column names to numeric IDs before API call
5. **Widget options** - Serialize objects to JSON strings before `/apply`
6. **Python keywords** - Block `for`, `class`, etc. in tableId/colId
7. **Import extensions** - Always use `.js` for ESM imports (Node16 module resolution)
8. **CellValue encoding** - ChoiceList needs `["L", ...]` format, use `createList()` helper
9. **Date encoding** - Dates require `["d", timestamp]` format, use `createDate()` helper
10. **DateTime encoding** - DateTime requires `["D", timestamp, timezone]` format, use `createDateTime()` helper

**Critical:** Pitfalls #8-10 are the **#1 source of user errors**. Always use encoding helpers from `tests/helpers/cell-values.ts`.

---

## MCPB Bundle Packaging

This project uses [MCP Bundles (MCPB)](https://github.com/modelcontextprotocol/mcpb) for packaging. See the [MCPB specification](https://raw.githubusercontent.com/modelcontextprotocol/mcpb/refs/heads/main/README.md) for details.

**When adding new tools:** Update both `src/registry/tool-definitions.ts` AND `manifest.json` tools array.

```bash
npm run build          # Build the server
npm ci --omit=dev      # Install only production dependencies
mcpb pack              # Create .mcpb bundle
```

---

## Adding New Tools

**Workflow:**

1. **Pre-Planning:** Invoke `mcp-builder` skill + fetch Zod v3 docs via Context7
2. **Implementation:** Add entry to `src/registry/tool-definitions.ts` (`ALL_TOOLS` array)
3. **Update Manifest:** Add tool to `manifest.json` tools array
4. **Review:** Invoke `typescript-pro` agent for type safety review
5. **Validation:** Add integration tests in `tests/` and run against Docker container

**Quality Check:**
- ✅ Zero `any` types in implementation
- ✅ Actionable error messages with suggestions
- ✅ Strict mode compliance
- ✅ MCP protocol compliance
- ✅ Type inference preserved throughout
