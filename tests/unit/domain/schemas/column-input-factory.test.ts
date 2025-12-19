/**
 * Unit Tests for Column Input Schema Factory
 *
 * Tests the schema pipeline that:
 * 1. Validates and merges top-level widget options
 * 2. Transforms via codecs (choices, currency)
 * 3. Resolves visibleCol (mocked for unit tests)
 */

import { describe, expect, it, vi } from 'vitest'
import {
  createResolvedColumnSchema,
  createResolvedModifyColumnSchema
} from '../../../../src/domain/schemas/column-input-factory.js'
import type { GristClient } from '../../../../src/services/grist-client.js'

// Mock the column-resolver module
vi.mock('../../../../src/services/column-resolver.js', () => ({
  resolveVisibleCol: vi.fn().mockResolvedValue(42),
  extractForeignTable: (type: string) => {
    const match = type.match(/^(?:Ref|RefList):(.+)$/)
    return match?.[1] ?? null
  }
}))

// Create a mock GristClient
const mockClient = {
  get: vi.fn(),
  post: vi.fn()
} as unknown as GristClient

describe('Column Input Schema Factory', () => {
  describe('createResolvedColumnSchema', () => {
    const schema = createResolvedColumnSchema(mockClient, 'testDoc', 'TestTable')

    describe('basic validation', () => {
      it('should accept valid column input', async () => {
        const result = await schema.parseAsync({
          colId: 'Name',
          type: 'Text'
        })

        expect(result.colId).toBe('Name')
        expect(result.type).toBe('Text')
      })

      it('should reject missing colId', async () => {
        await expect(
          schema.parseAsync({
            type: 'Text'
          })
        ).rejects.toThrow()
      })

      it('should reject missing type', async () => {
        await expect(
          schema.parseAsync({
            colId: 'Name'
          })
        ).rejects.toThrow()
      })

      it('should accept optional fields', async () => {
        const result = await schema.parseAsync({
          colId: 'Description',
          type: 'Text',
          label: 'Full Description',
          isFormula: false
        })

        expect(result.label).toBe('Full Description')
        expect(result.isFormula).toBe(false)
      })
    })

    describe('widget options merging', () => {
      it('should merge top-level choices into widgetOptions', async () => {
        const result = await schema.parseAsync({
          colId: 'Status',
          type: 'Choice',
          choices: ['Open', 'Closed']
        })

        expect(result.widgetOptions).toBeDefined()
        expect(result.widgetOptions?.choices).toEqual(['L', 'Open', 'Closed'])
      })

      it('should merge top-level currency into widgetOptions', async () => {
        const result = await schema.parseAsync({
          colId: 'Price',
          type: 'Numeric',
          currency: 'usd'
        })

        expect(result.widgetOptions?.currency).toBe('USD')
      })

      it('should merge multiple top-level options', async () => {
        const result = await schema.parseAsync({
          colId: 'Amount',
          type: 'Numeric',
          currency: 'eur',
          decimals: 2,
          numMode: 'currency'
        })

        expect(result.widgetOptions?.currency).toBe('EUR')
        expect(result.widgetOptions?.decimals).toBe(2)
        expect(result.widgetOptions?.numMode).toBe('currency')
      })

      it('should preserve existing widgetOptions', async () => {
        const result = await schema.parseAsync({
          colId: 'Date',
          type: 'Date',
          widgetOptions: { wrap: true },
          dateFormat: 'YYYY-MM-DD'
        })

        expect(result.widgetOptions?.wrap).toBe(true)
        expect(result.widgetOptions?.dateFormat).toBe('YYYY-MM-DD')
      })

      it('should return undefined widgetOptions if no options provided', async () => {
        const result = await schema.parseAsync({
          colId: 'Name',
          type: 'Text'
        })

        expect(result.widgetOptions).toBeUndefined()
      })
    })

    describe('codec transformations', () => {
      it('should transform choices array with L prefix', async () => {
        const result = await schema.parseAsync({
          colId: 'Priority',
          type: 'Choice',
          choices: ['High', 'Medium', 'Low']
        })

        expect(result.widgetOptions?.choices).toEqual(['L', 'High', 'Medium', 'Low'])
      })

      it('should uppercase currency code', async () => {
        const result = await schema.parseAsync({
          colId: 'Cost',
          type: 'Numeric',
          currency: 'gbp'
        })

        expect(result.widgetOptions?.currency).toBe('GBP')
      })

      it('should handle empty choices array', async () => {
        const result = await schema.parseAsync({
          colId: 'Status',
          type: 'Choice',
          choices: []
        })

        expect(result.widgetOptions?.choices).toEqual(['L'])
      })
    })

    describe('visibleCol resolution', () => {
      it('should resolve string visibleCol to number', async () => {
        const result = await schema.parseAsync({
          colId: 'Company',
          type: 'Ref:Companies',
          visibleCol: 'Name'
        })

        // Mock returns 42
        expect(result.visibleCol).toBe(42)
      })

      it('should pass through numeric visibleCol', async () => {
        const result = await schema.parseAsync({
          colId: 'Company',
          type: 'Ref:Companies',
          visibleCol: 99
        })

        expect(result.visibleCol).toBe(99)
      })

      it('should not resolve visibleCol for non-Ref types', async () => {
        const result = await schema.parseAsync({
          colId: 'Name',
          type: 'Text',
          visibleCol: 'ignored'
        })

        // String should remain (not resolved) for non-Ref types
        expect(result.visibleCol).toBe('ignored')
      })

      it('should handle undefined visibleCol', async () => {
        const result = await schema.parseAsync({
          colId: 'Name',
          type: 'Text'
        })

        expect(result.visibleCol).toBeUndefined()
      })
    })

    describe('formula columns', () => {
      it('should accept formula columns', async () => {
        const result = await schema.parseAsync({
          colId: 'FullName',
          type: 'Text',
          isFormula: true,
          formula: '$FirstName + " " + $LastName'
        })

        expect(result.isFormula).toBe(true)
        expect(result.formula).toBe('$FirstName + " " + $LastName')
      })
    })
  })

  describe('createResolvedModifyColumnSchema', () => {
    const schema = createResolvedModifyColumnSchema(mockClient, 'testDoc', 'TestTable')

    describe('partial updates', () => {
      it('should accept empty input (no changes)', async () => {
        const result = await schema.parseAsync({})

        expect(result.type).toBeUndefined()
        expect(result.label).toBeUndefined()
      })

      it('should accept single field update', async () => {
        const result = await schema.parseAsync({
          label: 'New Label'
        })

        expect(result.label).toBe('New Label')
        expect(result.type).toBeUndefined()
      })

      it('should accept type change', async () => {
        const result = await schema.parseAsync({
          type: 'Int'
        })

        expect(result.type).toBe('Int')
      })
    })

    describe('widget options in modify', () => {
      it('should transform choices in modify', async () => {
        const result = await schema.parseAsync({
          choices: ['A', 'B', 'C']
        })

        expect(result.widgetOptions?.choices).toEqual(['L', 'A', 'B', 'C'])
      })

      it('should uppercase currency in modify', async () => {
        const result = await schema.parseAsync({
          currency: 'cad'
        })

        expect(result.widgetOptions?.currency).toBe('CAD')
      })
    })

    describe('visibleCol in modify', () => {
      it('should resolve string visibleCol in modify', async () => {
        const result = await schema.parseAsync({
          type: 'Ref:Products',
          visibleCol: 'ProductName'
        })

        expect(result.visibleCol).toBe(42) // Mock returns 42
      })
    })
  })
})
