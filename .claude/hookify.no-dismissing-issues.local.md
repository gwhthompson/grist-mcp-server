---
name: no-dismissing-issues
enabled: true
event: stop
pattern: .*
action: block
---

## Before stopping, verify test and lint status

You MUST NOT dismiss linting issues or test failures as "pre-existing", "not from my changes", or similar.

**Required checks before completion:**
1. Run `npm run build` - must pass with no errors
2. Run `npm run check` - all linting errors must be addressed
3. Run `npm test` - all tests must pass

**If issues exist:**
- Fix them, don't explain them away
- If truly pre-existing and out of scope, document them explicitly and get user confirmation
- Never assume issues are acceptable without verification

**Prohibited phrases:**
- "These are pre-existing issues"
- "Not from my changes"
- "Can be ignored"
- "Non-blocking warnings"

**If you cannot fix an issue**, ask the user explicitly rather than proceeding.
