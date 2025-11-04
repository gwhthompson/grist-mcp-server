/**
 * GristClient - HTTP client for Grist API interactions
 *
 * Handles all API communication with comprehensive error handling
 * and actionable error messages for AI assistants.
 */

import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { API_TIMEOUT } from '../constants.js'

export class GristClient {
  private client: AxiosInstance
  private baseUrl: string

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

  /**
   * GET request with error handling
   */
  async get<T>(path: string, params?: Record<string, any>): Promise<T> {
    try {
      const response = await this.client.get<T>(path, { params })
      return response.data
    } catch (error) {
      throw this.handleError(error, 'GET', path)
    }
  }

  /**
   * POST request with error handling
   */
  async post<T>(path: string, data: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.post<T>(path, data, config)
      return response.data
    } catch (error) {
      throw this.handleError(error, 'POST', path)
    }
  }

  /**
   * PUT request with error handling
   */
  async put<T>(path: string, data: any): Promise<T> {
    try {
      const response = await this.client.put<T>(path, data)
      return response.data
    } catch (error) {
      throw this.handleError(error, 'PUT', path)
    }
  }

  /**
   * DELETE request with error handling
   */
  async delete<T>(path: string): Promise<T> {
    try {
      const response = await this.client.delete<T>(path)
      return response.data
    } catch (error) {
      throw this.handleError(error, 'DELETE', path)
    }
  }

  /**
   * Transform errors into agent-friendly messages
   * Provides actionable guidance for common error scenarios
   */
  private handleError(error: unknown, method: string, path: string): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<any>
      const status = axiosError.response?.status
      const message = axiosError.response?.data?.error?.message || axiosError.message

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
   * Build comprehensive 404 error with actionable guidance
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

  /**
   * Get the base URL for generating resource URLs
   */
  getBaseUrl(): string {
    return this.baseUrl
  }
}
