import chai from 'chai'

import { registerProcessErrorHandlers } from '../../src/shared/processErrors.js'
import { createAppError, ERROR_CODES } from '../../src/shared/appError.js'

const { expect } = chai

/**
 * Stands in for `process`: collects the handlers instead of registering them,
 * so a test can fire one without touching the process running mocha.
 */
const fakeProcess = () => {
  const handlers = {}
  return {
    handlers,
    on: (event, handler) => { handlers[event] = handler },
    emit: (event, error) => handlers[event](error)
  }
}

/** Collects the log lines the handlers write. */
const fakeLog = () => {
  const lines = []
  return { lines, error: (fields) => lines.push(fields) }
}

describe('registerProcessErrorHandlers', () => {
  it('listens for both ways an error can escape a request', () => {
    const target = fakeProcess()

    registerProcessErrorHandlers({ target, log: fakeLog() })

    expect(Object.keys(target.handlers).sort())
      .to.deep.equal(['uncaughtException', 'unhandledRejection'])
  })

  it('reports an uncaught exception as a single log line', () => {
    const target = fakeProcess()
    const log = fakeLog()
    registerProcessErrorHandlers({ target, log })

    target.emit('uncaughtException', new Error('detached boom'))

    expect(log.lines).to.have.lengthOf(1)
    expect(log.lines[0]).to.deep.equal({
      event: 'uncaught_exception',
      error: {
        type: 'Error',
        code: ERROR_CODES.INTERNAL,
        message: 'detached boom',
        retriable: false
      }
    })
  })

  it('reports an unhandled rejection keeping the fields of a typed error', () => {
    const target = fakeProcess()
    const log = fakeLog()
    registerProcessErrorHandlers({ target, log })

    target.emit('unhandledRejection', createAppError({
      code: ERROR_CODES.EXTERNAL_API_UNAVAILABLE,
      message: 'External API request failed: /files',
      status: 502,
      retriable: true
    }))

    expect(log.lines[0].event).to.equal('unhandled_rejection')
    expect(log.lines[0].error.type).to.equal('AppError')
    expect(log.lines[0].error.code).to.equal(ERROR_CODES.EXTERNAL_API_UNAVAILABLE)
    expect(log.lines[0].error.retriable).to.equal(true)
  })

  it('survives a rejection carrying something that is not an Error', () => {
    const target = fakeProcess()
    const log = fakeLog()
    registerProcessErrorHandlers({ target, log })

    expect(() => target.emit('unhandledRejection', 'just a string')).to.not.throw()
    expect(log.lines[0].error).to.deep.equal({
      type: 'string',
      code: ERROR_CODES.INTERNAL,
      message: 'Non-error value rejected: string',
      retriable: false
    })
  })

  it('stays silent rather than throwing when logging itself fails', () => {
    const target = fakeProcess()
    const log = { error: () => { throw new Error('the log destination is gone') } }
    registerProcessErrorHandlers({ target, log })

    expect(() => target.emit('uncaughtException', new Error('boom'))).to.not.throw()
  })

  it('never ends the process', () => {
    const target = fakeProcess()
    let exited = false
    target.exit = () => { exited = true }
    registerProcessErrorHandlers({ target, log: fakeLog() })

    target.emit('uncaughtException', new Error('boom'))
    target.emit('unhandledRejection', new Error('boom'))

    expect(exited).to.equal(false)
  })
})

describe('registerProcessErrorHandlers defaults', () => {
  it('registers on the real process when nothing is injected', () => {
    const before = process.listenerCount('uncaughtException')

    registerProcessErrorHandlers({ log: fakeLog() })

    expect(process.listenerCount('uncaughtException')).to.equal(before + 1)
    // Leaving it attached would make mocha swallow real failures.
    process.removeListener('uncaughtException', process.listeners('uncaughtException').pop())
    process.removeListener('unhandledRejection', process.listeners('unhandledRejection').pop())
  })
})
