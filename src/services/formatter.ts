import { CHARACTER_LIMIT, MAX_ERROR_LENGTH } from '../constants.js'
import type { MCPToolResponse, ResponseFormat, TruncationInfo } from '../types.js'

function normalizeForSerialization(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map(normalizeForSerialization)
  }

  if (typeof value === 'object' && value !== null) {
    const normalized: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      normalized[key] = normalizeForSerialization(val)
    }
    return normalized
  }

  return value
}

export function formatToolResponse<T>(data: T, format: ResponseFormat = 'json'): MCPToolResponse {
  const normalized = normalizeForSerialization(data)

  const text =
    format === 'concise'
      ? formatConcise(normalized)
      : format === 'markdown'
        ? formatAsMarkdown(normalized)
        : JSON.stringify(normalized, null, 2)

  return {
    content: [
      {
        type: 'text',
        text
      }
    ],
    structuredContent: normalized as { [x: string]: unknown }
  }
}

export function formatErrorResponse(
  errorMessage: string,
  options?: {
    errorCode?: string
    context?: Record<string, unknown>
    retryable?: boolean
    suggestions?: string[]
  }
): MCPToolResponse {
  let truncatedMessage = errorMessage
  if (errorMessage.length > MAX_ERROR_LENGTH) {
    truncatedMessage =
      errorMessage.substring(0, MAX_ERROR_LENGTH) +
      '\n\n[Error message truncated - exceeded maximum length]'
  }

  // Append suggestions to the displayed message
  let displayMessage = truncatedMessage
  if (options?.suggestions && options.suggestions.length > 0) {
    displayMessage += `\n\n**Suggestions:**\n${options.suggestions.map((s) => `- ${s}`).join('\n')}`
  }

  // NOTE: Do NOT include structuredContent in error responses.
  // MCP SDK validates structuredContent against outputSchema if present,
  // even when isError: true. Omitting it avoids schema validation failures.
  return {
    content: [
      {
        type: 'text',
        text: displayMessage
      }
    ],
    isError: true
  }
}

export function formatAsMarkdown<T>(data: T): string {
  if (data === null || data === undefined) {
    return 'No data'
  }

  if (Array.isArray(data)) {
    return formatArrayAsMarkdown(data)
  }

  if (typeof data === 'object' && 'items' in data) {
    return formatPaginatedResponse(data)
  }

  if (typeof data === 'object') {
    return formatObjectAsMarkdown(data as Record<string, unknown>)
  }

  return String(data)
}

/**
 * Format data in concise mode - minimal output with counts and IDs only.
 * Optimized for token efficiency when full details aren't needed.
 */
function formatConcise(data: unknown): string {
  if (data === null || data === undefined) {
    return 'No data'
  }

  if (Array.isArray(data)) {
    return `${data.length} items`
  }

  if (typeof data === 'object' && 'items' in data) {
    const obj = data as Record<string, unknown>
    const items = Array.isArray(obj.items) ? obj.items : []
    const total = typeof obj.total === 'number' ? obj.total : items.length
    const ids = items
      .slice(0, 10)
      .map((item) =>
        typeof item === 'object' && item && 'id' in item ? (item as { id: unknown }).id : null
      )
      .filter(Boolean)

    let result = `${items.length} of ${total} items`
    if (ids.length > 0) {
      result += `\nIDs: ${ids.join(', ')}${items.length > 10 ? '...' : ''}`
    }
    if (obj.hasMore) {
      result += '\nMore available'
    }
    return result
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data as object)
    return `Object with ${keys.length} properties: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`
  }

  return String(data)
}

function formatArrayAsMarkdown<T>(items: T[]): string {
  if (items.length === 0) {
    return 'No items found'
  }

  return items.map((item, index) => `${index + 1}. ${formatItemAsMarkdown(item)}`).join('\n')
}

function formatItemAsMarkdown<T>(item: T): string {
  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
    return String(item)
  }

  if (typeof item === 'object' && item !== null) {
    return Object.entries(item)
      .map(([key, value]) => `${key}: ${formatValue(value)}`)
      .join(', ')
  }

  return JSON.stringify(item)
}

function formatObjectAsMarkdown<T extends Record<string, unknown>>(obj: T): string {
  return Object.entries(obj)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}:\n${formatArrayAsMarkdown(value)}`
      }
      return `${key}: ${formatValue(value)}`
    })
    .join('\n')
}

interface PaginationData {
  items?: unknown
  total?: number
  hasMore: boolean
  nextOffset?: unknown
  truncated: boolean
  truncationReason?: string
  suggestions?: unknown
}

function extractPaginationData(data: Record<string, unknown>): PaginationData {
  return {
    items: 'items' in data ? data.items : undefined,
    total: 'total' in data && typeof data.total === 'number' ? data.total : undefined,
    hasMore: 'hasMore' in data ? Boolean(data.hasMore) : false,
    nextOffset: 'nextOffset' in data ? data.nextOffset : undefined,
    truncated: 'truncated' in data ? Boolean(data.truncated) : false,
    truncationReason:
      'truncationReason' in data && typeof data.truncationReason === 'string'
        ? data.truncationReason
        : undefined,
    suggestions: 'suggestions' in data ? data.suggestions : undefined
  }
}

function formatHeader(items: unknown, total: number | undefined): string {
  const itemsLength = Array.isArray(items) ? items.length : 0

  if (total !== undefined) {
    return `${itemsLength} of ${total} results`
  }
  return `${itemsLength} results`
}

function formatPaginationFooter(hasMore: boolean, nextOffset: unknown): string[] {
  if (!hasMore) {
    return []
  }

  return ['', `More: offset=${nextOffset}`]
}

function formatTruncationWarning(
  truncationReason: string | undefined,
  suggestions: unknown
): string[] {
  const lines: string[] = ['', truncationReason || 'Truncated: exceeded character limit']

  if (Array.isArray(suggestions) && suggestions.length > 0) {
    suggestions.forEach((suggestion) => {
      if (typeof suggestion === 'string') {
        lines.push(`- ${suggestion}`)
      }
    })
  }

  return lines
}

function formatPaginatedResponse<T extends Record<string, unknown>>(data: T): string {
  const pd = extractPaginationData(data)
  const lines: string[] = []

  lines.push(formatHeader(pd.items, pd.total), '')

  if (Array.isArray(pd.items) && pd.items.length > 0) {
    lines.push(formatArrayAsMarkdown(pd.items))
  } else {
    lines.push('No items found')
  }

  lines.push(...formatPaginationFooter(pd.hasMore, pd.nextOffset))

  if (pd.truncated) {
    lines.push(...formatTruncationWarning(pd.truncationReason, pd.suggestions))
  }

  return lines.join('\n')
}

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

export function truncateIfNeeded<T, D extends Record<string, unknown> = Record<string, unknown>>(
  items: T[],
  format: ResponseFormat,
  additionalData: D = {} as D
): {
  data: D & { items: T[] } & Partial<TruncationInfo>
  text: string
  truncationInfo?: TruncationInfo
} {
  const fullData = { ...additionalData, items }
  const fullText =
    format === 'json' ? JSON.stringify(fullData, null, 2) : formatAsMarkdown(fullData)

  if (fullText.length <= CHARACTER_LIMIT) {
    return { data: fullData, text: fullText }
  }

  const maxItems = findMaxItemsThatFit(items, format, additionalData)
  const truncatedData = {
    ...additionalData,
    items: items.slice(0, maxItems),
    truncated: true,
    itemsReturned: maxItems,
    itemsRequested: items.length,
    truncationReason: `Response truncated from ${items.length} to ${maxItems} items to fit character limit (${CHARACTER_LIMIT} characters)`,
    suggestions: generateTruncationSuggestions(additionalData, maxItems)
  }

  const truncatedText =
    format === 'json' ? JSON.stringify(truncatedData, null, 2) : formatAsMarkdown(truncatedData)

  return {
    data: truncatedData,
    text: truncatedText,
    truncationInfo: {
      truncated: true,
      itemsReturned: maxItems,
      itemsRequested: items.length,
      truncationReason: truncatedData.truncationReason,
      suggestions: truncatedData.suggestions
    }
  }
}

function findMaxItemsThatFit<T>(
  items: T[],
  format: ResponseFormat,
  additionalData: Record<string, unknown>
): number {
  if (items.length === 0) {
    return 0
  }

  const sampleSize = Math.min(5, items.length)
  const sampleData = {
    ...additionalData,
    items: items.slice(0, sampleSize)
  }
  const sampleText =
    format === 'json' ? JSON.stringify(sampleData, null, 2) : formatAsMarkdown(sampleData)

  const emptyData = { ...additionalData, items: [] }
  const emptyText =
    format === 'json' ? JSON.stringify(emptyData, null, 2) : formatAsMarkdown(emptyData)
  const overhead = emptyText.length

  const itemsSize = sampleText.length - overhead
  const avgItemSize = Math.ceil(itemsSize / sampleSize)

  const availableSpace = CHARACTER_LIMIT - overhead
  const estimatedMax = Math.floor(availableSpace / avgItemSize)

  const rangeStart = Math.max(1, Math.floor(estimatedMax * 0.8))
  const rangeEnd = Math.min(items.length, Math.ceil(estimatedMax * 1.2))

  if (rangeEnd >= items.length) {
    const fullData = { ...additionalData, items: items }
    const fullText =
      format === 'json' ? JSON.stringify(fullData, null, 2) : formatAsMarkdown(fullData)
    if (fullText.length <= CHARACTER_LIMIT) {
      return items.length
    }
  }

  let left = rangeStart
  let right = rangeEnd
  let best = rangeStart

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

function generateTruncationSuggestions(
  data: Record<string, unknown>,
  itemsIncluded: number
): string[] {
  const suggestions: string[] = []

  if ('offset' in data && typeof data.offset === 'number') {
    suggestions.push(`offset=${data.offset + itemsIncluded} to continue`)
  } else {
    suggestions.push(`offset=${itemsIncluded} to continue`)
  }

  if (
    'detail_level' in data &&
    (data.detail_level === 'detailed' || data.detail_level === 'full_schema')
  ) {
    suggestions.push(`detail_level='summary' for less data`)
  }

  if (!('columns' in data) || data.columns === '*') {
    suggestions.push(`select specific columns`)
  }

  const filters = 'filters' in data ? data.filters : undefined
  if (
    !filters ||
    (typeof filters === 'object' &&
      filters !== null &&
      Object.keys(filters as Record<string, unknown>).length === 0)
  ) {
    suggestions.push(`add filters`)
  }

  if ('limit' in data && typeof data.limit === 'number' && data.limit > 50) {
    suggestions.push(`reduce limit (currently ${data.limit})`)
  }

  return suggestions
}
