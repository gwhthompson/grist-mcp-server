/**
 * Tool utilities module.
 *
 * Provides shared utilities for:
 * - Pagination (consistent pagination across tools)
 * - Next steps (fluent builder for nextSteps hints)
 */

export { NextStepsBuilder, nextSteps } from './next-steps.js'
export {
  getPaginationMeta,
  type PaginatedResult,
  type PaginationMeta,
  type PaginationParams,
  paginate
} from './pagination.js'
