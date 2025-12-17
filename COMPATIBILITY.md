# Grist Compatibility

This MCP server is tested against various Grist versions. The table below shows the tested compatibility range.

**Note:** Grist has no documented API stability policy. This MCP uses graceful degradation to handle unknown column types and cell value encodings, so it should work with newer Grist versions even before they're formally tested.

## Compatibility Strategy

- **Unknown column types**: Logged as warning, validation skipped (accepts any value)
- **Unknown CellValue codes**: Logged as warning, raw value passed through
- **API changes**: Weekly automated tests detect breaking changes

## Tested Versions

| Grist Version | Test Date | Status |
|---------------|-----------|--------|
| 1.7.x | 2025-12-05 | ✅ Passed (development) |

## Testing

Compatibility tests run automatically every Sunday via GitHub Actions.
To test manually against a specific version:

```bash
# Start Grist with specific version
docker run -d --name grist-test -p 8989:8484 \
  -e GRIST_BOOT_KEY=test_boot_key \
  -e GRIST_FORCE_LOGIN=true \
  -e GRIST_DEFAULT_EMAIL=test@example.com \
  -e GRIST_SINGLE_ORG=example \
  gristlabs/grist:v1.7.8

# Get API key
sleep 10
API_KEY=$(curl -sf http://localhost:8989/api/profile/apiKey -H "x-boot-key: test_boot_key" | tr -d '"')

# Run tests
GRIST_API_KEY=$API_KEY GRIST_BASE_URL=http://localhost:8989 npm test

# Cleanup
docker rm -f grist-test
```

## Reporting Issues

If you encounter compatibility issues:
1. Check this document for your Grist version
2. Check [open issues](https://github.com/gwhthompson/grist-mcp-server/issues) for known problems
3. Report new issues with your Grist version and error details
