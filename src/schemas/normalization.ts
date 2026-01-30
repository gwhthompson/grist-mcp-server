/**
 * Input normalization for schema and record operations.
 *
 * Handles:
 * - create_table accepts both `name` and `tableId` for consistency
 * - create_table/add_column accept `id` as alias for `colId` in column definitions
 * - update records accept flat shape {id, Name} as alias for {id, fields: {Name}}
 * - delete operations accept `recordIds` as alias for `rowIds`
 *
 * Key insight: z.preprocess() returns ZodEffects, not ZodObject, which breaks
 * discriminatedUnion(). By normalizing at the array level (via jsonSafeArray's
 * normalize option), we keep union members as pure ZodObject instances.
 */

import { log } from '../utils/logger.js'

// =============================================================================
// Column Definition Normalization (id → colId)
// =============================================================================

/**
 * Keys that belong at root level in ColumnDefinitionSchema but LLMs
 * often nest inside `widgetOptions` (copying grist_get_tables output).
 */
const WIDGET_OPTION_KEYS = new Set([
  'widget',
  'wrap',
  'numMode',
  'currency',
  'numSign',
  'decimals',
  'maxDecimals',
  'dateFormat',
  'isCustomDateFormat',
  'timeFormat',
  'isCustomTimeFormat',
  'choices',
  'choiceOptions',
  'height'
])

/**
 * Parse widgetOptions if it's a JSON string, otherwise return as-is.
 */
function parseWidgetOptions(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return null
    }
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

/**
 * Normalize a column definition:
 * - Converts `id` → `colId` when `colId` is absent
 * - Hoists known type-specific keys from `widgetOptions` to root level
 *
 * Grist API returns columns with `id` and nested `widgetOptions`, but
 * ColumnDefinitionSchema expects `colId` and flat type-specific keys.
 * Without hoisting, Zod silently strips the unknown `widgetOptions` key,
 * losing configuration like choices for Choice columns.
 */
function normalizeColumnDefinition(column: unknown): unknown {
  if (typeof column !== 'object' || column === null) {
    return column
  }

  let obj = column as Record<string, unknown>

  // Convert id → colId
  if ('id' in obj && !('colId' in obj) && typeof obj.id === 'string') {
    const { id, ...rest } = obj
    obj = { ...rest, colId: id }
  }

  // Hoist known keys from widgetOptions to root level
  if ('widgetOptions' in obj) {
    const woValue = parseWidgetOptions(obj.widgetOptions)
    if (woValue) {
      const { widgetOptions: _wo, ...rest } = obj
      const result = { ...rest }
      for (const [key, value] of Object.entries(woValue)) {
        // Only hoist known keys; root takes precedence
        if (WIDGET_OPTION_KEYS.has(key) && !(key in result)) {
          result[key] = value
        }
      }
      return result
    }
    // widgetOptions present but not a valid object — strip it
    const { widgetOptions: _wo, ...rest } = obj
    return rest
  }

  return obj
}

// =============================================================================
// Schema Operation Normalization
// =============================================================================

/**
 * Normalize schema operation:
 * - Converts tableId → name for create_table
 * - Converts id → colId in column definitions for create_table and add_column
 *
 * @example
 * normalizeSchemaOperation({action: "create_table", tableId: "Tasks"})
 * // → {action: "create_table", name: "Tasks"}
 *
 * normalizeSchemaOperation({action: "create_table", name: "Tasks", columns: [{id: "Name", type: "Text"}]})
 * // → {action: "create_table", name: "Tasks", columns: [{colId: "Name", type: "Text"}]}
 */
export function normalizeSchemaOperation(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) {
    return input
  }

  const obj = input as Record<string, unknown>
  const action = obj.action as string | undefined

  // Convert tableId → name for create_table
  let result = obj
  if (action === 'create_table') {
    if ('tableId' in obj && !('name' in obj)) {
      const { tableId, ...rest } = obj
      result = { ...rest, name: tableId }
    } else {
      result = { ...obj }
    }

    // Normalize column definitions: id → colId
    if (Array.isArray(result.columns)) {
      result.columns = result.columns.map(normalizeColumnDefinition)
    }

    return result
  }

  // Normalize column definition for add_column: id → colId
  if (
    action === 'add_column' &&
    'column' in obj &&
    typeof obj.column === 'object' &&
    obj.column !== null
  ) {
    return { ...obj, column: normalizeColumnDefinition(obj.column) }
  }

  return input
}

// =============================================================================
// Record Operation Normalization (flat update → canonical {id, fields})
// =============================================================================

/**
 * Normalize a record operation:
 * - Converts flat update records `{id, Name}` to canonical `{id, fields: {Name}}`
 * - Renames `recordIds` → `rowIds` for delete (output uses `recordIds`, input expects `rowIds`)
 *
 * Other actions pass through unchanged.
 *
 * @example
 * normalizeRecordOperation({action: "update", tableId: "T", records: [{id: 1, Name: "Alice"}]})
 * // → {action: "update", tableId: "T", records: [{id: 1, fields: {Name: "Alice"}}]}
 *
 * @example
 * normalizeRecordOperation({action: "delete", tableId: "T", recordIds: [1, 2]})
 * // → {action: "delete", tableId: "T", rowIds: [1, 2]}
 */
export function normalizeRecordOperation(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) {
    return input
  }

  const obj = input as Record<string, unknown>

  // Normalize recordIds → rowIds for delete (output uses recordIds, input expects rowIds)
  if (obj.action === 'delete' && 'recordIds' in obj && !('rowIds' in obj)) {
    const { recordIds, ...rest } = obj
    return { ...rest, rowIds: recordIds }
  }

  if (obj.action !== 'update') {
    return input
  }

  if (!Array.isArray(obj.records)) {
    return input
  }

  return { ...obj, records: obj.records.map(normalizeUpdateRecord) }
}

/** Check if a value is a plain object (not null, not array). */
function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

/**
 * Collect extra column data keys from a record (keys beyond `id` and `fields`).
 * If `fields` is present but not a plain object (e.g., a column named "fields"),
 * include it as column data.
 */
function collectFieldData(
  obj: Record<string, unknown>,
  extraKeys: string[]
): Record<string, unknown> {
  const fields: Record<string, unknown> = {}

  // If `fields` exists but isn't a plain object, treat it as column data
  if ('fields' in obj && !isPlainObject(obj.fields)) {
    fields.fields = obj.fields
  }

  for (const key of extraKeys) {
    fields[key] = obj[key]
  }

  return fields
}

/**
 * Normalize a single update record from flat to canonical shape.
 *
 * Handles:
 * - Already canonical: {id: 1, fields: {Name: "Alice"}} → pass through
 * - Flat shape: {id: 1, Name: "Alice"} → {id: 1, fields: {Name: "Alice"}}
 * - Mixed (leaked keys): {id: 1, fields: {Name: "Alice"}, Status: "Done"}
 *   → {id: 1, fields: {Name: "Alice", Status: "Done"}}
 * - `fields` as column name: {id: 1, fields: "value"} → {id: 1, fields: {fields: "value"}}
 */
function normalizeUpdateRecord(record: unknown): unknown {
  if (!isPlainObject(record)) {
    return record
  }

  // Must have a numeric id
  if (!('id' in record) || typeof record.id !== 'number') {
    return record
  }

  const extraKeys = Object.keys(record).filter((k) => k !== 'id' && k !== 'fields')

  // If `fields` is a plain object, this is canonical or mixed shape
  if ('fields' in record && isPlainObject(record.fields)) {
    if (extraKeys.length === 0) {
      return record
    }

    // Mixed case: merge leaked keys into existing fields
    const mergedFields = { ...record.fields }
    for (const key of extraKeys) {
      mergedFields[key] = record[key]
    }

    log.debug('Normalized mixed update record', { id: record.id, mergedKeys: extraKeys })
    return { id: record.id, fields: mergedFields }
  }

  // Flat shape or `fields` is a column name
  const fields = collectFieldData(record, extraKeys)
  if (Object.keys(fields).length === 0) {
    return record
  }

  log.debug('Normalized flat update record', { id: record.id, flatKeys: Object.keys(fields) })
  return { id: record.id, fields }
}
