/**
 * ApplyUAResult Structure Validation Tests
 *
 * These tests validate the actual structure of Grist API responses from the /apply endpoint
 * against the documented ApplyUAResult interface.
 *
 * Purpose: Empirically verify documentation claims before implementing response validation
 *
 * Tests run against: Docker Grist instance (localhost:8989)
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { ensureGristReady } from '../../helpers/docker.js'
import { createFullTestContext, createTestClient } from '../../helpers/grist-api.js'

/**
 * Interface for ApplyUAResult response structure
 * Used for type-safe testing of API response format
 */
interface ApplyUAResult {
  actionNum: number
  actionHash: string | null
  retValues: unknown[]
  isModification: boolean
}

describe('ApplyUAResult Structure Validation', () => {
  const client = createTestClient()
  let context: Awaited<ReturnType<typeof createFullTestContext>>

  beforeAll(async () => {
    await ensureGristReady()

    context = await createFullTestContext(client, {
      docName: 'ApplyResponse Validation Test',
      tableName: 'TestTable',
      columns: [
        { id: 'Name', type: 'Text' },
        { id: 'Value', type: 'Numeric' }
      ]
    })
  }, 30000)

  // Helper to get docId
  const getDocId = () => context.docId

  describe('Required Fields Validation', () => {
    it('should return all 4 documented fields: actionNum, actionHash, retValues, isModification', async () => {
      const response = await client.post<unknown>(`/docs/${getDocId()}/apply`, [
        ['AddRecord', 'TestTable', null, { Name: 'Test', Value: 42 }]
      ])

      // Validate structure matches ApplyUAResult interface
      const result = response as ApplyUAResult

      expect(response).toHaveProperty('actionNum')
      expect(typeof result.actionNum).toBe('number')

      expect(response).toHaveProperty('actionHash')
      const hash = result.actionHash
      expect(typeof hash === 'string' || hash === null).toBe(true)

      expect(response).toHaveProperty('retValues')
      expect(Array.isArray(result.retValues)).toBe(true)

      expect(response).toHaveProperty('isModification')
      expect(typeof result.isModification).toBe('boolean')

      console.log('✓ ApplyUAResult structure matches documentation:', {
        actionNum: result.actionNum,
        actionHash: result.actionHash?.substring(0, 10)
          ? `${result.actionHash.substring(0, 10)}...`
          : null,
        retValuesLength: result.retValues.length,
        isModification: result.isModification
      })
    })

    it('should return actionNum as positive integer', async () => {
      const response = await client.post<unknown>(`/docs/${getDocId()}/apply`, [
        ['AddRecord', 'TestTable', null, { Name: 'ActionNumTest' }]
      ])

      const result = response as ApplyUAResult
      const actionNum = result.actionNum
      expect(actionNum).toBeGreaterThan(0)
      expect(Number.isInteger(actionNum)).toBe(true)

      console.log('✓ actionNum is positive integer:', actionNum)
    })

    it('should return actionHash as string or null', async () => {
      const response = await client.post<unknown>(`/docs/${getDocId()}/apply`, [
        ['AddRecord', 'TestTable', null, { Name: 'HashTest' }]
      ])

      const result = response as ApplyUAResult
      const hash = result.actionHash

      if (hash !== null) {
        expect(typeof hash).toBe('string')
        expect(hash.length).toBeGreaterThan(0)
        console.log('✓ actionHash is string:', `${hash.substring(0, 20)}...`)
      } else {
        console.log('✓ actionHash is null (edge case)')
      }
    })
  })

  describe('retValues Array Validation', () => {
    it('should have retValues length matching action count', async () => {
      const response = await client.post<unknown>(`/docs/${getDocId()}/apply`, [
        ['AddRecord', 'TestTable', null, { Name: 'A' }],
        ['AddRecord', 'TestTable', null, { Name: 'B' }],
        ['AddRecord', 'TestTable', null, { Name: 'C' }]
      ])

      const result = response as ApplyUAResult
      const retValues = result.retValues
      expect(retValues.length).toBe(3) // One per action

      console.log('✓ retValues length matches action count:', {
        actionsRequested: 3,
        retValuesReceived: retValues.length,
        values: retValues
      })
    })

    it('should return row IDs for AddRecord actions', async () => {
      const response = await client.post<unknown>(`/docs/${getDocId()}/apply`, [
        ['AddRecord', 'TestTable', null, { Name: 'Record1' }]
      ])

      const result = response as ApplyUAResult
      const retValues = result.retValues
      expect(retValues.length).toBe(1)

      const rowId = retValues[0]
      expect(typeof rowId).toBe('number')
      expect(rowId).toBeGreaterThan(0)

      console.log('✓ AddRecord returns row ID:', rowId)
    })

    it('should return array of row IDs for BulkAddRecord', async () => {
      const response = await client.post<unknown>(`/docs/${getDocId()}/apply`, [
        ['BulkAddRecord', 'TestTable', [null, null, null], { Name: ['X', 'Y', 'Z'] }]
      ])

      const result = response as ApplyUAResult
      const retValues = result.retValues
      expect(retValues.length).toBe(1)

      const rowIds = retValues[0]
      expect(Array.isArray(rowIds)).toBe(true)
      expect(rowIds.length).toBe(3)
      expect(rowIds.every((id: unknown) => typeof id === 'number')).toBe(true)

      console.log('✓ BulkAddRecord returns array of row IDs:', rowIds)
    })

    it('should return null for UpdateRecord actions', async () => {
      // First add a record
      const addResponse = await client.post<unknown>(`/docs/${getDocId()}/apply`, [
        ['AddRecord', 'TestTable', null, { Name: 'ToUpdate' }]
      ])
      const addResult = addResponse as ApplyUAResult
      const rowId = addResult.retValues[0]

      // Then update it
      const updateResponse = await client.post<unknown>(`/docs/${getDocId()}/apply`, [
        ['UpdateRecord', 'TestTable', rowId, { Name: 'Updated' }]
      ])

      const updateResult = updateResponse as ApplyUAResult
      const retValues = updateResult.retValues
      expect(retValues.length).toBe(1)
      expect(retValues[0]).toBeNull()

      console.log('✓ UpdateRecord returns null:', retValues)
    })

    it('should return table metadata for AddTable action', async () => {
      const response = await client.post<unknown>(`/docs/${getDocId()}/apply`, [
        ['AddTable', 'NewTable', [{ id: 'Col1' }, { id: 'Col2' }]]
      ])

      const result = response as ApplyUAResult
      const retValues = result.retValues
      expect(retValues.length).toBe(1)

      const tableInfo = retValues[0]
      expect(tableInfo).toHaveProperty('table_id')
      expect(tableInfo).toHaveProperty('id')
      expect(tableInfo).toHaveProperty('columns')

      console.log('✓ AddTable returns metadata:', {
        table_id: tableInfo.table_id,
        id: tableInfo.id,
        columnCount: tableInfo.columns?.length
      })
    })
  })

  describe('isModification Flag Validation', () => {
    it('should return isModification=true for actual modifications', async () => {
      const response = await client.post<unknown>(`/docs/${getDocId()}/apply`, [
        ['AddRecord', 'TestTable', null, { Name: 'ModificationTest' }]
      ])

      const result = response as ApplyUAResult
      expect(result.isModification).toBe(true)

      console.log('✓ isModification=true for AddRecord')
    })

    it('should validate isModification is always boolean', async () => {
      const responses = await Promise.all([
        client.post<unknown>(`/docs/${getDocId()}/apply`, [
          ['AddRecord', 'TestTable', null, { Name: 'Test1' }]
        ]),
        client.post<unknown>(`/docs/${getDocId()}/apply`, [
          ['AddRecord', 'TestTable', null, { Name: 'Test2' }]
        ])
      ])

      for (const response of responses) {
        const result = response as ApplyUAResult
        expect(typeof result.isModification).toBe('boolean')
      }

      console.log('✓ isModification is always boolean across multiple requests')
    })
  })

  describe('Multiple Actions in Single Request', () => {
    it('should handle bundle of different action types', async () => {
      // Add record, then update it, then add another
      const addResponse1 = await client.post<unknown>(`/docs/${getDocId()}/apply`, [
        ['AddRecord', 'TestTable', null, { Name: 'Bundle1' }]
      ])
      const addResult1 = addResponse1 as ApplyUAResult
      const rowId = addResult1.retValues[0]

      const bundleResponse = await client.post<unknown>(`/docs/${getDocId()}/apply`, [
        ['UpdateRecord', 'TestTable', rowId, { Name: 'Updated' }],
        ['AddRecord', 'TestTable', null, { Name: 'Bundle2' }],
        ['AddRecord', 'TestTable', null, { Name: 'Bundle3' }]
      ])

      const bundleResult = bundleResponse as ApplyUAResult
      const retValues = bundleResult.retValues
      expect(retValues.length).toBe(3)
      expect(retValues[0]).toBeNull() // UpdateRecord
      expect(typeof retValues[1]).toBe('number') // AddRecord
      expect(typeof retValues[2]).toBe('number') // AddRecord

      console.log('✓ Bundled actions return correct retValues:', retValues)
    })
  })
})
