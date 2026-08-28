import { createAppError, ERROR_CODES } from '../../shared/appError.js'
import { config } from '../../shared/config.js'
import { createHttpClient } from '../../shared/http/httpClient.js'

const client = createHttpClient(config.externalApi)

/**
 * Builds the error raised when the external API answers with a body that does
 * not follow the documented listing shape.
 *
 * @returns {Error} AppError with `EXTERNAL_API_UNAVAILABLE`.
 */
const unexpectedListing = () => createAppError({
  code: ERROR_CODES.EXTERNAL_API_UNAVAILABLE,
  message: 'External API returned an unexpected file listing',
  status: 502,
  retriable: true
})

/**
 * @param {string} body
 * @returns {?Object} Parsed body, or null when it is not valid JSON.
 */
const parseBody = (body) => {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

/**
 * Reads the list of files served by the external API.
 *
 * Adapts the `{ "files": [...] }` envelope of the external API to the plain
 * array of names the domain works with.
 *
 * @returns {Promise<string[]>} File names, empty when the listing is empty.
 * @throws {Error} AppError with `EXTERNAL_API_UNAVAILABLE` when the request
 *         fails, times out, or the body does not follow the documented shape.
 */
export const listFiles = async () => {
  const { data } = await client.get('/files')
  const payload = parseBody(data)

  if (!payload || !Array.isArray(payload.files)) throw unexpectedListing()

  return payload.files
}
