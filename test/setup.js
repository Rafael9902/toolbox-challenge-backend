import nock from 'nock'

// Loopback is the one address that must stay reachable: supertest binds the app
// to an ephemeral port on it.
const LOOPBACK = '127.0.0.1'

/**
 * Root hooks applied to every suite, unit and integration alike.
 *
 * Each suite that talks to the external API already stubs it with `nock`, but
 * that is a convention a new test can forget. Blocking the network here turns
 * "the suite never hits the real API" into something the run enforces: any
 * request that escapes a stub fails loudly instead of leaving the machine.
 *
 * @type {{ beforeEach: function(): void, afterAll: function(): void }}
 */
export const mochaHooks = {
  beforeEach () {
    nock.disableNetConnect()
    nock.enableNetConnect(LOOPBACK)
  },

  afterAll () {
    nock.cleanAll()
    nock.enableNetConnect()
  }
}
