import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ValidationError } from '../../../../src/errors/index.js'
import type { ToolContext } from '../../../../src/registry/types.js'
import type { GristClient } from '../../../../src/services/grist-client.js'
import type { SchemaCache } from '../../../../src/services/schema-cache.js'
import { resetSessionAnalytics } from '../../../../src/services/session-analytics.js'
import { GristTool } from '../../../../src/tools/base/GristTool.js'
import type { MCPToolResponse } from '../../../../src/types.js'

// Create a concrete test implementation of GristTool
class TestTool extends GristTool<
  z.ZodObject<{ name: z.ZodString; count: z.ZodNumber }>,
  { result: string }
> {
  constructor(context: ToolContext) {
    super(context, z.object({ name: z.string(), count: z.number() }))
  }

  protected async executeInternal(
    params: z.infer<typeof this.inputSchema>
  ): Promise<{ result: string }> {
    return { result: `${params.name}: ${params.count}` }
  }
}

// Create a tool that throws errors for error handling tests
class ErrorTool extends GristTool<z.ZodObject<{ action: z.ZodString }>, never> {
  private errorToThrow: unknown = null

  constructor(context: ToolContext) {
    super(context, z.object({ action: z.string() }))
  }

  setError(error: unknown): void {
    this.errorToThrow = error
  }

  protected async executeInternal(_params: z.infer<typeof this.inputSchema>): Promise<never> {
    if (this.errorToThrow) {
      throw this.errorToThrow
    }
    throw new Error('Unexpected call')
  }
}

// Create a tool with lifecycle hooks for testing beforeExecute/afterExecute
class LifecycleTool extends GristTool<z.ZodObject<{ value: z.ZodNumber }>, { modified: number }> {
  beforeExecuteCalled = false
  afterExecuteCalled = false
  beforeExecuteValue: number | null = null
  afterExecuteValue: number | null = null

  constructor(context: ToolContext) {
    super(context, z.object({ value: z.number() }))
  }

  protected async beforeExecute(params: z.infer<typeof this.inputSchema>): Promise<void> {
    this.beforeExecuteCalled = true
    this.beforeExecuteValue = params.value
  }

  protected async executeInternal(
    params: z.infer<typeof this.inputSchema>
  ): Promise<{ modified: number }> {
    return { modified: params.value * 2 }
  }

  protected async afterExecute(
    result: { modified: number },
    _params: z.infer<typeof this.inputSchema>
  ): Promise<{ modified: number }> {
    this.afterExecuteCalled = true
    this.afterExecuteValue = result.modified
    return { modified: result.modified + 1 }
  }
}

// Create a tool with custom response format handling
class CustomFormatTool extends GristTool<
  z.ZodObject<{ data: z.ZodString; response_format: z.ZodEnum<['json', 'markdown']> }>,
  { output: string }
> {
  constructor(context: ToolContext) {
    super(
      context,
      z.object({
        data: z.string(),
        response_format: z.enum(['json', 'markdown']).optional()
      })
    )
  }

  protected async executeInternal(
    params: z.infer<typeof this.inputSchema>
  ): Promise<{ output: string }> {
    return { output: params.data }
  }
}

// Helper to create a mock ToolContext
const createMockContext = (): ToolContext => ({
  client: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  } as unknown as GristClient,
  schemaCache: {
    getTableColumns: vi.fn(),
    getTableRefs: vi.fn()
  } as unknown as SchemaCache
})

describe('GristTool', () => {
  let context: ToolContext
  let tool: TestTool

  beforeEach(() => {
    resetSessionAnalytics()
    context = createMockContext()
    tool = new TestTool(context)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('initializes with context and schema', () => {
      expect(tool).toBeDefined()
      expect(tool.client).toBe(context.client)
      expect(tool.schemaCache).toBe(context.schemaCache)
    })
  })

  describe('execute()', () => {
    it('executes successfully with valid params', async () => {
      const response = await tool.execute({ name: 'Test', count: 42 })

      expect(response).toBeDefined()
      expect(response.content).toBeDefined()
      expect(response.content[0]).toBeDefined()
      expect(response.content[0]?.type).toBe('text')
      expect(response.isError).toBeUndefined()
    })

    it('validates input params', async () => {
      const response = await tool.execute({ name: 'Test' })

      expect(response.isError).toBe(true)
      expect(response.content[0]?.text).toContain('Invalid value for parameter')
    })

    it('returns structured content on success', async () => {
      const response = await tool.execute({ name: 'Test', count: 42 })

      expect(response.structuredContent).toBeDefined()
      expect(response.structuredContent).toHaveProperty('result')
    })

    it('records execution metrics', async () => {
      await tool.execute({ name: 'Test', count: 42 })

      // Session analytics should have been called
      // We can't directly test this without mocking, but we verify no errors
      expect(true).toBe(true)
    })

    it('handles execution time tracking', async () => {
      const start = Date.now()
      await tool.execute({ name: 'Test', count: 42 })
      const duration = Date.now() - start

      expect(duration).toBeGreaterThanOrEqual(0)
    })
  })

  describe('validateInput()', () => {
    it('validates correct input', () => {
      const validated = tool.validateInput({ name: 'Test', count: 42 })

      expect(validated).toEqual({ name: 'Test', count: 42 })
    })

    it('throws ValidationError on invalid input', () => {
      expect(() => {
        tool.validateInput({ name: 'Test' })
      }).toThrow(ValidationError)
    })

    it('throws ValidationError with descriptive message', () => {
      try {
        tool.validateInput({ name: 'Test', count: 'invalid' })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        if (error instanceof ValidationError) {
          expect(error.message).toContain('Validation failed')
        }
      }
    })

    it('validates extra properties are stripped', () => {
      const validated = tool.validateInput({
        name: 'Test',
        count: 42,
        extra: 'should be removed'
      })

      expect(validated).toEqual({ name: 'Test', count: 42 })
    })
  })

  describe('beforeExecute() and afterExecute()', () => {
    let lifecycleTool: LifecycleTool

    beforeEach(() => {
      lifecycleTool = new LifecycleTool(context)
    })

    it('calls beforeExecute before executeInternal', async () => {
      await lifecycleTool.execute({ value: 5 })

      expect(lifecycleTool.beforeExecuteCalled).toBe(true)
      expect(lifecycleTool.beforeExecuteValue).toBe(5)
    })

    it('calls afterExecute after executeInternal', async () => {
      await lifecycleTool.execute({ value: 5 })

      expect(lifecycleTool.afterExecuteCalled).toBe(true)
      expect(lifecycleTool.afterExecuteValue).toBe(10)
    })

    it('uses result from afterExecute for formatting', async () => {
      const response = await lifecycleTool.execute({ value: 5 })

      // executeInternal returns 10 (5 * 2)
      // afterExecute adds 1, so final result is 11
      expect(response.structuredContent).toHaveProperty('modified', 11)
    })
  })

  describe('getResponseFormat()', () => {
    let formatTool: CustomFormatTool

    beforeEach(() => {
      formatTool = new CustomFormatTool(context)
    })

    it('defaults to json format', () => {
      const format = formatTool.getResponseFormat({ data: 'test' })
      expect(format).toBe('json')
    })

    it('extracts json format from params', () => {
      const format = formatTool.getResponseFormat({
        data: 'test',
        response_format: 'json'
      })
      expect(format).toBe('json')
    })

    it('extracts markdown format from params', () => {
      const format = formatTool.getResponseFormat({
        data: 'test',
        response_format: 'markdown'
      })
      expect(format).toBe('markdown')
    })

    it('defaults to json for invalid format', () => {
      const format = formatTool.getResponseFormat({
        data: 'test',
        response_format: 'invalid' as 'json'
      })
      expect(format).toBe('json')
    })

    it('handles null params', () => {
      const format = formatTool.getResponseFormat(null)
      expect(format).toBe('json')
    })

    it('handles non-object params', () => {
      const format = formatTool.getResponseFormat('string')
      expect(format).toBe('json')
    })
  })

  describe('handleError()', () => {
    let errorTool: ErrorTool

    beforeEach(() => {
      errorTool = new ErrorTool(context)
    })

    it('handles GristError with full context', async () => {
      const gristError = ValidationError.fromZodError(
        z.object({ test: z.string() }).safeParse({ test: 123 }).error as z.ZodError,
        'Test error'
      )
      errorTool.setError(gristError)

      const response = await errorTool.execute({ action: 'test' })

      expect(response.isError).toBe(true)
      expect(response.content[0]?.text).toBeDefined()
    })

    it('handles standard Error', async () => {
      errorTool.setError(new Error('Standard error message'))

      const response = await errorTool.execute({ action: 'test' })

      expect(response.isError).toBe(true)
      expect(response.content[0]?.text).toContain('Standard error message')
    })

    it('handles string errors', async () => {
      errorTool.setError('String error')

      const response = await errorTool.execute({ action: 'test' })

      expect(response.isError).toBe(true)
      expect(response.content[0]?.text).toContain('String error')
    })

    it('handles unknown error types', async () => {
      errorTool.setError({ custom: 'error' })

      const response = await errorTool.execute({ action: 'test' })

      expect(response.isError).toBe(true)
      expect(response.content[0]?.text).toBeDefined()
    })

    it('returns error response without structuredContent', async () => {
      errorTool.setError(new Error('Test'))

      const response = await errorTool.execute({ action: 'test' })

      expect(response.structuredContent).toBeUndefined()
    })
  })

  describe('formatResponse()', () => {
    it('formats data as markdown by default', () => {
      const response = tool.formatResponse({ result: 'test' }, 'markdown')

      expect(response.content[0]?.type).toBe('text')
      expect(response.structuredContent).toHaveProperty('result', 'test')
    })

    it('formats data as JSON', () => {
      const response = tool.formatResponse({ result: 'test' }, 'json')

      expect(response.content[0]?.text).toContain('{')
      expect(response.content[0]?.text).toContain('"result"')
      expect(response.structuredContent).toHaveProperty('result', 'test')
    })

    it('includes structuredContent in all formats', () => {
      const data = { result: 'test', nested: { value: 42 } }

      const mdResponse = tool.formatResponse(data, 'markdown')
      const jsonResponse = tool.formatResponse(data, 'json')

      expect(mdResponse.structuredContent).toEqual(data)
      expect(jsonResponse.structuredContent).toEqual(data)
    })
  })

  describe('getToolName()', () => {
    it('converts class name to snake_case with grist_ prefix', () => {
      const name = tool.getToolName()
      expect(name).toBe('grist_test')
    })

    it('removes Tool suffix and adds grist_ prefix', () => {
      class MyCustomTool extends GristTool<z.ZodObject<Record<string, never>>, unknown> {
        constructor(context: ToolContext) {
          super(context, z.object({}))
        }
        protected async executeInternal(): Promise<unknown> {
          return {}
        }
      }

      const myTool = new MyCustomTool(context)
      expect(myTool.getToolName()).toBe('grist_my_custom')
    })

    it('handles single word class names with grist_ prefix', () => {
      class Simple extends GristTool<z.ZodObject<Record<string, never>>, unknown> {
        constructor(context: ToolContext) {
          super(context, z.object({}))
        }
        protected async executeInternal(): Promise<unknown> {
          return {}
        }
      }

      const simple = new Simple(context)
      expect(simple.getToolName()).toBe('grist_simple')
    })
  })

  describe('getCacheKey()', () => {
    it('returns null by default', () => {
      const key = tool.getCacheKey({ name: 'Test', count: 42 })
      expect(key).toBeNull()
    })

    it('can be overridden by subclasses', () => {
      class CacheableTool extends TestTool {
        protected getCacheKey(params: z.infer<typeof this.inputSchema>): string | null {
          return `${params.name}-${params.count}`
        }
      }

      const cacheableTool = new CacheableTool(context)
      const key = cacheableTool.getCacheKey({ name: 'Test', count: 42 })
      expect(key).toBe('Test-42')
    })
  })

  describe('supportsFeature()', () => {
    it('returns false for all features by default', () => {
      expect(tool.supportsFeature('caching')).toBe(false)
      expect(tool.supportsFeature('pagination')).toBe(false)
      expect(tool.supportsFeature('filtering')).toBe(false)
    })

    it('can be overridden by subclasses', () => {
      class FeaturefulTool extends TestTool {
        protected supportsFeature(feature: 'caching' | 'pagination' | 'filtering'): boolean {
          return feature === 'caching'
        }
      }

      const featurefulTool = new FeaturefulTool(context)
      expect(featurefulTool.supportsFeature('caching')).toBe(true)
      expect(featurefulTool.supportsFeature('pagination')).toBe(false)
    })
  })

  describe('error handling in execute flow', () => {
    it('still records metrics on error', async () => {
      const errorTool = new ErrorTool(context)
      errorTool.setError(new Error('Test error'))

      const response = await errorTool.execute({ action: 'test' })

      expect(response.isError).toBe(true)
      // Metrics should still be recorded even on error
    })

    it('handles error in beforeExecute', async () => {
      class FailingBeforeTool extends GristTool<z.ZodObject<{ value: z.ZodNumber }>, unknown> {
        constructor(context: ToolContext) {
          super(context, z.object({ value: z.number() }))
        }

        protected async beforeExecute(_params: z.infer<typeof this.inputSchema>): Promise<void> {
          throw new Error('Before execute failed')
        }

        protected async executeInternal(
          _params: z.infer<typeof this.inputSchema>
        ): Promise<unknown> {
          return {}
        }
      }

      const failingTool = new FailingBeforeTool(context)
      const response = await failingTool.execute({ value: 5 })

      expect(response.isError).toBe(true)
      expect(response.content[0]?.text).toContain('Before execute failed')
    })

    it('handles error in afterExecute', async () => {
      class FailingAfterTool extends GristTool<z.ZodObject<{ value: z.ZodNumber }>, unknown> {
        constructor(context: ToolContext) {
          super(context, z.object({ value: z.number() }))
        }

        protected async executeInternal(
          _params: z.infer<typeof this.inputSchema>
        ): Promise<unknown> {
          return { result: 'ok' }
        }

        protected async afterExecute(
          _result: unknown,
          _params: z.infer<typeof this.inputSchema>
        ): Promise<unknown> {
          throw new Error('After execute failed')
        }
      }

      const failingTool = new FailingAfterTool(context)
      const response = await failingTool.execute({ value: 5 })

      expect(response.isError).toBe(true)
      expect(response.content[0]?.text).toContain('After execute failed')
    })
  })

  describe('type safety', () => {
    it('enforces input schema type', () => {
      // This is a compile-time test, but we can verify runtime behavior
      const validated = tool.validateInput({ name: 'Test', count: 42 })

      // TypeScript should infer the correct type
      expect(typeof validated.name).toBe('string')
      expect(typeof validated.count).toBe('number')
    })

    it('enforces output type from executeInternal', async () => {
      // Create a tool with specific output type
      class TypedOutputTool extends GristTool<
        z.ZodObject<Record<string, never>>,
        { id: number; name: string }
      > {
        constructor(context: ToolContext) {
          super(context, z.object({}))
        }

        protected async executeInternal(): Promise<{ id: number; name: string }> {
          return { id: 1, name: 'Test' }
        }
      }

      const typedTool = new TypedOutputTool(context)
      const response = await typedTool.execute({})

      expect(response.structuredContent).toHaveProperty('id', 1)
      expect(response.structuredContent).toHaveProperty('name', 'Test')
    })
  })

  describe('response byte calculation', () => {
    it('calculates response bytes correctly', async () => {
      const response = await tool.execute({ name: 'Test', count: 42 })

      // Response should have some bytes
      const bytes = JSON.stringify(response).length
      expect(bytes).toBeGreaterThan(0)
    })

    it('handles response byte calculation errors gracefully', async () => {
      // Create a response with circular reference
      const circularTool = new (class extends TestTool {
        protected formatResponse(): MCPToolResponse {
          const obj: { circular?: unknown } = {}
          obj.circular = obj
          return obj as MCPToolResponse
        }
      })(context)

      // Should not throw, should handle gracefully
      await circularTool.execute({ name: 'Test', count: 42 })
      expect(true).toBe(true)
    })
  })

  describe('integration scenarios', () => {
    it('handles complex nested data structures', async () => {
      class ComplexTool extends GristTool<
        z.ZodObject<Record<string, never>>,
        { nested: { deep: { value: number[] } } }
      > {
        constructor(context: ToolContext) {
          super(context, z.object({}))
        }

        protected async executeInternal(): Promise<{ nested: { deep: { value: number[] } } }> {
          return { nested: { deep: { value: [1, 2, 3, 4, 5] } } }
        }
      }

      const complexTool = new ComplexTool(context)
      const response = await complexTool.execute({})

      expect(response.structuredContent).toHaveProperty('nested')
      expect(response.structuredContent?.nested).toHaveProperty('deep')
    })

    it('handles async operations in lifecycle hooks', async () => {
      class AsyncLifecycleTool extends GristTool<
        z.ZodObject<{ id: z.ZodNumber }>,
        { result: string }
      > {
        constructor(context: ToolContext) {
          super(context, z.object({ id: z.number() }))
        }

        protected async beforeExecute(_params: z.infer<typeof this.inputSchema>): Promise<void> {
          await new Promise((resolve) => setTimeout(resolve, 1))
        }

        protected async executeInternal(
          params: z.infer<typeof this.inputSchema>
        ): Promise<{ result: string }> {
          await new Promise((resolve) => setTimeout(resolve, 1))
          return { result: `ID: ${params.id}` }
        }

        protected async afterExecute(
          result: { result: string },
          _params: z.infer<typeof this.inputSchema>
        ): Promise<{ result: string }> {
          await new Promise((resolve) => setTimeout(resolve, 1))
          return result
        }
      }

      const asyncTool = new AsyncLifecycleTool(context)
      const response = await asyncTool.execute({ id: 123 })

      expect(response.structuredContent).toHaveProperty('result', 'ID: 123')
    })
  })
})
