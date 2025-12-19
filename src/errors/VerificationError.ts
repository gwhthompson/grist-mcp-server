import { GristError } from './GristError.js'

/**
 * Result of a single verification check
 */
export interface VerificationCheck {
  /** Description of what was checked */
  description: string
  /** Whether the check passed */
  passed: boolean
  /** Expected value (if applicable) */
  expected?: unknown
  /** Actual value found (if applicable) */
  actual?: unknown
  /** Field that was checked (if applicable) */
  field?: string
}

/**
 * Full verification result
 */
export interface VerificationResult {
  /** Whether all checks passed */
  passed: boolean
  /** Individual check results */
  checks: VerificationCheck[]
  /** Time taken to verify in milliseconds */
  duration?: number
  /** Error message if verification failed at a high level */
  error?: string
}

/**
 * Error thrown when a write operation succeeds but verification fails.
 *
 * This indicates a discrepancy between what was written and what was read back.
 * Could indicate:
 * - Silent failure in Grist
 * - ACL rules blocking the write
 * - Eventual consistency issues
 * - Formula columns overwriting values
 */
export class VerificationError extends GristError {
  public readonly result: VerificationResult
  public readonly operation?: string
  public readonly entityType?: string
  public readonly entityId?: string | number

  constructor(
    result: VerificationResult,
    context?: {
      operation?: string
      entityType?: string
      entityId?: string | number
    }
  ) {
    const failedChecks = result.checks.filter((c) => !c.passed)
    const message = result.error || `Verification failed: ${failedChecks.length} check(s) failed`

    super(message, 'VERIFICATION_FAILED', {
      result,
      ...context
    })

    this.result = result
    this.operation = context?.operation
    this.entityType = context?.entityType
    this.entityId = context?.entityId
  }

  toUserMessage(): string {
    const failedChecks = this.result.checks.filter((c) => !c.passed)

    if (failedChecks.length === 0 && this.result.error) {
      return this.result.error
    }

    const details = failedChecks
      .slice(0, 3) // Show max 3 failures
      .map((c) => {
        if (c.expected !== undefined && c.actual !== undefined) {
          return `- ${c.description}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)}`
        }
        return `- ${c.description}`
      })
      .join('\n')

    const more = failedChecks.length > 3 ? `\n... and ${failedChecks.length - 3} more` : ''

    return `Write operation succeeded but verification failed:\n${details}${more}`
  }

  isRetryable(): boolean {
    // Verification failures might be transient (eventual consistency)
    // but generally indicate a real problem
    return false
  }

  getSuggestions(): string[] {
    return [
      'Check if ACL rules are blocking the write',
      'Verify the column is not a formula column',
      'Check if another user/process modified the data',
      'Retry the operation to rule out transient issues'
    ]
  }

  /**
   * Get failed checks only
   */
  getFailedChecks(): VerificationCheck[] {
    return this.result.checks.filter((c) => !c.passed)
  }

  /**
   * Check if a specific field failed verification
   */
  hasFieldFailure(fieldName: string): boolean {
    return this.result.checks.some((c) => !c.passed && c.field === fieldName)
  }
}

export function isVerificationError(error: unknown): error is VerificationError {
  return error instanceof VerificationError
}

/**
 * Create a passing verification result
 */
export function createPassingResult(
  checks: VerificationCheck[],
  duration?: number
): VerificationResult {
  return {
    passed: true,
    checks,
    duration
  }
}

/**
 * Create a failing verification result
 */
export function createFailingResult(
  checks: VerificationCheck[],
  error?: string,
  duration?: number
): VerificationResult {
  return {
    passed: false,
    checks,
    error,
    duration
  }
}
