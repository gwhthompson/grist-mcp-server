# MCPB Bundle Fix Summary

## Issue Discovered

After initial MCPB bundle installation, Claude Desktop reported **"no tools available"** despite successful installation and configuration.

## Root Cause Analysis

### Problem
The MCP server was crashing when responding to `tools/list` requests with the error:

```
"Cannot read properties of null (reading '_def')"
```

### Technical Details

The issue was in `src/registry/tool-registry.ts` at the tool registration step:

```typescript
// BEFORE (incorrect):
const mcpOptions: McpToolOptions = {
  title: definition.title,
  description: definition.description,
  inputSchema: definition.inputSchema as any,  // ❌ Passing Zod schema directly
  annotations: definition.annotations
}
```

**What went wrong:**
- `definition.inputSchema` is a **Zod schema object**
- The MCP SDK expects **JSON Schema format** (JSON Schema Draft 7)
- When the MCP SDK tried to serialize the Zod schema for the `tools/list` response, it attempted to access the `_def` property on a null/undefined value, causing a crash
- This prevented the server from advertising its tools to Claude Desktop

### Diagnosis Process

1. **User reported**: "Installs fine, but says no tools available"
2. **Created test script** (`test-mcp-protocol.mjs`) to simulate MCP protocol communication
3. **Discovered error** in JSON-RPC response: `"Cannot read properties of null (reading '_def')"`
4. **Traced issue** to missing Zod → JSON Schema conversion

## Solution Implemented

### Code Changes

File: `src/registry/tool-registry.ts`

**Added import:**
```typescript
import { zodToJsonSchema } from 'zod-to-json-schema'
```

**Fixed tool registration:**
```typescript
// AFTER (correct):
// Convert Zod schema to JSON Schema for MCP compatibility
const jsonSchema = zodToJsonSchema(definition.inputSchema, {
  name: definition.name,
  target: 'jsonSchema7'
})

const mcpOptions: McpToolOptions = {
  title: definition.title,
  description: definition.description,
  inputSchema: jsonSchema,  // ✅ Properly converted JSON Schema
  annotations: definition.annotations
}
```

### Why This Works

1. **zodToJsonSchema** converts Zod schemas to JSON Schema Draft 7 format
2. The MCP SDK can now properly serialize the schema
3. The `tools/list` request returns all 14 tools with their complete schemas
4. Claude Desktop now sees all available tools

## Verification

### Before Fix
```bash
$ node test-mcp-protocol.mjs
# ERROR: {"code":-32603,"message":"Cannot read properties of null (reading '_def')"}
# Tools count: 0
```

### After Fix
```bash
$ node test-mcp-protocol.mjs
# SUCCESS: Tools list returned
# Tools count: 14
# All tools properly advertised: ✓
```

## Rebuilt Bundle

**New bundle created:** `grist-mcp-server.mcpb`
- **SHA**: a04f368fb5d1399bad91cbe05b117d1ef50566a2
- **Size**: 2.6 MB compressed (7.8 MB unpacked)
- **Files**: 1,557 total
- **Status**: ✅ All tools now properly advertised

## Testing Instructions

### 1. Uninstall Old Bundle (if installed)
```bash
# In Claude Desktop, remove the old Grist MCP server if present
```

### 2. Install Fixed Bundle
```bash
mcpb install grist-mcp-server.mcpb
```

Or via Claude Desktop GUI:
1. Open Claude Desktop
2. Settings → Extensions
3. Install from file → Select `grist-mcp-server.mcpb`

### 3. Configure
Enter when prompted:
- **GRIST_API_KEY**: Your Grist API key (from https://docs.getgrist.com/settings/keys)
- **GRIST_BASE_URL** (optional): Defaults to `https://docs.getgrist.com`

### 4. Restart Claude Desktop

### 5. Verify Tools Appear
In Claude Desktop, you should now see 14 Grist tools available:

**Discovery & Navigation (3)**
- grist_get_workspaces
- grist_get_documents
- grist_get_tables

**Data Reading (2)**
- grist_query_sql
- grist_get_records

**Record Operations (4)**
- grist_add_records
- grist_update_records
- grist_upsert_records
- grist_delete_records

**Table Management (3)**
- grist_create_table
- grist_rename_table
- grist_delete_table

**Column Management (1)**
- grist_manage_columns

**Document Management (1)**
- grist_create_document

## Related Files

- **Fix Implementation**: `src/registry/tool-registry.ts` (lines 18, 129-134)
- **Test Script**: `test-mcp-protocol.mjs` (validates MCP protocol communication)
- **Bundle File**: `grist-mcp-server.mcpb` (ready to install)
- **Build Summary**: `MCPB_BUILD_SUMMARY.md`
- **Installation Guide**: `README-MCPB.md`

## Lessons Learned

### For MCPB Development

1. **Always convert schemas**: When using Zod (or any schema library), always convert to JSON Schema before passing to MCP SDK
2. **Test MCP protocol**: Create test scripts that simulate actual MCP communication, not just server startup
3. **Check SDK expectations**: MCP SDK expects JSON Schema, not language-specific schema libraries
4. **Validate tools/list**: Always verify that `tools/list` request returns proper tool definitions

### Common Pitfall

Many MCP servers define schemas using validation libraries (Zod, Yup, Joi, etc.) but forget to convert them to JSON Schema format that the MCP protocol requires. This causes silent failures where the server starts successfully but crashes when listing tools.

## Additional Notes

### Why the Error Was Cryptic

The error `"Cannot read properties of null (reading '_def')"` was cryptic because:
1. `_def` is an internal Zod property
2. The MCP SDK was trying to serialize what it thought was a JSON Schema
3. Instead, it found a Zod schema object it couldn't process
4. The error occurred deep in the serialization logic

### Prevention

To prevent similar issues in future:
1. Always test `tools/list` request explicitly
2. Use `zodToJsonSchema` (or equivalent) for any schema library
3. Validate that inputSchema is plain JSON Schema before registration
4. Consider adding a test that validates all tool schemas are JSON Schema compliant

## Status

✅ **FIXED** - All 14 tools now properly advertised and available in Claude Desktop

The MCPB bundle is ready for distribution and use!
