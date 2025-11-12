/**
 * Unit tests for action-builder serialization
 *
 * Tests the serializeWidgetOptions helper and ensures proper JSON serialization
 * across all action builders to prevent Python-style dict strings in Grist.
 */

import { describe, expect, it } from 'vitest'
import {
  buildAddColumnAction,
  buildAddTableAction,
  buildModifyColumnAction,
  serializeWidgetOptions
} from '../../src/services/action-builder.js'
import { toColId, toTableId } from '../../src/types/advanced.js'

describe('serializeWidgetOptions', () => {
  describe('handles undefined and null values', () => {
    it('returns undefined for undefined input', () => {
      expect(serializeWidgetOptions(undefined)).toBeUndefined()
    })

    it('returns undefined for null input', () => {
      expect(serializeWidgetOptions(null)).toBeUndefined()
    })
  })

  describe('serializes objects to JSON strings', () => {
    it('serializes simple object with choices', () => {
      const input = { choices: ['Red', 'Blue', 'Green'] }
      const result = serializeWidgetOptions(input)
      expect(result).toBe('{"choices":["Red","Blue","Green"]}')
      expect(result).not.toContain("'") // No single quotes
    })

    it('serializes numeric widget options', () => {
      const input = { numMode: 'currency', currency: 'USD', decimals: 2 }
      const result = serializeWidgetOptions(input)
      expect(result).toBe('{"numMode":"currency","currency":"USD","decimals":2}')
    })

    it('serializes boolean widget options', () => {
      const input = { widget: 'Switch' }
      const result = serializeWidgetOptions(input)
      expect(result).toBe('{"widget":"Switch"}')
    })

    it('serializes nested objects', () => {
      const input = {
        alignment: 'center',
        style: { bold: true, color: '#FF0000' }
      }
      const result = serializeWidgetOptions(input)
      expect(result).toBe('{"alignment":"center","style":{"bold":true,"color":"#FF0000"}}')
    })

    it('serializes empty object', () => {
      const input = {}
      const result = serializeWidgetOptions(input)
      expect(result).toBe('{}')
    })
  })

  describe('handles already-stringified values', () => {
    it('returns string as-is if already JSON', () => {
      const input = '{"choices":["A","B","C"]}'
      const result = serializeWidgetOptions(input)
      expect(result).toBe(input)
    })

    it('returns string as-is even with single quotes (for backwards compatibility)', () => {
      const input = "{'choices':['A','B','C']}"
      const result = serializeWidgetOptions(input)
      // We don't convert - that's the parser's job on read
      expect(result).toBe(input)
    })
  })
})

describe('buildAddColumnAction', () => {
  it('serializes widgetOptions in column info', () => {
    const action = buildAddColumnAction(toTableId('TestTable'), toColId('Status'), {
      type: 'Choice',
      widgetOptions: { choices: ['Pending', 'Complete'] }
    })

    expect(action[0]).toBe('AddColumn')
    expect(action[1]).toBe('TestTable')
    expect(action[2]).toBe('Status')

    const colInfo = action[3]
    expect(colInfo.widgetOptions).toBe('{"choices":["Pending","Complete"]}')
    expect(colInfo.widgetOptions).not.toContain("'")
  })

  it('handles undefined widgetOptions', () => {
    const action = buildAddColumnAction(toTableId('TestTable'), toColId('Name'), {
      type: 'Text'
    })

    const colInfo = action[3]
    expect(colInfo.widgetOptions).toBeUndefined()
  })

  it('preserves already-stringified widgetOptions', () => {
    const jsonString = '{"choices":["A","B"]}'
    const action = buildAddColumnAction(toTableId('TestTable'), toColId('Choice'), {
      type: 'Choice',
      widgetOptions: jsonString
    })

    const colInfo = action[3]
    expect(colInfo.widgetOptions).toBe(jsonString)
  })
})

describe('buildModifyColumnAction', () => {
  it('serializes widgetOptions in updates', () => {
    const action = buildModifyColumnAction(toTableId('TestTable'), toColId('Status'), {
      type: 'Choice', // Type is now required when widgetOptions is provided
      widgetOptions: { choices: ['Open', 'Closed'] }
    })

    expect(action[0]).toBe('ModifyColumn')
    expect(action[1]).toBe('TestTable')
    expect(action[2]).toBe('Status')

    const updates = action[3]
    expect(updates.widgetOptions).toBe('{"choices":["Open","Closed"]}')
    expect(updates.widgetOptions).not.toContain("'")
  })

  it('throws ValidationError when widgetOptions provided without type', () => {
    expect(() => {
      buildModifyColumnAction(toTableId('TestTable'), toColId('Status'), {
        widgetOptions: { choices: ['Open', 'Closed'] }
        // type is missing - should throw
      })
    }).toThrow(/Column type must be provided/)
  })

  it('handles empty updates object', () => {
    const action = buildModifyColumnAction(toTableId('TestTable'), toColId('Name'), {})

    const updates = action[3]
    expect(updates.widgetOptions).toBeUndefined()
  })
})

describe('buildAddTableAction', () => {
  it('serializes widgetOptions in all columns', () => {
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

    expect(action[0]).toBe('AddTable')
    expect(action[1]).toBe('Orders')

    const columns = action[2] as unknown[]
    expect(columns).toHaveLength(3)

    // First column: no widgetOptions
    expect(columns[0].id).toBe('OrderNumber')
    expect(columns[0].widgetOptions).toBeUndefined()

    // Second column: Status with choices
    expect(columns[1].id).toBe('Status')
    expect(columns[1].widgetOptions).toBe(
      '{"choices":["Pending","Processing","Shipped","Delivered","Cancelled"]}'
    )
    expect(columns[1].widgetOptions).not.toContain("'") // Critical: no single quotes

    // Third column: Priority with choices
    expect(columns[2].id).toBe('Priority')
    expect(columns[2].widgetOptions).toBe('{"choices":["Low","Medium","High"]}')
    expect(columns[2].widgetOptions).not.toContain("'")
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

    const columns = action[2] as unknown[]

    expect(columns[0].widgetOptions).toBeUndefined()
    expect(columns[1].widgetOptions).toBe('{"numMode":"currency","currency":"USD"}')
    expect(columns[2].widgetOptions).toBeUndefined()
  })

  it('transforms colId to id correctly', () => {
    const action = buildAddTableAction(toTableId('Test'), [
      {
        colId: 'MyColumn',
        type: 'Text',
        widgetOptions: { alignment: 'center' }
      }
    ])

    const columns = action[2] as unknown[]
    expect(columns[0].id).toBe('MyColumn')
    expect(columns[0].colId).toBeUndefined() // colId should be removed
    expect(columns[0].widgetOptions).toBe('{"alignment":"center"}')
  })

  it('handles empty columns array', () => {
    const action = buildAddTableAction(toTableId('EmptyTable'), [])

    expect(action[0]).toBe('AddTable')
    expect(action[1]).toBe('EmptyTable')
    expect(action[2]).toEqual([])
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

    const columns = action[2] as unknown[]
    const widgetOptions = columns[0].widgetOptions

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

    const columns = action[2] as unknown[]
    const widgetOptions = columns[0].widgetOptions

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
