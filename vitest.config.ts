import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Two clean projects - no overlap
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          exclude: ['node_modules', 'dist'],
          globals: true,
          environment: 'node',
          testTimeout: 5000,
          // No Docker for unit tests
          globalSetup: undefined,
          setupFiles: ['./tests/setup.ts']
        }
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          exclude: ['node_modules', 'dist'],
          globals: true,
          environment: 'node',
          testTimeout: 60000,
          hookTimeout: 60000,
          teardownTimeout: 60000,
          // Docker required for integration tests
          globalSetup: './tests/globalSetup.ts',
          setupFiles: ['./tests/setup.ts']
        }
      }
    ],

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts', 'tests/**/*', 'dist/**/*'],
      clean: false, // Prevent race condition between projects (vitest#4943)
      thresholds: {
        // Coverage target: 90%+ (per CLAUDE.md)
        // Current: ~61%, raising incrementally as tests are added
        // Priority gaps: src/services/declarative-layout/executor.ts, src/tools/*.ts
        lines: 61,
        functions: 65,
        branches: 50,
        statements: 61
      }
    },

    // Reporter
    reporters: ['default'],

    // Suppress noisy logs
    onConsoleLog: (log, type) => {
      if (type === 'stderr' && log.includes('"level":"error"')) return false
      if (log.includes('ZodError:') || log.includes('unionErrors')) return false
      if (log.includes('at file:///') || log.includes('at node:internal')) return false
      return true
    },

    // Retry flaky tests once
    retry: 1,

    // Mocks
    mockReset: true,
    restoreMocks: true,
    clearMocks: true
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests')
    }
  }
})
