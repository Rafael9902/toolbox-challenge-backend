import chai from 'chai'
import { notFound, errorHandler } from '../../src/shared/http/errors.js'
import { createAppError, ERROR_CODES } from '../../src/shared/appError.js'

const { expect } = chai

/** Minimal Express doubles: just what the error handler touches. */
const fakeReq = () => {
  const logged = {}
  return { logged, logger: { add: (fields) => Object.assign(logged, fields) } }
}
const fakeRes = () => {
  const res = { statusCode: null, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

describe('notFound', () => {
  it('turns an unmatched route into a typed 404 error', () => {
    let passed = null
    notFound({ method: 'GET', originalUrl: '/unknown' }, fakeRes(), (e) => { passed = e })

    expect(passed.code).to.equal(ERROR_CODES.ROUTE_NOT_FOUND)
    expect(passed.status).to.equal(404)
    expect(passed.message).to.equal('Route not found: GET /unknown')
  })

  it('passes the error on instead of responding itself', () => {
    const res = fakeRes()
    notFound({ method: 'GET', originalUrl: '/unknown' }, res, () => {})

    expect(res.statusCode).to.equal(null)
  })
})

describe('errorHandler', () => {
  it('maps an unknown error to a 500 with a generic message', () => {
    const res = fakeRes()

    errorHandler(new Error('connection reset by peer'), fakeReq(), res, () => {})

    expect(res.statusCode).to.equal(500)
    expect(res.body.error.code).to.equal(ERROR_CODES.INTERNAL)
    expect(res.body.error.message).to.equal('Internal server error')
  })

  it('never leaks the stack trace or internal details to the client', () => {
    const res = fakeRes()

    errorHandler(new Error('connection reset by peer'), fakeReq(), res, () => {})

    expect(JSON.stringify(res.body)).to.not.include('connection reset by peer')
    expect(res.body.error).to.not.have.property('stack')
  })

  it('keeps the real cause in the log line, where it is useful', () => {
    const req = fakeReq()

    errorHandler(new Error('connection reset by peer'), req, fakeRes(), () => {})

    expect(req.logged.error).to.deep.equal({
      type: 'Error',
      code: ERROR_CODES.INTERNAL,
      message: 'connection reset by peer',
      retriable: false
    })
  })

  it('honours the status, code and message of a typed AppError', () => {
    const req = fakeReq()
    const res = fakeRes()

    errorHandler(createAppError({
      code: ERROR_CODES.EXTERNAL_API_UNAVAILABLE,
      message: 'External API request failed: /files',
      status: 502,
      retriable: true
    }), req, res, () => {})

    expect(res.statusCode).to.equal(502)
    expect(res.body.error.code).to.equal(ERROR_CODES.EXTERNAL_API_UNAVAILABLE)
    expect(res.body.error.message).to.equal('External API request failed: /files')
    expect(req.logged.error.retriable).to.equal(true)
  })

  it('does not blow up when there is no logger on the request', () => {
    const res = fakeRes()

    expect(() => errorHandler(new Error('boom'), {}, res, () => {})).to.not.throw()
    expect(res.statusCode).to.equal(500)
  })
})
