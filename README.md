# Grist MCP Server

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/gwhthompson/grist-mcp-server)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple.svg)](https://modelcontextprotocol.io)

Model Context Protocol server with 22 tools for the Grist API.

## Quick Start

### Claude Code (recommended)

```bash
claude mcp add grist --env GRIST_API_KEY=your_api_key --env GRIST_BASE_URL=https://docs.getgrist.com -- npx -y grist-mcp-server
```

### Claude Desktop (MCPB bundle)

1. Download `grist-mcp-server.mcpb` from [Releases](https://github.com/gwhthompson/grist-mcp-server/releases)
2. In Claude Desktop: Settings → Developer → MCP Servers → Install from MCPB
3. Configure your Grist API key and base URL
4. Restart Claude Desktop

### Manual configuration (.mcp.json)

Add to your `.mcp.json` file:

```json
{
  "mcpServers": {
    "grist": {
      "command": "npx",
      "args": ["-y", "grist-mcp-server"],
      "env": {
        "GRIST_API_KEY": "your_api_key",
        "GRIST_BASE_URL": "https://docs.getgrist.com"
      }
    }
  }
}
```

### Install from source

```bash
git clone https://github.com/gwhthompson/grist-mcp-server.git
cd grist-mcp-server
npm install && npm run build
```

Add to your MCP config:

```json
{
  "mcpServers": {
    "grist": {
      "command": "node",
      "args": ["/path/to/grist-mcp-server/dist/index.js"],
      "env": {
        "GRIST_API_KEY": "your_api_key",
        "GRIST_BASE_URL": "https://docs.getgrist.com"
      }
    }
  }
}
```

## Tools

<!-- TOOLS_TABLE_START -->
| Tool | Purpose |
|------|---------|
| `grist_get_workspaces` | List and filter workspaces |
| `grist_get_documents` | Find documents by ID, name, or workspace |
| `grist_get_tables` | Get table structure and schema |
| `grist_query_sql` | Run SQL queries with JOINs and aggregations |
| `grist_get_records` | Fetch records with filters |
| `grist_add_records` | Insert new records |
| `grist_update_records` | Modify records by row ID |
| `grist_upsert_records` | Add or update by unique key (sync) |
| `grist_delete_records` | Delete records permanently |
| `grist_create_table` | Create table with columns |
| `grist_rename_table` | Rename table |
| `grist_delete_table` | Delete table permanently |
| `grist_create_summary_table` | Create summary tables for aggregations and chart data sources |
| `grist_manage_columns` | Add, modify, delete, rename columns |
| `grist_manage_conditional_rules` | Add visual formatting rules that highlight cells based on conditions |
| `grist_create_document` | Create new Grist documents or copy existing ones |
| `grist_get_pages` | Introspect document structure including pages, widgets, and summary tables |
| `grist_build_page` | Create pages with pre-configured widget layouts and linking |
| `grist_configure_widget` | Configure widget properties, linking, sorting, and filtering |
| `grist_update_page` | Rename, reorder, or delete existing pages |
| `grist_manage_webhooks` | Create and manage webhooks for real-time event notifications |
| `grist_help` | Get detailed documentation and examples for any tool |
<!-- TOOLS_TABLE_END -->

## Examples

### Create a database

```
1. grist_list_workspaces → find workspace
2. grist_create_document → create document
3. grist_create_table → create tables
```

### Import data

```
1. grist_list_documents → find document
2. grist_get_tables → check structure
3. grist_upsert_records → sync data (adds new, updates existing)
```

### Query data

```
1. grist_get_tables → understand schema
2. grist_query_sql → run SQL with JOINs and aggregations
```

## Troubleshooting

**Server won't start:** Check `GRIST_API_KEY` is set in config.

**Authentication fails:** Verify API key at https://docs.getgrist.com/settings/keys.

**Empty document list:** Check `GRIST_BASE_URL` matches your Grist instance.

**Connection errors (self-hosted):** Verify URL includes `https://` and server is reachable.

## Testing

```bash
npm test  # Docker required - container lifecycle is automatic
```

## Documentation

This server uses [progressive disclosure](https://www.anthropic.com/engineering/code-execution-with-mcp) to reduce context usage. Tool descriptions are kept concise, with full documentation available via `grist_help`:

- `grist_help tool_name="grist_add_records" topic="examples"` - usage examples
- `grist_help tool_name="grist_upsert_records" topic="errors"` - troubleshooting

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Links

- [Grist Documentation](https://support.getgrist.com)
- [Grist Community](https://community.getgrist.com)
- [MCP Protocol](https://modelcontextprotocol.io)
- [Report Issues](https://github.com/gwhthompson/grist-mcp-server/issues)
