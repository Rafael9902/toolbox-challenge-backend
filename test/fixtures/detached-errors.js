// Spawned as a child process by test/integration/processErrors.test.js: the only
// way to observe whether the real NodeJS process survives is to run one.
import { logger } from '../../src/shared/logger.js'
import { registerProcessErrorHandlers } from '../../src/shared/processErrors.js'

registerProcessErrorHandlers()

Promise.reject(new Error('detached rejection'))

setTimeout(() => { throw new Error('detached exception') }, 10)

setTimeout(() => { logger.info({ event: 'still_running' }) }, 150)
