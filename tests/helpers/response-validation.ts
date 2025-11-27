/**
 * Response Format Validation Utilities
 *
 * Provides reusable test utilities for validating MCP tool responses
 * to ensure correct format and prevent double-wrapping bugs.
 */

import type { MCPToolResponse } from '../../src/tools/base/types.js'

/**
 * Validates that a tool response has the correct MCPToolResponse structure
 * and is NOT double-wrapped.
 *
 * @param response - The response to validate
 * @throws Error if validation fails
 */
export function assertValidMCPToolResponse(response: unknown): asserts response is MCPToolResponse {
  if (!response || typeof response !== 'object') {
    throw new Error('Response must be an object')
  }

  const resp = response as Record<string, unknown>

  // Must have content array
  if (!Array.isArray(resp.content)) {
    throw new Error('Response must have content array')
  }

  if (resp.content.length === 0) {
    throw new Error('Response content array must not be empty')
  }

  // Must have structuredContent
  if (!resp.structuredContent || typeof resp.structuredContent !== 'object') {
    throw new Error('Response must have structuredContent object')
  }

  // Verify first content item has type and text
  const firstContent = resp.content[0]
  if (!firstContent || typeof firstContent !== 'object') {
    throw new Error('Response content[0] must be an object')
  }

  const content = firstContent as Record<string, unknown>
  if (content.type !== 'text') {
    throw new Error('Response content[0].type must be "text"')
  }

  if (typeof content.text !== 'string') {
    throw new Error('Response content[0].text must be a string')
  }
}

/**
 * Checks that a response is NOT double-wrapped.
 *
 * Double-wrapping occurs when:
 * 1. executeInternal() returns MCPToolResponse
 * 2. Base class wraps it again
 * 3. Result: { content: [{text: "{\"content\": [...], \"structuredContent\": {...}}"}], ... }
 *
 * @param response - The response to check
 * @throws Error if double-wrapping is detected
 */
export function assertNoDoubleWrapping(response: MCPToolResponse): void {
  const contentText = response.content[0].text

  // For JSON format: parse and verify no nested MCP structure
  if (contentText.startsWith('{') || contentText.startsWith('[')) {
    try {
      const parsed = JSON.parse(contentText)
      if (typeof parsed === 'object' && parsed !== null) {
        if ('content' in parsed && Array.isArray(parsed.content)) {
          throw new Error(
            'Double-wrapping detected: content[0].text contains nested "content" array. ' +
              'This indicates executeInternal() returned MCPToolResponse instead of raw data.'
          )
        }
        if ('structuredContent' in parsed && typeof parsed.structuredContent === 'object') {
          throw new Error(
            'Double-wrapping detected: content[0].text contains nested "structuredContent". ' +
              'This indicates executeInternal() returned MCPToolResponse instead of raw data.'
          )
        }
      }
    } catch (err) {
      // If JSON.parse fails, it's not JSON (probably markdown), which is fine
      if (err instanceof SyntaxError) {
        return
      }
      throw err
    }
  }

  // For markdown format: verify it doesn't contain JSON-encoded MCP structure
  if (contentText.includes('"content":[') || contentText.includes('"structuredContent"')) {
    throw new Error(
      'Double-wrapping suspected in markdown: content text contains stringified MCP response keys'
    )
  }
}

/**
 * Validates JSON format response structure.
 *
 * Ensures:
 * - content[0].text is valid JSON
 * - Parsed JSON has business data (not nested MCP response)
 * - structuredContent matches parsed JSON
 *
 * @param response - The response to validate
 * @throws Error if validation fails
 */
export function assertValidJSONFormatResponse(response: MCPToolResponse): void {
  assertValidMCPToolResponse(response)
  assertNoDoubleWrapping(response)

  const contentText = response.content[0].text

  // Should be valid JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(contentText)
  } catch (err) {
    throw new Error(`JSON format response has invalid JSON in content[0].text: ${String(err)}`)
  }

  // Should be an object with business data
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON format response content should parse to an object')
  }

  // structuredContent should match parsed content
  const expectedJson = JSON.stringify(parsed)
  const actualJson = JSON.stringify(response.structuredContent)

  if (expectedJson !== actualJson) {
    throw new Error(
      'JSON format: structuredContent does not match parsed content[0].text.\n' +
        `Expected: ${expectedJson}\n` +
        `Actual: ${actualJson}`
    )
  }
}

/**
 * Validates markdown format response structure.
 *
 * Ensures:
 * - content[0].text is human-readable text (not JSON)
 * - structuredContent contains business data
 * - No double-wrapping artifacts
 *
 * @param response - The response to validate
 * @throws Error if validation fails
 */
export function assertValidMarkdownFormatResponse(response: MCPToolResponse): void {
  assertValidMCPToolResponse(response)
  assertNoDoubleWrapping(response)

  const contentText = response.content[0].text

  // Should NOT be JSON (if it parses cleanly as JSON object, that's suspicious)
  try {
    const parsed = JSON.parse(contentText)
    if (typeof parsed === 'object' && parsed !== null) {
      throw new Error(
        'Markdown format response has JSON in content[0].text. ' +
          'Content should be human-readable markdown, not JSON.'
      )
    }
  } catch (err) {
    // Good - should not parse as JSON
    if (!(err instanceof SyntaxError)) {
      throw err
    }
  }

  // structuredContent should be an object with business data
  if (!response.structuredContent || typeof response.structuredContent !== 'object') {
    throw new Error('Markdown format response must have structuredContent object')
  }
}

/**
 * Complete validation suite for a tool response.
 *
 * Validates:
 * - Basic MCPToolResponse structure
 * - No double-wrapping
 * - Format-specific requirements (JSON vs markdown)
 *
 * @param response - The response to validate
 * @param expectedFormat - Expected format ('json' or 'markdown'), auto-detected if omitted
 * @throws Error if validation fails
 */
export function validateToolResponse(
  response: unknown,
  expectedFormat?: 'json' | 'markdown'
): void {
  assertValidMCPToolResponse(response)
  assertNoDoubleWrapping(response)

  // Auto-detect format if not specified
  const contentText = response.content[0].text
  const isJson = contentText.trim().startsWith('{') || contentText.trim().startsWith('[')
  const format = expectedFormat || (isJson ? 'json' : 'markdown')

  if (format === 'json') {
    assertValidJSONFormatResponse(response)
  } else {
    assertValidMarkdownFormatResponse(response)
  }
}
