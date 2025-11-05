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

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * HTTP method types for error handling
 */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

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

  /**
   * Create a new Grist API client
   *
   * @param baseUrl - Base URL of the Grist server (e.g., 'https://docs.getgrist.com')
   * @param apiKey - API key for authentication
   */
  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl

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
    try {
      const response = await this.client.get<TResponse>(path, {
        params,
        ...options?.config
      })

      return this.validateResponse(response.data, options)
    } catch (error) {
      throw this.handleError(error, 'GET', path)
    }
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
    try {
      const response = await this.client.post<TResponse>(
        path,
        data,
        options?.config
      )

      return this.validateResponse(response.data, options)
    } catch (error) {
      throw this.handleError(error, 'POST', path)
    }
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
    try {
      const response = await this.client.put<TResponse>(
        path,
        data,
        options?.config
      )

      return this.validateResponse(response.data, options)
    } catch (error) {
      throw this.handleError(error, 'PUT', path)
    }
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
    try {
      const response = await this.client.patch<TResponse>(
        path,
        data,
        options?.config
      )

      return this.validateResponse(response.data, options)
    } catch (error) {
      throw this.handleError(error, 'PATCH', path)
    }
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
    try {
      const response = await this.client.delete<TResponse>(path, options?.config)

      return this.validateResponse(response.data, options)
    } catch (error) {
      throw this.handleError(error, 'DELETE', path)
    }
  }

  // ==========================================================================
  // Validation Helpers
  // ==========================================================================

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
        error?: { message?: string }
        message?: string
      }>
      const status = axiosError.response?.status
      const message =
        axiosError.response?.data?.error?.message ||
        axiosError.response?.data?.message ||
        axiosError.message

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
            `Request failed: ${message}. ${method} ${path} returned status ${status}.`
          )
      }
    }

    // Non-Axios errors
    if (error instanceof Error) {
      return new Error(`Unexpected error: ${error.message}`)
    }

    return new Error(`Unexpected error: ${String(error)}`)
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
}

// ============================================================================
// Type Exports for External Use
// ============================================================================

export type { RequestOptions, ValidatedResponse, HttpMethod, RequestBody }
