import type { z } from 'zod'
import { GristError } from './GristError.js'

/**
 * Suggestion rule: pattern matcher + suggestions to add.
 */
interface SuggestionRule {
  match: (field: string, constraint: string) => boolean
  suggestions: string[]
}

/**
 * Table-driven suggestion rules for validation errors.
 * Each rule has a match function and associated suggestions.
 */
const SUGGESTION_RULES: SuggestionRule[] = [
  {
    match: (f) => f === 'docid' || f.includes('documentid'),
    suggestions: [
      'Use grist_get_documents to find valid document IDs',
      'Document IDs are 22-character Base58 strings (e.g., "aKt7TZe8YGLp3ak8bDL8TZ")'
    ]
  },
  {
    match: (f) => f === 'tableid' || f.includes('tablename'),
    suggestions: [
      'Use grist_get_tables with the docId to list available tables',
      'Table names must start with uppercase and use Python identifier rules'
    ]
  },
  {
    match: (f, c) => f === 'name' && c.includes('required'),
    suggestions: [
      'Table name is required: {"name": "Tasks", "columns": [...]}',
      'Alias: {"tableId": "Tasks", ...} also accepted'
    ]
  },
  {
    match: (f) => f === 'colid' || f.includes('columnid') || f.includes('column'),
    suggestions: [
      'Use grist_get_tables with detail_level="columns" to see column names',
      'Column names follow Python identifier rules (letters, numbers, underscores)',
      'Column format: {"colId": "Name", "type": "Text"}'
    ]
  },
  {
    match: (f) => f === 'rowid' || f.includes('rowids'),
    suggestions: [
      'Use grist_get_records to find row IDs for existing records',
      'Row IDs are positive integers assigned by Grist'
    ]
  },
  {
    match: (f) => f === 'workspaceid',
    suggestions: [
      'Use grist_get_workspaces to find valid workspace IDs',
      'Workspace IDs are positive integers'
    ]
  },
  {
    match: (f) => f.includes('widgetoptions'),
    suggestions: [
      'Use grist_get_tables with detail_level="full_schema" to see existing widget options',
      'Call grist_help with tool_name="grist_manage_columns" for widget options examples'
    ]
  },
  {
    match: (f) => f === 'type' || f.includes('columntype'),
    suggestions: [
      'Valid column types: Text, Numeric, Int, Bool, Date, DateTime, Choice, ChoiceList, Ref:TableName, RefList:TableName'
    ]
  },
  {
    match: (f, c) => f.includes('fields') && c.includes('required'),
    suggestions: [
      'Update records require {id, fields} format: {id: 1, fields: {Status: "Done"}}',
      'NOT flat format: {id: 1, Status: "Done"} (fields property is required)'
    ]
  },
  {
    match: (f, c) => f === 'records' && c.includes('array'),
    suggestions: ['Records must be an array: [{"Name": "Alice"}, {"Name": "Bob"}]']
  }
]

export class ValidationError extends GristError {
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    public readonly constraint: string,
    context?: Record<string, unknown>,
    public readonly schemaHint?: string
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

    const hint = this.schemaHint ? `\n\n${this.schemaHint}` : ''

    return (
      `Invalid value for parameter '${this.field}'\n\n` +
      `Constraint: ${this.constraint}\n` +
      `Received: ${valueStr}\n\n` +
      `Please check the parameter documentation and provide a valid value.${hint}`
    )
  }

  isRetryable(): boolean {
    return false
  }

  getSuggestions(): string[] {
    const suggestions: string[] = []
    const fieldLower = this.field.toLowerCase()
    const constraintLower = this.constraint.toLowerCase()

    // Apply matching rules
    for (const rule of SUGGESTION_RULES) {
      if (rule.match(fieldLower, constraintLower)) {
        suggestions.push(...rule.suggestions)
      }
    }

    // Generic fallback
    if (suggestions.length === 0) {
      suggestions.push(`Call grist_help for documentation on the parameter "${this.field}"`)
    }

    return suggestions
  }

  static fromZodError(
    error: z.ZodError,
    field: string = 'unknown',
    toolName?: string
  ): ValidationError {
    const issues = error.issues || []
    const firstIssue = issues[0]
    const schemaHint = toolName
      ? `Use grist_help({tools: ["${toolName}"]}) for full parameter documentation.`
      : undefined

    if (firstIssue) {
      const path = firstIssue.path.join('.')
      const received = 'received' in firstIssue ? firstIssue.received : undefined
      return new ValidationError(
        path || field,
        received,
        firstIssue.message,
        { zodIssues: issues },
        schemaHint
      )
    }

    return new ValidationError(
      field,
      undefined,
      error.message || 'Validation failed',
      undefined,
      schemaHint
    )
  }
}
