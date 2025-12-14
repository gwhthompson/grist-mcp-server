import { TOOLS_BY_NAME } from '../registry/tool-definitions.js'
import type { ToolContext } from '../registry/types.js'
import {
  HELP_TOPICS,
  type HelpInput,
  type HelpOutput,
  HelpSchema,
  type HelpTopic
} from '../schemas/help.js'
import type { MCPToolResponse, ResponseFormat } from '../types.js'
import { GristTool } from './base/GristTool.js'

/**
 * Format documentation based on the requested topic.
 */
function formatDocumentation(toolName: string, topic: HelpTopic): string {
  const tool = TOOLS_BY_NAME[toolName]
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

export class GetHelpTool extends GristTool<typeof HelpSchema, HelpOutput> {
  constructor(context: ToolContext) {
    super(context, HelpSchema)
  }

  protected async executeInternal(params: HelpInput): Promise<HelpOutput> {
    const topic = params.topic || 'full'
    const documentation = formatDocumentation(params.tool_name, topic)

    return {
      toolName: params.tool_name,
      topic,
      documentation,
      availableTopics: HELP_TOPICS
    }
  }

  protected formatResponse(data: HelpOutput, format: ResponseFormat): MCPToolResponse {
    if (format === 'json') {
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data
      }
    }

    const topicInfo = data.topic !== 'full' ? ` (${data.topic})` : ''
    const topicHint =
      data.topic !== 'full'
        ? `\n\n---\n_Other topics: ${HELP_TOPICS.filter((t) => t !== data.topic).join(', ')}_`
        : ''
    const markdown = `# ${data.toolName}${topicInfo}\n\n${data.documentation}${topicHint}`

    return {
      content: [{ type: 'text', text: markdown }],
      structuredContent: data
    }
  }
}

export function createGetHelpTool(context: ToolContext): GetHelpTool {
  return new GetHelpTool(context)
}

export async function getHelp(context: ToolContext, params: HelpInput) {
  const tool = new GetHelpTool(context)
  return tool.execute(params)
}
