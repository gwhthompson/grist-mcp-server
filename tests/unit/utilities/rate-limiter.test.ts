/**
 * Unit Tests for RateLimiter
 *
 * Tests the rate limiting functionality including:
 * - Concurrency control
 * - Rate limiting (min time between requests)
 * - Queue management
 * - Error handling
 */

import { describe, expect, it } from 'vitest'
import { RateLimiter } from '../../../src/utils/rate-limiter.js'

describe('RateLimiter', () => {
  describe('Construction and Configuration', () => {
    it('should create with default configuration', () => {
      const limiter = new RateLimiter()
      const stats = limiter.getStats()

      expect(stats.maxConcurrent).toBe(5)
      expect(stats.activeCount).toBe(0)
      expect(stats.queueLength).toBe(0)
    })

    it('should create with custom configuration', () => {
      const limiter = new RateLimiter({
        maxConcurrent: 10,
        minTimeBetweenMs: 100
      })
      const stats = limiter.getStats()

      expect(stats.maxConcurrent).toBe(10)
    })

    it('should create with partial configuration', () => {
      const limiter = new RateLimiter({ maxConcurrent: 3 })
      const stats = limiter.getStats()

      expect(stats.maxConcurrent).toBe(3)
    })
  })

  describe('Concurrency Control', () => {
    it('should respect maxConcurrent limit', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 2,
        minTimeBetweenMs: 0 // Disable rate limiting for this test
      })

      let concurrent = 0
      let maxObserved = 0

      const task = async () => {
        concurrent++
        maxObserved = Math.max(maxObserved, concurrent)
        await new Promise((resolve) => setTimeout(resolve, 50))
        concurrent--
      }

      // Schedule 5 tasks
      const promises = Array.from({ length: 5 }, () => limiter.schedule(task))
      await Promise.all(promises)

      // Should never exceed maxConcurrent of 2
      expect(maxObserved).toBe(2)
    })

    it('should execute single task immediately', async () => {
      const limiter = new RateLimiter()
      const startTime = Date.now()

      await limiter.schedule(async () => {
        // Task completes quickly
      })

      const elapsed = Date.now() - startTime
      expect(elapsed).toBeLessThan(100) // Should be nearly instant
    })

    it('should queue tasks when at max concurrency', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 1,
        minTimeBetweenMs: 0
      })

      const executionOrder: number[] = []

      // First task runs immediately but takes time
      const promise1 = limiter.schedule(async () => {
        executionOrder.push(1)
        await new Promise((resolve) => setTimeout(resolve, 100))
      })

      // Second task should be queued
      const promise2 = limiter.schedule(async () => {
        executionOrder.push(2)
      })

      await Promise.all([promise1, promise2])

      expect(executionOrder).toEqual([1, 2])
    })
  })

  describe('Rate Limiting (minTimeBetweenMs)', () => {
    it('should enforce minimum time between request starts', async () => {
      const minTime = 100
      const limiter = new RateLimiter({
        maxConcurrent: 10, // High enough to not interfere
        minTimeBetweenMs: minTime
      })

      const startTimes: number[] = []

      const task = async () => {
        startTimes.push(Date.now())
      }

      // Schedule 3 tasks
      await Promise.all([limiter.schedule(task), limiter.schedule(task), limiter.schedule(task)])

      // Check time between starts
      for (let i = 1; i < startTimes.length; i++) {
        const timeDiff = startTimes[i] - startTimes[i - 1]
        // Allow small tolerance for timing
        expect(timeDiff).toBeGreaterThanOrEqual(minTime - 10)
      }
    })

    it('should work with minTimeBetweenMs = 0 (disabled)', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 5,
        minTimeBetweenMs: 0
      })

      const startTime = Date.now()

      // All should start nearly simultaneously
      await Promise.all([
        limiter.schedule(async () => {}),
        limiter.schedule(async () => {}),
        limiter.schedule(async () => {})
      ])

      const elapsed = Date.now() - startTime
      expect(elapsed).toBeLessThan(50) // Very fast
    })
  })

  describe('Queue Management', () => {
    it('should process queue in FIFO order', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 1,
        minTimeBetweenMs: 0
      })

      const executionOrder: number[] = []

      // Block with first slow task
      const promise1 = limiter.schedule(async () => {
        executionOrder.push(1)
        await new Promise((resolve) => setTimeout(resolve, 100))
      })

      // Queue remaining tasks
      const promise2 = limiter.schedule(async () => executionOrder.push(2))
      const promise3 = limiter.schedule(async () => executionOrder.push(3))
      const promise4 = limiter.schedule(async () => executionOrder.push(4))

      await Promise.all([promise1, promise2, promise3, promise4])

      expect(executionOrder).toEqual([1, 2, 3, 4])
    })

    it('should provide accurate queue stats', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 1,
        minTimeBetweenMs: 0
      })

      // Block with first task
      const promise1 = limiter.schedule(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
      })

      // Queue more tasks
      const promise2 = limiter.schedule(async () => {})
      const promise3 = limiter.schedule(async () => {})

      // Check stats while tasks are queued
      await new Promise((resolve) => setTimeout(resolve, 50))
      const stats = limiter.getStats()

      expect(stats.activeCount).toBe(1)
      expect(stats.queueLength).toBe(2)
      expect(stats.maxConcurrent).toBe(1)

      await Promise.all([promise1, promise2, promise3])

      // Wait for all processing to complete (including finally callbacks)
      await limiter.waitForIdle()

      // After completion
      const finalStats = limiter.getStats()
      expect(finalStats.activeCount).toBe(0)
      expect(finalStats.queueLength).toBe(0)
    })

    it('should clear queue and reject pending tasks', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 1,
        minTimeBetweenMs: 0
      })

      // Block with first task
      const promise1 = limiter.schedule(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
      })

      // Queue tasks that will be cleared
      const promise2 = limiter.schedule(async () => 'task2')
      const promise3 = limiter.schedule(async () => 'task3')

      // Clear queue while first task is still running
      await new Promise((resolve) => setTimeout(resolve, 50))
      limiter.clearQueue()

      // First task should complete
      await expect(promise1).resolves.toBeUndefined()

      // Queued tasks should be rejected
      await expect(promise2).rejects.toThrow('Rate limiter queue cleared')
      await expect(promise3).rejects.toThrow('Rate limiter queue cleared')
    })
  })

  describe('Error Handling', () => {
    it('should propagate errors from tasks', async () => {
      const limiter = new RateLimiter()

      const error = new Error('Task failed')
      await expect(
        limiter.schedule(async () => {
          throw error
        })
      ).rejects.toThrow('Task failed')
    })

    it('should continue processing queue after task failure', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 1,
        minTimeBetweenMs: 0
      })

      const executionOrder: string[] = []

      const promise1 = limiter.schedule(async () => {
        executionOrder.push('task1')
        throw new Error('Task 1 failed')
      })

      const promise2 = limiter.schedule(async () => {
        executionOrder.push('task2')
        return 'success'
      })

      await expect(promise1).rejects.toThrow('Task 1 failed')
      await expect(promise2).resolves.toBe('success')

      expect(executionOrder).toEqual(['task1', 'task2'])
    })

    it('should handle multiple concurrent failures', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 3,
        minTimeBetweenMs: 0
      })

      const promises = [
        limiter.schedule(async () => {
          throw new Error('Error 1')
        }),
        limiter.schedule(async () => {
          throw new Error('Error 2')
        }),
        limiter.schedule(async () => {
          throw new Error('Error 3')
        })
      ]

      const results = await Promise.allSettled(promises)

      expect(results[0].status).toBe('rejected')
      expect(results[1].status).toBe('rejected')
      expect(results[2].status).toBe('rejected')
    })
  })

  describe('Return Values', () => {
    it('should return task result', async () => {
      const limiter = new RateLimiter()

      const result = await limiter.schedule(async () => 'test-result')
      expect(result).toBe('test-result')
    })

    it('should return correct results for multiple tasks', async () => {
      const limiter = new RateLimiter()

      const results = await Promise.all([
        limiter.schedule(async () => 1),
        limiter.schedule(async () => 2),
        limiter.schedule(async () => 3)
      ])

      expect(results).toEqual([1, 2, 3])
    })

    it('should handle complex return types', async () => {
      const limiter = new RateLimiter()

      interface ComplexResult {
        id: number
        data: string[]
      }

      const result = await limiter.schedule<ComplexResult>(async () => ({
        id: 42,
        data: ['a', 'b', 'c']
      }))

      expect(result.id).toBe(42)
      expect(result.data).toEqual(['a', 'b', 'c'])
    })
  })

  describe('waitForIdle', () => {
    it('should resolve when no tasks are active or queued', async () => {
      const limiter = new RateLimiter()

      // Already idle
      await expect(limiter.waitForIdle()).resolves.toBeUndefined()
    })

    it('should wait for active tasks to complete', async () => {
      const limiter = new RateLimiter()

      let taskCompleted = false

      // Start a task
      const promise = limiter.schedule(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        taskCompleted = true
      })

      // Wait for idle
      await limiter.waitForIdle()

      expect(taskCompleted).toBe(true)
      await promise // Cleanup
    })

    it('should wait for queued tasks to complete', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 1,
        minTimeBetweenMs: 0
      })

      const executionOrder: number[] = []

      // Start multiple tasks
      limiter.schedule(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        executionOrder.push(1)
      })
      limiter.schedule(async () => {
        executionOrder.push(2)
      })
      limiter.schedule(async () => {
        executionOrder.push(3)
      })

      // Wait for all to complete
      await limiter.waitForIdle()

      expect(executionOrder).toEqual([1, 2, 3])
      const stats = limiter.getStats()
      expect(stats.activeCount).toBe(0)
      expect(stats.queueLength).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero maxConcurrent (invalid but should not crash)', () => {
      const limiter = new RateLimiter({ maxConcurrent: 0 })
      const stats = limiter.getStats()
      expect(stats.maxConcurrent).toBe(0)
      // Tasks will queue indefinitely, but shouldn't crash
    })

    it('should handle very high concurrency', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 1000,
        minTimeBetweenMs: 0
      })

      const tasks = Array.from({ length: 100 }, (_, i) => limiter.schedule(async () => i))

      const results = await Promise.all(tasks)
      expect(results).toHaveLength(100)
    })

    it('should handle tasks that complete instantly', async () => {
      const limiter = new RateLimiter()

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => limiter.schedule(async () => i))
      )

      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    })

    it('should handle tasks with varying durations', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 2,
        minTimeBetweenMs: 0
      })

      const durations = [100, 50, 150, 25, 75]
      const results = await Promise.all(
        durations.map((duration, i) =>
          limiter.schedule(async () => {
            await new Promise((resolve) => setTimeout(resolve, duration))
            return i
          })
        )
      )

      expect(results).toEqual([0, 1, 2, 3, 4])
    })
  })

  describe('Performance', () => {
    it('should handle many tasks efficiently', async () => {
      const limiter = new RateLimiter({
        maxConcurrent: 10,
        minTimeBetweenMs: 0
      })

      const startTime = Date.now()
      const count = 1000

      await Promise.all(Array.from({ length: count }, () => limiter.schedule(async () => {})))

      const elapsed = Date.now() - startTime
      // Should complete 1000 no-op tasks in reasonable time
      expect(elapsed).toBeLessThan(2000)
    })
  })
})
