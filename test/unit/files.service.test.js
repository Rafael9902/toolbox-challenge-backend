import chai from 'chai'

import * as filesService from '../../src/modules/files/files.service.js'
import { createAppError, ERROR_CODES } from '../../src/shared/appError.js'

const { expect } = chai

const HEX = '70ad29aacf0b690b0467fe2b2767f765'
const HEADER = 'file,text,number,hex'

/**
 * Builds the raw CSV a download would return.
 *
 * @param {string[]} rows  Data rows, already formatted as CSV.
 * @returns {string}
 */
const csv = (rows) => [HEADER, ...rows].join('\n')

/**
 * @param {string} fileName
 * @returns {Error} The error the repository raises for a failed download.
 */
const downloadError = (fileName) => createAppError({
  code: ERROR_CODES.EXTERNAL_API_UNAVAILABLE,
  message: `Could not download file: ${fileName}`,
  status: 502,
  retriable: true
})

/**
 * Builds a repository double driven by a map of file name to contents. A value
 * that is an `Error` makes that single download reject.
 *
 * @param {Object<string, (string|Error)>} contents
 * @returns {{ listFiles: function(): Promise<string[]>,
 *            downloadFile: function(string): Promise<string> }}
 */
const fakeRepository = (contents) => ({
  listFiles: async () => Object.keys(contents),
  downloadFile: async (fileName) => {
    const content = contents[fileName]
    if (content instanceof Error) throw content
    return content
  }
})

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

describe('files service', () => {
  describe('getFilesData', () => {
    it('returns one entry per listed file, in listing order', async () => {
      const { data } = await filesService.getFilesData(fakeRepository({
        'file1.csv': csv([`file1.csv,RgTya,64075909,${HEX}`]),
        'file2.csv': csv([`file2.csv,AtjW,6,${HEX}`])
      }))

      expect(data.map(({ file }) => file)).to.deep.equal(['file1.csv', 'file2.csv'])
    })

    it('exposes only file and lines, never the discarded counter', async () => {
      const { data } = await filesService.getFilesData(fakeRepository({
        'file1.csv': csv([
          `file1.csv,RgTya,64075909,${HEX}`,
          'file1.csv,missing,columns'
        ])
      }))

      expect(data[0]).to.have.all.keys('file', 'lines')
      expect(data[0].lines).to.deep.equal([
        { text: 'RgTya', number: 64075909, hex: HEX }
      ])
    })

    it('omits a file whose download failed and still returns the others', async () => {
      const { data } = await filesService.getFilesData(fakeRepository({
        'file1.csv': csv([`file1.csv,RgTya,64075909,${HEX}`]),
        'file2.csv': downloadError('file2.csv'),
        'file3.csv': csv([`file3.csv,AtjW,6,${HEX}`])
      }))

      expect(data.map(({ file }) => file)).to.deep.equal(['file1.csv', 'file3.csv'])
    })

    it('returns an empty array when every download failed', async () => {
      const { data } = await filesService.getFilesData(fakeRepository({
        'file1.csv': downloadError('file1.csv'),
        'file2.csv': downloadError('file2.csv')
      }))

      expect(data).to.deep.equal([])
    })

    it('returns an empty array when the listing is empty', async () => {
      const { data } = await filesService.getFilesData(fakeRepository({}))

      expect(data).to.deep.equal([])
    })

    it('keeps a file with no valid rows, with an empty lines array', async () => {
      const { data } = await filesService.getFilesData(fakeRepository({
        'empty.csv': '',
        'header.csv': HEADER
      }))

      expect(data).to.deep.equal([
        { file: 'empty.csv', lines: [] },
        { file: 'header.csv', lines: [] }
      ])
    })

    it('propagates the error when the listing itself fails', async () => {
      const listingError = createAppError({
        code: ERROR_CODES.EXTERNAL_API_UNAVAILABLE,
        message: 'External API request failed: /files',
        status: 502,
        retriable: true
      })

      const error = await rejectionOf(() => filesService.getFilesData({
        listFiles: async () => { throw listingError },
        downloadFile: async () => ''
      }))

      expect(error).to.equal(listingError)
    })

    it('reports the domain counters of a partial failure in stats', async () => {
      const { stats } = await filesService.getFilesData(fakeRepository({
        'file1.csv': csv([
          `file1.csv,RgTya,64075909,${HEX}`,
          `file1.csv,AtjW,6,${HEX}`,
          'file1.csv,missing,columns'
        ]),
        'file2.csv': downloadError('file2.csv'),
        'file3.csv': csv([`file3.csv,notanumber,abc,${HEX}`])
      }))

      expect(stats).to.deep.equal({
        files_listed: 3,
        files_succeeded: 2,
        files_failed: 1,
        files_failed_names: ['file2.csv'],
        lines_valid: 2,
        lines_discarded: 2
      })
    })

    it('downloads the files in parallel instead of one after another', async () => {
      let inFlight = 0
      let peak = 0

      const { data } = await filesService.getFilesData({
        listFiles: async () => ['file1.csv', 'file2.csv', 'file3.csv'],
        downloadFile: async (fileName) => {
          inFlight += 1
          peak = Math.max(peak, inFlight)
          await new Promise((resolve) => setTimeout(resolve, 10))
          inFlight -= 1
          return csv([`${fileName},RgTya,1,${HEX}`])
        }
      })

      expect(data).to.have.lengthOf(3)
      expect(peak).to.equal(3)
    })
  })

  describe('getHealth', () => {
    it('reports the service as healthy', async () => {
      const { data } = await filesService.getHealth()

      expect(data).to.deep.equal({ status: 'ok' })
    })

    it('returns the { data, stats } shape every handler follows', async () => {
      const result = await filesService.getHealth()

      expect(result).to.have.all.keys('data', 'stats')
      expect(result.stats).to.be.an('object')
    })
  })
})
