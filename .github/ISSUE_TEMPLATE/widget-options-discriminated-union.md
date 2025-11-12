---
name: Implement widget options discriminated union
about: Replace z.any() in widgetOptions schema with proper discriminated union
title: 'Implement widget options discriminated union'
labels: enhancement, type-safety
assignees: ''
---

## Description
Replace `z.any()` in widgetOptions schema with proper discriminated union for all widget types.

## Current State
```typescript
// src/schemas/api-responses.ts:107
widgetOptions: z.any().optional() // TODO: Create discriminated union
```

## Requirements
- Create discriminated union for all 11 column types
- Support Text widgets (PlainText, Markdown, HyperLink)
- Support Numeric widgets (currency, percent, scientific)
- Support Date format configurations
- Support Bool widgets
- Remove z.any() usage

## Benefits
- Type safety for widget configuration
- Better validation
- Improved developer experience

## References
- All widget types tested in test suite
- Widget options documented in docs/reference/grist-types.d.ts
