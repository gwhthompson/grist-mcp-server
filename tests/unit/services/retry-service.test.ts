import { describe, expect, it, vi } from 'vitest'
import {
  ExponentialBackoffRetryService,
  type RetryConfig
} from '../../../src/services/retry/RetryService.js'

const fastConfig: RetryConfig = {
  maxRetries: 2,
  baseDelayMs: 1,
  maxDelayMs: 10,
  retryableStatuses: [429, 503]
}

describe('ExponentialBackoffRetryService', () => {
  describe('successful execution', () => {
    it('returns result on first success', async () => {
      const service = new ExponentialBackoffRetryService(fastConfig)
      const result = await service.execute(() => Promise.resolve('success'), 'test')
      expect(result).toBe('success')
    })

    it('calls function only once on success', async () => {
      const service = new ExponentialBackoffRetryService(fastConfig)
      const fn = vi.fn().mockResolvedValue('success')
      await service.execute(fn, 'test')
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })

  describe('retry behavior', () => {
    it('retries on network error', async () => {
      const service = new ExponentialBackoffRetryService(fastConfig)
      let attempts = 0
      const result = await service.execute(async () => {
        attempts++
        if (attempts < 2) throw new Error('network timeout')
        return 'success'
      }, 'test')
      expect(result).toBe('success')
      expect(attempts).toBe(2)
    })

    it('retries on timeout error', async () => {
      const service = new ExponentialBackoffRetryService(fastConfig)
      let attempts = 0
      const result = await service.execute(async () => {
        attempts++
        if (attempts < 2) throw new Error('ECONNRESET')
        return 'success'
      }, 'test')
      expect(result).toBe('success')
      expect(attempts).toBe(2)
    })

    it('throws after max retries exceeded', async () => {
      const service = new ExponentialBackoffRetryService(fastConfig)
      let attempts = 0
      await expect(
        service.execute(async () => {
          attempts++
          throw new Error('network timeout')
        }, 'test')
      ).rejects.toThrow('network timeout')
      expect(attempts).toBe(3) // initial + 2 retries
    })
  })

  describe('non-retryable errors', () => {
    it('does not retry validation errors', async () => {
      const service = new ExponentialBackoffRetryService(fastConfig)
      let attempts = 0
      await expect(
        service.execute(async () => {
          attempts++
          throw new Error('validation failed')
        }, 'test')
      ).rejects.toThrow('validation failed')
      expect(attempts).toBe(1)
    })

    it('does not retry generic errors', async () => {
      const service = new ExponentialBackoffRetryService(fastConfig)
      let attempts = 0
      await expect(
        service.execute(async () => {
          attempts++
          throw new Error('something went wrong')
        }, 'test')
      ).rejects.toThrow('something went wrong')
      expect(attempts).toBe(1)
    })
  })

  describe('delay calculation', () => {
    it('delays increase with attempts', async () => {
      const config: RetryConfig = {
        maxRetries: 3,
        baseDelayMs: 10,
        maxDelayMs: 1000,
        retryableStatuses: [429]
      }
      const service = new ExponentialBackoffRetryService(config)

      const delays: number[] = []
      const originalSetTimeout = globalThis.setTimeout
      vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, delay) => {
        delays.push(delay as number)
        return originalSetTimeout(fn, 1) // Execute immediately for test speed
      })

      await expect(
        service.execute(async () => {
          throw new Error('network error')
        }, 'test')
      ).rejects.toThrow()

      vi.restoreAllMocks()

      // Verify exponential growth pattern (with jitter, delays should roughly double)
      expect(delays.length).toBe(3)
      const [first, second, third] = delays
      expect(first).toBeLessThan(second ?? Infinity)
      expect(second).toBeLessThan(third ?? Infinity)
    })
  })

  describe('config defaults', () => {
    it('uses RETRY_CONFIG when no config provided', async () => {
      const service = new ExponentialBackoffRetryService()
      const result = await service.execute(() => Promise.resolve('success'), 'test')
      expect(result).toBe('success')
    })
  })
})
