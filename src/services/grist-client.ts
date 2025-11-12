/**
 * GristClient - Type-safe HTTP client for Grist API interactions
 *
 * Handles all API communication with:
 * - Advanced generic type parameters for request/response safety
 * - Optional runtime validation with Zod schemas
 * - Comprehensive error handling with actionable messages
 * - Template literal types for API path safety
 *
 * @example
 * ```typescript
 * // Without validation
 * const data = await client.get<WorkspaceInfo[]>('/workspaces')
 *
 * // With validation
 * const validated = await client.get(
 *   '/workspaces',
 *   undefined,
 *   WorkspaceArraySchema
 * )
 * ```
 */

import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig
} from 'axios'
import type { z } from 'zod'
import { API_TIMEOUT } from '../constants.js'
import { validateApiResponse, safeValidate } from '../schemas/api-responses.js'
import type { ApiPath } from '../types/advanced.js'
import { RateLimiter, type RateLimiterConfig } from '../utils/rate-limiter.js'
import { ResponseCache, type ResponseCacheConfig } from '../utils/response-cache.js'
import { Logger, LogLevel } from '../utils/logger.js'
import { sanitizeMessage } from '../utils/sanitizer.js'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * HTTP method types for error handling
 */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * Configuration for retry behavior
 */
interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs: number
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs: number
  /** HTTP status codes that should trigger a retry (default: [429, 502, 503, 504]) */
  retryableStatuses: number[]
}

/**
 * Generic constraint for request bodies
 * Ensures only serializable data is passed
 */
type RequestBody = Record<string, unknown> | unknown[] | string | number | boolean | null

/**
 * Options for HTTP requests with optional validation
 *
 * @template TResponse - Expected response type
 */
interface RequestOptions<TResponse = unknown> {
  /** Optional Zod schema for runtime response validation */
  schema?: z.ZodSchema<TResponse>
  /** Additional axios configuration */
  config?: AxiosRequestConfig
  /** Context string for better error messages during validation */
  context?: string
}

/**
 * Result of a validated API request
 * Provides both raw and validated data when validation is used
 *
 * @template TResponse - Response data type
 */
interface ValidatedResponse<TResponse> {
  /** The validated response data */
  data: TResponse
  /** Whether validation was performed */
  validated: boolean
  /** Raw response (only included if validation was performed) */
  raw?: unknown
}

// ============================================================================
// GristClient Class
// ============================================================================

/**
 * Type-safe HTTP client for Grist API with optional runtime validation
 *
 * Features:
 * - Generic type parameters for type-safe requests and responses
 * - Optional Zod schema validation for runtime type safety
 * - Comprehensive error handling with actionable guidance
 * - Support for template literal API paths
 */
export class GristClient {
  private client: AxiosInstance
  private baseUrl: string
  private retryConfig: RetryConfig
  private rateLimiter: RateLimiter
  private cache: ResponseCache
  private cacheEnabled: boolean
  private logger: Logger

  /**
   * Create a new Grist API client
   *
   * @param baseUrl - Base URL of the Grist server (e.g., 'https://docs.getgrist.com')
   * @param apiKey - API key for authentication
   * @param retryConfig - Optional retry configuration (defaults to 3 retries with exponential backoff)
   * @param rateLimiterConfig - Optional rate limiter configuration (defaults to 5 concurrent, 200ms min time)
   * @param cacheConfig - Optional response cache configuration (defaults to 1 minute TTL)
   * @param enableCache - Enable response caching for GET requests (default: true)
   */
  constructor(
    baseUrl: string,
    apiKey: string,
    retryConfig?: Partial<RetryConfig>,
    rateLimiterConfig?: Partial<RateLimiterConfig>,
    cacheConfig?: Partial<ResponseCacheConfig>,
    enableCache = true
  ) {
    this.baseUrl = baseUrl

    // Set default retry configuration
    this.retryConfig = {
      maxRetries: retryConfig?.maxRetries ?? 3,
      baseDelayMs: retryConfig?.baseDelayMs ?? 1000,
      maxDelayMs: retryConfig?.maxDelayMs ?? 30000,
      retryableStatuses: retryConfig?.retryableStatuses ?? [429, 502, 503, 504]
    }

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter(rateLimiterConfig)

    // Initialize response cache
    this.cache = new ResponseCache(cacheConfig)
    this.cacheEnabled = enableCache

    // Initialize logger
    this.logger = new Logger({
      minLevel: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
    })

    this.client = axios.create({
      baseURL: `${baseUrl}/api`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      timeout: API_TIMEOUT
    })
  }

  // ==========================================================================
  // HTTP Methods with Optional Validation
  // ==========================================================================

  /**
   * Perform a GET request with optional validation
   *
   * @template TResponse - Expected response type
   * @param path - API path (can be type-safe ApiPath)
   * @param params - Optional query parameters
   * @param options - Optional validation schema and request config
   * @returns Promise resolving to typed response data
   *
   * @example
   * ```typescript
   * // Without validation
   * const workspaces = await client.get<WorkspaceInfo[]>('/workspaces')
   *
   * // With validation
   * const validated = await client.get('/workspaces', undefined, {
   *   schema: WorkspaceArraySchema,
   *   context: 'Fetching workspaces'
   * })
   * ```
   */
  async get<TResponse>(
    path: string | ApiPath,
    params?: Record<string, unknown>,
    options?: RequestOptions<TResponse>
  ): Promise<TResponse> {
    // Generate cache key from path and params
    const cacheKey = this.getCacheKey('GET', path, params)

    // Try cache first if enabled
    if (this.cacheEnabled) {
      const cached = this.cache.get(cacheKey)
      if (cached !== undefined) {
        return cached as TResponse
      }
    }

    // Fetch from API with rate limiting and retry
    const result = await this.rateLimiter.schedule(() =>
      this.retryWithBackoff(async () => {
        try {
          const response = await this.client.get<TResponse>(path, {
            params,
            ...options?.config
          })

          return this.validateResponse(response.data, options)
        } catch (error) {
          this.logger.error('GET request failed', {
            path,
            params
          }, error instanceof Error ? error : undefined)
          throw this.handleError(error, 'GET', path)
        }
      }, `GET ${path}`)
    )

    // Cache successful response
    if (this.cacheEnabled) {
      this.cache.set(cacheKey, result)
    }

    return result
  }

  /**
   * Perform a POST request with optional validation
   *
   * @template TResponse - Expected response type
   * @template TRequest - Request body type (defaults to unknown for flexibility)
   * @param path - API path (can be type-safe ApiPath)
   * @param data - Request body data
   * @param options - Optional validation schema and request config
   * @returns Promise resolving to typed response data
   *
   * @example
   * ```typescript
   * // Type-safe request and response
   * interface CreateTableRequest {
   *   tables: Array<{ id: string }>
   * }
   *
   * const result = await client.post<ApplyResponse, CreateTableRequest>(
   *   `/docs/${docId}/apply`,
   *   { tables: [{ id: 'NewTable' }] },
   *   { schema: ApplyResponseSchema }
   * )
   * ```
   */
  async post<TResponse, TRequest = unknown>(
    path: string | ApiPath,
    data: TRequest,
    options?: RequestOptions<TResponse>
  ): Promise<TResponse> {
    // Validate request size
    this.validateRequestSize(data)

    const result = await this.rateLimiter.schedule(() =>
      this.retryWithBackoff(async () => {
        try {
          const response = await this.client.post<TResponse>(
            path,
            data,
            options?.config
          )

          return this.validateResponse(response.data, options)
        } catch (error) {
          this.logger.error('POST request failed', {
            path,
            dataSize: JSON.stringify(data).length
          }, error instanceof Error ? error : undefined)
          throw this.handleError(error, 'POST', path)
        }
      }, `POST ${path}`)
    )

    // Invalidate cache after write operations
    this.invalidateCacheForPath(path)

    return result
  }

  /**
   * Perform a PUT request with optional validation
   *
   * @template TResponse - Expected response type
   * @template TRequest - Request body type
   * @param path - API path (can be type-safe ApiPath)
   * @param data - Request body data
   * @param options - Optional validation schema and request config
   * @returns Promise resolving to typed response data
   *
   * @example
   * ```typescript
   * // Update records with validation
   * const result = await client.put<UpsertResponse, UpsertRecord>(
   *   `/docs/${docId}/tables/${tableId}/records`,
   *   { require: { id: 1 }, fields: { name: 'Updated' } },
   *   { schema: UpsertResponseSchema }
   * )
   * ```
   */
  async put<TResponse, TRequest = unknown>(
    path: string | ApiPath,
    data: TRequest,
    options?: RequestOptions<TResponse>
  ): Promise<TResponse> {
    // Validate request size
    this.validateRequestSize(data)

    const result = await this.rateLimiter.schedule(() =>
      this.retryWithBackoff(async () => {
        try {
          const response = await this.client.put<TResponse>(
            path,
            data,
            options?.config
          )

          return this.validateResponse(response.data, options)
        } catch (error) {
          this.logger.error('PUT request failed', {
            path,
            dataSize: JSON.stringify(data).length
          }, error instanceof Error ? error : undefined)
          throw this.handleError(error, 'PUT', path)
        }
      }, `PUT ${path}`)
    )

    // Invalidate cache after write operations
    this.invalidateCacheForPath(path)

    return result
  }

  /**
   * Perform a PATCH request with optional validation
   *
   * @template TResponse - Expected response type
   * @template TRequest - Request body type
   * @param path - API path (can be type-safe ApiPath)
   * @param data - Request body data
   * @param options - Optional validation schema and request config
   * @returns Promise resolving to typed response data
   *
   * @example
   * ```typescript
   * // Partial update with validation
   * const updated = await client.patch<TableInfo, Partial<TableInfo>>(
   *   `/docs/${docId}/tables/${tableId}`,
   *   { fields: updatedFields },
   *   { schema: TableInfoSchema }
   * )
   * ```
   */
  async patch<TResponse, TRequest = unknown>(
    path: string | ApiPath,
    data: TRequest,
    options?: RequestOptions<TResponse>
  ): Promise<TResponse> {
    // Validate request size
    this.validateRequestSize(data)

    const result = await this.rateLimiter.schedule(() =>
      this.retryWithBackoff(async () => {
        try {
          const response = await this.client.patch<TResponse>(
            path,
            data,
            options?.config
          )

          return this.validateResponse(response.data, options)
        } catch (error) {
          this.logger.error('PATCH request failed', {
            path,
            dataSize: JSON.stringify(data).length
          }, error instanceof Error ? error : undefined)
          throw this.handleError(error, 'PATCH', path)
        }
      }, `PATCH ${path}`)
    )

    // Invalidate cache after write operations
    this.invalidateCacheForPath(path)

    return result
  }

  /**
   * Perform a DELETE request with optional validation
   *
   * @template TResponse - Expected response type (defaults to void)
   * @param path - API path (can be type-safe ApiPath)
   * @param options - Optional validation schema and request config
   * @returns Promise resolving to typed response data
   *
   * @example
   * ```typescript
   * // Delete without response validation
   * await client.delete(`/docs/${docId}/tables/${tableId}`)
   *
   * // Delete with response validation
   * const result = await client.delete<DeleteResponse>(
   *   `/docs/${docId}/tables/${tableId}`,
   *   { schema: DeleteResponseSchema }
   * )
   * ```
   */
  async delete<TResponse = void>(
    path: string | ApiPath,
    options?: RequestOptions<TResponse>
  ): Promise<TResponse> {
    const result = await this.rateLimiter.schedule(() =>
      this.retryWithBackoff(async () => {
        try {
          const response = await this.client.delete<TResponse>(path, options?.config)

          return this.validateResponse(response.data, options)
        } catch (error) {
          this.logger.error('DELETE request failed', {
            path
          }, error instanceof Error ? error : undefined)
          throw this.handleError(error, 'DELETE', path)
        }
      }, `DELETE ${path}`)
    )

    // Invalidate cache after write operations
    this.invalidateCacheForPath(path)

    return result
  }

  // ==========================================================================
  // Validation Helpers
  // ==========================================================================

  /**
   * Validate request size to prevent sending huge payloads
   *
   * @private
   * @param data - Request data to validate
   * @throws {Error} if payload exceeds maximum size
   */
  private validateRequestSize(data: unknown): void {
    // Maximum payload size: 10MB
    const MAX_PAYLOAD_SIZE = 10_000_000

    try {
      const payloadSize = JSON.stringify(data).length

      if (payloadSize > MAX_PAYLOAD_SIZE) {
        throw new Error(
          `Request payload too large: ${payloadSize} bytes exceeds maximum of ${MAX_PAYLOAD_SIZE} bytes. ` +
          `Try reducing the number of records or splitting into multiple requests.`
        )
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Request payload too large')) {
        throw error
      }
      // If JSON.stringify fails, let it pass (will fail in axios)
    }
  }

  /**
   * Validate response data against a schema if provided
   *
   * @private
   * @template TResponse - Expected response type
   * @param data - Raw response data from axios
   * @param options - Optional validation options
   * @returns Validated response data
   * @throws {Error} if validation fails
   */
  private validateResponse<TResponse>(
    data: unknown,
    options?: RequestOptions<TResponse>
  ): TResponse {
    // If no schema provided, return data as-is (trust TypeScript types)
    if (!options?.schema) {
      return data as TResponse
    }

    // Perform runtime validation with Zod
    return validateApiResponse(
      options.schema,
      data,
      options.context
    )
  }

  /**
   * Safely validate response without throwing
   * Useful for optional validation or error recovery scenarios
   *
   * @template TResponse - Expected response type
   * @param data - Raw response data
   * @param schema - Zod schema to validate against
   * @returns Result object with success status and data or error
   *
   * @example
   * ```typescript
   * const result = client.safeValidateResponse(data, WorkspaceArraySchema)
   * if (result.success) {
   *   console.log('Valid data:', result.data)
   * } else {
   *   console.error('Validation error:', result.error)
   * }
   * ```
   */
  safeValidateResponse<TResponse>(
    data: unknown,
    schema: z.ZodSchema<TResponse>
  ): { success: true; data: TResponse } | { success: false; error: z.ZodError } {
    return safeValidate(schema, data)
  }

  // ==========================================================================
  // Retry Logic
  // ==========================================================================

  /**
   * Execute a function with exponential backoff retry logic
   *
   * Implements resilient retry behavior for transient failures:
   * - Retries on configurable HTTP status codes (default: 429, 502, 503, 504)
   * - Exponential backoff: wait = baseDelay * (2 ^ attempt) + jitter
   * - Jitter prevents thundering herd problem
   * - Respects max delay cap to prevent excessive waiting
   *
   * @private
   * @template T - Return type of the function
   * @param fn - Async function to execute with retry logic
   * @param context - Context string for error messages
   * @returns Promise resolving to function result
   * @throws {Error} if all retries are exhausted
   *
   * @example
   * ```typescript
   * const result = await this.retryWithBackoff(
   *   () => this.client.get('/api/endpoint'),
   *   'Fetching data'
   * )
   * ```
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        // Check if this is a retryable error
        const isRetryable = this.isRetryableError(error)
        const isLastAttempt = attempt === this.retryConfig.maxRetries

        if (!isRetryable || isLastAttempt) {
          // Not retryable or out of retries - throw immediately
          throw error
        }

        // Calculate delay with exponential backoff and jitter
        const exponentialDelay = this.retryConfig.baseDelayMs * Math.pow(2, attempt)
        const jitter = Math.random() * 0.3 * exponentialDelay // 0-30% jitter
        const delayMs = Math.min(exponentialDelay + jitter, this.retryConfig.maxDelayMs)

        // Store error for potential final throw
        lastError = error instanceof Error ? error : new Error(String(error))

        // Log retry attempt with structured logging
        this.logger.warn('Retrying request after error', {
          attempt: attempt + 1,
          maxRetries: this.retryConfig.maxRetries,
          context,
          delayMs: Math.round(delayMs),
          status: this.getErrorStatus(error)
        })

        // Wait before retrying
        await this.sleep(delayMs)
      }
    }

    // Should never reach here due to throw in loop, but TypeScript needs this
    throw lastError || new Error(`Retry failed for ${context}`)
  }

  /**
   * Check if an error is retryable based on HTTP status code
   *
   * @private
   * @param error - Error to check
   * @returns True if error should trigger a retry
   */
  private isRetryableError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false
    }

    const status = error.response?.status
    return status !== undefined && this.retryConfig.retryableStatuses.includes(status)
  }

  /**
   * Extract HTTP status code from error for logging
   *
   * @private
   * @param error - Error to extract status from
   * @returns Status code or 'unknown'
   */
  private getErrorStatus(error: unknown): string {
    if (axios.isAxiosError(error)) {
      return error.response?.status?.toString() ?? 'unknown'
    }
    return 'unknown'
  }

  /**
   * Sleep for specified milliseconds
   *
   * @private
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  /**
   * Transform errors into agent-friendly messages
   * Provides actionable guidance for common error scenarios
   *
   * @private
   * @param error - Unknown error from axios or other source
   * @param method - HTTP method that was used
   * @param path - API path that was accessed
   * @returns Transformed Error with actionable message
   */
  private handleError(
    error: unknown,
    method: HttpMethod,
    path: string
  ): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{
        error?: string | { message?: string }
        message?: string
        details?: { userError?: string }
      }>
      const status = axiosError.response?.status
      const errorData = axiosError.response?.data

      // Extract error message - Grist returns { error: string, details: { userError: string } }
      const message =
        (typeof errorData?.error === 'string'
          ? errorData.error
          : errorData?.error?.message) ||
        errorData?.message ||
        axiosError.message

      // Extract userError if available (more detailed/user-friendly)
      const userError = errorData?.details?.userError

      // Sanitize the error message from API
      const sanitizedMessage = sanitizeMessage(userError || message)

      switch (status) {
        case 401:
          return new Error(
            `Authentication failed. Check that GRIST_API_KEY is valid and not expired. ` +
              `Get your API key from: ${this.baseUrl}/settings/keys`
          )

        case 403:
          return new Error(
            `Permission denied for ${method} ${path}. API key lacks required access. ` +
              `Try using grist_list_documents to see which documents you can access.`
          )

        case 404:
          // Parse resource type and provide specific, actionable guidance
          return this.build404Error(path)

        case 429:
          return new Error(
            `Rate limit exceeded. The Grist server is limiting your requests. ` +
              `Wait 60 seconds before retrying this operation.`
          )

        case 500:
          // Detect CellValue encoding errors (most common cause of 500 on /apply endpoint)
          if (path.includes('/apply')) {
            const errorText = String(sanitizedMessage).toLowerCase()

            // Check for common encoding error indicators
            if (errorText.includes('invalid') || errorText.includes('type') || errorText.includes('expected')) {
              return new Error(
                `Grist server error (500) - Likely CellValue encoding issue!\n\n` +
                `Most common encoding mistakes:\n` +
                `1. ChoiceList: Missing "L" prefix\n` +
                `   ❌ Wrong: ["option1", "option2"]\n` +
                `   ✅ Right: ["L", "option1", "option2"]\n\n` +
                `2. Date: Using string instead of encoded format\n` +
                `   ❌ Wrong: "2024-01-15"\n` +
                `   ✅ Right: ["d", 1705276800000]\n` +
                `   💡 Use: Date.parse("2024-01-15")\n\n` +
                `3. DateTime: Missing timezone\n` +
                `   ❌ Wrong: 1705276800000\n` +
                `   ✅ Right: ["D", 1705276800000, "UTC"]\n\n` +
                `4. Reference: Using row number directly\n` +
                `   ❌ Wrong: 123\n` +
                `   ✅ Right: ["R", 123]\n\n` +
                `📖 See grist_add_records tool description for complete encoding guide.\n` +
                `📖 See docs/reference/grist-types.d.ts for all GristObjCode types.\n\n` +
                `Original error: ${sanitizedMessage}`
              )
            }
          }

          return new Error(
            `Grist server error (${status}). This is a temporary server issue. ` +
              `Try again in a few moments. If problem persists, check https://status.getgrist.com`
          )
        case 400:
          // Bad Request - Detect specific error types for better guidance
          const errorLower = String(sanitizedMessage).toLowerCase()

          // SQL syntax errors
          if (path.includes('/sql')) {
            return new Error(
              `SQL syntax error: ${sanitizedMessage}\n\n` +
              `Common SQL mistakes:\n` +
              `1. Table names are case-sensitive - check exact spelling\n` +
              `   💡 Use grist_get_tables to see all available tables\n\n` +
              `2. Column names must match exactly\n` +
              `   💡 Use grist_get_tables with detail_level="full_schema"\n\n` +
              `3. String values need single quotes: WHERE Status = 'Active'\n\n` +
              `4. Check JOIN syntax: LEFT JOIN TableName ON condition\n\n` +
              `5. Parameterized queries ($1, $2) require Grist v1.1.0+\n` +
              `   If not supported, embed values directly in SQL\n\n` +
              `📖 See grist_query_sql tool description for SQL examples.`
            )
          }

          // Validation errors (invalid data, missing required fields)
          if (errorLower.includes('invalid') || errorLower.includes('required') || errorLower.includes('expected')) {
            return new Error(
              `Validation error: ${sanitizedMessage}\n\n` +
              `Common causes:\n` +
              `1. Missing required fields in request\n` +
              `2. Invalid data type (string where number expected)\n` +
              `3. Wrong CellValue encoding format\n` +
              `   💡 See grist_add_records for complete encoding guide\n\n` +
              `4. Invalid widget options\n` +
              `   💡 See grist_manage_columns for widget options by type\n\n` +
              `5. Invalid column or table ID\n` +
              `   💡 Use grist_get_tables to see schema\n\n` +
              `📖 Check tool description for parameter requirements.`
            )
          }

          // Generic 400 error
          return new Error(
            `Bad request (400): ${sanitizedMessage}\n\n` +
            `The request was rejected by Grist. Common issues:\n` +
            `- Invalid parameter format\n` +
            `- Missing required fields\n` +
            `- Malformed data structure\n\n` +
            `Check the tool description for correct parameter formats.`
          )

        case 502:
        case 503:
        case 504:
          return new Error(
            `Grist server error (${status}). This is a temporary server issue. ` +
              `Try again in a few moments. If problem persists, check https://status.getgrist.com`
          )

        default:
          if (axiosError.code === 'ECONNABORTED') {
            return new Error(
              `Request timed out after ${API_TIMEOUT}ms. The operation took too long. ` +
                `Try reducing the amount of data requested or check your network connection.`
            )
          }

          return new Error(
            `Request failed: ${sanitizedMessage}. ${method} ${path} returned status ${status}.`
          )
      }
    }

    // Non-Axios errors
    if (error instanceof Error) {
      return new Error(`Unexpected error: ${sanitizeMessage(error.message)}`)
    }

    return new Error(`Unexpected error: ${sanitizeMessage(String(error))}`)
  }

  /**
   * Build comprehensive 404 error with actionable guidance based on resource type
   *
   * @private
   * @param path - API path that returned 404
   * @returns Error with specific guidance for the missing resource type
   */
  private build404Error(path: string): Error {
    // Parse resource type and ID from path
    // IMPORTANT: Check more specific paths first (table before doc)
    const tableMatch = path.match(/\/tables\/([^/]+)/)
    const docMatch = path.match(/\/docs\/([^/]+)/)
    const workspaceMatch = path.match(/\/workspaces\/([^/]+)/)
    const orgMatch = path.match(/\/orgs\/([^/]+)/)

    // Check table errors FIRST (more specific than document)
    if (tableMatch) {
      const tableId = tableMatch[1]
      return new Error(
        `Table not found (ID: '${tableId}')\n\n` +
          `Possible causes:\n` +
          `- Invalid table ID (check spelling/case)\n` +
          `- Table was deleted or renamed\n` +
          `- Wrong document\n\n` +
          `Next steps:\n` +
          `1. Use grist_get_tables to see available tables\n` +
          `2. Verify table ID matches exactly (case-sensitive)\n` +
          `3. Confirm you're using the correct document\n\n` +
          `Example: grist_get_tables({docId: "your_doc_id", detail_level: "names"})`
      )
    }

    if (docMatch) {
      const docId = docMatch[1]
      return new Error(
        `Document not found (ID: '${docId}')\n\n` +
          `Possible causes:\n` +
          `- Invalid document ID\n` +
          `- No access permission\n` +
          `- Document was deleted\n\n` +
          `Next steps:\n` +
          `1. Use grist_get_documents to see available documents\n` +
          `2. Verify ID matches exactly (case-sensitive)\n` +
          `3. Check API key has required permissions\n\n` +
          `Example: grist_get_documents({limit: 10, detail_level: "summary"})`
      )
    }

    if (workspaceMatch) {
      const workspaceId = workspaceMatch[1]
      return new Error(
        `Workspace not found (ID: '${workspaceId}')\n\n` +
          `Possible causes:\n` +
          `- Invalid workspace ID\n` +
          `- No access permission\n` +
          `- Workspace was deleted\n\n` +
          `Next steps:\n` +
          `1. Use grist_get_workspaces to see available workspaces\n` +
          `2. Verify ID is numeric or correct format\n` +
          `3. Check you have access to the workspace's organization\n\n` +
          `Example: grist_get_workspaces({limit: 20})`
      )
    }

    if (orgMatch) {
      const orgId = orgMatch[1]
      return new Error(
        `Organization not found (ID: '${orgId}')\n\n` +
          `Possible causes:\n` +
          `- Invalid organization ID\n` +
          `- No access permission\n\n` +
          `Next steps:\n` +
          `1. Use grist_get_workspaces to see available organizations\n` +
          `2. Verify you have access to the organization`
      )
    }

    // Generic 404
    return new Error(
      `Resource not found at path: ${path}\n\n` +
        `The requested resource does not exist or you don't have access.\n\n` +
        `Next steps:\n` +
        `1. Verify the resource ID is correct\n` +
        `2. Check you have the required permissions\n` +
        `3. Use discovery tools (grist_get_workspaces, grist_get_documents, grist_get_tables)`
    )
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get the base URL for generating resource URLs
   *
   * @returns The base URL of the Grist server (without /api)
   *
   * @example
   * ```typescript
   * const baseUrl = client.getBaseUrl()
   * const docUrl = `${baseUrl}/doc/${docId}`
   * ```
   */
  getBaseUrl(): string {
    return this.baseUrl
  }

  /**
   * Get the underlying axios instance for advanced usage
   * Use with caution - direct axios access bypasses type safety and validation
   *
   * @returns The axios instance used by this client
   *
   * @example
   * ```typescript
   * const axiosInstance = client.getAxiosInstance()
   * axiosInstance.interceptors.request.use((config) => {
   *   console.log('Request:', config)
   *   return config
   * })
   * ```
   */
  getAxiosInstance(): AxiosInstance {
    return this.client
  }

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  /**
   * Generate cache key from request parameters
   *
   * @private
   * @param method - HTTP method
   * @param path - API path
   * @param params - Query parameters
   * @returns Cache key string
   */
  private getCacheKey(
    method: HttpMethod,
    path: string,
    params?: Record<string, unknown>
  ): string {
    const paramStr = params ? JSON.stringify(params) : ''
    return `${method}:${path}${paramStr ? `:${paramStr}` : ''}`
  }

  /**
   * Clear all cached responses
   *
   * Useful when data has been mutated and cache should be invalidated.
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Invalidate cache entries matching a pattern
   *
   * @param pattern - RegExp pattern to match cache keys
   * @returns Number of entries invalidated
   *
   * @example
   * ```typescript
   * // Invalidate all workspace-related cache entries
   * client.invalidateCache(/\/workspaces/)
   * ```
   */
  invalidateCache(pattern: RegExp): number {
    return this.cache.invalidatePattern(pattern)
  }

  /**
   * Invalidate cache for a specific path after write operations
   *
   * Intelligently invalidates related cache entries when data is modified.
   * For example, modifying /docs/{docId}/tables should invalidate:
   * - GET /docs/{docId}/tables
   * - GET /docs/{docId}/tables/{tableId}/records
   *
   * @private
   * @param path - API path that was modified
   */
  private invalidateCacheForPath(path: string): void {
    if (!this.cacheEnabled) {
      return
    }

    // Extract document ID from path
    const docMatch = path.match(/\/docs\/([^/]+)/)
    if (!docMatch) {
      // Can't determine scope, clear all cache to be safe
      this.cache.clear()
      return
    }

    const docId = docMatch[1]

    // Invalidate all cache entries for this document
    // This includes tables, records, SQL queries, etc.
    const docPattern = new RegExp(`/docs/${docId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    this.cache.invalidatePattern(docPattern)
  }

  /**
   * Get cache statistics
   *
   * @returns Cache statistics
   */
  getCacheStats() {
    return this.cache.getStats()
  }
}

// ============================================================================
// Type Exports for External Use
// ============================================================================

export type { RequestOptions, ValidatedResponse, HttpMethod, RequestBody }
