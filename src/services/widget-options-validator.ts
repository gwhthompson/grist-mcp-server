/**
 * Widget Options Validation Service
 *
 * Provides type-safe validation and serialization of widgetOptions before
 * sending to the Grist API. This prevents invalid data from reaching the API
 * and ensures data integrity.
 *
 * Security Features:
 * - Column-type-specific validation using Zod schemas
 * - Strict mode (rejects unknown properties)
 * - Circular reference protection
 * - Comprehensive error messages for debugging
 */

import { ValidationError } from '../errors/ValidationError.js'
import { getWidgetOptionsSchema } from '../schemas/widget-options.js'

/**
 * Validates and serializes widgetOptions for a specific column type
 *
 * This function is the secure replacement for serializeWidgetOptions(),
 * ensuring all widgetOptions are validated BEFORE serialization.
 *
 * @param widgetOptions - Widget options to validate (object, string, or undefined)
 * @param columnType - Column type (e.g., "Text", "Numeric", "Ref:People")
 * @returns JSON string representation, or undefined if no options provided
 * @throws {ValidationError} if widgetOptions fail validation
 * @throws {ValidationError} if circular references detected
 *
 * @example
 * ```typescript
 * // Valid usage
 * const serialized = validateAndSerializeWidgetOptions(
 *   { numMode: 'currency', currency: 'USD', decimals: 2 },
 *   'Numeric'
 * )
 * // Returns: '{"numMode":"currency","currency":"USD","decimals":2}'
 *
 * // Invalid usage - throws ValidationError
 * validateAndSerializeWidgetOptions(
 *   { decimals: 25 }, // exceeds max of 20
 *   'Numeric'
 * )
 * // Throws: ValidationError with message about decimal constraint
 * ```
 */
export function validateAndSerializeWidgetOptions(
  widgetOptions: unknown,
  columnType: string
): string | undefined {
  // Early return for empty options
  if (!widgetOptions) {
    return undefined
  }

  // If already a string, try to parse and re-validate
  let optionsObject: unknown
  if (typeof widgetOptions === 'string') {
    try {
      optionsObject = JSON.parse(widgetOptions)
    } catch (error) {
      throw new ValidationError(
        'widgetOptions',
        widgetOptions,
        'Must be valid JSON string or object',
        {
          error: error instanceof Error ? error.message : String(error),
          columnType
        }
      )
    }
  } else {
    optionsObject = widgetOptions
  }

  // Get type-specific schema (uses strict mode per CLAUDE.md)
  const schema = getWidgetOptionsSchema(columnType)

  // Validate against schema - strict mode rejects unknown properties
  const result = schema.safeParse(optionsObject)

  if (!result.success) {
    // Create user-friendly validation error
    throw ValidationError.fromZodError(
      result.error,
      `widgetOptions (for column type: ${columnType})`
    )
  }

  // Serialize validated data with circular reference protection
  try {
    return JSON.stringify(result.data)
  } catch (error) {
    // Check if it's a circular reference error
    if (error instanceof TypeError && error.message.includes('circular')) {
      throw new ValidationError(
        'widgetOptions',
        widgetOptions,
        'Cannot serialize: circular reference detected',
        { columnType }
      )
    }

    // Re-throw other serialization errors
    throw new ValidationError(
      'widgetOptions',
      widgetOptions,
      `Serialization failed: ${error instanceof Error ? error.message : String(error)}`,
      { columnType }
    )
  }
}

/**
 * Runtime type guard to check if widgetOptions are valid for a column type
 *
 * This is useful for conditional validation without throwing errors.
 *
 * @param value - Value to check
 * @param columnType - Column type to validate against
 * @returns true if valid, false otherwise
 *
 * @example
 * ```typescript
 * if (isValidWidgetOptions(options, 'Numeric')) {
 *   // Safe to use options
 *   console.log('Valid numeric widget options')
 * }
 * ```
 */
export function isValidWidgetOptions(value: unknown, columnType: string): boolean {
  try {
    validateAndSerializeWidgetOptions(value, columnType)
    return true
  } catch {
    return false
  }
}

/**
 * Validates widgetOptions without serializing
 *
 * Useful for validation-only scenarios where you don't need the JSON string.
 *
 * @param widgetOptions - Widget options to validate
 * @param columnType - Column type
 * @returns Validation result with detailed error messages
 *
 * @example
 * ```typescript
 * const result = validateWidgetOptionsOnly(options, 'Numeric')
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors)
 * }
 * ```
 */
export function validateWidgetOptionsOnly(
  widgetOptions: unknown,
  columnType: string
): { valid: boolean; errors?: string[] } {
  if (!widgetOptions) {
    return { valid: true }
  }

  const schema = getWidgetOptionsSchema(columnType)
  const result = schema.safeParse(widgetOptions)

  if (result.success) {
    return { valid: true }
  }

  return {
    valid: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
  }
}
