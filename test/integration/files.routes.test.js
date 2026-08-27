import chai from 'chai'
import request from 'supertest'
import { buildApp } from '../../src/app.js'

const { expect } = chai

/** Captures pino output instead of writing it to stdout. */
const createCapturingLog = () => {
  const lines = []
  return { lines, logDestination: { write: (line) => lines.push(JSON.parse(line)) } }
}

describe('API skeleton', () => {
  describe('GET /files/health', () => {
    it('responds 200 with JSON going through the layers', async () => {
      const { logDestination } = createCapturingLog()
      const app = buildApp({ logDestination })

      const res = await request(app)
        .get('/files/health')
        .set('accept', 'application/json')
        .expect(200)

      expect(res.headers['content-type']).to.match(/application\/json/)
      expect(res.body).to.deep.equal({ status: 'ok' })
    })

    it('writes exactly one log line carrying the mandatory fields', async () => {
      const { lines, logDestination } = createCapturingLog()
      const app = buildApp({ logDestination })

      await request(app).get('/files/health').expect(200)

      expect(lines).to.have.lengthOf(1)
      const [line] = lines
      expect(line.request_id).to.be.a('string').and.not.be.empty
      expect(line.method).to.equal('GET')
      expect(line.path).to.equal('/files/health')
      expect(line.status_code).to.equal(200)
      expect(line.duration_ms).to.be.a('number').and.be.at.least(0)
      expect(line.service).to.equal('toolbox-challenge-backend')
      expect(line.version).to.be.a('string')
    })

    it('honours the incoming x-request-id header', async () => {
      const { lines, logDestination } = createCapturingLog()
      const app = buildApp({ logDestination })

      await request(app).get('/files/health').set('x-request-id', 'abc-123').expect(200)

      expect(lines[0].request_id).to.equal('abc-123')
    })
  })

  describe('error handling', () => {
    it('returns 404 as JSON, not HTML, for an unknown route', async () => {
      const { logDestination } = createCapturingLog()
      const app = buildApp({ logDestination })

      const res = await request(app).get('/unknown').expect(404)

      expect(res.headers['content-type']).to.match(/application\/json/)
      expect(res.body.error.code).to.equal('ROUTE_NOT_FOUND')
      expect(res.text).to.not.include('<html')
    })

    it('writes a single line on the error path too, carrying the error', async () => {
      const { lines, logDestination } = createCapturingLog()
      const app = buildApp({ logDestination })

      await request(app).get('/unknown').expect(404)

      expect(lines).to.have.lengthOf(1)
      expect(lines[0].status_code).to.equal(404)
      expect(lines[0].error.code).to.equal('ROUTE_NOT_FOUND')
    })
  })

  describe('buildApp', () => {
    it('does not open any port', () => {
      expect(buildApp().listening).to.equal(undefined)
    })
  })
})
