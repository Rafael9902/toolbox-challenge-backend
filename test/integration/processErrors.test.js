import { spawn } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import chai from 'chai'

const { expect } = chai

const currentDir = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(currentDir, '../fixtures/detached-errors.js')

/**
 * Runs a script on the NodeJS binary running the suite and waits for it to end.
 *
 * @param {string} script  Absolute path.
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
const run = (script) => new Promise((resolve) => {
  const child = spawn(process.execPath, [script])
  let stdout = ''
  let stderr = ''

  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('close', (code) => resolve({ code, stdout, stderr }))
})

/**
 * @param {string} stdout
 * @returns {Object[]} The lines pino wrote, parsed.
 */
const logLines = (stdout) => stdout
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line))

describe('process-level error handling', function () {
  // Spawning a second NodeJS process costs more than the default timeout allows.
  this.timeout(20000)

  let result

  before(async () => {
    result = await run(SCRIPT)
  })

  it('keeps the process alive through an unhandled rejection and an uncaught exception', () => {
    expect(result.code).to.equal(0)
  })

  it('goes on running after both errors', () => {
    const events = logLines(result.stdout).map(({ event }) => event)

    expect(events).to.include('still_running')
    expect(events.indexOf('still_running')).to.be.greaterThan(events.indexOf('uncaught_exception'))
  })

  it('reports each escaped error through the logger', () => {
    const byEvent = new Map(logLines(result.stdout).map((line) => [line.event, line]))

    expect(byEvent.get('unhandled_rejection').error.message).to.equal('detached rejection')
    expect(byEvent.get('uncaught_exception').error.message).to.equal('detached exception')
  })

  it('writes them as the service log lines, not as raw NodeJS warnings', () => {
    const rejection = logLines(result.stdout).find(({ event }) => event === 'unhandled_rejection')

    expect(rejection.service).to.equal('toolbox-challenge-backend')
    expect(rejection.level).to.equal(50)
    expect(result.stderr).to.not.include('UnhandledPromiseRejectionWarning')
  })
})
