/**
 * Result returned by every service handler.
 *
 * @typedef  {Object} ServiceResult
 * @property {Object} data   Payload sent to the client.
 * @property {Object} stats  Fields the controller folds into the request log line.
 */

/**
 * @returns {Promise<ServiceResult>}
 */
export const getHealth = async () => ({
  data: { status: 'ok' },
  stats: {}
})
