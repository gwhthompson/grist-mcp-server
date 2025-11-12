/**
 * Vitest Setup File
 *
 * Runs before all tests to configure the test environment
 */

import { afterAll, beforeAll } from 'vitest'

// Environment configuration
const GRIST_URL = process.env.GRIST_URL || 'http://localhost:8989'
const GRIST_API_KEY = process.env.GRIST_API_KEY || 'test_api_key'

beforeAll(() => {
  console.log('\n=== Test Environment ===')
  console.log(`Grist URL: ${GRIST_URL}`)
  console.log(`API Key: ${GRIST_API_KEY.substring(0, 8)}...`)
  console.log('========================\n')
})

afterAll(() => {
  console.log('\n=== Test Suite Complete ===\n')
})

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
