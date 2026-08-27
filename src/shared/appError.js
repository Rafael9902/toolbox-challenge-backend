/**
 * Error codes exposed by the API.
 *
 * @readonly
 * @enum {string}
 */
export const ERROR_CODES = Object.freeze({
  EXTERNAL_API_UNAVAILABLE: 'EXTERNAL_API_UNAVAILABLE',
  EXTERNAL_API_FILE_NOT_FOUND: 'EXTERNAL_API_FILE_NOT_FOUND',
  INVALID_QUERY_PARAM: 'INVALID_QUERY_PARAM',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  INTERNAL: 'INTERNAL'
})

/**
 * Creates a typed application error.
 *
 * @param {Object}  params
 * @param {string}  params.code                 One of {@link ERROR_CODES}.
 * @param {string}  params.message              Description safe to send to the client.
 * @param {number}  [params.status=500]         HTTP status to respond with.
 * @param {boolean} [params.retriable=false]    Whether retrying may succeed.
 * @param {Error}   [params.cause]              Underlying error.
 * @returns {Error} Error with `name` set to `AppError` plus the fields above.
 */
export const createAppError = ({
  code,
  message,
  status = 500,
  retriable = false,
  cause
}) => {
  const error = new Error(message)
  error.name = 'AppError'
  error.code = code
  error.status = status
  error.retriable = retriable
  if (cause) error.cause = cause
  return error
}

/**
 * @param {*} error
 * @returns {boolean} True when the error was built by {@link createAppError}.
 */
export const isAppError = (error) => error instanceof Error && error.name === 'AppError'
