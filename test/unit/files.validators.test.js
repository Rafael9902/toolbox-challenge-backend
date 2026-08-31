import chai from 'chai'

import { readFileNameFilter } from '../../src/modules/files/files.validators.js'
import { ERROR_CODES } from '../../src/shared/appError.js'

const { expect } = chai

/** Captures the error a call throws, so each test can assert on its fields. */
const thrownBy = (value) => {
  try {
    readFileNameFilter(value)
    return null
  } catch (error) {
    return error
  }
}

describe('readFileNameFilter', () => {
  it('reads no filter when the param is absent', () => {
    expect(readFileNameFilter(undefined)).to.equal(null)
  })

  it('returns the file name when the param carries one', () => {
    expect(readFileNameFilter('test3.csv')).to.equal('test3.csv')
  })

  it('trims the surrounding spaces a URL can carry', () => {
    expect(readFileNameFilter('  test3.csv  ')).to.equal('test3.csv')
  })

  it('rejects a param that is present but empty', () => {
    const error = thrownBy('')

    expect(error.name).to.equal('AppError')
    expect(error.code).to.equal(ERROR_CODES.INVALID_QUERY_PARAM)
    expect(error.status).to.equal(400)
  })

  it('rejects a param that carries only spaces', () => {
    expect(thrownBy('   ').code).to.equal(ERROR_CODES.INVALID_QUERY_PARAM)
  })

  it('rejects a repeated param, which Express hands over as an array', () => {
    expect(thrownBy(['a.csv', 'b.csv']).code).to.equal(ERROR_CODES.INVALID_QUERY_PARAM)
  })

  it('rejects a structured param, which Express hands over as an object', () => {
    expect(thrownBy({ a: 'b' }).code).to.equal(ERROR_CODES.INVALID_QUERY_PARAM)
  })

  it('never tells the client which value it rejected', () => {
    expect(thrownBy('').message).to.not.include('undefined')
    expect(thrownBy(['a.csv']).message).to.equal(
      'Query param fileName must be a non-empty file name')
  })

  it('is pure: it neither reads nor writes anything but its argument', () => {
    const value = ['a.csv', 'b.csv']

    thrownBy(value)

    expect(value).to.deep.equal(['a.csv', 'b.csv'])
  })
})
