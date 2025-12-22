/**
 * Document management tool using factory pattern.
 */

import { z } from 'zod'
import { type ToolDefinition, WRITE_SAFE_ANNOTATIONS } from '../registry/types.js'
import { DocIdSchema, ResponseFormatSchema, WorkspaceIdSchema } from '../schemas/common.js'
import { CreateDocumentOutputSchema } from '../schemas/output-schemas.js'
import { defineStandardTool } from './factory/index.js'

export const CreateDocumentSchema = z.strictObject({
  name: z.string().min(1).max(200),
  workspaceId: WorkspaceIdSchema,
  forkFromDocId: DocIdSchema.optional().describe('copy from existing doc'),
  response_format: ResponseFormatSchema
})

export type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>

interface CreateDocumentOutput {
  success: boolean
  docId: string
  documentName: string
  workspaceId: number
  url: string
  forkedFrom: string | null
  message: string
  nextSteps: string[]
}

/**
 * Create a new Grist document or fork an existing one.
 */
export const CREATE_DOCUMENT_TOOL = defineStandardTool<
  typeof CreateDocumentSchema,
  CreateDocumentOutput
>({
  name: 'grist_create_document',
  title: 'Create Document',
  description: 'Create a new document or fork an existing one',
  purpose: 'Create new Grist documents or copy existing ones',
  category: 'documents',
  inputSchema: CreateDocumentSchema,
  outputSchema: CreateDocumentOutputSchema,
  annotations: WRITE_SAFE_ANNOTATIONS,

  async execute(ctx, params) {
    let docId: string

    if (params.forkFromDocId) {
      const response = await ctx.client.post<string>(`/docs/${params.forkFromDocId}/copy`, {
        workspaceId: params.workspaceId,
        documentName: params.name,
        asTemplate: false
      })
      docId = typeof response === 'string' ? response : (response as { id: string }).id
    } else {
      const response = await ctx.client.post<string>(`/workspaces/${params.workspaceId}/docs`, {
        name: params.name
      })
      docId = typeof response === 'string' ? response : (response as { id: string }).id
    }

    const docUrl = `${ctx.client.getBaseUrl()}/doc/${docId}`

    return {
      success: true,
      docId,
      documentName: params.name,
      workspaceId: params.workspaceId,
      url: docUrl,
      forkedFrom: params.forkFromDocId || null,
      message: params.forkFromDocId
        ? `Successfully forked document "${params.name}" from ${params.forkFromDocId}`
        : `Successfully created new document "${params.name}"`,
      nextSteps: [
        `Use grist_get_tables with docId="${docId}" to see table structure`,
        `Use grist_manage_schema with action='create_table' to add tables`,
        `Access document at: ${docUrl}`
      ]
    }
  },

  docs: {
    overview:
      'Creates a new Grist document in a workspace. Optionally fork an existing document ' +
      'to copy its structure and data. Returns the new document ID and URL.',
    examples: [
      {
        desc: 'Create empty document',
        input: { name: 'Customer CRM', workspaceId: 123 }
      },
      {
        desc: 'Fork existing document',
        input: { name: 'Copy of CRM', workspaceId: 123, forkFromDocId: 'qBbArddFDSrKd2jpv3uZTj' }
      }
    ],
    errors: [
      { error: 'Workspace not found', solution: 'Use grist_get_workspaces to find valid IDs' },
      { error: 'Permission denied', solution: 'Verify write access to the workspace' },
      { error: 'Document not found (fork)', solution: 'Verify forkFromDocId exists' }
    ]
  }
})

// Export for handler reference (backwards compatibility)
export async function createDocument(
  context: import('../registry/types.js').ToolContext,
  params: CreateDocumentInput
) {
  return CREATE_DOCUMENT_TOOL.handler(context, params)
}

// Tool definitions array for registry
export const DOCUMENT_TOOLS: ReadonlyArray<ToolDefinition> = [CREATE_DOCUMENT_TOOL] as const
