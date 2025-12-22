---
name: test-sandbox-reminder
enabled: true
event: bash
pattern: npm\s+test|vitest\s+run
action: warn
---

**Integration tests require sandbox disabled**

Tests in this project need `dangerouslyDisableSandbox: true` because:
- Docker container management requires full filesystem/network access
- Grist container lifecycle (start/stop/health checks) needs unrestricted access

**Correct approach:**
```typescript
Bash({
  command: "npm test",
  dangerouslyDisableSandbox: true
})
```

The test infrastructure handles Docker automatically - don't run Grist containers manually.
