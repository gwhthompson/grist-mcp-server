---
name: prefer-grist-inspect-cli
enabled: true
event: bash
conditions:
  - field: command
    operator: regex_match
    pattern: npx @anthropic-ai/mcpb.*--method tools/list
action: warn
---

**Use the project's npm script for MCP inspection**

Don't invoke `npx @anthropic-ai/mcpb` directly.

**Instead of:**
```bash
npx @anthropic-ai/mcpb inspect --method tools/list
```

**Use:**
```bash
npm run grist inspect cli -- --method tools/list
npm run grist inspect cli -- --method tools/call --tool-name grist_list_tables
```

The `npm run grist inspect` command handles Docker container management and environment setup automatically.
