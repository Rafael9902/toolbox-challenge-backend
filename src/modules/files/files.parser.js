const COLUMN_COUNT = 4
const HEX_PATTERN = /^[0-9a-f]{32}$/i

/**
 * A formatted CSV row.
 *
 * @typedef  {Object} ParsedLine
 * @property {string} text    Second column, non-empty.
 * @property {number} number  Third column, as a finite `Number`.
 * @property {string} hex     Fourth column, 32 hexadecimal characters.
 */

/**
 * The formatted contents of a single file.
 *
 * @typedef  {Object}       ParsedFile
 * @property {string}       file       Name of the processed file.
 * @property {ParsedLine[]} lines      Valid rows, in the order they appear.
 * @property {number}       discarded  Rows dropped for failing validation.
 */

/**
 * Splits raw CSV text into the rows that carry data.
 *
 * The header is always the first row, so it is dropped by position instead of
 * by matching its text: an unexpected header would otherwise be counted as a
 * discarded row and inflate the metric. Blank rows are not data either — they
 * are ignored and never counted, which is what keeps `\r\n` endings and a
 * trailing newline from producing spurious entries.
 *
 * @param {string} rawContent
 * @returns {string[]} Data rows, empty for an empty or header-only file.
 */
const dataRows = (rawContent) => {
  const [, ...rows] = (rawContent || '').split(/\r?\n/)

  return rows.filter((row) => row.trim() !== '')
}

/**
 * Formats a single CSV row.
 *
 * A row is valid when it has exactly four non-empty columns, a numeric third
 * column and a 32 hexadecimal character fourth column. The first column is
 * validated but not exposed: the file name comes from the caller.
 *
 * @param {string} row
 * @returns {?ParsedLine} The formatted row, or null when it is invalid.
 */
const parseRow = (row) => {
  const columns = row.split(',').map((column) => column.trim())

  if (columns.length !== COLUMN_COUNT) return null
  if (columns.some((column) => column === '')) return null

  const [, text, rawNumber, hex] = columns
  const number = Number(rawNumber)

  if (!Number.isFinite(number)) return null
  if (!HEX_PATTERN.test(hex)) return null

  return { text, number, hex }
}

/**
 * Formats the raw CSV contents of a file, discarding malformed rows.
 *
 * Pure function: it never performs I/O and never throws for invalid data. Bad
 * rows are counted in `discarded` so the caller can report them as
 * `lines_discarded` in the request log line.
 *
 * @param {string} fileName    Name of the processed file; it becomes `file` in
 *        the result, regardless of what the first CSV column says.
 * @param {string} rawContent  Raw CSV text, header included.
 * @returns {ParsedFile} `lines` is empty for an empty or header-only file.
 */
export const parseFileContent = (fileName, rawContent) => {
  const parsedRows = dataRows(rawContent).map(parseRow)
  const lines = parsedRows.filter((line) => line !== null)

  return {
    file: fileName,
    lines,
    discarded: parsedRows.length - lines.length
  }
}
