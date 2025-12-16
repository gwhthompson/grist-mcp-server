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
 * Recursively clean a schema object and all nested schemas.
 * Removes redundant fields for token optimization:
 * - `id` field (AJV interprets it as $id, breaking validation)
 * - `type` when `const` is present (type is inferred)
 * - `minLength`/`maxLength` when pattern enforces exact length
 * - `pattern` when `format: "uuid"` is present
 * - Empty `required: []` arrays
 * - `additionalProperties: false` (z.strictObject enforces at runtime)
 */
function cleanSchemaObject(obj: Record<string, unknown>): void {
  // Remove `id` field - AJV interprets it as JSON Schema $id keyword
  // This breaks validation. The key itself serves as the identifier.
  delete obj.id

  // Remove redundant type when const is present - type is inferred from const value
  if (obj.const !== undefined && obj.type !== undefined) {
    delete obj.type
  }

  // Remove minLength/maxLength when pattern enforces exact length
  if (obj.pattern && obj.minLength === obj.maxLength && obj.minLength !== undefined) {
    delete obj.minLength
    delete obj.maxLength
  }

  // Remove redundant pattern when format: "uuid" is present
  // format: "uuid" is a JSON Schema standard - the regex pattern is redundant (~220 bytes saved)
  if (obj.format === 'uuid' && obj.pattern) {
    delete obj.pattern
  }

  // Remove empty required arrays - they add bytes but provide no value
  if (Array.isArray(obj.required) && obj.required.length === 0) {
    delete obj.required
  }

  // Remove redundant additionalProperties: false - z.strictObject() enforces this at runtime
  // JSON Schema validators don't need this when we control the input via Zod
  if (obj.additionalProperties === false) {
    delete obj.additionalProperties
  }

  // Recursively clean nested schemas
  if (obj.properties && typeof obj.properties === 'object') {
    for (const prop of Object.values(obj.properties as Record<string, unknown>)) {
      if (prop && typeof prop === 'object') {
        cleanSchemaObject(prop as Record<string, unknown>)
      }
    }
  }

  // Clean items schema (for arrays)
  if (obj.items && typeof obj.items === 'object') {
    cleanSchemaObject(obj.items as Record<string, unknown>)
  }

  // Clean anyOf/oneOf/allOf schemas
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    if (Array.isArray(obj[key])) {
      for (const item of obj[key] as unknown[]) {
        if (item && typeof item === 'object') {
          cleanSchemaObject(item as Record<string, unknown>)
        }
      }
    }
  }
}

/**
 * Clean and validate JSON Schema output for token optimization and consistency.
 *
 * @param schema - The JSON Schema object to clean
 * @param context - Context string for error messages (e.g., "grist_help inputSchema")
 * @throws Error if unnamed schemas (__schema0, etc.) are found - indicates missing registration
 */
export function cleanAndValidateSchema(
  schema: Record<string, unknown>,
  context: string
): Record<string, unknown> {
  // Clean the root schema
  cleanSchemaObject(schema)

  // Clean $defs
  const defs = schema.$defs as Record<string, Record<string, unknown>> | undefined
  if (defs) {
    for (const [key, def] of Object.entries(defs)) {
      // VALIDATE: No unnamed schemas - they should all be registered
      if (key.startsWith('__schema')) {
        throw new Error(`Unnamed schema "${key}" in ${context}. Register it with z.globalRegistry.`)
      }
      cleanSchemaObject(def)
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
