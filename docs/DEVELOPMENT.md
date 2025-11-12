# Development Guide - Grist MCP Server

**Last Updated:** January 12, 2025
**Current Version:** v1.2.2

---

## Table of Contents

- [Quick Start](#quick-start)
- [Development Commands](#development-commands)
- [Project Structure](#project-structure)
- [Architecture Overview](#architecture-overview)
- [TypeScript Patterns](#typescript-patterns)
- [Adding New Features](#adding-new-features)
- [Grist API Patterns](#grist-api-patterns)
- [Testing Workflow](#testing-workflow)
- [Code Quality Standards](#code-quality-standards)
- [Common Pitfalls](#common-pitfalls)
- [Debugging Tips](#debugging-tips)
- [Performance Considerations](#performance-considerations)
- [Contributing Guidelines](#contributing-guidelines)
- [Resources](#resources)
- [Summary](#summary)

---

## Quick Start

### Prerequisites
- Node.js 18+ (LTS recommended)
- Docker Desktop (for integration testing)
- Git

### Setup
```bash
# Clone repository
git clone <repository-url>
cd grist-mcp-server

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start Docker Grist for testing
docker compose up -d && sleep 12

# Set environment variables
export GRIST_API_KEY=test_api_key
export GRIST_BASE_URL=http://localhost:8989

# Run tests
npm test
```

---

## Development Commands

### Build & Type Check
```bash
npm run build        # Compile TypeScript → dist/
npm run dev          # Watch mode with tsx
npx tsc --noEmit     # Type check without building
```

### Code Quality
```bash
npm run format       # Biome format (auto-fix)
npm run lint         # Biome lint
npm run check        # Format + lint
```

### Testing
```bash
npm test                  # All 350 tests
npm run test:watch        # Watch mode for development
npm run test:ui           # Visual test UI
npm run test:no-cleanup   # Keep test data for inspection
```

### Docker
```bash
docker compose up -d && sleep 12  # Start + wait for initialization
docker compose down -v            # Stop and remove volumes
docker logs grist-mcp-server-grist-1  # Check logs
```

---

## Project Structure

```
grist-mcp-server/
├── src/
│   ├── index.ts                     # Entry point (~395 lines)
│   ├── types.ts                     # Core type definitions
│   ├── constants.ts                 # Constants and defaults
│   ├── types/
│   │   ├── advanced.ts              # Branded types, conditionals
│   │   └── value-objects.ts         # Value object patterns
│   ├── schemas/
│   │   ├── api-responses.ts         # Zod response validation
│   │   ├── common.ts                # Reusable schema components
│   │   └── widget-options.ts        # Widget options by column type
│   ├── registry/
│   │   ├── tool-definitions.ts      # All 15 tool definitions (~1237 lines)
│   │   └── tool-registry.ts         # Registration system (~594 lines)
│   ├── services/
│   │   ├── grist-client.ts          # HTTP client with retry/rate limiting
│   │   ├── action-builder.ts        # UserAction builders
│   │   ├── column-resolver.ts       # visibleCol name → ID resolution
│   │   └── formatter.ts             # JSON/Markdown formatters
│   ├── encoding/
│   │   └── cell-value-helpers.ts    # Production encoding helpers
│   ├── tools/
│   │   ├── discovery.ts             # Workspace/document/table discovery
│   │   ├── reading.ts               # SQL queries and record retrieval
│   │   ├── records.ts               # Record CRUD operations
│   │   ├── tables.ts                # Table management
│   │   ├── columns.ts               # Column management
│   │   └── documents.ts             # Document creation
│   └── errors/
│       └── ValidationError.ts       # Custom error classes
├── tests/
│   ├── *.test.ts                    # 17 test files, 350 tests
│   └── helpers/
│       ├── setup.ts                 # Test environment setup
│       └── cell-values.ts           # CellValue encoding helpers
├── docs/
│   ├── ARCHITECTURE.md              # System architecture
│   ├── TESTING.md                   # Testing guide
│   ├── DEVELOPMENT.md               # This file
│   ├── VALIDATION_RULES.md          # Validation constraints
│   ├── STATUS.md                    # Project status
│   ├── CHANGELOG.md                 # Version history
│   ├── decisions/                   # Architectural decision records
│   │   └── 001-branded-types-at-api-boundaries.md
│   └── reference/                   # Grist API reference (read-only)
│       ├── grist-api-spec.yml
│       ├── grist-types.d.ts
│       ├── grist-apply-actions.d.ts
│       └── grist-database-schema.md
├── compose.yml                      # Docker Grist for testing
├── package.json                     # Dependencies and scripts
├── tsconfig.json                    # TypeScript configuration
├── biome.json                       # Biome linter/formatter config
└── README.md                        # Project overview
```

---

## Architecture Overview

### Registry-Based Tool System

The server uses a **modular registry architecture** that reduced the main entry point by 62%:

**Before:** 1,047 lines in `src/index.ts` with inline tool registration
**After:** 395 lines with registry-based registration

**Benefits:**
- ✅ Add new tools with one entry in `ALL_TOOLS` array
- ✅ Automatic Zod → JSON Schema conversion
- ✅ Type-safe handlers with full inference
- ✅ DRY annotation presets
- ✅ Zero `any` types in tool handlers

### Core Components

**1. Tool Definitions (`src/registry/tool-definitions.ts`)**
- Array of 15 tool definitions
- Zod schemas with strict validation
- Type-safe handlers
- Annotation presets (READ_ONLY, WRITE_SAFE, DESTRUCTIVE, WRITE_IDEMPOTENT)

**2. Tool Registry (`src/registry/tool-registry.ts`)**
- Generic registration system
- Zod → JSON Schema conversion
- Handler wrapper with validation
- Batch registration strategies

**3. GristClient (`src/services/grist-client.ts`)**
- HTTP client with retry logic
- Rate limiting (100 requests/minute)
- Caching (5-minute TTL)
- Enhanced error messages (400 + 500)
- Automatic credential sanitization

**4. Encoding Helpers (`src/encoding/cell-value-helpers.ts`)**
- Production helpers for CellValue encoding
- Type-safe builders for complex types
- Exported for external use

---

## TypeScript Patterns

### Branded Types (Type Safety)

Prevents ID mixing at compile time:

```typescript
type DocId = Brand<string, 'DocId'>
type TableId = Brand<string, 'TableId'>
type RowId = Brand<number, 'RowId'>

// This won't compile:
const docId: DocId = 'abc123' as DocId
const tableId: TableId = docId  // ❌ Type error!
```

**Location:** `src/types/advanced.ts`

### Conditional Types

Detail-level responses with type inference:

```typescript
type WorkspaceResult<D extends DetailLevel> =
  D extends 'summary' ? SummaryWorkspace : DetailedWorkspace

// Usage in handlers:
function getWorkspaces<D extends DetailLevel>(
  params: { detail_level: D }
): WorkspaceResult<D>[] {
  // TypeScript knows the exact return type!
}
```

**Location:** `src/types/advanced.ts`

### Template Literal Types

Type-safe API paths:

```typescript
type ApiPath =
  | `/api/docs/${string}`
  | `/api/docs/${string}/tables/${string}/records`

// Enforced at compile time:
const path: ApiPath = '/api/docs/abc123/tables/Products/records'  // ✅
const bad: ApiPath = '/api/invalid'  // ❌ Type error
```

**Location:** `src/types/advanced.ts`

### Generic Tool Handlers

Full type inference from Zod schema:

```typescript
interface ToolDefinition<TSchema extends z.ZodTypeAny> {
  inputSchema: TSchema
  handler: (client: GristClient, params: z.infer<TSchema>) => Promise<MCPToolResponse>
}

// TypeScript infers params type from schema!
const GET_WORKSPACES: ToolDefinition<typeof GetWorkspacesSchema> = {
  inputSchema: GetWorkspacesSchema,
  handler: async (client, params) => {
    // params.name_contains is fully typed!
  }
}
```

**Location:** `src/registry/tool-definitions.ts`

---

## Adding New Features

### Adding a New Tool

**1. Define Zod Schema (in tool file, e.g., `src/tools/documents.ts`):**
```typescript
export const UpdateDocumentSchema = z.object({
  docId: z.string().describe('Document ID'),
  name: z.string().min(1).describe('New document name')
}).strict()
```

**2. Create Handler Function:**
```typescript
export async function updateDocument(
  client: GristClient,
  params: z.infer<typeof UpdateDocumentSchema>
): Promise<MCPToolResponse> {
  // Implementation
}
```

**3. Add Entry to `ALL_TOOLS` Array (`src/registry/tool-definitions.ts`):**
```typescript
{
  category: 'documents',
  name: 'grist_update_document',
  title: 'Update Document',
  description: `Update a Grist document's properties...`,
  inputSchema: UpdateDocumentSchema,
  annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
  handler: updateDocument
}
```

**4. Registration is automatic!** The registry system handles everything else.

### Adding a New Column Type

**1. Add Widget Options Schema (if needed) in `src/schemas/widget-options.ts`**

**2. Update CellValue Encoding (if complex type) in `src/encoding/cell-value-helpers.ts`**

**3. Add Tests in `tests/column-types.test.ts`**

**4. Document in Tool Description** (encoding guide in `grist_add_records`)

### Adding Validation Rules

**1. Update Zod Schema:**
```typescript
const MySchema = z.object({
  field: z.string().min(1).max(255).regex(/^[A-Z]/)
}).strict()
```

**2. Add Cross-Field Validation (if needed):**
```typescript
MySchema.superRefine((data, ctx) => {
  if (data.fieldA === 'value' && !data.fieldB) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fieldB'],
      message: 'fieldB required when fieldA is "value"'
    })
  }
})
```

**3. Document in `docs/VALIDATION_RULES.md`**

**4. Add Negative Test in `tests/negative-tests.test.ts`**

---

## Grist API Patterns

### Critical Patterns to Remember

**1. UserAction Format (EASY TO GET WRONG)**

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

**2. Widget Options Processing**

```typescript
// Input (any of these work):
widgetOptions: { choices: ['A', 'B'] }           // JavaScript object
widgetOptions: '{"choices":["A","B"]}'           // JSON string
widgetOptions: "{'choices':['A','B']}"           // Python dict string

// Processing flow:
1. Preprocess: Python dict → valid JSON
2. Validate: Zod schema with cross-field checks
3. Serialize: Object → JSON string
4. Send to Grist: '{"choices":["A","B"]}'
```

**3. visibleCol Auto-Resolution**

```typescript
// User provides at top-level (NOT in widgetOptions!)
{
  action: 'add',
  colId: 'Manager',
  type: 'Ref:People',
  visibleCol: "Name"  // String name (recommended) OR numeric ID
}

// MCP server resolves to numeric ID before API call
const numericId = await resolveVisibleCol(client, docId, "People", "Name")

// Sent to Grist API
visibleCol: 456  // Numeric ID at top-level
```

**4. CellValue Encoding**

```typescript
// ❌ WRONG - Plain arrays don't work
await addRecords({
  Tags: [['Popular', 'New']]  // Missing "L" prefix!
})

// ✅ CORRECT - Use encoding helpers
import { createList } from '../src/encoding/cell-value-helpers.js'

await addRecords({
  Tags: [createList('Popular', 'New')]  // Returns ["L", "Popular", "New"]
})
```

### Reference Documentation

**Always check `docs/reference/` for Grist API specifications:**
- `grist-api-spec.yml` - OpenAPI spec for REST endpoints
- `grist-types.d.ts` - TypeScript type definitions
- `grist-apply-actions.d.ts` - UserAction tuple types
- `grist-database-schema.md` - Metadata schema v44

**⚠️ NEVER MODIFY** files in `docs/reference/` - they document the upstream Grist API.

---

## Testing Workflow

### Test-Driven Development

**1. Write Test First:**
```typescript
it('should create a document with custom name', async () => {
  const result = await createDocument({
    workspaceId: testWorkspace.id,
    name: 'My Custom Document'
  })

  expect(result.name).toBe('My Custom Document')
  expect(result.id).toMatch(/^[A-Za-z0-9_-]{22}$/)
})
```

**2. Implement Feature:**
```typescript
export async function createDocument(
  client: GristClient,
  params: z.infer<typeof CreateDocumentSchema>
): Promise<MCPToolResponse> {
  // Implementation
}
```

**3. Run Tests:**
```bash
npm test tests/documents.test.ts
```

**4. Iterate Until Green**

### Integration Testing Against Docker

**All tests run against a real Grist instance:**
- Ensures API compatibility
- Validates actual behavior
- Catches encoding issues
- Verifies error messages

**Test data is isolated:**
- Each test file creates its own documents
- Cleanup happens automatically
- Use `test:no-cleanup` to inspect data

---

## Code Quality Standards

### TypeScript Strict Mode

**All strict flags enabled:**
```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true
}
```

**Zero `any` types in production code** (except at MCP SDK boundary)

### Zod Validation

**All schemas use `.strict()`:**
```typescript
const MySchema = z.object({
  field: z.string()
}).strict()  // Reject unknown properties
```

**Provide defaults for optional fields:**
```typescript
response_format: z.enum(['json', 'markdown']).default('markdown')
```

### Error Handling

**Actionable error messages with guidance:**
```typescript
// ✅ GOOD - Specific guidance
throw new Error(
  `Document not found. Verify docId="${docId}" is correct. ` +
  `Try listing accessible documents with grist_get_documents first.`
)

// ❌ BAD - No context
throw new Error('docs not found')
```

### Imports

**Always use `.js` extensions (Node16 module resolution):**
```typescript
import { GristClient } from './services/grist-client.js'  // ✅ Correct
import { GristClient } from './services/grist-client'     // ❌ Wrong
```

---

## Common Pitfalls

1. **UserAction format** - Send array directly, not `{actions: [...]}`
2. **GRIST_BASE_URL** - Never include `/api` suffix
3. **Docker post_start** - Wait 12 seconds after `docker compose up -d`
4. **visibleCol** - Auto-resolve column names to numeric IDs
5. **Widget options** - Serialize objects to JSON strings before `/apply`
6. **Python keywords** - Block `for`, `class`, etc. in tableId/colId
7. **Import extensions** - Always use `.js` for ESM imports
8. **CellValue encoding** - Use helpers for ChoiceList, Date, DateTime
9. **Branded types** - Cast at API boundary with `as`
10. **Test cleanup** - Always clean up created documents/tables

---

## Debugging Tips

### Enable Verbose Logging

Set environment variable:
```bash
DEBUG=grist:* npm test
```

### Inspect API Calls

Use the `GristClient` logging:
```typescript
// Temporarily enable in grist-client.ts
console.log('Request:', method, url, data)
console.log('Response:', response.status, response.data)
```

### Check Docker Logs

```bash
docker logs grist-mcp-server-grist-1 --tail 100 -f
```

### Keep Test Data

```bash
npm run test:no-cleanup
# Then visit http://localhost:8989 to inspect
```

### Run Single Test

```bash
npm test tests/my-feature.test.ts

# Or specific test case:
npm test tests/my-feature.test.ts -t "should do X"
```

---

## Performance Considerations

### Rate Limiting

The `GristClient` enforces 100 requests/minute:
```typescript
// Automatically handled by client
// Requests are queued and throttled
```

### Caching

GET requests are cached for 5 minutes:
```typescript
// Cache is automatically cleared on mutations
// Manually clear: client.clearCache()
```

### Bulk Operations

Use bulk record operations when possible:
```typescript
// ✅ GOOD - Single API call
await addRecords({
  records: [record1, record2, record3]
})

// ❌ BAD - Multiple API calls
await addRecords({ records: [record1] })
await addRecords({ records: [record2] })
await addRecords({ records: [record3] })
```

---

## Contributing Guidelines

### Before Submitting

1. ✅ Run `npm run check` (format + lint)
2. ✅ Run `npm run build` (TypeScript compilation)
3. ✅ Run `npm test` (all tests passing)
4. ✅ Update documentation if needed
5. ✅ Add tests for new features
6. ✅ Follow existing code patterns

### Code Review Checklist

- [ ] Zero `any` types added
- [ ] All schemas use `.strict()`
- [ ] Error messages are actionable
- [ ] Tests cover new functionality
- [ ] Documentation updated
- [ ] Follows TypeScript strict mode
- [ ] Import extensions use `.js`
- [ ] CellValue encoding uses helpers

---

## Resources

### Internal Documentation
- **Architecture:** `docs/ARCHITECTURE.md`
- **Testing:** `docs/TESTING.md`
- **Validation:** `docs/VALIDATION_RULES.md`
- **Status:** `docs/STATUS.md`
- **Changelog:** `docs/CHANGELOG.md`

### Grist API Reference
- **OpenAPI:** `docs/reference/grist-api-spec.yml`
- **Types:** `docs/reference/grist-types.d.ts`
- **Actions:** `docs/reference/grist-apply-actions.d.ts`
- **Schema:** `docs/reference/grist-database-schema.md`

### External Resources
- [Grist Documentation](https://support.getgrist.com/)
- [MCP Specification](https://modelcontextprotocol.io/)
- [Zod Documentation](https://zod.dev/)

---

## Summary

The Grist MCP Server is built with:

✅ **Type safety:** Strict TypeScript with branded types
✅ **Quality:** 9.8/10 (A+) quality score
✅ **Testing:** 350 tests, 100% passing
✅ **Architecture:** Modular registry system
✅ **Error handling:** Actionable messages with guidance
✅ **Validation:** Comprehensive Zod schemas
✅ **Documentation:** Extensive guides and references

**Ready for production development!**

---

*Last Updated: January 12, 2025*
*Current Version: 1.2.2*
*For questions or issues, see GitHub repository*
