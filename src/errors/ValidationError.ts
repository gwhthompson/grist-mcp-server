import type { z } from 'zod'
import { GristError } from './GristError.js'

export class ValidationError extends GristError {
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    public readonly constraint: string,
    context?: Record<string, unknown>
  ) {
    super(`Validation failed for ${field}: ${constraint}`, 'VALIDATION_ERROR', {
      ...context,
      field,
      value,
      constraint
    })
  }

  toUserMessage(): string {
    const valueStr = typeof this.value === 'string' ? `"${this.value}"` : JSON.stringify(this.value)

    return (
      `Invalid value for parameter '${this.field}'\n\n` +
      `Constraint: ${this.constraint}\n` +
      `Received: ${valueStr}\n\n` +
      `Please check the parameter documentation and provide a valid value.`
    )
  }

  isRetryable(): boolean {
    return false
  }

  getSuggestions(): string[] {
    const suggestions: string[] = []
    const fieldLower = this.field.toLowerCase()

    // Document ID suggestions
    if (fieldLower === 'docid' || fieldLower.includes('documentid')) {
      suggestions.push('Use grist_get_documents to find valid document IDs')
      suggestions.push(
        'Document IDs are 22-character Base58 strings (e.g., "aKt7TZe8YGLp3ak8bDL8TZ")'
      )
    }

    // Table ID suggestions
    if (fieldLower === 'tableid' || fieldLower.includes('tablename')) {
      suggestions.push('Use grist_get_tables with the docId to list available tables')
      suggestions.push('Table names must start with uppercase and use Python identifier rules')
    }

    // Column ID suggestions
    if (
      fieldLower === 'colid' ||
      fieldLower.includes('columnid') ||
      fieldLower.includes('column')
    ) {
      suggestions.push('Use grist_get_tables with detail_level="columns" to see column names')
      suggestions.push(
        'Column names follow Python identifier rules (letters, numbers, underscores)'
      )
    }

    // Row ID suggestions
    if (fieldLower === 'rowid' || fieldLower.includes('rowids')) {
      suggestions.push('Use grist_get_records to find row IDs for existing records')
      suggestions.push('Row IDs are positive integers assigned by Grist')
    }

    // Workspace ID suggestions
    if (fieldLower === 'workspaceid') {
      suggestions.push('Use grist_get_workspaces to find valid workspace IDs')
      suggestions.push('Workspace IDs are positive integers')
    }

    // Widget options suggestions
    if (fieldLower.includes('widgetoptions')) {
      suggestions.push(
        'Use grist_get_tables with detail_level="full_schema" to see existing widget options'
      )
      suggestions.push(
        'Call grist_help with tool_name="grist_manage_columns" for widget options examples'
      )
    }

    // Type-related suggestions
    if (fieldLower === 'type' || fieldLower.includes('columntype')) {
      suggestions.push(
        'Valid column types: Text, Numeric, Int, Bool, Date, DateTime, Choice, ChoiceList, Ref:TableName, RefList:TableName'
      )
    }

    // Generic fallback
    if (suggestions.length === 0) {
      suggestions.push(`Call grist_help for documentation on the parameter "${this.field}"`)
    }

    return suggestions
  }

  static fromZodError(error: z.ZodError, field: string = 'unknown'): ValidationError {
    const issues = error.issues || []
    const firstIssue = issues[0]

    if (firstIssue) {
      const path = firstIssue.path.join('.')
      const received = 'received' in firstIssue ? firstIssue.received : undefined
      return new ValidationError(path || field, received, firstIssue.message, { zodIssues: issues })
    }

    return new ValidationError(field, undefined, error.message || 'Validation failed')
  }
}
