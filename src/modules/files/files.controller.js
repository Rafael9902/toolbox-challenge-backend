import * as filesService from './files.service.js'
import { readFileNameFilter } from './files.validators.js'

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
