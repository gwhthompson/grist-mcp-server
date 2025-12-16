/**
 * JSON Schema Utilities
 *
 * Shared utilities for cleaning and validating JSON Schema output.
 * Used by both production code and tests to ensure consistency.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { ToolDefinition } from '../registry/types.js'

/**
 * Clean and validate JSON Schema output for token optimization and consistency.
 * - Removes redundant id field in $defs (already the key name)
 * - Removes redundant type field when const is present (type is inferred)
 * - Removes redundant minLength/maxLength when pattern enforces length
 * - Removes redundant pattern when format: "uuid" is present (format is standard)
 * - Validates no unnamed schemas (__schema0, etc.) exist
 *
 * @throws Error if unnamed schemas are found - indicates missing registration
 */
export function cleanAndValidateSchema(
  schema: Record<string, unknown>,
  context: string
): Record<string, unknown> {
  const defs = schema.$defs as Record<string, Record<string, unknown>> | undefined
  if (defs) {
    for (const [key, def] of Object.entries(defs)) {
      // VALIDATE: No unnamed schemas - they should all be registered
      if (key.startsWith('__schema')) {
        throw new Error(`Unnamed schema "${key}" in ${context}. Register it with z.globalRegistry.`)
      }
      // Clean `id` field - AJV interprets it as JSON Schema $id keyword
      // This breaks validation. The key itself serves as the identifier.
      delete def.id
      // Remove redundant type when const is present - type is inferred from const value
      if (def.const !== undefined && def.type !== undefined) {
        delete def.type
      }
      // Remove minLength/maxLength when pattern enforces exact length
      if (def.pattern && def.minLength === def.maxLength && def.minLength !== undefined) {
        delete def.minLength
        delete def.maxLength
      }
      // Remove redundant pattern when format: "uuid" is present
      // format: "uuid" is a JSON Schema standard - the regex pattern is redundant (~220 bytes saved)
      if (def.format === 'uuid' && def.pattern) {
        delete def.pattern
      }
    }
  }
  return schema
}

/**
 * Setup the tools/list MCP handler with optimized JSON Schema output.
 *
 * This is the SINGLE source of truth for tools/list handler setup.
 * Used by both production code (src/index.ts) and tests.
 *
 * Features:
 * - Generates JSON Schema with $defs for shared schema references
 * - Cleans redundant fields for token optimization
 * - Validates all schemas are properly registered (no __schema* names)
 */
export function setupToolsListHandler(server: McpServer, tools: readonly ToolDefinition[]): void {
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: cleanAndValidateSchema(
        z.toJSONSchema(tool.inputSchema, { reused: 'ref', io: 'input' }),
        `${tool.name} inputSchema`
      ),
      ...(tool.outputSchema && {
        outputSchema: cleanAndValidateSchema(
          z.toJSONSchema(tool.outputSchema, { reused: 'ref', io: 'output' }),
          `${tool.name} outputSchema`
        )
      }),
      annotations: tool.annotations
    }))
  }))
}
