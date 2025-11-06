import { GristError } from './GristError.js'

/**
 * Input validation error
 * Used when user-provided parameters fail validation
 */
export class ValidationError extends GristError {
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    public readonly constraint: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Validation failed for ${field}: ${constraint}`,
      'VALIDATION_ERROR',
      { ...context, field, value, constraint }
    )
  }

  toUserMessage(): string {
    const valueStr = typeof this.value === 'string'
      ? `"${this.value}"`
      : JSON.stringify(this.value)

    return `Invalid value for parameter '${this.field}'\n\n` +
           `Constraint: ${this.constraint}\n` +
           `Received: ${valueStr}\n\n` +
           `Please check the parameter documentation and provide a valid value.`
  }

  isRetryable(): boolean {
    return false // Validation errors require user correction
  }

  /**
   * Create from Zod error
   */
  static fromZodError(error: any, field: string = 'unknown'): ValidationError {
    const issues = error.issues || []
    const firstIssue = issues[0]

    if (firstIssue) {
      const path = firstIssue.path.join('.')
      return new ValidationError(
        path || field,
        firstIssue.received,
        firstIssue.message,
        { zodIssues: issues }
      )
    }

    return new ValidationError(
      field,
      undefined,
      error.message || 'Validation failed'
    )
  }
}
