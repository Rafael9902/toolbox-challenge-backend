import chai from 'chai'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { parseFileContent } from '../../src/modules/files/files.parser.js'

const { expect } = chai

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = (name) => readFileSync(join(__dirname, '../fixtures', name), 'utf8')

const HEX = 'f9e1bcdb9e3784acc448af34f4727252'
const csv = (...rows) => ['file,text,number,hex', ...rows].join('\n')

describe('files parser', () => {
  describe('valid content', () => {
    it('maps every data row to { text, number, hex } and drops the header', () => {
      const { lines, discarded } = parseFileContent('file1.csv', fixture('valid.csv'))

      expect(lines).to.deep.equal([
        { text: 'RgTya', number: 64075909, hex: '70ad29aacf0b690b0467fe2b2767f765' },
        { text: 'AtjW', number: 6, hex: 'd33a8ca5d36d3106219f66f939774cf5' }
      ])
      expect(discarded).to.equal(0)
    })

    it('exposes number as a Number and text and hex as Strings', () => {
      const { lines } = parseFileContent('file1.csv', csv(`file1.csv,RgTya,64075909,${HEX}`))

      expect(lines[0].number).to.be.a('number')
      expect(lines[0].text).to.be.a('string')
      expect(lines[0].hex).to.be.a('string')
    })

    it('takes file from the parameter, not from the first CSV column', () => {
      const { file } = parseFileContent('file9.csv', csv(`other.csv,RgTya,1,${HEX}`))

      expect(file).to.equal('file9.csv')
    })

    it('accepts uppercase hexadecimal characters', () => {
      const { lines } = parseFileContent('file1.csv', csv('file1.csv,a,1,0A1B2C3D4E5F60718293A4B5C6D7E8F9'))

      expect(lines).to.have.lengthOf(1)
    })
  })

  describe('invalid rows', () => {
    const invalid = {
      'fewer than four columns': 'file1.csv,missing,columns',
      'more than four columns': `file1.csv,extra,7,${HEX},column`,
      'an empty file column': `,text,7,${HEX}`,
      'an empty text column': `file1.csv,,7,${HEX}`,
      'an empty number column': `file1.csv,text,,${HEX}`,
      'an empty hex column': 'file1.csv,text,7,',
      'a non numeric number': `file1.csv,text,abc,${HEX}`,
      'a hex shorter than 32 characters': 'file1.csv,text,7,abc123',
      'a hex longer than 32 characters': `file1.csv,text,7,${HEX}ff`,
      'a hex with non hexadecimal characters': 'file1.csv,text,7,zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'
    }

    Object.keys(invalid).forEach((reason) => {
      it(`discards a row with ${reason}`, () => {
        const { lines, discarded } = parseFileContent('file1.csv', csv(invalid[reason]))

        expect(lines).to.deep.equal([])
        expect(discarded).to.equal(1)
      })
    })

    it('keeps the valid rows of a file that also has malformed ones', () => {
      const { file, lines, discarded } = parseFileContent('file1.csv', fixture('malformed.csv'))

      expect(file).to.equal('file1.csv')
      expect(lines).to.deep.equal([
        { text: 'valid', number: 1, hex: 'f9e1bcdb9e3784acc448af34f4727252' },
        { text: 'uppercasehex', number: 42, hex: '0A1B2C3D4E5F60718293A4B5C6D7E8F9' }
      ])
      expect(discarded).to.equal(5)
    })

    it('does not throw for a file where every row is malformed', () => {
      const parse = () => parseFileContent('file1.csv', csv('broken', 'also,broken'))

      expect(parse).not.to.throw()
      expect(parse()).to.deep.equal({ file: 'file1.csv', lines: [], discarded: 2 })
    })
  })

  describe('files without data', () => {
    it('returns no lines for an empty file', () => {
      expect(parseFileContent('file1.csv', fixture('empty.csv')))
        .to.deep.equal({ file: 'file1.csv', lines: [], discarded: 0 })
    })

    it('returns no lines for a file that only has the header', () => {
      expect(parseFileContent('file1.csv', fixture('header-only.csv')))
        .to.deep.equal({ file: 'file1.csv', lines: [], discarded: 0 })
    })
  })

  describe('line endings', () => {
    it('parses \\r\\n endings without leaving carriage returns behind', () => {
      const { lines, discarded } = parseFileContent('file1.csv', fixture('crlf.csv'))

      expect(lines).to.deep.equal([
        { text: 'RgTya', number: 64075909, hex: '70ad29aacf0b690b0467fe2b2767f765' },
        { text: 'AtjW', number: 6, hex: 'd33a8ca5d36d3106219f66f939774cf5' }
      ])
      expect(discarded).to.equal(0)
    })

    it('ignores blank rows instead of counting them as discarded', () => {
      const { lines, discarded } = parseFileContent('file1.csv', csv(`file1.csv,a,1,${HEX}`, '', '   ', ''))

      expect(lines).to.have.lengthOf(1)
      expect(discarded).to.equal(0)
    })
  })
})
