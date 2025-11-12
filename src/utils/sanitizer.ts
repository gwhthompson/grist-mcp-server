/**
 * Message Sanitizer - Sanitize sensitive data from error messages and logs
 *
 * Prevents accidental leakage of sensitive information like:
 * - API keys and tokens
 * - Email addresses
 * - Internal IDs and paths
 * - Stack traces with sensitive data
 */

/**
 * Patterns to detect and redact sensitive information
 */
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // API keys and tokens (Bearer, various formats)
  { pattern: /Bearer\s+[A-Za-z0-9_-]{20,}/gi, replacement: 'Bearer ***' },
  { pattern: /api[_-]?key[:\s=]+[A-Za-z0-9_-]{20,}/gi, replacement: 'api_key=***' },
  { pattern: /token[:\s=]+[A-Za-z0-9_-]{20,}/gi, replacement: 'token=***' },

  // Email addresses (partial redaction to preserve domain for debugging)
  {
    pattern: /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi,
    replacement: '***@$2'
  },

  // Long alphanumeric strings that might be keys or tokens (20+ chars)
  { pattern: /\b[A-Za-z0-9_-]{40,}\b/g, replacement: '***' },

  // Authorization headers
  { pattern: /Authorization:\s*[^\s]+/gi, replacement: 'Authorization: ***' },

  // Password patterns
  { pattern: /password[:\s=]+[^\s&]+/gi, replacement: 'password=***' },
  { pattern: /"password"\s*:\s*"[^"]+"/gi, replacement: '"password":"***"' },

  // API URLs with keys in query params
  { pattern: /[?&](api[_-]?key|token|auth)[=][^&\s]+/gi, replacement: '?$1=***' },

  // Document IDs (preserve format but redact value)
  { pattern: /docId[:\s=]+"?([A-Za-z0-9_-]{15,})"?/gi, replacement: 'docId=***' },

  // File paths that might contain usernames
  {
    pattern: /\/Users\/[^/\s]+/g,
    replacement: '/Users/***'
  },
  {
    pattern: /\/home\/[^/\s]+/g,
    replacement: '/home/***'
  },
  {
    pattern: /C:\\Users\\[^\\s]+/gi,
    replacement: 'C:\\Users\\***'
  }
]

/**
 * Sanitize a string by removing or redacting sensitive information
 *
 * @param message - Message to sanitize
 * @returns Sanitized message
 *
 * @example
 * ```typescript
 * const error = "Request failed with Bearer abc123xyz456..."
 * const safe = sanitizeMessage(error)
 * // Returns: "Request failed with Bearer ***"
 * ```
 */
export function sanitizeMessage(message: string): string {
  if (!message || typeof message !== 'string') {
    return message
  }

  let sanitized = message

  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement)
  }

  return sanitized
}

/**
 * Sanitize an Error object
 *
 * Creates a new Error with sanitized message and stack trace.
 * Preserves error type and other properties.
 *
 * @param error - Error to sanitize
 * @returns Sanitized error
 *
 * @example
 * ```typescript
 * try {
 *   throw new Error("Auth failed: Bearer abc123...")
 * } catch (err) {
 *   const safe = sanitizeError(err)
 *   // safe.message = "Auth failed: Bearer ***"
 * }
 * ```
 */
export function sanitizeError(error: Error): Error {
  const sanitized = new Error(sanitizeMessage(error.message))
  sanitized.name = error.name

  if (error.stack) {
    sanitized.stack = sanitizeMessage(error.stack)
  }

  // Preserve other enumerable properties
  for (const key of Object.keys(error)) {
    if (key !== 'message' && key !== 'stack' && key !== 'name') {
      ;(sanitized as Record<string, unknown>)[key] = (error as Record<string, unknown>)[key]
    }
  }

  return sanitized
}

/**
 * Sanitize an object by recursively sanitizing all string values
 *
 * Useful for sanitizing context objects, request/response data, etc.
 *
 * @param obj - Object to sanitize
 * @returns Sanitized object
 *
 * @example
 * ```typescript
 * const data = {
 *   user: "user@example.com",
 *   token: "Bearer abc123...",
 *   nested: { key: "value" }
 * }
 * const safe = sanitizeObject(data)
 * // safe.user = "***@example.com"
 * // safe.token = "Bearer ***"
 * ```
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj === 'string') {
    return sanitizeMessage(obj) as unknown as T
  }

  if (typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as unknown as T
  }

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value)
  }

  return sanitized as T
}

/**
 * Check if a string might contain sensitive information
 *
 * Useful for deciding whether to log or return data.
 *
 * @param text - Text to check
 * @returns True if text might contain sensitive data
 *
 * @example
 * ```typescript
 * if (containsSensitiveData(errorMessage)) {
 *   console.error(sanitizeMessage(errorMessage))
 * } else {
 *   console.error(errorMessage)
 * }
 * ```
 */
export function containsSensitiveData(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false
  }

  return SENSITIVE_PATTERNS.some(({ pattern }) => pattern.test(text))
}

/**
 * Sanitize axios error for safe logging
 *
 * Axios errors can contain sensitive data in:
 * - Request headers (Authorization)
 * - Request/response data
 * - URLs with tokens
 *
 * @param error - Axios error to sanitize
 * @returns Sanitized error message
 */
export function sanitizeAxiosError(error: unknown): string {
  if (!error) {
    return 'Unknown error'
  }

  let message = error.message || String(error)

  // Sanitize the basic message
  message = sanitizeMessage(message)

  // Add sanitized request info if available
  if (error.config) {
    const method = error.config.method?.toUpperCase()
    const url = sanitizeMessage(error.config.url || '')
    message += ` (${method} ${url})`
  }

  // Add response status if available
  if (error.response) {
    message += ` [${error.response.status}]`
  }

  return message
}

/**
 * Create a safe error message for user display
 *
 * Removes technical details and sensitive information,
 * keeping only user-actionable information.
 *
 * @param error - Error to create message from
 * @param userFriendly - Whether to make the message user-friendly
 * @returns Safe error message
 */
export function createSafeErrorMessage(error: unknown, userFriendly = true): string {
  if (error instanceof Error) {
    const sanitized = sanitizeMessage(error.message)

    if (userFriendly) {
      // Remove technical details for user-facing errors
      return sanitized
        .replace(/at\s+.*?\(.*?\)/g, '') // Remove stack trace lines
        .replace(/\s+/g, ' ') // Collapse whitespace
        .trim()
    }

    return sanitized
  }

  return sanitizeMessage(String(error))
}
