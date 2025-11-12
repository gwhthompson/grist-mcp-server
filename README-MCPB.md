# Grist MCP Server - MCPB Bundle

This document explains how to build, install, and use the Grist MCP Server as an MCP Bundle (MCPB).

## What is MCPB?

MCP Bundles (MCPB) are zip archives containing a local MCP server alongside a `manifest.json` file describing capabilities. This packaging format enables end users to install local MCP servers with a single action, similar to browser extensions.

## Building the Bundle

### Prerequisites

1. **Node.js 18+** installed on your system
2. **MCPB CLI** installed globally:

   ```bash
   npm install -g @anthropic-ai/mcpb
   ```

### Build Steps

1. **Verify the project is ready:**

   ```bash
   npm run bundle:verify
   ```

   This checks that the manifest.json is valid and the entry point exists.

2. **Build the complete bundle:**

   ```bash
   npm run bundle:full
   ```

   This will:
   - Clean the dist directory
   - Compile TypeScript to JavaScript
   - Install production dependencies only
   - Create the `.mcpb` bundle file

   **Or build step-by-step:**

   ```bash
   # Step 1: Prepare the bundle structure
   npm run bundle:prepare

   # Step 2: Create the .mcpb archive
   npm run bundle:pack
   ```

3. **Locate your bundle:**

   The bundle will be created as `grist-mcp-server-1.1.0.mcpb` in the project root directory.

## Installing the Bundle

### For End Users

1. **Download the `.mcpb` file** from the release or build it yourself

2. **Install using MCPB CLI:**

   ```bash
   mcpb install grist-mcp-server-1.1.0.mcpb
   ```

3. **Configure in Claude Desktop:**

   After installation, the MCPB tool will prompt you to configure:

   - **Grist API Key** (required): Get from https://docs.getgrist.com/settings/keys
   - **Grist Base URL** (optional): Defaults to `https://docs.getgrist.com`

4. **Restart Claude Desktop** to activate the server

### Manual Installation (Alternative)

If you prefer to install manually:

1. **Extract the bundle:**

   ```bash
   unzip grist-mcp-server-1.1.0.mcpb -d ~/mcp-servers/grist
   ```

2. **Configure Claude Desktop:**

   Edit your Claude Desktop configuration file:

   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

   Add the following configuration:

   ```json
   {
     "mcpServers": {
       "grist": {
         "command": "node",
         "args": ["~/mcp-servers/grist/dist/index.js"],
         "env": {
           "GRIST_API_KEY": "your_api_key_here",
           "GRIST_BASE_URL": "https://docs.getgrist.com"
         }
       }
     }
   }
   ```

3. **Restart Claude Desktop**

## Configuration

### Required Configuration

- **GRIST_API_KEY**: Your Grist API authentication key
  - Get from: https://docs.getgrist.com/settings/keys
  - This is marked as sensitive and will be securely stored

### Optional Configuration

- **GRIST_BASE_URL**: Base URL for your Grist instance
  - Default: `https://docs.getgrist.com` (Grist Cloud)
  - Self-hosted: Use your own URL (e.g., `https://grist.yourcompany.com`)

## Available Tools

The bundle provides 15 workflow-oriented tools:

### Discovery & Navigation
- `grist_list_workspaces` - Discover workspaces
- `grist_list_documents` - Browse documents
- `grist_get_document` - Get document metadata
- `grist_get_tables` - Understand data structure

### Data Reading
- `grist_query_sql` - Execute SQL queries
- `grist_get_records` - Fetch records with filtering

### Record Operations
- `grist_add_records` - Insert new records
- `grist_update_records` - Modify existing records
- `grist_upsert_records` - Add or update records
- `grist_delete_records` - Remove records

### Table Management
- `grist_create_table` - Create new tables
- `grist_rename_table` - Rename tables
- `grist_delete_table` - Remove tables

### Column Management
- `grist_manage_columns` - Add, modify, delete columns

### Document Management
- `grist_create_document` - Create or fork documents

## Features

- **Dual Response Formats**: JSON for programmatic access, Markdown for readability
- **Progressive Detail Levels**: Control information density
- **Smart Context Management**: 25K character limits with intelligent truncation
- **Comprehensive Error Handling**: Actionable guidance for self-correction
- **Multi-Instance Support**: Works with Grist Cloud and self-hosted instances
- **Full Type Safety**: Strict TypeScript with Zod validation

## Troubleshooting

### Bundle Won't Install

1. Verify MCPB CLI is installed:
   ```bash
   mcpb --version
   ```

2. Check the bundle file is not corrupted:
   ```bash
   unzip -t grist-mcp-server-1.1.0.mcpb
   ```

### Server Not Appearing in Claude

1. Check Claude Desktop logs for errors:
   - **macOS**: `~/Library/Logs/Claude/`
   - **Windows**: `%APPDATA%/Claude/logs/`

2. Verify the configuration is valid JSON

3. Ensure Node.js 18+ is installed:
   ```bash
   node --version
   ```

### API Key Issues

1. Verify your API key is valid at https://docs.getgrist.com/settings/keys

2. Check the key has appropriate permissions for the operations you're performing

3. For self-hosted Grist, ensure `GRIST_BASE_URL` matches your instance URL

### Connection Errors

1. **For Grist Cloud users**: Verify you can access https://docs.getgrist.com

2. **For self-hosted users**:
   - Verify your Grist instance is accessible
   - Check firewall rules allow connections
   - Ensure the base URL includes the protocol (https://)

## Development

### Bundle Structure

```
grist-mcp-server/
├── manifest.json          # MCPB manifest with metadata
├── .mcpbignore           # Files to exclude from bundle
├── package.json          # Node.js package config
├── dist/                 # Compiled JavaScript
│   ├── index.js         # Entry point
│   └── **/*.js          # All compiled modules
└── node_modules/         # Production dependencies only
    ├── @modelcontextprotocol/
    ├── axios/
    └── zod/
```

### Testing the Bundle Locally

Before distributing, test the bundle:

1. **Build and install locally:**

   ```bash
   npm run bundle:full
   mcpb install grist-mcp-server-1.1.0.mcpb --force
   ```

2. **Configure Claude Desktop** with test API key

3. **Test core functionality:**
   - List workspaces
   - Browse documents
   - Query data
   - Create/update records

4. **Check error handling:**
   - Test with invalid API key
   - Test with non-existent resources
   - Verify error messages are helpful

## Security Considerations

- **API Key Storage**: The MCPB manifest marks the API key as sensitive, ensuring secure storage
- **Local Execution**: The server runs locally and only communicates with your specified Grist instance
- **No External Dependencies**: All dependencies are bundled; no external downloads at runtime
- **Minimal Permissions**: Only requires network access to Grist API endpoints

## Support

For issues, questions, or contributions:

- **Documentation**: See main [README.md](README.md) for detailed API documentation
- **Issues**: Report bugs or request features in the GitHub repository
- **Testing**: See [docs/TESTING.md](docs/TESTING.md) for validation procedures

## Version Information

- **Bundle Version**: 1.1.0
- **Manifest Version**: 0.3
- **Node.js Requirement**: >=18.0.0
- **Compatible Clients**: Claude Desktop >=0.10.0

## License

MIT License - See LICENSE file for details
