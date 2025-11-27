import type { ApplyResponse } from '../types.js'

export class ApplyResponseValidationError extends Error {
  constructor(
    message: string,
    public readonly context?: string
  ) {
    super(message)
    this.name = 'ApplyResponseValidationError'
  }
}

/**
 * Validates Grist API response contains expected retValues array.
 * @throws {ApplyResponseValidationError} if retValues missing, wrong count, or contains error objects
 */
export function validateRetValues(
  response: ApplyResponse,
  options?: { expectedCount?: number; context?: string }
): unknown[] {
  const { expectedCount, context } = options ?? {}
  const contextSuffix = context ? ` Context: ${context}.` : ''

  if (!Array.isArray(response.retValues) || response.retValues.length === 0) {
    throw new ApplyResponseValidationError(
      `Grist API returned invalid response - missing retValues array.${contextSuffix}`,
      context
    )
  }

  // Check for error objects in retValues (silent failures from Grist API)
  for (let i = 0; i < response.retValues.length; i++) {
    const retVal = response.retValues[i]
    if (retVal && typeof retVal === 'object' && !Array.isArray(retVal)) {
      const obj = retVal as Record<string, unknown>
      if ('error' in obj) {
        throw new ApplyResponseValidationError(
          `Grist API action ${i + 1} failed: ${obj.error}.${contextSuffix}`,
          context
        )
      }
    }
  }

  if (expectedCount !== undefined && response.retValues.length !== expectedCount) {
    throw new ApplyResponseValidationError(
      `Grist API returned ${response.retValues.length} retValues but expected ${expectedCount}.${contextSuffix}`,
      context
    )
  }

  return response.retValues
}

/**
 * Extracts first return value from API response with validation.
 * @throws {ApplyResponseValidationError} if response is invalid
 */
export function extractFirstRetValue<T>(response: ApplyResponse, context?: string): T {
  const retValues = validateRetValues(response, { context })
  return retValues[0] as T
}
