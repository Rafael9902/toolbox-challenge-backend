import { buildApp } from './app.js'
import { config } from './shared/config.js'
import { logger } from './shared/logger.js'
import { registerProcessErrorHandlers } from './shared/processErrors.js'

buildApp().listen(config.port, () => {
  // Registered here, not before listen(): a port that cannot be bound must still
  // end the process instead of leaving a server up that serves nothing.
  registerProcessErrorHandlers()
  logger.info({ event: 'server_started', port: config.port })
})
