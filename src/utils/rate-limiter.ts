export interface RateLimiterConfig {
  maxConcurrent: number
  minTimeBetweenMs: number
  maxQueueSize: number
}

interface QueuedTask<T> {
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

export class RateLimiter {
  private config: RateLimiterConfig
  private queue: QueuedTask<unknown>[] = []
  private activeCount = 0
  private lastStartTime = 0

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 5,
      minTimeBetweenMs: config.minTimeBetweenMs ?? 200,
      maxQueueSize: config.maxQueueSize ?? 1000
    }
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.queue.length >= this.config.maxQueueSize) {
        reject(
          new Error(
            `Rate limiter queue full (${this.config.maxQueueSize} items). ` +
              `Server may be overloaded. Please retry later.`
          )
        )
        return
      }

      this.queue.push({ fn, resolve, reject } as QueuedTask<unknown>)
      this.processQueue()
    })
  }

  private processQueue(): void {
    if (this.activeCount >= this.config.maxConcurrent || this.queue.length === 0) {
      return
    }

    const now = Date.now()
    const timeSinceLastStart = now - this.lastStartTime
    const minTime = this.config.minTimeBetweenMs

    if (timeSinceLastStart < minTime && this.lastStartTime !== 0) {
      const waitTime = minTime - timeSinceLastStart
      setTimeout(() => this.processQueue(), waitTime)
      return
    }

    const task = this.queue.shift()
    if (!task) {
      return
    }

    this.activeCount++
    this.lastStartTime = Date.now()

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
        this.processQueue()
      })

    if (this.activeCount < this.config.maxConcurrent) {
      setTimeout(() => this.processQueue(), 0)
    }
  }

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

  clearQueue(): void {
    const clearedTasks = this.queue.splice(0)
    for (const task of clearedTasks) {
      task.reject(new Error('Rate limiter queue cleared'))
    }
  }

  async waitForIdle(): Promise<void> {
    while (this.activeCount > 0 || this.queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}
