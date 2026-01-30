import type { ToolAnnotations as MCPToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import type { z } from 'zod'
import type { GristClient } from '../services/grist-client.js'
import type { SchemaCache } from '../services/schema-cache.js'
import type { MCPToolResponse } from '../types.js'

/**
 * Context passed to tool handlers with all dependencies.
 * Replaces the old pattern of tools calling getSchemaCache(client).
 */
export interface ToolContext {
  /** Grist API client */
  readonly client: GristClient
  /** Schema cache for column metadata */
  readonly schemaCache: SchemaCache
}

/**
 * MCP tool behavior hints (2025-11-25 spec).
 * Uses required booleans instead of optional to force explicit declaration.
 */
export interface ToolAnnotations extends Omit<MCPToolAnnotations, 'title'> {
  readonly readOnlyHint: boolean
  readonly destructiveHint: boolean
  readonly idempotentHint: boolean
  readonly openWorldHint: boolean
}

/**
 * Structured documentation for grist_help tool.
 */
export interface ToolDocumentation {
  /** Brief description (~500 bytes) */
  readonly overview: string
  /** Usage examples with descriptions */
  readonly examples: ReadonlyArray<{
    readonly desc: string
    readonly input: Record<string, unknown>
  }>
  /** Common errors and solutions */
  readonly errors: ReadonlyArray<{
    readonly error: string
    readonly solution: string
  }>
  /** Detailed parameter documentation (optional) */
  readonly parameters?: string
}

/**
 * Handler function signature for tools.
 * Receives a context object with all dependencies instead of just the client.
 */
export type ToolHandler<TSchema extends z.ZodTypeAny> = (
  context: ToolContext,
  params: z.infer<TSchema>
) => Promise<MCPToolResponse>

/**
 * Tool categories for organization.
 */
export type ToolCategory =
  | 'discovery'
  | 'reading'
  | 'records'
  | 'tables'
  | 'columns'
  | 'documents'
  | 'document_structure'
  | 'webhooks'
  | 'utility'

/**
 * Complete tool definition with all metadata.
 * Single source of truth for MCP manifest, README, and help.
 */
export interface ToolDefinition<
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny = z.ZodTypeAny
> {
  /** Tool name (grist_verb_noun) */
  readonly name: string
  /** Human-readable title */
  readonly title: string
  /** Short description for MCP tool listing */
  readonly description: string
  /** One-line purpose for README table */
  readonly purpose: string
  /** Tool category */
  readonly category: ToolCategory
  /** Zod schema for input validation */
  readonly inputSchema: TSchema
  /** Zod schema for output validation (MCP spec 2025-11-25) */
  readonly outputSchema?: TOutputSchema
  /** MCP behavior annotations */
  readonly annotations: ToolAnnotations
  /** Tool implementation */
  readonly handler: ToolHandler<TSchema>
  /** Structured documentation for help */
  readonly docs: ToolDocumentation
  /**
   * Core tool flag for progressive disclosure.
   * Core tools represent essential functionality.
   * Non-core tools are available but may be less commonly used.
   */
  readonly core?: boolean
}

/**
 * Annotation presets for common tool behaviors.
 */
export const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
} as const

export const WRITE_SAFE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true
} as const

export const WRITE_IDEMPOTENT_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
} as const

export const DESTRUCTIVE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true
} as const
