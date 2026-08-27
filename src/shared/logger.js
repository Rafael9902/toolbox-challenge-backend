import { randomBytes } from 'crypto'

import pino from 'pino'

import { config } from './config.js'

/** Fields written on every log line. */
const base = { service: config.service.name, version: config.service.version }

/**
 * Logger for events outside a request, such as server startup.
 *
 * @type {import('pino').Logger}
 */
export const logger = pino({ base })

/**
 * Builds the middleware that writes one log line per request.
 *
 * The line is accumulated on `req.logger` and written when the response ends,
 * so any layer holding the request can add fields to it:
 * `req.logger.add({ files_failed: 2 })`.
 *
 * @param {{ write: (line: string) => void }} [destination] Where lines are
 *        written. Defaults to stdout; tests pass a collector.
 * @returns {function(Object, Object, Function): void} Express middleware.
 */
export const createRequestLogger = (destination) => {
  const log = destination ? pino({ base }, destination) : logger

  return (req, res, next) => {
    const startedAt = Date.now()
    const fields = {
      request_id: req.get('x-request-id') || randomBytes(16).toString('hex'),
      method: req.method,
      path: req.originalUrl
    }

    req.logger = { add: (extra) => Object.assign(fields, extra) }

    res.on('finish', () => {
      log.info({
        ...fields,
        status_code: res.statusCode,
        duration_ms: Date.now() - startedAt
      })
    })

    next()
  }
}
