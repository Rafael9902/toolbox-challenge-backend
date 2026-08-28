import { spawn } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import axios from 'axios'
import chai from 'chai'

import { config } from '../../src/shared/config.js'

const { expect } = chai

const currentDir = dirname(fileURLToPath(import.meta.url))
const CLEAN_BOOT_SCRIPT = join(currentDir, '../fixtures/clean-environment-boot.js')

/**
 * Runs a script on the NodeJS binary running the suite, with no environment
 * variable defined, and waits for it to end.
 *
 * @param {string} script  Absolute path.
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
const runWithoutEnvironment = (script) => new Promise((resolve) => {
  // `execPath` is absolute, so the child needs no PATH to find its own runtime.
  const child = spawn(process.execPath, [script], { env: {} })
  let stdout = ''
  let stderr = ''

  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('close', (code) => resolve({ code, stdout, stderr }))
})

describe('test environment', () => {
  describe('no real network', () => {
    it('refuses a request to the external API that no stub intercepts', async () => {
      try {
        await axios.get(`${config.externalApi.baseUrl}/files`, { timeout: 2000 })
      } catch (error) {
        expect(error.message).to.match(/Disallowed net connect/i)
        return
      }

      throw new Error('The suite reached the real external API')
    })
  })

  describe('no environment variables', () => {
    let result

    // Spawning a second NodeJS process costs more than the default timeout allows.
    before(async function () {
      this.timeout(20000)
      result = await runWithoutEnvironment(CLEAN_BOOT_SCRIPT)
    })

    it('boots and serves a request with no environment variable defined', () => {
      expect(result.stderr).to.equal('')
      expect(result.code).to.equal(0)

      const report = JSON.parse(result.stdout)
      // macOS injects __CF_USER_TEXT_ENCODING into every process it spawns.
      // Nothing the app could read survives the scrub.
      expect(report.envKeys.filter((key) => !key.startsWith('__'))).to.deep.equal([])
      expect(report.status).to.equal(200)
      expect(report.body.status).to.equal('ok')
    })

    it('falls back to the built-in settings instead of reading the environment', () => {
      const report = JSON.parse(result.stdout)

      expect(report.port).to.equal(3000)
      expect(report.externalApiBaseUrl).to.equal(config.externalApi.baseUrl)
    })

    it('still writes its single log line per request', () => {
      expect(JSON.parse(result.stdout).logLines).to.equal(1)
    })
  })
})
