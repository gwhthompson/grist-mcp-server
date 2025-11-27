/**
 * Utilities for extracting fields from Grist API responses.
 *
 * Grist SQL responses return records in two formats:
 * 1. Direct: { id: 1, name: "foo" }
 * 2. Nested: { fields: { id: 1, name: "foo" } }
 *
 * These utilities handle both formats consistently.
 */

type GristRecord = Record<string, unknown>

/**
 * Extracts the fields object from a Grist record.
 * Handles both nested (fields property) and flat record formats.
 */
export function extractFields(record: unknown): GristRecord {
  const rec = record as GristRecord
  const fields = rec.fields as GristRecord | undefined
  return fields ?? rec
}

/**
 * Extracts a specific field from a Grist record.
 * @returns The field value, or undefined if not present
 */
export function extractField<T>(record: unknown, fieldName: string): T | undefined {
  const fields = extractFields(record)
  return fields[fieldName] as T | undefined
}

/**
 * Extracts a specific field with a default value.
 */
export function extractFieldWithDefault<T>(record: unknown, fieldName: string, defaultValue: T): T {
  const value = extractField<T>(record, fieldName)
  return value !== undefined ? value : defaultValue
}

/**
 * Type guard to check if a record has a specific field.
 */
export function hasField(record: unknown, fieldName: string): boolean {
  const fields = extractFields(record)
  return fieldName in fields
}

/**
 * Extracts a string field, returning empty string if not present or not a string.
 */
export function extractString(record: unknown, fieldName: string): string {
  const value = extractField(record, fieldName)
  return typeof value === 'string' ? value : ''
}

/**
 * Extracts a number field, returning 0 if not present or not a number.
 */
export function extractNumber(record: unknown, fieldName: string): number {
  const value = extractField(record, fieldName)
  return typeof value === 'number' ? value : 0
}

/**
 * Extracts a number field that may be null (e.g., reference fields).
 */
export function extractNullableNumber(record: unknown, fieldName: string): number | null {
  const value = extractField(record, fieldName)
  if (value === null) return null
  return typeof value === 'number' ? value : 0
}
