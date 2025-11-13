/**
 * Type-safe assertion helpers for tests
 * Provides generic functions that preserve TypeScript type inference
 *
 * Based on javascript-testing-patterns skill and test-architecture-review.md
 */

import { z } from 'zod'
import type { MCPToolResponse } from '../../src/types.js'

/**
 * Generic assertion for Zod schema validation
 * Preserves type inference for downstream usage
 *
 * @param data - Data to validate
 * @param schema - Zod schema to validate against
 * @param context - Optional context for error messages
 *
 * @example
 * const result = await api.fetch('/users')
 * expectValidSchema(result, UserSchema, 'API response')
 * // TypeScript now knows result is User type
 */
export function expectValidSchema<T>(
  data: unknown,
  schema: z.ZodSchema<T>,
  context?: string
): asserts data is T {
  const result = schema.safeParse(data)

  if (!result.success) {
    const message = context
      ? `Schema validation failed for ${context}`
      : 'Schema validation failed'

    console.error(message)
    console.error('Errors:', result.error.format())
    console.error('Received data:', JSON.stringify(data, null, 2))

    throw new Error(`${message}: ${result.error.message}`)
  }
}

/**
 * Assert that value matches Zod schema and return typed value
 * Throws on validation failure
 *
 * @param data - Data to validate
 * @param schema - Zod schema
 * @returns Validated and typed data
 *
 * @example
 * const user = assertValidSchema(response, UserSchema)
 * // user is now typed as User
 */
export function assertValidSchema<T>(data: unknown, schema: z.ZodSchema<T>): T {
  const result = schema.safeParse(data)

  if (!result.success) {
    throw new Error(`Schema validation failed: ${result.error.message}`)
  }

  return result.data
}

/**
 * Type guard for DocId format
 * Validates Base58 encoding (22 chars, excludes 0, O, I, l)
 *
 * @param value - Value to check
 * @returns True if value is valid DocId format
 *
 * @example
 * if (isValidDocIdFormat(id)) {
 *   // TypeScript knows id matches DocId pattern
 * }
 */
export function isValidDocIdFormat(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === 22 &&
    /^[1-9A-HJ-NP-Za-km-z]{22}$/.test(value)
  )
}

/**
 * Type guard for TableId format
 * Validates UPPERCASE start, Python identifier rules
 *
 * @param value - Value to check
 * @returns True if value is valid TableId format
 */
export function isValidTableIdFormat(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z][a-zA-Z0-9_]*$/.test(value)
}

/**
 * Type guard for ColId format
 * Validates Python identifier rules (can start with underscore)
 *
 * @param value - Value to check
 * @returns True if value is valid ColId format
 */
export function isValidColIdFormat(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)
}

/**
 * Assert that MCP response has dual content format
 * Validates both markdown/JSON text AND structured content
 *
 * @param response - MCP tool response to validate
 *
 * @example
 * const result = await tool.execute(params)
 * assertDualContentFormat(result)
 * // Now know result has both content and structuredContent
 */
export function assertDualContentFormat(response: MCPToolResponse): void {
  // Must have content array
  if (!Array.isArray(response.content) || response.content.length === 0) {
    throw new Error('MCP response missing content array')
  }

  // Must have structuredContent
  if (!('structuredContent' in response)) {
    throw new Error('MCP response missing structuredContent (violates MCP protocol)')
  }

  // Content must have text
  const firstContent = response.content[0]
  if (!firstContent || firstContent.type !== 'text' || !firstContent.text) {
    throw new Error('MCP response content must have text')
  }
}

/**
 * Assert that error message is actionable
 * Checks for guidance keywords
 *
 * @param errorMessage - Error message to check
 *
 * @example
 * try {
 *   await operation()
 * } catch (err) {
 *   assertActionableError(err.message)
 * }
 */
export function assertActionableError(errorMessage: string): void {
  const actionablePatterns = [
    /try/i,
    /use/i,
    /check/i,
    /verify/i,
    /ensure/i,
    /suggestion/i,
    /example/i,
    /instead/i,
    /should/i,
    /must/i,
    /cannot/i
  ]

  const hasGuidance = actionablePatterns.some((pattern) => pattern.test(errorMessage))

  if (!hasGuidance) {
    throw new Error(
      `Error message lacks actionable guidance: "${errorMessage}"\n` +
        `Consider including: suggestions, examples, or alternative actions`
    )
  }
}

/**
 * Assert that response is paginated correctly
 * Validates pagination metadata
 *
 * @param data - Response data to check
 *
 * @example
 * const result = await api.getRecords({ limit: 10 })
 * assertPaginatedResponse(result)
 */
export function assertPaginatedResponse(data: unknown): void {
  if (!data || typeof data !== 'object') {
    throw new Error('Paginated response must be an object')
  }

  const obj = data as Record<string, unknown>

  if (!('items' in obj) || !Array.isArray(obj.items)) {
    throw new Error('Paginated response must have items array')
  }

  // Should have at least one pagination indicator
  const hasPagination =
    'has_more' in obj || 'next_offset' in obj || 'total' in obj || 'offset' in obj

  if (!hasPagination) {
    throw new Error('Paginated response missing pagination metadata')
  }
}

/**
 * Expect array to contain items matching schema
 * Validates each item individually
 *
 * @param array - Array to validate
 * @param schema - Schema for each item
 * @param minItems - Minimum expected items (default: 1)
 *
 * @example
 * const users = await api.getUsers()
 * expectArrayOfSchema(users, UserSchema, 1)
 * // All users validated against schema
 */
export function expectArrayOfSchema<T>(
  array: unknown,
  schema: z.ZodSchema<T>,
  minItems: number = 1
): asserts array is T[] {
  if (!Array.isArray(array)) {
    throw new Error(`Expected array, got ${typeof array}`)
  }

  if (array.length < minItems) {
    throw new Error(`Expected at least ${minItems} items, got ${array.length}`)
  }

  // Validate each item
  array.forEach((item, index) => {
    const result = schema.safeParse(item)
    if (!result.success) {
      throw new Error(
        `Item at index ${index} failed validation: ${result.error.message}\n` +
          `Item: ${JSON.stringify(item)}`
      )
    }
  })
}

/**
 * Type-safe null check with error message
 *
 * @param value - Value to check
 * @param message - Error message if null/undefined
 * @returns Value with non-null assertion
 *
 * @example
 * const user = expectDefined(await findUser(id), 'User not found')
 * // TypeScript knows user is not null/undefined
 */
export function expectDefined<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
  return value
}

/**
 * Expect value to be one of allowed values
 * Type-safe enum checking
 *
 * @param value - Value to check
 * @param allowed - Array of allowed values
 * @param context - Context for error message
 *
 * @example
 * expectOneOf(status, ['pending', 'active', 'completed'], 'status')
 */
export function expectOneOf<T>(value: T, allowed: readonly T[], context?: string): void {
  if (!allowed.includes(value)) {
    const prefix = context ? `${context} ` : ''
    throw new Error(
      `${prefix}Expected one of [${allowed.join(', ')}], got: ${JSON.stringify(value)}`
    )
  }
}
