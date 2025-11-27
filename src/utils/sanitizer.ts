const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /Bearer\s+[A-Za-z0-9_-]{20,}/gi, replacement: 'Bearer ***' },
  { pattern: /x-boot-key:\s*[^\s]+/gi, replacement: 'x-boot-key: ***' },
  { pattern: /api[_-]?key[:\s=]+[A-Za-z0-9_-]{20,}/gi, replacement: 'api_key=***' },
  { pattern: /token[:\s=]+[A-Za-z0-9_-]{20,}/gi, replacement: 'token=***' },

  // Preserve domain for debugging
  {
    pattern: /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi,
    replacement: '***@$2'
  },

  { pattern: /\b[A-Za-z0-9_-]{40,}\b/g, replacement: '***' },
  { pattern: /Authorization:\s*[^\s]+/gi, replacement: 'Authorization: ***' },
  { pattern: /password[:\s=]+[^\s&]+/gi, replacement: 'password=***' },
  { pattern: /"password"\s*:\s*"[^"]+"/gi, replacement: '"password":"***"' },
  { pattern: /[?&](api[_-]?key|token|auth)[=][^&\s]+/gi, replacement: '?$1=***' },
  { pattern: /docId[:\s=]+"?([A-Za-z0-9_-]{15,})"?/gi, replacement: 'docId=***' },
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

export function sanitizeError(error: Error): Error {
  const sanitized = new Error(sanitizeMessage(error.message))
  sanitized.name = error.name

  if (error.stack) {
    sanitized.stack = sanitizeMessage(error.stack)
  }

  for (const key of Object.keys(error)) {
    if (key !== 'message' && key !== 'stack' && key !== 'name') {
      const errorRecord = error as unknown as Record<string, unknown>
      const sanitizedRecord = sanitized as unknown as Record<string, unknown>
      sanitizedRecord[key] = errorRecord[key]
    }
  }

  return sanitized
}

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

export function containsSensitiveData(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false
  }

  return SENSITIVE_PATTERNS.some(({ pattern }) => pattern.test(text))
}

export function sanitizeAxiosError(error: unknown): string {
  if (!error) {
    return 'Unknown error'
  }

  const hasMessage = (e: unknown): e is { message: string } =>
    typeof e === 'object' &&
    e !== null &&
    'message' in e &&
    typeof (e as { message?: unknown }).message === 'string'

  let message = hasMessage(error) ? error.message : String(error)

  message = sanitizeMessage(message)

  if (typeof error === 'object' && error !== null && 'config' in error) {
    const config = (error as { config?: { method?: string; url?: string } }).config
    if (config) {
      const method = config.method?.toUpperCase()
      const url = sanitizeMessage(config.url || '')
      message += ` (${method} ${url})`
    }
  }

  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response
    if (response?.status) {
      message += ` [${response.status}]`
    }
  }

  return message
}

export function createSafeErrorMessage(error: unknown, userFriendly = true): string {
  if (error instanceof Error) {
    const sanitized = sanitizeMessage(error.message)

    if (userFriendly) {
      return sanitized
        .replace(/at\s+.*?\(.*?\)/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    }

    return sanitized
  }

  return sanitizeMessage(String(error))
}
