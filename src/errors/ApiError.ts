import { GristError } from './GristError.js'

/**
 * HTTP methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * API error (4xx, 5xx responses from Grist server)
 * Provides context-aware error messages based on status code
 */
export class ApiError extends GristError {
  constructor(
    public readonly statusCode: number,
    public readonly method: HttpMethod,
    public readonly path: string,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message, `API_ERROR_${statusCode}`, { ...context, statusCode, method, path })
  }

  toUserMessage(): string {
    const baseUrl = this.context?.baseUrl as string | undefined

    switch (this.statusCode) {
      case 400:
        return (
          `Bad request to ${this.method} ${this.path}\n\n` +
          `The request was malformed or contained invalid parameters.\n` +
          `Error: ${this.message}\n\n` +
          `Please check your input parameters and try again.`
        )

      case 401:
        return (
          `Authentication failed for ${this.method} ${this.path}\n\n` +
          `Your API key is invalid, expired, or missing.\n\n` +
          `Next steps:\n` +
          `1. Check that GRIST_API_KEY environment variable is set\n` +
          `2. Verify the API key is valid and not expired\n` +
          `3. Get a new API key from: ${baseUrl || 'your Grist instance'}/settings/keys`
        )

      case 403:
        return (
          `Permission denied for ${this.method} ${this.path}\n\n` +
          `Your API key lacks the required permissions for this operation.\n\n` +
          `Possible causes:\n` +
          `- API key doesn't have write permissions (for POST/PUT/DELETE)\n` +
          `- No access to the requested resource\n` +
          `- Resource belongs to a different organization\n\n` +
          `Try listing accessible documents first with grist_get_documents.`
        )

      case 404:
        return (
          `Resource not found: ${this.method} ${this.path}\n\n` +
          `The requested endpoint or resource doesn't exist.\n\n` +
          `This may indicate:\n` +
          `- Invalid resource ID\n` +
          `- Resource was deleted\n` +
          `- Incorrect API path\n\n` +
          `Use discovery tools to find available resources.`
        )

      case 429:
        return (
          `Rate limit exceeded for ${this.method} ${this.path}\n\n` +
          `The Grist server is limiting your requests.\n\n` +
          `Next steps:\n` +
          `1. Wait 60 seconds before retrying\n` +
          `2. Reduce request frequency\n` +
          `3. Consider batching operations if possible`
        )

      case 500:
      case 502:
      case 503:
      case 504:
        return (
          `Grist server error (${this.statusCode})\n\n` +
          `The server encountered an internal error: ${this.message}\n\n` +
          `This is a temporary server issue. Try again in a few moments.\n` +
          `If the problem persists, contact the Grist instance administrator.`
        )

      default:
        return (
          `Request failed: ${this.method} ${this.path}\n\n` +
          `Status: ${this.statusCode}\n` +
          `Error: ${this.message}\n\n` +
          `Please check your request and try again.`
        )
    }
  }

  isRetryable(): boolean {
    // Retry on rate limits and server errors
    return [429, 502, 503, 504].includes(this.statusCode)
  }

  /**
   * Check if error is client error (4xx)
   */
  isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500
  }

  /**
   * Check if error is server error (5xx)
   */
  isServerError(): boolean {
    return this.statusCode >= 500 && this.statusCode < 600
  }
}
