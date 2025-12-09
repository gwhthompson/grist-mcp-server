import { GristError } from '../errors/GristError.js'
import { NotFoundError } from '../errors/NotFoundError.js'
import type { ColumnMetadata } from '../services/schema-cache.js'

export class FormulaColumnWriteError extends GristError {
  constructor(
    public readonly formulaColumns: string[],
    message: string
  ) {
    super(message, 'FORMULA_COLUMN_WRITE_ATTEMPT', {
      formulaColumns
    })
  }

  toUserMessage(): string {
    return this.message
  }

  isRetryable(): boolean {
    return false
  }
}

/** Checks if a column can be written to (not a formula column). */
export function isWritableColumn(column: ColumnMetadata): boolean {
  return column.fields.isFormula !== true
}

/**
 * Validates that all columns in the updates exist in the table.
 * @throws {NotFoundError} if any column doesn't exist
 */
export function validateColumnExistence(
  updates: Record<string, unknown>,
  columns: ColumnMetadata[],
  tableId: string
): void {
  const columnIds = new Set(columns.map((c) => c.id))

  for (const colId of Object.keys(updates)) {
    if (!columnIds.has(colId)) {
      throw new NotFoundError('column', colId, { tableId })
    }
  }
}

/**
 * Validates that updates only target writable columns.
 * @throws {FormulaColumnWriteError} if attempting to write to formula columns
 */
export function validateWritableColumns(
  updates: Record<string, unknown>,
  columns: ColumnMetadata[]
): void {
  const formulaColumns: string[] = []

  for (const colId of Object.keys(updates)) {
    const column = columns.find((c) => c.id === colId)

    if (!column) continue
    if (!isWritableColumn(column)) {
      formulaColumns.push(colId)
    }
  }

  if (formulaColumns.length > 0) {
    throw new FormulaColumnWriteError(
      formulaColumns,
      createFormulaColumnErrorMessage(formulaColumns)
    )
  }
}

function createFormulaColumnErrorMessage(formulaColumns: string[]): string {
  const columnList = formulaColumns.length === 1 ? formulaColumns[0] : formulaColumns.join(', ')
  const pluralSuffix = formulaColumns.length === 1 ? '' : 's'

  return (
    `Cannot write to formula column${pluralSuffix}: ${columnList}\n\n` +
    `Formula columns (isFormula=true) are read-only and computed automatically.\n` +
    `These columns calculate their values based on formulas and cannot be manually updated.\n\n` +
    `Attempted to update: ${columnList}\n\n` +
    `Tip: If you need a formula that can be manually edited, use a trigger formula column\n` +
    `with isFormula=false and recalcWhen=2 (MANUAL_UPDATES) instead.\n\n` +
    `Examples:\n` +
    `  ❌ FORMULA COLUMN (read-only):\n` +
    `     isFormula: true\n` +
    `     formula: "$Price * $Quantity"\n` +
    `     → Cannot write to this column\n\n` +
    `  ✅ TRIGGER FORMULA COLUMN (writable):\n` +
    `     isFormula: false\n` +
    `     formula: "NOW()"\n` +
    `     recalcWhen: 2  # MANUAL_UPDATES\n` +
    `     → Can write to this column\n\n` +
    `  ✅ DATA COLUMN (writable):\n` +
    `     isFormula: false\n` +
    `     (no formula)\n` +
    `     → Can write to this column`
  )
}

/** Returns set of column IDs that can be written to. */
export function getWritableColumnIds(columns: ColumnMetadata[]): Set<string> {
  const writableIds = new Set<string>()

  for (const column of columns) {
    if (isWritableColumn(column)) {
      writableIds.add(column.id)
    }
  }

  return writableIds
}

/** Returns set of formula column IDs (read-only). */
export function getFormulaColumnIds(columns: ColumnMetadata[]): Set<string> {
  const formulaIds = new Set<string>()

  for (const column of columns) {
    if (!isWritableColumn(column)) {
      formulaIds.add(column.id)
    }
  }

  return formulaIds
}
