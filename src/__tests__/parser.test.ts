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

  describe('metadata', () => {
    it('should parse company info', () => {
      expect(parsed.meta.company_name).toBe('Test AB')
      expect(parsed.meta.org_number).toBe('559988-7766')
      expect(parsed.meta.fortnox_number).toBe('999999')
      expect(parsed.meta.account_plan_type).toBe('BAS2024')
      expect(parsed.meta.balance_date).toBe('2025-12-31')
      expect(parsed.meta.sietyp).toBe(4)
      expect(parsed.meta.format).toBe('PC8')
      expect(parsed.meta.flagga).toBe(0)
    })

    it('should parse address fields', () => {
      expect(parsed.meta.address.contact).toBe('Anna Testsson')
      expect(parsed.meta.address.street).toBe('Testgatan 1')
      expect(parsed.meta.address.postal).toBe('123 45 Teststad')
      expect(parsed.meta.address.phone).toBe('070-1234567')
    })

    it('should have no parse errors', () => {
      expect(parsed.parse_errors).toHaveLength(0)
    })
  })

  describe('financial years', () => {
    it('should parse 2 financial years', () => {
      expect(parsed.financial_years).toHaveLength(2)
    })

    it('should parse current year (index 0)', () => {
      const fy0 = parsed.financial_years.find(fy => fy.year_index === 0)
      expect(fy0?.start_date).toBe('2025-01-01')
      expect(fy0?.end_date).toBe('2025-12-31')
    })

    it('should parse previous year (index -1)', () => {
      const fyPrev = parsed.financial_years.find(fy => fy.year_index === -1)
      expect(fyPrev?.start_date).toBe('2024-01-01')
      expect(fyPrev?.end_date).toBe('2024-12-31')
    })
  })

  describe('accounts', () => {
    it('should parse 5 accounts', () => {
      expect(parsed.accounts).toHaveLength(5)
    })

    it('should parse account names', () => {
      const acc1510 = parsed.accounts.find(a => a.account_number === 1510)
      expect(acc1510?.name).toBe('Kundfordringar')
    })
  })

  describe('dimensions and objects', () => {
    it('should parse 2 dimensions', () => {
      expect(parsed.dimensions).toHaveLength(2)
      expect(parsed.dimensions.map(d => d.dimension_number).sort()).toEqual([1, 6])
    })

    it('should parse 2 objects (both dim 6)', () => {
      expect(parsed.objects).toHaveLength(2)
      expect(parsed.objects[0].dimension_number).toBe(6)
      expect(parsed.objects[0].object_number).toBe('P100')
      expect(parsed.objects[0].name).toBe('Projekt Alpha')
    })
  })

  describe('SRU codes', () => {
    it('should parse 1 SRU code', () => {
      expect(parsed.sru_codes).toHaveLength(1)
      expect(parsed.sru_codes[0].account_number).toBe(1510)
      expect(parsed.sru_codes[0].sru_code).toBe('204')
    })
  })

  describe('opening balances', () => {
    it('should parse 3 opening balances', () => {
      expect(parsed.opening_balances).toHaveLength(3)
    })

    it('should have correct amounts', () => {
      const ib1510 = parsed.opening_balances.find(
        ib => ib.year_index === 0 && ib.account_number === 1510
      )
      expect(ib1510?.amount).toBe(50000)

      const ib1930 = parsed.opening_balances.find(
        ib => ib.year_index === 0 && ib.account_number === 1930
      )
      expect(ib1930?.amount).toBe(100000)

      const ibPrev = parsed.opening_balances.find(
        ib => ib.year_index === -1 && ib.account_number === 1510
      )
      expect(ibPrev?.amount).toBe(40000)
    })
  })

  describe('closing balances', () => {
    it('should parse 3 closing balances', () => {
      expect(parsed.closing_balances).toHaveLength(3)
    })

    it('should have correct amounts', () => {
      const ub1510 = parsed.closing_balances.find(
        ub => ub.year_index === 0 && ub.account_number === 1510
      )
      expect(ub1510?.amount).toBe(60000)

      const ub1930 = parsed.closing_balances.find(
        ub => ub.year_index === 0 && ub.account_number === 1930
      )
      expect(ub1930?.amount).toBe(120000)
    })
  })

  describe('period results (#RES)', () => {
    it('should parse 2 period results', () => {
      expect(parsed.period_results).toHaveLength(2)
    })

    it('should have correct amounts', () => {
      const res3001 = parsed.period_results.find(r => r.account_number === 3001)
      expect(res3001?.amount).toBe(-78500)

      const res5420 = parsed.period_results.find(r => r.account_number === 5420)
      expect(res5420?.amount).toBe(25000)
    })
  })

  describe('period balances (#PSALDO)', () => {
    it('should parse 2 period balances', () => {
      expect(parsed.period_balances).toHaveLength(2)
    })

    it('should have correct period and amount', () => {
      const ps1 = parsed.period_balances.find(p => p.period === 202501)
      expect(ps1?.account_number).toBe(1510)
      expect(ps1?.amount).toBe(55000)

      const ps2 = parsed.period_balances.find(p => p.period === 202502)
      expect(ps2?.amount).toBe(58000)
    })
  })

  describe('vouchers', () => {
    it('should parse 4 vouchers', () => {
      expect(parsed.vouchers).toHaveLength(4)
    })

    it('should parse voucher A-1 (simple balanced)', () => {
      const v = parsed.vouchers.find(v => v.series === 'A' && v.voucher_number === 1)!
      expect(v.date).toBe('2025-01-15')
      expect(v.description).toBe('Kundbetalning')
      expect(v.registration_date).toBe('2025-01-20')
      expect(v.rows).toHaveLength(2)
      expect(v.rows[0].account_number).toBe(1930)
      expect(v.rows[0].amount).toBe(10000)
      expect(v.rows[1].amount).toBe(-10000)
    })

    it('should parse voucher A-2 (with dimension)', () => {
      const v = parsed.vouchers.find(v => v.series === 'A' && v.voucher_number === 2)!
      expect(v.rows).toHaveLength(3)
      const dimRow = v.rows.find(r => r.dim_number === 6)
      expect(dimRow?.object_number).toBe('P100')
      expect(dimRow?.amount).toBe(5000)
      expect(dimRow?.description).toBe('Adobe licens')
    })

    it('should parse voucher B-1 (BTRANS and RTRANS)', () => {
      const v = parsed.vouchers.find(v => v.series === 'B' && v.voucher_number === 1)!
      expect(v.rows).toHaveLength(4)

      const btrans = v.rows.filter(r => r.type === 'btrans')
      expect(btrans).toHaveLength(1)
      expect(btrans[0].amount).toBe(-5000)
      expect(btrans[0].description).toBe('Borttagen rad')
      expect(btrans[0].name).toBe('Anna Testsson')

      const rtrans = v.rows.filter(r => r.type === 'rtrans')
      expect(rtrans).toHaveLength(1)
      expect(rtrans[0].amount).toBe(-3000)
      expect(rtrans[0].name).toBe('Anna Testsson')
    })

    it('should parse escaped quotes in voucher description', () => {
      const v = parsed.vouchers.find(v => v.series === 'B' && v.voucher_number === 1)!
      expect(v.description).toBe('Faktura "Special"')
    })

    it('should have all vouchers balanced (TRANS rows only)', () => {
      for (const v of parsed.vouchers) {
        const transSum = v.rows
          .filter(r => r.type === 'normal')
          .reduce((sum, r) => sum + r.amount, 0)
        expect(Math.abs(transSum)).toBeLessThan(0.005)
      }
    })

    it('should have 11 total voucher rows', () => {
      const total = parsed.vouchers.reduce((sum, v) => sum + v.rows.length, 0)
      expect(total).toBe(11)
    })
  })

  describe('edge cases', () => {
    it('should handle multi-dimension block (takes first pair)', () => {
      const v = parsed.vouchers.find(v => v.series === 'A' && v.voucher_number === 3)!
      const multiDimRow = v.rows[0]
      // Parser takes first dim pair from {1 "100" 6 "P100"}
      expect(multiDimRow.dim_number).toBe(1)
      expect(multiDimRow.object_number).toBe('100')
      expect(multiDimRow.amount).toBe(2000)
    })

    it('should handle empty dimension block', () => {
      const v = parsed.vouchers.find(v => v.series === 'A' && v.voucher_number === 1)!
      expect(v.rows[0].dim_number).toBeNull()
      expect(v.rows[0].object_number).toBeNull()
    })

    it('should not crash on malformed line', () => {
      const badContent = '#FLAGGA 0\n#FORMAT PC8\n#SIETYP 4\n#BADTAG\n#FNAMN "OK"\n'
      const buf = Buffer.from(badContent, 'utf-8')
      const result = parseSIE4(buf)
      // Unknown tag is silently skipped, not an error
      expect(result.meta.company_name).toBe('OK')
    })
  })
})
