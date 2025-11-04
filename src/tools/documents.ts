/**
 * Document Management Tool (1 tool)
 *
 * Consolidated tool for document creation and forking:
 * - grist_create_document: Create new document or fork from existing document
 *
 * Forking is consolidated into creation since forking IS creating with a template.
 */

import { z } from 'zod'
import { DocIdSchema, ResponseFormatSchema, WorkspaceIdSchema } from '../schemas/common.js'
import { formatErrorResponse, formatToolResponse } from '../services/formatter.js'
import type { GristClient } from '../services/grist-client.js'

// ============================================================================
// GRIST_CREATE_DOCUMENT
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

export async function createDocument(client: GristClient, params: CreateDocumentInput) {
  try {
    // Build request body
    const requestBody: any = {
      name: params.name
    }

    // If forking, include source document ID
    if (params.forkFromDocId) {
      requestBody.sourceDocumentId = params.forkFromDocId
    }

    // Create document via POST /workspaces/{workspaceId}/docs
    const response = await client.post<string>(
      `/workspaces/${params.workspaceId}/docs`,
      requestBody
    )

    // Response is just the document ID as a string
    const docId = typeof response === 'string' ? response : (response as any).id
    const docUrl = `${client.getBaseUrl()}/doc/${docId}`

    const result = {
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

    return formatToolResponse(result, params.response_format)
  } catch (error) {
    return formatErrorResponse(error instanceof Error ? error.message : String(error))
  }
}
