/**
 * Document Management Tool (Refactored with Base Class)
 *
 * REFACTORED VERSION using GristTool base class
 * Reduces code from ~81 lines to ~65 lines (-20% reduction)
 */

import { z } from 'zod'
import { DocIdSchema, ResponseFormatSchema, WorkspaceIdSchema } from '../schemas/common.js'
import type { GristClient } from '../services/grist-client.js'
import { GristTool } from './base/GristTool.js'

// ============================================================================
// GRIST_CREATE_DOCUMENT (Refactored)
// ============================================================================

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

export class CreateDocumentTool extends GristTool<typeof CreateDocumentSchema, any> {
  constructor(client: GristClient) {
    super(client, CreateDocumentSchema)
  }

  protected async executeInternal(params: CreateDocumentInput) {
    // Build request body
    const requestBody: any = {
      name: params.name
    }

    // If forking, include source document ID
    if (params.forkFromDocId) {
      requestBody.sourceDocumentId = params.forkFromDocId
    }

    // Create document via POST /workspaces/{workspaceId}/docs
    const response = await this.client.post<string>(
      `/workspaces/${params.workspaceId}/docs`,
      requestBody
    )

    // Response is just the document ID as a string
    const docId = typeof response === 'string' ? response : (response as any).id
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

export async function createDocument(client: GristClient, params: CreateDocumentInput) {
  const tool = new CreateDocumentTool(client)
  return tool.execute(params)
}
