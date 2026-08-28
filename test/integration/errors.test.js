import chai from 'chai'
import express from 'express'
import request from 'supertest'

import { createRequestLogger } from '../../src/shared/logger.js'
import { notFound, errorHandler } from '../../src/shared/http/errors.js'

const { expect } = chai

/**
 * Mirrors the middleware pipeline of `buildApp` around a route that fails.
 *
 * No route of the API throws an uncontrolled error on purpose, so the only way
 * to prove Express routes one to our handler instead of answering its own HTML
 * page is to mount one here.
 *
 * @param {function(Object, Object, Function): void} handler
 * @returns {{ app: import('express').Express, lines: Object[] }}
 */
const appAround = (handler) => {
  const lines = []
  const app = express()

  app.use(createRequestLogger({ write: (line) => lines.push(JSON.parse(line)) }))
  app.get('/boom', handler)
  app.use(notFound)
  app.use(errorHandler)

  return { app, lines }
}

describe('uncontrolled errors reaching the API', () => {
  it('answers JSON, never the HTML page Express would serve, on a synchronous throw', async () => {
    const { app } = appAround(() => { throw new Error('connection reset by peer') })

    const res = await request(app).get('/boom').expect(500)

    expect(res.headers['content-type']).to.match(/application\/json/)
    expect(res.text).to.not.include('<html')
    expect(res.text).to.not.include('<pre')
  })

  it('hides the message and the stack trace of an unknown error', async () => {
    const { app } = appAround(() => { throw new Error('connection reset by peer') })

    const res = await request(app).get('/boom').expect(500)

    expect(res.body).to.deep.equal({
      error: { code: 'INTERNAL', message: 'Internal server error' }
    })
    expect(res.text).to.not.include('connection reset by peer')
    expect(res.text).to.not.include('errors.test.js')
  })

  it('answers JSON when a handler forwards a rejection with next()', async () => {
    const { app } = appAround(async (req, res, next) => {
      try {
        await Promise.reject(new Error('the external API vanished'))
      } catch (error) {
        next(error)
      }
    })

    const res = await request(app).get('/boom').expect(500)

    expect(res.body.error.code).to.equal('INTERNAL')
    expect(res.text).to.not.include('the external API vanished')
  })

  it('still writes exactly one log line, keeping the real cause for the operator', async () => {
    const { app, lines } = appAround(() => { throw new Error('connection reset by peer') })

    await request(app).get('/boom').expect(500)

    expect(lines).to.have.lengthOf(1)
    expect(lines[0].status_code).to.equal(500)
    expect(lines[0].error).to.deep.equal({
      type: 'Error',
      code: 'INTERNAL',
      message: 'connection reset by peer',
      retriable: false
    })
  })
})
