# CLAUDE.md

## Commands

```bash
npm run build   # Compile TypeScript
npm test        # Full test suite (Docker required)
npm run lint    # Check code quality
npm run format  # Auto-format with Biome
```

**Definition of done:** `npm run build && npm run lint && npm test` all pass. No `any` types.

---

## Docker Testing

```bash
# Option 1: Automatic (tests handle Docker lifecycle)
npm test

# Option 2: Manual startup
docker run -d --name grist-mcp-test -p 8989:8484 \
  -e GRIST_BOOT_KEY=test_boot_key \
  -e GRIST_FORCE_LOGIN=true \
  -e GRIST_DEFAULT_EMAIL=test@example.com \
  -e GRIST_SINGLE_ORG=example \
  gristlabs/grist:latest

# Wait and bootstrap API key
sleep 10
API_KEY=$(curl -sf http://localhost:8989/api/profile/apiKey -H "x-boot-key: test_boot_key" | tr -d '"')
export GRIST_API_KEY=$API_KEY GRIST_BASE_URL=http://localhost:8989
npm test
docker rm -f grist-mcp-test
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
