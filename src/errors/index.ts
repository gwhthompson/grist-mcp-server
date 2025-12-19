/**
 * Grist Error Hierarchy
 *
 * Provides structured, recoverable errors with actionable messages for LLMs
 */

import type { ApiError } from './ApiError.js'
import type { DataIntegrityError } from './DataIntegrityError.js'
import type { NotFoundError } from './NotFoundError.js'
import type { RateLimitError } from './RateLimitError.js'
import type { ValidationError } from './ValidationError.js'
import type { VerificationError } from './VerificationError.js'

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
export {
  createFailingResult,
  createPassingResult,
  isVerificationError,
  type VerificationCheck,
  VerificationError,
  type VerificationResult
} from './VerificationError.js'

/**
 * Discriminated union of all Grist errors
 */
export type GristErrorType =
  | NotFoundError
  | ValidationError
  | ApiError
  | RateLimitError
  | DataIntegrityError
  | VerificationError
