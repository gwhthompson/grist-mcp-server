/**
 * HTTP Service Interface
 *
 * Abstraction for HTTP client to enable dependency injection and testing
 * Follows Interface Segregation Principle from SOLID
 */

/**
 * HTTP methods supported by the service
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * HTTP request configuration
 */
export interface HttpRequestConfig {
  headers?: Record<string, string>
  timeout?: number
  params?: Record<string, unknown>
}

/**
 * HTTP service interface for making API requests
 * Implementations can use axios, fetch, or any other HTTP client
 */
export interface HttpService {
  /**
   * GET request
   */
  get<T>(path: string, params?: Record<string, unknown>): Promise<T>

  /**
   * POST request
   */
  post<T>(path: string, data: unknown): Promise<T>

  /**
   * PUT request
   */
  put<T>(path: string, data: unknown): Promise<T>

  /**
   * PATCH request
   */
  patch<T>(path: string, data: unknown): Promise<T>

  /**
   * DELETE request
   */
  delete<T>(path: string): Promise<T>

  /**
   * Generic request method
   */
  request<T>(
    method: HttpMethod,
    path: string,
    data?: unknown,
    params?: Record<string, unknown>
  ): Promise<T>
}
