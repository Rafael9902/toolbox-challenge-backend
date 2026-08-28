import * as filesService from './files.service.js'

/**
 * GET /files/data
 *
 * Responds with the bare array fixed by the challenge statement, without an
 * envelope, and folds the domain counters of the service into the request log
 * line.
 *
 * @param {Object}   req
 * @param {Object}   res
 * @param {Function} next
 * @returns {Promise<void>}
 */
export const getFilesData = async (req, res, next) => {
  try {
    const { data, stats } = await filesService.getFilesData()
    req.logger.add(stats)
    res.status(200).json(data)
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
