import { z } from 'zod'
import { type ToolContext, type ToolDefinition, WRITE_SAFE_ANNOTATIONS } from '../registry/types.js'
import { DocIdSchema, ResponseFormatSchema, WorkspaceIdSchema } from '../schemas/common.js'
import { CreateDocumentOutputSchema } from '../schemas/output-schemas.js'
import { GristTool } from './base/GristTool.js'

export const CreateDocumentSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(200)
      .describe(
        'Name for the new document. Example: "Customer CRM", "Q4 Sales Report", "Project Tracker"'
      ),
    workspaceId: WorkspaceIdSchema,
    forkFromDocId: DocIdSchema.optional().describe(
      'Optional: Document ID to fork from. Creates a copy with same structure and data. Omit to create blank document'
    ),
    response_format: ResponseFormatSchema
  })
  .strict()

export type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>

interface CreateDocumentOutput {
  success: boolean
  document_id: string
  document_name: string
  workspace_id: number
  url: string
  forked_from: string | null
  message: string
  next_steps: string[]
}

export class CreateDocumentTool extends GristTool<
  typeof CreateDocumentSchema,
  CreateDocumentOutput
> {
  constructor(context: ToolContext) {
    super(context, CreateDocumentSchema)
  }

  protected async executeInternal(params: CreateDocumentInput) {
    let docId: string

    if (params.forkFromDocId) {
      const response = await this.client.post<string>(`/docs/${params.forkFromDocId}/copy`, {
        workspaceId: params.workspaceId,
        documentName: params.name,
        asTemplate: false
      })
      docId = typeof response === 'string' ? response : (response as { id: string }).id
    } else {
      const response = await this.client.post<string>(`/workspaces/${params.workspaceId}/docs`, {
        name: params.name
      })
      docId = typeof response === 'string' ? response : (response as { id: string }).id
    }

    const docUrl = `${this.client.getBaseUrl()}/doc/${docId}`

    return {
      success: true,
      document_id: docId,
      document_name: params.name,
      workspace_id: params.workspaceId,
      url: docUrl,
      forked_from: params.forkFromDocId || null,
      message: params.forkFromDocId
        ? `Successfully forked document "${params.name}" from ${params.forkFromDocId}`
        : `Successfully created new document "${params.name}"`,
      next_steps: [
        `Use grist_get_tables with docId="${docId}" to see table structure`,
        `Use grist_create_table to add tables`,
        `Access document at: ${docUrl}`
      ]
    }
  }
}

export async function createDocument(context: ToolContext, params: CreateDocumentInput) {
  const tool = new CreateDocumentTool(context)
  return tool.execute(params)
}

// Tool definitions with complete documentation
export const DOCUMENT_TOOLS: ReadonlyArray<ToolDefinition> = [
  {
    name: 'grist_create_document',
    title: 'Create Document',
    description:
      'Create new document or fork existing one.\n' +
      'Params: name, workspaceId, forkFromDocId (optional - copies data)\n' +
      'Ex: {name:"Customer CRM",workspaceId:123}',
    purpose: 'Create new Grist documents or copy existing ones',
    category: 'documents',
    inputSchema: CreateDocumentSchema,
    outputSchema: CreateDocumentOutputSchema,
    annotations: WRITE_SAFE_ANNOTATIONS,
    handler: createDocument,
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
  }
] as const
