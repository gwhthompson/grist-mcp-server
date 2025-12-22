---
active: true
iteration: 1
max_iterations: 25
completion_promise: "FACTORY MIGRATION COMPLETE"
started_at: "2025-12-22T21:27:23Z"
---

Complete the factory migration per /Users/george/.claude/plans/foamy-nibbling-parnas.md

  ## Per-Tool Process
  1. Read current implementation FULLY before editing
  2. Migrate to factory pattern preserving ALL behavior (hooks, validation, error handling, analytics)
  3. Run: npm test -- tests/unit/tools/{name}.test.ts
  4. If tests fail, fix until passing
  5. Commit: git add -A && git commit -m 'refactor: migrate {tool_name} to factory pattern'
  6. Move to next tool

  ## Migration Order
  1. help.ts → defineStandardTool()
  2. discovery.ts (2 tools) → definePaginatedTool()
  3. reading.ts (3 tools) → defineStandardTool()
  4. manage-records.ts → defineBatchTool()
  5. manage-schema.ts → defineBatchTool()
  6. manage-pages.ts → defineBatchTool()
  7. manage-webhooks.ts → defineBatchTool()
  8. Delete base classes

  ## Quality Rules
  - No any types
  - Response format identical to original
  - All hooks preserved
  - Run tests after EACH migration

  ## Completion
  When ALL tools migrated AND base classes deleted AND npm run build && npm run check && npm test pass:
  <promise>FACTORY MIGRATION COMPLETE</promise>
