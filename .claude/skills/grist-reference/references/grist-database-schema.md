# Grist Database Schema Reference

Complete reference for Grist metadata tables and database structure.

**Schema Version:** 44
**Last Updated:** 2025-11-17
**Source:** grist-core commit a2b1a344

---

## Quick Reference

| Table | Purpose | Permission | Key Columns |
|-------|---------|------------|-------------|
| `_grist_DocInfo` | Document metadata | VIEWER | `docId`, `schemaVersion` |
| `_grist_Tables` | Table definitions | VIEWER | `tableId`, `primaryViewId` |
| `_grist_Tables_column` | Column definitions | VIEWER | `colId`, `type`, `widgetOptions` |
| `_grist_Views` | Page/view definitions | VIEWER | `name`, `type` |
| `_grist_Views_section` | View sections (widgets) | VIEWER | `tableRef`, `parentKey` |
| `_grist_Views_section_field` | Field configurations | VIEWER | `colRef`, `widgetOptions` |
| `_grist_Pages` | Page tree structure | VIEWER | `pagePos`, `viewRef` |
| `_grist_TabBar` | Tab bar configuration | VIEWER | `tabPos`, `viewRef` |
| `_grist_Validations` | Column validation rules | VIEWER | `formula`, `colRef` |
| `_grist_ACLResources` | ACL resource definitions | OWNER | `tableId`, `colIds` |
| `_grist_ACLRules` | Access control rules | OWNER | `resource`, `permissions` |
| `_grist_Attachments` | File attachments | VIEWER | `fileIdent`, `fileName` |
| `_grist_Shares` | Sharing links | OWNER | `linkId`, `options` |
| `_grist_Triggers` | Webhook triggers | OWNER | `tableRef`, `eventTypes` |
| `_grist_Filters` | Saved filters | VIEWER | `colRef`, `filter` |
| `_grist_TableViews` | (Deprecated v8) | - | - |
| `_grist_TabItems` | (Deprecated v12) | - | - |

---

## Implementation Notes

### Foreign Keys
**CRITICAL:** Foreign keys are **DISABLED globally** in Grist documents.

```sql
PRAGMA foreign_keys=OFF
```

- References like `Ref:_grist_Tables` are **logical only**
- NOT enforced by SQLite
- No CASCADE behavior - handled by Python data engine
- Application code manages referential integrity

**Source:** `/app/server/lib/initialDocSql.ts`

### Auto-Generated Columns

**Auto-Increment:**
- `id`: INTEGER PRIMARY KEY (auto-increments via SQLite)
- Unique per table, starts at 1

**Fractional Positioning** (NUMERIC type):
- `manualSort`: DEFAULT 1e999 (manual row ordering)
- `parentPos`: DEFAULT 1e999 (tree position)
- `tabPos`, `pagePos`, `rulePos`: DEFAULT 1e999
- Uses lexicographic ordering for efficient reordering

**Helper Columns:**
- Prefixed with `gristHelper_`
- Auto-created for display formulas, conditional rules
- Managed by application, not user-editable

### Default Values

From `/app/server/lib/initialDocSql.ts`:

- Text fields: `DEFAULT ''` (empty string)
- Integer fields: `DEFAULT 0`
- Boolean fields: `DEFAULT 0` (false)
- Nullable fields: `DEFAULT NULL`
- Reference fields: `DEFAULT 0` (no reference)
- Position fields: `DEFAULT 1e999`

### Storage Formats

**RefList/ChoiceList:**
```sql
-- Stored as TEXT containing JSON
-- Example: '["L", "value1", "value2"]'
```

**WidgetOptions:**
```sql
-- Stored as TEXT containing JSON string
-- Example: '{"numMode":"currency","currency":"USD"}'
```

**Formulas:**
```sql
-- Stored as TEXT
-- Example: '$Price * $Quantity'
```

### Schema Version Tracking

Current version: **44** (stored in `_grist_DocInfo.schemaVersion`)

Schema changes tracked in:
- `/app/common/schema.ts:7` (SCHEMA_VERSION)
- `/app/server/lib/initialDocSql.ts`

---

## Table Definitions

### _grist_DocInfo

Document-level metadata and settings.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | Always 1 (single row) |
| `docId` | TEXT | '' | Document identifier |
| `peers` | TEXT | '' | (Unused) |
| `basketId` | TEXT | '' | (Unused) |
| `schemaVersion` | INTEGER | 44 | Current schema version |
| `timezone` | TEXT | '' | Document timezone |
| `documentSettings` | TEXT | '' | JSON settings |

**Permission:** VIEWER can read, OWNER can modify

**Notes:**
- Single row per document
- `documentSettings` stores document-wide preferences as JSON

---

### _grist_Tables

Table definitions in the document.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | Table reference ID |
| `tableId` | TEXT | '' | Table identifier (e.g., "People") |
| `primaryViewId` | INTEGER | 0 | Ref to _grist_Views |
| `summarySourceTable` | INTEGER | 0 | Source table for summary tables |
| `onDemand` | BOOLEAN | 0 | Load table on demand |
| `rawViewSectionRef` | INTEGER | 0 | Ref to raw data view section |
| `recordCardViewSectionRef` | INTEGER | 0 | Ref to card view section |

**Permission:** VIEWER can read, EDITOR can create/modify (OWNER for schema changes)

**Logical References:**
- `primaryViewId` → `_grist_Views.id`
- `summarySourceTable` → `_grist_Tables.id`
- `rawViewSectionRef` → `_grist_Views_section.id`
- `recordCardViewSectionRef` → `_grist_Views_section.id`

**Notes:**
- `tableId` must be valid Python identifier
- Summary tables have `summarySourceTable` set to source table ID
- `onDemand` tables load data only when accessed

---

### _grist_Tables_column

Column definitions for all tables.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | Column reference ID |
| `parentId` | INTEGER | 0 | Ref to _grist_Tables.id |
| `parentPos` | NUMERIC | 1e999 | Position in table |
| `colId` | TEXT | '' | Column identifier |
| `type` | TEXT | 'Any' | Column type (e.g., "Text", "Numeric") |
| `widgetOptions` | TEXT | '' | JSON widget options **STRING** |
| `isFormula` | BOOLEAN | 0 | true for formula columns |
| `formula` | TEXT | '' | Formula text |
| `label` | TEXT | '' | Display label |
| `untieColIdFromLabel` | BOOLEAN | 0 | Allow colId/label mismatch |
| `summarySourceCol` | INTEGER | 0 | Source column for summary |
| `displayCol` | INTEGER | 0 | Display formula column ref |
| `visibleCol` | INTEGER | 0 | Visible column in target table |
| `rules` | TEXT | NULL | Conditional formatting rules (JSON) |
| `recalcWhen` | INTEGER | 0 | Recalc trigger time |
| `recalcDeps` | TEXT | NULL | Recalc dependencies (JSON) |

**Permission:** VIEWER can read, EDITOR can create/modify

**Logical References:**
- `parentId` → `_grist_Tables.id`
- `summarySourceCol` → `_grist_Tables_column.id`
- `displayCol` → `_grist_Tables_column.id`
- `visibleCol` → `_grist_Tables_column.id` (in referenced table)

**CRITICAL Notes:**
- `widgetOptions` is TEXT containing JSON **string**, not JSON object
- `type` format: "Text", "Numeric", "Ref:TableName", "RefList:TableName"
- `parentPos` uses NUMERIC for fractional positioning
- Helper columns start with `gristHelper_`

**Type Examples:**
```
Text, Numeric, Int, Bool, Date, DateTime
Choice, ChoiceList
Ref:People, RefList:Tags
Attachments (shorthand for RefList:_grist_Attachments)
```

---

### _grist_Views

Page/view definitions.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | View reference ID |
| `name` | TEXT | '' | View name |
| `type` | TEXT | 'raw_data' | View type |
| `layoutSpec` | TEXT | '' | Layout specification (JSON) |

**Permission:** VIEWER can read, EDITOR can create/modify (OWNER for some operations)

**View Types:**
- `raw_data`: Raw data view
- `empty`: Empty view

**Notes:**
- `layoutSpec` contains widget layout as JSON
- Each view can have multiple sections (widgets)

---

### _grist_Views_section

View sections (individual widgets within a page).

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | Section reference ID |
| `tableRef` | INTEGER | 0 | Ref to _grist_Tables |
| `parentId` | INTEGER | 0 | Ref to _grist_Views |
| `parentKey` | TEXT | 'record' | Section type |
| `title` | TEXT | '' | Section title |
| `description` | TEXT | '' | Section description |
| `defaultWidth` | INTEGER | 100 | Default width (%) |
| `borderWidth` | INTEGER | 1 | Border width |
| `theme` | TEXT | 'form' | Widget theme |
| `options` | TEXT | '' | Widget options (JSON) |
| `chartType` | TEXT | 'bar' | Chart type |
| `layoutSpec` | TEXT | '' | Layout specification |
| `sortColRefs` | TEXT | '' | Sort columns (JSON list) |
| `linkSrcSectionRef` | INTEGER | 0 | Source section for linking |
| `linkSrcColRef` | INTEGER | 0 | Source column for linking |
| `linkTargetColRef` | INTEGER | 0 | Target column for linking |
| `embedId` | TEXT | '' | Custom widget embed ID |
| `filterId` | TEXT | '' | Filter ID |

**Permission:** VIEWER can read, EDITOR can create/modify

**Logical References:**
- `tableRef` → `_grist_Tables.id`
- `parentId` → `_grist_Views.id`
- `linkSrcSectionRef` → `_grist_Views_section.id`
- `linkSrcColRef` → `_grist_Tables_column.id`
- `linkTargetColRef` → `_grist_Tables_column.id`

**Section Types (parentKey):**
- `record`: Table view
- `detail`: Card List view
- `single`: Single Card view
- `chart`: Chart view
- `custom`: Custom widget
- `form`: Form view

---

### _grist_Views_section_field

Field configurations within view sections.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | Field reference ID |
| `colRef` | INTEGER | 0 | Ref to _grist_Tables_column |
| `parentId` | INTEGER | 0 | Ref to _grist_Views_section |
| `parentPos` | NUMERIC | 1e999 | Position in section |
| `width` | INTEGER | 0 | Column width |
| `widgetOptions` | TEXT | '' | Field-specific widget options |
| `displayCol` | INTEGER | 0 | Display column override |
| `visibleCol` | INTEGER | 0 | Visible column override |
| `filter` | TEXT | '' | Field filter (JSON) |
| `rules` | TEXT | NULL | Conditional formatting rules |

**Permission:** VIEWER can read, EDITOR can modify

**Logical References:**
- `colRef` → `_grist_Tables_column.id`
- `parentId` → `_grist_Views_section.id`
- `displayCol` → `_grist_Tables_column.id`
- `visibleCol` → `_grist_Tables_column.id`

**Notes:**
- Field-level `widgetOptions` override column-level options
- Field-level `visibleCol`/`displayCol` override column-level

---

### _grist_Pages

Page tree structure.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | Page reference ID |
| `pagePos` | NUMERIC | 1e999 | Position in tree |
| `viewRef` | INTEGER | 0 | Ref to _grist_Views |
| `indentation` | INTEGER | 0 | Tree indentation level |

**Permission:** VIEWER can read, EDITOR can modify

**Logical References:**
- `viewRef` → `_grist_Views.id`

**Notes:**
- `pagePos` determines ordering in page tree
- `indentation` creates hierarchical structure

---

### _grist_TabBar

Tab bar configuration.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | Tab reference ID |
| `viewRef` | INTEGER | 0 | Ref to _grist_Views |
| `tabPos` | NUMERIC | 1e999 | Position in tab bar |

**Permission:** VIEWER can read, EDITOR can modify

**Logical References:**
- `viewRef` → `_grist_Views.id`

---

### _grist_Validations

Column validation rules.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | Validation reference ID |
| `formula` | TEXT | '' | Validation formula |
| `name` | TEXT | '' | Validation name |
| `tableRef` | INTEGER | 0 | Ref to _grist_Tables |
| `colRef` | INTEGER | 0 | Ref to _grist_Tables_column |

**Permission:** VIEWER can read, EDITOR can create/modify

**Logical References:**
- `tableRef` → `_grist_Tables.id`
- `colRef` → `_grist_Tables_column.id`

---

### _grist_ACLResources

ACL resource definitions (tables/columns to protect).

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | Resource reference ID |
| `tableId` | TEXT | '' | Table ID or '*' for all |
| `colIds` | TEXT | '' | Column IDs (comma-separated) or '*' |

**Permission:** OWNER only (ACL management)

**Notes:**
- `tableId` = '*' means all tables
- `colIds` = '*' means all columns
- `colIds` = '' means table-level resource

---

### _grist_ACLRules

Access control rules.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | Rule reference ID |
| `resource` | INTEGER | 0 | Ref to _grist_ACLResources |
| `permissions` | INTEGER | 0 | Permission bits |
| `principals` | TEXT | '' | Principal selector |
| `aclFormula` | TEXT | '' | Conditional formula |
| `aclColumn` | INTEGER | 0 | (Deprecated) |
| `rulePos` | NUMERIC | 1e999 | Rule evaluation order |
| `permissionsText` | TEXT | '' | Permission text override |
| `userAttributes` | TEXT | '' | User attributes (JSON) |
| `memo` | TEXT | '' | Rule description |

**Permission:** OWNER only (ACL management)

**Logical References:**
- `resource` → `_grist_ACLResources.id`

**Permission Bits:**
- 0x01: VIEW
- 0x02: UPDATE
- 0x04: ADD
- 0x08: REMOVE
- 0x10: SCHEMA_EDIT
- 0x20: ACL_EDIT

**Source:** `/app/gen-server/lib/Permissions.ts`

---

### _grist_Attachments

File attachments metadata.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | Attachment ID |
| `fileIdent` | TEXT | '' | File identifier (hash) |
| `fileName` | TEXT | '' | Original filename |
| `fileType` | TEXT | '' | MIME type |
| `fileSize` | INTEGER | 0 | File size in bytes |
| `timeUploaded` | DATETIME | 0 | Upload timestamp |

**Permission:** VIEWER can read, EDITOR can upload, OWNER can manage

**Notes:**
- `fileIdent` is content-based hash for deduplication
- Actual file storage separate from metadata
- Single index: `_grist_Attachments_fileIdent` on `fileIdent`

**Storage:**
- `timeUploaded` stored as Unix timestamp (seconds)

---

### _grist_Shares

Sharing links and permissions.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | Share reference ID |
| `linkId` | TEXT | '' | Share link identifier |
| `options` | TEXT | '' | Share options (JSON) |

**Permission:** OWNER only (share management)

**Options include:**
- Link expiration
- Read-only vs full access
- Specific table/view access

---

### _grist_Triggers

Webhook triggers.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | Trigger reference ID |
| `tableRef` | INTEGER | 0 | Ref to _grist_Tables |
| `eventTypes` | TEXT | '' | Event types (JSON) |
| `isReadyColumn` | INTEGER | NULL | Ready column ref |
| `enabled` | BOOLEAN | 1 | Trigger enabled |
| `webhookId` | TEXT | '' | Webhook identifier |
| `memo` | TEXT | '' | Trigger description |

**Permission:** OWNER only (webhook management)

**Logical References:**
- `tableRef` → `_grist_Tables.id`
- `isReadyColumn` → `_grist_Tables_column.id`

**Event Types:**
- `["add"]`: Row insertions
- `["update"]`: Row updates
- `["add", "update"]`: Both

---

### _grist_Filters

Saved filters.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PRIMARY KEY | auto | Filter reference ID |
| `viewSectionRef` | INTEGER | 0 | Ref to _grist_Views_section |
| `colRef` | INTEGER | 0 | Ref to _grist_Tables_column |
| `filter` | TEXT | '' | Filter specification (JSON) |
| `pinned` | BOOLEAN | 0 | Filter pinned |

**Permission:** VIEWER can read, EDITOR can modify

**Logical References:**
- `viewSectionRef` → `_grist_Views_section.id`
- `colRef` → `_grist_Tables_column.id`

---

## Deprecated Tables

These tables exist for backward compatibility but are no longer used:

### _grist_TableViews (Deprecated v8)
Replaced by `_grist_Views_section`

### _grist_TabItems (Deprecated v12)
Replaced by `_grist_TabBar`

---

## Common SQL Queries

### List All Tables
```sql
SELECT tableId
FROM _grist_Tables
WHERE summarySourceTable = 0  -- Exclude summary tables
  AND NOT tableId LIKE '_grist_%';  -- Exclude metadata tables
```

### Get Table Schema
```sql
SELECT colId, type, label, isFormula, formula
FROM _grist_Tables_column
WHERE parentId = (SELECT id FROM _grist_Tables WHERE tableId = 'MyTable')
ORDER BY parentPos;
```

### Find Reference Columns
```sql
SELECT t.tableId, c.colId, c.type
FROM _grist_Tables_column c
JOIN _grist_Tables t ON c.parentId = t.id
WHERE c.type LIKE 'Ref:%' OR c.type LIKE 'RefList:%';
```

### List All Views
```sql
SELECT name, type
FROM _grist_Views
ORDER BY id;
```

---

## Notes

1. **Foreign keys are disabled** - all references are logical only
2. **Position fields use NUMERIC** - allows fractional positions for efficient reordering
3. **Helper columns** prefixed with `gristHelper_` are auto-managed
4. **WidgetOptions are JSON strings** - not JSON objects in database
5. **Only one index** in entire schema: on `_grist_Attachments.fileIdent`

---

**End of Reference**

For source code details, see:
- `/app/common/schema.ts`
- `/app/server/lib/initialDocSql.ts`
- `/sandbox/grist/schema.py`
