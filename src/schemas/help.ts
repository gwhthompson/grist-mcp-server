import { z } from 'zod'
import { ResponseFormatSchema } from './common.js'
// TOOL_NAMES is auto-generated from ALL_TOOLS at build time
import { TOOL_NAMES, type ToolName } from './tool-names.generated.js'

export { TOOL_NAMES, type ToolName }

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
