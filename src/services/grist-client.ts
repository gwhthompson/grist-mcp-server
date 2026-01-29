import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'
import type { z } from 'zod'
import { API_TIMEOUT, CLIENT_IDENTIFIER } from '../constants.js'
import { ApiError, type HttpMethod } from '../errors/ApiError.js'
import { NotFoundError } from '../errors/NotFoundError.js'
import { safeValidate, validateApiResponse } from '../schemas/api-responses.js'
import type { ApiPath } from '../types/advanced.js'
import { Logger, LogLevel } from '../utils/logger.js'
import { RateLimiter, type RateLimiterConfig } from '../utils/rate-limiter.js'
import { ResponseCache, type ResponseCacheConfig } from '../utils/response-cache.js'
import { sanitizeMessage } from '../utils/sanitizer.js'

interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  retryableStatuses: number[]
}

type RequestBody = Record<string, unknown> | unknown[] | string | number | boolean | null

// Top-level regex patterns for path extraction (performance optimization)
const TABLES_PATH_REGEX = /\/tables\/([^/]+)/
const DOCS_PATH_REGEX = /\/docs\/([^/]+)/
const WORKSPACES_PATH_REGEX = /\/workspaces\/([^/]+)/
const ORGS_PATH_REGEX = /\/orgs\/([^/]+)/
// Regex for extracting key names from KeyError messages (e.g., "KeyError 'NonExistentColumn'")
const KEY_ERROR_REGEX = /['`]([^'`]+)['`]/

interface RequestOptions<TResponse = unknown> {
  schema?: z.ZodSchema<TResponse>
  config?: AxiosRequestConfig
  context?: string
}

interface ValidatedResponse<TResponse> {
  data: TResponse
  validated: boolean
  raw?: unknown
}

export class GristClient {
  private client: AxiosInstance
  private baseUrl: string
  private retryConfig: RetryConfig
  private rateLimiter: RateLimiter
  private cache: ResponseCache
  private cacheEnabled: boolean
  private logger: Logger

  constructor(
    baseUrl: string,
    apiKey: string,
    retryConfig?: Partial<RetryConfig>,
    rateLimiterConfig?: Partial<RateLimiterConfig>,
    cacheConfig?: Partial<ResponseCacheConfig>,
    enableCache = true
  ) {
    this.baseUrl = baseUrl

    this.retryConfig = {
      maxRetries: retryConfig?.maxRetries ?? 3,
      baseDelayMs: retryConfig?.baseDelayMs ?? 1000,
      maxDelayMs: retryConfig?.maxDelayMs ?? 30000,
      retryableStatuses: retryConfig?.retryableStatuses ?? [429, 502, 503, 504]
    }

    this.rateLimiter = new RateLimiter(rateLimiterConfig)
    this.cache = new ResponseCache(cacheConfig)
    this.cacheEnabled = enableCache
    this.logger = new Logger({
      minLevel: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
    })

    this.client = axios.create({
      baseURL: `${baseUrl}/api`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Grist-Client': CLIENT_IDENTIFIER
      },
      timeout: API_TIMEOUT
    })
  }

  getRateLimiter(): RateLimiter {
    return this.rateLimiter
  }

  getResponseCache(): ResponseCache {
    return this.cache
  }

  async get<TResponse>(
    path: string | ApiPath,
    params?: Record<string, unknown>,
    options?: RequestOptions<TResponse>
  ): Promise<TResponse> {
    const startTime = Date.now()
    const cacheKey = this.getCacheKey('GET', path, params)

    if (this.cacheEnabled) {
      const cached = this.cache.get(cacheKey)
      if (cached !== undefined) {
        const duration = Date.now() - startTime

        this.logger.debug('API request (cache hit)', {
          method: 'GET',
          path,
          duration,
          cached: true
        })

        return cached as TResponse
      }
    }

    const result = await this.rateLimiter.schedule(() =>
      this.retryWithBackoff(async () => {
        try {
          const response = await this.client.get<TResponse>(path, {
            params,
            ...options?.config
          })

          return this.validateResponse(response.data, options)
        } catch (error) {
          this.logRequestError(error, 'GET', path, { params })
          throw this.handleError(error, 'GET', path)
        }
      }, `GET ${path}`)
    )

    const duration = Date.now() - startTime

    this.logger.info('API request completed', {
      method: 'GET',
      path,
      duration,
      cached: false
    })

    if (this.cacheEnabled) {
      this.cache.set(cacheKey, result)
    }

    return result
  }

  async post<TResponse, TRequest = unknown>(
    path: string | ApiPath,
    data: TRequest,
    options?: RequestOptions<TResponse>
  ): Promise<TResponse> {
    const startTime = Date.now()
    this.validateRequestSize(data)

    const result = await this.rateLimiter.schedule(() =>
      this.retryWithBackoff(async () => {
        try {
          const response = await this.client.post<TResponse>(path, data, options?.config)

          return this.validateResponse(response.data, options)
        } catch (error) {
          this.logRequestError(error, 'POST', path, {
            dataSize: JSON.stringify(data).length
          })
          throw this.handleError(error, 'POST', path)
        }
      }, `POST ${path}`)
    )

    const duration = Date.now() - startTime

    this.logger.info('API request completed', {
      method: 'POST',
      path,
      duration
    })

    this.invalidateCacheForPath(path)

    return result
  }

  async put<TResponse, TRequest = unknown>(
    path: string | ApiPath,
    data: TRequest,
    options?: RequestOptions<TResponse>
  ): Promise<TResponse> {
    this.validateRequestSize(data)

    const result = await this.rateLimiter.schedule(() =>
      this.retryWithBackoff(async () => {
        try {
          const response = await this.client.put<TResponse>(path, data, options?.config)

          return this.validateResponse(response.data, options)
        } catch (error) {
          this.logRequestError(error, 'PUT', path, {
            dataSize: JSON.stringify(data).length
          })
          throw this.handleError(error, 'PUT', path)
        }
      }, `PUT ${path}`)
    )

    this.invalidateCacheForPath(path)

    return result
  }

  async patch<TResponse, TRequest = unknown>(
    path: string | ApiPath,
    data: TRequest,
    options?: RequestOptions<TResponse>
  ): Promise<TResponse> {
    this.validateRequestSize(data)

    const result = await this.rateLimiter.schedule(() =>
      this.retryWithBackoff(async () => {
        try {
          const response = await this.client.patch<TResponse>(path, data, options?.config)

          return this.validateResponse(response.data, options)
        } catch (error) {
          this.logRequestError(error, 'PATCH', path, {
            dataSize: JSON.stringify(data).length
          })
          throw this.handleError(error, 'PATCH', path)
        }
      }, `PATCH ${path}`)
    )

    this.invalidateCacheForPath(path)

    return result
  }

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
          this.logRequestError(error, 'DELETE', path)
          throw this.handleError(error, 'DELETE', path)
        }
      }, `DELETE ${path}`)
    )

    this.invalidateCacheForPath(path)

    return result
  }

  private validateRequestSize(data: unknown): void {
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

  private validateResponse<TResponse>(
    data: unknown,
    options?: RequestOptions<TResponse>
  ): TResponse {
    if (!options?.schema) {
      return data as TResponse
    }
    return validateApiResponse(options.schema, data, options.context)
  }

  safeValidateResponse<TResponse>(
    data: unknown,
    schema: z.ZodSchema<TResponse>
  ): { success: true; data: TResponse } | { success: false; error: z.ZodError } {
    return safeValidate(schema, data)
  }

  // Conservative classification - unknown errors default to CRITICAL
  private classifyErrorSeverity(error: unknown): 'validation' | 'retriable' | 'critical' {
    if (!axios.isAxiosError(error)) {
      return 'critical'
    }

    const status = error.response?.status

    if (status && this.retryConfig.retryableStatuses.includes(status)) {
      return 'retriable'
    }

    if (status === 400 || status === 404 || status === 422) {
      return 'validation'
    }

    return 'critical'
  }

  private extractGristErrorMessage(error: unknown): string | undefined {
    if (!axios.isAxiosError(error)) {
      return undefined
    }

    const errorData = error.response?.data as
      | {
          error?: string | { message?: string }
          message?: string
          details?: { userError?: string }
        }
      | undefined

    if (!errorData) {
      return undefined
    }

    // Extract userError (most detailed) or error message
    const userError = errorData.details?.userError
    if (userError && typeof userError === 'string') {
      return userError
    }

    const message =
      (typeof errorData.error === 'string' ? errorData.error : errorData.error?.message) ||
      errorData.message

    return message && typeof message === 'string' ? message : undefined
  }

  private logRequestError(
    error: unknown,
    method: HttpMethod,
    path: string,
    additionalContext?: Record<string, unknown>
  ): void {
    const severity = this.classifyErrorSeverity(error)
    const gristError = this.extractGristErrorMessage(error)
    const truncatedGristError =
      gristError && gristError.length > 500
        ? `${gristError.substring(0, 500)}... [truncated]`
        : gristError

    const context = {
      method,
      path,
      status: this.getErrorStatus(error),
      ...additionalContext,
      ...(truncatedGristError ? { gristError: truncatedGristError } : {})
    }

    switch (severity) {
      case 'validation':
        this.logger.debug(
          `${method} validation error`,
          context,
          error instanceof Error ? error : undefined
        )
        break

      case 'retriable':
        break

      case 'critical':
        this.logger.error(
          `${method} request failed`,
          context,
          error instanceof Error ? error : undefined
        )
        break
    }
  }

  /** Calculate exponential backoff delay with jitter */
  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = this.retryConfig.baseDelayMs * 2 ** attempt
    const jitter = Math.random() * 0.3 * exponentialDelay
    return Math.min(exponentialDelay + jitter, this.retryConfig.maxDelayMs)
  }

  /** Check if we should throw the error (non-retryable or exhausted retries) */
  private shouldThrowRetryError(error: unknown, attempt: number, context: string): boolean {
    if (!this.isRetryableError(error)) {
      return true
    }
    if (attempt === this.retryConfig.maxRetries) {
      this.logger.error('Retry exhausted', {
        attempt: attempt + 1,
        maxRetries: this.retryConfig.maxRetries,
        context,
        status: this.getErrorStatus(error)
      })
      return true
    }
    return false
  }

  /** Log retry attempt */
  private logRetryAttempt(attempt: number, context: string, delayMs: number, error: unknown): void {
    this.logger.debug('Retrying request after error', {
      attempt: attempt + 1,
      maxRetries: this.retryConfig.maxRetries,
      context,
      delayMs: Math.round(delayMs),
      status: this.getErrorStatus(error)
    })
  }

  // Exponential backoff with jitter to prevent thundering herd
  private async retryWithBackoff<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        if (this.shouldThrowRetryError(error, attempt, context)) {
          throw error
        }

        const delayMs = this.calculateBackoffDelay(attempt)
        lastError = error instanceof Error ? error : new Error(String(error))
        this.logRetryAttempt(attempt, context, delayMs, error)
        await this.sleep(delayMs)
      }
    }

    throw lastError || new Error(`Retry failed for ${context}`)
  }

  private isRetryableError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      // HTTP status-based retry (existing logic)
      const status = error.response?.status
      if (status !== undefined && this.retryConfig.retryableStatuses.includes(status)) {
        return true
      }

      // Network-level error retry (new logic)
      // Axios errors without response are typically network failures
      if (error.response === undefined && error.code) {
        const networkErrorCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EPIPE']
        if (networkErrorCodes.includes(error.code)) {
          return true
        }
      }
    }

    // Fallback: check error message for network error patterns
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      const networkPatterns = [
        'socket hang up',
        'stream has been aborted',
        'aborted',
        'network',
        'econnreset',
        'etimedout'
      ]
      if (networkPatterns.some((pattern) => message.includes(pattern))) {
        return true
      }
    }

    return false
  }

  private getErrorStatus(error: unknown): string {
    if (axios.isAxiosError(error)) {
      return error.response?.status?.toString() ?? 'unknown'
    }
    return 'unknown'
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private detect500EncodingError(sanitizedMessage: string): boolean {
    const errorText = String(sanitizedMessage).toLowerCase()
    return (
      errorText.includes('invalid') || errorText.includes('type') || errorText.includes('expected')
    )
  }

  private detect400SqlError(path: string): boolean {
    return path.includes('/sql')
  }

  private detect400ValidationError(sanitizedMessage: string): boolean {
    const errorLower = String(sanitizedMessage).toLowerCase()
    return (
      errorLower.includes('invalid') ||
      errorLower.includes('required') ||
      errorLower.includes('expected')
    )
  }

  private detect400KeyError(sanitizedMessage: string): boolean {
    return String(sanitizedMessage).toLowerCase().includes('keyerror')
  }

  private buildKeyError(sanitizedMessage: string): Error {
    // Extract the key name from messages like "KeyError 'NonExistentColumn'"
    const keyMatch = sanitizedMessage.match(KEY_ERROR_REGEX)
    const keyName = keyMatch ? keyMatch[1] : 'unknown'

    return new Error(
      `Column not found: '${keyName}'. ` +
        `Use grist_get_tables with detail_level="columns" to see available column names. ` +
        `Column IDs are case-sensitive and must match exactly.`
    )
  }

  private buildEncodingError(sanitizedMessage: string): Error {
    return new Error(
      `Grist server error (500): Data validation failed. ` +
        `Common causes: column type mismatch (e.g., text in numeric column), ` +
        `invalid reference ID (row doesn't exist), formula column write attempt, ` +
        `or server-side validation rule failure. ` +
        `See grist_add_records description for valid data formats. ` +
        `Original error: ${sanitizedMessage}`
    )
  }

  private buildSqlError(sanitizedMessage: string): Error {
    return new Error(
      `SQL syntax error: ${sanitizedMessage}. ` +
        `Check table/column names (case-sensitive), quote string values, and verify JOIN syntax. ` +
        `Use grist_get_tables to see schema. See grist_query_sql description for examples.`
    )
  }

  private buildValidationError(sanitizedMessage: string): Error {
    return new Error(
      `Validation error: ${sanitizedMessage}. ` +
        `Common causes: missing required fields, invalid data type, invalid widget options, or invalid column/table ID. ` +
        `Check tool description for parameter requirements and use grist_get_tables to see schema.`
    )
  }

  private build400Error(sanitizedMessage: string, method: HttpMethod, path: string): ApiError {
    return new ApiError(400, method, path, sanitizedMessage, { baseUrl: this.baseUrl })
  }

  private buildServerError(status: number, method: HttpMethod, path: string): ApiError {
    return new ApiError(status, method, path, 'Server error', { baseUrl: this.baseUrl })
  }

  private handle500Error(path: string, sanitizedMessage: string, method: HttpMethod): Error {
    if (path.includes('/apply') && this.detect500EncodingError(sanitizedMessage)) {
      return this.buildEncodingError(sanitizedMessage)
    }

    return this.buildServerError(500, method, path)
  }

  private handle400Error(path: string, sanitizedMessage: string, method: HttpMethod): Error {
    if (this.detect400SqlError(path)) {
      return this.buildSqlError(sanitizedMessage)
    }

    // Check for KeyError (column/key not found) before generic validation
    if (this.detect400KeyError(sanitizedMessage)) {
      return this.buildKeyError(sanitizedMessage)
    }

    if (this.detect400ValidationError(sanitizedMessage)) {
      return this.buildValidationError(sanitizedMessage)
    }

    return this.build400Error(sanitizedMessage, method, path)
  }

  private handleError(error: unknown, method: HttpMethod, path: string): Error {
    if (!axios.isAxiosError(error)) {
      // Non-Axios errors
      if (error instanceof Error) {
        return new Error(`Unexpected error: ${sanitizeMessage(error.message)}`)
      }
      return new Error(`Unexpected error: ${sanitizeMessage(String(error))}`)
    }

    const axiosError = error as AxiosError<{
      error?: string | { message?: string }
      message?: string
      details?: { userError?: string }
    }>
    const status = axiosError.response?.status
    const errorData = axiosError.response?.data

    // Extract error message - Grist returns { error: string, details: { userError: string } }
    const message =
      (typeof errorData?.error === 'string' ? errorData.error : errorData?.error?.message) ||
      errorData?.message ||
      axiosError.message

    // Extract userError if available (more detailed/user-friendly)
    const userError = errorData?.details?.userError

    // Sanitize the error message from API
    const sanitizedMessage = sanitizeMessage(userError || message)

    if (!status) {
      if (axiosError.code === 'ECONNABORTED') {
        return new Error(
          `Request timed out after ${API_TIMEOUT}ms. The operation took too long. ` +
            `Try reducing the amount of data requested or check your network connection.`
        )
      }
      return new Error(`Request failed: ${sanitizedMessage}. ${method} ${path} returned no status.`)
    }

    // Special handling for 400 and 500 with sub-detection logic
    if (status === 400) return this.handle400Error(path, sanitizedMessage, method)
    if (status === 500) return this.handle500Error(path, sanitizedMessage, method)

    // 404 → NotFoundError (structured)
    if (status === 404) return this.build404Error(path)

    // 429 → ApiError with retryAfter
    if (status === 429) {
      const retryAfterHeader = axiosError.response?.headers?.['retry-after']
      const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : undefined
      return new ApiError(429, method, path, sanitizedMessage, {
        baseUrl: this.baseUrl,
        retryAfter
      })
    }

    // All other status codes → ApiError
    return new ApiError(status, method, path, sanitizedMessage, { baseUrl: this.baseUrl })
  }

  // Check more specific paths first (table before doc)
  private build404Error(path: string): NotFoundError {
    const tableMatch = path.match(TABLES_PATH_REGEX)
    const docMatch = path.match(DOCS_PATH_REGEX)
    const workspaceMatch = path.match(WORKSPACES_PATH_REGEX)
    const orgMatch = path.match(ORGS_PATH_REGEX)

    // Check table errors FIRST (more specific than document)
    if (tableMatch?.[1]) {
      return new NotFoundError('table', tableMatch[1])
    }

    if (docMatch?.[1]) {
      return new NotFoundError('document', docMatch[1])
    }

    if (workspaceMatch?.[1]) {
      return new NotFoundError('workspace', workspaceMatch[1])
    }

    if (orgMatch?.[1]) {
      return new NotFoundError('organization', orgMatch[1])
    }

    // Generic 404 — use path as resource identifier
    return new NotFoundError('document', path)
  }

  getBaseUrl(): string {
    return this.baseUrl
  }

  getAxiosInstance(): AxiosInstance {
    return this.client
  }

  private getCacheKey(method: HttpMethod, path: string, params?: Record<string, unknown>): string {
    // Sort params for deterministic cache keys regardless of object property order
    let paramStr = ''
    if (params) {
      const sortedParams = Object.keys(params)
        .sort()
        .reduce(
          (acc, key) => {
            acc[key] = params[key]
            return acc
          },
          {} as Record<string, unknown>
        )
      paramStr = JSON.stringify(sortedParams)
    }
    return `${method}:${path}${paramStr ? `:${paramStr}` : ''}`
  }

  clearCache(): void {
    this.cache.clear()
  }

  invalidateCache(pattern: RegExp): number {
    return this.cache.invalidatePattern(pattern)
  }

  private invalidateCacheForPath(path: string): void {
    if (!this.cacheEnabled) {
      return
    }

    // Extract document ID from path
    const docMatch = path.match(DOCS_PATH_REGEX)
    if (!docMatch) {
      // Can't determine scope, clear all cache to be safe
      this.cache.clear()
      return
    }

    const docId = docMatch[1]
    if (!docId) {
      // Capture group didn't match, clear all cache to be safe
      this.cache.clear()
      return
    }

    // Invalidate all cache entries for this document
    // This includes tables, records, SQL queries, etc.
    const docPattern = new RegExp(`/docs/${docId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    this.cache.invalidatePattern(docPattern)
  }

  getCacheStats() {
    return this.cache.getStats()
  }
}

export type { RequestOptions, ValidatedResponse, HttpMethod, RequestBody }
