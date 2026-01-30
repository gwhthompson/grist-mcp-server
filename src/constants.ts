/**
 * Constants for the Grist MCP Server
 * Using const assertions for literal types and type safety
 */

// ============================================================================
// Strict Mode Configuration (for debugging Claude Desktop crashes)
// ============================================================================

/**
 * Enable strict mode for aggressive response size limits.
 * Set GRIST_MCP_STRICT_MODE=true when debugging context overflow issues.
 */
export const STRICT_MODE = process.env.GRIST_MCP_STRICT_MODE === 'true'

// ============================================================================
// Response Size Limits (with const assertions for literal types)
// ============================================================================

/**
 * Maximum response size
 * - Normal mode: ~6,000 tokens at 4 chars/token (25KB)
 * - Strict mode: ~2,500 tokens at 4 chars/token (10KB)
 */
export const CHARACTER_LIMIT = STRICT_MODE ? 10_000 : 25_000

/**
 * Maximum error message size to prevent client crashes
 */
export const MAX_ERROR_LENGTH = 1000

/**
 * Warn when approaching limit
 */
export const TRUNCATION_WARNING_THRESHOLD = STRICT_MODE ? 8_000 : 20_000

// ============================================================================
// Pagination Defaults (using satisfies for type safety)
// ============================================================================

export const DEFAULT_LIMIT = 100
export const DEFAULT_OFFSET = 0
export const MAX_LIMIT = 1000

// ============================================================================
// Batch Operation Limits (using satisfies for type safety)
// ============================================================================

export const MAX_RECORDS_PER_BATCH = 500
export const MAX_COLUMN_OPERATIONS = 50

// ============================================================================
// API Defaults (using satisfies for type safety)
// ============================================================================

export const DEFAULT_BASE_URL = 'https://docs.getgrist.com'
export const API_TIMEOUT = 30000 // 30 seconds

/**
 * Client identification header sent with all Grist API requests.
 * Helps with debugging and allows Grist to track MCP usage.
 * Version is manually updated on releases.
 */
export const CLIENT_IDENTIFIER = 'grist-mcp-server/1.0'

// ============================================================================
// HTTP Status Codes (as const object with readonly properties)
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMIT: 429,
  INTERNAL_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
} as const

/**
 * Type-safe HTTP status code
 */
export type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS]

// ============================================================================
// API Path Templates (using template literal types)
// ============================================================================

/**
 * API version prefix
 */
export const API_VERSION = 'api'

/**
 * Template literal types for type-safe API paths
 */
export type ApiPath = `/${typeof API_VERSION}/${string}`
export type DocsPath = `${ApiPath}/docs/${string}`
export type TablesPath = `${DocsPath}/tables/${string}`
export type RecordsPath = `${TablesPath}/records`
export type ColumnsPath = `${TablesPath}/columns`
export type WorkspacesPath = `${ApiPath}/orgs/${string | number}/workspaces`

// ============================================================================
// Retry Configuration (as const object)
// ============================================================================

export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatuses: [429, 502, 503, 504]
} as const

/**
 * Type-safe retry configuration
 */
export type RetryConfig = typeof RETRY_CONFIG

// ============================================================================
// Cache Configuration (as const object)
// ============================================================================

export const CACHE_CONFIG = {
  defaultTTL: 60000, // 60 seconds
  maxSize: 1000, // Maximum number of cache entries
  cleanupInterval: 300000 // 5 minutes
} as const

/**
 * Type-safe cache configuration
 */
export type CacheConfig = typeof CACHE_CONFIG

// ============================================================================
// Error Messages (as const object for consistency)
// ============================================================================

export const ERROR_MESSAGES = {
  INVALID_API_KEY: 'Invalid or missing GRIST_API_KEY',
  NETWORK_ERROR: 'Network error occurred',
  TIMEOUT_ERROR: 'Request timeout exceeded',
  VALIDATION_ERROR: 'Validation failed',
  NOT_FOUND: 'Resource not found',
  RATE_LIMIT: 'Rate limit exceeded',
  SERVER_ERROR: 'Server error occurred'
} as const

/**
 * Type-safe error message
 */
export type ErrorMessage = (typeof ERROR_MESSAGES)[keyof typeof ERROR_MESSAGES]
