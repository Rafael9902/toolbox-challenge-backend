import * as filesService from './files.service.js'

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
