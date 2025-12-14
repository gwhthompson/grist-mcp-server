---
name: grist-sandbox-reminder
enabled: true
event: bash
pattern: ^npm\s+run\s+grist
action: warn
---

**Reminder: Grist commands need sandbox bypass**

`npm run grist` commands require network access to localhost (Docker container).

Add `dangerouslyDisableSandbox: true` to the Bash tool call:

```javascript
{
  command: "npm run grist ...",
  dangerouslyDisableSandbox: true
}
```

Common commands:
- `npm run grist start` - Start container
- `npm run grist stop` - Stop container
- `npm run grist status` - Check status
- `npm run grist inspect cli -- --method tools/list` - List tools
