import axios from 'axios'

import { createAppError, ERROR_CODES } from '../appError.js'

/**
 * Builds the client for the external API.
 *
 * Responses are returned as raw text: the external API serves CSV, and parsing
 * belongs to the caller.
 *
 * @param {Object} params
 * @param {string} params.baseUrl
 * @param {string} params.token      Sent as `authorization: Bearer <token>`.
 * @param {number} params.timeoutMs
 * @returns {{ get: function(string): Promise<{ data: string, status: number }> }}
 */
export const createHttpClient = ({ baseUrl, token, timeoutMs }) => {
  const instance = axios.create({
    baseURL: baseUrl,
    timeout: timeoutMs,
    headers: { authorization: `Bearer ${token}` },
    transformResponse: (data) => data
  })

  return {
    /**
     * @param {string} path
     * @returns {Promise<{ data: string, status: number }>}
     * @throws {Error} AppError with `EXTERNAL_API_FILE_NOT_FOUND` on 404,
     *         `EXTERNAL_API_UNAVAILABLE` otherwise.
     */
    get: async (path) => {
      try {
        const response = await instance.get(path)
        return { data: response.data, status: response.status }
      } catch (cause) {
        const status = cause.response?.status
        throw createAppError({
          code: status === 404
            ? ERROR_CODES.EXTERNAL_API_FILE_NOT_FOUND
            : ERROR_CODES.EXTERNAL_API_UNAVAILABLE,
          message: `External API request failed: ${path}`,
          status: status === 404 ? 404 : 502,
          retriable: status !== 404,
          cause
        })
      }
    }
  }
}
