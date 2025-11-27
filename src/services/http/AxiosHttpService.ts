import axios, { type AxiosInstance } from 'axios'
import { API_TIMEOUT } from '../../constants.js'
import type { HttpMethod, HttpService } from './HttpService.js'

export class AxiosHttpService implements HttpService {
  private readonly client: AxiosInstance

  constructor(baseUrl: string, apiKey: string, timeout: number = API_TIMEOUT) {
    this.client = axios.create({
      baseURL: `${baseUrl}/api`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      timeout,
      validateStatus: (status) => status < 500
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const response = await this.client.get<T>(path, { params })
    return response.data
  }

  async post<T>(path: string, data: unknown): Promise<T> {
    const response = await this.client.post<T>(path, data)
    return response.data
  }

  async put<T>(path: string, data: unknown): Promise<T> {
    const response = await this.client.put<T>(path, data)
    return response.data
  }

  async patch<T>(path: string, data: unknown): Promise<T> {
    const response = await this.client.patch<T>(path, data)
    return response.data
  }

  async delete<T>(path: string): Promise<T> {
    const response = await this.client.delete<T>(path)
    return response.data
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    data?: unknown,
    params?: Record<string, unknown>
  ): Promise<T> {
    const response = await this.client.request<T>({
      method,
      url: path,
      data,
      params
    })
    return response.data
  }
}
