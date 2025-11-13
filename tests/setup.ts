/**
 * Vitest Setup File
 *
 * Runs before all tests to configure the test environment
 * Suppresses verbose logging for clean test output
 */

import { afterAll, beforeAll, vi } from 'vitest'
import { log } from '../src/utils/logger.js'

// Environment configuration
const GRIST_URL = process.env.GRIST_URL || 'http://localhost:8989'
const GRIST_API_KEY = process.env.GRIST_API_KEY || 'test_api_key'

beforeAll(() => {
  // Mock logger to suppress error logs during tests (especially negative tests)
  // Pattern from javascript-testing-patterns skill
  // This prevents GristClient error logs from cluttering test output
  vi.spyOn(log, 'error').mockImplementation(() => {})
  vi.spyOn(log, 'warn').mockImplementation(() => {})
})

afterAll(() => {
  // Cleanup handled by Vitest - no manual logging needed
})

// Global error handler for unhandled promises
// Suppressed during tests - Vitest handles promise rejections
process.on('unhandledRejection', () => {
  // Vitest will report unhandled rejections as test failures
})
