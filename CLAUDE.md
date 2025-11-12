# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Development Requirements

**When working on this repository:**

### Agent & Skill Usage (MANDATORY - Use Proactively)

**⚠️ CRITICAL: Before starting ANY work, determine which agents/skills apply and invoke them FIRST.**

These specialized tools are **required**, not optional. They prevent errors and ensure quality:

#### 1. Context7 MCP Tool (Documentation Fetching)

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

#### 2. javascript-typescript:typescript-pro Agent

**INVOKE THIS AGENT when performing:**
- TypeScript error analysis or debugging
- Code refactoring with type safety concerns
- Complex type inference implementation
- Generic type pattern design
- Schema validation logic
- Any work involving TypeScript's type system

**How to invoke:**
```typescript
// Use Task tool with this agent
Task({
  subagent_type: "javascript-typescript:typescript-pro",
  description: "Analyze TypeScript inference issue",
  prompt: "Review this schema and identify type safety improvements..."
})
```

**Why:** This agent has deep TypeScript expertise for this exact codebase architecture.

#### 3. typescript-advanced-types Skill

**INVOKE THIS SKILL before working with:**
- Branded types (DocId, TableId, RowId, Timestamp, CurrencyCode)
- Conditional types (WorkspaceResult, TableResult, AsyncState)
- Template literal types (API paths, reference types)
- Discriminated unions (CellValue variants, Result<T,E>)
- Mapped types or complex generic constraints
- Any type-level programming

**How to invoke:**
```typescript
Skill({ skill: "typescript-advanced-types" })
```

**Why:** Provides patterns library and expert guidance for advanced TypeScript features.

#### 4. mcp-builder Skill

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

**Why:** Ensures adherence to MCP specification and best practices for LLM-friendly APIs.

---

### Workflow: When to Use Each Tool

**Starting any task? Follow this checklist:**

1. ☑️ **Grist API work?** → Read **`./docs/reference/`** specifications FIRST
2. ☑️ **External library work?** → Use **Context7** to fetch latest docs
3. ☑️ **TypeScript changes?** → Invoke **typescript-pro agent** for review
4. ☑️ **Advanced types involved?** → Invoke **typescript-advanced-types skill**
5. ☑️ **MCP tool changes?** → Invoke **mcp-builder skill**

**Example: Adding a new column type validation**

```typescript
// Step 1: Read Grist API specifications
// Read: ./docs/reference/grist-types.d.ts (for GristType definitions)
// Read: ./docs/reference/grist-apply-actions.d.ts (for ModifyColumn action)

// Step 2: Fetch Zod v3 docs
mcp__context7__get-library-docs({
  context7CompatibleLibraryID: "/websites/v3_zod_dev",
  topic: "discriminated unions, refinements, custom error maps",
  tokens: 8000
})

// Step 3: Invoke typescript-advanced-types skill for branded type guidance
Skill({ skill: "typescript-advanced-types" })

// Step 4: Invoke typescript-pro agent to review implementation
Task({
  subagent_type: "javascript-typescript:typescript-pro",
  description: "Review column type validation",
  prompt: "Analyze the new validation schema for type safety..."
})

// Step 5: If modifying tool interface, invoke mcp-builder
Skill({ skill: "mcp-builder" })
```

**Example: Implementing CellValue encoding**

```typescript
// Step 1: Read Grist encoding specifications
// Read: ./docs/reference/grist-types.d.ts
// Focus on: CellValue type, GristObjCode enum, encoding examples

// Step 2: Invoke typescript-advanced-types for discriminated unions
Skill({ skill: "typescript-advanced-types" })

// Step 3: Review implementation with typescript-pro
Task({
  subagent_type: "javascript-typescript:typescript-pro",
  description: "Review CellValue encoding",
  prompt: "Review the discriminated union implementation for CellValue..."
})
```

### General Requirements

**4. Always Reference `./docs/reference/` for Grist API specifications (READ-ONLY)**

This directory contains **authoritative Grist API documentation** that you MUST reference:

- **`grist-api-spec.yml`** - Complete OpenAPI specification for REST endpoints
- **`grist-types.d.ts`** - TypeScript type definitions (CellValue, GristObjCode, column types)
- **`grist-apply-actions.d.ts`** - UserAction tuple types (AddTable, BulkAddRecord, etc.)
- **`grist-database-schema.md`** - Metadata schema v44 (18 internal tables)

**⚠️ CRITICAL: NEVER MODIFY FILES IN `docs/reference/`**

These files are **documentation of the upstream Grist API**, not our production code. They describe what Grist's API expects, not what our MCP server uses internally.

- ❌ **DO NOT** add branded types to these files
- ❌ **DO NOT** add imports to `src/` from these files
- ❌ **DO NOT** change type signatures in these files
- ✅ **DO** reference them for understanding Grist's API contract
- ✅ **DO** copy patterns to new files in `src/types/` if needed
- ✅ **DO** keep them in sync with upstream Grist documentation

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

**5. Ensure all code passes integration tests against the Docker Grist container**

### Documentation & Library References

**⚠️ CRITICAL: This codebase uses Zod v3 (not v4)**

Always fetch Zod v3 documentation via Context7 **BEFORE** writing validation code:

```typescript
// MANDATORY before Zod work
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

**Other libraries:**
- Always fetch current documentation via Context7 before implementing
- Never assume API patterns - always verify with latest docs

---

## Core Architecture (Multi-File Pattern)

### Registry-Based Tool System

The server uses a **modular registry architecture** that reduced the codebase by 80%:

```
src/index.ts (~300 lines)
  ├── Environment validation
  ├── GristClient initialization
  └── registerToolsBatch(server, client, ALL_TOOLS)

src/registry/tool-definitions.ts
  └── ALL_TOOLS: Array of 14 tool definitions
      - Zod schemas with full type inference
      - Type-safe handlers (zero `any` types)
      - Annotation presets (READ_ONLY, WRITE_SAFE, DESTRUCTIVE)

src/registry/tool-registry.ts
  └── Generic registration system
      - Converts Zod → JSON Schema
      - Wraps handlers with validation
      - Full TypeScript inference preserved
```

**To add a new tool:** Add one entry to `ALL_TOOLS` array. Registration is automatic.

### Advanced Type System

> **🚨 MANDATORY: Invoke `typescript-advanced-types` skill BEFORE implementing or modifying ANY of these patterns:**
>
> ```typescript
> Skill({ skill: "typescript-advanced-types" })
> ```
>
> This skill provides the pattern library and expert guidance required for:
> - Branded types (all ID types, domain values)
> - Conditional types (result types, conditional returns)
> - Template literal types (API paths, format strings)
> - Discriminated unions (CellValue, error types)
> - Type-level programming (mapped types, inference)
>
> **Don't skip this step** - it prevents hours of debugging type inference issues.

**Branded Types** prevent ID mixing:
```typescript
type DocId = Brand<string, 'DocId'>     // Can't pass TableId where DocId expected
type TableId = Brand<string, 'TableId'>
type RowId = Brand<number, 'RowId'>     // Can't pass WorkspaceId where RowId expected
```

**Conditional Types** for detail-level responses:
```typescript
type WorkspaceResult<D> = D extends 'summary' ? SummaryInfo : DetailedInfo
```

**Template Literal Types** for type-safe API paths:
```typescript
type ApiPath = `/api/docs/${string}/tables/${string}/records`
```

**Implementation:** See `src/types/advanced.ts` for all branded type definitions and type utilities used throughout the codebase.

---

## Critical Grist API Patterns

### 1. UserAction Format (EASY TO GET WRONG)

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

Located in `tests/helpers/cell-values.ts` (will be moved to production in improvement plan):

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

**Future: Type-Safe Encoders (Improvement Plan Phase 1):**

A type-safe encoding system is planned to catch these errors at **compile-time**:

```typescript
// Planned improvement - compile-time safety
import { encodeList, encodeDate, encodeDateTime } from 'src/encoding/cell-value-builders.js'

const choiceList: ListValue = encodeList('option1', 'option2')
//    ^^^^^^^^^^ Branded type - TypeScript enforces correct structure
```

See `docs/IMPROVEMENT_PLAN_2025-01-10.md` for details.

---

## Validation Rules (Non-Obvious Constraints)

**See `docs/VALIDATION_RULES.md` for complete reference.**

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
npm test                    # 174 tests
npm run test:no-cleanup     # Keep data for inspection
```

### Test Coverage Requirements

- All 11 Grist column types (Text, Numeric, Int, Bool, Date, DateTime, Choice, ChoiceList, Ref, RefList, Attachments)
- All CellValue encodings (primitives + Grist arrays like `["L", 1, 2, 3]`)
- All widget options properties
- Negative tests for validation errors

**Test files:** `tests/` directory (30+ test files)

---

## Schema Composition Patterns

### Always Use .strict()

```typescript
const Schema = z.object({...}).strict()  // Reject unknown properties
```

### Use .merge() for DRY

```typescript
const GetDocumentsSchema = BaseParamsSchema
  .merge(PaginationSchema)
  .merge(ResponseFormatSchema)
  .strict()
```

**Reusable schemas:** `src/schemas/common.ts`

### Provide Defaults

```typescript
response_format: z.enum(['json', 'markdown']).default('markdown')
detail_level: z.enum(['summary', 'detailed']).default('summary')
offset: z.number().int().min(0).default(0)
limit: z.number().int().min(1).max(1000).default(100)
```

---

## MCP Protocol Compliance

> **🚨 MANDATORY: Invoke `mcp-builder` skill BEFORE any MCP tool work:**
>
> ```typescript
> Skill({ skill: "mcp-builder" })
> ```
>
> **Required when:**
> - Creating ANY new tool (even if small)
> - Modifying tool schemas or parameters
> - Changing tool response formats
> - Adding/updating tool annotations
> - Validating MCP protocol compliance
> - Designing workflow-centric tool APIs
>
> This skill ensures:
> - Adherence to MCP specification
> - LLM-friendly error messages
> - Proper tool annotations
> - Workflow-centric design (not just API wrappers)
>
> **Don't skip this step** - it prevents protocol violations and poor LLM UX.

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

## Reference Documentation

### Grist API Specifications

- `docs/reference/grist-api-spec.yml` - OpenAPI specification
- `docs/reference/grist-types.d.ts` - TypeScript type definitions
- `docs/reference/grist-apply-actions.d.ts` - UserAction tuple types
- `docs/reference/grist-database-schema.md` - Metadata schema v44 (18 tables)

### MCP Server Guides

- `docs/VALIDATION_RULES.md` - Complete validation constraints (Python keywords, ISO currencies, etc.)
- `docs/ARCHITECTURE.md` - Registry system, type flow diagrams
- `docs/TESTING.md` - Docker setup, test procedures
- `docs/DEVELOPMENT.md` - TypeScript patterns, Grist formulas
- `docs/CURRENT_STATUS.md` - Latest project status
- `docs/COMPREHENSIVE_REVIEW_2025-01-09.md` - Quality review (9.8/10 A+)

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

**Critical:** Pitfalls #8-10 are the **#1 source of user errors**. Always use encoding helpers from `tests/helpers/cell-values.ts`. A type-safe production encoding system is planned in the improvement roadmap to catch these at compile-time.

---

## Development Commands

```bash
# Build
npm run build        # TypeScript → dist/
npm run dev          # Watch mode with tsx

# Testing
npm test             # All tests (174 tests)
npm run test:watch   # Watch mode
npm run test:ui      # Visual test UI
npm run test:no-cleanup  # Keep test data for inspection

# Docker
docker compose up -d && sleep 12  # Start + wait for initialization
docker compose down -v            # Stop and remove volumes

# Code Quality
npm run format       # Biome format
npm run lint         # Biome lint
npm run check        # Format + lint
```

---

## Adding New Features

### New Tool

**Workflow (MANDATORY agent/skill integration):**

1. **Pre-Planning Phase** ⚠️ REQUIRED
   ```typescript
   // STEP 1: Fetch MCP best practices
   Skill({ skill: "mcp-builder" })

   // STEP 2: Fetch Zod v3 docs
   mcp__context7__get-library-docs({
     context7CompatibleLibraryID: "/websites/v3_zod_dev",
     topic: "schema definition, validation, error handling",
     tokens: 8000
   })
   ```

2. **Planning Phase**
   - Review tool naming convention (grist_{verb}_{noun})
   - Determine appropriate annotation preset
   - Design workflow-centric API (not just endpoint wrapper)
   - Plan error messages with actionable guidance

3. **Implementation Phase**
   ```typescript
   // STEP 3: Invoke typescript-advanced-types if using branded types
   Skill({ skill: "typescript-advanced-types" })
   ```
   - Add entry to `src/registry/tool-definitions.ts` (`ALL_TOOLS` array)
   - Create Zod schema in appropriate tool file
   - Implement handler function with type-safe patterns
   - Use annotation preset (READ_ONLY_ANNOTATIONS, WRITE_SAFE_ANNOTATIONS, etc.)

4. **Review Phase** ⚠️ REQUIRED
   ```typescript
   // STEP 4: Get expert TypeScript review
   Task({
     subagent_type: "javascript-typescript:typescript-pro",
     description: "Review new tool implementation",
     prompt: "Analyze the new tool for type safety, error handling, and TypeScript best practices..."
   })
   ```

5. **Validation Phase**
   - Verify tool schema and response format (mcp-builder patterns)
   - Add integration tests in `tests/`
   - Run tests against Docker container

6. **Quality Check**
   - ✅ Zero `any` types in implementation
   - ✅ Actionable error messages with suggestions
   - ✅ Strict mode compliance
   - ✅ MCP protocol compliance
   - ✅ Type inference preserved throughout

### New Validation Rule

1. Update schema in `src/schemas/common.ts` or create new schema
2. Document in `docs/VALIDATION_RULES.md`
3. Add negative test cases in `tests/negative-tests.test.ts`

### New Widget Option

1. Add to discriminated union in `src/schemas/widget-options.ts`
2. Add cross-field validation if needed (`.superRefine()`)
3. Add preprocessing if needed (Python dict compatibility)
4. Test in `tests/widget-options.test.ts`

---

## Quality Standards

**Current Status:** 9.8/10 (A+) - Top 5% of TypeScript projects

**Maintain these standards:**
- Zero `any` types in production code
- 100% TypeScript strict mode compliance
- Comprehensive Zod validation
- Actionable error messages with guidance
- Full test coverage for all column types
- Docker integration testing for all tools

**Reference:** `docs/COMPREHENSIVE_REVIEW_2025-01-09.md` for quality benchmarks
