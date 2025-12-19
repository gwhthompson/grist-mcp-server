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
