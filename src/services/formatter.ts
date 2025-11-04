/**
 * Formatter Service - Response formatting for MCP tools
 *
 * Handles conversion between JSON and Markdown formats,
 * character limit enforcement, and truncation with guidance.
 */

import { CHARACTER_LIMIT } from '../constants.js'
import type { MCPToolResponse, ResponseFormat, TruncationInfo } from '../types.js'

/**
 * Format tool response with both text and structured content
 * CRITICAL: Always include BOTH content and structuredContent
 *
 * @param data - Data to format
 * @param format - Output format ('json' or 'markdown')
 * @returns MCP tool response with content and structuredContent
 */
export function formatToolResponse(
  data: any,
  format: ResponseFormat = 'markdown'
): MCPToolResponse {
  const text = format === 'markdown' ? formatAsMarkdown(data) : JSON.stringify(data, null, 2)

  return {
    content: [
      {
        type: 'text',
        text
      }
    ],
    structuredContent: data // ALWAYS include - enables programmatic access
  }
}

/**
 * Format error response with isError flag
 *
 * @param errorMessage - Error message to return
 * @returns MCP tool response with error flag
 */
export function formatErrorResponse(errorMessage: string): MCPToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: errorMessage
      }
    ],
    isError: true
  }
}

/**
 * Format data as Markdown string
 * Provides human-readable output with proper formatting
 *
 * @param data - Data to format
 * @returns Markdown-formatted string
 */
export function formatAsMarkdown(data: any): string {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return 'No data'
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return formatArrayAsMarkdown(data)
  }

  // Handle objects with pagination metadata
  if (typeof data === 'object' && 'items' in data) {
    return formatPaginatedResponse(data)
  }

  // Handle plain objects
  if (typeof data === 'object') {
    return formatObjectAsMarkdown(data)
  }

  // Handle primitives
  return String(data)
}

/**
 * Format array as Markdown list
 */
function formatArrayAsMarkdown(items: any[]): string {
  if (items.length === 0) {
    return 'No items found'
  }

  return items.map((item, index) => `${index + 1}. ${formatItemAsMarkdown(item)}`).join('\n\n')
}

/**
 * Format single item as Markdown
 */
function formatItemAsMarkdown(item: any): string {
  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
    return String(item)
  }

  if (typeof item === 'object' && item !== null) {
    // Format object properties
    return Object.entries(item)
      .map(([key, value]) => `  - **${key}**: ${formatValue(value)}`)
      .join('\n')
  }

  return JSON.stringify(item)
}

/**
 * Format object as Markdown sections
 */
function formatObjectAsMarkdown(obj: any): string {
  return Object.entries(obj)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `**${key}**:\n${formatArrayAsMarkdown(value)}`
      }
      return `**${key}**: ${formatValue(value)}`
    })
    .join('\n\n')
}

/**
 * Format paginated response with metadata
 */
function formatPaginatedResponse(data: any): string {
  const lines: string[] = []

  // Header with count info
  if (data.total !== undefined) {
    lines.push(`# Results (${data.items?.length || 0} of ${data.total} total)`)
  } else {
    lines.push(`# Results (${data.items?.length || 0} items)`)
  }

  lines.push('')

  // Items
  if (data.items && data.items.length > 0) {
    lines.push(formatArrayAsMarkdown(data.items))
  } else {
    lines.push('No items found')
  }

  // Pagination info
  if (data.has_more) {
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push(`**More results available**. Use \`offset=${data.next_offset}\` to continue.`)
  }

  // Truncation warning
  if (data.truncated) {
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('⚠️ **Response Truncated**')
    lines.push('')
    lines.push(data.truncation_reason || 'Response exceeded character limit')
    if (data.suggestions && data.suggestions.length > 0) {
      lines.push('')
      lines.push('**Suggestions:**')
      data.suggestions.forEach((suggestion: string) => {
        lines.push(`- ${suggestion}`)
      })
    }
  }

  return lines.join('\n')
}

/**
 * Format individual value for display
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return 'null'
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }
    if (value.length <= 3) {
      return `[${value.map((v) => formatValue(v)).join(', ')}]`
    }
    return `[${value
      .slice(0, 3)
      .map((v) => formatValue(v))
      .join(', ')}, ... (${value.length} items)]`
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

/**
 * Check if response exceeds character limit and truncate if needed
 * Uses binary search to find maximum items that fit
 *
 * @param items - Array of items to potentially truncate
 * @param format - Response format
 * @param additionalData - Additional data to include in response
 * @returns Object with text and optional truncation info
 */
export function truncateIfNeeded(
  items: any[],
  format: ResponseFormat,
  additionalData: any = {}
): { data: any; text: string; truncationInfo?: TruncationInfo } {
  // Build full response first
  const fullData = {
    ...additionalData,
    items
  }

  const fullText =
    format === 'json' ? JSON.stringify(fullData, null, 2) : formatAsMarkdown(fullData)

  // Check if truncation needed
  if (fullText.length <= CHARACTER_LIMIT) {
    return { data: fullData, text: fullText }
  }

  // Find maximum items that fit
  const maxItems = findMaxItemsThatFit(items, format, additionalData)

  // Build truncated response
  const truncatedData = {
    ...additionalData,
    items: items.slice(0, maxItems),
    truncated: true,
    items_returned: maxItems,
    items_requested: items.length,
    truncation_reason: `Response truncated from ${items.length} to ${maxItems} items to fit character limit (${CHARACTER_LIMIT} characters)`,
    suggestions: generateTruncationSuggestions(additionalData, maxItems)
  }

  const truncatedText =
    format === 'json' ? JSON.stringify(truncatedData, null, 2) : formatAsMarkdown(truncatedData)

  return {
    data: truncatedData,
    text: truncatedText,
    truncationInfo: {
      truncated: true,
      items_returned: maxItems,
      items_requested: items.length,
      truncation_reason: truncatedData.truncation_reason,
      suggestions: truncatedData.suggestions
    }
  }
}

/**
 * Binary search to find maximum items that fit within character limit
 */
function findMaxItemsThatFit(items: any[], format: ResponseFormat, additionalData: any): number {
  let left = 1
  let right = items.length
  let best = 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const testData = {
      ...additionalData,
      items: items.slice(0, mid)
    }

    const testText =
      format === 'json' ? JSON.stringify(testData, null, 2) : formatAsMarkdown(testData)

    if (testText.length <= CHARACTER_LIMIT) {
      best = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  return best
}

/**
 * Generate context-specific truncation suggestions
 */
function generateTruncationSuggestions(data: any, itemsIncluded: number): string[] {
  const suggestions: string[] = []

  // Suggest pagination
  if (data.offset !== undefined) {
    suggestions.push(
      `Use offset=${data.offset + itemsIncluded} to continue from where truncation occurred`
    )
  } else {
    suggestions.push(`Use offset=${itemsIncluded} to continue from where truncation occurred`)
  }

  // Suggest reducing detail level
  if (data.detail_level === 'detailed' || data.detail_level === 'full_schema') {
    suggestions.push(`Reduce detail_level to 'summary' or 'names' for more concise output`)
  }

  // Suggest column selection
  if (!data.columns || data.columns === '*') {
    suggestions.push(`Select specific columns instead of all columns to reduce data size`)
  }

  // Suggest filtering
  if (!data.filters || Object.keys(data.filters).length === 0) {
    suggestions.push(`Add filters to reduce the result set`)
  }

  // Suggest smaller limit
  if (data.limit && data.limit > 50) {
    suggestions.push(
      `Reduce limit parameter (currently ${data.limit}) to request fewer items per page`
    )
  }

  return suggestions
}
