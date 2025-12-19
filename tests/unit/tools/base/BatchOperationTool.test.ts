import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { ToolContext } from '../../../../src/registry/types.js'
import type { GristClient } from '../../../../src/services/grist-client.js'
import type { SchemaCache } from '../../../../src/services/schema-cache.js'
import { resetSessionAnalytics } from '../../../../src/services/session-analytics.js'
import {
  BatchOperationTool,
  type BatchResult
} from '../../../../src/tools/base/BatchOperationTool.js'

// Test operation types
interface CreateOperation {
  type: 'create'
  name: string
  value: number
}

interface UpdateOperation {
  type: 'update'
  id: number
  value: number
}

interface DeleteOperation {
  type: 'delete'
  id: number
}

type TestOperation = CreateOperation | UpdateOperation | DeleteOperation

interface OperationResult {
  operationType: string
  success: boolean
  id?: number
}

interface TestResponse extends BatchResult<OperationResult> {
  summary: string
}

// Basic batch operation tool implementation
class BasicBatchTool extends BatchOperationTool<
  z.ZodObject<{
    docId: z.ZodString
    operations: z.ZodArray<z.ZodObject<{ type: z.ZodString }>>
  }>,
  TestOperation,
  OperationResult,
  TestResponse
> {
  constructor(context: ToolContext) {
    super(
      context,
      z.object({
        docId: z.string(),
        operations: z
          .array(
            z.object({
              type: z.string()
            })
          )
          .min(1)
      })
    )
  }

  protected getOperations(params: z.infer<typeof this.inputSchema>): TestOperation[] {
    return params.operations as TestOperation[]
  }

  protected getDocId(params: z.infer<typeof this.inputSchema>): string {
    return params.docId
  }

  protected async executeOperation(
    _docId: string,
    operation: TestOperation,
    _index: number
  ): Promise<OperationResult> {
    // Simulate successful operation
    return {
      operationType: operation.type,
      success: true,
      id: operation.type === 'create' ? Math.floor(Math.random() * 1000) : undefined
    }
  }

  protected getActionName(operation: TestOperation): string {
    return operation.type
  }

  protected buildSuccessResponse(
    docId: string,
    results: OperationResult[],
    _params: z.infer<typeof this.inputSchema>
  ): TestResponse {
    return {
      success: true,
      docId,
      operationsCompleted: results.length,
      results,
      summary: `Successfully completed ${results.length} operations`
    }
  }

  protected buildFailureResponse(
    docId: string,
    failedIndex: number,
    failedOperation: TestOperation,
    completedResults: OperationResult[],
    errorMessage: string,
    _params: z.infer<typeof this.inputSchema>
  ): TestResponse {
    return {
      success: false,
      docId,
      operationsCompleted: completedResults.length,
      results: completedResults,
      summary: `Failed after ${completedResults.length} operations`,
      partialFailure: {
        operationIndex: failedIndex,
        action: this.getActionName(failedOperation),
        error: errorMessage,
        completedOperations: completedResults.length
      }
    }
  }
}

// Tool that simulates failures
class FailingBatchTool extends BasicBatchTool {
  private failAtIndex: number | null = null
  private failureMessage = 'Simulated failure'

  setFailureAt(index: number, message = 'Simulated failure'): void {
    this.failAtIndex = index
    this.failureMessage = message
  }

  protected async executeOperation(
    docId: string,
    operation: TestOperation,
    index: number
  ): Promise<OperationResult> {
    if (this.failAtIndex === index) {
      throw new Error(this.failureMessage)
    }
    return super.executeOperation(docId, operation, index)
  }
}

// Tool that tracks execution order
class TrackingBatchTool extends BasicBatchTool {
  executionLog: Array<{ index: number; operation: TestOperation }> = []

  protected async executeOperation(
    docId: string,
    operation: TestOperation,
    index: number
  ): Promise<OperationResult> {
    this.executionLog.push({ index, operation })
    return super.executeOperation(docId, operation, index)
  }

  clearLog(): void {
    this.executionLog = []
  }
}

// Helper to create mock context
const createMockContext = (): ToolContext => ({
  client: {
    get: vi.fn(),
    post: vi.fn()
  } as unknown as GristClient,
  schemaCache: {
    getTableColumns: vi.fn()
  } as unknown as SchemaCache
})

describe('BatchOperationTool', () => {
  let context: ToolContext
  let tool: BasicBatchTool

  beforeEach(() => {
    resetSessionAnalytics()
    context = createMockContext()
    tool = new BasicBatchTool(context)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('executeInternal()', () => {
    it('executes all operations successfully', async () => {
      const operations: TestOperation[] = [
        { type: 'create', name: 'Item 1', value: 100 },
        { type: 'update', id: 1, value: 200 },
        { type: 'delete', id: 2 }
      ]

      const result = await tool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result.success).toBe(true)
      expect(result.operationsCompleted).toBe(3)
      expect(result.results).toHaveLength(3)
      expect(result.partialFailure).toBeUndefined()
    })

    it('executes operations in sequential order', async () => {
      const trackingTool = new TrackingBatchTool(context)
      const operations: TestOperation[] = [
        { type: 'create', name: 'First', value: 1 },
        { type: 'create', name: 'Second', value: 2 },
        { type: 'create', name: 'Third', value: 3 }
      ]

      await trackingTool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(trackingTool.executionLog).toHaveLength(3)
      expect(trackingTool.executionLog[0]?.index).toBe(0)
      expect(trackingTool.executionLog[1]?.index).toBe(1)
      expect(trackingTool.executionLog[2]?.index).toBe(2)
    })

    it('stops on first failure', async () => {
      const failingTool = new FailingBatchTool(context)
      failingTool.setFailureAt(1, 'Operation 2 failed')

      const operations: TestOperation[] = [
        { type: 'create', name: 'Item 1', value: 100 },
        { type: 'update', id: 1, value: 200 },
        { type: 'delete', id: 2 }
      ]

      const result = await failingTool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result.success).toBe(false)
      expect(result.operationsCompleted).toBe(1) // Only first operation completed
      expect(result.results).toHaveLength(1)
      expect(result.partialFailure).toBeDefined()
      expect(result.partialFailure?.operationIndex).toBe(1)
      expect(result.partialFailure?.error).toContain('Operation 2 failed')
    })

    it('includes completed results in failure response', async () => {
      const failingTool = new FailingBatchTool(context)
      failingTool.setFailureAt(2)

      const operations: TestOperation[] = [
        { type: 'create', name: 'Item 1', value: 100 },
        { type: 'update', id: 1, value: 200 },
        { type: 'delete', id: 2 }
      ]

      const result = await failingTool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result.success).toBe(false)
      expect(result.results).toHaveLength(2)
      expect(result.results[0]?.operationType).toBe('create')
      expect(result.results[1]?.operationType).toBe('update')
    })

    it('handles failure on first operation', async () => {
      const failingTool = new FailingBatchTool(context)
      failingTool.setFailureAt(0, 'First operation failed')

      const operations: TestOperation[] = [{ type: 'create', name: 'Item 1', value: 100 }]

      const result = await failingTool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result.success).toBe(false)
      expect(result.operationsCompleted).toBe(0)
      expect(result.results).toHaveLength(0)
      expect(result.partialFailure?.operationIndex).toBe(0)
    })

    it('handles empty operations array', async () => {
      const operations: TestOperation[] = []

      const result = await tool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result.success).toBe(true)
      expect(result.operationsCompleted).toBe(0)
      expect(result.results).toHaveLength(0)
    })

    it('handles single operation', async () => {
      const operations: TestOperation[] = [{ type: 'create', name: 'Single', value: 100 }]

      const result = await tool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result.success).toBe(true)
      expect(result.operationsCompleted).toBe(1)
      expect(result.results).toHaveLength(1)
    })

    it('skips undefined operations', async () => {
      const trackingTool = new TrackingBatchTool(context)
      const operations = [
        { type: 'create', name: 'Item 1', value: 100 },
        undefined,
        { type: 'create', name: 'Item 2', value: 200 }
      ] as unknown as TestOperation[]

      const result = await trackingTool.executeInternal({
        docId: 'doc123',
        operations
      })

      // Should skip undefined and process 2 operations
      expect(trackingTool.executionLog).toHaveLength(2)
      expect(result.operationsCompleted).toBe(2)
    })
  })

  describe('getOperations()', () => {
    it('extracts operations from params', () => {
      const operations: TestOperation[] = [{ type: 'create', name: 'Test', value: 1 }]
      const params = { docId: 'doc123', operations }

      const extracted = tool.getOperations(params)

      expect(extracted).toBe(operations)
      expect(extracted).toHaveLength(1)
    })
  })

  describe('getDocId()', () => {
    it('extracts docId from params', () => {
      const params = {
        docId: 'doc123',
        operations: [{ type: 'create', name: 'Test', value: 1 }]
      }

      const docId = tool.getDocId(params)

      expect(docId).toBe('doc123')
    })
  })

  describe('executeOperation()', () => {
    it('is called for each operation', async () => {
      const spy = vi.spyOn(tool, 'executeOperation' as keyof typeof tool)

      const operations: TestOperation[] = [
        { type: 'create', name: 'Item 1', value: 100 },
        { type: 'update', id: 1, value: 200 }
      ]

      await tool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(spy).toHaveBeenCalledTimes(2)
    })

    it('receives correct parameters', async () => {
      const trackingTool = new TrackingBatchTool(context)
      const operation: TestOperation = { type: 'create', name: 'Test', value: 100 }

      await trackingTool.executeInternal({
        docId: 'doc456',
        operations: [operation]
      })

      expect(trackingTool.executionLog[0]?.operation).toBe(operation)
      expect(trackingTool.executionLog[0]?.index).toBe(0)
    })
  })

  describe('getActionName()', () => {
    it('returns action name for operation', () => {
      const operation: TestOperation = { type: 'create', name: 'Test', value: 1 }
      const actionName = tool.getActionName(operation)

      expect(actionName).toBe('create')
    })

    it('is used in failure response', async () => {
      const failingTool = new FailingBatchTool(context)
      failingTool.setFailureAt(0)

      const operations: TestOperation[] = [{ type: 'update', id: 1, value: 200 }]

      const result = await failingTool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result.partialFailure?.action).toBe('update')
    })
  })

  describe('buildSuccessResponse()', () => {
    it('builds response with all completed operations', async () => {
      const operations: TestOperation[] = [
        { type: 'create', name: 'Item 1', value: 100 },
        { type: 'update', id: 1, value: 200 }
      ]

      const result = await tool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result.success).toBe(true)
      expect(result.docId).toBe('doc123')
      expect(result.operationsCompleted).toBe(2)
      expect(result.results).toHaveLength(2)
      expect(result.summary).toContain('Successfully completed 2 operations')
    })

    it('includes all result data', async () => {
      const operations: TestOperation[] = [{ type: 'create', name: 'Item 1', value: 100 }]

      const result = await tool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result.results[0]).toHaveProperty('operationType', 'create')
      expect(result.results[0]).toHaveProperty('success', true)
    })
  })

  describe('buildFailureResponse()', () => {
    it('builds response with partial results', async () => {
      const failingTool = new FailingBatchTool(context)
      failingTool.setFailureAt(1, 'Database error')

      const operations: TestOperation[] = [
        { type: 'create', name: 'Item 1', value: 100 },
        { type: 'update', id: 1, value: 200 }
      ]

      const result = await failingTool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result.success).toBe(false)
      expect(result.docId).toBe('doc123')
      expect(result.operationsCompleted).toBe(1)
      expect(result.results).toHaveLength(1)
      expect(result.partialFailure).toBeDefined()
      expect(result.partialFailure?.error).toContain('Database error')
    })

    it('includes failure metadata', async () => {
      const failingTool = new FailingBatchTool(context)
      failingTool.setFailureAt(2)

      const operations: TestOperation[] = [
        { type: 'create', name: 'Item 1', value: 100 },
        { type: 'create', name: 'Item 2', value: 200 },
        { type: 'delete', id: 1 }
      ]

      const result = await failingTool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result.partialFailure).toEqual({
        operationIndex: 2,
        action: 'delete',
        error: 'Simulated failure',
        completedOperations: 2
      })
    })
  })

  describe('error handling', () => {
    it('handles Error objects', async () => {
      const failingTool = new FailingBatchTool(context)
      failingTool.setFailureAt(0, 'Standard error message')

      const operations: TestOperation[] = [{ type: 'create', name: 'Test', value: 1 }]

      const result = await failingTool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result.partialFailure?.error).toBe('Standard error message')
    })

    it('handles non-Error exceptions', async () => {
      class CustomFailingTool extends BasicBatchTool {
        protected async executeOperation(): Promise<OperationResult> {
          throw 'String error'
        }
      }

      const customTool = new CustomFailingTool(context)
      const result = await customTool.executeInternal({
        docId: 'doc123',
        operations: [{ type: 'create', name: 'Test', value: 1 }]
      })

      expect(result.success).toBe(false)
      expect(result.partialFailure?.error).toBe('String error')
    })

    it('handles object exceptions', async () => {
      class CustomFailingTool extends BasicBatchTool {
        protected async executeOperation(): Promise<OperationResult> {
          throw { code: 'ERR_TEST', message: 'Object error' }
        }
      }

      const customTool = new CustomFailingTool(context)
      const result = await customTool.executeInternal({
        docId: 'doc123',
        operations: [{ type: 'create', name: 'Test', value: 1 }]
      })

      expect(result.success).toBe(false)
      expect(result.partialFailure?.error).toBeDefined()
    })
  })

  describe('integration with execute()', () => {
    it('returns properly formatted response on success', async () => {
      const operations: TestOperation[] = [{ type: 'create', name: 'Item 1', value: 100 }]

      const response = await tool.execute({
        docId: 'doc123',
        operations
      })

      expect(response.isError).toBeUndefined()
      expect(response.structuredContent).toBeDefined()
      expect(response.structuredContent).toHaveProperty('success', true)
      expect(response.structuredContent).toHaveProperty('results')
    })

    it('returns error response on validation failure', async () => {
      const response = await tool.execute({
        docId: 'doc123',
        operations: [] // Invalid: must have at least 1
      })

      expect(response.isError).toBe(true)
      expect(response.content[0]?.text).toContain('Invalid value for parameter')
    })
  })

  describe('batch result structure', () => {
    it('conforms to BatchResult interface', async () => {
      const operations: TestOperation[] = [{ type: 'create', name: 'Item 1', value: 100 }]

      const result = await tool.executeInternal({
        docId: 'doc123',
        operations
      })

      // Check required fields
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('docId')
      expect(result).toHaveProperty('operationsCompleted')
      expect(result).toHaveProperty('results')

      expect(typeof result.success).toBe('boolean')
      expect(typeof result.docId).toBe('string')
      expect(typeof result.operationsCompleted).toBe('number')
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('includes optional message field on success', async () => {
      const operations: TestOperation[] = [{ type: 'create', name: 'Item 1', value: 100 }]

      const result = await tool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result).toHaveProperty('summary')
    })

    it('includes partialFailure on error', async () => {
      const failingTool = new FailingBatchTool(context)
      failingTool.setFailureAt(0)

      const operations: TestOperation[] = [{ type: 'create', name: 'Item 1', value: 100 }]

      const result = await failingTool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result).toHaveProperty('partialFailure')
      expect(result.partialFailure).toHaveProperty('operationIndex')
      expect(result.partialFailure).toHaveProperty('action')
      expect(result.partialFailure).toHaveProperty('error')
      expect(result.partialFailure).toHaveProperty('completedOperations')
    })
  })

  describe('performance and scalability', () => {
    it('handles large batch efficiently', async () => {
      const operations: TestOperation[] = Array.from({ length: 100 }, (_, i) => ({
        type: 'create' as const,
        name: `Item ${i}`,
        value: i
      }))

      const start = Date.now()
      const result = await tool.executeInternal({
        docId: 'doc123',
        operations
      })
      const duration = Date.now() - start

      expect(result.success).toBe(true)
      expect(result.operationsCompleted).toBe(100)
      expect(duration).toBeLessThan(1000) // Should complete quickly
    })

    it('stops quickly on early failure', async () => {
      const failingTool = new FailingBatchTool(context)
      failingTool.setFailureAt(2)

      const operations: TestOperation[] = Array.from({ length: 100 }, (_, i) => ({
        type: 'create' as const,
        name: `Item ${i}`,
        value: i
      }))

      const result = await failingTool.executeInternal({
        docId: 'doc123',
        operations
      })

      expect(result.operationsCompleted).toBe(2) // Stopped early
      expect(result.results).toHaveLength(2) // Only 2 completed
    })
  })

  describe('type safety', () => {
    it('preserves operation types', async () => {
      interface TypedOperation {
        id: string
        data: { value: number }
      }

      interface TypedResult {
        operationId: string
        processed: boolean
      }

      class TypedBatchTool extends BatchOperationTool<
        z.ZodObject<{ docId: z.ZodString; operations: z.ZodArray<z.ZodAny> }>,
        TypedOperation,
        TypedResult,
        BatchResult<TypedResult>
      > {
        constructor(context: ToolContext) {
          super(
            context,
            z.object({
              docId: z.string(),
              operations: z.array(z.any())
            })
          )
        }

        protected getOperations(params: z.infer<typeof this.inputSchema>): TypedOperation[] {
          return params.operations
        }

        protected getDocId(params: z.infer<typeof this.inputSchema>): string {
          return params.docId
        }

        protected async executeOperation(
          _docId: string,
          operation: TypedOperation
        ): Promise<TypedResult> {
          return {
            operationId: operation.id,
            processed: true
          }
        }

        protected getActionName(operation: TypedOperation): string {
          return operation.id
        }

        protected buildSuccessResponse(
          docId: string,
          results: TypedResult[]
        ): BatchResult<TypedResult> {
          return {
            success: true,
            docId,
            operationsCompleted: results.length,
            results
          }
        }

        protected buildFailureResponse(
          docId: string,
          failedIndex: number,
          failedOperation: TypedOperation,
          completedResults: TypedResult[],
          errorMessage: string
        ): BatchResult<TypedResult> {
          return {
            success: false,
            docId,
            operationsCompleted: completedResults.length,
            results: completedResults,
            partialFailure: {
              operationIndex: failedIndex,
              action: failedOperation.id,
              error: errorMessage,
              completedOperations: completedResults.length
            }
          }
        }
      }

      const typedTool = new TypedBatchTool(context)
      const result = await typedTool.executeInternal({
        docId: 'doc123',
        operations: [{ id: 'op1', data: { value: 1 } }]
      })

      expect(result.results[0]?.operationId).toBe('op1')
      expect(result.results[0]?.processed).toBe(true)
    })
  })
})
