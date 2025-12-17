import { describe, expect, it } from 'vitest'
import { NotFoundError } from '../../../src/errors/NotFoundError.js'
import type { ColumnMetadata } from '../../../src/services/schema-cache.js'
import {
  FormulaColumnWriteError,
  getFormulaColumnIds,
  getWritableColumnIds,
  isWritableColumn,
  validateColumnExistence,
  validateWritableColumns
} from '../../../src/validators/writable-columns.js'

const mockColumn = (id: string, isFormula: boolean): ColumnMetadata =>
  ({
    id,
    fields: { type: 'Text', isFormula }
  }) as ColumnMetadata

const columns = [
  mockColumn('Name', false),
  mockColumn('Email', false),
  mockColumn('Total', true),
  mockColumn('FullName', true)
]

describe('Writable Columns', () => {
  describe('isWritableColumn', () => {
    it.each([
      [mockColumn('Name', false), true],
      [mockColumn('Total', true), false]
    ])('isWritableColumn(%s) -> %s', (col, expected) => {
      expect(isWritableColumn(col)).toBe(expected)
    })
  })

  describe('validateColumnExistence', () => {
    it('passes for existing columns', () => {
      expect(() =>
        validateColumnExistence({ Name: 'test', Email: 'a@b.c' }, columns, 'People')
      ).not.toThrow()
    })

    it('throws NotFoundError for missing column', () => {
      expect(() => validateColumnExistence({ Unknown: 'value' }, columns, 'People')).toThrow(
        NotFoundError
      )
    })

    it('error includes column name', () => {
      try {
        validateColumnExistence({ BadCol: 'value' }, columns, 'People')
      } catch (e) {
        expect((e as NotFoundError).message).toContain('BadCol')
      }
    })
  })

  describe('validateWritableColumns', () => {
    it('allows writes to data columns', () => {
      expect(() => validateWritableColumns({ Name: 'test', Email: 'a@b.c' }, columns)).not.toThrow()
    })

    it('throws FormulaColumnWriteError for formula columns', () => {
      expect(() => validateWritableColumns({ Total: 100 }, columns)).toThrow(
        FormulaColumnWriteError
      )
    })

    it('error contains formula column names', () => {
      try {
        validateWritableColumns({ Total: 100, FullName: 'test' }, columns)
      } catch (e) {
        const error = e as FormulaColumnWriteError
        expect(error.formulaColumns).toContain('Total')
        expect(error.formulaColumns).toContain('FullName')
      }
    })

    it('ignores unknown columns (existence validated separately)', () => {
      expect(() => validateWritableColumns({ Unknown: 'test' }, columns)).not.toThrow()
    })
  })

  describe('FormulaColumnWriteError', () => {
    it('has correct error code', () => {
      const error = new FormulaColumnWriteError(['Total'], 'Cannot write')
      expect(error.code).toBe('FORMULA_COLUMN_WRITE_ATTEMPT')
    })

    it('is not retryable', () => {
      const error = new FormulaColumnWriteError(['Total'], 'Cannot write')
      expect(error.isRetryable()).toBe(false)
    })

    it('returns message as user message', () => {
      const error = new FormulaColumnWriteError(['Total'], 'Cannot write to formula column')
      expect(error.toUserMessage()).toBe('Cannot write to formula column')
    })
  })

  describe('getWritableColumnIds', () => {
    it('returns set of data column IDs', () => {
      const ids = getWritableColumnIds(columns)
      expect(ids).toEqual(new Set(['Name', 'Email']))
    })

    it('returns empty set for all formula columns', () => {
      const formulas = [mockColumn('A', true), mockColumn('B', true)]
      expect(getWritableColumnIds(formulas)).toEqual(new Set())
    })
  })

  describe('getFormulaColumnIds', () => {
    it('returns set of formula column IDs', () => {
      const ids = getFormulaColumnIds(columns)
      expect(ids).toEqual(new Set(['Total', 'FullName']))
    })

    it('returns empty set for all data columns', () => {
      const data = [mockColumn('A', false), mockColumn('B', false)]
      expect(getFormulaColumnIds(data)).toEqual(new Set())
    })
  })
})
