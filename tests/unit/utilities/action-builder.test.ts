import { describe, expect, it } from 'vitest'
import {
  buildAddColumnAction,
  buildAddTableAction,
  buildBulkAddRecordAction,
  buildBulkRemoveRecordAction,
  buildBulkUpdateRecordAction,
  buildModifyColumnAction,
  buildRemoveColumnAction,
  buildRemoveTableAction,
  buildRenameColumnAction,
  buildRenameTableAction
} from '../../../src/services/action-builder.js'
import { serializeUserAction } from '../../../src/services/grist-client.js'
import { toColId, toRowId, toTableId } from '../../../src/types/advanced.js'

describe('buildAddColumnAction', () => {
  it('builds action with correct structure', () => {
    const action = buildAddColumnAction(toTableId('TestTable'), toColId('Status'), {
      type: 'Choice',
      widgetOptions: { choices: ['Pending', 'Complete'] }
    })

    expect(action.action).toBe('AddColumn')
    expect(action.tableId).toBe('TestTable')
    expect(action.colId).toBe('Status')
    expect(action.colInfo.widgetOptions).toBe('{"choices":["Pending","Complete"]}')
    expect(action.colInfo.widgetOptions).not.toContain("'")
  })

  it('serializes to tuple format correctly', () => {
    const action = buildAddColumnAction(toTableId('TestTable'), toColId('Status'), {
      type: 'Choice',
      widgetOptions: { choices: ['Pending', 'Complete'] }
    })

    const tuple = serializeUserAction(action)
    expect(tuple[0]).toBe('AddColumn')
    expect(tuple[1]).toBe('TestTable')
    expect(tuple[2]).toBe('Status')
  })

  it('handles undefined widgetOptions', () => {
    const action = buildAddColumnAction(toTableId('TestTable'), toColId('Name'), {
      type: 'Text'
    })

    expect(action.colInfo.widgetOptions).toBeUndefined()
  })

  it('preserves already-stringified widgetOptions', () => {
    const jsonString = '{"choices":["A","B"]}'
    const action = buildAddColumnAction(toTableId('TestTable'), toColId('Choice'), {
      type: 'Choice',
      widgetOptions: jsonString
    })

    expect(action.colInfo.widgetOptions).toBe(jsonString)
  })
})

describe('buildModifyColumnAction', () => {
  it('builds action with serialized widgetOptions', () => {
    const action = buildModifyColumnAction(toTableId('TestTable'), toColId('Status'), {
      type: 'Choice',
      widgetOptions: { choices: ['Open', 'Closed'] }
    })

    expect(action.action).toBe('ModifyColumn')
    expect(action.tableId).toBe('TestTable')
    expect(action.colId).toBe('Status')
    expect(action.updates.widgetOptions).toBe('{"choices":["Open","Closed"]}')
    expect(action.updates.widgetOptions).not.toContain("'")
  })

  it('serializes to tuple format correctly', () => {
    const action = buildModifyColumnAction(toTableId('TestTable'), toColId('Status'), {
      type: 'Choice'
    })

    const tuple = serializeUserAction(action)
    expect(tuple[0]).toBe('ModifyColumn')
    expect(tuple[1]).toBe('TestTable')
    expect(tuple[2]).toBe('Status')
  })

  it('throws ValidationError when widgetOptions provided without type', () => {
    expect(() => {
      buildModifyColumnAction(toTableId('TestTable'), toColId('Status'), {
        widgetOptions: { choices: ['Open', 'Closed'] }
      })
    }).toThrow(/Column type must be provided/)
  })

  it('handles empty updates object', () => {
    const action = buildModifyColumnAction(toTableId('TestTable'), toColId('Name'), {})

    expect(action.updates.widgetOptions).toBeUndefined()
  })
})

describe('buildAddTableAction', () => {
  it('builds action with serialized widgetOptions in all columns', () => {
    const action = buildAddTableAction(toTableId('Orders'), [
      {
        colId: 'OrderNumber',
        type: 'Text'
      },
      {
        colId: 'Status',
        type: 'Choice',
        widgetOptions: { choices: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] }
      },
      {
        colId: 'Priority',
        type: 'Choice',
        widgetOptions: { choices: ['Low', 'Medium', 'High'] }
      }
    ])

    expect(action.action).toBe('AddTable')
    expect(action.tableName).toBe('Orders')
    expect(action.columns).toHaveLength(3)

    // First column: no widgetOptions
    // Note: AddTable columns use 'id' (API format), not 'colId' (internal format)
    expect((action.columns[0] as { id: string }).id).toBe('OrderNumber')
    expect(action.columns[0].widgetOptions).toBeUndefined()

    // Second column: Status with choices
    expect((action.columns[1] as { id: string }).id).toBe('Status')
    expect(action.columns[1].widgetOptions).toBe(
      '{"choices":["Pending","Processing","Shipped","Delivered","Cancelled"]}'
    )
    expect(action.columns[1].widgetOptions).not.toContain("'")

    // Third column: Priority with choices
    expect((action.columns[2] as { id: string }).id).toBe('Priority')
    expect(action.columns[2].widgetOptions).toBe('{"choices":["Low","Medium","High"]}')
    expect(action.columns[2].widgetOptions).not.toContain("'")
  })

  it('serializes to tuple format correctly', () => {
    const action = buildAddTableAction(toTableId('Orders'), [{ colId: 'Name', type: 'Text' }])

    const tuple = serializeUserAction(action)
    expect(tuple[0]).toBe('AddTable')
    expect(tuple[1]).toBe('Orders')
  })

  it('handles mixed columns with and without widgetOptions', () => {
    const action = buildAddTableAction(toTableId('Products'), [
      {
        colId: 'Name',
        type: 'Text'
      },
      {
        colId: 'Price',
        type: 'Numeric',
        widgetOptions: { numMode: 'currency', currency: 'USD' }
      },
      {
        colId: 'InStock',
        type: 'Bool'
      }
    ])

    expect(action.columns[0].widgetOptions).toBeUndefined()
    expect(action.columns[1].widgetOptions).toBe('{"numMode":"currency","currency":"USD"}')
    expect(action.columns[2].widgetOptions).toBeUndefined()
  })

  it('handles empty columns array', () => {
    const action = buildAddTableAction(toTableId('EmptyTable'), [])

    expect(action.action).toBe('AddTable')
    expect(action.tableName).toBe('EmptyTable')
    expect(action.columns).toEqual([])
  })
})

describe('buildBulkAddRecordAction', () => {
  it('builds action with correct structure', () => {
    const action = buildBulkAddRecordAction(toTableId('Contacts'), [
      { Name: 'John', Email: 'john@example.com' },
      { Name: 'Jane', Email: 'jane@example.com' }
    ])

    expect(action.action).toBe('BulkAddRecord')
    expect(action.tableId).toBe('Contacts')
    expect(action.rowIds).toEqual([null, null])
    expect(action.columns).toEqual({
      Name: ['John', 'Jane'],
      Email: ['john@example.com', 'jane@example.com']
    })
  })

  it('serializes to tuple format correctly', () => {
    const action = buildBulkAddRecordAction(toTableId('Test'), [{ Name: 'Test' }])

    const tuple = serializeUserAction(action)
    expect(tuple[0]).toBe('BulkAddRecord')
    expect(tuple[1]).toBe('Test')
    expect(tuple[2]).toEqual([null])
    expect(tuple[3]).toEqual({ Name: ['Test'] })
  })
})

describe('buildBulkUpdateRecordAction', () => {
  it('builds action with correct structure', () => {
    const action = buildBulkUpdateRecordAction(toTableId('Contacts'), [toRowId(1), toRowId(2)], {
      Status: 'Active'
    })

    expect(action.action).toBe('BulkUpdateRecord')
    expect(action.tableId).toBe('Contacts')
    expect(action.rowIds).toEqual([1, 2])
    expect(action.columns).toEqual({ Status: ['Active', 'Active'] })
  })

  it('serializes to tuple format correctly', () => {
    const action = buildBulkUpdateRecordAction(toTableId('Test'), [toRowId(1)], { Name: 'Updated' })

    const tuple = serializeUserAction(action)
    expect(tuple[0]).toBe('BulkUpdateRecord')
    expect(tuple[1]).toBe('Test')
  })
})

describe('buildBulkRemoveRecordAction', () => {
  it('builds action with correct structure', () => {
    const action = buildBulkRemoveRecordAction(toTableId('Contacts'), [toRowId(1), toRowId(2)])

    expect(action.action).toBe('BulkRemoveRecord')
    expect(action.tableId).toBe('Contacts')
    expect(action.rowIds).toEqual([1, 2])
  })

  it('serializes to tuple format correctly', () => {
    const action = buildBulkRemoveRecordAction(toTableId('Test'), [toRowId(1)])

    const tuple = serializeUserAction(action)
    expect(tuple[0]).toBe('BulkRemoveRecord')
    expect(tuple[1]).toBe('Test')
    expect(tuple[2]).toEqual([1])
  })
})

describe('buildRemoveColumnAction', () => {
  it('builds action with correct structure', () => {
    const action = buildRemoveColumnAction(toTableId('TestTable'), toColId('OldColumn'))

    expect(action.action).toBe('RemoveColumn')
    expect(action.tableId).toBe('TestTable')
    expect(action.colId).toBe('OldColumn')
  })
})

describe('buildRenameColumnAction', () => {
  it('builds action with correct structure', () => {
    const action = buildRenameColumnAction(
      toTableId('TestTable'),
      toColId('OldName'),
      toColId('NewName')
    )

    expect(action.action).toBe('RenameColumn')
    expect(action.tableId).toBe('TestTable')
    expect(action.oldColId).toBe('OldName')
    expect(action.newColId).toBe('NewName')
  })

  it('serializes to tuple format correctly', () => {
    const action = buildRenameColumnAction(toTableId('Test'), toColId('Old'), toColId('New'))

    const tuple = serializeUserAction(action)
    expect(tuple[0]).toBe('RenameColumn')
    expect(tuple[1]).toBe('Test')
    expect(tuple[2]).toBe('Old')
    expect(tuple[3]).toBe('New')
  })
})

describe('buildRenameTableAction', () => {
  it('builds action with correct structure', () => {
    const action = buildRenameTableAction(toTableId('OldTable'), toTableId('NewTable'))

    expect(action.action).toBe('RenameTable')
    expect(action.tableId).toBe('OldTable')
    expect(action.newTableId).toBe('NewTable')
  })
})

describe('buildRemoveTableAction', () => {
  it('builds action with correct structure', () => {
    const action = buildRemoveTableAction(toTableId('TableToDelete'))

    expect(action.action).toBe('RemoveTable')
    expect(action.tableId).toBe('TableToDelete')
  })
})

describe('integration: prevent Python-style dict strings', () => {
  it('creates proper JSON strings that can be parsed', () => {
    const action = buildAddTableAction(toTableId('Test'), [
      {
        colId: 'Status',
        type: 'Choice',
        widgetOptions: { choices: ['A', 'B', 'C'] }
      }
    ])

    const widgetOptions = action.columns[0].widgetOptions as string

    // Should be parseable as JSON
    expect(() => JSON.parse(widgetOptions)).not.toThrow()

    // Should parse to correct object
    const parsed = JSON.parse(widgetOptions)
    expect(parsed).toEqual({ choices: ['A', 'B', 'C'] })
  })

  it('does NOT create Python-style dict strings', () => {
    const action = buildAddTableAction(toTableId('Test'), [
      {
        colId: 'Status',
        type: 'Choice',
        widgetOptions: { choices: ['Red', 'Blue'] }
      }
    ])

    const widgetOptions = action.columns[0].widgetOptions as string

    // Should NOT contain single quotes (Python dict style)
    expect(widgetOptions).not.toContain("'")
    expect(widgetOptions).not.toMatch(/\{'/)
    expect(widgetOptions).not.toMatch(/':\s*\[/)

    // Should contain double quotes (JSON style)
    expect(widgetOptions).toContain('"choices"')
    expect(widgetOptions).toContain('"Red"')
    expect(widgetOptions).toContain('"Blue"')
  })
})
