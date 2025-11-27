export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface HttpRequestConfig {
  headers?: Record<string, string>
  timeout?: number
  params?: Record<string, unknown>
}

export interface HttpService {
  get<T>(path: string, params?: Record<string, unknown>): Promise<T>
  post<T>(path: string, data: unknown): Promise<T>
  put<T>(path: string, data: unknown): Promise<T>
  patch<T>(path: string, data: unknown): Promise<T>
  delete<T>(path: string): Promise<T>
  request<T>(
    method: HttpMethod,
    path: string,
    data?: unknown,
    params?: Record<string, unknown>
  ): Promise<T>
}
