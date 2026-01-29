/**
 * Data integrity errors for validation of Ref/Choice values and row existence.
 * Uses a kind discriminant instead of subclasses for simpler hierarchy.
 */

import { GristError } from './GristError.js'

export type DataIntegrityKind =
  | 'invalid_reference'
  | 'invalid_reflist'
  | 'invalid_choice'
  | 'invalid_choicelist'
  | 'row_not_found'

interface DataIntegrityDetails {
  columnId?: string
  value?: number | string
  invalidValues?: number[] | string[]
  refTableId?: string
  allowedChoices?: string[]
  validRowIds?: number[]
  rowIds?: number[]
}

/**
 * Unified data integrity validation error.
 * All data integrity errors are non-retryable (user must fix the data).
 */
export class DataIntegrityError extends GristError {
  public readonly tableId: string
  public readonly kind: DataIntegrityKind
  public readonly details: DataIntegrityDetails

  constructor(
    kind: DataIntegrityKind,
    tableId: string,
    details: DataIntegrityDetails,
    context?: Record<string, unknown>
  ) {
    const message = buildMessage(kind, tableId, details)
    const code = kindToCode(kind)
    super(message, code, { ...context, tableId, kind, ...details })
    this.tableId = tableId
    this.kind = kind
    this.details = details
  }

  isRetryable(): boolean {
    return false
  }

  toUserMessage(): string {
    return buildUserMessage(this.kind, this.tableId, this.details)
  }

  getSuggestions(): string[] {
    return buildSuggestions(this.kind, this.tableId, this.details)
  }
}

// =============================================================================
// Code mapping
// =============================================================================

function kindToCode(kind: DataIntegrityKind): string {
  switch (kind) {
    case 'invalid_reference':
      return 'INVALID_REFERENCE'
    case 'invalid_reflist':
      return 'INVALID_REFLIST'
    case 'invalid_choice':
      return 'INVALID_CHOICE'
    case 'invalid_choicelist':
      return 'INVALID_CHOICELIST'
    case 'row_not_found':
      return 'ROW_NOT_FOUND'
  }
}

// =============================================================================
// Constructor messages
// =============================================================================

function buildMessage(kind: DataIntegrityKind, tableId: string, d: DataIntegrityDetails): string {
  switch (kind) {
    case 'invalid_reference': {
      const validIdsHint =
        d.validRowIds && d.validRowIds.length <= 10
          ? `. Valid IDs: [${d.validRowIds.join(', ')}]`
          : d.validRowIds
            ? `. ${d.validRowIds.length} valid IDs exist`
            : ''
      return `Invalid reference in column "${d.columnId}": row ID ${d.value} does not exist in table "${d.refTableId}"${validIdsHint}`
    }
    case 'invalid_reflist': {
      const vals = d.invalidValues as number[]
      const invalidStr = vals.slice(0, 5).join(', ')
      const moreStr = vals.length > 5 ? ` and ${vals.length - 5} more` : ''
      return `Invalid references in column "${d.columnId}": row IDs [${invalidStr}${moreStr}] do not exist in table "${d.refTableId}"`
    }
    case 'invalid_choice': {
      const choices = d.allowedChoices ?? []
      const choicesStr =
        choices.length <= 10
          ? `[${choices.map((c) => `"${c}"`).join(', ')}]`
          : `${choices.length} choices defined`
      return `Invalid choice in column "${d.columnId}": "${d.value}" is not in allowed choices ${choicesStr}`
    }
    case 'invalid_choicelist': {
      const vals = d.invalidValues as string[]
      const invalidStr = vals
        .slice(0, 5)
        .map((v) => `"${v}"`)
        .join(', ')
      const moreStr = vals.length > 5 ? ` and ${vals.length - 5} more` : ''
      return `Invalid choices in column "${d.columnId}": [${invalidStr}${moreStr}] not in allowed choices`
    }
    case 'row_not_found': {
      const rowIds = d.rowIds ?? []
      const rowIdsStr =
        rowIds.length <= 10
          ? rowIds.join(', ')
          : `${rowIds.slice(0, 10).join(', ')} and ${rowIds.length - 10} more`
      return `Row ID(s) not found: [${rowIdsStr}] in table "${tableId}"`
    }
  }
}

// =============================================================================
// User messages
// =============================================================================

function buildUserMessage(
  kind: DataIntegrityKind,
  tableId: string,
  d: DataIntegrityDetails
): string {
  switch (kind) {
    case 'invalid_reference': {
      const validIdsSection =
        d.validRowIds && d.validRowIds.length <= 20
          ? `\nValid row IDs in "${d.refTableId}": [${d.validRowIds.join(', ')}]`
          : d.validRowIds
            ? `\nTable "${d.refTableId}" has ${d.validRowIds.length} rows`
            : ''
      return (
        `Invalid reference value in column "${d.columnId}"\n\n` +
        `Row ID ${d.value} does not exist in referenced table "${d.refTableId}"${validIdsSection}\n\n` +
        `The Ref column expects a valid row ID from the referenced table.`
      )
    }
    case 'invalid_reflist': {
      const vals = d.invalidValues as number[]
      const invalidStr =
        vals.length <= 10
          ? vals.join(', ')
          : `${vals.slice(0, 10).join(', ')} and ${vals.length - 10} more`
      return (
        `Invalid reference values in RefList column "${d.columnId}"\n\n` +
        `Row IDs [${invalidStr}] do not exist in referenced table "${d.refTableId}"\n\n` +
        `RefList columns expect an array of valid row IDs from the referenced table.`
      )
    }
    case 'invalid_choice': {
      const choices = d.allowedChoices ?? []
      const choicesDisplay =
        choices.length <= 20
          ? choices.map((c) => `"${c}"`).join(', ')
          : `${choices
              .slice(0, 20)
              .map((c) => `"${c}"`)
              .join(', ')} and ${choices.length - 20} more`
      return (
        `Invalid value for Choice column "${d.columnId}"\n\n` +
        `Value "${d.value}" is not in the allowed choices.\n` +
        `Allowed choices: [${choicesDisplay}]\n\n` +
        `Choice columns only accept values from the predefined list.`
      )
    }
    case 'invalid_choicelist': {
      const vals = d.invalidValues as string[]
      const choices = d.allowedChoices ?? []
      const invalidStr =
        vals.length <= 10
          ? vals.map((v) => `"${v}"`).join(', ')
          : `${vals
              .slice(0, 10)
              .map((v) => `"${v}"`)
              .join(', ')} and ${vals.length - 10} more`
      const choicesDisplay =
        choices.length <= 20
          ? choices.map((c) => `"${c}"`).join(', ')
          : `${choices
              .slice(0, 20)
              .map((c) => `"${c}"`)
              .join(', ')} and ${choices.length - 20} more`
      return (
        `Invalid values for ChoiceList column "${d.columnId}"\n\n` +
        `Values [${invalidStr}] are not in the allowed choices.\n` +
        `Allowed choices: [${choicesDisplay}]\n\n` +
        `ChoiceList columns only accept arrays of values from the predefined list.`
      )
    }
    case 'row_not_found': {
      const rowIds = d.rowIds ?? []
      const rowIdsStr =
        rowIds.length <= 20
          ? rowIds.join(', ')
          : `${rowIds.slice(0, 20).join(', ')} and ${rowIds.length - 20} more`
      return (
        `Row ID(s) not found in table "${tableId}"\n\n` +
        `Missing row IDs: [${rowIdsStr}]\n\n` +
        `These rows may have been deleted or the IDs may be incorrect.`
      )
    }
  }
}

// =============================================================================
// Suggestions
// =============================================================================

function buildSuggestions(
  kind: DataIntegrityKind,
  tableId: string,
  d: DataIntegrityDetails
): string[] {
  switch (kind) {
    case 'invalid_reference':
      return [
        `Use grist_get_records with tableId="${d.refTableId}" to find valid row IDs`,
        'Ref columns require positive integer row IDs that exist in the referenced table',
        'Use 0 to clear the reference (empty value)'
      ]
    case 'invalid_reflist':
      return [
        `Use grist_get_records with tableId="${d.refTableId}" to find valid row IDs`,
        'RefList columns require arrays of positive integer row IDs',
        'Use an empty array [] to clear all references'
      ]
    case 'invalid_choice': {
      const choices = d.allowedChoices ?? []
      const suggestions = [
        `Use grist_get_tables with detail_level="full_schema" to see column choices`,
        'To add new choices, use grist_manage_columns to modify the column widgetOptions'
      ]
      if (choices.length <= 20) {
        suggestions.unshift(`Valid choices: ${choices.map((c) => `"${c}"`).join(', ')}`)
      }
      return suggestions
    }
    case 'invalid_choicelist': {
      const choices = d.allowedChoices ?? []
      const suggestions = [
        `Use grist_get_tables with detail_level="full_schema" to see column choices`,
        'To add new choices, use grist_manage_columns to modify the column widgetOptions'
      ]
      if (choices.length <= 20) {
        suggestions.unshift(`Valid choices: ${choices.map((c) => `"${c}"`).join(', ')}`)
      }
      return suggestions
    }
    case 'row_not_found':
      return [
        `Use grist_get_records with tableId="${tableId}" to find valid row IDs`,
        'Row IDs are positive integers assigned by Grist',
        'If the row was recently deleted, it cannot be updated'
      ]
  }
}
