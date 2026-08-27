/**
 * Public surface of the files module. Every other file in this folder is
 * private to the feature.
 *
 * ESM has no directory resolution, so consumers import this path in full.
 */
export { filesRouter } from './files.routes.js'
