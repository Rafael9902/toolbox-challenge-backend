import { buildApp } from './app.js'
import { config } from './shared/config.js'
import { logger } from './shared/logger.js'

buildApp().listen(config.port, () => {
  logger.info({ event: 'server_started', port: config.port })
})
