/**
 * Application settings. No environment variables are read.
 *
 * @type {Readonly<{
 *   port: number,
 *   service: { name: string, version: string },
 *   externalApi: { baseUrl: string, token: string, timeoutMs: number }
 * }>}
 */
export const config = Object.freeze({
  port: 3000,
  service: {
    name: 'toolbox-challenge-backend',
    version: '1.0.0'
  },
  externalApi: {
    baseUrl: 'https://echo-serv.tbxnet.com/v1/secret',
    token: 'aSuperSecretKey',
    timeoutMs: 10000
  }
})
