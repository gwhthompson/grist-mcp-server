/**
 * Contract schemas for MCP (Model Context Protocol) tool responses
 * Based on: MCP specification and mcp-builder skill guidance
 *
 * These schemas validate that MCP tool responses follow the protocol spec.
 * Ensures LLM-friendly responses with dual content format.
 */

import { z } from 'zod'

/**
 * MCP text content schema
 * The content array must contain text objects
 */
export const MCPTextContentSchema = z.object({
  type: z.literal('text').describe('Content type must be "text"'),
  text: z.string().min(1).describe('Text content (markdown or JSON)')
})

export type MCPTextContent = z.infer<typeof MCPTextContentSchema>

/**
 * MCP tool response schema (complete)
 * Validates the full response structure from MCP tools
 */
export const MCPToolResponseContractSchema = z.object({
  content: z
    .array(MCPTextContentSchema)
    .min(1)
    .describe('Content array with at least one text item'),

  structuredContent: z
    .unknown()
    .describe('Machine-readable structured data (JSON)'),

  isError: z
    .boolean()
    .optional()
    .describe('Error flag (true for error responses)')
}).strict()

export type MCPToolResponseContract = z.infer<typeof MCPToolResponseContractSchema>

/**
 * MCP success response schema
 * For non-error responses with data
 */
export const MCPSuccessResponseContractSchema = MCPToolResponseContractSchema.extend({
  isError: z.literal(false).optional()
})

export type MCPSuccessResponseContract = z.infer<typeof MCPSuccessResponseContractSchema>

/**
 * MCP error response schema
 * For error responses with isError flag
 */
export const MCPErrorResponseContractSchema = MCPToolResponseContractSchema.extend({
  isError: z.literal(true).describe('Must be true for errors'),
  structuredContent: z
    .object({
      success: z.literal(false),
      error: z.string().min(1)
    })
    .passthrough()
    .describe('Structured error with success=false and error message')
})

export type MCPErrorResponseContract = z.infer<typeof MCPErrorResponseContractSchema>

/**
 * MCP paginated response schema
 * For responses with pagination metadata
 */
export const MCPPaginatedResponseSchema = z.object({
  items: z.array(z.unknown()).describe('Data items'),
  total: z.number().int().nonnegative().optional().describe('Total count'),
  offset: z.number().int().nonnegative().optional().describe('Current offset'),
  limit: z.number().int().positive().optional().describe('Items per page'),
  has_more: z.boolean().optional().describe('More items available'),
  next_offset: z.number().int().nonnegative().optional().describe('Next page offset')
}).passthrough()

export type MCPPaginatedResponse = z.infer<typeof MCPPaginatedResponseSchema>

/**
 * MCP truncated response schema
 * For responses that exceeded character limit
 */
export const MCPTruncatedResponseSchema = z.object({
  items: z.array(z.unknown()).describe('Truncated data items'),
  truncated: z.literal(true).describe('Truncation flag'),
  items_returned: z.number().int().positive().describe('Items actually returned'),
  items_requested: z.number().int().positive().describe('Items originally requested'),
  truncation_reason: z.string().min(1).describe('Why truncation occurred'),
  suggestions: z.array(z.string()).optional().describe('Actionable suggestions')
}).passthrough()

export type MCPTruncatedResponse = z.infer<typeof MCPTruncatedResponseSchema>

/**
 * Helper: Validate dual content format
 * Ensures both markdown/JSON text AND structured content exist
 */
export function hasDualContentFormat(response: unknown): boolean {
  if (!response || typeof response !== 'object') return false

  const resp = response as Record<string, unknown>

  // Must have content array
  if (!Array.isArray(resp.content) || resp.content.length === 0) return false

  // Must have structuredContent
  if (!('structuredContent' in resp)) return false

  // Content must have text
  const firstContent = resp.content[0]
  if (
    !firstContent ||
    typeof firstContent !== 'object' ||
    !('type' in firstContent) ||
    firstContent.type !== 'text'
  ) {
    return false
  }

  return true
}

/**
 * Helper: Validate markdown content
 * Checks if content text contains markdown formatting
 */
export function hasMarkdownFormatting(response: MCPToolResponseContract): boolean {
  if (response.content.length === 0) return false

  const text = response.content[0].text

  // Check for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s/, // Headers
    /\*\*.*\*\*/, // Bold
    /\*.*\*/, // Italic
    /^[-*+]\s/, // Lists
    /^\d+\.\s/, // Numbered lists
    /```/, // Code blocks
    /\[.*\]\(.*\)/, // Links
    /^>\s/ // Blockquotes
  ]

  return markdownPatterns.some((pattern) => pattern.test(text))
}

/**
 * Helper: Validate JSON content
 * Checks if content text is valid JSON
 */
export function hasValidJSONContent(response: MCPToolResponseContract): boolean {
  if (response.content.length === 0) return false

  const text = response.content[0].text

  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * Helper: Extract error message from response
 * Returns error message if response is an error, undefined otherwise
 */
export function extractErrorMessage(
  response: MCPToolResponseContract
): string | undefined {
  if (!response.isError) return undefined

  if (
    response.structuredContent &&
    typeof response.structuredContent === 'object' &&
    'error' in response.structuredContent
  ) {
    const error = (response.structuredContent as Record<string, unknown>).error
    if (typeof error === 'string') return error
  }

  // Fallback to content text
  if (response.content.length > 0) {
    return response.content[0].text
  }

  return undefined
}

/**
 * Helper: Check if response is paginated
 * Returns true if response has pagination metadata
 */
export function isPaginatedResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false

  const obj = data as Record<string, unknown>

  return (
    'items' in obj &&
    Array.isArray(obj.items) &&
    ('has_more' in obj || 'next_offset' in obj || 'total' in obj)
  )
}

/**
 * Helper: Check if response is truncated
 * Returns true if response was truncated due to size
 */
export function isTruncatedResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false

  const obj = data as Record<string, unknown>

  return 'truncated' in obj && obj.truncated === true
}

/**
 * Helper: Validate actionable error messages
 * Checks if error message provides guidance to the user
 */
export function hasActionableErrorMessage(errorMessage: string): boolean {
  // Check for common actionable patterns
  const actionablePatterns = [
    /try/i,
    /use/i,
    /check/i,
    /verify/i,
    /ensure/i,
    /suggestion/i,
    /example/i,
    /instead/i,
    /should/i,
    /must/i,
    /cannot/i
  ]

  return actionablePatterns.some((pattern) => pattern.test(errorMessage))
}
