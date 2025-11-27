import axios from 'axios'
import { RETRY_CONFIG } from '../../constants.js'
import { isGristError } from '../../errors/index.js'
import { log } from '../../utils/shared-logger.js'

export interface RetryConfig {
  readonly maxRetries: number
  readonly baseDelayMs: number
  readonly maxDelayMs: number
  readonly retryableStatuses: readonly number[]
}

export interface RetryService {
  execute<T>(fn: () => Promise<T>, context: string): Promise<T>
}

export class ExponentialBackoffRetryService implements RetryService {
  constructor(private readonly config: RetryConfig = RETRY_CONFIG) {}

  async execute<T>(fn: () => Promise<T>, context: string): Promise<T> {
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        if (attempt === this.config.maxRetries) {
          throw error
        }

        if (!this.isRetryable(error)) {
          throw error
        }

        const delay = this.calculateDelay(attempt)

        log.debug('Retry attempt', {
          context,
          attempt: attempt + 1,
          maxRetries: this.config.maxRetries,
          delayMs: delay
        })

        await this.sleep(delay)
      }
    }

    throw new Error(`Retry failed for ${context}`)
  }

  private isRetryable(error: unknown): boolean {
    if (isGristError(error)) {
      return error.isRetryable()
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      return status !== undefined && this.config.retryableStatuses.includes(status)
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('enotfound')
      )
    }

    return false
  }

  private calculateDelay(attempt: number): number {
    const exponential = this.config.baseDelayMs * 2 ** attempt
    const jitter = Math.random() * 0.3 * exponential
    const delay = exponential + jitter
    return Math.min(delay, this.config.maxDelayMs)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
