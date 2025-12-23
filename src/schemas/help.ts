import { z } from 'zod'
import { parseJsonString, ResponseFormatSchema } from './common.js'
// TOOL_NAMES is auto-generated from ALL_TOOLS at build time
import { TOOL_NAMES, type ToolName } from './tool-names.generated.js'

export { TOOL_NAMES, type ToolName }

// =============================================================================
// Help Content Sections
// =============================================================================

export const HELP_SECTIONS = ['overview', 'examples', 'errors', 'schema'] as const
export type HelpSection = (typeof HELP_SECTIONS)[number]

// Legacy topics for backward compatibility
export const HELP_TOPICS = ['overview', 'examples', 'errors', 'parameters', 'full'] as const
export type HelpTopic = (typeof HELP_TOPICS)[number]

/**
 * Parse tool names from various LLM formats:
 * - JSON string: '["grist_help", "grist_manage_records"]'
 * - Comma-separated: 'grist_help,grist_manage_records'
 * - Single string: 'grist_help'
 */
function parseToolNames(val: unknown): unknown {
  if (typeof val === 'string') {
    // Try JSON first
    try {
      return JSON.parse(val)
    } catch {
      // Then comma-separated
      if (val.includes(',')) {
        return val.split(',').map((s) => s.trim())
      }
    }
  }
  return val
}

// =============================================================================
// Help Input Schema
// =============================================================================

/**
 * Unified help schema for progressive disclosure.
 *
 * Usage patterns:
 * - grist_help() → Discovery: list all tools with summaries
 * - grist_help({tools: "grist_manage_schema"}) → Full docs + schema for one tool
 * - grist_help({tools: ["grist_manage_schema", "grist_manage_records"]}) → Batch with dedup
 * - grist_help({tools: "grist_manage_schema", only: ["schema"]}) → Schema only
 *
 * Legacy: tool_name + topic params still work for backward compatibility.
 */
export const HelpSchema = z
  .object({
    // Tool names array for detailed help
    tools: z
      .preprocess(
        parseToolNames, // Handle JSON strings AND comma-separated: "a,b" → ["a","b"]
        z.array(z.enum(TOOL_NAMES)).min(1).max(11)
      )
      .optional()
      .describe('Tool names array for detailed help. Omit to list all tools.'),

    only: z
      .preprocess(
        parseJsonString, // Handle stringified arrays: '["schema"]' → ["schema"]
        z.array(z.enum(HELP_SECTIONS))
      )
      .optional()
      .describe('Filter to specific sections. Default: all sections.'),

    // Legacy API (deprecated but still supported)
    tool_name: z.enum(TOOL_NAMES).optional().describe('DEPRECATED: Use "tools" instead'),

    topic: z.enum(HELP_TOPICS).optional().describe('DEPRECATED: Use "only" instead'),

    response_format: ResponseFormatSchema
  })
  .refine(
    (data) => {
      // If legacy params provided without new params, allow it
      if (data.tool_name && !data.tools) return true
      // Otherwise, allow anything (new API or empty for discovery)
      return true
    },
    { message: 'Invalid help request' }
  )

export type HelpInput = z.infer<typeof HelpSchema>

// =============================================================================
// Help Output Types
// =============================================================================

/**
 * Tool example for help documentation.
 */
export interface ToolExample {
  readonly description: string
  readonly input: Record<string, unknown>
}

/**
 * Tool error documentation.
 */
export interface ToolError {
  readonly error: string
  readonly cause?: string
  readonly solution: string
}

/**
 * Help for a single tool.
 */
export interface ToolHelp {
  readonly name: string
  readonly overview?: string
  readonly examples?: readonly ToolExample[]
  readonly errors?: readonly ToolError[]
  readonly schema?: Record<string, unknown>
}

/**
 * Discovery response (no tools specified).
 */
export interface DiscoveryResponse {
  readonly tools: ReadonlyArray<{
    readonly name: string
    readonly summary: string
    readonly category: string
  }>
  readonly workflow: string
  readonly tip: string
}

/**
 * Help response (tools specified).
 */
export interface HelpResponse {
  // For discovery mode (no tools specified)
  readonly discovery?: DiscoveryResponse

  // For tool help mode (tools specified)
  readonly tools?: Readonly<Record<string, ToolHelp>>

  // Smart dedup definitions (only when multiple tools + schema)
  readonly $defs?: Readonly<Record<string, unknown>>

  // Index signature for MCPToolResponse compatibility
  readonly [key: string]: unknown
}

// Legacy output type for backward compatibility
export interface HelpOutput {
  toolName: string
  topic: HelpTopic
  documentation: string
  availableTopics: readonly string[]
  nextSteps?: string[]
  [key: string]: unknown
}
