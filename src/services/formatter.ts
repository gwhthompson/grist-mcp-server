/**
 * Formatter Service - Response formatting for MCP tools
 *
 * Handles conversion between JSON and Markdown formats,
 * character limit enforcement, and truncation with guidance.
 *
 * Refactored with TypeScript generics for type safety
 */

import { CHARACTER_LIMIT } from '../constants.js'
import type { MCPToolResponse, ResponseFormat, TruncationInfo } from '../types.js'
import type { ToolResponse } from '../types/advanced.js'

/**
 * Format tool response with both text and structured content
 * CRITICAL: Always include BOTH content and structuredContent
 *
 * @template T - The type of structured data being formatted
 * @param data - Data to format
 * @param format - Output format ('json' or 'markdown')
 * @returns MCP tool response with content and structuredContent
 */
export function formatToolResponse<T>(
  data: T,
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
 * @template T - The type of data being formatted
 * @param data - Data to format
 * @returns Markdown-formatted string
 */
export function formatAsMarkdown<T>(data: T): string {
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
    return formatObjectAsMarkdown(data as Record<string, unknown>)
  }

  // Handle primitives
  return String(data)
}

/**
 * Format array as Markdown list
 * @template T - The type of items in the array
 */
function formatArrayAsMarkdown<T>(items: T[]): string {
  if (items.length === 0) {
    return 'No items found'
  }

  return items.map((item, index) => `${index + 1}. ${formatItemAsMarkdown(item)}`).join('\n\n')
}

/**
 * Format single item as Markdown
 * @template T - The type of item being formatted
 */
function formatItemAsMarkdown<T>(item: T): string {
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
 * @template T - The type of object being formatted
 */
function formatObjectAsMarkdown<T extends Record<string, unknown>>(obj: T): string {
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
 * @template T - The type of paginated response data
 */
function formatPaginatedResponse<T extends Record<string, unknown>>(data: T): string {
  const lines: string[] = []

  // Type-safe access with proper checking
  const items = 'items' in data ? data.items : undefined
  const total = 'total' in data ? data.total : undefined
  const hasMore = 'has_more' in data ? data.has_more : false
  const nextOffset = 'next_offset' in data ? data.next_offset : undefined
  const truncated = 'truncated' in data ? data.truncated : false
  const truncationReason = 'truncation_reason' in data ? data.truncation_reason : undefined
  const suggestions = 'suggestions' in data ? data.suggestions : undefined

  // Header with count info
  if (total !== undefined && typeof total === 'number') {
    const itemsLength = Array.isArray(items) ? items.length : 0
    lines.push(`# Results (${itemsLength} of ${total} total)`)
  } else {
    const itemsLength = Array.isArray(items) ? items.length : 0
    lines.push(`# Results (${itemsLength} items)`)
  }

  lines.push('')

  // Items
  if (Array.isArray(items) && items.length > 0) {
    lines.push(formatArrayAsMarkdown(items))
  } else {
    lines.push('No items found')
  }

  // Pagination info
  if (hasMore) {
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push(`**More results available**. Use \`offset=${nextOffset}\` to continue.`)
  }

  // Truncation warning
  if (truncated) {
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('⚠️ **Response Truncated**')
    lines.push('')
    lines.push(
      typeof truncationReason === 'string' ? truncationReason : 'Response exceeded character limit'
    )
    if (Array.isArray(suggestions) && suggestions.length > 0) {
      lines.push('')
      lines.push('**Suggestions:**')
      suggestions.forEach((suggestion) => {
        if (typeof suggestion === 'string') {
          lines.push(`- ${suggestion}`)
        }
      })
    }
  }

  return lines.join('\n')
}

/**
 * Format individual value for display
 * @param value - Unknown value to format
 */
function formatValue(value: unknown): string {
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
 * @template T - The type of items in the array
 * @template D - The type of additional data
 * @param items - Array of items to potentially truncate
 * @param format - Response format
 * @param additionalData - Additional data to include in response
 * @returns Object with text and optional truncation info
 */
export function truncateIfNeeded<T, D extends Record<string, unknown> = Record<string, unknown>>(
  items: T[],
  format: ResponseFormat,
  additionalData: D = {} as D
): {
  data: D & { items: T[] } & Partial<TruncationInfo>
  text: string
  truncationInfo?: TruncationInfo
} {
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
 * @template T - The type of items in the array
 */
function findMaxItemsThatFit<T>(
  items: T[],
  format: ResponseFormat,
  additionalData: Record<string, unknown>
): number {
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
function generateTruncationSuggestions(
  data: Record<string, unknown>,
  itemsIncluded: number
): string[] {
  const suggestions: string[] = []

  // Suggest pagination
  if ('offset' in data && typeof data.offset === 'number') {
    suggestions.push(
      `Use offset=${data.offset + itemsIncluded} to continue from where truncation occurred`
    )
  } else {
    suggestions.push(`Use offset=${itemsIncluded} to continue from where truncation occurred`)
  }

  // Suggest reducing detail level
  if (
    'detail_level' in data &&
    (data.detail_level === 'detailed' || data.detail_level === 'full_schema')
  ) {
    suggestions.push(`Reduce detail_level to 'summary' or 'names' for more concise output`)
  }

  // Suggest column selection
  if (!('columns' in data) || data.columns === '*') {
    suggestions.push(`Select specific columns instead of all columns to reduce data size`)
  }

  // Suggest filtering
  const filters = 'filters' in data ? data.filters : undefined
  if (
    !filters ||
    (typeof filters === 'object' &&
      filters !== null &&
      Object.keys(filters as Record<string, unknown>).length === 0)
  ) {
    suggestions.push(`Add filters to reduce the result set`)
  }

  // Suggest smaller limit
  if ('limit' in data && typeof data.limit === 'number' && data.limit > 50) {
    suggestions.push(
      `Reduce limit parameter (currently ${data.limit}) to request fewer items per page`
    )
  }

  return suggestions
}
