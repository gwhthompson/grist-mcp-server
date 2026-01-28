import { GristError } from './GristError.js'

/** Regex to strip numbered list prefixes (e.g., "1. ", "2. ") */
const NUMBERED_PREFIX_REGEX = /^\d+\.\s*/

export type ResourceType = 'document' | 'table' | 'workspace' | 'column' | 'record' | 'organization'

export class NotFoundError extends GristError {
  constructor(
    public readonly resourceType: ResourceType,
    public readonly resourceId: string,
    context?: Record<string, unknown>
  ) {
    super(`${resourceType} not found: ${resourceId}`, 'NOT_FOUND', context)
  }

  toUserMessage(): string {
    const details = this.getDetailedSuggestions()
    return (
      `${this.resourceType} not found (ID: '${this.resourceId}')\n\n` +
      `Possible causes:\n${details.causes.join('\n')}\n\n` +
      `Next steps:\n${details.nextSteps.join('\n')}`
    )
  }

  isRetryable(): boolean {
    return false
  }

  getSuggestions(): string[] {
    const details = this.getDetailedSuggestions()
    // Return just the actionable next steps as suggestions
    return details.nextSteps.map((s) => s.replace(NUMBERED_PREFIX_REGEX, ''))
  }

  private getDetailedSuggestions(): { causes: string[]; nextSteps: string[] } {
    switch (this.resourceType) {
      case 'document':
        return {
          causes: [
            '- Invalid document ID',
            '- No access permission to this document',
            '- Document was deleted or moved'
          ],
          nextSteps: [
            '1. Use grist_get_documents to see available documents',
            '2. Verify the document ID matches exactly (case-sensitive)',
            '3. Check that your API key has the required permissions',
            '4. Confirm you have access to the workspace containing this document'
          ]
        }
      case 'table':
        return {
          causes: [
            '- Invalid table ID (check spelling/case)',
            '- Table was deleted or renamed',
            '- Looking in the wrong document'
          ],
          nextSteps: [
            '1. Use grist_get_tables to see available tables in the document',
            '2. Verify the table ID matches exactly (case-sensitive)',
            "3. Confirm you're using the correct document ID"
          ]
        }
      case 'workspace':
        return {
          causes: [
            '- Invalid workspace ID',
            '- No access permission to this workspace',
            '- Workspace was deleted'
          ],
          nextSteps: [
            '1. Use grist_get_workspaces to see available workspaces',
            '2. Verify the workspace ID matches exactly',
            '3. Check that your API key has access to this workspace'
          ]
        }
      case 'column':
        return {
          causes: [
            '- Invalid column ID',
            '- Column was deleted or renamed',
            '- Wrong table specified'
          ],
          nextSteps: [
            '1. Use grist_get_tables to see column definitions',
            '2. Check the column ID spelling and case',
            "3. Verify you're looking in the correct table"
          ]
        }
      case 'record':
        return {
          causes: ['- Invalid record ID', '- Record was deleted', '- Wrong table specified'],
          nextSteps: [
            '1. Use grist_read_records to see available records',
            '2. Verify the record ID is correct',
            "3. Check that you're querying the correct table"
          ]
        }
      case 'organization':
        return {
          causes: [
            '- Invalid organization ID',
            '- No access to this organization',
            "- Organization doesn't exist"
          ],
          nextSteps: [
            '1. Use grist_get_workspaces to see available organizations',
            '2. Verify your API key has the correct permissions'
          ]
        }
      default:
        return {
          causes: ['- Resource not found or inaccessible'],
          nextSteps: ['1. Verify the resource ID and try again']
        }
    }
  }
}
