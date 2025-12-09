/**
 * Tool definitions aggregator.
 *
 * This file imports tool definitions from individual tool files and aggregates them.
 * Each tool file is the single source of truth for its tools' metadata and documentation.
 */

import type { z } from 'zod'
import { HelpSchema } from '../schemas/help.js'
import { HelpOutputSchema } from '../schemas/output-schemas.js'
import { COLUMN_TOOLS } from '../tools/columns.js'
import { CONDITIONAL_TOOLS } from '../tools/conditional-formatting.js'
import { DISCOVERY_TOOLS } from '../tools/discovery.js'
import { DOCUMENT_TOOLS } from '../tools/documents.js'
import { getHelp } from '../tools/help.js'
import { PAGES_TOOLS } from '../tools/pages/index.js'
import { READING_TOOLS } from '../tools/reading.js'
import { RECORD_TOOLS } from '../tools/records.js'
import { SUMMARY_TABLE_TOOLS } from '../tools/summary-tables/index.js'
import { TABLE_TOOLS } from '../tools/tables.js'
import { WEBHOOK_TOOLS } from '../tools/webhooks.js'
import {
  READ_ONLY_ANNOTATIONS,
  type ToolAnnotations,
  type ToolCategory,
  type ToolContext,
  type ToolDefinition,
  type ToolHandler
} from './types.js'

// Re-export types for consumers
export type { ToolAnnotations, ToolCategory, ToolContext, ToolDefinition, ToolHandler }
export {
  DESTRUCTIVE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  SLOW_IDEMPOTENT_ANNOTATIONS,
  SLOW_OPERATION_ANNOTATIONS,
  SLOW_READ_ANNOTATIONS,
  WRITE_IDEMPOTENT_ANNOTATIONS,
  WRITE_SAFE_ANNOTATIONS
} from './types.js'

/**
 * Utility tools (grist_help) - defined inline since they're meta-tools.
 * The help tool will be updated to use tool.docs directly.
 */
export const UTILITY_TOOLS: ReadonlyArray<ToolDefinition> = [
  {
    name: 'grist_help',
    title: 'Get Tool Help',
    description:
      'Get documentation for any Grist tool.\n' +
      'Topics: overview (~500B), examples, errors, parameters, full (default)\n' +
      'Params: tool_name, topic (optional)\n' +
      'Ex: {tool_name:"grist_add_records",topic:"errors"}\n' +
      'Use topic="overview" for quick help, "errors" when troubleshooting.',
    purpose: 'Get detailed documentation and examples for any tool',
    category: 'utility',
    inputSchema: HelpSchema,
    outputSchema: HelpOutputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: getHelp,
    docs: {
      overview:
        'Retrieves documentation for any Grist tool. Use topic="overview" for quick summaries, ' +
        '"examples" for usage patterns, "errors" when troubleshooting, or "full" for complete docs.',
      examples: [
        {
          desc: 'Get error troubleshooting',
          input: { tool_name: 'grist_add_records', topic: 'errors' }
        },
        {
          desc: 'Get usage examples',
          input: { tool_name: 'grist_upsert_records', topic: 'examples' }
        },
        {
          desc: 'Get full documentation',
          input: { tool_name: 'grist_build_page' }
        }
      ],
      errors: [{ error: 'Tool not found', solution: 'Check tool name spelling (case-sensitive)' }]
    }
  }
] as const

/**
 * All tools aggregated from domain-specific modules.
 * This is the single source of truth for tool registration.
 */
export const ALL_TOOLS: ReadonlyArray<ToolDefinition> = [
  ...DISCOVERY_TOOLS,
  ...READING_TOOLS,
  ...RECORD_TOOLS,
  ...TABLE_TOOLS,
  ...SUMMARY_TABLE_TOOLS,
  ...COLUMN_TOOLS,
  ...CONDITIONAL_TOOLS,
  ...DOCUMENT_TOOLS,
  ...PAGES_TOOLS,
  ...WEBHOOK_TOOLS,
  ...UTILITY_TOOLS
] as const

/**
 * Tools organized by category for structured access.
 */
export const TOOLS_BY_CATEGORY: Readonly<Record<ToolCategory, ReadonlyArray<ToolDefinition>>> = {
  discovery: DISCOVERY_TOOLS,
  reading: READING_TOOLS,
  records: RECORD_TOOLS,
  tables: [...TABLE_TOOLS, ...SUMMARY_TABLE_TOOLS],
  columns: [...COLUMN_TOOLS, ...CONDITIONAL_TOOLS],
  documents: DOCUMENT_TOOLS,
  document_structure: PAGES_TOOLS,
  webhooks: WEBHOOK_TOOLS,
  utility: UTILITY_TOOLS
} as const

/**
 * Tools indexed by name for fast lookup.
 */
export const TOOLS_BY_NAME: Readonly<Record<string, ToolDefinition>> = ALL_TOOLS.reduce(
  (acc, tool) => {
    acc[tool.name] = tool
    return acc
  },
  {} as Record<string, ToolDefinition>
)

/**
 * All tool names as a union type.
 */
export type ToolName = (typeof ALL_TOOLS)[number]['name']

/**
 * Extract input type for a specific tool.
 */
export type ToolInputType<T extends ToolName> =
  Extract<(typeof ALL_TOOLS)[number], { name: T }> extends {
    inputSchema: infer S extends z.ZodType<any, any>
  }
    ? z.infer<S>
    : never

/**
 * Extract handler type for a specific tool.
 */
export type ToolHandlerType<T extends ToolName> = Extract<
  (typeof ALL_TOOLS)[number],
  { name: T }
>['handler']

// Note: TOOL_NAMES for schema validation is auto-generated at build time
// in src/schemas/tool-names.generated.ts and exported from src/schemas/help.ts
