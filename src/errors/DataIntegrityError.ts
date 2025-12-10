/**
 * Data integrity errors for validation of Ref/Choice values and row existence.
 * These errors indicate client-side validation failures, not server errors.
 */

import { GristError } from './GristError.js'

/**
 * Base class for data integrity validation errors.
 * All data integrity errors are non-retryable (user must fix the data).
 */
export abstract class DataIntegrityError extends GristError {
  public readonly tableId: string

  constructor(message: string, code: string, tableId: string, context?: Record<string, unknown>) {
    super(message, code, { ...context, tableId })
    this.tableId = tableId
  }

  isRetryable(): boolean {
    return false
  }
}

/**
 * Error thrown when a Ref column value references a non-existent row.
 */
export class InvalidReferenceError extends DataIntegrityError {
  constructor(
    public readonly columnId: string,
    public readonly value: number,
    public readonly refTableId: string,
    tableId: string,
    public readonly validRowIds?: number[]
  ) {
    const validIdsHint =
      validRowIds && validRowIds.length <= 10
        ? `. Valid IDs: [${validRowIds.join(', ')}]`
        : validRowIds
          ? `. ${validRowIds.length} valid IDs exist`
          : ''
    super(
      `Invalid reference in column "${columnId}": row ID ${value} does not exist in table "${refTableId}"${validIdsHint}`,
      'INVALID_REFERENCE',
      tableId,
      { columnId, value, refTableId, validRowIdsCount: validRowIds?.length }
    )
  }

  toUserMessage(): string {
    const validIdsSection =
      this.validRowIds && this.validRowIds.length <= 20
        ? `\nValid row IDs in "${this.refTableId}": [${this.validRowIds.join(', ')}]`
        : this.validRowIds
          ? `\nTable "${this.refTableId}" has ${this.validRowIds.length} rows`
          : ''

    return (
      `Invalid reference value in column "${this.columnId}"\n\n` +
      `Row ID ${this.value} does not exist in referenced table "${this.refTableId}"${validIdsSection}\n\n` +
      `The Ref column expects a valid row ID from the referenced table.`
    )
  }

  getSuggestions(): string[] {
    return [
      `Use grist_get_records with tableId="${this.refTableId}" to find valid row IDs`,
      'Ref columns require positive integer row IDs that exist in the referenced table',
      'Use 0 to clear the reference (empty value)'
    ]
  }
}

/**
 * Error thrown when a RefList column contains invalid row IDs.
 */
export class InvalidRefListError extends DataIntegrityError {
  constructor(
    public readonly columnId: string,
    public readonly invalidValues: number[],
    public readonly refTableId: string,
    tableId: string,
    public readonly validRowIds?: number[]
  ) {
    const invalidStr = invalidValues.slice(0, 5).join(', ')
    const moreStr = invalidValues.length > 5 ? ` and ${invalidValues.length - 5} more` : ''
    super(
      `Invalid references in column "${columnId}": row IDs [${invalidStr}${moreStr}] do not exist in table "${refTableId}"`,
      'INVALID_REFLIST',
      tableId,
      {
        columnId,
        invalidValues,
        refTableId,
        invalidCount: invalidValues.length,
        validRowIdsCount: validRowIds?.length
      }
    )
  }

  toUserMessage(): string {
    const invalidStr =
      this.invalidValues.length <= 10
        ? this.invalidValues.join(', ')
        : `${this.invalidValues.slice(0, 10).join(', ')} and ${this.invalidValues.length - 10} more`

    return (
      `Invalid reference values in RefList column "${this.columnId}"\n\n` +
      `Row IDs [${invalidStr}] do not exist in referenced table "${this.refTableId}"\n\n` +
      `RefList columns expect an array of valid row IDs from the referenced table.`
    )
  }

  getSuggestions(): string[] {
    return [
      `Use grist_get_records with tableId="${this.refTableId}" to find valid row IDs`,
      'RefList columns require arrays of positive integer row IDs',
      'Use an empty array [] to clear all references'
    ]
  }
}

/**
 * Error thrown when a Choice column value is not in the allowed choices.
 */
export class InvalidChoiceError extends DataIntegrityError {
  constructor(
    public readonly columnId: string,
    public readonly value: string,
    public readonly allowedChoices: string[],
    tableId: string
  ) {
    const choicesStr =
      allowedChoices.length <= 10
        ? `[${allowedChoices.map((c) => `"${c}"`).join(', ')}]`
        : `${allowedChoices.length} choices defined`
    super(
      `Invalid choice in column "${columnId}": "${value}" is not in allowed choices ${choicesStr}`,
      'INVALID_CHOICE',
      tableId,
      { columnId, value, allowedChoices }
    )
  }

  toUserMessage(): string {
    const choicesDisplay =
      this.allowedChoices.length <= 20
        ? this.allowedChoices.map((c) => `"${c}"`).join(', ')
        : `${this.allowedChoices
            .slice(0, 20)
            .map((c) => `"${c}"`)
            .join(', ')} and ${this.allowedChoices.length - 20} more`

    return (
      `Invalid value for Choice column "${this.columnId}"\n\n` +
      `Value "${this.value}" is not in the allowed choices.\n` +
      `Allowed choices: [${choicesDisplay}]\n\n` +
      `Choice columns only accept values from the predefined list.`
    )
  }

  getSuggestions(): string[] {
    const suggestions = [
      `Use grist_get_tables with detail_level="full_schema" to see column choices`,
      'To add new choices, use grist_manage_columns to modify the column widgetOptions'
    ]

    // Suggest closest match if possible
    if (this.allowedChoices.length <= 20) {
      suggestions.unshift(`Valid choices: ${this.allowedChoices.map((c) => `"${c}"`).join(', ')}`)
    }

    return suggestions
  }
}

/**
 * Error thrown when a ChoiceList column contains invalid choices.
 */
export class InvalidChoiceListError extends DataIntegrityError {
  constructor(
    public readonly columnId: string,
    public readonly invalidValues: string[],
    public readonly allowedChoices: string[],
    tableId: string
  ) {
    const invalidStr = invalidValues
      .slice(0, 5)
      .map((v) => `"${v}"`)
      .join(', ')
    const moreStr = invalidValues.length > 5 ? ` and ${invalidValues.length - 5} more` : ''
    super(
      `Invalid choices in column "${columnId}": [${invalidStr}${moreStr}] not in allowed choices`,
      'INVALID_CHOICELIST',
      tableId,
      { columnId, invalidValues, allowedChoices, invalidCount: invalidValues.length }
    )
  }

  toUserMessage(): string {
    const invalidStr =
      this.invalidValues.length <= 10
        ? this.invalidValues.map((v) => `"${v}"`).join(', ')
        : `${this.invalidValues
            .slice(0, 10)
            .map((v) => `"${v}"`)
            .join(', ')} and ${this.invalidValues.length - 10} more`

    const choicesDisplay =
      this.allowedChoices.length <= 20
        ? this.allowedChoices.map((c) => `"${c}"`).join(', ')
        : `${this.allowedChoices
            .slice(0, 20)
            .map((c) => `"${c}"`)
            .join(', ')} and ${this.allowedChoices.length - 20} more`

    return (
      `Invalid values for ChoiceList column "${this.columnId}"\n\n` +
      `Values [${invalidStr}] are not in the allowed choices.\n` +
      `Allowed choices: [${choicesDisplay}]\n\n` +
      `ChoiceList columns only accept arrays of values from the predefined list.`
    )
  }

  getSuggestions(): string[] {
    const suggestions = [
      `Use grist_get_tables with detail_level="full_schema" to see column choices`,
      'To add new choices, use grist_manage_columns to modify the column widgetOptions'
    ]

    if (this.allowedChoices.length <= 20) {
      suggestions.unshift(`Valid choices: ${this.allowedChoices.map((c) => `"${c}"`).join(', ')}`)
    }

    return suggestions
  }
}

/**
 * Error thrown when attempting to update/delete rows that don't exist.
 */
export class RowNotFoundError extends DataIntegrityError {
  constructor(
    public readonly rowIds: number[],
    tableId: string
  ) {
    const rowIdsStr =
      rowIds.length <= 10
        ? rowIds.join(', ')
        : `${rowIds.slice(0, 10).join(', ')} and ${rowIds.length - 10} more`
    super(`Row ID(s) not found: [${rowIdsStr}] in table "${tableId}"`, 'ROW_NOT_FOUND', tableId, {
      rowIds,
      invalidCount: rowIds.length
    })
  }

  toUserMessage(): string {
    const rowIdsStr =
      this.rowIds.length <= 20
        ? this.rowIds.join(', ')
        : `${this.rowIds.slice(0, 20).join(', ')} and ${this.rowIds.length - 20} more`

    return (
      `Row ID(s) not found in table "${this.tableId}"\n\n` +
      `Missing row IDs: [${rowIdsStr}]\n\n` +
      `These rows may have been deleted or the IDs may be incorrect.`
    )
  }

  getSuggestions(): string[] {
    return [
      `Use grist_get_records with tableId="${this.tableId}" to find valid row IDs`,
      'Row IDs are positive integers assigned by Grist',
      'If the row was recently deleted, it cannot be updated'
    ]
  }
}
