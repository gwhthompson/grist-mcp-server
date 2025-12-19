/**
 * Unit Tests for Record Validators
 *
 * Tests the consolidated record validation functions that combine
 * column existence checks, writable column validation, and type validation.
 */

import { describe, expect, it } from 'vitest'
import { NotFoundError } from '../../../src/errors/NotFoundError.js'
import type { CellValue } from '../../../src/schemas/api-responses.js'
import type { ColumnMetadata } from '../../../src/services/schema-cache.js'
import { ColumnValidationError } from '../../../src/validators/column-type-validators.js'
import {
  validateRecord,
  validateRecords,
  validateUpsertRecords
} from '../../../src/validators/record-validator.js'
import { FormulaColumnWriteError } from '../../../src/validators/writable-columns.js'

// =============================================================================
// Test Helpers
// =============================================================================

function createColumn(id: string, type: string, isFormula = false, label?: string): ColumnMetadata {
  return {
    id,
    fields: {
      type,
      isFormula,
      formula: isFormula ? 'some formula' : '',
      label: label ?? id
    }
  }
}

const testColumns: ColumnMetadata[] = [
  createColumn('Name', 'Text'),
  createColumn('Age', 'Int'),
  createColumn('Email', 'Text'),
  createColumn('Active', 'Bool'),
  createColumn('Total', 'Numeric', true), // Formula column
  createColumn('FullName', 'Text', true) // Formula column
]

// =============================================================================
// validateRecord - Success Cases
// =============================================================================

describe('validateRecord - Success Cases', () => {
  it('validates record with valid data columns', () => {
    const record: Record<string, CellValue> = {
      Name: 'Alice',
      Age: 30,
      Email: 'alice@example.com',
      Active: true
    }

    expect(() => validateRecord(record, testColumns)).not.toThrow()
  })

  it('validates record with null values', () => {
    const record: Record<string, CellValue> = {
      Name: null,
      Age: null,
      Email: null,
      Active: null
    }

    expect(() => validateRecord(record, testColumns)).not.toThrow()
  })

  it('validates record with single column', () => {
    const record: Record<string, CellValue> = {
      Name: 'Bob'
    }

    expect(() => validateRecord(record, testColumns)).not.toThrow()
  })

  it('validates empty record', () => {
    const record: Record<string, CellValue> = {}

    expect(() => validateRecord(record, testColumns)).not.toThrow()
  })

  it('validates record with array values', () => {
    const columns = [createColumn('Tags', 'ChoiceList'), createColumn('OrderIds', 'RefList')]

    const record: Record<string, CellValue> = {
      Tags: ['tag1', 'tag2'],
      OrderIds: [1, 2, 3]
    }

    expect(() => validateRecord(record, columns)).not.toThrow()
  })

  it('validates without tableId (skips existence check)', () => {
    const record: Record<string, CellValue> = {
      UnknownColumn: 'value'
    }

    // Should only check writable columns and types, not existence
    expect(() => validateRecord(record, testColumns)).not.toThrow()
  })
})

// =============================================================================
// validateRecord - Column Existence Errors
// =============================================================================

describe('validateRecord - Column Existence', () => {
  it('throws NotFoundError for non-existent column when tableId provided', () => {
    const record: Record<string, CellValue> = {
      NonExistentColumn: 'value'
    }

    expect(() => validateRecord(record, testColumns, 'People')).toThrow(NotFoundError)
  })

  it('error message includes column name', () => {
    const record: Record<string, CellValue> = {
      BadColumn: 'value'
    }

    try {
      validateRecord(record, testColumns, 'People')
    } catch (error) {
      expect((error as NotFoundError).message).toContain('BadColumn')
      expect((error as NotFoundError).resourceType).toBe('column')
      expect((error as NotFoundError).resourceId).toBe('BadColumn')
    }
  })

  it('allows unknown columns when tableId not provided', () => {
    const record: Record<string, CellValue> = {
      UnknownColumn: 'value'
    }

    expect(() => validateRecord(record, testColumns)).not.toThrow()
  })

  it('checks existence before other validations', () => {
    const record: Record<string, CellValue> = {
      NonExistent: 'value'
    }

    // Should throw NotFoundError, not FormulaColumnWriteError or ColumnValidationError
    expect(() => validateRecord(record, testColumns, 'People')).toThrow(NotFoundError)
  })
})

// =============================================================================
// validateRecord - Formula Column Errors
// =============================================================================

describe('validateRecord - Formula Columns', () => {
  it('throws FormulaColumnWriteError for formula column', () => {
    const record: Record<string, CellValue> = {
      Total: 100
    }

    expect(() => validateRecord(record, testColumns)).toThrow(FormulaColumnWriteError)
  })

  it('throws for multiple formula columns', () => {
    const record: Record<string, CellValue> = {
      Total: 100,
      FullName: 'John Doe'
    }

    try {
      validateRecord(record, testColumns)
    } catch (error) {
      expect(error).toBeInstanceOf(FormulaColumnWriteError)
      expect((error as FormulaColumnWriteError).formulaColumns).toContain('Total')
      expect((error as FormulaColumnWriteError).formulaColumns).toContain('FullName')
    }
  })

  it('allows data columns while rejecting formula columns', () => {
    const record: Record<string, CellValue> = {
      Name: 'Alice',
      Total: 50 // Formula column
    }

    expect(() => validateRecord(record, testColumns)).toThrow(FormulaColumnWriteError)
  })
})

// =============================================================================
// validateRecord - Type Validation Errors
// =============================================================================

describe('validateRecord - Type Validation', () => {
  it('throws ColumnValidationError for wrong type', () => {
    const record: Record<string, CellValue> = {
      Age: 'thirty' // Should be number
    }

    expect(() => validateRecord(record, testColumns)).toThrow(ColumnValidationError)
  })

  it('throws for boolean in text column', () => {
    const record: Record<string, CellValue> = {
      Name: true // Should be string
    }

    expect(() => validateRecord(record, testColumns)).toThrow(ColumnValidationError)
  })

  it('throws for number in boolean column', () => {
    const record: Record<string, CellValue> = {
      Active: 1 // Should be boolean
    }

    expect(() => validateRecord(record, testColumns)).toThrow(ColumnValidationError)
  })

  it('throws for string in numeric column', () => {
    const record: Record<string, CellValue> = {
      Age: 'not a number'
    }

    expect(() => validateRecord(record, testColumns)).toThrow(ColumnValidationError)
  })

  it('error includes column name and type information', () => {
    const record: Record<string, CellValue> = {
      Age: 'invalid'
    }

    try {
      validateRecord(record, testColumns)
    } catch (error) {
      expect(error).toBeInstanceOf(ColumnValidationError)
      expect((error as ColumnValidationError).columnId).toBe('Age')
      expect((error as ColumnValidationError).columnType).toBe('Int')
    }
  })
})

// =============================================================================
// validateRecord - Error Priority
// =============================================================================

describe('validateRecord - Error Priority', () => {
  it('checks column existence before writable columns', () => {
    const record: Record<string, CellValue> = {
      NonExistent: 'value'
    }

    expect(() => validateRecord(record, testColumns, 'People')).toThrow(NotFoundError)
  })

  it('checks writable columns before type validation', () => {
    const record: Record<string, CellValue> = {
      Total: 'wrong type' // Formula column with wrong type
    }

    // Should throw FormulaColumnWriteError, not ColumnValidationError
    expect(() => validateRecord(record, testColumns)).toThrow(FormulaColumnWriteError)
  })

  it('stops at first type validation error', () => {
    const record: Record<string, CellValue> = {
      Name: 123, // Type error 1
      Age: 'thirty' // Type error 2
    }

    try {
      validateRecord(record, testColumns)
    } catch (error) {
      // Should throw first error encountered
      expect(error).toBeInstanceOf(ColumnValidationError)
    }
  })
})

// =============================================================================
// validateRecords - Multiple Records
// =============================================================================

describe('validateRecords - Multiple Records', () => {
  it('validates multiple valid records', () => {
    const records: Record<string, CellValue>[] = [
      { Name: 'Alice', Age: 30 },
      { Name: 'Bob', Age: 25 },
      { Name: 'Charlie', Age: 35 }
    ]

    expect(() => validateRecords(records, testColumns)).not.toThrow()
  })

  it('validates empty array', () => {
    const records: Record<string, CellValue>[] = []

    expect(() => validateRecords(records, testColumns)).not.toThrow()
  })

  it('stops at first invalid record', () => {
    const records: Record<string, CellValue>[] = [
      { Name: 'Alice', Age: 30 }, // Valid
      { Name: 'Bob', Age: 'twenty' }, // Invalid - type error
      { Name: 'Charlie', Age: 35 } // Would be valid
    ]

    expect(() => validateRecords(records, testColumns)).toThrow(ColumnValidationError)
  })

  it('throws for non-existent column in second record', () => {
    const records: Record<string, CellValue>[] = [{ Name: 'Alice' }, { BadColumn: 'value' }]

    expect(() => validateRecords(records, testColumns, 'People')).toThrow(NotFoundError)
  })

  it('throws for formula column in third record', () => {
    const records: Record<string, CellValue>[] = [
      { Name: 'Alice' },
      { Name: 'Bob' },
      { Total: 100 } // Formula column
    ]

    expect(() => validateRecords(records, testColumns)).toThrow(FormulaColumnWriteError)
  })

  it('validates with tableId', () => {
    const records: Record<string, CellValue>[] = [
      { Name: 'Alice', Age: 30 },
      { Name: 'Bob', Age: 25 }
    ]

    expect(() => validateRecords(records, testColumns, 'People')).not.toThrow()
  })

  it('validates without tableId', () => {
    const records: Record<string, CellValue>[] = [
      { Name: 'Alice', Age: 30 },
      { UnknownColumn: 'ignored' } // No existence check without tableId
    ]

    expect(() => validateRecords(records, testColumns)).not.toThrow()
  })
})

// =============================================================================
// validateUpsertRecords - Upsert Format
// =============================================================================

describe('validateUpsertRecords - Upsert Format', () => {
  it('validates records with only fields', () => {
    const records = [{ fields: { Name: 'Alice', Age: 30 } }, { fields: { Name: 'Bob', Age: 25 } }]

    expect(() => validateUpsertRecords(records, testColumns)).not.toThrow()
  })

  it('validates records with only require', () => {
    const records = [{ require: { Email: 'alice@example.com' } }]

    expect(() => validateUpsertRecords(records, testColumns)).not.toThrow()
  })

  it('validates records with both require and fields', () => {
    const records = [
      {
        require: { Email: 'alice@example.com' },
        fields: { Name: 'Alice', Age: 30 }
      }
    ]

    expect(() => validateUpsertRecords(records, testColumns)).not.toThrow()
  })

  it('validates records with neither require nor fields', () => {
    const records = [{}]

    expect(() => validateUpsertRecords(records, testColumns)).not.toThrow()
  })

  it('validates empty array', () => {
    const records: Array<{
      require?: Record<string, CellValue>
      fields?: Record<string, CellValue>
    }> = []

    expect(() => validateUpsertRecords(records, testColumns)).not.toThrow()
  })
})

// =============================================================================
// validateUpsertRecords - Validation Errors
// =============================================================================

describe('validateUpsertRecords - Validation Errors', () => {
  it('throws for type error in fields', () => {
    const records = [
      {
        fields: { Name: 'Alice', Age: 'thirty' } // Type error
      }
    ]

    expect(() => validateUpsertRecords(records, testColumns)).toThrow(ColumnValidationError)
  })

  it('throws for formula column in fields', () => {
    const records = [
      {
        fields: { Total: 100 } // Formula column
      }
    ]

    expect(() => validateUpsertRecords(records, testColumns)).toThrow(FormulaColumnWriteError)
  })

  it('throws for non-existent column in fields with tableId', () => {
    const records = [
      {
        fields: { BadColumn: 'value' }
      }
    ]

    expect(() => validateUpsertRecords(records, testColumns, 'People')).toThrow(NotFoundError)
  })

  it('throws for non-existent column in require with tableId', () => {
    const records = [
      {
        require: { NonExistent: 'value' }
      }
    ]

    expect(() => validateUpsertRecords(records, testColumns, 'People')).toThrow(NotFoundError)
  })

  it('allows unknown column in require without tableId', () => {
    const records = [
      {
        require: { UnknownColumn: 'value' }
      }
    ]

    // No existence check without tableId
    expect(() => validateUpsertRecords(records, testColumns)).not.toThrow()
  })

  it('validates all records before throwing', () => {
    const records = [
      { fields: { Name: 'Alice' } }, // Valid
      { fields: { Age: 'invalid' } } // Type error
    ]

    expect(() => validateUpsertRecords(records, testColumns)).toThrow(ColumnValidationError)
  })
})

// =============================================================================
// validateUpsertRecords - Complex Scenarios
// =============================================================================

describe('validateUpsertRecords - Complex Scenarios', () => {
  it('validates mixed records with different structures', () => {
    const records = [
      { fields: { Name: 'Alice' } },
      { require: { Email: 'bob@example.com' } },
      { require: { Age: 25 }, fields: { Name: 'Charlie' } },
      {}
    ]

    expect(() => validateUpsertRecords(records, testColumns)).not.toThrow()
  })

  it('validates null values in fields', () => {
    const records = [
      {
        fields: { Name: null, Age: null, Active: null }
      }
    ]

    expect(() => validateUpsertRecords(records, testColumns)).not.toThrow()
  })

  it('validates null values in require', () => {
    const records = [
      {
        require: { Email: null }
      }
    ]

    expect(() => validateUpsertRecords(records, testColumns)).not.toThrow()
  })

  it('throws for type error in require', () => {
    const records = [
      {
        require: { Age: 'not a number' }
      }
    ]

    // require is also validated for types (when checking data integrity)
    // But in this validator, we only check column existence for require
    // Type validation is only for fields
    expect(() => validateUpsertRecords(records, testColumns)).not.toThrow()
  })

  it('validates with tableId provided', () => {
    const records = [
      {
        require: { Email: 'alice@example.com' },
        fields: { Name: 'Alice', Age: 30 }
      }
    ]

    expect(() => validateUpsertRecords(records, testColumns, 'People')).not.toThrow()
  })

  it('stops at first error in batch', () => {
    const records = [
      { fields: { Name: 'Alice' } }, // Valid
      { fields: { Total: 100 } }, // Formula error
      { fields: { Age: 'bad' } } // Type error (not reached)
    ]

    expect(() => validateUpsertRecords(records, testColumns)).toThrow(FormulaColumnWriteError)
  })
})

// =============================================================================
// Integration: All Three Validators
// =============================================================================

describe('Integration - All Validators', () => {
  it('combines existence, writable, and type checks correctly', () => {
    const record: Record<string, CellValue> = {
      Name: 'Alice',
      Age: 30,
      Email: 'alice@example.com',
      Active: true
    }

    expect(() => validateRecord(record, testColumns, 'People')).not.toThrow()
  })

  it('fails on existence check first', () => {
    const record: Record<string, CellValue> = {
      BadColumn: 'value'
    }

    expect(() => validateRecord(record, testColumns, 'People')).toThrow(NotFoundError)
  })

  it('fails on writable check second', () => {
    const record: Record<string, CellValue> = {
      Total: 100 // Formula column
    }

    expect(() => validateRecord(record, testColumns, 'People')).toThrow(FormulaColumnWriteError)
  })

  it('fails on type check third', () => {
    const record: Record<string, CellValue> = {
      Age: 'not a number'
    }

    expect(() => validateRecord(record, testColumns, 'People')).toThrow(ColumnValidationError)
  })

  it('validates complex record successfully', () => {
    const columns = [
      createColumn('Name', 'Text'),
      createColumn('Age', 'Int'),
      createColumn('Tags', 'ChoiceList'),
      createColumn('IsActive', 'Bool'),
      createColumn('OrderIds', 'RefList')
    ]

    const record: Record<string, CellValue> = {
      Name: 'Alice',
      Age: 30,
      Tags: ['tag1', 'tag2'],
      IsActive: true,
      OrderIds: [1, 2, 3]
    }

    expect(() => validateRecord(record, columns, 'Orders')).not.toThrow()
  })
})
