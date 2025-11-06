/**
 * Grist Error Hierarchy
 *
 * Provides structured, recoverable errors with actionable messages for LLMs
 */

import { GristError } from './GristError.js'
import { NotFoundError } from './NotFoundError.js'
import { ValidationError } from './ValidationError.js'
import { ApiError } from './ApiError.js'
import { RateLimitError } from './RateLimitError.js'

export { GristError, isGristError } from './GristError.js'
export { NotFoundError, type ResourceType } from './NotFoundError.js'
export { ValidationError } from './ValidationError.js'
export { ApiError, type HttpMethod } from './ApiError.js'
export { RateLimitError } from './RateLimitError.js'

/**
 * Discriminated union of all Grist errors
 */
export type GristErrorType =
  | NotFoundError
  | ValidationError
  | ApiError
  | RateLimitError

/**
 * Type guards for specific error types
 */
export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError
}
