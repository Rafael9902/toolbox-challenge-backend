import chai from 'chai'
import nock from 'nock'

import { createHttpClient } from '../../src/shared/http/httpClient.js'

const { expect } = chai

const ORIGIN = 'https://external.test'

describe('external API http client', () => {
  afterEach(() => {
    nock.cleanAll()
  })

  it('gives up with a typed error when the external API exceeds the timeout', async () => {
    nock(ORIGIN).get('/files').delayConnection(200).reply(200, 'too late')

    const client = createHttpClient({ baseUrl: ORIGIN, token: 'a-token', timeoutMs: 20 })

    try {
      await client.get('/files')
    } catch (error) {
      expect(error.name).to.equal('AppError')
      expect(error.code).to.equal('EXTERNAL_API_UNAVAILABLE')
      expect(error.retriable).to.equal(true)
      return
    }

    throw new Error('Expected the request to time out')
  })

  it('maps a missing resource to its own error code', async () => {
    nock(ORIGIN).get('/file/missing.csv').reply(404, 'not found')

    const client = createHttpClient({ baseUrl: ORIGIN, token: 'a-token', timeoutMs: 1000 })

    try {
      await client.get('/file/missing.csv')
    } catch (error) {
      expect(error.code).to.equal('EXTERNAL_API_FILE_NOT_FOUND')
      expect(error.status).to.equal(404)
      expect(error.retriable).to.equal(false)
      return
    }

    throw new Error('Expected the request to reject')
  })
})
