import chai from 'chai'
import nock from 'nock'
import request from 'supertest'

import { buildApp } from '../../src/app.js'
import { config } from '../../src/shared/config.js'

const { expect } = chai

const { origin, pathname } = new URL(config.externalApi.baseUrl)
const LISTING_PATH = `${pathname}/files`

/** Captures pino output instead of writing it to stdout. */
const createCapturingLog = () => {
  const lines = []
  return { lines, logDestination: { write: (line) => lines.push(JSON.parse(line)) } }
}

/**
 * Stubs the external API listing with the body it really sends.
 *
 * @param {string[]} files
 * @returns {void}
 */
const stubListing = (files) => {
  nock(origin).get(LISTING_PATH).reply(200, JSON.stringify({ files }))
}

describe('GET /files/list', () => {
  afterEach(() => {
    nock.cleanAll()
  })

  it('responds 200 with the same envelope the external API exposes', async () => {
    stubListing(['file1.csv', 'file2.csv'])

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination }))
      .get('/files/list')
      .set('accept', 'application/json')
      .expect(200)

    expect(res.headers['content-type']).to.match(/application\/json; charset=utf-8/)
    expect(res.body).to.deep.equal({ files: ['file1.csv', 'file2.csv'] })
  })

  it('keeps the listing untouched: same order, same names, no extra field', async () => {
    stubListing(['test2.csv', 'test1.csv', 'test10.csv'])

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination })).get('/files/list').expect(200)

    expect(res.body).to.have.all.keys('files')
    expect(res.body.files).to.deep.equal(['test2.csv', 'test1.csv', 'test10.csv'])
  })

  it('answers with an empty listing when the external API lists no file', async () => {
    stubListing([])

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination })).get('/files/list').expect(200)

    expect(res.body).to.deep.equal({ files: [] })
  })

  // No download is stubbed on purpose: the root hooks block every non-loopback
  // request, so a download attempt would fail the request instead of passing.
  it('does not download any file', async () => {
    stubListing(['file1.csv', 'file2.csv'])

    const { lines, logDestination } = createCapturingLog()
    await request(buildApp({ logDestination })).get('/files/list').expect(200)

    expect(lines[0].error).to.equal(undefined)
    expect(nock.pendingMocks()).to.deep.equal([])
  })

  it('answers a JSON error when the external API fails', async () => {
    nock(origin).get(LISTING_PATH).reply(500, 'boom')

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination })).get('/files/list').expect(502)

    expect(res.headers['content-type']).to.match(/application\/json/)
    expect(res.text).to.not.include('<html')
    expect(res.body).to.have.all.keys('error')
    expect(res.body.error).to.have.all.keys('code', 'message')
    expect(res.body.error.code).to.equal('EXTERNAL_API_UNAVAILABLE')
    expect(res.body.error.message).to.be.a('string').and.not.be.empty
  })

  it('answers a JSON error when the external API returns an unexpected body', async () => {
    nock(origin).get(LISTING_PATH).reply(200, JSON.stringify({ archivos: [] }))

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination })).get('/files/list').expect(502)

    expect(res.body.error.code).to.equal('EXTERNAL_API_UNAVAILABLE')
  })

  describe('observability', () => {
    it('writes exactly one line carrying how many files were listed', async () => {
      stubListing(['file1.csv', 'file2.csv', 'file3.csv'])

      const { lines, logDestination } = createCapturingLog()
      await request(buildApp({ logDestination })).get('/files/list').expect(200)

      expect(lines).to.have.lengthOf(1)
      const [line] = lines
      expect(line.method).to.equal('GET')
      expect(line.path).to.equal('/files/list')
      expect(line.status_code).to.equal(200)
      expect(line.files_listed).to.equal(3)
      expect(line.duration_ms).to.be.a('number').and.be.at.least(0)
    })

    it('writes a single line carrying the error when the listing fails', async () => {
      nock(origin).get(LISTING_PATH).reply(500, 'boom')

      const { lines, logDestination } = createCapturingLog()
      await request(buildApp({ logDestination })).get('/files/list').expect(502)

      expect(lines).to.have.lengthOf(1)
      expect(lines[0].error.code).to.equal('EXTERNAL_API_UNAVAILABLE')
      expect(lines[0].files_listed).to.equal(undefined)
    })
  })
})
