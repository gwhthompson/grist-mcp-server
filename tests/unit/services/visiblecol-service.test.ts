/**
 * Unit tests for VisibleColService
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GristClient } from '../../../src/services/grist-client.js'
import {
  VisibleColService,
  type VisibleColSetupParams,
  type VisibleColSetupResult
} from '../../../src/services/visiblecol-service.js'

describe('VisibleColService', () => {
  describe('summarizeResults (static method)', () => {
    it('summarizes all successful results', () => {
      const results: VisibleColSetupResult[] = [
        { success: true, colId: 'Col1', visibleColSet: true, displayFormulaSet: true },
        { success: true, colId: 'Col2', visibleColSet: true, displayFormulaSet: true }
      ]

      const summary = VisibleColService.summarizeResults(results)

      expect(summary.totalColumns).toBe(2)
      expect(summary.successful).toBe(2)
      expect(summary.failed).toBe(0)
      expect(summary.errors).toHaveLength(0)
    })

    it('summarizes mixed results', () => {
      const results: VisibleColSetupResult[] = [
        { success: true, colId: 'Col1', visibleColSet: true, displayFormulaSet: true },
        {
          success: false,
          colId: 'Col2',
          visibleColSet: false,
          displayFormulaSet: false,
          error: 'API error'
        },
        { success: true, colId: 'Col3', visibleColSet: true, displayFormulaSet: true }
      ]

      const summary = VisibleColService.summarizeResults(results)

      expect(summary.totalColumns).toBe(3)
      expect(summary.successful).toBe(2)
      expect(summary.failed).toBe(1)
      expect(summary.errors).toHaveLength(1)
      expect(summary.errors[0]).toEqual({ colId: 'Col2', error: 'API error' })
    })

    it('summarizes all failed results', () => {
      const results: VisibleColSetupResult[] = [
        {
          success: false,
          colId: 'Col1',
          visibleColSet: false,
          displayFormulaSet: false,
          error: 'Error 1'
        },
        {
          success: false,
          colId: 'Col2',
          visibleColSet: true,
          displayFormulaSet: false,
          error: 'Error 2'
        }
      ]

      const summary = VisibleColService.summarizeResults(results)

      expect(summary.totalColumns).toBe(2)
      expect(summary.successful).toBe(0)
      expect(summary.failed).toBe(2)
      expect(summary.errors).toHaveLength(2)
    })

    it('handles empty results', () => {
      const summary = VisibleColService.summarizeResults([])

      expect(summary.totalColumns).toBe(0)
      expect(summary.successful).toBe(0)
      expect(summary.failed).toBe(0)
      expect(summary.errors).toHaveLength(0)
    })

    it('handles failed results without error message', () => {
      const results: VisibleColSetupResult[] = [
        { success: false, colId: 'Col1', visibleColSet: false, displayFormulaSet: false }
      ]

      const summary = VisibleColService.summarizeResults(results)

      expect(summary.failed).toBe(1)
      expect(summary.errors).toHaveLength(0) // No error message, not included in errors array
    })
  })

  describe('setup method', () => {
    let mockClient: {
      post: ReturnType<typeof vi.fn>
      get: ReturnType<typeof vi.fn>
    }
    let service: VisibleColService

    beforeEach(() => {
      mockClient = {
        post: vi.fn(),
        get: vi.fn()
      }
      service = new VisibleColService(mockClient as unknown as GristClient)
    })

    it('successfully sets up visibleCol', async () => {
      // Mock the API calls
      mockClient.post
        // First call: UpdateRecord for visibleCol
        .mockResolvedValueOnce({ retValues: [null] })
        // Third call: SetDisplayFormula
        .mockResolvedValueOnce({ retValues: [null] })

      // get call: columns query to resolve column name
      mockClient.get.mockResolvedValueOnce({
        columns: [{ id: 'Name', fields: { colRef: 5 } }]
      })

      const params: VisibleColSetupParams = {
        docId: 'testDoc123456789012',
        tableId: 'Orders',
        colId: 'Customer',
        colRef: 10,
        visibleCol: 5,
        columnType: 'Ref:Customers'
      }

      const result = await service.setup(params)

      expect(result.success).toBe(true)
      expect(result.colId).toBe('Customer')
      expect(result.visibleColSet).toBe(true)
      expect(result.displayFormulaSet).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('handles invalid column type (no foreign table)', async () => {
      // Mock the updateRecord call to succeed
      mockClient.post.mockResolvedValueOnce({ retValues: [null] })

      const params: VisibleColSetupParams = {
        docId: 'testDoc123456789012',
        tableId: 'Orders',
        colId: 'Customer',
        colRef: 10,
        visibleCol: 5,
        columnType: 'Text' // Not a Ref type
      }

      const result = await service.setup(params)

      expect(result.success).toBe(false)
      expect(result.visibleColSet).toBe(true) // First step succeeded
      expect(result.displayFormulaSet).toBe(false)
      expect(result.error).toContain('Could not extract foreign table')
    })

    it('handles API error during visibleCol update', async () => {
      mockClient.post.mockRejectedValueOnce(new Error('API connection failed'))

      const params: VisibleColSetupParams = {
        docId: 'testDoc123456789012',
        tableId: 'Orders',
        colId: 'Customer',
        colRef: 10,
        visibleCol: 5,
        columnType: 'Ref:Customers'
      }

      const result = await service.setup(params)

      expect(result.success).toBe(false)
      expect(result.visibleColSet).toBe(false)
      expect(result.displayFormulaSet).toBe(false)
      expect(result.error).toBe('API connection failed')
    })

    it('handles API error during display formula setup', async () => {
      mockClient.post
        // First call: UpdateRecord succeeds
        .mockResolvedValueOnce({ retValues: [null] })
        // Second call: SetDisplayFormula fails
        .mockRejectedValueOnce(new Error('Display formula failed'))

      // get call: columns query succeeds
      mockClient.get.mockResolvedValueOnce({
        columns: [{ id: 'Name', fields: { colRef: 5 } }]
      })

      const params: VisibleColSetupParams = {
        docId: 'testDoc123456789012',
        tableId: 'Orders',
        colId: 'Customer',
        colRef: 10,
        visibleCol: 5,
        columnType: 'Ref:Customers'
      }

      const result = await service.setup(params)

      expect(result.success).toBe(false)
      expect(result.visibleColSet).toBe(true) // First step succeeded
      expect(result.displayFormulaSet).toBe(false)
      expect(result.error).toBe('Display formula failed')
    })

    it('handles non-Error thrown objects', async () => {
      mockClient.post.mockRejectedValueOnce('string error')

      const params: VisibleColSetupParams = {
        docId: 'testDoc123456789012',
        tableId: 'Orders',
        colId: 'Customer',
        colRef: 10,
        visibleCol: 5,
        columnType: 'Ref:Customers'
      }

      const result = await service.setup(params)

      expect(result.success).toBe(false)
      expect(result.error).toBe('string error')
    })
  })

  describe('setupBatch method', () => {
    let mockClient: {
      post: ReturnType<typeof vi.fn>
    }
    let service: VisibleColService

    beforeEach(() => {
      mockClient = {
        post: vi.fn()
      }
      service = new VisibleColService(mockClient as unknown as GristClient)
    })

    it('processes multiple columns in parallel', async () => {
      // Mock responses for two columns (3 calls each)
      mockClient.post
        // Column 1: UpdateRecord, SQL query, SetDisplayFormula
        .mockResolvedValueOnce({ retValues: [null] })
        .mockResolvedValueOnce({ records: [{ fields: { colId: 'Name' } }] })
        .mockResolvedValueOnce({ retValues: [null] })
        // Column 2: UpdateRecord, SQL query, SetDisplayFormula
        .mockResolvedValueOnce({ retValues: [null] })
        .mockResolvedValueOnce({ records: [{ fields: { colId: 'Title' } }] })
        .mockResolvedValueOnce({ retValues: [null] })

      const columns: VisibleColSetupParams[] = [
        {
          docId: 'testDoc123456789012',
          tableId: 'Orders',
          colId: 'Customer',
          colRef: 10,
          visibleCol: 5,
          columnType: 'Ref:Customers'
        },
        {
          docId: 'testDoc123456789012',
          tableId: 'Orders',
          colId: 'Product',
          colRef: 11,
          visibleCol: 6,
          columnType: 'Ref:Products'
        }
      ]

      const results = await service.setupBatch(columns)

      expect(results).toHaveLength(2)
      // Note: Due to parallel execution, order might vary
      expect(results.map((r) => r.colId)).toContain('Customer')
      expect(results.map((r) => r.colId)).toContain('Product')
    })

    it('handles empty batch', async () => {
      const results = await service.setupBatch([])

      expect(results).toHaveLength(0)
    })
  })
})
