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

    // Phase 5: optional metadata
    it('should parse #BKOD (SNI code)', () => {
      expect(parsed.meta.sni_code).toBe('62010')
    })

    it('should parse #FTYP (company type)', () => {
      expect(parsed.meta.company_type).toBe('AB')
    })

    it('should parse #PROSA (comment)', () => {
      expect(parsed.meta.comment).toBe('Exporterad fran TestGen')
    })

    it('should parse #TAXAR (tax year)', () => {
      expect(parsed.meta.tax_year).toBe(2026)
    })

    it('should parse #VALUTA (currency)', () => {
      expect(parsed.meta.currency).toBe('SEK')
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

    // Phase 5: #ENHET quantity unit
    it('should parse #ENHET quantity unit', () => {
      const acc5420 = parsed.accounts.find(a => a.account_number === 5420)
      expect(acc5420?.quantity_unit).toBe('st')

      const acc1510 = parsed.accounts.find(a => a.account_number === 1510)
      expect(acc1510?.quantity_unit).toBeNull()
    })
  })

  describe('dimensions and objects', () => {
    it('should parse 3 dimensions (2 DIM + 1 UNDERDIM)', () => {
      expect(parsed.dimensions).toHaveLength(3)
      expect(parsed.dimensions.map(d => d.dimension_number).sort((a, b) => a - b)).toEqual([1, 6, 21])
    })

    it('should parse 2 objects (both dim 6)', () => {
      expect(parsed.objects).toHaveLength(2)
      expect(parsed.objects[0].dimension_number).toBe(6)
      expect(parsed.objects[0].object_number).toBe('P100')
      expect(parsed.objects[0].name).toBe('Projekt Alpha')
    })

    // Phase 6: #UNDERDIM
    it('should parse #UNDERDIM with parent_dimension', () => {
      const underdim = parsed.dimensions.find(d => d.dimension_number === 21)
      expect(underdim?.name).toBe('Underavdelning')
      expect(underdim?.parent_dimension).toBe(1)
    })

    it('should have null parent_dimension for regular #DIM', () => {
      const dim1 = parsed.dimensions.find(d => d.dimension_number === 1)
      expect(dim1?.parent_dimension).toBeNull()
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
    it('should parse 4 opening balances (3 IB + 1 OIB)', () => {
      expect(parsed.opening_balances).toHaveLength(4)
    })

    it('should have correct amounts for aggregate balances', () => {
      const ib1510 = parsed.opening_balances.find(
        ib => ib.year_index === 0 && ib.account_number === 1510 && ib.dimension_number === null
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

    // Phase 7: #OIB
    it('should parse #OIB object-level opening balance', () => {
      const oib = parsed.opening_balances.find(
        ib => ib.dimension_number === 6 && ib.object_number === 'P100'
      )
      expect(oib).toBeDefined()
      expect(oib?.amount).toBe(15000)
      expect(oib?.year_index).toBe(0)
      expect(oib?.account_number).toBe(1510)
    })
  })

  describe('closing balances', () => {
    it('should parse 4 closing balances (3 UB + 1 OUB)', () => {
      expect(parsed.closing_balances).toHaveLength(4)
    })

    it('should have correct amounts for aggregate balances', () => {
      const ub1510 = parsed.closing_balances.find(
        ub => ub.year_index === 0 && ub.account_number === 1510 && ub.dimension_number === null
      )
      expect(ub1510?.amount).toBe(60000)

      const ub1930 = parsed.closing_balances.find(
        ub => ub.year_index === 0 && ub.account_number === 1930
      )
      expect(ub1930?.amount).toBe(120000)
    })

    // Phase 7: #OUB
    it('should parse #OUB object-level closing balance', () => {
      const oub = parsed.closing_balances.find(
        ub => ub.dimension_number === 6 && ub.object_number === 'P100'
      )
      expect(oub).toBeDefined()
      expect(oub?.amount).toBe(18000)
      expect(oub?.year_index).toBe(0)
      expect(oub?.account_number).toBe(1510)
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
    // Phase 4: now includes per-object entries
    it('should parse 4 period balances (2 aggregate + 2 per-object)', () => {
      expect(parsed.period_balances).toHaveLength(4)
    })

    it('should have correct period and amount for aggregate entries', () => {
      const ps1 = parsed.period_balances.find(
        p => p.period === 202501 && p.dimension_number === null
      )
      expect(ps1?.account_number).toBe(1510)
      expect(ps1?.amount).toBe(55000)

      const ps2 = parsed.period_balances.find(
        p => p.period === 202502 && p.dimension_number === null
      )
      expect(ps2?.amount).toBe(58000)
    })

    it('should parse per-object PSALDO entries', () => {
      const psP100 = parsed.period_balances.find(
        p => p.dimension_number === 6 && p.object_number === 'P100'
      )
      expect(psP100?.amount).toBe(12000)
      expect(psP100?.period).toBe(202501)

      const psP200 = parsed.period_balances.find(
        p => p.dimension_number === 6 && p.object_number === 'P200'
      )
      expect(psP200?.amount).toBe(43000)
    })
  })

  // Phase 8: #PBUDGET
  describe('period budgets (#PBUDGET)', () => {
    it('should parse 1 period budget', () => {
      expect(parsed.period_budgets).toHaveLength(1)
    })

    it('should have correct values', () => {
      const pb = parsed.period_budgets[0]
      expect(pb.year_index).toBe(0)
      expect(pb.period).toBe(202501)
      expect(pb.account_number).toBe(3001)
      expect(pb.amount).toBe(-50000)
      expect(pb.dimension_number).toBeNull()
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

    // Phase 2: transdat
    it('should parse #TRANS transdat (transaction date)', () => {
      const v = parsed.vouchers.find(v => v.series === 'A' && v.voucher_number === 1)!
      expect(v.rows[0].transaction_date).toBe('2025-01-16')
      // Second TRANS has empty transdat
      expect(v.rows[1].transaction_date).toBeNull()
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
      expect(btrans[0].sign).toBe('Anna Testsson')

      const rtrans = v.rows.filter(r => r.type === 'rtrans')
      expect(rtrans).toHaveLength(1)
      expect(rtrans[0].amount).toBe(-3000)
      expect(rtrans[0].sign).toBe('Anna Testsson')
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
    // Phase 3: multi-dimension now stores ALL pairs
    it('should store all dimension pairs from multi-dim block', () => {
      const v = parsed.vouchers.find(v => v.series === 'A' && v.voucher_number === 3)!
      const multiDimRow = v.rows[0]
      // First pair still in dim_number/object_number for backward compat
      expect(multiDimRow.dim_number).toBe(1)
      expect(multiDimRow.object_number).toBe('100')
      expect(multiDimRow.amount).toBe(2000)
      // All pairs in dimensions array
      expect(multiDimRow.dimensions).toHaveLength(2)
      expect(multiDimRow.dimensions[0]).toEqual({ dim_number: 1, object_number: '100' })
      expect(multiDimRow.dimensions[1]).toEqual({ dim_number: 6, object_number: 'P100' })
    })

    it('should handle empty dimension block', () => {
      const v = parsed.vouchers.find(v => v.series === 'A' && v.voucher_number === 1)!
      expect(v.rows[0].dim_number).toBeNull()
      expect(v.rows[0].object_number).toBeNull()
      expect(v.rows[0].dimensions).toHaveLength(0)
    })

    it('should have single-dim in dimensions array for simple dim block', () => {
      const v = parsed.vouchers.find(v => v.series === 'A' && v.voucher_number === 2)!
      const dimRow = v.rows.find(r => r.dim_number === 6)!
      expect(dimRow.dimensions).toHaveLength(1)
      expect(dimRow.dimensions[0]).toEqual({ dim_number: 6, object_number: 'P100' })
    })

    it('should not crash on malformed line', () => {
      const badContent = '#FLAGGA 0\n#FORMAT PC8\n#SIETYP 4\n#BADTAG\n#FNAMN "OK"\n'
      const buf = Buffer.from(badContent, 'utf-8')
      const result = parseSIE4(buf)
      // Unknown tag is silently skipped, not an error
      expect(result.meta.company_name).toBe('OK')
    })
  })

  // Phase 9: CRC-32
  describe('CRC-32 (#KSUMMA)', () => {
    it('should set crc_verified to null when no #KSUMMA present', () => {
      expect(parsed.crc_verified).toBeNull()
    })

    it('should detect CRC mismatch', () => {
      const content = '#FLAGGA 0\n#KSUMMA\n#FNAMN "Test"\n#KSUMMA 999999\n'
      const buf = Buffer.from(content, 'utf-8')
      const result = parseSIE4(buf)
      expect(result.crc_verified).toBe(false)
      expect(result.parse_errors.length).toBeGreaterThan(0)
      expect(result.parse_errors[0].error).toContain('CRC-32 mismatch')
    })
  })
})
