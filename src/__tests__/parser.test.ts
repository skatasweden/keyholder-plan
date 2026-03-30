import { describe, it, expect } from 'vitest'
import { parseSIE4 } from '../sie4-parser.js'
import { createTestSIE4Buffer } from './test-fixture.js'

describe('parseSIE4', () => {
  const parsed = parseSIE4(createTestSIE4Buffer())

  describe('#KTYP account types', () => {
    it('should set account_type for accounts with #KTYP', () => {
      const acc1510 = parsed.accounts.find(a => a.account_number === 1510)
      expect(acc1510?.account_type).toBe('T')

      const acc3001 = parsed.accounts.find(a => a.account_number === 3001)
      expect(acc3001?.account_type).toBe('I')

      const acc5420 = parsed.accounts.find(a => a.account_number === 5420)
      expect(acc5420?.account_type).toBe('K')

      const acc2640 = parsed.accounts.find(a => a.account_number === 2640)
      expect(acc2640?.account_type).toBe('S')
    })
  })
})
