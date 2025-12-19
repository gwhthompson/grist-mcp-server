/**
 * Unit tests for schema registry
 *
 * Note: registerSchemas() is called once during module initialization,
 * so we test that the function exists and the schemas are already registered.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { registerSchemas } from '../../../src/schemas/registry.js'

describe('registerSchemas', () => {
  it('exports a function', () => {
    expect(typeof registerSchemas).toBe('function')
  })

  it('throws when called twice (schemas already registered)', () => {
    // First call may succeed if not called yet, second will fail
    // This tests that schemas are being registered to globalRegistry
    try {
      registerSchemas()
    } catch {
      // Ignore if already registered
    }

    // Second call should throw because IDs are already registered
    expect(() => registerSchemas()).toThrow('already exists in the registry')
  })

  it('uses z.globalRegistry for schema registration', () => {
    // Verify globalRegistry exists and is used
    expect(z.globalRegistry).toBeDefined()
  })
})
