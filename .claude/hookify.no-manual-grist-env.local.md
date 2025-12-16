---
name: no-manual-grist-env
enabled: true
event: bash
pattern: GRIST_API_KEY=.*npm run grist|GRIST_BASE_URL=.*npm run grist
action: block
---

**Don't manually pass Grist environment variables!**

The `npm run grist inspect` script automatically sets `GRIST_API_KEY` and `GRIST_BASE_URL` from the running container.

**Wrong:**
```bash
GRIST_API_KEY=... GRIST_BASE_URL=... npm run grist inspect cli -- ...
```

**Correct:**
```bash
npm run grist inspect cli -- --method tools/call --tool-name grist_get_tables
```

The script handles environment setup automatically.
