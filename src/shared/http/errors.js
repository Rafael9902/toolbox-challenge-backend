import { isAppError, createAppError, describeError, ERROR_CODES } from '../appError.js'

/**
 * Catch-all for unmatched routes. Express answers those with HTML by default,
 * so the 404 is turned into a typed error and passed to {@link errorHandler}.
 *
 * Registered after every route and before {@link errorHandler}.
 *
 * @param {Object}   req
 * @param {Object}   res
 * @param {Function} next
 * @returns {void}
 */
export const notFound = (req, res, next) => {
  next(createAppError({
    code: ERROR_CODES.ROUTE_NOT_FOUND,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    status: 404
  }))
}

/**
 * Terminal error handler. Answers JSON, records the cause on the request log
 * line and never exposes the stack trace to the client.
 *
 * @param {Error}    error
 * @param {Object}   req
 * @param {Object}   res
 * @param {Function} next  Unused, but Express detects error handlers by arity.
 * @returns {void}
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (error, req, res, next) => {
  const known = isAppError(error)
  const code = known ? error.code : ERROR_CODES.INTERNAL

  req.logger?.add({ error: describeError(error) })

  res.status(known ? error.status : 500).json({
    error: { code, message: known ? error.message : 'Internal server error' }
  })
}
