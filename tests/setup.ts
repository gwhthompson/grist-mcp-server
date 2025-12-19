/**
 * Vitest Setup File
 *
 * Runs before each test file to configure the test environment.
 * - Injects API key and base URL from globalSetup via Vitest's provide/inject
 * - Suppresses verbose logging for clean test output
 * - Registers custom matchers for domain-specific assertions
 */

import { afterAll, beforeAll, inject, vi } from 'vitest'
import { log } from '../src/utils/shared-logger.js'

// Register custom matchers
import './helpers/custom-matchers.js'

// Inject values provided by globalSetup
const apiKey = inject('GRIST_API_KEY')
const baseUrl = inject('GRIST_BASE_URL')

// Set environment variables for tests
if (apiKey) {
  process.env.GRIST_API_KEY = apiKey
}
if (baseUrl) {
  process.env.GRIST_URL = baseUrl
}

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
