import chai from 'chai'
import nock from 'nock'
import request from 'supertest'

import { buildApp } from '../../src/app.js'
import { config } from '../../src/shared/config.js'

const { expect } = chai

const { origin, pathname } = new URL(config.externalApi.baseUrl)
const LISTING_PATH = `${pathname}/files`

const HEX = '70ad29aacf0b690b0467fe2b2767f765'
const HEADER = 'file,text,number,hex'

/** Captures pino output instead of writing it to stdout. */
const createCapturingLog = () => {
  const lines = []
  return { lines, logDestination: { write: (line) => lines.push(JSON.parse(line)) } }
}

/**
 * @param {string[]} rows  Data rows, already formatted as CSV.
 * @returns {string}
 */
const csv = (rows) => [HEADER, ...rows].join('\n')

/**
 * Stubs the external API listing.
 *
 * @param {string[]} files
 * @returns {void}
 */
const stubListing = (files) => {
  nock(origin).get(LISTING_PATH).reply(200, JSON.stringify({ files }))
}

/**
 * Stubs a single file download.
 *
 * @param {string} fileName
 * @param {number} status
 * @param {string} body
 * @returns {void}
 */
const stubDownload = (fileName, status, body) => {
  nock(origin).get(`${pathname}/file/${fileName}`).reply(status, body)
}

/**
 * Stubs the listing plus a download for every one of its files.
 *
 * Leaving all three interceptors armed is what makes {@link pendingDownloads}
 * meaningful: whatever is still pending afterwards was never downloaded.
 *
 * @returns {void}
 */
const stubThreeFiles = () => {
  stubListing(['file1.csv', 'file2.csv', 'file3.csv'])
  stubDownload('file1.csv', 200, csv([`file1.csv,RgTya,64075909,${HEX}`]))
  stubDownload('file2.csv', 200, csv([`file2.csv,AtjW,6,${HEX}`]))
  stubDownload('file3.csv', 200, csv([`file3.csv,Ipfw,7,${HEX}`]))
}

/**
 * @returns {string[]} Names of the files whose download interceptor was never
 *          consumed, in other words the files that were not downloaded.
 */
const pendingDownloads = () => nock.pendingMocks()
  .map((mock) => mock.split(`${pathname}/file/`)[1])
  .filter((fileName) => fileName !== undefined)

describe('GET /files/data?fileName=', () => {
  before(() => {
    nock.disableNetConnect()
    // supertest binds an ephemeral port on loopback.
    nock.enableNetConnect('127.0.0.1')
  })

  after(() => {
    nock.enableNetConnect()
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('responds 200 with a single-element array for an existing file', async () => {
    stubThreeFiles()

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination }))
      .get('/files/data?fileName=file2.csv')
      .expect(200)

    expect(res.headers['content-type']).to.match(/application\/json; charset=utf-8/)
    expect(res.body).to.deep.equal([
      {
        file: 'file2.csv',
        lines: [{ text: 'AtjW', number: 6, hex: HEX }]
      }
    ])
  })

  it('downloads only the requested file, not the whole listing', async () => {
    stubThreeFiles()

    const { logDestination } = createCapturingLog()
    await request(buildApp({ logDestination })).get('/files/data?fileName=file2.csv').expect(200)

    expect(pendingDownloads()).to.have.members(['file1.csv', 'file3.csv'])
  })

  it('keeps the unfiltered behaviour when the query param is absent', async () => {
    stubThreeFiles()

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination })).get('/files/data').expect(200)

    expect(res.body.map(({ file }) => file))
      .to.deep.equal(['file1.csv', 'file2.csv', 'file3.csv'])
    expect(pendingDownloads()).to.deep.equal([])
  })

  it('responds 400 with a JSON error when fileName is present but empty', async () => {
    stubThreeFiles()

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination })).get('/files/data?fileName=').expect(400)

    expect(res.headers['content-type']).to.match(/application\/json/)
    expect(res.body).to.have.all.keys('error')
    expect(res.body.error).to.have.all.keys('code', 'message')
    expect(res.body.error.code).to.equal('INVALID_QUERY_PARAM')
    expect(res.body.error.message).to.be.a('string').and.not.be.empty
  })

  it('responds 400 when fileName carries only whitespace', async () => {
    stubThreeFiles()

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination }))
      .get('/files/data?fileName=%20%20')
      .expect(400)

    expect(res.body.error.code).to.equal('INVALID_QUERY_PARAM')
  })

  it('responds 400 when fileName is repeated and names no single file', async () => {
    stubThreeFiles()

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination }))
      .get('/files/data?fileName=file1.csv&fileName=file2.csv')
      .expect(400)

    expect(res.body.error.code).to.equal('INVALID_QUERY_PARAM')
  })

  it('reaches the external API for none of it when the param is invalid', async () => {
    stubThreeFiles()

    const { logDestination } = createCapturingLog()
    await request(buildApp({ logDestination })).get('/files/data?fileName=').expect(400)

    expect(nock.pendingMocks()).to.have.lengthOf(4)
  })

  it('responds 404 with a JSON error when the file is not listed', async () => {
    stubThreeFiles()

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination }))
      .get('/files/data?fileName=nope.csv')
      .expect(404)

    expect(res.headers['content-type']).to.match(/application\/json/)
    expect(res.text).to.not.include('<html')
    expect(res.body).to.have.all.keys('error')
    expect(res.body.error).to.have.all.keys('code', 'message')
    expect(res.body.error.code).to.equal('EXTERNAL_API_FILE_NOT_FOUND')
    expect(res.body.error.message).to.include('nope.csv')
    expect(pendingDownloads()).to.have.members(['file1.csv', 'file2.csv', 'file3.csv'])
  })

  it('answers 200 with an empty array when the requested download fails', async () => {
    stubListing(['file1.csv', 'file2.csv'])
    stubDownload('file2.csv', 500, 'boom')

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination }))
      .get('/files/data?fileName=file2.csv')
      .expect(200)

    expect(res.body).to.deep.equal([])
  })

  it('percent-encodes the requested name when it reaches the external API', async () => {
    stubListing(['weird name.csv'])
    stubDownload('weird%20name.csv', 200, csv([`weird name.csv,RgTya,1,${HEX}`]))

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination }))
      .get('/files/data?fileName=weird%20name.csv')
      .expect(200)

    expect(res.body.map(({ file }) => file)).to.deep.equal(['weird name.csv'])
  })

  describe('observability', () => {
    it('records the requested name on the single line of the request', async () => {
      stubThreeFiles()

      const { lines, logDestination } = createCapturingLog()
      await request(buildApp({ logDestination })).get('/files/data?fileName=file2.csv').expect(200)

      expect(lines).to.have.lengthOf(1)
      const [line] = lines
      expect(line.filter_file_name).to.equal('file2.csv')
      expect(line.status_code).to.equal(200)
      expect(line.files_listed).to.equal(3)
      expect(line.files_succeeded).to.equal(1)
      expect(line.lines_valid).to.equal(1)
    })

    it('leaves the field out when there is no filter', async () => {
      stubThreeFiles()

      const { lines, logDestination } = createCapturingLog()
      await request(buildApp({ logDestination })).get('/files/data').expect(200)

      expect(lines).to.have.lengthOf(1)
      expect(lines[0].filter_file_name).to.equal(undefined)
    })

    it('records the requested name next to the error when the file is not listed', async () => {
      stubThreeFiles()

      const { lines, logDestination } = createCapturingLog()
      await request(buildApp({ logDestination })).get('/files/data?fileName=nope.csv').expect(404)

      expect(lines).to.have.lengthOf(1)
      expect(lines[0].filter_file_name).to.equal('nope.csv')
      expect(lines[0].error.code).to.equal('EXTERNAL_API_FILE_NOT_FOUND')
      expect(lines[0].error.retriable).to.equal(false)
    })

    it('writes a single line carrying the error when the param is invalid', async () => {
      const { lines, logDestination } = createCapturingLog()
      await request(buildApp({ logDestination })).get('/files/data?fileName=').expect(400)

      expect(lines).to.have.lengthOf(1)
      expect(lines[0].error.code).to.equal('INVALID_QUERY_PARAM')
      expect(lines[0].files_listed).to.equal(undefined)
    })
  })
})
