# Grist API Behavior

Verified behavior from testing against Docker Grist instance.

---

## Reference Columns (Ref)

**Input:** Plain number only (`123`). Encoded format `['R', 'Table', 123]` rejected.

**Output:** Plain number, or `0` for null references.

---

## RefList Columns

**Input:** Requires `['L', 1, 2, 3]` encoding. Plain `[1, 2, 3]` rejected with error "not a GristObjCode".

**Output:** `['L', 1, 2, 3]` or `null` for empty.

---

## Date Columns

**Input:** Accepts both plain timestamp (`1705276800`) and encoded (`['d', 1705276800]`).

**Output:** Plain timestamp in seconds.

---

## DateTime Columns

**Input:** Accepts both plain timestamp and encoded (`['D', 1705320600, 'UTC']`).

**Output:** Plain timestamp in seconds. Timezone not preserved.

---

## ChoiceList Columns

**Input:** Requires `['L', 'New', 'Featured']` encoding. Plain arrays rejected.

**Output:** `['L', 'New', 'Featured']` or `null` for empty.

---

## Summary

| Column Type | Accept Plain? | Accept Encoded? | Returns |
|-------------|---------------|-----------------|---------|
| Ref         | Yes (number)  | No              | Plain number or 0 |
| RefList     | No            | Yes `['L',...]` | `['L',...]` or null |
| Date        | Yes           | Yes `['d',ts]`  | Plain timestamp |
| DateTime    | Yes           | Yes `['D',ts,tz]` | Plain timestamp |
| Choice      | Yes (string)  | N/A             | Plain string |
| ChoiceList  | No            | Yes `['L',...]` | `['L',...]` or null |
| Text        | Yes           | N/A             | Plain string |
| Numeric/Int | Yes           | N/A             | Plain number |
| Bool        | Yes           | N/A             | Plain boolean |

---

## Three List Formats

Grist uses three distinct list formats:

### 'L' - Simple List
`['L', item1, item2, ...]`

Standard format for REST API. Used for ReferenceList, ChoiceList, and Attachments.

### 'l' - LookUp (temporary)
`['l', values, {column, raw}]`

Parsing format when table data not loaded. Resolved to 'L' once available.

### 'r' - ReferenceList (full)
`['r', table_id, [row_ids]]`

Python data engine format for RecordSet serialization. Includes table context.

---

## REST API Rules

- **Input:** Use `['L', ...]` format
- **Output:** Usually `['L', ...]`, occasionally `['r', ...]` from data engine
- **Never expect:** `['l', ...]` in REST responses (parsing format only)

---

## SQLite Storage

Lists stored without format marker:

```
['L', 'Red', 'Blue'] → '["Red", "Blue"]'  (storage)
'["Red", "Blue"]' → ['L', 'Red', 'Blue']  (retrieval)
```

---

## Conditional Formatting (Rules)

Conditional formatting in Grist is split across two locations:

### rulesOptions (widgetOptions)

Contains **style definitions** only:
```json
{
  "rulesOptions": [
    {
      "textColor": "#FF0000",
      "fillColor": "#FFEEEE"
    },
    {
      "textColor": "#00FF00",
      "fillColor": "#EEFFEE"
    }
  ]
}
```

### rules (column property)

Contains **formula references**:
```json
{
  "rules": ["$Amount > 1000", "$Status == 'Urgent'"]
}
```

**Note:** When reading column configuration via SQL, the `rules` property contains the formulas while `widgetOptions.rulesOptions` contains only the visual styles. The indices must align - `rulesOptions[0]` applies when `rules[0]` is true.

This means:
- To fully understand conditional formatting, you need BOTH the column's `rules` array AND the `widgetOptions.rulesOptions` array
- The `rulesOptions` alone doesn't tell you WHEN the styles apply, only WHAT styles apply
