import { ApiError, type HttpMethod } from './ApiError.js'

/**
 * Rate limit error (specialized API error)
 * Provides retry timing information
 */
export class RateLimitError extends ApiError {
  constructor(
    method: HttpMethod,
    path: string,
    public readonly retryAfter?: number,
    context?: Record<string, unknown>
  ) {
    super(429, method, path, 'Rate limit exceeded', { ...context, retryAfter })
  }

  toUserMessage(): string {
    const waitTime = this.retryAfter ?? 60
    return (
      `Rate limit exceeded for ${this.method} ${this.path}\n\n` +
      `The server is limiting your requests.\n\n` +
      `Wait ${waitTime} seconds before retrying this operation.\n\n` +
      `To avoid rate limits:\n` +
      `- Add delays between requests\n` +
      `- Batch operations when possible\n` +
      `- Use pagination with smaller page sizes`
    )
  }

  isRetryable(): boolean {
    return true
  }

  /**
   * Get recommended retry delay in milliseconds
   */
  getRetryDelay(): number {
    return (this.retryAfter ?? 60) * 1000
  }
}
