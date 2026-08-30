import { createAppError, ERROR_CODES } from '../../shared/appError.js'
import * as filesRepository from './files.repository.js'
import { parseFileContent } from './files.parser.js'

/**
 * Result returned by every service handler.
 *
 * @typedef  {Object} ServiceResult
 * @property {Object} data   Payload sent to the client.
 * @property {Object} stats  Fields the controller folds into the request log line.
 */

/**
 * One file as the client receives it.
 *
 * @typedef  {Object} FileData
 * @property {string}   file   Name of the processed file.
 * @property {Object[]} lines  Valid rows as `{ text, number, hex }`.
 */

/**
 * @param {number[]} values
 * @returns {number}
 */
const sum = (values) => values.reduce((total, value) => total + value, 0)

/**
 * Downloads every listed file in parallel, keeping failures isolated.
 *
 * `Promise.allSettled` is what makes a partial failure partial: one rejected
 * download never cancels the others, and the settled results keep the order of
 * `fileNames`, so each outcome can be paired back with its file.
 *
 * @param {string[]} fileNames
 * @param {function(string): Promise<string>} downloadFile
 * @returns {Promise<{ fileName: string, outcome: Object }[]>}
 */
const downloadAll = async (fileNames, downloadFile) => {
  const settled = await Promise.allSettled(
    fileNames.map((fileName) => downloadFile(fileName))
  )

  return fileNames.map((fileName, index) => ({ fileName, outcome: settled[index] }))
}

/**
 * Builds the error raised when the requested file is not among the listed ones.
 *
 * Reuses `EXTERNAL_API_FILE_NOT_FOUND` instead of adding a code: from the point
 * of view of the client the meaning is the same one the HTTP client already
 * gives it — the external API does not serve that file.
 *
 * @param {string} fileName
 * @returns {Error} AppError with `EXTERNAL_API_FILE_NOT_FOUND`.
 */
const unknownFile = (fileName) => createAppError({
  code: ERROR_CODES.EXTERNAL_API_FILE_NOT_FOUND,
  message: `File not found in the external API listing: ${fileName}`,
  status: 404
})

/**
 * Narrows the listing to the requested file.
 *
 * Filtering happens *before* downloading on purpose: the whole point of the
 * filter is to spend one download instead of N.
 *
 * @param {string[]} fileNames  Names served by the external API.
 * @param {?string}  fileName   Requested name, null when there is no filter.
 * @returns {string[]} The full listing, or the single requested name.
 * @throws {Error} AppError with `EXTERNAL_API_FILE_NOT_FOUND` when the
 *         requested name is not listed.
 */
const selectFiles = (fileNames, fileName) => {
  if (fileName === null || fileName === undefined) return fileNames
  if (!fileNames.includes(fileName)) throw unknownFile(fileName)

  return [fileName]
}

/**
 * Lists, downloads and formats every file served by the external API.
 *
 * Files whose download failed are left out of `data` and reported in `stats`
 * instead: the client still gets every file that could be processed, and an
 * empty array when none could. A failure of the listing itself is different —
 * there is nothing partial about it, so it propagates as an error.
 *
 * Files with no valid rows are kept with `lines: []` rather than omitted, so
 * the response says the file exists and carried nothing usable.
 *
 * With `fileName` the listing is still read — it is what says whether the name
 * exists — but only that file is downloaded. Everything else stays identical,
 * including how a failed download degrades: the answer is an empty array with
 * the failure reported in `stats`, exactly as it would be without the filter.
 *
 * @param {Object} [options]  Request input plus the seam tests use to drive
 *        partial failures with a fake; production callers pass only `fileName`.
 * @param {?string} [options.fileName]  Requested file, already validated by the
 *        controller. Absent or null means every listed file.
 * @param {function(): Promise<string[]>}     [options.listFiles]
 * @param {function(string): Promise<string>} [options.downloadFile]
 * @returns {Promise<ServiceResult>} `data` is a {@link FileData} array; a single
 *          element when the filter is active.
 * @throws {Error} AppError raised by the repository when the listing fails, or
 *         with `EXTERNAL_API_FILE_NOT_FOUND` when `fileName` is not listed.
 */
export const getFilesData = async ({
  fileName = null,
  listFiles = filesRepository.listFiles,
  downloadFile = filesRepository.downloadFile
} = {}) => {
  const fileNames = await listFiles()
  const downloads = await downloadAll(selectFiles(fileNames, fileName), downloadFile)

  const parsedFiles = downloads
    .filter(({ outcome }) => outcome.status === 'fulfilled')
    .map(({ fileName, outcome }) => parseFileContent(fileName, outcome.value))

  const failedNames = downloads
    .filter(({ outcome }) => outcome.status === 'rejected')
    .map(({ fileName }) => fileName)

  return {
    data: parsedFiles.map(({ file, lines }) => ({ file, lines })),
    stats: {
      files_listed: fileNames.length,
      files_succeeded: parsedFiles.length,
      files_failed: failedNames.length,
      files_failed_names: failedNames,
      lines_valid: sum(parsedFiles.map(({ lines }) => lines.length)),
      lines_discarded: sum(parsedFiles.map(({ discarded }) => discarded))
    }
  }
}

/**
 * Lists the files served by the external API.
 *
 * Nothing is downloaded or formatted here: the listing is the whole answer, so
 * a failure of the external API has nothing partial about it and propagates as
 * an error.
 *
 * @param {Object} [dependencies]  Seam for tests, mirroring `getFilesData`;
 *        production callers pass nothing.
 * @param {function(): Promise<string[]>} [dependencies.listFiles]
 * @returns {Promise<ServiceResult>} `data` is the array of file names; the
 *          controller puts it back inside the `{ files: [...] }` envelope.
 * @throws {Error} AppError raised by the repository when the listing fails.
 */
export const getFilesList = async ({
  listFiles = filesRepository.listFiles
} = {}) => {
  const fileNames = await listFiles()

  return {
    data: fileNames,
    stats: { files_listed: fileNames.length }
  }
}

/**
 * @returns {Promise<ServiceResult>}
 */
export const getHealth = async () => ({
  data: { status: 'ok' },
  stats: {}
})
