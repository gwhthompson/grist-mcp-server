# Development Guide

## TypeScript Refactoring Summary

**Maturity**: Improved from 7/10 to 8.5/10

### Key Improvements
- **Branded Types**: DocId, TableId, WorkspaceId, RowId, ColId for type safety
- **Generic Methods**: Full type inference in HTTP client
- **Zod Validation**: Runtime validation for all API responses  
- **Eliminated**: 20 `any` types from core services

### Advanced Types Created
- Conditional types: `WorkspaceResult<D>`, `TableResult<D>`
- Template literal types for API paths
- Type guards for runtime validation
- Generic response wrappers

---

## Testing

### Run Tests
\`\`\`bash
npm test                  # All 174 tests (100% passing)
npm run test:watch        # Watch mode
npm run test:ui           # Visual UI
npm run test:no-cleanup   # Keep data for inspection
\`\`\`

### Test Coverage
- **174 Vitest tests** - 100% passing
- All 11 Grist column types tested
- All CellValue encodings validated
- All widgetOptions properties tested
- Validated against live Docker Grist

### Manual Inspection
\`\`\`bash
npm run test:no-cleanup
open http://localhost:8989
\`\`\`

---

## Grist API Notes

### Reference Columns
**Column Type**: Use \`Ref:TargetTable\` format
\`\`\`typescript
type: 'Ref:People'        // ✅ Column definition
Customer: 1               // ✅ Data (plain row ID)
Customer: ["R", "People", 1]  // ❌ Wrong for data
\`\`\`

### RefList Columns
**Column Type**: Use \`RefList:TargetTable\`
\`\`\`typescript
type: 'RefList:Tags'      // ✅ Column definition
Tags: ["L", 1, 2, 3]      // ✅ Data (List encoding)
Tags: null                // ✅ Empty RefList
\`\`\`

### DateTime Encoding
- **Writing**: Both formats work (primitive or encoded)
- **Reading**: Always returns primitive timestamp

### Formula Columns
Use Grist functions for calculations:
\`\`\`typescript
formula: 'DAYS($EndDate, $StartDate)'    // ✅ Returns number
formula: '$Customer.Name'                 // ✅ Reference lookup
\`\`\`

---

## Project Structure
\`\`\`
src/
  ├── types/advanced.ts          # Branded types, conditionals
  ├── schemas/api-responses.ts   # Zod validation
  ├── services/                  # HTTP client, formatters
  └── tools/                     # 15 MCP tools
tests/                           # 174 Vitest tests
docs/                            # Documentation
scripts/integration/             # Integration test scripts
\`\`\`
