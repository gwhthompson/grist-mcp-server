/**
 * Constants for the Grist MCP Server
 */

// Response size limits
export const CHARACTER_LIMIT = 25000 // Maximum response size (~6,000 tokens at 4 chars/token)
export const TRUNCATION_WARNING_THRESHOLD = 20000 // Warn when approaching limit

// Pagination defaults
export const DEFAULT_LIMIT = 100
export const DEFAULT_OFFSET = 0
export const MAX_LIMIT = 1000

// Batch operation limits
export const MAX_RECORDS_PER_BATCH = 500
export const MAX_COLUMN_OPERATIONS = 50

// API defaults
export const DEFAULT_BASE_URL = 'https://docs.getgrist.com'
export const API_TIMEOUT = 30000 // 30 seconds
