import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Environment
    globals: true,
    environment: 'node',

    // Test execution
    testTimeout: 30000, // 30 seconds for API tests (unit tests override to 5s)
    hookTimeout: 30000, // 30 seconds for hooks (cleanup can be slow in Docker)
    teardownTimeout: 30000, // 30 seconds for teardown

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.ts',
        'src/index.refactored.ts',
        'tests/**/*',
        'dist/**/*'
      ],
      all: true,
      clean: true,
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80
      }
    },

    // Test file patterns
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    exclude: [
      'node_modules',
      'dist',
      'tests/exploratory/**/*', // Exploratory test files (moved from root)
      'tests/test-*.ts', // Old test files (if any remain)
      'tests/explore-*.ts' // Exploration files
    ],

    // Reporter configuration - Clean output
    reporters: ['default'],
    silent: false, // Show test names, but suppress stdout/stderr

    // Suppress console output during tests (except failures)
    onConsoleLog: (log, type) => {
      // Suppress stderr logs from GristClient during negative tests
      if (type === 'stderr' && log.includes('"level":"error"')) {
        return false
      }
      // Suppress verbose Zod error dumps
      if (log.includes('ZodError:') || log.includes('unionErrors')) {
        return false
      }
      // Suppress stack traces in logs
      if (log.includes('at file:///') || log.includes('at node:internal')) {
        return false
      }
      return true // Allow other console output
    },

    // Parallel execution
    poolOptions: {
      threads: {
        singleThread: false,
        useAtomics: true
      }
    },

    // Setup files
    setupFiles: ['./tests/setup.ts'],

    // Global setup - runs once before all tests (handles Docker container)
    globalSetup: ['./tests/globalSetup.ts'],

    // Retry configuration
    retry: 1, // Retry failed tests once (for flaky API calls)

    // Mock configuration
    mockReset: true,
    restoreMocks: true,
    clearMocks: true
  },

  // Module resolution
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests')
    }
  }
})
