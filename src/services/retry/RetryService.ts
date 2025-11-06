/**
 * Retry Service
 *
 * Abstraction for retry logic with exponential backoff
 * Follows Single Responsibility Principle
 */

import { isGristError } from '../../errors/index.js'
import { RETRY_CONFIG } from '../../constants.js'
import axios from 'axios'

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  retryableStatuses: number[]
}

/**
 * Retry service interface
 */
export interface RetryService {
  /**
   * Execute function with retry logic
   *
   * @param fn - Function to execute
   * @param context - Context for logging (e.g., "GET /docs")
   * @returns Result of function
   */
  execute<T>(fn: () => Promise<T>, context: string): Promise<T>
}

/**
 * Exponential backoff retry service implementation
 */
export class ExponentialBackoffRetryService implements RetryService {
  constructor(
    private readonly config: RetryConfig = RETRY_CONFIG as any
  ) {}

  async execute<T>(fn: () => Promise<T>, context: string): Promise<T> {
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        // Don't retry if this is the last attempt
        if (attempt === this.config.maxRetries) {
          throw error
        }

        // Check if error is retryable
        if (!this.isRetryable(error)) {
          throw error
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt)

        // Log retry attempt (stderr for visibility)
        console.error(
          `[RETRY] Attempt ${attempt + 1}/${this.config.maxRetries} failed for ${context}, ` +
          `retrying in ${delay}ms...`
        )

        await this.sleep(delay)
      }
    }

    throw new Error(`Retry failed for ${context}`)
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: unknown): boolean {
    // Check if it's a Grist error with retry flag
    if (isGristError(error)) {
      return error.isRetryable()
    }

    // Check if it's an Axios error with retryable status
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      return status !== undefined && this.config.retryableStatuses.includes(status)
    }

    // Network errors are retryable
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      return message.includes('network') ||
             message.includes('timeout') ||
             message.includes('econnreset') ||
             message.includes('enotfound')
    }

    return false
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    const exponential = this.config.baseDelayMs * Math.pow(2, attempt)
    const jitter = Math.random() * 0.3 * exponential  // Up to 30% jitter
    const delay = exponential + jitter
    return Math.min(delay, this.config.maxDelayMs)
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
