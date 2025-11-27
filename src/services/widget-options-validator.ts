import { ValidationError } from '../errors/ValidationError.js'
import { getWidgetOptionsSchema } from '../schemas/widget-options.js'

export function validateAndSerializeWidgetOptions(
  widgetOptions: unknown,
  columnType: string
): string | undefined {
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
    throw ValidationError.fromZodError(
      result.error,
      `widgetOptions (for column type: ${columnType})`
    )
  }

  // Serialize validated data with circular reference protection
  try {
    return JSON.stringify(result.data)
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('circular')) {
      throw new ValidationError(
        'widgetOptions',
        widgetOptions,
        'Cannot serialize: circular reference detected',
        { columnType }
      )
    }

    throw new ValidationError(
      'widgetOptions',
      widgetOptions,
      `Serialization failed: ${error instanceof Error ? error.message : String(error)}`,
      { columnType }
    )
  }
}

export function isValidWidgetOptions(value: unknown, columnType: string): boolean {
  try {
    validateAndSerializeWidgetOptions(value, columnType)
    return true
  } catch {
    return false
  }
}

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
