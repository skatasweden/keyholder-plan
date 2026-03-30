# SIE4 Import Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SIE4 import pipeline provably correct with automated tests, expanded validation, and clean infrastructure.

**Architecture:** Add vitest test suite with hand-built CP437 fixture for parser unit tests and 3 real Fortnox files for regression. Expand parser (#KTYP account types), schema (account_type column, year-scoped voucher uniqueness), and validator (10 checks, up from 6). TDD for new features; regression tests for existing.

**Tech Stack:** TypeScript (ESM), vitest, iconv-lite, @supabase/supabase-js v2, local Supabase (Docker)

**Prerequisites:**
- Node.js 18+
- Local Supabase running (`cd` to project root, `npx supabase start`)
- `npm install` done

**Spec:** `docs/superpowers/specs/2026-03-30-sie4-hardening-design.md`

**Spec simplifications (applied after deeper analysis):**
- **RTRANS+TRANS compat dedup NOT implemented** — Current behavior is already correct: only `#TRANS` rows are summed for balance checks; BTRANS/RTRANS are metadata stored with their type flag. Real Fortnox data doesn't always follow the spec's RTRANS+compat pattern. No `rtrans_compat` type added.
- **Multi-dimension `dimensions` array NOT added to voucher row type** — Parser already handles multi-dim `{}` blocks without crashing (takes first pair). Storing all pairs would need a DB junction table — overkill for Fortnox data which rarely uses multi-dim on a single row.

---

## File Structure

**New files:**
| File | Responsibility |
|------|---------------|
| `.gitignore` | Exclude node_modules, .env, dist, .DS_Store |
| `.env.example` | Document available env vars |
| `vitest.config.ts` | Test runner config |
| `supabase/migrations/00002_sie_hardening.sql` | account_type column + voucher unique constraint |
| `src/__tests__/test-fixture.ts` | Hand-built SIE4 CP437 buffer with known values |
| `src/__tests__/parser.test.ts` | Parser unit tests (no DB needed) |
| `src/__tests__/integration.test.ts` | Full pipeline tests (needs local Supabase) |
| `docs/fortnox-crosscheck.md` | Manual verification procedure template |

**Modified files:**
| File | Change |
|------|--------|
| `package.json` | Add vitest devDep + test scripts |
| `src/types.ts:3` | Add `account_type` to accounts array type |
| `src/sie4-parser.ts:46-98` | Add #KTYP case + post-parse merge |
| `src/sie4-importer.ts:99-104,190` | Include account_type in upsert + update voucher onConflict/map |
| `src/sie4-validator.ts:133-149` | Add 4 new checks after existing 6 |
| `src/cli.ts:7-8` | Replace hardcoded creds with process.env fallback |

---

### Task 1: Infrastructure Setup

**Files:**
- Create: `.gitignore`, `.env.example`, `vitest.config.ts`
- Modify: `package.json`, `src/cli.ts`

- [ ] **Step 1: Create `.gitignore`**

Create file `.gitignore`:
```
node_modules/
dist/
.env
.DS_Store
*.log
```

- [ ] **Step 2: Create `.env.example`**

Create file `.env.example`:
```
SUPABASE_URL=http://127.0.0.1:54421
SUPABASE_SERVICE_KEY=your-service-key-here
```

- [ ] **Step 3: Install vitest**

Run: `npm install -D vitest`

- [ ] **Step 4: Create `vitest.config.ts`**

Create file `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 30_000,
  },
})
```

- [ ] **Step 5: Add test scripts to `package.json`**

In `package.json`, replace the `"scripts"` block with:
```json
"scripts": {
  "import": "tsx src/cli.ts",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 6: Replace hardcoded credentials in `src/cli.ts`**

Replace lines 7-8:
```typescript
const SUPABASE_URL = 'http://127.0.0.1:54421'
const SUPABASE_SERVICE_KEY = '$SUPABASE_SERVICE_KEY'
```
With:
```typescript
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54421'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '$SUPABASE_SERVICE_KEY'
```

- [ ] **Step 7: Verify vitest works**

Run: `npx vitest run`

Expected: Exits cleanly with "No test files found" or similar. Confirms vitest is installed and configured.

- [ ] **Step 8: Commit**

```bash
git add .gitignore .env.example vitest.config.ts package.json package-lock.json src/cli.ts
git commit -m "feat: add infrastructure (gitignore, env vars, vitest setup)"
```

---

### Task 2: Schema Migration

**Files:**
- Create: `supabase/migrations/00002_sie_hardening.sql`

- [ ] **Step 1: Create migration file `supabase/migrations/00002_sie_hardening.sql`**

```sql
-- SIE4 Hardening: account types + year-scoped voucher uniqueness

-- 1. Add account_type column (T=asset, S=liability, K=cost, I=income)
ALTER TABLE accounts ADD COLUMN account_type text
  CHECK (account_type IN ('T', 'S', 'K', 'I'));

-- 2. Change voucher uniqueness to include financial year
-- Prevents voucher A-1 in 2024 from being overwritten by A-1 in 2025
ALTER TABLE vouchers DROP CONSTRAINT vouchers_series_voucher_number_key;
ALTER TABLE vouchers ADD CONSTRAINT vouchers_series_voucher_number_fy_key
  UNIQUE(series, voucher_number, financial_year_id);
```

- [ ] **Step 2: Apply migration by resetting the database**

Run: `npx supabase db reset`

Expected: Both migrations applied successfully. Output includes:
```
Applying migration 00001_sie_schema.sql...
Applying migration 00002_sie_hardening.sql...
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00002_sie_hardening.sql
git commit -m "feat: add account_type column and year-scoped voucher uniqueness"
```

---

### Task 3: Types Update + Test Fixture

**Files:**
- Modify: `src/types.ts`
- Modify: `src/sie4-parser.ts` (minimal — add `account_type: null` to accounts.push)
- Create: `src/__tests__/test-fixture.ts`

- [ ] **Step 1: Add account_type to ParsedSIE4 accounts type**

In `src/types.ts`, replace:
```typescript
  accounts: Array<{
    account_number: number
    name: string
  }>
```
With:
```typescript
  accounts: Array<{
    account_number: number
    name: string
    account_type: 'T' | 'S' | 'K' | 'I' | null
  }>
```

- [ ] **Step 2: Add account_type: null to parser accounts.push (temporary default)**

In `src/sie4-parser.ts`, replace:
```typescript
        case '#KONTO':
          result.accounts.push({
            account_number: parseInt(fields[1]),
            name: fields[2] || '',
          })
          break
```
With:
```typescript
        case '#KONTO':
          result.accounts.push({
            account_number: parseInt(fields[1]),
            name: fields[2] || '',
            account_type: null,
          })
          break
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors. The `account_type: null` satisfies the type.

- [ ] **Step 4: Create test fixture `src/__tests__/test-fixture.ts`**

This file creates a hand-built SIE4 CP437 buffer with known values for every SIE tag. Every number and string in this fixture is a test assertion anchor.

Create file `src/__tests__/test-fixture.ts`:
```typescript
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
 * - 2 dimensions: 1, 6
 * - 2 objects: P100, P200 (both dim 6)
 * - 3 IB: (0,1510,50000), (0,1930,100000), (-1,1510,40000)
 * - 3 UB: (0,1510,60000), (0,1930,120000), (-1,1510,50000)
 * - 2 RES: (0,3001,-78500), (0,5420,25000)
 * - 2 PSALDO: (0,202501,1510,55000), (0,202502,1510,58000)
 * - 4 vouchers: A-1, A-2, B-1, A-3
 * - 11 total voucher rows: 9 TRANS + 1 BTRANS + 1 RTRANS
 * - Voucher A-2 has dim {6 "P100"} on first TRANS
 * - Voucher B-1 has BTRANS and RTRANS with name field "Anna Testsson"
 * - Voucher B-1 description has escaped quotes: Faktura "Special"
 * - Voucher A-3 has multi-dim {1 "100" 6 "P100"} on first TRANS
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
    '#SRU 1510 204',
    '#DIM 1 "Kostnadsstalle"',
    '#DIM 6 "Projekt"',
    '#OBJEKT 6 "P100" "Projekt Alpha"',
    '#OBJEKT 6 "P200" "Projekt Beta"',
    '#IB 0 1510 50000 0',
    '#IB 0 1930 100000 0',
    '#IB -1 1510 40000 0',
    '#UB 0 1510 60000 0',
    '#UB 0 1930 120000 0',
    '#UB -1 1510 50000 0',
    '#RES 0 3001 -78500',
    '#RES 0 5420 25000',
    '#PSALDO 0 202501 1510 {} 55000 0',
    '#PSALDO 0 202502 1510 {} 58000 0',
    '#VER A 1 20250115 "Kundbetalning" 20250120',
    '{',
    '#TRANS 1930 {} 10000 "" "" 0',
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
```

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/sie4-parser.ts src/__tests__/test-fixture.ts
git commit -m "feat: add account_type to types, create test fixture"
```

---

### Task 4: Parser #KTYP Support (TDD)

**Files:**
- Create: `src/__tests__/parser.test.ts`
- Modify: `src/sie4-parser.ts`

- [ ] **Step 1: Write the failing test for #KTYP**

Create file `src/__tests__/parser.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/parser.test.ts`

Expected: FAIL — account_type is `null` for all accounts because #KTYP is not parsed yet.

- [ ] **Step 3: Implement #KTYP parsing in `src/sie4-parser.ts`**

Add a Map to collect KTYP entries before the while loop (after the `result` object, around line 35):
```typescript
  const accountTypes = new Map<number, string>()
```

Add a new case inside the switch block (after the `#KONTO` case, around line 98):
```typescript
        case '#KTYP':
          accountTypes.set(parseInt(fields[1]), fields[2] || '')
          break
```

After the while loop ends (before `return result`, around line 224), merge account types:
```typescript
  // Merge #KTYP data into accounts
  for (const account of result.accounts) {
    const type = accountTypes.get(account.account_number)
    if (type === 'T' || type === 'S' || type === 'K' || type === 'I') {
      account.account_type = type
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/parser.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/parser.test.ts src/sie4-parser.ts
git commit -m "feat: parse #KTYP account types (TDD)"
```

---

### Task 5: Parser Regression Tests (Existing Features)

**Files:**
- Modify: `src/__tests__/parser.test.ts`

These tests verify the parser's existing functionality against known fixture values. They should all pass immediately — if any fail, there's a parser bug.

- [ ] **Step 1: Add metadata tests**

Append to `src/__tests__/parser.test.ts` inside the `describe('parseSIE4')` block:
```typescript
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
```

- [ ] **Step 2: Add financial year tests**

```typescript
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
```

- [ ] **Step 3: Add account, dimension, object, and SRU tests**

```typescript
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
```

- [ ] **Step 4: Add balance tests**

```typescript
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
```

- [ ] **Step 5: Add voucher tests**

```typescript
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
```

- [ ] **Step 6: Add multi-dimension and edge case tests**

```typescript
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
```

- [ ] **Step 7: Run all parser tests**

Run: `npx vitest run src/__tests__/parser.test.ts`

Expected: ALL PASS. If any test fails, there's a bug in the existing parser that needs fixing before continuing.

- [ ] **Step 8: Commit**

```bash
git add src/__tests__/parser.test.ts
git commit -m "test: add comprehensive parser unit tests (17 tests)"
```

---

### Task 6: Importer Updates

**Files:**
- Modify: `src/sie4-importer.ts`

- [ ] **Step 1: Include account_type in account upsert**

In `src/sie4-importer.ts`, replace the accRows construction (around lines 99-101):
```typescript
    const accRows = [
      ...parsed.accounts.map(a => ({ account_number: a.account_number, name: a.name })),
      ...extraAccounts.map(a => ({ account_number: a, name: `Account ${a}` })),
    ]
```
With:
```typescript
    const accRows = [
      ...parsed.accounts.map(a => ({
        account_number: a.account_number,
        name: a.name,
        account_type: a.account_type,
      })),
      ...extraAccounts.map(a => ({
        account_number: a,
        name: `Account ${a}`,
        account_type: null,
      })),
    ]
```

- [ ] **Step 2: Update voucher upsert onConflict to include financial_year_id**

Replace (around line 190):
```typescript
    await upsertBatched(client, 'vouchers', voucherRows, 'series,voucher_number')
```
With:
```typescript
    await upsertBatched(client, 'vouchers', voucherRows, 'series,voucher_number,financial_year_id')
```

- [ ] **Step 3: Update voucher ID lookup to include financial_year_id in map key**

Replace the voucher lookup select (around line 200):
```typescript
        .select('id, series, voucher_number')
```
With:
```typescript
        .select('id, series, voucher_number, financial_year_id')
```

Replace the map key construction (around line 205):
```typescript
        voucherMap.set(`${v.series}:${v.voucher_number}`, v.id)
```
With:
```typescript
        voucherMap.set(`${v.series}:${v.voucher_number}:${v.financial_year_id}`, v.id)
```

- [ ] **Step 4: Update voucher row insertion to use the new map key**

Replace the voucher ID lookup when building voucher rows (around line 228):
```typescript
      const voucherId = voucherMap.get(`${v.series}:${v.voucher_number}`)
```
With:
```typescript
      const fyId = findFinancialYear(v.date, fyRanges)
      const voucherId = voucherMap.get(`${v.series}:${v.voucher_number}:${fyId}`)
```

Note: `fyRanges` is already defined earlier in the function (around line 172). It's in scope.

- [ ] **Step 5: Verify import still works with a real file**

Run: `npx tsx src/cli.ts SIE/RevILAB20260330_165333.se`

Expected: Import succeeds, all existing validation checks pass. The `account_type` column is now populated for accounts that had #KTYP entries in the file.

- [ ] **Step 6: Commit**

```bash
git add src/sie4-importer.ts
git commit -m "feat: import account_type, use year-scoped voucher uniqueness"
```

---

### Task 7: Validator Expansion (6 → 10 Checks)

**Files:**
- Modify: `src/sie4-validator.ts`

- [ ] **Step 1: Add RES amount check (check 7)**

Insert after the closing balances check (after the `checks.push` for check 5, around line 112), before the voucher balance check:

```typescript
  // 7. Period results (RES) amounts
  const dbRES = await fetchAll(client, 'period_results', 'account_number, amount, financial_year_id')
  const { data: allFyData } = await client.from('financial_years').select('id, year_index')
  const fyIdToIndex = new Map<string, number>()
  for (const fy of allFyData || []) {
    fyIdToIndex.set(fy.id, fy.year_index)
  }
  const dbRESMap = new Map<string, number>()
  for (const row of dbRES) {
    const yi = fyIdToIndex.get(row.financial_year_id as string)
    dbRESMap.set(`${yi}:${row.account_number}`, parseFloat(row.amount as string))
  }
  let resMatch = true
  let resChecked = 0
  for (const r of parsed.period_results) {
    resChecked++
    const dbAmount = dbRESMap.get(`${r.year_index}:${r.account_number}`)
    if (dbAmount === undefined || Math.abs(dbAmount - r.amount) > 0.005) {
      resMatch = false
    }
  }
  checks.push({
    name: 'Period results (RES) match',
    status: resMatch ? 'pass' : 'fail',
    expected: `${resChecked} accounts`,
    actual: resMatch ? `${resChecked} accounts` : 'mismatch',
  })
```

- [ ] **Step 2: Add PSALDO amount check (check 8)**

Insert after the RES check:

```typescript
  // 8. Period balances (PSALDO) amounts
  const dbPSALDO = await fetchAll(client, 'period_balances', 'account_number, period, amount, financial_year_id')
  const dbPSMap = new Map<string, number>()
  for (const row of dbPSALDO) {
    const yi = fyIdToIndex.get(row.financial_year_id as string)
    dbPSMap.set(`${yi}:${row.period}:${row.account_number}`, parseFloat(row.amount as string))
  }
  let psMatch = true
  let psChecked = 0
  for (const p of parsed.period_balances) {
    psChecked++
    const dbAmount = dbPSMap.get(`${p.year_index}:${p.period}:${p.account_number}`)
    if (dbAmount === undefined || Math.abs(dbAmount - p.amount) > 0.005) {
      psMatch = false
    }
  }
  checks.push({
    name: 'Period balances (PSALDO) match',
    status: psMatch ? 'pass' : 'fail',
    expected: `${psChecked} entries`,
    actual: psMatch ? `${psChecked} entries` : 'mismatch',
  })
```

- [ ] **Step 3: Add object count check (check 9)**

Insert after the PSALDO check:

```typescript
  // 9. Object count
  const { count: dbObjectCount } = await client
    .from('objects')
    .select('*', { count: 'exact', head: true })
  checks.push({
    name: 'Object count',
    status: (dbObjectCount ?? 0) === parsed.objects.length ? 'pass' : 'fail',
    expected: parsed.objects.length,
    actual: dbObjectCount ?? 0,
  })
```

- [ ] **Step 4: Add BTRANS/RTRANS type flag check (check 10)**

Insert after the object count check:

```typescript
  // 10. BTRANS/RTRANS type flags
  const parsedBtrans = parsed.vouchers.reduce(
    (sum, v) => sum + v.rows.filter(r => r.type === 'btrans').length, 0
  )
  const parsedRtrans = parsed.vouchers.reduce(
    (sum, v) => sum + v.rows.filter(r => r.type === 'rtrans').length, 0
  )
  const { count: dbBtrans } = await client
    .from('voucher_rows')
    .select('*', { count: 'exact', head: true })
    .eq('transaction_type', 'btrans')
  const { count: dbRtrans } = await client
    .from('voucher_rows')
    .select('*', { count: 'exact', head: true })
    .eq('transaction_type', 'rtrans')
  const typeMatch = (dbBtrans ?? 0) === parsedBtrans && (dbRtrans ?? 0) === parsedRtrans
  checks.push({
    name: 'BTRANS/RTRANS type flags',
    status: typeMatch ? 'pass' : 'fail',
    expected: `${parsedBtrans} btrans, ${parsedRtrans} rtrans`,
    actual: `${dbBtrans ?? 0} btrans, ${dbRtrans ?? 0} rtrans`,
  })
```

- [ ] **Step 5: Verify all 10 checks pass with a real file**

Run: `npx tsx src/cli.ts SIE/RevILAB20260330_165333.se`

Expected: "Result: X/X checks passed" with the new checks included. All should pass.

- [ ] **Step 6: Verify with the large file too**

Run: `npx tsx src/cli.ts "SIE/ByggnadsställningsentreprenadiStockholmAB20260330_170428.se"`

Expected: All checks pass (this file has the most data — 4,434 vouchers, 14,228 rows).

- [ ] **Step 7: Commit**

```bash
git add src/sie4-validator.ts
git commit -m "feat: expand validation to 10 checks (RES, PSALDO, objects, type flags)"
```

---

### Task 8: Integration Tests

**Files:**
- Create: `src/__tests__/integration.test.ts`

These tests run the full pipeline against a real Supabase instance. They will be skipped automatically if Supabase is not running.

- [ ] **Step 1: Create integration test file with setup helpers**

Create file `src/__tests__/integration.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { parseSIE4 } from '../sie4-parser.js'
import { importToSupabase } from '../sie4-importer.js'
import { validateImport } from '../sie4-validator.js'
import { createTestSIE4Buffer } from './test-fixture.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54421'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '$SUPABASE_SERVICE_KEY'

// Check if Supabase is running before all tests
let client: SupabaseClient
let supabaseAvailable = false
try {
  client = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { error } = await client.from('accounts').select('id').limit(1)
  supabaseAvailable = !error
} catch {
  supabaseAvailable = false
}

async function truncateAll(c: SupabaseClient) {
  // Delete in reverse FK order
  const tables = [
    'voucher_rows', 'vouchers', 'period_balances', 'period_results',
    'closing_balances', 'opening_balances', 'sru_codes', 'accounts',
    'objects', 'dimensions', 'financial_years', 'company_info',
  ]
  for (const table of tables) {
    await c.from(table).delete().not('id', 'is', null)
  }
}

describe.skipIf(!supabaseAvailable)('Integration: full pipeline', () => {
  beforeEach(async () => {
    await truncateAll(client)
  })

  // Tests go here (steps 2-6)
})
```

- [ ] **Step 2: Add test fixture pipeline test**

Inside the `describe` block, add:
```typescript
  it('should import test fixture and pass all validation checks', async () => {
    const parsed = parseSIE4(createTestSIE4Buffer())
    const result = await importToSupabase(parsed, client)

    expect(result.success).toBe(true)
    expect(result.import_errors).toHaveLength(0)
    expect(result.stats.accounts).toBe(5)
    expect(result.stats.vouchers).toBe(4)
    expect(result.stats.voucher_rows).toBe(11)

    const report = await validateImport(parsed, client)
    expect(report.passed).toBe(true)
    for (const check of report.checks) {
      expect(check.status, `Check "${check.name}" failed`).toBe('pass')
    }
  })
```

- [ ] **Step 3: Add idempotency test**

```typescript
  it('should be idempotent (re-import produces same result)', async () => {
    const parsed = parseSIE4(createTestSIE4Buffer())

    // Import twice
    await importToSupabase(parsed, client)
    const result2 = await importToSupabase(parsed, client)

    expect(result2.success).toBe(true)
    expect(result2.stats.accounts).toBe(5)
    expect(result2.stats.vouchers).toBe(4)
    expect(result2.stats.voucher_rows).toBe(11)

    const report = await validateImport(parsed, client)
    expect(report.passed).toBe(true)
  })
```

- [ ] **Step 4: Add account_type verification test**

```typescript
  it('should populate account_type column from #KTYP', async () => {
    const parsed = parseSIE4(createTestSIE4Buffer())
    await importToSupabase(parsed, client)

    const { data } = await client
      .from('accounts')
      .select('account_number, account_type')
      .order('account_number')

    const typeMap = new Map(data?.map(a => [a.account_number, a.account_type]))
    expect(typeMap.get(1510)).toBe('T')
    expect(typeMap.get(1930)).toBe('T')
    expect(typeMap.get(2640)).toBe('S')
    expect(typeMap.get(3001)).toBe('I')
    expect(typeMap.get(5420)).toBe('K')
  })
```

- [ ] **Step 5: Add real file regression tests**

```typescript
  it('should import RevIL AB (small) — all checks pass', async () => {
    const buffer = readFileSync(resolve('SIE/RevILAB20260330_165333.se'))
    const parsed = parseSIE4(buffer)
    const result = await importToSupabase(parsed, client)

    expect(result.success).toBe(true)
    expect(result.stats.vouchers).toBe(406)

    const report = await validateImport(parsed, client)
    expect(report.passed).toBe(true)
  })

  it('should import Skata Sweden AB (medium) — all checks pass', async () => {
    const buffer = readFileSync(resolve('SIE/SkataSwedenAB20260330_170222.se'))
    const parsed = parseSIE4(buffer)
    const result = await importToSupabase(parsed, client)

    expect(result.success).toBe(true)
    expect(result.stats.vouchers).toBe(79)

    const report = await validateImport(parsed, client)
    expect(report.passed).toBe(true)
  })

  it('should import Byggnadsställningsentreprenad (large) — all checks pass', async () => {
    // IMPORTANT: verify exact filename with `ls SIE/Bygg*` — it contains Swedish chars
    const buffer = readFileSync(resolve(
      'SIE/ByggnadsställningsentreprenadiStockholmAB20260330_170428.se'
    ))
    const parsed = parseSIE4(buffer)
    const result = await importToSupabase(parsed, client)

    expect(result.success).toBe(true)
    expect(result.stats.vouchers).toBe(4434)

    const report = await validateImport(parsed, client)
    expect(report.passed).toBe(true)
  })
```

**IMPORTANT:** The large file's filename contains Swedish characters. Get the exact filename from disk. Run `ls SIE/` to verify and copy the exact name into the test. The name shown above may not be exact — the agentic worker MUST verify with `ls`.

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`

Expected: All parser tests pass. All integration tests pass (assuming Supabase is running and migrations are applied).

If integration tests fail with "relation does not exist", run `npx supabase db reset` first.

- [ ] **Step 7: Commit**

```bash
git add src/__tests__/integration.test.ts
git commit -m "test: add integration tests (fixture + 3 real Fortnox files)"
```

---

### Task 9: Fortnox Crosscheck Document

**Files:**
- Create: `docs/fortnox-crosscheck.md`

- [ ] **Step 1: Create crosscheck procedure document**

Create file `docs/fortnox-crosscheck.md`:
```markdown
# Fortnox Crosscheck — Manual Verification

> One-time manual verification that the SIE4 parser correctly interprets
> Fortnox SIE4 exports. Proves the DB is a true mirror of the source system.

## Purpose

Automated tests prove parser-to-DB consistency (parsed data == DB data).
This crosscheck proves parser-to-source accuracy (DB data == Fortnox data).

## Procedure

Use RevIL AB (smallest file) for verification.

### 1. Balance Sheet (Balansräkning)

Open Fortnox → Rapporter → Balansräkning for 2025.

Pick 3 accounts and note the closing balance (UB):

| Account | Fortnox value | DB query | DB value | Match? |
|---------|--------------|----------|----------|--------|
| 1510 | _fill in_ | `SELECT amount FROM closing_balances cb JOIN financial_years fy ON cb.financial_year_id = fy.id WHERE fy.year_index = 0 AND cb.account_number = 1510;` | _fill in_ | |
| 1930 | _fill in_ | same query, account 1930 | _fill in_ | |
| 2640 | _fill in_ | same query, account 2640 | _fill in_ | |

### 2. Income Statement (Resultaträkning)

Open Fortnox → Rapporter → Resultaträkning for 2025.

Pick 3 accounts:

| Account | Fortnox value | DB query | DB value | Match? |
|---------|--------------|----------|----------|--------|
| 3001 | _fill in_ | `SELECT amount FROM period_results pr JOIN financial_years fy ON pr.financial_year_id = fy.id WHERE fy.year_index = 0 AND pr.account_number = 3001;` | _fill in_ | |
| 5420 | _fill in_ | same, account 5420 | _fill in_ | |

### 3. Specific Vouchers

Open Fortnox → Verifikationer. Pick voucher A-1 and one other:

| Voucher | Row | Fortnox account | Fortnox amount | DB amount | Match? |
|---------|-----|----------------|----------------|-----------|--------|
| A-1 | 1 | _fill in_ | _fill in_ | `SELECT account_number, amount FROM voucher_rows WHERE voucher_id = (SELECT id FROM vouchers WHERE series = 'A' AND voucher_number = 1) AND transaction_type = 'normal';` | |
| A-1 | 2 | _fill in_ | _fill in_ | | |

## Result

**Date verified:** _fill in_
**Verified by:** _fill in_
**All values match:** Yes / No

If any values don't match, investigate the specific parsing of that record type.
```

- [ ] **Step 2: Commit**

```bash
git add docs/fortnox-crosscheck.md
git commit -m "docs: add Fortnox crosscheck procedure for manual verification"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: All parser tests pass (17+). All integration tests pass (7+). Zero failures.

- [ ] **Step 2: Run the CLI import on all 3 files to verify the full pipeline**

```bash
npx tsx src/cli.ts SIE/RevILAB20260330_165333.se
npx tsx src/cli.ts SIE/SkataSwedenAB20260330_170222.se
npx tsx src/cli.ts "SIE/ByggnadsställningsentreprenadiStockholmAB20260330_170428.se"
```

Expected: Each file imports successfully with all 10 validation checks passing.

- [ ] **Step 3: Verify git is clean**

Run: `git status`

Expected: No uncommitted changes. `.DS_Store` and `node_modules/` are properly ignored. All work is committed.

- [ ] **Step 4: Summary commit (if any final changes needed)**

If any adjustments were needed during verification:
```bash
git add -A
git commit -m "fix: final adjustments from verification run"
```
