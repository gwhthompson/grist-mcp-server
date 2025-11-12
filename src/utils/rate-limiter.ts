/**
 * Rate Limiter - Controls request rate to prevent overwhelming the API
 *
 * Implements two rate limiting strategies:
 * 1. Concurrency limiting: Max N concurrent requests
 * 2. Rate limiting: Min time between request starts
 *
 * Uses a queue-based approach for pending requests.
 */

/**
 * Configuration for rate limiter
 */
export interface RateLimiterConfig {
  /** Maximum number of concurrent requests (default: 5) */
  maxConcurrent: number
  /** Minimum time between request starts in milliseconds (default: 200) */
  minTimeBetweenMs: number
}

/**
 * Queued task waiting to execute
 */
interface QueuedTask<T> {
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

/**
 * Simple but effective rate limiter for HTTP requests
 *
 * Features:
 * - Concurrency control (max N parallel requests)
 * - Rate limiting (min time between requests)
 * - Queue-based with FIFO ordering
 * - No external dependencies
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter({
 *   maxConcurrent: 5,
 *   minTimeBetweenMs: 200
 * })
 *
 * // Wraps async function with rate limiting
 * const result = await limiter.schedule(() => fetchData())
 * ```
 */
export class RateLimiter {
  private config: RateLimiterConfig
  private queue: QueuedTask<unknown>[] = []
  private activeCount = 0
  private lastStartTime = 0

  /**
   * Create a new rate limiter
   *
   * @param config - Rate limiter configuration
   */
  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 5,
      minTimeBetweenMs: config.minTimeBetweenMs ?? 200
    }
  }

  /**
   * Schedule a function to run with rate limiting
   *
   * If under concurrent limit and rate limit, executes immediately.
   * Otherwise, queues until resources are available.
   *
   * @template T - Return type of the function
   * @param fn - Async function to execute
   * @returns Promise resolving to function result
   */
  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject } as QueuedTask<unknown>)
      this.processQueue()
    })
  }

  /**
   * Process queued tasks when resources are available
   *
   * @private
   */
  private processQueue(): void {
    // Check if we can process more tasks
    if (this.activeCount >= this.config.maxConcurrent || this.queue.length === 0) {
      return
    }

    // Calculate time since last request start
    const now = Date.now()
    const timeSinceLastStart = now - this.lastStartTime
    const minTime = this.config.minTimeBetweenMs

    if (timeSinceLastStart < minTime && this.lastStartTime !== 0) {
      // Need to wait before starting next request
      const waitTime = minTime - timeSinceLastStart
      setTimeout(() => this.processQueue(), waitTime)
      return
    }

    // Get next task from queue
    const task = this.queue.shift()
    if (!task) {
      return
    }

    // Update state
    this.activeCount++
    this.lastStartTime = Date.now()

    // Execute task
    task
      .fn()
      .then((result) => {
        task.resolve(result)
      })
      .catch((error) => {
        task.reject(error)
      })
      .finally(() => {
        this.activeCount--
        // Process next task in queue
        this.processQueue()
      })

    // Try to process more tasks (if under concurrent limit)
    if (this.activeCount < this.config.maxConcurrent) {
      // Use setImmediate equivalent (setTimeout 0) to avoid deep recursion
      setTimeout(() => this.processQueue(), 0)
    }
  }

  /**
   * Get current queue statistics
   *
   * @returns Queue stats for monitoring
   */
  getStats(): {
    queueLength: number
    activeCount: number
    maxConcurrent: number
  } {
    return {
      queueLength: this.queue.length,
      activeCount: this.activeCount,
      maxConcurrent: this.config.maxConcurrent
    }
  }

  /**
   * Clear all pending tasks from queue
   *
   * Active tasks continue, but queued tasks are rejected.
   * Useful for cleanup or emergency shutdown.
   */
  clearQueue(): void {
    const clearedTasks = this.queue.splice(0)
    for (const task of clearedTasks) {
      task.reject(new Error('Rate limiter queue cleared'))
    }
  }

  /**
   * Wait for all active tasks to complete
   *
   * @returns Promise that resolves when queue is empty and no active tasks
   */
  async waitForIdle(): Promise<void> {
    while (this.activeCount > 0 || this.queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}
