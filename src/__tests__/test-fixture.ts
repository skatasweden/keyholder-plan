import iconv from 'iconv-lite'

/**
 * Creates a minimal but complete SIE4 file as a CP437-encoded Buffer.
 *
 * Known values (use these in test assertions):
 * - Company: "Test AB", org: "559988-7766"
 * - 2 financial years: 2025 (index 0), 2024 (index -1)
 * - 5 accounts: 1510, 1930, 2640, 3001, 5420
 * - 5 KTYP entries: 1510=T, 1930=T, 2640=S, 3001=I, 5420=K
 * - 1 SRU code: 1510 -> 204
 * - 3 dimensions: 1, 6, 21 (21 is UNDERDIM of 1)
 * - 2 objects: P100, P200 (both dim 6)
 * - 3 IB: (0,1510,50000), (0,1930,100000), (-1,1510,40000)
 * - 1 OIB: (0,1510,{6 "P100"},15000)
 * - 3 UB: (0,1510,60000), (0,1930,120000), (-1,1510,50000)
 * - 1 OUB: (0,1510,{6 "P100"},18000)
 * - 2 RES: (0,3001,-78500), (0,5420,25000)
 * - 4 PSALDO: 2 aggregate + 2 per-object
 * - 1 PBUDGET: (0,202501,3001,{},−50000)
 * - 4 vouchers: A-1, A-2, B-1, A-3
 * - 11 total voucher rows: 9 TRANS + 1 BTRANS + 1 RTRANS
 * - Voucher A-2 has dim {6 "P100"} on first TRANS
 * - Voucher A-1 first TRANS has transdat 20250116
 * - Voucher B-1 has BTRANS and RTRANS with sign field "Anna Testsson"
 * - Voucher B-1 description has escaped quotes: Faktura "Special"
 * - Voucher A-3 has multi-dim {1 "100" 6 "P100"} on first TRANS
 * - Optional metadata: #BKOD, #FTYP, #PROSA, #TAXAR, #VALUTA, #ENHET
 */
export function createTestSIE4Buffer(): Buffer {
  const lines = [
    '#FLAGGA 0',
    '#FORMAT PC8',
    '#SIETYP 4',
    '#PROGRAM "TestGen" 1.0',
    '#GEN 20250601',
    '#FNR 999999',
    '#FNAMN "Test AB"',
    '#ORGNR 559988-7766',
    '#ADRESS "Anna Testsson" "Testgatan 1" "123 45 Teststad" "070-1234567"',
    '#OMFATTN 20251231',
    '#KPTYP BAS2024',
    // Phase 5: optional metadata
    '#BKOD 62010',
    '#FTYP AB',
    '#PROSA "Exporterad fran TestGen"',
    '#TAXAR 2026',
    '#VALUTA SEK',
    '#RAR 0 20250101 20251231',
    '#RAR -1 20240101 20241231',
    '#KONTO 1510 "Kundfordringar"',
    '#KONTO 1930 "Foretagskonto"',
    '#KONTO 2640 "Ingaende moms"',
    '#KONTO 3001 "Forsaljning"',
    '#KONTO 5420 "Programvaror"',
    '#KTYP 1510 T',
    '#KTYP 1930 T',
    '#KTYP 2640 S',
    '#KTYP 3001 I',
    '#KTYP 5420 K',
    // Phase 5: quantity unit
    '#ENHET 5420 st',
    '#SRU 1510 204',
    '#DIM 1 "Kostnadsstalle"',
    '#DIM 6 "Projekt"',
    // Phase 6: hierarchical sub-dimension
    '#UNDERDIM 21 "Underavdelning" 1',
    '#OBJEKT 6 "P100" "Projekt Alpha"',
    '#OBJEKT 6 "P200" "Projekt Beta"',
    '#IB 0 1510 50000 0',
    '#IB 0 1930 100000 0',
    '#IB -1 1510 40000 0',
    // Phase 7: object-level opening balance
    '#OIB 0 1510 {6 "P100"} 15000 0',
    '#UB 0 1510 60000 0',
    '#UB 0 1930 120000 0',
    '#UB -1 1510 50000 0',
    // Phase 7: object-level closing balance
    '#OUB 0 1510 {6 "P100"} 18000 0',
    '#RES 0 3001 -78500',
    '#RES 0 5420 25000',
    // Phase 4: PSALDO with both aggregate and per-object
    '#PSALDO 0 202501 1510 {} 55000 0',
    '#PSALDO 0 202502 1510 {} 58000 0',
    '#PSALDO 0 202501 1510 {6 "P100"} 12000 0',
    '#PSALDO 0 202501 1510 {6 "P200"} 43000 0',
    // Phase 8: period budget
    '#PBUDGET 0 202501 3001 {} -50000 0',
    '#VER A 1 20250115 "Kundbetalning" 20250120',
    '{',
    // Phase 2: first TRANS has transdat 20250116
    '#TRANS 1930 {} 10000 20250116 "" 0',
    '#TRANS 1510 {} -10000 "" "" 0',
    '}',
    '#VER A 2 20250220 "Programvarukop" 20250225',
    '{',
    '#TRANS 5420 {6 "P100"} 5000 "" "Adobe licens" 0',
    '#TRANS 2640 {} 1250 "" "" 0',
    '#TRANS 1930 {} -6250 "" "" 0',
    '}',
    '#VER B 1 20250301 "Faktura \\"Special\\"" 20250305',
    '{',
    '#TRANS 1510 {} -3000 "" "" 0',
    '#TRANS 1930 {} 3000 "" "" 0',
    '#BTRANS 1510 {} -5000 "" "Borttagen rad" 0 "Anna Testsson"',
    '#RTRANS 1510 {} -3000 "" "Rattad rad" 0 "Anna Testsson"',
    '}',
    '#VER A 3 20250315 "Multi-dim test" 20250320',
    '{',
    '#TRANS 5420 {1 "100" 6 "P100"} 2000 "" "" 0',
    '#TRANS 1930 {} -2000 "" "" 0',
    '}',
  ]
  return iconv.encode(lines.join('\r\n'), 'cp437')
}
