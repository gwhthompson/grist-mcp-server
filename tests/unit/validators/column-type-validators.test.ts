/**
 * Unit Tests for Column Type Validators
 *
 * Tests the type validation functions that ensure cell values
 * match their expected column types.
 */

import { describe, expect, it } from 'vitest'
import type { ColumnMetadata } from '../../../src/services/schema-cache.js'
import {
  ColumnValidationError,
  validateCellValueForColumnType,
  validateRecordValues
} from '../../../src/validators/column-type-validators.js'

// =============================================================================
// Helper: Create Column Metadata
// =============================================================================

function createColumn(id: string, type: string): ColumnMetadata {
  return {
    id,
    fields: {
      type,
      isFormula: false,
      formula: '',
      label: id
    }
  }
}

// =============================================================================
// ColumnValidationError
// =============================================================================

describe('ColumnValidationError', () => {
  it('creates error with correct properties', () => {
    const error = new ColumnValidationError('Age', 'Int', 'not a number', 'string', 'Type mismatch')

    expect(error.columnId).toBe('Age')
    expect(error.columnType).toBe('Int')
    expect(error.providedValue).toBe('not a number')
    expect(error.providedType).toBe('string')
    expect(error.message).toBe('Type mismatch')
    expect(error.code).toBe('COLUMN_TYPE_MISMATCH')
  })

  it('toUserMessage returns the error message', () => {
    const error = new ColumnValidationError('Age', 'Int', 'bad', 'string', 'Custom message')
    expect(error.toUserMessage()).toBe('Custom message')
  })

  it('isRetryable returns false', () => {
    const error = new ColumnValidationError('Age', 'Int', 'bad', 'string', 'Error')
    expect(error.isRetryable()).toBe(false)
  })
})

// =============================================================================
// Bool Column Validation
// =============================================================================

describe('Bool column validation', () => {
  const boolColumn = createColumn('IsActive', 'Bool')

  it('accepts true', () => {
    expect(() => validateCellValueForColumnType(true, boolColumn, 'IsActive')).not.toThrow()
  })

  it('accepts false', () => {
    expect(() => validateCellValueForColumnType(false, boolColumn, 'IsActive')).not.toThrow()
  })

  it('accepts null', () => {
    expect(() => validateCellValueForColumnType(null, boolColumn, 'IsActive')).not.toThrow()
  })

  it('rejects string', () => {
    expect(() => validateCellValueForColumnType('true', boolColumn, 'IsActive')).toThrow(
      ColumnValidationError
    )
  })

  it('rejects number', () => {
    expect(() => validateCellValueForColumnType(1, boolColumn, 'IsActive')).toThrow(
      ColumnValidationError
    )
  })

  it('provides helpful error message', () => {
    try {
      validateCellValueForColumnType('yes', boolColumn, 'IsActive')
    } catch (e) {
      expect(e).toBeInstanceOf(ColumnValidationError)
      expect((e as ColumnValidationError).message).toContain('true/false/null')
      expect((e as ColumnValidationError).message).toContain('IsActive')
    }
  })
})

// =============================================================================
// Numeric Column Validation
// =============================================================================

describe('Numeric column validation', () => {
  const numericColumn = createColumn('Amount', 'Numeric')
  const intColumn = createColumn('Count', 'Int')

  it('accepts integers for Numeric', () => {
    expect(() => validateCellValueForColumnType(42, numericColumn, 'Amount')).not.toThrow()
  })

  it('accepts decimals for Numeric', () => {
    expect(() => validateCellValueForColumnType(3.14, numericColumn, 'Amount')).not.toThrow()
  })

  it('accepts null for Numeric', () => {
    expect(() => validateCellValueForColumnType(null, numericColumn, 'Amount')).not.toThrow()
  })

  it('accepts integers for Int', () => {
    expect(() => validateCellValueForColumnType(42, intColumn, 'Count')).not.toThrow()
  })

  it('rejects string for Numeric', () => {
    expect(() => validateCellValueForColumnType('42', numericColumn, 'Amount')).toThrow(
      ColumnValidationError
    )
  })

  it('rejects string for Int', () => {
    expect(() => validateCellValueForColumnType('42', intColumn, 'Count')).toThrow(
      ColumnValidationError
    )
  })
})

// =============================================================================
// Text Column Validation
// =============================================================================

describe('Text column validation', () => {
  const textColumn = createColumn('Name', 'Text')

  it('accepts string', () => {
    expect(() => validateCellValueForColumnType('Hello', textColumn, 'Name')).not.toThrow()
  })

  it('accepts empty string', () => {
    expect(() => validateCellValueForColumnType('', textColumn, 'Name')).not.toThrow()
  })

  it('accepts null', () => {
    expect(() => validateCellValueForColumnType(null, textColumn, 'Name')).not.toThrow()
  })

  it('rejects number', () => {
    expect(() => validateCellValueForColumnType(123, textColumn, 'Name')).toThrow(
      ColumnValidationError
    )
  })

  it('rejects boolean', () => {
    expect(() => validateCellValueForColumnType(true, textColumn, 'Name')).toThrow(
      ColumnValidationError
    )
  })
})

// =============================================================================
// Date/DateTime Column Validation
// =============================================================================

describe('Date column validation', () => {
  const dateColumn = createColumn('BirthDate', 'Date')
  const dateTimeColumn = createColumn('CreatedAt', 'DateTime')

  it('accepts ISO date string', () => {
    expect(() =>
      validateCellValueForColumnType('2024-01-15', dateColumn, 'BirthDate')
    ).not.toThrow()
  })

  it('accepts ISO datetime string', () => {
    expect(() =>
      validateCellValueForColumnType('2024-01-15T10:30:00', dateTimeColumn, 'CreatedAt')
    ).not.toThrow()
  })

  it('accepts Unix timestamp', () => {
    expect(() => validateCellValueForColumnType(1705312200, dateColumn, 'BirthDate')).not.toThrow()
  })

  it('accepts null', () => {
    expect(() => validateCellValueForColumnType(null, dateColumn, 'BirthDate')).not.toThrow()
  })

  it('rejects non-date string', () => {
    expect(() => validateCellValueForColumnType('not a date', dateColumn, 'BirthDate')).toThrow(
      ColumnValidationError
    )
  })

  it('rejects boolean', () => {
    expect(() => validateCellValueForColumnType(true, dateColumn, 'BirthDate')).toThrow(
      ColumnValidationError
    )
  })
})

// =============================================================================
// Choice Column Validation
// =============================================================================

describe('Choice column validation', () => {
  const choiceColumn = createColumn('Status', 'Choice')

  it('accepts string', () => {
    expect(() => validateCellValueForColumnType('Active', choiceColumn, 'Status')).not.toThrow()
  })

  it('accepts null', () => {
    expect(() => validateCellValueForColumnType(null, choiceColumn, 'Status')).not.toThrow()
  })

  it('rejects number', () => {
    expect(() => validateCellValueForColumnType(1, choiceColumn, 'Status')).toThrow(
      ColumnValidationError
    )
  })

  it('rejects array', () => {
    expect(() => validateCellValueForColumnType(['a', 'b'], choiceColumn, 'Status')).toThrow(
      ColumnValidationError
    )
  })
})

// =============================================================================
// ChoiceList Column Validation
// =============================================================================

describe('ChoiceList column validation', () => {
  const choiceListColumn = createColumn('Tags', 'ChoiceList')

  it('accepts string array (user format)', () => {
    expect(() =>
      validateCellValueForColumnType(['tag1', 'tag2'], choiceListColumn, 'Tags')
    ).not.toThrow()
  })

  it('accepts L-prefixed array (API format)', () => {
    expect(() =>
      validateCellValueForColumnType(['L', 'tag1', 'tag2'], choiceListColumn, 'Tags')
    ).not.toThrow()
  })

  it('accepts null', () => {
    expect(() => validateCellValueForColumnType(null, choiceListColumn, 'Tags')).not.toThrow()
  })

  it('accepts empty array', () => {
    expect(() => validateCellValueForColumnType([], choiceListColumn, 'Tags')).not.toThrow()
  })

  it('rejects number array', () => {
    expect(() => validateCellValueForColumnType([1, 2], choiceListColumn, 'Tags')).toThrow(
      ColumnValidationError
    )
  })

  it('rejects string', () => {
    expect(() => validateCellValueForColumnType('single', choiceListColumn, 'Tags')).toThrow(
      ColumnValidationError
    )
  })
})

// =============================================================================
// Ref Column Validation
// =============================================================================

describe('Ref column validation', () => {
  const refColumn = createColumn('CustomerId', 'Ref')

  it('accepts row ID number', () => {
    expect(() => validateCellValueForColumnType(123, refColumn, 'CustomerId')).not.toThrow()
  })

  it('accepts R-prefixed array (API format)', () => {
    expect(() => validateCellValueForColumnType(['R', 123], refColumn, 'CustomerId')).not.toThrow()
  })

  it('accepts null', () => {
    expect(() => validateCellValueForColumnType(null, refColumn, 'CustomerId')).not.toThrow()
  })

  it('rejects string', () => {
    expect(() => validateCellValueForColumnType('123', refColumn, 'CustomerId')).toThrow(
      ColumnValidationError
    )
  })

  it('rejects invalid array format', () => {
    expect(() => validateCellValueForColumnType([123], refColumn, 'CustomerId')).toThrow(
      ColumnValidationError
    )
  })
})

// =============================================================================
// RefList Column Validation
// =============================================================================

describe('RefList column validation', () => {
  const refListColumn = createColumn('OrderIds', 'RefList')

  it('accepts number array (user format)', () => {
    expect(() => validateCellValueForColumnType([1, 2, 3], refListColumn, 'OrderIds')).not.toThrow()
  })

  it('accepts L-prefixed array (API format)', () => {
    expect(() =>
      validateCellValueForColumnType(['L', 1, 2, 3], refListColumn, 'OrderIds')
    ).not.toThrow()
  })

  it('accepts null', () => {
    expect(() => validateCellValueForColumnType(null, refListColumn, 'OrderIds')).not.toThrow()
  })

  it('accepts empty array', () => {
    expect(() => validateCellValueForColumnType([], refListColumn, 'OrderIds')).not.toThrow()
  })

  it('rejects string array', () => {
    expect(() => validateCellValueForColumnType(['a', 'b'], refListColumn, 'OrderIds')).toThrow(
      ColumnValidationError
    )
  })

  it('rejects single number', () => {
    expect(() => validateCellValueForColumnType(123, refListColumn, 'OrderIds')).toThrow(
      ColumnValidationError
    )
  })
})

// =============================================================================
// Unknown Column Types
// =============================================================================

describe('Unknown column type handling', () => {
  it('gracefully accepts any value for unknown column types', () => {
    const unknownColumn = createColumn('Custom', 'SomeNewType')

    expect(() => validateCellValueForColumnType('anything', unknownColumn, 'Custom')).not.toThrow()
    expect(() => validateCellValueForColumnType(123, unknownColumn, 'Custom')).not.toThrow()
    expect(() => validateCellValueForColumnType(['a', 1], unknownColumn, 'Custom')).not.toThrow()
  })
})

// =============================================================================
// validateRecordValues (Batch Validation)
// =============================================================================

describe('validateRecordValues', () => {
  const columns: ColumnMetadata[] = [
    createColumn('Name', 'Text'),
    createColumn('Age', 'Int'),
    createColumn('Active', 'Bool')
  ]

  it('returns empty array for valid record', () => {
    const record = { Name: 'Alice', Age: 30, Active: true }
    const errors = validateRecordValues(record, columns)
    expect(errors).toHaveLength(0)
  })

  it('collects multiple validation errors', () => {
    const record = { Name: 123, Age: 'thirty', Active: 'yes' }
    const errors = validateRecordValues(record, columns)
    expect(errors).toHaveLength(3)
  })

  it('skips unknown columns', () => {
    const record = { Name: 'Alice', UnknownCol: 'whatever' }
    const errors = validateRecordValues(record, columns)
    expect(errors).toHaveLength(0)
  })

  it('handles null values', () => {
    const record = { Name: null, Age: null, Active: null }
    const errors = validateRecordValues(record, columns)
    expect(errors).toHaveLength(0)
  })
})
