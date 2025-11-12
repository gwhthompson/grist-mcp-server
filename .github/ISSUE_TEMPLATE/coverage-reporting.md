---
name: Configure test coverage reporting
about: Add test coverage reporting to CI pipeline
title: 'Configure test coverage reporting'
labels: testing, ci-cd, enhancement
assignees: ''
---

## Description
Add test coverage reporting to CI pipeline with vitest coverage tool.

## Requirements
- Configure `vitest --coverage`
- Set coverage thresholds (suggested: 80% statements, 80% branches, 70% lines)
- Add coverage badge to README
- Generate coverage reports in CI
- Add coverage reports to .gitignore

## Configuration
```typescript
// vitest.config.ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  thresholds: {
    statements: 80,
    branches: 80,
    lines: 70
  }
}
```

## Benefits
- Visibility into test coverage
- Prevent coverage regressions
- Identify untested code paths
