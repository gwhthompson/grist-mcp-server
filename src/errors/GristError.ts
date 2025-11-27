export abstract class GristError extends Error {
  public readonly code: string
  public readonly isOperational: boolean = true
  public readonly context?: Record<string, unknown>
  public readonly timestamp: Date = new Date()

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.context = context
    Error.captureStackTrace(this, this.constructor)
  }

  abstract toUserMessage(): string

  abstract isRetryable(): boolean

  /**
   * Returns actionable suggestions for resolving the error.
   * Override in subclasses for context-specific suggestions.
   */
  getSuggestions(): string[] {
    return []
  }

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

export function isGristError(error: unknown): error is GristError {
  return error instanceof GristError
}
