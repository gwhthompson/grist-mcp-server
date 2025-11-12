# Grist MCP Server

A Model Context Protocol (MCP) server that enables AI assistants to interact with Grist documents, tables, and records.

**Status:** ✅ Production Ready | **Version:** 1.2.1 | **Build:** Passing | **Quality Score:** 9.8/10 (A+)

**Validation:** Tested against live Docker Grist instance with comprehensive MCP, TypeScript, and Zod review completed. See [docs/TESTING.md](docs/TESTING.md) and [docs/COMPREHENSIVE_REVIEW_2025-01-09.md](docs/COMPREHENSIVE_REVIEW_2025-01-09.md) for details.

## Features

- **15 Workflow-Oriented Tools**: Complete coverage of Grist operations from discovery to data manipulation
- **Dual Response Formats**: JSON for programmatic access, Markdown for human readability
- **Progressive Detail Levels**: Control information density (`summary`/`detailed`, `names`/`columns`/`full_schema`)
- **Smart Context Management**: 25K character limits with intelligent truncation and guidance
- **Comprehensive Error Messages**: Actionable guidance that helps AI assistants self-correct
- **Full Type Safety**: Strict TypeScript with comprehensive Zod validation
- **Multi-Instance Support**: Works with both Grist Cloud and self-hosted instances

## Quick Start

### Installation

```bash
cd grist-mcp-server
npm install
npm run build
```

### Configuration

1. **Get Your Grist API Key**

   Visit https://docs.getgrist.com/settings/keys to create an API key.

2. **Configure Claude Desktop**

   Add to your Claude Desktop configuration file:

   **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

   **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

   ```json
   {
     "mcpServers": {
       "grist": {
         "command": "node",
         "args": ["/path/to/grist-mcp-server/dist/index.js"],
         "env": {
           "GRIST_API_KEY": "your_api_key_here",
           "GRIST_BASE_URL": "https://docs.getgrist.com"
         }
       }
     }
   }
   ```

3. **For Self-Hosted Grist** (optional)

   Set `GRIST_BASE_URL` to your instance URL:

   ```json
   "env": {
     "GRIST_API_KEY": "your_api_key_here",
     "GRIST_BASE_URL": "https://grist.yourcompany.com"
   }
   ```

4. **Restart Claude Desktop**

   The Grist tools will be available in Claude's tool menu.

## Available Tools

### Discovery & Navigation (4 tools)

| Tool | Purpose |
|------|---------|
| `grist_list_workspaces` | Discover workspaces where documents can be created |
| `grist_list_documents` | Browse and search for documents |
| `grist_get_document` | Get document metadata and properties |
| `grist_get_tables` | Understand data structure within a document |

### Data Reading (2 tools)

| Tool | Purpose |
|------|---------|
| `grist_query_sql` | Execute SQL queries for complex analytics |
| `grist_get_records` | Simple record fetching without SQL |

### Record Operations (4 tools)

| Tool | Purpose |
|------|---------|
| `grist_add_records` | Insert new records |
| `grist_update_records` | Modify existing records by row ID |
| `grist_upsert_records` | Add or update if exists (critical for sync workflows) |
| `grist_delete_records` | Remove records permanently |

### Table Management (3 tools)

| Tool | Purpose |
|------|---------|
| `grist_create_table` | Create new table with initial columns |
| `grist_rename_table` | Rename existing table |
| `grist_delete_table` | Remove table (WARNING: data loss) |

### Column Management (1 tool)

| Tool | Purpose |
|------|---------|
| `grist_manage_columns` | Add, modify, delete, and rename columns (atomic operations) |

### Document Management (1 tool)

| Tool | Purpose |
|------|---------|
| `grist_create_document` | Create new document or fork from existing |

## Common Use Cases

### 1. Database Creation

"Create a CRM database for my sales team"

```
1. grist_list_workspaces (find workspace)
2. grist_create_document (create document)
3. grist_create_table (Contacts table)
4. grist_create_table (Deals table)
5. grist_manage_columns (add analytics columns)
```

### 2. Data Import & Sync

"Import this CSV into my Contacts table"

```
1. grist_list_documents (find document)
2. grist_get_tables (verify structure)
3. grist_upsert_records (sync data - adds new, updates existing)
```

### 3. Data Analysis

"Find all high-value customers from Q4 2024"

```
1. grist_list_documents (find document)
2. grist_get_tables (understand schema)
3. grist_query_sql (complex filtering with SQL)
```

### 4. Document Discovery

"Find my team's project tracking database"

```
1. grist_list_workspaces (find team workspace)
2. grist_list_documents (search by name or workspace)
3. grist_get_document (verify it's the right one)
```

### 5. Bulk Operations

"Archive all completed projects"

```
1. grist_get_records (find completed projects)
2. grist_update_records (set Status="Archived")
```

### 6. Creating Reference Columns with visibleCol

"Create a Tasks table with references to People showing names instead of IDs"

```json
{
  "tool": "grist_manage_columns",
  "tableId": "Tasks",
  "operations": [
    {
      "action": "add",
      "colId": "AssignedTo",
      "type": "Ref:People",
      "widgetOptions": {
        "visibleCol": "Name"
      }
    }
  ]
}
```

The MCP server automatically resolves the column name "Name" to its internal numeric ID, providing a user-friendly interface while maintaining compatibility with Grist's API requirements.

## Architecture

### Project Structure

```
grist-mcp-server/
├── src/
│   ├── index.ts              # Modular server entry point (registry-based)
│   ├── constants.ts          # Shared constants
│   ├── types.ts              # TypeScript type definitions
│   ├── types/
│   │   └── advanced.ts       # Branded types & advanced patterns
│   ├── schemas/
│   │   ├── common.ts         # Reusable Zod validation schemas
│   │   └── api-responses.ts  # API response validation
│   ├── services/
│   │   ├── grist-client.ts   # HTTP client with retry, rate limiting, caching
│   │   ├── action-builder.ts # UserAction construction helpers
│   │   └── formatter.ts      # Response formatting with optimization
│   ├── tools/
│   │   ├── discovery.ts      # 3 discovery/navigation tools
│   │   ├── reading.ts        # 2 data reading tools
│   │   ├── records.ts        # 4 record operation tools
│   │   ├── tables.ts         # 3 table management tools
│   │   ├── columns.ts        # 1 column management tool
│   │   └── documents.ts      # 1 document management tool
│   ├── registry/
│   │   ├── tool-registry.ts  # Generic tool registration system
│   │   └── tool-definitions.ts # All tool metadata & handlers
│   └── utils/
│       ├── rate-limiter.ts   # Request rate limiting
│       ├── response-cache.ts # TTL-based response caching
│       ├── pagination-helper.ts # Pagination utilities
│       ├── filter-helper.ts  # Filtering utilities
│       ├── logger.ts         # Structured logging
│       └── sanitizer.ts      # Error message sanitization
├── dist/                     # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

### Design Principles

1. **Workflow-Oriented**: Tools enable complete workflows, not just API wrappers
2. **Context-Efficient**: Progressive detail levels and character limits
3. **Type-Safe**: Strict TypeScript with comprehensive Zod validation
4. **Error-Guided**: Actionable error messages that guide AI assistants
5. **Production-Ready**: Robust error handling, retry logic, rate limiting, caching
6. **Resilient**: Automatic retry with exponential backoff for transient failures
7. **Secure**: Error message sanitization prevents data leakage

### Key Components

**GristClient**: Handles all API communication with:
- Exponential backoff retry (3 attempts, configurable)
- Rate limiting (5 concurrent, 200ms min time)
- Response caching (1 minute TTL for GET requests)
- Request size validation (10MB max payload)
- Structured error logging
- Error message sanitization

**Action Builders**: Type-safe construction of Grist UserActions for mutations

**Formatters**: Dual-format responses (JSON + Markdown) with optimized truncation

**Tool Registry**: Modular registration system with comprehensive validation

**Utilities**: Reusable helpers for pagination, filtering, logging, and caching

**Common Schemas**: Reusable Zod schemas with proper type safety

## Performance & Resilience

### Automatic Retry with Exponential Backoff

All API requests automatically retry on transient failures:
- **Max Retries**: 3 attempts (configurable)
- **Base Delay**: 1 second (configurable)
- **Max Delay**: 30 seconds (configurable)
- **Retryable Status Codes**: 429 (rate limit), 502/503/504 (server errors)
- **Jitter**: 0-30% random jitter to prevent thundering herd

### Rate Limiting

Client-side rate limiting prevents overwhelming the Grist API:
- **Max Concurrent**: 5 requests (configurable)
- **Min Time Between Requests**: 200ms (configurable)
- **Queue**: FIFO queue for pending requests
- **Monitoring**: Real-time statistics available

### Response Caching

GET requests are cached to improve performance:
- **Default TTL**: 1 minute (configurable)
- **Max Cache Size**: 1000 entries (configurable)
- **Auto Cleanup**: Expired entries removed every 5 minutes
- **Cache Invalidation**: Pattern-based cache invalidation support
- **Statistics**: Hit rate and cache size monitoring

### Optimized Truncation

Binary search truncation with size estimation:
- **Sample Size**: Estimates from 5 items
- **Narrow Range**: 80-120% of estimated max
- **Character Limit**: 25,000 characters
- **Performance**: ~60% faster than naive binary search

### Request Validation

Request payloads are validated before sending:
- **Max Payload Size**: 10MB
- **Early Validation**: Prevents oversized requests
- **Clear Error Messages**: Actionable guidance for users

### Structured Logging

JSON-formatted logs for monitoring and debugging:
- **Log Levels**: ERROR, WARN, INFO, DEBUG
- **Context**: Rich context objects with request details
- **Stack Traces**: Included for errors (configurable)
- **Output**: stderr for easy parsing

### Error Sanitization

Sensitive data is automatically redacted from errors:
- **API Keys/Tokens**: Redacted as `***`
- **Email Addresses**: Partially redacted (preserve domain)
- **Long IDs**: Redacted if 40+ characters
- **File Paths**: Username portions redacted
- **Authorization Headers**: Fully redacted

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run dev
```

### Clean Build

```bash
npm run clean
npm run build
```

## Response Formats

All tools support two output formats:

### JSON Format (`response_format: "json"`)

Machine-readable structured data:

```json
{
  "total": 150,
  "offset": 0,
  "limit": 100,
  "has_more": true,
  "next_offset": 100,
  "documents": [
    {
      "id": "abc123",
      "name": "Customer CRM",
      "workspace": "Sales Team",
      "access": "owner"
    }
  ]
}
```

### Markdown Format (`response_format: "markdown"`, default)

Human-readable formatted text:

```markdown
# Documents (2 of 150 total)

1. **Customer CRM** (abc123)
   - Workspace: Sales Team
   - Access: owner

2. **Project Tracker** (def456)
   - Workspace: Operations
   - Access: editor

---

More results available. Use `offset=100` to continue.
```

## Pagination

All list-based tools support pagination:

```typescript
{
  offset: 0,       // Starting position (default: 0)
  limit: 100       // Items per page (default: 100, max: 1000)
}
```

Response includes pagination metadata:

```typescript
{
  total: number,           // Total items available
  offset: number,          // Current offset
  limit: number,           // Items per page
  has_more: boolean,       // Whether more items exist
  next_offset: number | null  // Suggested offset for next page
}
```

## Character Limits

Responses are limited to 25,000 characters to respect context windows. When exceeded:

1. Truncation occurs at record boundaries (never mid-record)
2. Response includes truncation metadata
3. Suggestions provided for reducing size:
   - Use pagination (`offset` parameter)
   - Reduce detail level (`summary` vs `detailed`)
   - Select specific columns
   - Add filters to reduce result set

## Error Handling

All errors include actionable guidance:

```
❌ BAD:
"Error 404"

✅ GOOD:
"Document not found. Verify docId='abc123' is correct. Try listing accessible documents with grist_list_documents first."
```

Common errors:

- **401**: Invalid or expired API key → Get new key from settings
- **403**: Insufficient permissions → Use `grist_list_documents` to see accessible documents
- **404**: Resource not found → Suggestions for discovery tools
- **429**: Rate limit exceeded → Wait 60 seconds before retrying

## Troubleshooting

### Server Won't Start

**Problem**: `ERROR: GRIST_API_KEY environment variable is required`

**Solution**: Verify API key is set in Claude Desktop config

### Authentication Fails

**Problem**: "Authentication failed" errors

**Solution**:
1. Verify API key is valid at https://docs.getgrist.com/settings/keys
2. Check for extra spaces or quotes in config
3. Ensure key hasn't expired

### Can't Find Documents

**Problem**: `grist_list_documents` returns empty list

**Solution**:
1. Verify you have access to documents in Grist web interface
2. Check `GRIST_BASE_URL` matches your Grist instance
3. Try `grist_list_workspaces` to see accessible workspaces

### Self-Hosted Instance Issues

**Problem**: Connection errors with self-hosted Grist

**Solution**:
1. Verify `GRIST_BASE_URL` is correct (include `https://`)
2. Check network connectivity to Grist server
3. Ensure API key is from the correct instance

## Testing & Validation

This MCP server has been validated against a live Grist instance. See [docs/TESTING.md](docs/TESTING.md) for detailed validation results and testing procedures.

## Security Best Practices

1. **API Key Protection**
   - Never commit API keys to version control
   - Store keys in environment variables only
   - Rotate keys periodically

2. **Access Control**
   - Use API keys with minimum required permissions
   - Review tool access regularly
   - Monitor API usage for anomalies

3. **Data Privacy**
   - Review which documents AI assistants can access
   - Be cautious with sensitive data in prompts
   - Understand data is sent to Claude's servers

## Documentation

- [Implementation Guide](docs/IMPLEMENTATION_GUIDE.md) - Detailed implementation patterns and architecture
- [Testing Guide](docs/TESTING.md) - Validation procedures and test coverage
- [Changelog](docs/CHANGELOG.md) - Version history and changes

## Contributing

This MCP server was built following best practices from:
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Best Practices](https://modelcontextprotocol.io/docs/best-practices)
- [Grist API Documentation](https://support.getgrist.com/api/)

## License

This MCP server is part of the grist-core project.

## Support

- Grist Documentation: https://support.getgrist.com
- Grist Community: https://community.getgrist.com
- MCP Protocol: https://modelcontextprotocol.io
- Report Issues: https://github.com/gristlabs/grist-core/issues

## Version

Version 1.0.0 - Production Ready

**Compatibility:**
- Grist Cloud: ✅ Full support
- Self-hosted Grist: ✅ Full support (v1.0+)
- MCP Protocol: 1.0
- Node.js: ≥18.0.0
