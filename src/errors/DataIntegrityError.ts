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
// Formatting Helpers
// =============================================================================

/**
 * Formats items truncated to a limit, with "and N more" suffix.
 * Optional formatter transforms each item (e.g., wrapping in quotes).
 */
function formatTruncatedItems<T>(
  items: T[],
  limit: number,
  formatter?: (item: T) => string
): string {
  const format = formatter ?? String
  const shown = items.slice(0, limit).map(format).join(', ')
  const remaining = items.length - limit
  return remaining > 0 ? `${shown} and ${remaining} more` : shown
}

/**
 * Formats a "Valid IDs: [...]" hint or a count summary.
 */
function formatValidIdsHint(validRowIds: number[] | undefined, limit: number): string {
  if (!validRowIds) return ''
  if (validRowIds.length <= limit) return `. Valid IDs: [${validRowIds.join(', ')}]`
  return `. ${validRowIds.length} valid IDs exist`
}

/**
 * Formats choices as quoted strings with optional truncation.
 */
function formatChoicesDisplay(choices: string[], limit: number): string {
  return formatTruncatedItems(choices, limit, (c) => `"${c}"`)
}

// =============================================================================
// Constructor messages
// =============================================================================

function buildMessage(kind: DataIntegrityKind, tableId: string, d: DataIntegrityDetails): string {
  switch (kind) {
    case 'invalid_reference':
      return `Invalid reference in column "${d.columnId}": row ID ${d.value} does not exist in table "${d.refTableId}"${formatValidIdsHint(d.validRowIds, 10)}`
    case 'invalid_reflist':
      return `Invalid references in column "${d.columnId}": row IDs [${formatTruncatedItems(d.invalidValues as number[], 5)}] do not exist in table "${d.refTableId}"`
    case 'invalid_choice': {
      const choices = d.allowedChoices ?? []
      const choicesStr =
        choices.length <= 10
          ? `[${formatChoicesDisplay(choices, 10)}]`
          : `${choices.length} choices defined`
      return `Invalid choice in column "${d.columnId}": "${d.value}" is not in allowed choices ${choicesStr}`
    }
    case 'invalid_choicelist':
      return `Invalid choices in column "${d.columnId}": [${formatTruncatedItems(d.invalidValues as string[], 5, (v) => `"${v}"`)}] not in allowed choices`
    case 'row_not_found':
      return `Row ID(s) not found: [${formatTruncatedItems(d.rowIds ?? [], 10)}] in table "${tableId}"`
  }
}

// =============================================================================
// User messages
// =============================================================================

function formatValidIdsSection(d: DataIntegrityDetails): string {
  if (!d.validRowIds) return ''
  if (d.validRowIds.length <= 20)
    return `\nValid row IDs in "${d.refTableId}": [${d.validRowIds.join(', ')}]`
  return `\nTable "${d.refTableId}" has ${d.validRowIds.length} rows`
}

function buildUserMessage(
  kind: DataIntegrityKind,
  tableId: string,
  d: DataIntegrityDetails
): string {
  switch (kind) {
    case 'invalid_reference':
      return (
        `Invalid reference value in column "${d.columnId}"\n\n` +
        `Row ID ${d.value} does not exist in referenced table "${d.refTableId}"${formatValidIdsSection(d)}\n\n` +
        `The Ref column expects a valid row ID from the referenced table.`
      )
    case 'invalid_reflist':
      return (
        `Invalid reference values in RefList column "${d.columnId}"\n\n` +
        `Row IDs [${formatTruncatedItems(d.invalidValues as number[], 10)}] do not exist in referenced table "${d.refTableId}"\n\n` +
        `RefList columns expect an array of valid row IDs from the referenced table.`
      )
    case 'invalid_choice':
      return (
        `Invalid value for Choice column "${d.columnId}"\n\n` +
        `Value "${d.value}" is not in the allowed choices.\n` +
        `Allowed choices: [${formatChoicesDisplay(d.allowedChoices ?? [], 20)}]\n\n` +
        `Choice columns only accept values from the predefined list.`
      )
    case 'invalid_choicelist':
      return (
        `Invalid values for ChoiceList column "${d.columnId}"\n\n` +
        `Values [${formatTruncatedItems(d.invalidValues as string[], 10, (v) => `"${v}"`)}] are not in the allowed choices.\n` +
        `Allowed choices: [${formatChoicesDisplay(d.allowedChoices ?? [], 20)}]\n\n` +
        `ChoiceList columns only accept arrays of values from the predefined list.`
      )
    case 'row_not_found':
      return (
        `Row ID(s) not found in table "${tableId}"\n\n` +
        `Missing row IDs: [${formatTruncatedItems(d.rowIds ?? [], 20)}]\n\n` +
        `These rows may have been deleted or the IDs may be incorrect.`
      )
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
