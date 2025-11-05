# Test Suite Directory

This directory contains the comprehensive Vitest-based test suite for the Grist MCP Server.

## Quick Start

```bash
# Run all tests
npm test

# Run in watch mode
npm run test:watch

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

## Directory Structure

```
tests/
├── README.md                      # This file
├── setup.ts                       # Global Vitest configuration
│
├── helpers/                       # Reusable test utilities
│   ├── docker.ts                  # Docker Compose lifecycle management
│   ├── grist-api.ts               # High-level Grist API helpers
│   ├── cell-values.ts             # CellValue encoding/decoding (GristObjCode)
│   └── widget-options.ts          # WidgetOptions builders for all column types
│
├── fixtures/                      # Test data and fixtures
│   └── column-types.ts            # All 11 Grist column type definitions
│
├── cell-value-encoding.test.ts    # Tests for all GristObjCode types
├── widget-options.test.ts         # Tests for all column type widgetOptions
└── mcp-tools.test.ts              # Integration tests for all 15 MCP tools
```

## Test Files

### `cell-value-encoding.test.ts`

Tests **CellValue encoding** for all Grist object codes:

- **Primitives**: string, number, boolean, null
- **List (L)**: Choice/ChoiceList values
- **DateTime (D)**: Timestamps with timezone
- **Date (d)**: Date-only values
- **Reference (R)**: References to other tables
- **ReferenceList (r)**: Multiple references
- **Dict (O)**: JSON object values
- **Special**: Censored, Exception, Pending, Unmarshallable

**Coverage**: All 13 GristObjCode types + validation + extraction

### `widget-options.test.ts`

Tests **widgetOptions** for all 11 Grist column types:

1. Text (TextBox, Markdown, HyperLink)
2. Numeric (Decimal, Currency, Percent, Scientific)
3. Int
4. Bool (CheckBox, Switch)
5. Date
6. DateTime
7. Choice (with styling)
8. ChoiceList (with styling)
9. Ref
10. RefList
11. Attachments

**Coverage**: Complete widgetOptions validation against live Grist

### `mcp-tools.test.ts`

Integration tests for **all 15 MCP tools**:

**Discovery (5)**: workspaces, documents, tables, columns, SQL
**Reading (1)**: read_records with filters/sorting/pagination
**Writing (4)**: add, update, upsert, delete records
**Schema (5)**: add/update tables and columns

**Coverage**: All tools validated against live Grist instance

## Helper Modules

### `helpers/docker.ts`

Docker Compose lifecycle management:

```typescript
import { ensureGristReady, startCompose, stopCompose } from './helpers/docker.js';

// Ensure Docker Compose is running and Grist is ready
await ensureGristReady();

// Manual control
await startCompose();
await stopCompose();
```

**Functions**:
- `isDockerAvailable()` - Check if Docker is installed
- `isComposeRunning()` - Check if containers are running
- `startCompose()` - Start Docker Compose
- `stopCompose()` - Stop Docker Compose
- `waitForGrist()` - Wait for Grist to be ready
- `ensureGristReady()` - All-in-one setup
- `resetGrist()` - Reset database to clean state

### `helpers/grist-api.ts`

High-level Grist API operations:

```typescript
import {
  createTestClient,
  createFullTestContext,
  cleanupTestContext,
  addTestRecords
} from './helpers/grist-api.js';

// Create authenticated client
const client = createTestClient();

// Create complete test context (org + workspace + doc + table)
const context = await createFullTestContext(client, {
  workspaceName: 'Test Workspace',
  docName: 'Test Document',
  tableName: 'TestTable',
  columns: [
    { id: 'name', fields: { type: 'Text', label: 'Name' } },
    { id: 'value', fields: { type: 'Numeric', label: 'Value' } }
  ]
});

// Add test data
await addTestRecords(client, context.docId, context.tableId, [
  { fields: { name: 'Alice', value: 100 } },
  { fields: { name: 'Bob', value: 200 } }
]);

// Cleanup when done
await cleanupTestContext(context);
```

**Functions**:
- `createTestClient()` - Create Grist API client
- `getFirstOrg()` - Get first accessible org
- `getFirstWorkspace()` - Get first workspace in org
- `createTestWorkspace()` - Create new workspace
- `createTestDocument()` - Create new document
- `createTestTable()` - Create new table
- `addTestRecords()` - Add records to table
- `deleteDocument()` - Delete document (cleanup)
- `deleteWorkspace()` - Delete workspace (cleanup)
- `createFullTestContext()` - All-in-one setup
- `cleanupTestContext()` - All-in-one cleanup
- `waitFor()` - Wait for condition with timeout

### `helpers/cell-values.ts`

CellValue encoding and decoding for all GristObjCode types:

```typescript
import {
  createList,
  createDateTime,
  createDate,
  createReference,
  createReferenceList,
  createDict,
  isList,
  extractListItems,
  validateCellValue,
  SAMPLE_CELL_VALUES
} from './helpers/cell-values.js';

// Create encoded CellValues
const list = createList('cat', 'dog', 'bird');
// Result: ["L", "cat", "dog", "bird"]

const dateTime = createDateTime(1704945919, 'UTC');
// Result: ["D", 1704945919, "UTC"]

const ref = createReference('People', 17);
// Result: ["R", "People", 17]

// Validate and extract
if (isList(value)) {
  const items = extractListItems(value);
  console.log(items); // ["cat", "dog", "bird"]
}

// Validate CellValue structure
if (validateCellValue(value)) {
  console.log('Valid CellValue');
}

// Use sample values
const sampleList = SAMPLE_CELL_VALUES.list;
const sampleDateTime = SAMPLE_CELL_VALUES.dateTime;
```

**Available Functions**:

**Creators**: `createList()`, `createDateTime()`, `createDate()`, `createReference()`, `createReferenceList()`, `createDict()`, `createCensored()`, `createException()`, `createPending()`, `createUnmarshallable()`

**Type Guards**: `isList()`, `isDateTime()`, `isDate()`, `isReference()`, `isReferenceList()`, `isDict()`, `isPending()`, `isPrimitive()`

**Extractors**: `extractListItems()`, `extractDateTime()`, `extractDate()`, `extractReference()`, `extractReferenceList()`, `extractDict()`

**Utilities**: `validateCellValue()`, `getCellValueType()`

**Constants**: `SAMPLE_CELL_VALUES` (all GristObjCode types)

### `helpers/widget-options.ts`

WidgetOptions builders for all 11 column types:

```typescript
import {
  buildTextWidgetOptions,
  buildNumericWidgetOptions,
  buildChoiceWidgetOptions,
  SAMPLE_WIDGET_OPTIONS,
  COLUMN_TYPE_WIDGET_OPTIONS
} from './helpers/widget-options.js';

// Build widgetOptions JSON strings
const textOptions = buildTextWidgetOptions({
  widget: 'Markdown',
  alignment: 'left',
  wrap: true,
  fontBold: true,
  textColor: '#FF0000'
});

const numericOptions = buildNumericWidgetOptions({
  numMode: 'currency',
  currency: 'USD',
  decimals: 2,
  alignment: 'right'
});

const choiceOptions = buildChoiceWidgetOptions({
  choices: ['New', 'In Progress', 'Done'],
  choiceOptions: {
    'New': { fillColor: '#90EE90', textColor: '#000000' },
    'Done': { fillColor: '#87CEEB', textColor: '#000000', fontBold: true }
  },
  alignment: 'center'
});

// Use sample options
const basicText = SAMPLE_WIDGET_OPTIONS.textBasic;
const currency = SAMPLE_WIDGET_OPTIONS.numericCurrency;

// Get default options for column type
const textDefaults = COLUMN_TYPE_WIDGET_OPTIONS.Text;
const numericDefaults = COLUMN_TYPE_WIDGET_OPTIONS.Numeric;
```

**Available Builders**:
- `buildTextWidgetOptions()` - Text, Markdown, HyperLink
- `buildNumericWidgetOptions()` - Decimal, Currency, Percent, Scientific
- `buildBoolWidgetOptions()` - CheckBox, Switch
- `buildDateWidgetOptions()` - Date formatting
- `buildDateTimeWidgetOptions()` - Date + time formatting
- `buildChoiceWidgetOptions()` - Single choice with styling
- `buildChoiceListWidgetOptions()` - Multiple choices with styling
- `buildRefWidgetOptions()` - Reference columns
- `buildRefListWidgetOptions()` - Reference list columns
- `buildAttachmentsWidgetOptions()` - Attachment columns

**Utilities**:
- `validateWidgetOptions()` - Validate JSON structure
- `parseWidgetOptions()` - Parse JSON string

**Constants**:
- `SAMPLE_WIDGET_OPTIONS` - Pre-built samples for all variants
- `COLUMN_TYPE_WIDGET_OPTIONS` - Default options for each column type

## Fixtures

### `fixtures/column-types.ts`

Complete definitions for all 11 Grist column types:

```typescript
import {
  COLUMN_TYPE_FIXTURES,
  createComprehensiveTable,
  createMinimalTable,
  createSampleRecords
} from './fixtures/column-types.js';

// Get individual column fixtures
const textColumn = COLUMN_TYPE_FIXTURES.text;
const numericColumn = COLUMN_TYPE_FIXTURES.numeric;
const choiceColumn = COLUMN_TYPE_FIXTURES.choice;

// Create table with all column types
const table = createComprehensiveTable('MyTable');

// Create minimal test table
const simpleTable = createMinimalTable('SimpleTable');

// Create sample records for all column types
const records = createSampleRecords(5);
```

**Available Fixtures**:
- `text` - Text column with alignment
- `numeric` - Numeric with decimal formatting
- `int` - Integer column
- `bool` - Boolean with CheckBox
- `date` - Date with YYYY-MM-DD format
- `dateTime` - DateTime with timezone
- `choice` - Choice with styled options
- `choiceList` - ChoiceList with styled options
- `ref` - Reference to another table
- `refList` - Reference list
- `attachments` - Attachments column

Each fixture includes:
- Column definition (`id`, `fields`)
- Sample values matching the type
- Proper widgetOptions

## Writing New Tests

### Basic Test Structure

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestClient, createFullTestContext, cleanupTestContext } from './helpers/grist-api.js';
import { ensureGristReady } from './helpers/docker.js';

describe('My Test Suite', () => {
  const client = createTestClient();
  let context: Awaited<ReturnType<typeof createFullTestContext>>;

  beforeAll(async () => {
    await ensureGristReady();
    context = await createFullTestContext(client);
  }, 60000); // 60 second timeout

  afterAll(async () => {
    if (context) {
      await cleanupTestContext(context);
    }
  });

  it('should do something', async () => {
    // Your test here
    expect(true).toBe(true);
  });
});
```

### Testing Against Live Grist

```typescript
it('should validate against live Grist API', async () => {
  // Query live Grist
  const response = await client.get(
    `/docs/${context.docId}/tables/${context.tableId}/records`
  );

  // Validate response structure
  expect(response).toHaveProperty('records');
  expect(response.records).toBeInstanceOf(Array);

  // Check against specification
  if (response.records.length > 0) {
    const record = response.records[0];
    expect(record).toHaveProperty('id');
    expect(record).toHaveProperty('fields');
  }
});
```

### Using Helpers

```typescript
import { createList, isList, extractListItems } from './helpers/cell-values.js';
import { buildChoiceWidgetOptions } from './helpers/widget-options.js';
import { addTestRecords } from './helpers/grist-api.js';

it('should work with CellValues and widgetOptions', async () => {
  // Create CellValue
  const listValue = createList('tag1', 'tag2', 'tag3');
  expect(isList(listValue)).toBe(true);

  // Build widgetOptions
  const options = buildChoiceWidgetOptions({
    choices: ['tag1', 'tag2', 'tag3']
  });
  expect(JSON.parse(options)).toHaveProperty('choices');

  // Add test records
  await addTestRecords(client, context.docId, context.tableId, [
    { fields: { tags: listValue } }
  ]);
});
```

## Best Practices

1. **Use helpers** - Don't reinvent the wheel
2. **Clean up** - Always use `cleanupTestContext()` in `afterAll`
3. **Validate against live Grist** - No mocking
4. **Follow TDD** - Red, Query Live, Verify, Green, Refactor
5. **Use fixtures** - Leverage `COLUMN_TYPE_FIXTURES` for consistency
6. **Handle timeouts** - Set appropriate timeouts for Docker operations
7. **Check Docker** - Ensure Docker is running before tests

## Troubleshooting

### Docker not running
```bash
docker --version
docker compose -f compose.yml up -d
```

### Grist not ready
```bash
docker compose -f compose.yml logs grist
docker compose -f compose.yml ps
```

### Tests failing
```bash
# Run with verbose output
npm run test:watch

# Run with UI for debugging
npm run test:ui

# Check coverage
npm run test:coverage
```

### Clean slate
```bash
# Reset everything
docker compose -f compose.yml down -v
docker compose -f compose.yml up -d
npm run build
npm test
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Grist API Spec](../docs/grist-api-spec.yml)
- [Grist Type Definitions](../docs/grist-types.d.ts)
- [Main Testing Guide](../TESTING.md)
- [Test Suite Summary](../TEST_SUITE_SUMMARY.md)
