/**
 * Tool definitions aggregator.
 *
 * This file imports tool definitions from individual tool files and aggregates them.
 * Each tool file is the single source of truth for its tools' metadata and documentation.
 *
 * Tool Organization (v2.0 - Consolidated Architecture):
 * - Discovery tools: Entry points for workspace/document/table navigation
 * - Reading tools: Data retrieval (records, SQL)
 * - Management tools: Batch operations for records, schema, and pages
 * - Utility tools: Document creation, webhooks, help
 *
 * Total: ~12 tools (down from 22 in v1.x)
 */

import type { z } from 'zod'
import { HelpSchema } from '../schemas/help.js'
import { HelpOutputSchema } from '../schemas/output-schemas.js'
import { DISCOVERY_TOOLS } from '../tools/discovery.js'
import { DOCUMENT_TOOLS } from '../tools/documents.js'
import { getHelp } from '../tools/help.js'
import { MANAGE_PAGES_TOOL } from '../tools/manage-pages.js'
import { MANAGE_RECORDS_TOOL } from '../tools/manage-records.js'
import { MANAGE_SCHEMA_TOOL } from '../tools/manage-schema.js'
import { READING_TOOLS } from '../tools/reading.js'
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
      'Ex: {tool_name:"grist_manage_records",topic:"errors"}\n' +
      'Use topic="overview" for quick help, "errors" when troubleshooting.',
    purpose: 'Get detailed documentation and examples for any tool',
    category: 'utility',
    inputSchema: HelpSchema,
    outputSchema: HelpOutputSchema,
    annotations: READ_ONLY_ANNOTATIONS,
    handler: getHelp,
    core: true,
    docs: {
      overview:
        'Retrieves documentation for any Grist tool. Use topic="overview" for quick summaries, ' +
        '"examples" for usage patterns, "errors" when troubleshooting, or "full" for complete docs.',
      examples: [
        {
          desc: 'Get error troubleshooting',
          input: { tool_name: 'grist_manage_records', topic: 'errors' }
        },
        {
          desc: 'Get usage examples',
          input: { tool_name: 'grist_manage_schema', topic: 'examples' }
        },
        {
          desc: 'Get full documentation',
          input: { tool_name: 'grist_manage_pages' }
        }
      ],
      errors: [{ error: 'Tool not found', solution: 'Check tool name spelling (case-sensitive)' }]
    }
  }
] as const

/**
 * New consolidated tools that combine related operations.
 * These are the recommended tools for LLMs due to:
 * - ~75% reduction in tools/list token usage
 * - Batch operations reduce API round-trips
 * - Consistent interface patterns across domains
 */
export const CONSOLIDATED_TOOLS: ReadonlyArray<ToolDefinition> = [
  { ...MANAGE_RECORDS_TOOL, core: true },
  { ...MANAGE_SCHEMA_TOOL, core: true },
  { ...MANAGE_PAGES_TOOL, core: true }
] as const

/**
 * All tools aggregated from domain-specific modules.
 * This is the single source of truth for tool registration.
 *
 * v2.0 Architecture: 12 tools total
 * - 3 discovery tools (workspaces, documents, tables)
 * - 2 reading tools (records, SQL)
 * - 3 management tools (records, schema, pages)
 * - 3 utility tools (create_document, webhooks, help)
 */
export const ALL_TOOLS: ReadonlyArray<ToolDefinition> = [
  // Discovery tools - entry points
  ...DISCOVERY_TOOLS,
  // Reading tools - data retrieval
  ...READING_TOOLS,
  // Management tools - batch operations (consolidated from 13 granular tools)
  ...CONSOLIDATED_TOOLS,
  // Utility tools
  ...DOCUMENT_TOOLS,
  ...WEBHOOK_TOOLS,
  ...UTILITY_TOOLS
] as const

/**
 * Core tools for progressive disclosure.
 * These tools cover 90% of use cases and are shown by default.
 * Use grist_help to discover additional granular tools.
 */
export const CORE_TOOLS: ReadonlyArray<ToolDefinition> = ALL_TOOLS.filter(
  (tool) => tool.core === true
)

/**
 * Tools organized by category for structured access.
 * v2.0: Categories now point to consolidated tools
 */
export const TOOLS_BY_CATEGORY: Readonly<Record<ToolCategory, ReadonlyArray<ToolDefinition>>> = {
  discovery: DISCOVERY_TOOLS,
  reading: READING_TOOLS,
  records: [MANAGE_RECORDS_TOOL],
  tables: [MANAGE_SCHEMA_TOOL],
  columns: [MANAGE_SCHEMA_TOOL], // Column operations are in manage_schema
  documents: DOCUMENT_TOOLS,
  document_structure: [MANAGE_PAGES_TOOL],
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
