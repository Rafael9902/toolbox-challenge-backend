import chai from 'chai'
import nock from 'nock'

import * as filesRepository from '../../src/modules/files/files.repository.js'
import { config } from '../../src/shared/config.js'

const { expect } = chai

const { origin, pathname } = new URL(config.externalApi.baseUrl)
const LISTING_PATH = `${pathname}/files`
const DOWNLOAD_PATH = `${pathname}/file`

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
      expect(error.message).to.be.a('string').and.not.equal('')
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

  describe('downloadFile', () => {
    it('authenticates against the external API with the configured token', async () => {
      const scope = nock(origin)
        .matchHeader('authorization', `Bearer ${config.externalApi.token}`)
        .get(`${DOWNLOAD_PATH}/file1.csv`)
        .reply(200, 'file,text,number,hex')

      await filesRepository.downloadFile('file1.csv')

      expect(scope.isDone()).to.equal(true)
    })

    it('returns the contents as raw text, without parsing them', async () => {
      const contents = 'file,text,number,hex\nfile1.csv,RgTya,64075909,70ad29aaf7b55b5b6ca8\n'
      nock(origin).get(`${DOWNLOAD_PATH}/file1.csv`).reply(200, contents)

      const downloaded = await filesRepository.downloadFile('file1.csv')

      expect(downloaded).to.be.a('string')
      expect(downloaded).to.equal(contents)
    })

    it('returns an empty string for an empty file, without failing', async () => {
      nock(origin).get(`${DOWNLOAD_PATH}/empty.csv`).reply(200, '')

      const downloaded = await filesRepository.downloadFile('empty.csv')

      expect(downloaded).to.equal('')
    })

    it('percent-encodes the file name when building the URL', async () => {
      const fileName = 'a b&c/d#e.csv'
      const scope = nock(origin)
        .get(`${DOWNLOAD_PATH}/${encodeURIComponent(fileName)}`)
        .reply(200, 'contents')

      const downloaded = await filesRepository.downloadFile(fileName)

      expect(scope.isDone()).to.equal(true)
      expect(downloaded).to.equal('contents')
    })

    it('fails with a typed error naming the file when it does not exist', async () => {
      nock(origin).get(`${DOWNLOAD_PATH}/missing.csv`).reply(404, 'not found')

      const error = await rejectionOf(() => filesRepository.downloadFile('missing.csv'))

      expect(error.name).to.equal('AppError')
      expect(error.code).to.equal('EXTERNAL_API_FILE_NOT_FOUND')
      expect(error.status).to.equal(404)
      expect(error.retriable).to.equal(false)
      expect(error.message).to.include('missing.csv')
    })

    it('fails with a typed error naming the file when the external API answers 5xx', async () => {
      nock(origin).get(`${DOWNLOAD_PATH}/file1.csv`).reply(500, 'boom')

      const error = await rejectionOf(() => filesRepository.downloadFile('file1.csv'))

      expect(error.name).to.equal('AppError')
      expect(error.code).to.equal('EXTERNAL_API_UNAVAILABLE')
      expect(error.status).to.equal(502)
      expect(error.retriable).to.equal(true)
      expect(error.message).to.include('file1.csv')
    })

    it('fails with a typed error when the request never completes', async () => {
      nock(origin)
        .get(`${DOWNLOAD_PATH}/file1.csv`)
        .replyWithError({ code: 'ECONNABORTED' })

      const error = await rejectionOf(() => filesRepository.downloadFile('file1.csv'))

      expect(error.name).to.equal('AppError')
      expect(error.code).to.equal('EXTERNAL_API_UNAVAILABLE')
      expect(error.status).to.equal(502)
      expect(error.retriable).to.equal(true)
    })

    it('fails a single download without affecting the others', async () => {
      nock(origin).get(`${DOWNLOAD_PATH}/broken.csv`).reply(500, 'boom')
      nock(origin).get(`${DOWNLOAD_PATH}/file1.csv`).reply(200, 'contents')

      const results = await Promise.allSettled([
        filesRepository.downloadFile('broken.csv'),
        filesRepository.downloadFile('file1.csv')
      ])

      expect(results[0].status).to.equal('rejected')
      expect(results[0].reason.code).to.equal('EXTERNAL_API_UNAVAILABLE')
      expect(results[1].status).to.equal('fulfilled')
      expect(results[1].value).to.equal('contents')
    })
  })
})
