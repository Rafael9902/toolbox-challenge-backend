import chai from 'chai'
import nock from 'nock'

import * as filesRepository from '../../src/modules/files/files.repository.js'
import { config } from '../../src/shared/config.js'

const { expect } = chai

const { origin, pathname } = new URL(config.externalApi.baseUrl)
const LISTING_PATH = `${pathname}/files`

/**
 * Runs `call` and returns the error it rejects with.
 *
 * @param {function(): Promise<*>} call
 * @returns {Promise<Error>}
 */
const rejectionOf = async (call) => {
  try {
    await call()
  } catch (error) {
    return error
  }
  throw new Error('Expected the call to reject, but it resolved')
}

describe('files repository', () => {
  before(() => {
    nock.disableNetConnect()
    // supertest binds an ephemeral port on loopback in the other suites.
    nock.enableNetConnect('127.0.0.1')
  })

  after(() => {
    nock.enableNetConnect()
  })

  afterEach(() => {
    nock.cleanAll()
  })

  describe('listFiles', () => {
    it('authenticates against the external API with the configured token', async () => {
      const scope = nock(origin)
        .matchHeader('authorization', `Bearer ${config.externalApi.token}`)
        .get(LISTING_PATH)
        .reply(200, JSON.stringify({ files: ['file1.csv'] }))

      await filesRepository.listFiles()

      expect(scope.isDone()).to.equal(true)
    })

    it('returns the file names of a successful listing', async () => {
      nock(origin)
        .get(LISTING_PATH)
        .reply(200, JSON.stringify({ files: ['file1.csv', 'file2.csv'] }))

      const files = await filesRepository.listFiles()

      expect(files).to.deep.equal(['file1.csv', 'file2.csv'])
    })

    it('returns an empty array when the listing is empty', async () => {
      nock(origin).get(LISTING_PATH).reply(200, JSON.stringify({ files: [] }))

      const files = await filesRepository.listFiles()

      expect(files).to.deep.equal([])
    })

    it('fails with a typed error when the external API answers 5xx', async () => {
      nock(origin).get(LISTING_PATH).reply(500, 'boom')

      const error = await rejectionOf(() => filesRepository.listFiles())

      expect(error.name).to.equal('AppError')
      expect(error.code).to.equal('EXTERNAL_API_UNAVAILABLE')
      expect(error.status).to.equal(502)
      expect(error.retriable).to.equal(true)
      expect(error.message).to.be.a('string').and.not.be.empty
    })

    it('fails with a typed error when the external API rejects the token', async () => {
      nock(origin).get(LISTING_PATH).reply(401, 'unauthorized')

      const error = await rejectionOf(() => filesRepository.listFiles())

      expect(error.name).to.equal('AppError')
      expect(error.code).to.equal('EXTERNAL_API_UNAVAILABLE')
      expect(error.status).to.equal(502)
    })

    it('fails with a typed error when the request never completes', async () => {
      nock(origin).get(LISTING_PATH).replyWithError({ code: 'ECONNABORTED' })

      const error = await rejectionOf(() => filesRepository.listFiles())

      expect(error.name).to.equal('AppError')
      expect(error.code).to.equal('EXTERNAL_API_UNAVAILABLE')
      expect(error.retriable).to.equal(true)
    })

    it('fails with a typed error when the body is not JSON', async () => {
      nock(origin).get(LISTING_PATH).reply(200, 'not json at all')

      const error = await rejectionOf(() => filesRepository.listFiles())

      expect(error.name).to.equal('AppError')
      expect(error.code).to.equal('EXTERNAL_API_UNAVAILABLE')
      expect(error.status).to.equal(502)
    })

    it('fails with a typed error when the body carries no files array', async () => {
      nock(origin).get(LISTING_PATH).reply(200, JSON.stringify({ other: true }))

      const error = await rejectionOf(() => filesRepository.listFiles())

      expect(error.name).to.equal('AppError')
      expect(error.code).to.equal('EXTERNAL_API_UNAVAILABLE')
    })
  })
})
