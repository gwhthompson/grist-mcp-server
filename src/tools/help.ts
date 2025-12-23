import { z } from 'zod'
import { READ_ONLY_ANNOTATIONS, type ToolDefinition } from '../registry/types.js'
import {
  type DiscoveryResponse,
  HELP_SECTIONS,
  HELP_TOPICS,
  type HelpInput,
  type HelpOutput,
  type HelpResponse,
  HelpSchema,
  type HelpSection,
  type HelpTopic,
  type ToolError,
  type ToolExample,
  type ToolHelp
} from '../schemas/help.js'
import { HelpOutputSchema } from '../schemas/output-schemas.js'
import { formatToolResponse } from '../services/formatter.js'
import type { MCPToolResponse } from '../types.js'
import { defineStandardTool } from './factory/index.js'

// =============================================================================
// Lazy Tool Registry Access (to avoid circular dependency)
// =============================================================================

// Cache for lazy-loaded tools - uses Promise for async dynamic import
let toolDefsPromise: Promise<{
  ALL_TOOLS: ReadonlyArray<ToolDefinition>
  TOOLS_BY_NAME: Readonly<Record<string, ToolDefinition>>
}> | null = null

/**
 * Lazy async getter for tool registry to avoid circular dependency.
 * tool-definitions.ts imports HELP_TOOL, which would cause circular import
 * if we imported ALL_TOOLS at module load time.
 *
 * Uses dynamic import() for ESM/Vitest compatibility.
 */
async function getToolRegistry(): Promise<{
  ALL_TOOLS: ReadonlyArray<ToolDefinition>
  TOOLS_BY_NAME: Readonly<Record<string, ToolDefinition>>
}> {
  if (!toolDefsPromise) {
    toolDefsPromise = import('../registry/tool-definitions.js')
  }
  return toolDefsPromise
}

/**
 * Lazy async getter for ALL_TOOLS.
 */
async function getAllTools(): Promise<ReadonlyArray<ToolDefinition>> {
  const { ALL_TOOLS } = await getToolRegistry()
  return ALL_TOOLS
}

/**
 * Lazy async getter for TOOLS_BY_NAME.
 */
async function getToolsByName(): Promise<Readonly<Record<string, ToolDefinition>>> {
  const { TOOLS_BY_NAME } = await getToolRegistry()
  return TOOLS_BY_NAME
}

// =============================================================================
// Schema Generation
// =============================================================================

/**
 * Generate JSON Schema for a tool's input with proper $refs.
 */
function generateToolSchema(tool: ToolDefinition): Record<string, unknown> {
  return z.toJSONSchema(tool.inputSchema, {
    reused: 'ref',
    io: 'input',
    target: 'draft-7'
  }) as Record<string, unknown>
}

/**
 * Generate schemas for multiple tools with merged $defs.
 */
async function generateBatchSchemas(toolNames: string[]): Promise<{
  schemas: Record<string, Record<string, unknown>>
  $defs?: Record<string, unknown>
}> {
  const allDefs: Record<string, unknown> = {}
  const schemas: Record<string, Record<string, unknown>> = {}
  const toolsByName = await getToolsByName()

  for (const name of toolNames) {
    const tool = toolsByName[name]
    if (!tool) continue

    const schema = generateToolSchema(tool) as { $defs?: Record<string, unknown> }

    // Merge $defs (identical definitions overwrite harmlessly)
    if (schema.$defs) {
      Object.assign(allDefs, schema.$defs)
      delete schema.$defs
    }

    schemas[name] = schema
  }

  return {
    schemas,
    $defs: Object.keys(allDefs).length > 0 ? allDefs : undefined
  }
}

// =============================================================================
// Response Builders
// =============================================================================

/**
 * Truncate text at word boundary with ellipsis.
 */
function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  // Find last space before maxLength
  const truncated = text.slice(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace > maxLength * 0.6) {
    // Only use word boundary if it's not too far back
    return `${truncated.slice(0, lastSpace)}...`
  }
  return `${truncated}...`
}

/**
 * Build discovery response (no tools specified).
 */
async function buildDiscoveryResponse(): Promise<DiscoveryResponse> {
  const allTools = await getAllTools()
  return {
    tools: allTools.map((t) => ({
      name: t.name,
      summary: truncateAtWordBoundary(t.docs.overview, 120),
      category: t.category
    })),
    workflow: 'workspaces → documents → tables → records',
    tip: 'Use grist_help({tools: ["tool1", "tool2"]}) for full tool docs and schemas'
  }
}

/**
 * Build help response for specified tools.
 */
async function buildToolHelpResponse(
  toolNames: string[],
  sections: readonly HelpSection[]
): Promise<HelpResponse> {
  const includeOverview = sections.includes('overview')
  const includeExamples = sections.includes('examples')
  const includeErrors = sections.includes('errors')
  const includeSchema = sections.includes('schema')
  const toolsByName = await getToolsByName()

  // Generate schemas if needed
  const schemaData = includeSchema ? await generateBatchSchemas(toolNames) : undefined

  // Build response for each tool
  const toolsResponse: Record<string, ToolHelp> = {}

  for (const name of toolNames) {
    const tool = toolsByName[name]
    if (!tool) continue

    const help: ToolHelp = {
      name,
      ...(includeOverview && { overview: tool.docs.overview }),
      ...(includeExamples && {
        examples: tool.docs.examples.slice(0, 2).map(
          (ex): ToolExample => ({
            description: ex.desc,
            input: ex.input as Record<string, unknown>
          })
        )
      }),
      ...(includeErrors && {
        errors: tool.docs.errors.map(
          (err): ToolError => ({
            error: err.error,
            solution: err.solution
          })
        )
      }),
      ...(includeSchema && schemaData?.schemas[name] && { schema: schemaData.schemas[name] })
    }

    toolsResponse[name] = help
  }

  return {
    tools: toolsResponse,
    ...(schemaData?.$defs && { $defs: schemaData.$defs })
  }
}

// =============================================================================
// Legacy Support
// =============================================================================

/**
 * Format legacy documentation string from topic.
 */
async function formatLegacyDocumentation(toolName: string, topic: HelpTopic): Promise<string> {
  const toolsByName = await getToolsByName()
  const tool = toolsByName[toolName]
  if (!tool) {
    return `No documentation found for ${toolName}. Use a valid tool name.`
  }

  const { docs } = tool

  switch (topic) {
    case 'overview':
      return docs.overview

    case 'examples':
      if (docs.examples.length === 0) {
        return 'No examples available for this tool.'
      }
      return docs.examples
        .map((ex) => `**${ex.desc}**\n\`\`\`json\n${JSON.stringify(ex.input, null, 2)}\n\`\`\``)
        .join('\n\n')

    case 'errors':
      if (docs.errors.length === 0) {
        return 'No common errors documented for this tool.'
      }
      return docs.errors.map((err) => `**${err.error}**\n  Solution: ${err.solution}`).join('\n\n')

    case 'parameters':
      return docs.parameters || 'See tool description for parameter details.'

    case 'full': {
      const sections: string[] = []

      sections.push(`## Overview\n\n${docs.overview}`)

      if (docs.examples.length > 0) {
        const examplesSection = docs.examples
          .map((ex) => `**${ex.desc}**\n\`\`\`json\n${JSON.stringify(ex.input, null, 2)}\n\`\`\``)
          .join('\n\n')
        sections.push(`## Examples\n\n${examplesSection}`)
      }

      if (docs.errors.length > 0) {
        const errorsSection = docs.errors
          .map((err) => `| ${err.error} | ${err.solution} |`)
          .join('\n')
        sections.push(
          `## Common Errors\n\n| Error | Solution |\n|-------|----------|\n${errorsSection}`
        )
      }

      if (docs.parameters) {
        sections.push(`## Parameters\n\n${docs.parameters}`)
      }

      return sections.join('\n\n---\n\n')
    }

    default:
      return docs.overview
  }
}

// =============================================================================
// Custom Formatting
// =============================================================================

/**
 * Custom formatting for help responses.
 * Handles markdown format for legacy API responses.
 */
function formatHelpResponse(
  data: HelpResponse | HelpOutput,
  format: 'json' | 'markdown' | 'concise'
): MCPToolResponse {
  if (format === 'json' || format === 'concise') {
    return formatToolResponse(data, format)
  }

  // For new API responses, format as JSON (structured data)
  if ('discovery' in data || 'tools' in data) {
    return formatToolResponse(data, 'json')
  }

  // Legacy format: markdown
  const legacyData = data as HelpOutput
  const topicInfo = legacyData.topic !== 'full' ? ` (${legacyData.topic})` : ''
  const topicHint =
    legacyData.topic !== 'full'
      ? `\n\n---\n_Other topics: ${HELP_TOPICS.filter((t) => t !== legacyData.topic).join(', ')}_`
      : ''
  const markdown = `# ${legacyData.toolName}${topicInfo}\n\n${legacyData.documentation}${topicHint}`

  return {
    content: [{ type: 'text', text: markdown }],
    structuredContent: data
  }
}

// =============================================================================
// Tool Definition (Factory Pattern)
// =============================================================================

/**
 * Help tool using factory pattern.
 * Provides discovery of tools and detailed documentation with JSON schemas.
 */
export const HELP_TOOL = defineStandardTool<typeof HelpSchema, HelpResponse | HelpOutput>({
  name: 'grist_help',
  title: 'Get Tool Help',
  description:
    'Get documentation and schemas for Grist tools.\n' +
    'Omit params to list all tools. Use tools array for detailed help.\n' +
    'Ex: {} → list all, {tools:["grist_manage_schema","grist_manage_records"]} → docs + schemas',
  purpose: 'Discover tools and get detailed documentation with JSON schemas',
  category: 'utility',
  inputSchema: HelpSchema,
  outputSchema: HelpOutputSchema,
  annotations: READ_ONLY_ANNOTATIONS,
  core: true,

  async execute(_ctx, params) {
    // Legacy mode: tool_name + topic (deprecated)
    if (params.tool_name && !params.tools) {
      const topic = params.topic || 'full'
      const documentation = await formatLegacyDocumentation(params.tool_name, topic)

      return {
        toolName: params.tool_name,
        topic,
        documentation,
        availableTopics: HELP_TOPICS
      } as HelpOutput
    }

    // New API: Discovery mode (no tools specified)
    if (!params.tools) {
      return {
        discovery: await buildDiscoveryResponse()
      }
    }

    // New API: Tool help mode
    const sections = params.only || [...HELP_SECTIONS]
    return await buildToolHelpResponse(params.tools, sections)
  },

  async afterExecute(result, params, _ctx) {
    // Only add nextSteps for legacy format
    if ('toolName' in result) {
      const legacyResult = result as HelpOutput
      const nextSteps: string[] = []

      nextSteps.push(`Try using ${legacyResult.toolName} with the examples shown`)

      if (legacyResult.topic !== 'full') {
        nextSteps.push(`Use topic='full' for complete documentation`)
      }

      // Format with custom handler (for markdown support in legacy mode)
      const format = params.response_format || 'json'
      return formatHelpResponse({ ...legacyResult, nextSteps }, format).structuredContent as
        | HelpResponse
        | HelpOutput
    }

    return result
  },

  docs: {
    overview:
      'Discover available tools and get detailed documentation with JSON schemas. ' +
      'Call without params to list all tools. Use tools param for full docs + schema.',
    examples: [
      {
        desc: 'Discover all tools',
        input: {}
      },
      {
        desc: 'Get docs + schemas for multiple tools',
        input: { tools: ['grist_manage_schema', 'grist_manage_records'] }
      },
      {
        desc: 'Get schema only (no docs)',
        input: { tools: ['grist_manage_pages'], only: ['schema'] }
      }
    ],
    errors: [{ error: 'Tool not found', solution: 'Check tool name spelling (case-sensitive)' }]
  }
})

// Export handler for backwards compatibility
export async function getHelp(
  context: import('../registry/types.js').ToolContext,
  params: HelpInput
) {
  return HELP_TOOL.handler(context, params)
}

// Export tools array for registry
export const HELP_TOOLS: ReadonlyArray<ToolDefinition> = [HELP_TOOL] as const
