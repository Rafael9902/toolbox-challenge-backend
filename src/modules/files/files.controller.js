import { createAppError, ERROR_CODES } from '../../shared/appError.js'
import * as filesService from './files.service.js'

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
const readFileNameFilter = (value) => {
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

/**
 * GET /files/data
 *
 * Responds with the bare array fixed by the challenge statement, without an
 * envelope, and folds the domain counters of the service into the request log
 * line. The optional `?fileName=` filter narrows the answer to a single file;
 * the requested name is recorded on the log line so a filtered request can be
 * told apart from a full one.
 *
 * @param {Object}   req
 * @param {Object}   res
 * @param {Function} next
 * @returns {Promise<void>}
 */
export const getFilesData = async (req, res, next) => {
  try {
    const fileName = readFileNameFilter(req.query.fileName)
    if (fileName !== null) req.logger.add({ filter_file_name: fileName })

    const { data, stats } = await filesService.getFilesData({ fileName })
    req.logger.add(stats)
    res.status(200).json(data)
  } catch (error) {
    next(error)
  }
}

/**
 * GET /files/list
 *
 * Responds with the `{ files: [...] }` envelope fixed by the challenge
 * statement, which mirrors the external API. The repository unwraps that
 * envelope so the domain works with a plain array of names, so this handler is
 * the one that puts it back on the wire.
 *
 * @param {Object}   req
 * @param {Object}   res
 * @param {Function} next
 * @returns {Promise<void>}
 */
export const getFilesList = async (req, res, next) => {
  try {
    const { data, stats } = await filesService.getFilesList()
    req.logger.add(stats)
    res.status(200).json({ files: data })
  } catch (error) {
    next(error)
  }
}

/**
 * GET /files/health
 *
 * @param {Object}   req
 * @param {Object}   res
 * @param {Function} next
 * @returns {Promise<void>}
 */
export const getHealth = async (req, res, next) => {
  try {
    const { data, stats } = await filesService.getHealth()
    req.logger.add(stats)
    res.status(200).json(data)
  } catch (error) {
    next(error)
  }
}
