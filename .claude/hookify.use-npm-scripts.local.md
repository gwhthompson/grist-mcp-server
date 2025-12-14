---
name: use-npm-scripts
enabled: true
event: bash
pattern: npx\s+@modelcontextprotocol/inspector|curl.*localhost:8484
action: block
---

**STOP: Use npm scripts instead of manual commands!**

You're trying to run commands manually when npm scripts exist for this.

## Correct Usage

```bash
# Start Grist (required first)
npm run grist start

# Then use the inspector with -- to pass args:

# List available tools
npm run grist inspect cli -- --method tools/list

# Call a specific tool
npm run grist inspect cli -- --method tools/call --tool-name mytool --tool-arg key=value --tool-arg another=value2

# Call a tool with JSON arguments
npm run grist inspect cli -- --method tools/call --tool-name mytool --tool-arg 'options={"format": "json", "max_tokens": 100}'

# List available resources
npm run grist inspect cli -- --method resources/list

# List available prompts
npm run grist inspect cli -- --method prompts/list

# Stop Grist when done
npm run grist stop
```

**Always check package.json scripts first before running manual commands.**
