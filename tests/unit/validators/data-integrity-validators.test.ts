/**
 * Unit Tests for Data Integrity Validators
 *
 * Tests validation of Ref, RefList, Choice, and ChoiceList column values
 * against live Grist data (row IDs and allowed choices).
 */

import { describe, expect, it, vi } from 'vitest'
import {
  InvalidChoiceError,
  InvalidChoiceListError,
  InvalidReferenceError,
  InvalidRefListError,
  RowNotFoundError
} from '../../../src/errors/DataIntegrityError.js'
import type { CellValue } from '../../../src/schemas/api-responses.js'
import type { ColumnMetadata, SchemaCache } from '../../../src/services/schema-cache.js'
import { toTableId } from '../../../src/types/advanced.js'
import {
  getRefTableName,
  validateChoiceListValue,
  validateChoiceValue,
  validateRecordDataIntegrity,
  validateRecordsDataIntegrity,
  validateRefListValue,
  validateRefValue,
  validateRowIdsExist,
  validateUpsertRecordsDataIntegrity
} from '../../../src/validators/data-integrity-validators.js'

// =============================================================================
// Test Helpers
// =============================================================================

function createColumn(
  id: string,
  type: string,
  widgetOptions?: string,
  label?: string
): ColumnMetadata {
  return {
    id,
    fields: {
      type,
      isFormula: false,
      formula: '',
      label: label ?? id,
      widgetOptions: widgetOptions ?? ''
    }
  }
}

function createMockSchemaCache(rowIdsByTable: Map<string, Set<number>>): SchemaCache {
  return {
    getRowIds: vi.fn(async (_docId: string, tableId: string) => {
      const tableName = tableId.toString()
      return rowIdsByTable.get(tableName) ?? new Set<number>()
    })
  } as unknown as SchemaCache
}

// =============================================================================
// getRefTableName
// =============================================================================

describe('getRefTableName', () => {
  it('extracts table name from Ref type', () => {
    expect(getRefTableName('Ref:Customers')).toBe('Customers')
  })

  it('extracts table name from RefList type', () => {
    expect(getRefTableName('RefList:Orders')).toBe('Orders')
  })

  it('handles table names with underscores', () => {
    expect(getRefTableName('Ref:Order_Items')).toBe('Order_Items')
  })

  it('handles table names with numbers', () => {
    expect(getRefTableName('RefList:Table123')).toBe('Table123')
  })

  it('returns null for non-Ref types', () => {
    expect(getRefTableName('Text')).toBeNull()
    expect(getRefTableName('Int')).toBeNull()
    expect(getRefTableName('Choice')).toBeNull()
  })

  it('returns null for malformed Ref types', () => {
    expect(getRefTableName('Ref')).toBeNull()
    expect(getRefTableName('Ref:')).toBeNull()
    expect(getRefTableName('RefList')).toBeNull()
  })

  it('extracts from types with complex table names', () => {
    expect(getRefTableName('Ref:My_Complex_Table_123')).toBe('My_Complex_Table_123')
  })
})

// =============================================================================
// validateRefValue - Success Cases
// =============================================================================

describe('validateRefValue - Success Cases', () => {
  const schemaCache = createMockSchemaCache(new Map([['Customers', new Set([1, 2, 3, 10, 25])]]))

  it('accepts valid row ID', async () => {
    await expect(
      validateRefValue(2, 'CustomerId', 'Customers', toTableId('Orders'), 'docId', schemaCache)
    ).resolves.not.toThrow()
  })

  it('accepts zero as empty reference', async () => {
    await expect(
      validateRefValue(0, 'CustomerId', 'Customers', toTableId('Orders'), 'docId', schemaCache)
    ).resolves.not.toThrow()
  })

  it('accepts all valid row IDs', async () => {
    for (const rowId of [1, 2, 3, 10, 25]) {
      await expect(
        validateRefValue(
          rowId,
          'CustomerId',
          'Customers',
          toTableId('Orders'),
          'docId',
          schemaCache
        )
      ).resolves.not.toThrow()
    }
  })
})

// =============================================================================
// validateRefValue - Error Cases
// =============================================================================

describe('validateRefValue - Error Cases', () => {
  const schemaCache = createMockSchemaCache(new Map([['Customers', new Set([1, 2, 3])]]))

  it('throws for non-existent row ID', async () => {
    await expect(
      validateRefValue(999, 'CustomerId', 'Customers', toTableId('Orders'), 'docId', schemaCache)
    ).rejects.toThrow(InvalidReferenceError)
  })

  it('error includes column and table info', async () => {
    try {
      await validateRefValue(
        999,
        'CustomerId',
        'Customers',
        toTableId('Orders'),
        'docId',
        schemaCache
      )
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidReferenceError)
      expect((error as InvalidReferenceError).columnId).toBe('CustomerId')
      expect((error as InvalidReferenceError).value).toBe(999)
      expect((error as InvalidReferenceError).refTableId).toBe('Customers')
      expect((error as InvalidReferenceError).tableId).toBe('Orders')
    }
  })

  it('includes valid IDs when count is small', async () => {
    try {
      await validateRefValue(
        999,
        'CustomerId',
        'Customers',
        toTableId('Orders'),
        'docId',
        schemaCache
      )
    } catch (error) {
      expect((error as InvalidReferenceError).validRowIds).toEqual([1, 2, 3])
    }
  })

  it('omits valid IDs when count is large', async () => {
    const largeSchemaCache = createMockSchemaCache(
      new Map([['Customers', new Set(Array.from({ length: 150 }, (_, i) => i + 1))]])
    )

    try {
      await validateRefValue(
        999,
        'CustomerId',
        'Customers',
        toTableId('Orders'),
        'docId',
        largeSchemaCache
      )
    } catch (error) {
      expect((error as InvalidReferenceError).validRowIds).toBeUndefined()
    }
  })
})

// =============================================================================
// validateRefListValue - Success Cases
// =============================================================================

describe('validateRefListValue - Success Cases', () => {
  const schemaCache = createMockSchemaCache(new Map([['Orders', new Set([10, 20, 30, 40])]]))

  it('accepts valid row IDs', async () => {
    await expect(
      validateRefListValue(
        [10, 20],
        'OrderIds',
        'Orders',
        toTableId('Customers'),
        'docId',
        schemaCache
      )
    ).resolves.not.toThrow()
  })

  it('accepts empty array', async () => {
    await expect(
      validateRefListValue([], 'OrderIds', 'Orders', toTableId('Customers'), 'docId', schemaCache)
    ).resolves.not.toThrow()
  })

  it('accepts array with zeros (empty refs)', async () => {
    await expect(
      validateRefListValue(
        [0, 0, 0],
        'OrderIds',
        'Orders',
        toTableId('Customers'),
        'docId',
        schemaCache
      )
    ).resolves.not.toThrow()
  })

  it('accepts mixed valid IDs and zeros', async () => {
    await expect(
      validateRefListValue(
        [10, 0, 20, 0],
        'OrderIds',
        'Orders',
        toTableId('Customers'),
        'docId',
        schemaCache
      )
    ).resolves.not.toThrow()
  })

  it('accepts all valid row IDs', async () => {
    await expect(
      validateRefListValue(
        [10, 20, 30, 40],
        'OrderIds',
        'Orders',
        toTableId('Customers'),
        'docId',
        schemaCache
      )
    ).resolves.not.toThrow()
  })
})

// =============================================================================
// validateRefListValue - Error Cases
// =============================================================================

describe('validateRefListValue - Error Cases', () => {
  const schemaCache = createMockSchemaCache(new Map([['Orders', new Set([10, 20, 30])]]))

  it('throws for invalid row IDs', async () => {
    await expect(
      validateRefListValue(
        [10, 999],
        'OrderIds',
        'Orders',
        toTableId('Customers'),
        'docId',
        schemaCache
      )
    ).rejects.toThrow(InvalidRefListError)
  })

  it('error includes all invalid IDs', async () => {
    try {
      await validateRefListValue(
        [10, 99, 20, 88],
        'OrderIds',
        'Orders',
        toTableId('Customers'),
        'docId',
        schemaCache
      )
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidRefListError)
      expect((error as InvalidRefListError).invalidValues).toEqual([99, 88])
      expect((error as InvalidRefListError).columnId).toBe('OrderIds')
      expect((error as InvalidRefListError).refTableId).toBe('Orders')
    }
  })

  it('ignores zeros when checking validity', async () => {
    // Only 99 is invalid, 0s are ignored
    try {
      await validateRefListValue(
        [10, 0, 99, 0],
        'OrderIds',
        'Orders',
        toTableId('Customers'),
        'docId',
        schemaCache
      )
    } catch (error) {
      expect((error as InvalidRefListError).invalidValues).toEqual([99])
    }
  })
})

// =============================================================================
// validateChoiceValue - Success Cases
// =============================================================================

describe('validateChoiceValue - Success Cases', () => {
  const allowedChoices = ['Active', 'Inactive', 'Pending']

  it('accepts valid choice', () => {
    expect(() =>
      validateChoiceValue('Active', 'Status', allowedChoices, toTableId('Users'))
    ).not.toThrow()
  })

  it('accepts all allowed choices', () => {
    for (const choice of allowedChoices) {
      expect(() =>
        validateChoiceValue(choice, 'Status', allowedChoices, toTableId('Users'))
      ).not.toThrow()
    }
  })

  it('accepts empty string', () => {
    expect(() =>
      validateChoiceValue('', 'Status', allowedChoices, toTableId('Users'))
    ).not.toThrow()
  })
})

// =============================================================================
// validateChoiceValue - Error Cases
// =============================================================================

describe('validateChoiceValue - Error Cases', () => {
  const allowedChoices = ['Red', 'Green', 'Blue']

  it('throws for invalid choice', () => {
    expect(() =>
      validateChoiceValue('Yellow', 'Color', allowedChoices, toTableId('Items'))
    ).toThrow(InvalidChoiceError)
  })

  it('error includes value and allowed choices', () => {
    try {
      validateChoiceValue('Purple', 'Color', allowedChoices, toTableId('Items'))
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidChoiceError)
      expect((error as InvalidChoiceError).columnId).toBe('Color')
      expect((error as InvalidChoiceError).value).toBe('Purple')
      expect((error as InvalidChoiceError).allowedChoices).toEqual(allowedChoices)
    }
  })

  it('is case-sensitive', () => {
    expect(() => validateChoiceValue('red', 'Color', allowedChoices, toTableId('Items'))).toThrow(
      InvalidChoiceError
    )
  })
})

// =============================================================================
// validateChoiceListValue - Success Cases
// =============================================================================

describe('validateChoiceListValue - Success Cases', () => {
  const allowedChoices = ['tag1', 'tag2', 'tag3', 'tag4']

  it('accepts valid choices', () => {
    expect(() =>
      validateChoiceListValue(['tag1', 'tag2'], 'Tags', allowedChoices, toTableId('Posts'))
    ).not.toThrow()
  })

  it('accepts empty array', () => {
    expect(() =>
      validateChoiceListValue([], 'Tags', allowedChoices, toTableId('Posts'))
    ).not.toThrow()
  })

  it('accepts array with empty strings', () => {
    expect(() =>
      validateChoiceListValue(['', '', ''], 'Tags', allowedChoices, toTableId('Posts'))
    ).not.toThrow()
  })

  it('accepts mixed valid choices and empty strings', () => {
    expect(() =>
      validateChoiceListValue(['tag1', '', 'tag2'], 'Tags', allowedChoices, toTableId('Posts'))
    ).not.toThrow()
  })

  it('accepts single choice', () => {
    expect(() =>
      validateChoiceListValue(['tag3'], 'Tags', allowedChoices, toTableId('Posts'))
    ).not.toThrow()
  })

  it('accepts all allowed choices', () => {
    expect(() =>
      validateChoiceListValue(allowedChoices, 'Tags', allowedChoices, toTableId('Posts'))
    ).not.toThrow()
  })
})

// =============================================================================
// validateChoiceListValue - Error Cases
// =============================================================================

describe('validateChoiceListValue - Error Cases', () => {
  const allowedChoices = ['small', 'medium', 'large']

  it('throws for invalid choices', () => {
    expect(() =>
      validateChoiceListValue(['small', 'xlarge'], 'Size', allowedChoices, toTableId('Products'))
    ).toThrow(InvalidChoiceListError)
  })

  it('error includes all invalid values', () => {
    try {
      validateChoiceListValue(
        ['tiny', 'small', 'huge'],
        'Size',
        allowedChoices,
        toTableId('Products')
      )
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidChoiceListError)
      expect((error as InvalidChoiceListError).invalidValues).toEqual(['tiny', 'huge'])
      expect((error as InvalidChoiceListError).columnId).toBe('Size')
      expect((error as InvalidChoiceListError).allowedChoices).toEqual(allowedChoices)
    }
  })

  it('ignores empty strings when checking validity', () => {
    try {
      validateChoiceListValue(['', 'invalid', ''], 'Size', allowedChoices, toTableId('Products'))
    } catch (error) {
      expect((error as InvalidChoiceListError).invalidValues).toEqual(['invalid'])
    }
  })
})

// =============================================================================
// validateRowIdsExist - Success Cases
// =============================================================================

describe('validateRowIdsExist - Success Cases', () => {
  const schemaCache = createMockSchemaCache(new Map([['Users', new Set([1, 5, 10, 15, 20])]]))

  it('accepts valid row IDs', async () => {
    await expect(
      validateRowIdsExist([1, 5, 10], toTableId('Users'), 'docId', schemaCache)
    ).resolves.not.toThrow()
  })

  it('accepts empty array', async () => {
    await expect(
      validateRowIdsExist([], toTableId('Users'), 'docId', schemaCache)
    ).resolves.not.toThrow()
  })

  it('accepts single row ID', async () => {
    await expect(
      validateRowIdsExist([5], toTableId('Users'), 'docId', schemaCache)
    ).resolves.not.toThrow()
  })

  it('accepts all valid row IDs', async () => {
    await expect(
      validateRowIdsExist([1, 5, 10, 15, 20], toTableId('Users'), 'docId', schemaCache)
    ).resolves.not.toThrow()
  })
})

// =============================================================================
// validateRowIdsExist - Error Cases
// =============================================================================

describe('validateRowIdsExist - Error Cases', () => {
  const schemaCache = createMockSchemaCache(new Map([['Users', new Set([1, 2, 3])]]))

  it('throws for invalid row IDs', async () => {
    await expect(
      validateRowIdsExist([1, 99], toTableId('Users'), 'docId', schemaCache)
    ).rejects.toThrow(RowNotFoundError)
  })

  it('error includes all invalid row IDs', async () => {
    try {
      await validateRowIdsExist([1, 99, 88], toTableId('Users'), 'docId', schemaCache)
    } catch (error) {
      expect(error).toBeInstanceOf(RowNotFoundError)
      expect((error as RowNotFoundError).rowIds).toEqual([99, 88])
      expect((error as RowNotFoundError).tableId).toBe('Users')
    }
  })

  it('throws when all row IDs are invalid', async () => {
    await expect(
      validateRowIdsExist([99, 88, 77], toTableId('Users'), 'docId', schemaCache)
    ).rejects.toThrow(RowNotFoundError)
  })
})

// =============================================================================
// validateRecordDataIntegrity - Ref Validation
// =============================================================================

describe('validateRecordDataIntegrity - Ref Validation', () => {
  const columns: ColumnMetadata[] = [
    createColumn('CustomerId', 'Ref:Customers'),
    createColumn('Name', 'Text')
  ]

  const schemaCache = createMockSchemaCache(new Map([['Customers', new Set([1, 2, 3])]]))

  it('validates valid Ref value', async () => {
    const record: Record<string, CellValue> = {
      CustomerId: 2,
      Name: 'Order 1'
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Orders'),
      'docId',
      schemaCache
    )

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('validates zero as empty Ref', async () => {
    const record: Record<string, CellValue> = {
      CustomerId: 0
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Orders'),
      'docId',
      schemaCache
    )

    expect(result.valid).toBe(true)
  })

  it('reports error for invalid Ref value', async () => {
    const record: Record<string, CellValue> = {
      CustomerId: 999
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Orders'),
      'docId',
      schemaCache
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toBeInstanceOf(InvalidReferenceError)
  })

  it('skips validation for null Ref value', async () => {
    const record: Record<string, CellValue> = {
      CustomerId: null
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Orders'),
      'docId',
      schemaCache
    )

    expect(result.valid).toBe(true)
  })
})

// =============================================================================
// validateRecordDataIntegrity - RefList Validation
// =============================================================================

describe('validateRecordDataIntegrity - RefList Validation', () => {
  const columns: ColumnMetadata[] = [createColumn('OrderIds', 'RefList:Orders')]

  const schemaCache = createMockSchemaCache(new Map([['Orders', new Set([10, 20, 30])]]))

  it('validates valid RefList (user format)', async () => {
    const record: Record<string, CellValue> = {
      OrderIds: [10, 20]
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Customers'),
      'docId',
      schemaCache
    )

    expect(result.valid).toBe(true)
  })

  it('validates valid RefList (API format)', async () => {
    const record: Record<string, CellValue> = {
      OrderIds: ['L', 10, 20]
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Customers'),
      'docId',
      schemaCache
    )

    expect(result.valid).toBe(true)
  })

  it('reports error for invalid RefList values', async () => {
    const record: Record<string, CellValue> = {
      OrderIds: [10, 999]
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Customers'),
      'docId',
      schemaCache
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toBeInstanceOf(InvalidRefListError)
  })
})

// =============================================================================
// validateRecordDataIntegrity - Choice Validation
// =============================================================================

describe('validateRecordDataIntegrity - Choice Validation', () => {
  const columns: ColumnMetadata[] = [
    createColumn('Status', 'Choice', '{"choices":["Active","Inactive","Pending"]}')
  ]

  it('validates valid Choice value', async () => {
    const record: Record<string, CellValue> = {
      Status: 'Active'
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Users'),
      'docId',
      createMockSchemaCache(new Map())
    )

    expect(result.valid).toBe(true)
  })

  it('reports error for invalid Choice value', async () => {
    const record: Record<string, CellValue> = {
      Status: 'Invalid'
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Users'),
      'docId',
      createMockSchemaCache(new Map())
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toBeInstanceOf(InvalidChoiceError)
  })

  it('skips validation when no choices defined', async () => {
    const columnsNoChoices: ColumnMetadata[] = [createColumn('Status', 'Choice')]

    const record: Record<string, CellValue> = {
      Status: 'Anything'
    }

    const result = await validateRecordDataIntegrity(
      record,
      columnsNoChoices,
      toTableId('Users'),
      'docId',
      createMockSchemaCache(new Map())
    )

    expect(result.valid).toBe(true)
  })
})

// =============================================================================
// validateRecordDataIntegrity - ChoiceList Validation
// =============================================================================

describe('validateRecordDataIntegrity - ChoiceList Validation', () => {
  const columns: ColumnMetadata[] = [
    createColumn('Tags', 'ChoiceList', '{"choices":["bug","feature","docs"]}')
  ]

  it('validates valid ChoiceList (user format)', async () => {
    const record: Record<string, CellValue> = {
      Tags: ['bug', 'feature']
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Issues'),
      'docId',
      createMockSchemaCache(new Map())
    )

    expect(result.valid).toBe(true)
  })

  it('validates valid ChoiceList (API format)', async () => {
    const record: Record<string, CellValue> = {
      Tags: ['L', 'bug', 'docs']
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Issues'),
      'docId',
      createMockSchemaCache(new Map())
    )

    expect(result.valid).toBe(true)
  })

  it('reports error for invalid ChoiceList values', async () => {
    const record: Record<string, CellValue> = {
      Tags: ['bug', 'invalid']
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Issues'),
      'docId',
      createMockSchemaCache(new Map())
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toBeInstanceOf(InvalidChoiceListError)
  })
})

// =============================================================================
// validateRecordDataIntegrity - Complex Records
// =============================================================================

describe('validateRecordDataIntegrity - Complex Records', () => {
  const columns: ColumnMetadata[] = [
    createColumn('CustomerId', 'Ref:Customers'),
    createColumn('OrderIds', 'RefList:Orders'),
    createColumn('Status', 'Choice', '{"choices":["Active","Closed"]}'),
    createColumn('Tags', 'ChoiceList', '{"choices":["urgent","normal"]}')
  ]

  const schemaCache = createMockSchemaCache(
    new Map([
      ['Customers', new Set([1, 2, 3])],
      ['Orders', new Set([10, 20, 30])]
    ])
  )

  it('validates record with all valid values', async () => {
    const record: Record<string, CellValue> = {
      CustomerId: 1,
      OrderIds: [10, 20],
      Status: 'Active',
      Tags: ['urgent']
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Transactions'),
      'docId',
      schemaCache
    )

    expect(result.valid).toBe(true)
  })

  it('reports first error when multiple errors exist', async () => {
    const record: Record<string, CellValue> = {
      CustomerId: 999, // Invalid
      Status: 'Invalid' // Also invalid
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Transactions'),
      'docId',
      schemaCache
    )

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toBeInstanceOf(InvalidReferenceError)
  })

  it('validates record with mixed valid and null values', async () => {
    const record: Record<string, CellValue> = {
      CustomerId: null,
      OrderIds: [10],
      Status: null,
      Tags: ['urgent']
    }

    const result = await validateRecordDataIntegrity(
      record,
      columns,
      toTableId('Transactions'),
      'docId',
      schemaCache
    )

    expect(result.valid).toBe(true)
  })
})

// =============================================================================
// validateRecordsDataIntegrity - Batch Validation
// =============================================================================

describe('validateRecordsDataIntegrity - Batch Validation', () => {
  const columns: ColumnMetadata[] = [createColumn('CustomerId', 'Ref:Customers')]

  const schemaCache = createMockSchemaCache(new Map([['Customers', new Set([1, 2, 3])]]))

  it('validates multiple valid records', async () => {
    const records: Record<string, CellValue>[] = [
      { CustomerId: 1 },
      { CustomerId: 2 },
      { CustomerId: 3 }
    ]

    await expect(
      validateRecordsDataIntegrity(records, columns, toTableId('Orders'), 'docId', schemaCache)
    ).resolves.not.toThrow()
  })

  it('validates empty array', async () => {
    const records: Record<string, CellValue>[] = []

    await expect(
      validateRecordsDataIntegrity(records, columns, toTableId('Orders'), 'docId', schemaCache)
    ).resolves.not.toThrow()
  })

  it('stops at first error', async () => {
    const records: Record<string, CellValue>[] = [
      { CustomerId: 1 }, // Valid
      { CustomerId: 999 }, // Invalid - should throw here
      { CustomerId: 2 } // Not reached
    ]

    await expect(
      validateRecordsDataIntegrity(records, columns, toTableId('Orders'), 'docId', schemaCache)
    ).rejects.toThrow(InvalidReferenceError)
  })

  it('pre-fetches row IDs once for all records', async () => {
    const mockCache = createMockSchemaCache(new Map([['Customers', new Set([1, 2, 3])]]))

    const records: Record<string, CellValue>[] = [
      { CustomerId: 1 },
      { CustomerId: 2 },
      { CustomerId: 3 }
    ]

    await validateRecordsDataIntegrity(records, columns, toTableId('Orders'), 'docId', mockCache)

    // getRowIds should be called only once per table
    expect(mockCache.getRowIds).toHaveBeenCalledTimes(1)
  })
})

// =============================================================================
// validateUpsertRecordsDataIntegrity - Upsert Format
// =============================================================================

describe('validateUpsertRecordsDataIntegrity - Upsert Format', () => {
  const columns: ColumnMetadata[] = [
    createColumn('CustomerId', 'Ref:Customers'),
    createColumn('Status', 'Choice', '{"choices":["Active","Closed"]}')
  ]

  const schemaCache = createMockSchemaCache(new Map([['Customers', new Set([1, 2, 3])]]))

  it('validates records with only fields', async () => {
    const records = [{ fields: { CustomerId: 1 } }, { fields: { CustomerId: 2 } }]

    await expect(
      validateUpsertRecordsDataIntegrity(
        records,
        columns,
        toTableId('Orders'),
        'docId',
        schemaCache
      )
    ).resolves.not.toThrow()
  })

  it('validates records with only require', async () => {
    const records = [{ require: { CustomerId: 1 } }]

    await expect(
      validateUpsertRecordsDataIntegrity(
        records,
        columns,
        toTableId('Orders'),
        'docId',
        schemaCache
      )
    ).resolves.not.toThrow()
  })

  it('validates records with both require and fields', async () => {
    const records = [
      {
        require: { CustomerId: 1 },
        fields: { Status: 'Active' }
      }
    ]

    await expect(
      validateUpsertRecordsDataIntegrity(
        records,
        columns,
        toTableId('Orders'),
        'docId',
        schemaCache
      )
    ).resolves.not.toThrow()
  })

  it('validates empty records', async () => {
    const records = [{}]

    await expect(
      validateUpsertRecordsDataIntegrity(
        records,
        columns,
        toTableId('Orders'),
        'docId',
        schemaCache
      )
    ).resolves.not.toThrow()
  })

  it('throws for invalid value in fields', async () => {
    const records = [
      {
        fields: { CustomerId: 999 } // Invalid
      }
    ]

    await expect(
      validateUpsertRecordsDataIntegrity(
        records,
        columns,
        toTableId('Orders'),
        'docId',
        schemaCache
      )
    ).rejects.toThrow(InvalidReferenceError)
  })

  it('throws for invalid value in require', async () => {
    const records = [
      {
        require: { CustomerId: 999 } // Invalid
      }
    ]

    await expect(
      validateUpsertRecordsDataIntegrity(
        records,
        columns,
        toTableId('Orders'),
        'docId',
        schemaCache
      )
    ).rejects.toThrow(InvalidReferenceError)
  })

  it('pre-fetches row IDs once for all records', async () => {
    const mockCache = createMockSchemaCache(new Map([['Customers', new Set([1, 2, 3])]]))

    const records = [
      { require: { CustomerId: 1 }, fields: { Status: 'Active' } },
      { fields: { CustomerId: 2 } }
    ]

    await validateUpsertRecordsDataIntegrity(
      records,
      columns,
      toTableId('Orders'),
      'docId',
      mockCache
    )

    // Should only call getRowIds once despite multiple records
    expect(mockCache.getRowIds).toHaveBeenCalledTimes(1)
  })
})
