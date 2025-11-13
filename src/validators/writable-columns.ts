import { GristError } from '../errors/GristError.js'
import type { ColumnMetadata } from '../services/schema-cache.js'

/**
 * Validation Error for attempting to write to read-only formula columns
 * Extends GristError for proper MCP error response formatting
 */
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
    return this.message // Already contains actionable, LLM-friendly message
  }

  isRetryable(): boolean {
    return false // User must fix data - not a transient error
  }
}

/**
 * Checks if a column is writable
 *
 * Formula columns (isFormula=true) are read-only and computed automatically.
 * Trigger formula columns (isFormula=false + formula exists) are writable.
 * Data columns (isFormula=false + no formula) are writable.
 *
 * @param column - Column metadata
 * @returns true if column can be written to, false if read-only
 */
export function isWritableColumn(column: ColumnMetadata): boolean {
  // Formula columns (isFormula=true) are NOT writable
  if (column.fields.isFormula === true) {
    return false
  }

  // All other columns are writable:
  // - Trigger formulas (isFormula=false + formula exists + recalcWhen=2)
  // - Data columns (isFormula=false + no formula)
  return true
}

/**
 * Validates that all column IDs in updates are writable
 *
 * @param updates - Record of column IDs to cell values
 * @param columns - Array of column metadata
 * @throws {FormulaColumnWriteError} If any formula columns are in updates
 */
export function validateWritableColumns(
  updates: Record<string, unknown>,
  columns: ColumnMetadata[]
): void {
  const formulaColumns: string[] = []

  for (const colId of Object.keys(updates)) {
    const column = columns.find((c) => c.id === colId)

    // If column doesn't exist, let Grist handle the error
    if (!column) {
      continue
    }

    // Check if column is read-only formula
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

/**
 * Creates actionable error message for formula column write attempts
 */
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

/**
 * Gets list of writable column IDs from column metadata
 *
 * @param columns - Array of column metadata
 * @returns Set of writable column IDs
 */
export function getWritableColumnIds(columns: ColumnMetadata[]): Set<string> {
  const writableIds = new Set<string>()

  for (const column of columns) {
    if (isWritableColumn(column)) {
      writableIds.add(column.id)
    }
  }

  return writableIds
}

/**
 * Gets list of formula (read-only) column IDs from column metadata
 *
 * @param columns - Array of column metadata
 * @returns Set of formula column IDs
 */
export function getFormulaColumnIds(columns: ColumnMetadata[]): Set<string> {
  const formulaIds = new Set<string>()

  for (const column of columns) {
    if (!isWritableColumn(column)) {
      formulaIds.add(column.id)
    }
  }

  return formulaIds
}
