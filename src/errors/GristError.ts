/**
 * Base error class for all Grist-related errors
 * Provides structured error information for better debugging and recovery
 */
export abstract class GristError extends Error {
  public readonly code: string
  public readonly isOperational: boolean = true // vs programming error
  public readonly context?: Record<string, unknown>
  public readonly timestamp: Date = new Date()

  constructor(
    message: string,
    code: string,
    context?: Record<string, unknown>
  ) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.context = context
    Error.captureStackTrace(this, this.constructor)
  }

  /**
   * Convert to user-friendly message for LLMs
   * Provides actionable guidance for recovery
   */
  abstract toUserMessage(): string

  /**
   * Check if error is retryable
   * Used by retry logic to determine if operation should be retried
   */
  abstract isRetryable(): boolean

  /**
   * Serialize for logging and debugging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      isOperational: this.isOperational
    }
  }
}

/**
 * Type guard for GristError
 */
export function isGristError(error: unknown): error is GristError {
  return error instanceof GristError
}
