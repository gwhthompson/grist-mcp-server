import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Environment
    globals: true,
    environment: 'node',

    // Test execution
    testTimeout: 30000, // 30 seconds for API tests
    hookTimeout: 10000,
    teardownTimeout: 10000,

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
      'tests/test-*.ts', // Old test files
      'tests/explore-*.ts' // Exploration files
    ],

    // Reporter configuration
    reporters: ['verbose'],

    // Parallel execution
    poolOptions: {
      threads: {
        singleThread: false,
        useAtomics: true
      }
    },

    // Setup files
    setupFiles: ['./tests/setup.ts'],

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
