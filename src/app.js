import express from 'express'

import { createRequestLogger } from './shared/logger.js'
import { notFound, errorHandler } from './shared/http/errors.js'
import { filesRouter } from './modules/files/index.js'

/**
 * Builds the Express application: shared middleware plus every feature router.
 *
 * Does not call `listen()`, which lets tests drive it through supertest without
 * opening a port.
 *
 * @param {Object} [options]
 * @param {{ write: (line: string) => void }} [options.logDestination] Where log
 *        lines are written. Defaults to stdout.
 * @returns {import('express').Express}
 */
export const buildApp = ({ logDestination } = {}) => {
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json())
  app.use(createRequestLogger(logDestination))

  app.use('/files', filesRouter)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
