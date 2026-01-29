/**
 * UserAction Format Validation Tests
 *
 * CRITICAL: Tests that action builders follow Grist API's UserAction format requirements.
 *
 * Architecture:
 * - Builders return type-safe objects (UserActionObject)
 * - serializeUserAction() converts objects to tuple format for API
 *
 * Correct API format:   [["AddTable", "TableName", [...]]]
 * Incorrect API format: {actions: [["AddTable", "TableName", [...]]]}
 */

import { describe, expect, it } from 'vitest'
import {
  buildAddColumnAction,
  buildAddTableAction,
  buildModifyColumnAction,
  buildRenameColumnAction
} from '../../../src/services/action-builder.js'
import {
  serializeUserAction,
  serializeUserActions
} from '../../../src/services/action-serializer.js'

describe('UserAction Format Compliance (CRITICAL)', () => {
  describe('buildAddTableAction', () => {
    it('should return UserActionObject with correct structure', () => {
      const action = buildAddTableAction('TestTable', [
        { colId: 'Name', type: 'Text' },
        { colId: 'Age', type: 'Int' }
      ])

      // Should be an object with action discriminant
      expect(action.action).toBe('AddTable')
      expect(action.tableName).toBe('TestTable')
      expect(Array.isArray(action.columns)).toBe(true)
      expect(action.columns.length).toBe(2)
    })

    it('should serialize to correct UserAction tuple format', () => {
      const action = buildAddTableAction('Contacts', [{ colId: 'Email', type: 'Text' }])
      const tuple = serializeUserAction(action)

      // Serialized format MUST be an array
      expect(Array.isArray(tuple)).toBe(true)
      expect(tuple[0]).toBe('AddTable')
      expect(tuple[1]).toBe('Contacts')
      expect(Array.isArray(tuple[2])).toBe(true)

      console.log('✓ AddTable serialized format:', tuple)
    })
  })

  describe('buildAddColumnAction', () => {
    it('should return UserActionObject with correct structure', () => {
      const action = buildAddColumnAction('TestTable', 'NewColumn', {
        type: 'Text'
      })

      expect(action.action).toBe('AddColumn')
      expect(action.tableId).toBe('TestTable')
      expect(action.colId).toBe('NewColumn')
      expect(action.colInfo.type).toBe('Text')
    })

    it('should serialize to correct UserAction tuple format', () => {
      const action = buildAddColumnAction('Products', 'Description', {
        type: 'Text',
        label: 'Product Description'
      })
      const tuple = serializeUserAction(action)

      expect(Array.isArray(tuple)).toBe(true)
      expect(tuple[0]).toBe('AddColumn')
      expect(tuple[1]).toBe('Products')
      expect(tuple[2]).toBe('Description')
      expect(typeof tuple[3]).toBe('object')

      console.log('✓ AddColumn (Text) serialized format:', tuple)
    })

    it('should handle reference column with visibleCol', () => {
      const action = buildAddColumnAction('Orders', 'Customer', {
        type: 'Ref:Customers',
        visibleCol: 5
      })
      const tuple = serializeUserAction(action)

      expect(tuple[0]).toBe('AddColumn')
      expect(tuple[1]).toBe('Orders')
      expect(tuple[2]).toBe('Customer')

      const colInfo = tuple[3] as Record<string, unknown>
      expect(colInfo.type).toBe('Ref:Customers')
      expect(colInfo.visibleCol).toBe(5)

      console.log('✓ AddColumn (Ref) serialized format:', tuple)
    })
  })

  describe('buildModifyColumnAction', () => {
    it('should return UserActionObject with correct structure', () => {
      const action = buildModifyColumnAction('TestTable', 'ExistingCol', {
        label: 'Updated Label'
      })

      expect(action.action).toBe('ModifyColumn')
      expect(action.tableId).toBe('TestTable')
      expect(action.colId).toBe('ExistingCol')
      expect(action.updates.label).toBe('Updated Label')
    })

    it('should serialize to correct UserAction tuple format', () => {
      const action = buildModifyColumnAction('Tasks', 'Status', {
        type: 'Choice',
        widgetOptions: JSON.stringify({ choices: ['New', 'Done'] })
      })
      const tuple = serializeUserAction(action)

      expect(Array.isArray(tuple)).toBe(true)
      expect(tuple[0]).toBe('ModifyColumn')
      expect(tuple[1]).toBe('Tasks')
      expect(tuple[2]).toBe('Status')
      expect(typeof tuple[3]).toBe('object')

      console.log('✓ ModifyColumn serialized format:', tuple)
    })
  })

  describe('buildRenameColumnAction', () => {
    it('should return UserActionObject with correct structure', () => {
      const action = buildRenameColumnAction('TestTable', 'OldName', 'NewName')

      expect(action.action).toBe('RenameColumn')
      expect(action.tableId).toBe('TestTable')
      expect(action.oldColId).toBe('OldName')
      expect(action.newColId).toBe('NewName')
    })

    it('should serialize to correct UserAction tuple format', () => {
      const action = buildRenameColumnAction('Contacts', 'EmailAddress', 'Email')
      const tuple = serializeUserAction(action)

      expect(Array.isArray(tuple)).toBe(true)
      expect(tuple[0]).toBe('RenameColumn')
      expect(tuple[1]).toBe('Contacts')
      expect(tuple[2]).toBe('EmailAddress')
      expect(tuple[3]).toBe('Email')

      console.log('✓ RenameColumn serialized format:', tuple)
    })
  })

  describe('Multiple Actions (serializeUserActions)', () => {
    it('should serialize array of UserActionObjects to array of tuples', () => {
      const actions = [
        buildAddColumnAction('TestTable', 'Col1', { type: 'Text' }),
        buildAddColumnAction('TestTable', 'Col2', { type: 'Int' }),
        buildModifyColumnAction('TestTable', 'Col1', { label: 'Updated' })
      ]

      const serialized = serializeUserActions(actions)

      // Should be array of arrays (tuples)
      expect(Array.isArray(serialized)).toBe(true)
      expect(serialized.length).toBe(3)

      // Each serialized action should be an array
      serialized.forEach((tuple, index) => {
        expect(Array.isArray(tuple)).toBe(true)
        expect(typeof tuple[0]).toBe('string')
        console.log(`✓ Action ${index + 1} serialized:`, tuple[0])
      })

      // Should NOT be wrapped in object
      expect(serialized).not.toHaveProperty('actions')
    })
  })

  describe('Format Comparison (Documentation)', () => {
    it('demonstrates correct vs incorrect format', () => {
      const actionObject = buildAddTableAction('Contacts', [{ colId: 'Name', type: 'Text' }])
      const serializedTuple = serializeUserAction(actionObject)

      // ✅ CORRECT: Object format for type safety
      expect(actionObject.action).toBe('AddTable')
      expect(typeof actionObject).toBe('object')

      // ✅ CORRECT: Tuple format for API
      expect(Array.isArray(serializedTuple)).toBe(true)
      expect(serializedTuple[0]).toBe('AddTable')

      // ❌ INCORRECT: Would be wrapped like this (THIS IS WRONG for API!)
      const incorrectFormat = {
        actions: [serializedTuple]
      }

      // Verify serialized format is NOT wrapped
      expect(serializedTuple).not.toHaveProperty('actions')

      console.log('✅ Object format (type-safe):', actionObject)
      console.log('✅ Tuple format (API-ready):', serializedTuple)
      console.log('❌ INCORRECT format (what we prevent):', incorrectFormat)
    })
  })

  describe('API Call Integration Pattern', () => {
    it('should produce correct format for client.post() calls', () => {
      const actionObject = buildAddTableAction('TestTable', [{ colId: 'Name', type: 'Text' }])
      const tuple = serializeUserAction(actionObject)

      // When sent to Grist API, serialize first then wrap in array:
      // const serialized = serializeUserActions(actions)
      // await client.post(`/docs/${docId}/apply`, serialized)
      //
      // NOT like this:
      // await client.post(`/docs/${docId}/apply`, {actions: serialized})

      // Verify serialized tuple is correct format
      expect(Array.isArray(tuple)).toBe(true)
      expect(tuple[0]).toBe('AddTable')

      // This is how it would be sent (wrapped in array for batch operations)
      const apiPayload = [tuple]
      expect(Array.isArray(apiPayload)).toBe(true)
      expect(apiPayload.length).toBe(1)
      expect(Array.isArray(apiPayload[0])).toBe(true)

      console.log('✓ Ready for API: POST /docs/{docId}/apply', apiPayload)
    })

    it('should support batch operations (multiple actions)', () => {
      const action1 = buildAddColumnAction('Table1', 'Col1', { type: 'Text' })
      const action2 = buildAddColumnAction('Table1', 'Col2', { type: 'Int' })

      // Serialize all actions for batch API call
      const batchPayload = serializeUserActions([action1, action2])

      expect(Array.isArray(batchPayload)).toBe(true)
      expect(batchPayload.length).toBe(2)
      expect(batchPayload.every((a) => Array.isArray(a))).toBe(true)

      console.log('✓ Batch payload format:', batchPayload)
    })
  })
})
