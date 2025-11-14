# Grist REST API: Pages and Widgets Reference

**Schema Version:** 44

This document provides practical guidance for working with Grist pages (views) and widgets (view sections) via the REST API. For complete table schemas, see `grist-database-schema.md`. For action type definitions, see `grist-apply-actions.d.ts`.

---

## Overview

Grist's page and widget system consists of:

- **Pages** (`_grist_Pages`, `_grist_Views`) - Top-level navigation and layout containers
- **Widgets** (`_grist_Views_section`) - Individual data visualizations (tables, cards, charts, forms)
- **Widget Linking** - Filter widgets based on selections in other widgets
- **Sorting** (`sortColRefs`) - Order records within widgets
- **Filtering** (`_grist_Filters`) - Filter records by column values

---

## Metadata Tables Quick Reference

### `_grist_Views`
Represents pages/views.

| Column | Type | Description |
|--------|------|-------------|
| `id` | Int | Page identifier |
| `name` | Text | Page name |
| `type` | Text | View type (may be deprecated/unused) |
| `layoutSpec` | Text | JSON layout structure |

### `_grist_Views_section`
Represents widgets within pages.

| Column | Type | Description |
|--------|------|-------------|
| `id` | Int | Widget identifier |
| `tableRef` | Ref:_grist_Tables | Source table |
| `parentId` | Ref:_grist_Views | Parent page |
| `parentKey` | Text | Widget type |
| `title` | Text | Widget title |
| `description` | Text | Widget description |
| `defaultWidth` | Int | Default width (100) |
| `borderWidth` | Int | Border width (1) |
| `theme` | Text | Theme settings (JSON) |
| `options` | Text | Widget options (JSON) |
| `chartType` | Text | Chart type |
| `layoutSpec` | Text | Widget layout (JSON) |
| `sortColRefs` | Text | Sort specification (JSON array) |
| `linkSrcSectionRef` | Ref:_grist_Views_section | Link source widget |
| `linkSrcColRef` | Ref:_grist_Tables_column | Link source column |
| `linkTargetColRef` | Ref:_grist_Tables_column | Link target column |
| `rules` | RefList:_grist_Tables_column | Conditional formatting rules |
| `shareOptions` | Text | Share settings (JSON) |

### `_grist_Pages`
Page navigation structure.

| Column | Type | Description |
|--------|------|-------------|
| `id` | Int | Page entry identifier |
| `viewRef` | Ref:_grist_Views | View reference |
| `indentation` | Int | Tree indentation level |
| `pagePos` | PositionNumber | Position in list |
| `shareRef` | Ref:_grist_Shares | Share reference |
| `options` | Text | Page options (JSON) |

### `_grist_Filters`
Widget filters.

| Column | Type | Description |
|--------|------|-------------|
| `id` | Int | Filter identifier |
| `viewSectionRef` | Ref:_grist_Views_section | Widget reference |
| `colRef` | Ref:_grist_Tables_column | Column reference |
| `filter` | Text | Filter specification (JSON) |
| `pinned` | Bool | Show in filter bar |

---

## Creating Widgets

### CreateViewSection Action

Creates a new widget, optionally creating a new page and/or table at the same time.

**Endpoint:**
```http
POST /api/docs/{docId}/apply
Content-Type: application/json

[
  ["CreateViewSection", tableRef, viewRef, sectionType, groupbyColRefs, tableId]
]
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `tableRef` | number | Table ID to display, or `0` to create new table |
| `viewRef` | number | View ID to add widget to, or `0` to create new view/page |
| `sectionType` | string | Widget type (see Widget Types below) |
| `groupbyColRefs` | number[] \| null | Array of column IDs for summary grouping, or `null` for regular widget |
| `tableId` | string \| null | Name for new table (when `tableRef=0`), or `null` |

**Response:**
```json
{
  "tableRef": number,
  "viewRef": number,
  "sectionRef": number
}
```

**Examples:**

**Create page with table widget:**
```json
["CreateViewSection", 1, 0, "record", null, null]
```
- `tableRef=1` - Display existing table with ID 1
- `viewRef=0` - Create new page
- `sectionType="record"` - Table widget
- `groupbyColRefs=null` - Not a summary table
- `tableId=null` - Not creating a new table

**Create new table with page:**
```json
["CreateViewSection", 0, 0, "record", null, "Products"]
```
- `tableRef=0` - Create new table
- `viewRef=0` - Create new page
- `sectionType="record"` - Table widget
- `groupbyColRefs=null` - Not a summary table
- `tableId="Products"` - New table name

**Add widget to existing page:**
```json
["CreateViewSection", 1, 5, "single", null, null]
```
- `tableRef=1` - Display existing table with ID 1
- `viewRef=5` - Add to existing page with ID 5
- `sectionType="single"` - Card widget
- `groupbyColRefs=null` - Not a summary table
- `tableId=null` - Not creating a new table

**Create summary widget:**
```json
["CreateViewSection", 1, 5, "record", [2, 3], null]
```
- `tableRef=1` - Source table ID 1
- `viewRef=5` - Add to existing page with ID 5
- `sectionType="record"` - Table widget
- `groupbyColRefs=[2, 3]` - Group by columns 2 and 3
- `tableId=null` - Not creating a new table

---

## Layout Structure

The `layoutSpec` field in `_grist_Views` uses a JSON tree structure to define how widgets are arranged on a page.

### Single Widget

```json
{"type": "leaf", "leaf": 1}
```
- `type: "leaf"` - Single widget (leaf node)
- `leaf: 1` - Widget section ID

### Horizontal Split

```json
{
  "type": "hsplit",
  "children": [
    {"type": "leaf", "leaf": 1},
    {"type": "leaf", "leaf": 2}
  ],
  "splitRatio": 0.5
}
```
- `type: "hsplit"` - Horizontal split (side by side)
- `children` - Array of child layouts
- `splitRatio: 0.5` - Left widget takes 50% of width

### Vertical Split

```json
{
  "type": "vsplit",
  "children": [
    {"type": "leaf", "leaf": 1},
    {"type": "leaf", "leaf": 2}
  ],
  "splitRatio": 0.3
}
```
- `type: "vsplit"` - Vertical split (stacked)
- `children` - Array of child layouts
- `splitRatio: 0.3` - Top widget takes 30% of height

### Complex Multi-Widget Layout

Create a page with two widgets arranged horizontally:

```json
[
  ["CreateViewSection", 1, 0, "record", null, null],
  ["CreateViewSection", 1, 0, "single", null, null],
  ["UpdateRecord", "_grist_Views", 0, {
    "name": "Dashboard",
    "layoutSpec": "{\"type\":\"hsplit\",\"children\":[{\"type\":\"leaf\",\"leaf\":0},{\"type\":\"leaf\",\"leaf\":1}],\"splitRatio\":0.5}"
  }]
]
```

**Notes:**
- In multi-action requests, use zero-based indexing (0, 1, 2...) to reference newly created rows
- First `CreateViewSection` creates widget with ID `0` (first action's return)
- Second `CreateViewSection` creates widget with ID `1` (second action's return)
- `UpdateRecord` uses `0` to reference the newly created view from the first action
- `layoutSpec` must be a stringified JSON object

---

## Widget Linking

Configure one widget to filter based on another widget's selection. This creates master-detail relationships.

### Link Configuration

```json
["UpdateRecord", "_grist_Views_section", targetWidgetId, {
  "linkSrcSectionRef": sourceWidgetId,
  "linkSrcColRef": sourceColumnId,
  "linkTargetColRef": targetColumnId
}]
```

**Field Values:**

| Field | Type | Description |
|-------|------|-------------|
| `linkSrcSectionRef` | number | Source widget ID (the "master") |
| `linkSrcColRef` | number | Source column ID, or `0` for table-level link |
| `linkTargetColRef` | number | Target column ID, or `0` for table-level link |

**Column ID Special Values:**
- `0` = Table-level link (entire record)
- `>0` = Specific column ID

### Table-to-Card Link

Filter a card widget by the selected row in a table widget:

```json
["UpdateRecord", "_grist_Views_section", 2, {
  "linkSrcSectionRef": 1,
  "linkSrcColRef": 0,
  "linkTargetColRef": 0
}]
```
- When a row is selected in widget `1`, widget `2` shows only that record
- Both `linkSrcColRef` and `linkTargetColRef` are `0` (table-level link)

### Reference Column Link

Filter by a reference column relationship:

```json
["UpdateRecord", "_grist_Views_section", 3, {
  "linkSrcSectionRef": 2,
  "linkSrcColRef": 5,
  "linkTargetColRef": 8
}]
```
- When a row is selected in widget `2`, widget `3` filters by column `8` matching column `5`'s value
- Common pattern: Source column is a `Ref:TargetTable`, target column is the ID

### Remove Link

```json
["UpdateRecord", "_grist_Views_section", 2, {
  "linkSrcSectionRef": 0,
  "linkSrcColRef": 0,
  "linkTargetColRef": 0
}]
```
- Set all link fields to `0` to remove widget linking

---

## Sorting

The `sortColRefs` field in `_grist_Views_section` contains a JSON array of column references that determine sort order.

### Format

```json
"[2]"           // Column 2 ascending
"[-2]"          // Column 2 descending
"[3, -5, 7]"    // Multiple columns: 3 asc, 5 desc, 7 asc
```

**Rules:**
- Positive number = ascending order
- Negative number = descending order
- Array order determines sort priority (first column is primary sort)

### Sort with Flags

```json
"[\"3:emptyLast\", \"-5:naturalSort\", \"7:orderByChoice\"]"
```

**Available Flags:**
- `emptyLast` - Place empty values at the end (instead of beginning)
- `naturalSort` - Use natural/human sorting (e.g., "2" before "10")
- `orderByChoice` - Sort by choice order (for Choice/ChoiceList columns)

### Set Sort Order

```json
["UpdateRecord", "_grist_Views_section", 1, {
  "sortColRefs": "[3, -5]"
}]
```

**Example:** Sort by column 3 ascending, then column 5 descending

---

## Filtering

Use the `_grist_Filters` table to filter records displayed in a widget.

### Create Filter

```json
["AddRecord", "_grist_Filters", null, {
  "viewSectionRef": 1,
  "colRef": 3,
  "filter": "{\"included\": [\"Active\", \"Pending\"]}",
  "pinned": true
}]
```

**Fields:**
- `viewSectionRef` - Widget ID to filter
- `colRef` - Column ID to filter on
- `filter` - JSON string with filter specification
- `pinned` - If `true`, shows as button in filter bar

### Filter Formats

**Include values:**
```json
{"included": ["value1", "value2"]}
```
- Show only rows where the column matches these values

**Exclude values:**
```json
{"excluded": ["value1", "value2"]}
```
- Hide rows where the column matches these values

### Update Filter

```json
["UpdateRecord", "_grist_Filters", 5, {
  "filter": "{\"included\": [\"Active\"]}",
  "pinned": false
}]
```

### Remove Filter

```json
["RemoveRecord", "_grist_Filters", 5]
```

---

## Widget Types

| Display Name | `parentKey` Value | Description |
|--------------|-------------------|-------------|
| Table | `record` | Grid view with rows and columns |
| Card | `single` | Single record card view |
| Card List | `detail` | List of record cards |
| Chart | `chart` | Chart visualization |
| Form | `form` | Form for data entry |
| Custom | `custom` | Custom widget plugin |
| Calendar | `custom.calendar` | Calendar view |

**Note:** Use the `parentKey` value when specifying `sectionType` in `CreateViewSection`.

---

## Querying Configuration

Use SQL queries to retrieve page and widget configuration.

### Get Widgets on a Page

```sql
GET /api/docs/{docId}/sql?q=
SELECT * FROM _grist_Views_section WHERE parentId = 5
```

Returns all widgets on page (view) with ID 5.

### Get Page Layout

```sql
GET /api/docs/{docId}/sql?q=
SELECT id, name, layoutSpec FROM _grist_Views WHERE id = 5
```

Returns the layout structure for page 5.

### Get Widget Links

```sql
GET /api/docs/{docId}/sql?q=
SELECT vs.id, vs.title, vs.linkSrcSectionRef, vs.linkSrcColRef, vs.linkTargetColRef
FROM _grist_Views_section vs
WHERE vs.linkSrcSectionRef > 0
```

Returns all widgets that have incoming links configured.

### Get Widget Filters

```sql
GET /api/docs/{docId}/sql?q=
SELECT f.* FROM _grist_Filters f WHERE f.viewSectionRef = 1
```

Returns all filters applied to widget 1.

### Get All Pages

```sql
GET /api/docs/{docId}/sql?q=
SELECT p.id, p.pagePos, p.indentation, v.name
FROM _grist_Pages p
JOIN _grist_Views v ON p.viewRef = v.id
ORDER BY p.pagePos
```

Returns all pages with their names and positions.

---

## Important Notes

### Multi-Action Row References

When sending multiple actions in a single request, use zero-based indexing to reference newly created rows:

```json
[
  ["AddRecord", "Table1", null, {"Name": "Test"}],
  ["UpdateRecord", "_grist_Tables", 0, {"primaryViewId": 5}]
]
```
- First action creates a record - reference it as `0` in subsequent actions
- Second action updates the record created by the first action

### JSON Field Serialization

All JSON fields must be stringified:
- ✅ `"layoutSpec": "{\"type\":\"leaf\",\"leaf\":1}"`
- ❌ `"layoutSpec": {"type":"leaf","leaf":1}`

### CreateViewSection Initialization

`CreateViewSection` automatically:
- Creates necessary metadata records
- Initializes default field configurations
- Sets up reasonable defaults for widget display

### Link Validation

Grist validates that:
- Source and target columns exist
- Column types are compatible for linking
- No circular link dependencies are created

### Form Compatibility

Forms have special restrictions:
- Cannot be created on summary tables
- May have limited linking capabilities
- Designed for data entry workflows

---

## Additional Resources

For more information, see:
- `grist-database-schema.md` - Complete metadata table schemas
- `grist-apply-actions.d.ts` - TypeScript type definitions for all actions
- [Grist Help Center](https://support.getgrist.com/) - User documentation
- [Grist GitHub](https://github.com/gristlabs/grist-core) - Source code and examples

---

**Document Status:** ✅ Complete and validated
**Schema Version:** 44
**Last Updated:** 2025-11-14
