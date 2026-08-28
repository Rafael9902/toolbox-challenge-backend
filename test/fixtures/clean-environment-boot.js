// Spawned with an empty environment by test/integration/testEnvironment.test.js:
// booting the API in a child process is the only way to observe that it needs no
// environment variable at all. Reports what it saw on stdout as a single JSON
// object, so the parent can assert on it.
import request from 'supertest'

import { buildApp } from '../../src/app.js'
import { config } from '../../src/shared/config.js'

const logLines = []
const app = buildApp({ logDestination: { write: (line) => logLines.push(JSON.parse(line)) } })

request(app)
  .get('/files/health')
  .then((res) => {
    process.stdout.write(JSON.stringify({
      envKeys: Object.keys(process.env),
      port: config.port,
      externalApiBaseUrl: config.externalApi.baseUrl,
      status: res.status,
      body: res.body,
      logLines: logLines.length
    }))
  })
  .catch((error) => {
    process.stderr.write(error && error.stack ? error.stack : String(error))
    process.exit(1)
  })
