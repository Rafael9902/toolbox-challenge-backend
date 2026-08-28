import { describeError } from './appError.js'
import { logger } from './logger.js'

/**
 * Registers the last-resort handlers for errors that escape every request.
 *
 * Without them NodeJS 14 ends the process on an uncaught exception, and reports
 * an unhandled rejection as a deprecation warning on stderr, outside the logger.
 * Both become a log line here and neither stops the server: this API keeps no
 * state between requests, so the next one can still be served.
 *
 * @param {Object} [dependencies]  Seam for the tests, which must not register
 *        handlers on the real process; production callers pass nothing.
 * @param {{ on: function(string, Function): void }} [dependencies.target]
 * @param {{ error: function(Object): void }}        [dependencies.log]
 * @returns {void}
 */
export const registerProcessErrorHandlers = ({
  target = process,
  log = logger
} = {}) => {
  const report = (event) => (error) => {
    try {
      log.error({ event, error: describeError(error) })
    } catch {
      // Throwing from here is the crash these handlers exist to prevent.
    }
  }

  target.on('unhandledRejection', report('unhandled_rejection'))
  target.on('uncaughtException', report('uncaught_exception'))
}
