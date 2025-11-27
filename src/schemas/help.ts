import { z } from 'zod'
import { ResponseFormatSchema } from './common.js'

export const TOOL_NAMES = [
  // Discovery tools
  'grist_get_workspaces',
  'grist_get_documents',
  'grist_get_tables',
  // Reading tools
  'grist_query_sql',
  'grist_get_records',
  // Record tools
  'grist_add_records',
  'grist_update_records',
  'grist_upsert_records',
  'grist_delete_records',
  // Table tools
  'grist_create_table',
  'grist_rename_table',
  'grist_delete_table',
  // Column tools
  'grist_manage_columns',
  'grist_manage_conditional_rules',
  // Summary table tools
  'grist_create_summary_table',
  // Page tools
  'grist_get_pages',
  'grist_build_page',
  'grist_configure_widget',
  'grist_update_page',
  // Document tools
  'grist_create_document',
  // Webhook tools
  'grist_manage_webhooks'
] as const

export type ToolName = (typeof TOOL_NAMES)[number]

export const HELP_TOPICS = ['overview', 'examples', 'errors', 'parameters', 'full'] as const

export type HelpTopic = (typeof HELP_TOPICS)[number]

export const HelpSchema = z
  .object({
    tool_name: z
      .enum(TOOL_NAMES)
      .describe(
        'Name of the Grist tool to get detailed documentation for. ' +
          'Example: "grist_get_records", "grist_add_records", "grist_upsert_records"'
      ),

    topic: z
      .enum(HELP_TOPICS)
      .optional()
      .default('full')
      .describe(
        'Filter documentation by topic: "overview" (~500B quick summary), ' +
          '"examples" (~800B code samples), "errors" (~400B troubleshooting), ' +
          '"parameters" (~600B detailed params), "full" (complete docs, default)'
      ),

    response_format: ResponseFormatSchema
  })
  .strict()

export type HelpInput = z.infer<typeof HelpSchema>

export interface HelpOutput {
  tool_name: string
  topic: HelpTopic
  documentation: string
  available_topics: readonly string[]
  [key: string]: unknown // Index signature for compatibility with MCPToolResponse
}
