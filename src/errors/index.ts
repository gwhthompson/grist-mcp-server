/**
 * Grist Error Hierarchy
 *
 * Provides structured, recoverable errors with actionable messages for LLMs
 */

import { ApiError } from './ApiError.js'
import {
  DataIntegrityError,
  InvalidChoiceError,
  InvalidReferenceError,
  RowNotFoundError
} from './DataIntegrityError.js'
import { NotFoundError } from './NotFoundError.js'
import { RateLimitError } from './RateLimitError.js'
import { ValidationError } from './ValidationError.js'

export { ApiError, type HttpMethod } from './ApiError.js'
export {
  DataIntegrityError,
  InvalidChoiceError,
  InvalidChoiceListError,
  InvalidReferenceError,
  InvalidRefListError,
  RowNotFoundError
} from './DataIntegrityError.js'
export { GristError, isGristError } from './GristError.js'
export { NotFoundError, type ResourceType } from './NotFoundError.js'
export { RateLimitError } from './RateLimitError.js'
export { ValidationError } from './ValidationError.js'

/**
 * Discriminated union of all Grist errors
 */
export type GristErrorType =
  | NotFoundError
  | ValidationError
  | ApiError
  | RateLimitError
  | DataIntegrityError

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

export function isDataIntegrityError(error: unknown): error is DataIntegrityError {
  return error instanceof DataIntegrityError
}

export function isInvalidReferenceError(error: unknown): error is InvalidReferenceError {
  return error instanceof InvalidReferenceError
}

export function isInvalidChoiceError(error: unknown): error is InvalidChoiceError {
  return error instanceof InvalidChoiceError
}

export function isRowNotFoundError(error: unknown): error is RowNotFoundError {
  return error instanceof RowNotFoundError
}
