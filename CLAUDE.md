# CLAUDE.md

## Commands

```bash
npm run build       # Compile TypeScript
npm test            # Full test suite (Docker auto-managed)
npm run check       # Format + lint with Biome
npm run grist       # Docker management (see below)
```

**Definition of done:** `npm run build && npm run check && npm test` all pass. No `any` types.

---

## Grist Docker Management

```bash
# Container lifecycle
npm run grist start              # Start with ephemeral port, print env vars
npm run grist stop               # Stop container
npm run grist status             # Show URL and API key if running

# MCP Inspector
npm run grist inspect            # GUI mode (web UI)
npm run grist inspect dev        # GUI + hot reload (tsx)
npm run grist inspect cli -- --method tools/list
npm run grist inspect cli -- --method tools/call --tool-name grist_list_tables
```

---

## Testing CLI Args

All test variations use CLI args (no dedicated scripts):

```bash
npm test                               # Full suite
npm test -- tests/unit                 # Unit tests only
npm test -- tests/contracts            # Contract tests
npm test -- --coverage                 # Coverage report
npm test -- --reporter=verbose         # Verbose output
npm test -- --ui                       # Browser UI
npm run test:watch                     # Watch mode
npm run test:watch -- tests/unit       # Watch unit tests
SKIP_CLEANUP=true npm test             # Keep container for debugging
```

Tests require `dangerouslyDisableSandbox: true` in Bash tool.

---

## Key Paths

- `src/registry/types.ts` - ToolDefinition interface and annotation presets
- `src/registry/tool-definitions.ts` - ALL_TOOLS aggregator
- `src/tools/*.ts` - Tool implementations with co-located definitions
- `src/schemas/` - Zod validation schemas
- Grist API reference: Invoke `grist-reference` skill

---

## Tool Patterns

`executeInternal()` returns raw data. `formatResponse()` wraps it.

```typescript
// Standard pattern (95% of tools)
protected async executeInternal(params: Input): Promise<Output> {
  return { success: true, data: await this.client.getData() }
}
// Base class handles formatting
```

Never return MCPToolResponse from executeInternal - causes double-wrapping.

**Tool naming:** `grist_{verb}_{noun}`

**Annotations:** Use presets from tool-definitions.ts (READ_ONLY, WRITE_SAFE, WRITE_IDEMPOTENT, DESTRUCTIVE)

---

## Validation Rules

- **DocId:** Base58, 22 chars, excludes `0OIl`
- **TableId:** UPPERCASE start, Python identifier, no Python keywords
- **ColId:** Python identifier, no `gristHelper_` prefix

---

## Critical Gotchas

1. **UserAction format** - `[["AddTable", ...]]` not `{actions: [...]}`
2. **visibleCol** - Top-level property, NOT in widgetOptions
3. **Natural formats** - Users provide `["a","b"]` not `["L","a","b"]`
4. **Import extensions** - Use `.js` even for `.ts` files (Node16 ESM)

---

## Testing Philosophy

- Prefer unit tests for preprocessing, validation, formatting
- Integration tests only for workflows requiring actual Grist
- Test natural formats, not internal encoding
- `cell-values.ts` helpers are for verifying Grist responses, not simulating input

---

## Agent Usage

| Task | Action |
|------|--------|
| MCP tools | Invoke `mcp-builder` skill |
| Zod schemas | Fetch Zod v3 docs via Context7 |
| Complex types | Invoke `typescript-pro` agent |

**Zod v3 (not v4):** Fetch docs via Context7 with `/websites/v3_zod_dev`

---

## Documentation

- Tool docs: `tool.docs` in each tool file (single source of truth)
- API quirks: Invoke `grist-reference` skill (see references/grist-api-behavior.md)
- Build generates manifest.json and README tools table from ALL_TOOLS
