import chai from 'chai'
import * as filesService from '../../src/modules/files/files.service.js'

const { expect } = chai

describe('files service', () => {
  it('reports the service as healthy', async () => {
    const { data } = await filesService.getHealth()

    expect(data).to.deep.equal({ status: 'ok' })
  })

  it('returns the { data, stats } shape every handler follows', async () => {
    const result = await filesService.getHealth()

    expect(result).to.have.all.keys('data', 'stats')
    expect(result.stats).to.be.an('object')
  })
})
