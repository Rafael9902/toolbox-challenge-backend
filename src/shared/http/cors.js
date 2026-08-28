/**
 * Allows the browser to read the responses of this API from another origin.
 *
 * The frontend is served from a different port, so without this header the
 * browser blocks every response. Only `Access-Control-Allow-Origin` is needed:
 * the API is read-only, takes no credentials and no custom request headers, so
 * its GETs are CORS "simple requests" and never trigger a preflight.
 *
 * @param {Object}   req
 * @param {Object}   res
 * @param {Function} next
 * @returns {void}
 */
export const cors = (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  next()
}
