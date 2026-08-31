import { createAppError, ERROR_CODES } from '../../shared/appError.js'

/**
 * Reads the optional `?fileName=` filter of `GET /files/data`.
 *
 * An absent param is not an error: it is the default behaviour fixed by the
 * statement, every file. A param that is present but carries nothing usable is,
 * because the caller clearly meant to filter and could not say by what. The
 * value is repeated (`?fileName=a&fileName=b`) or structured (`?fileName[a]=b`)
 * when Express hands over something that is not a string, and neither names a
 * file.
 *
 * @param {*} value  `req.query.fileName`.
 * @returns {?string} The trimmed name, or null when there is no filter.
 * @throws {Error} AppError with `INVALID_QUERY_PARAM` when the param is present
 *         but empty or not a single string.
 */
export const readFileNameFilter = (value) => {
  if (value === undefined) return null

  const fileName = typeof value === 'string' ? value.trim() : ''

  if (fileName === '') {
    throw createAppError({
      code: ERROR_CODES.INVALID_QUERY_PARAM,
      message: 'Query param fileName must be a non-empty file name',
      status: 400
    })
  }

  return fileName
}
