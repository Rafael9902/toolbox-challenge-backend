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

describe('GET /files/data', () => {
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

  it('responds 200 with the bare array fixed by the statement', async () => {
    stubListing(['file1.csv'])
    stubDownload('file1.csv', 200, csv([`file1.csv,RgTya,64075909,${HEX}`]))

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination }))
      .get('/files/data')
      .set('accept', 'application/json')
      .expect(200)

    expect(res.headers['content-type']).to.match(/application\/json; charset=utf-8/)
    expect(res.body).to.deep.equal([
      {
        file: 'file1.csv',
        lines: [{ text: 'RgTya', number: 64075909, hex: HEX }]
      }
    ])
  })

  it('serialises number as a JSON number, not a string', async () => {
    stubListing(['file1.csv'])
    stubDownload('file1.csv', 200, csv([`file1.csv,RgTya,64075909,${HEX}`]))

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination })).get('/files/data').expect(200)

    expect(res.body[0].lines[0].number).to.be.a('number')
    expect(res.text).to.include('"number":64075909')
  })

  it('never exposes the discarded counter of the parser', async () => {
    stubListing(['file1.csv'])
    stubDownload('file1.csv', 200, csv([
      `file1.csv,RgTya,64075909,${HEX}`,
      'file1.csv,missing,columns'
    ]))

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination })).get('/files/data').expect(200)

    expect(res.body[0]).to.have.all.keys('file', 'lines')
    expect(res.text).to.not.include('discarded')
  })

  it('omits a file whose download failed and returns the rest', async () => {
    stubListing(['file1.csv', 'file2.csv', 'file3.csv'])
    stubDownload('file1.csv', 200, csv([`file1.csv,RgTya,64075909,${HEX}`]))
    stubDownload('file2.csv', 500, 'boom')
    stubDownload('file3.csv', 200, csv([`file3.csv,AtjW,6,${HEX}`]))

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination })).get('/files/data').expect(200)

    expect(res.body.map(({ file }) => file)).to.deep.equal(['file1.csv', 'file3.csv'])
  })

  it('answers 200 with an empty array when no file could be processed', async () => {
    stubListing(['file1.csv', 'file2.csv'])
    stubDownload('file1.csv', 500, 'boom')
    stubDownload('file2.csv', 404, 'not found')

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination })).get('/files/data').expect(200)

    expect(res.body).to.deep.equal([])
  })

  it('keeps an empty file with an empty lines array', async () => {
    stubListing(['empty.csv'])
    stubDownload('empty.csv', 200, '')

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination })).get('/files/data').expect(200)

    expect(res.body).to.deep.equal([{ file: 'empty.csv', lines: [] }])
  })

  it('answers a JSON error when the listing itself fails', async () => {
    nock(origin).get(LISTING_PATH).reply(500, 'boom')

    const { logDestination } = createCapturingLog()
    const res = await request(buildApp({ logDestination })).get('/files/data').expect(502)

    expect(res.headers['content-type']).to.match(/application\/json/)
    expect(res.body.error.code).to.equal('EXTERNAL_API_UNAVAILABLE')
  })

  describe('observability', () => {
    it('writes exactly one line carrying the domain counters', async () => {
      stubListing(['file1.csv', 'file2.csv'])
      stubDownload('file1.csv', 200, csv([
        `file1.csv,RgTya,64075909,${HEX}`,
        'file1.csv,notanumber,abc,' + HEX
      ]))
      stubDownload('file2.csv', 500, 'boom')

      const { lines, logDestination } = createCapturingLog()
      await request(buildApp({ logDestination })).get('/files/data').expect(200)

      expect(lines).to.have.lengthOf(1)
      const [line] = lines
      expect(line.status_code).to.equal(200)
      expect(line.files_listed).to.equal(2)
      expect(line.files_succeeded).to.equal(1)
      expect(line.files_failed).to.equal(1)
      expect(line.files_failed_names).to.deep.equal(['file2.csv'])
      expect(line.lines_valid).to.equal(1)
      expect(line.lines_discarded).to.equal(1)
    })

    it('writes a single line carrying the error when the listing fails', async () => {
      nock(origin).get(LISTING_PATH).reply(500, 'boom')

      const { lines, logDestination } = createCapturingLog()
      await request(buildApp({ logDestination })).get('/files/data').expect(502)

      expect(lines).to.have.lengthOf(1)
      expect(lines[0].error.code).to.equal('EXTERNAL_API_UNAVAILABLE')
      expect(lines[0].files_listed).to.equal(undefined)
    })
  })
})
