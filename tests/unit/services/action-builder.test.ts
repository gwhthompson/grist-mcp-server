/**
 * Unit tests for action-builder.ts - UserAction construction functions
 */

import { describe, expect, it } from 'vitest'
import {
  buildAddColumnAction,
  buildAddHiddenColumnAction,
  buildAddTableAction,
  buildBulkAddRecordAction,
  buildBulkRemoveRecordAction,
  buildBulkUpdateRecordAction,
  buildModifyColumnAction,
  buildRemoveColumnAction,
  buildRemoveTableAction,
  buildRenameColumnAction,
  buildRenameTableAction,
  buildSetDisplayFormulaAction,
  buildUpdateColumnMetadataAction
} from '../../../src/services/action-builder.js'
import type { ColId, RowId, TableId } from '../../../src/types/advanced.js'

describe('buildBulkAddRecordAction', () => {
  it('builds action with single record', () => {
    const action = buildBulkAddRecordAction('Products' as TableId, [
      { Name: 'Widget', Price: 29.99 }
    ])

    expect(action.action).toBe('BulkAddRecord')
    expect(action.tableId).toBe('Products')
    expect(action.rowIds).toEqual([null])
    expect(action.columns).toEqual({
      Name: ['Widget'],
      Price: [29.99]
    })
  })

  it('builds action with multiple records', () => {
    const action = buildBulkAddRecordAction('Products' as TableId, [
      { Name: 'Widget', Price: 29.99 },
      { Name: 'Gadget', Price: 49.99 },
      { Name: 'Gizmo', Price: 19.99 }
    ])

    expect(action.rowIds).toHaveLength(3)
    expect(action.columns.Name).toEqual(['Widget', 'Gadget', 'Gizmo'])
    expect(action.columns.Price).toEqual([29.99, 49.99, 19.99])
  })

  it('handles null values', () => {
    const action = buildBulkAddRecordAction('Products' as TableId, [
      { Name: 'Widget', Description: null }
    ])

    expect(action.columns.Name).toEqual(['Widget'])
    expect(action.columns.Description).toEqual([null])
  })

  it('handles missing values as null', () => {
    const action = buildBulkAddRecordAction('Products' as TableId, [
      { Name: 'Widget', Price: 29.99 },
      { Name: 'Gadget' } // Missing Price
    ])

    expect(action.columns.Price).toEqual([29.99, null])
  })

  it('handles empty records array', () => {
    const action = buildBulkAddRecordAction('Products' as TableId, [])

    expect(action.rowIds).toEqual([])
    expect(action.columns).toEqual({})
  })

  it('handles array values (ChoiceList/RefList)', () => {
    const action = buildBulkAddRecordAction('Tasks' as TableId, [
      { Title: 'Task 1', Tags: ['urgent', 'bug'] },
      { Title: 'Task 2', Tags: ['feature'] }
    ])

    expect(action.columns.Tags).toEqual([['urgent', 'bug'], ['feature']])
  })

  it('handles boolean values', () => {
    const action = buildBulkAddRecordAction('Products' as TableId, [
      { Name: 'Widget', InStock: true },
      { Name: 'Gadget', InStock: false }
    ])

    expect(action.columns.InStock).toEqual([true, false])
  })
})

describe('buildBulkUpdateRecordAction', () => {
  it('builds action with single field update', () => {
    const action = buildBulkUpdateRecordAction('Products' as TableId, [1, 2] as RowId[], {
      Status: 'Active'
    })

    expect(action.action).toBe('BulkUpdateRecord')
    expect(action.tableId).toBe('Products')
    expect(action.rowIds).toEqual([1, 2])
    expect(action.columns).toEqual({
      Status: ['Active', 'Active']
    })
  })

  it('builds action with multiple field updates', () => {
    const action = buildBulkUpdateRecordAction('Products' as TableId, [1, 2, 3] as RowId[], {
      Status: 'Done',
      Priority: 1
    })

    expect(action.columns.Status).toEqual(['Done', 'Done', 'Done'])
    expect(action.columns.Priority).toEqual([1, 1, 1])
  })

  it('handles null update values', () => {
    const action = buildBulkUpdateRecordAction('Products' as TableId, [1] as RowId[], {
      Description: null
    })

    expect(action.columns.Description).toEqual([null])
  })

  it('handles empty updates', () => {
    const action = buildBulkUpdateRecordAction('Products' as TableId, [1, 2] as RowId[], {})

    expect(action.columns).toEqual({})
  })
})

describe('buildBulkRemoveRecordAction', () => {
  it('builds action with single row', () => {
    const action = buildBulkRemoveRecordAction('Products' as TableId, [1] as RowId[])

    expect(action.action).toBe('BulkRemoveRecord')
    expect(action.tableId).toBe('Products')
    expect(action.rowIds).toEqual([1])
  })

  it('builds action with multiple rows', () => {
    const action = buildBulkRemoveRecordAction('Products' as TableId, [1, 2, 3] as RowId[])

    expect(action.rowIds).toEqual([1, 2, 3])
  })

  it('handles empty rowIds array', () => {
    const action = buildBulkRemoveRecordAction('Products' as TableId, [])

    expect(action.rowIds).toEqual([])
  })
})

describe('buildAddColumnAction', () => {
  it('builds action with basic column info', () => {
    const action = buildAddColumnAction('Products' as TableId, 'Name' as ColId, {
      type: 'Text',
      label: 'Product Name'
    })

    expect(action.action).toBe('AddColumn')
    expect(action.tableId).toBe('Products')
    expect(action.colId).toBe('Name')
    expect(action.colInfo.type).toBe('Text')
    expect(action.colInfo.label).toBe('Product Name')
  })

  it('does not require type (uses Text internally for validation)', () => {
    // Type is defaulted to 'Text' internally for widget options validation
    // but the colInfo preserves what was passed in
    const action = buildAddColumnAction('Products' as TableId, 'Name' as ColId, {
      label: 'Name'
    })

    expect(action.action).toBe('AddColumn')
    expect(action.colInfo.label).toBe('Name')
    // Type is undefined in output when not provided - Grist API defaults it
  })

  it('throws for visibleCol without type', () => {
    expect(() =>
      buildAddColumnAction('Products' as TableId, 'Owner' as ColId, {
        visibleCol: 42,
        label: 'Owner'
      })
    ).toThrow('has visibleCol but no type specified')
  })

  it('throws for visibleCol with non-reference type', () => {
    expect(() =>
      buildAddColumnAction('Products' as TableId, 'Name' as ColId, {
        type: 'Text',
        visibleCol: 42
      })
    ).toThrow('is not a Ref or RefList type')
  })

  it('throws for visibleCol that is not numeric', () => {
    expect(() =>
      buildAddColumnAction('Products' as TableId, 'Owner' as ColId, {
        type: 'Ref:People',
        visibleCol: 'Email' as unknown as number // Should be resolved first
      })
    ).toThrow('must be a numeric column reference')
  })

  it('accepts numeric visibleCol with Ref type', () => {
    const action = buildAddColumnAction('Products' as TableId, 'Owner' as ColId, {
      type: 'Ref:People',
      visibleCol: 42
    })

    expect(action.colInfo.type).toBe('Ref:People')
    expect(action.colInfo.visibleCol).toBe(42)
  })

  it('accepts numeric visibleCol with RefList type', () => {
    const action = buildAddColumnAction('Tasks' as TableId, 'Assignees' as ColId, {
      type: 'RefList:People',
      visibleCol: 42
    })

    expect(action.colInfo.type).toBe('RefList:People')
    expect(action.colInfo.visibleCol).toBe(42)
  })

  it('throws when visibleCol is nested in widgetOptions', () => {
    expect(() =>
      buildAddColumnAction('Products' as TableId, 'Owner' as ColId, {
        type: 'Ref:People',
        widgetOptions: { visibleCol: 42 }
      })
    ).toThrow('visibleCol must be set at the operation level')
  })

  it('throws for non-object colInfo', () => {
    expect(() =>
      buildAddColumnAction(
        'Products' as TableId,
        'Name' as ColId,
        'invalid' as unknown as Record<string, unknown>
      )
    ).toThrow('Column info must be an object')
  })
})

describe('buildModifyColumnAction', () => {
  it('builds action with basic updates', () => {
    const action = buildModifyColumnAction('Products' as TableId, 'Name' as ColId, {
      label: 'Updated Name'
    })

    expect(action.action).toBe('ModifyColumn')
    expect(action.tableId).toBe('Products')
    expect(action.colId).toBe('Name')
    expect(action.updates.label).toBe('Updated Name')
  })

  it('validates visibleCol with non-reference type', () => {
    expect(() =>
      buildModifyColumnAction('Products' as TableId, 'Name' as ColId, {
        type: 'Text',
        visibleCol: 42
      })
    ).toThrow('is not a Ref or RefList type')
  })

  it('validates visibleCol is numeric', () => {
    expect(() =>
      buildModifyColumnAction('Products' as TableId, 'Owner' as ColId, {
        visibleCol: 'Email' as unknown as number
      })
    ).toThrow('must be a numeric column reference')
  })

  it('accepts valid visibleCol update', () => {
    const action = buildModifyColumnAction('Products' as TableId, 'Owner' as ColId, {
      type: 'Ref:People',
      visibleCol: 42
    })

    expect(action.updates.visibleCol).toBe(42)
  })

  it('throws for non-object updates', () => {
    expect(() =>
      buildModifyColumnAction(
        'Products' as TableId,
        'Name' as ColId,
        'invalid' as unknown as Record<string, unknown>
      )
    ).toThrow('Column updates must be an object')
  })
})

describe('buildRemoveColumnAction', () => {
  it('builds action correctly', () => {
    const action = buildRemoveColumnAction('Products' as TableId, 'OldColumn' as ColId)

    expect(action.action).toBe('RemoveColumn')
    expect(action.tableId).toBe('Products')
    expect(action.colId).toBe('OldColumn')
  })
})

describe('buildRenameColumnAction', () => {
  it('builds action correctly', () => {
    const action = buildRenameColumnAction(
      'Products' as TableId,
      'OldName' as ColId,
      'NewName' as ColId
    )

    expect(action.action).toBe('RenameColumn')
    expect(action.tableId).toBe('Products')
    expect(action.oldColId).toBe('OldName')
    expect(action.newColId).toBe('NewName')
  })
})

describe('buildAddTableAction', () => {
  it('builds action with columns', () => {
    const action = buildAddTableAction('Products' as TableId, [
      { colId: 'Name' as ColId, type: 'Text', label: 'Product Name' },
      { colId: 'Price' as ColId, type: 'Numeric', label: 'Price' }
    ])

    expect(action.action).toBe('AddTable')
    expect(action.tableName).toBe('Products')
    expect(action.columns).toHaveLength(2)
    expect(action.columns[0].id).toBe('Name') // Note: colId becomes id
    expect(action.columns[0].type).toBe('Text')
    expect(action.columns[1].id).toBe('Price')
    expect(action.columns[1].type).toBe('Numeric')
  })

  it('defaults column type to Text', () => {
    const action = buildAddTableAction('Products' as TableId, [
      { colId: 'Name' as ColId, label: 'Name' }
    ])

    expect(action.columns[0].type).toBe('Text')
  })

  it('handles empty columns array', () => {
    const action = buildAddTableAction('Products' as TableId, [])

    expect(action.columns).toEqual([])
  })
})

describe('buildRenameTableAction', () => {
  it('builds action correctly', () => {
    const action = buildRenameTableAction('OldTable' as TableId, 'NewTable' as TableId)

    expect(action.action).toBe('RenameTable')
    expect(action.tableId).toBe('OldTable')
    expect(action.newTableId).toBe('NewTable')
  })
})

describe('buildRemoveTableAction', () => {
  it('builds action correctly', () => {
    const action = buildRemoveTableAction('Products' as TableId)

    expect(action.action).toBe('RemoveTable')
    expect(action.tableId).toBe('Products')
  })
})

describe('buildAddHiddenColumnAction', () => {
  it('builds action with formula', () => {
    const action = buildAddHiddenColumnAction(
      'Products' as TableId,
      'gristHelper_Display',
      '$Name + " - " + $Category'
    )

    expect(action.action).toBe('AddHiddenColumn')
    expect(action.tableId).toBe('Products')
    expect(action.colId).toBe('gristHelper_Display')
    expect(action.colInfo.type).toBe('Any')
    expect(action.colInfo.isFormula).toBe(true)
    expect(action.colInfo.formula).toBe('$Name + " - " + $Category')
  })
})

describe('buildUpdateColumnMetadataAction', () => {
  it('builds action correctly', () => {
    const action = buildUpdateColumnMetadataAction(42, { visibleCol: 5, displayCol: 10 })

    expect(action.action).toBe('UpdateMetadata')
    expect(action.metaTableId).toBe('_grist_Tables_column')
    expect(action.rowId).toBe(42)
    expect(action.updates).toEqual({ visibleCol: 5, displayCol: 10 })
  })
})

describe('buildSetDisplayFormulaAction', () => {
  it('builds action with colId', () => {
    const action = buildSetDisplayFormulaAction(
      'Products' as TableId,
      'DisplayName',
      null,
      '$Name + " - " + $Price'
    )

    expect(action.action).toBe('SetDisplayFormula')
    expect(action.tableId).toBe('Products')
    expect(action.colId).toBe('DisplayName')
    expect(action.fieldRef).toBe(null)
    expect(action.formula).toBe('$Name + " - " + $Price')
  })

  it('builds action with fieldRef', () => {
    const action = buildSetDisplayFormulaAction('Products' as TableId, null, 123, '$Name')

    expect(action.colId).toBe(null)
    expect(action.fieldRef).toBe(123)
  })
})
