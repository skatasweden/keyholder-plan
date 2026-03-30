# SIE4 Import Hardening — Design Spec

> Make the SIE4 import pipeline provably correct: every parsed value verified,
> every edge case tested, every number crosschecked against the source.

**Date:** 2026-03-30
**Status:** Draft
**Goal:** A foundation we can trust 100% — the DB is an exact mirror of the SIE file.

---

## 1. Problem Statement

The current SIE4 import pipeline works (3 files imported, 6 validation checks pass),
but "works" is not "proven correct." Specifically:

1. **Validation gaps** — RES and PSALDO amounts are imported but never verified against the file
2. **Parser gaps** — #KTYP (account type) not parsed, multi-dimension `{}` blocks not handled, RTRANS+TRANS compat pairs not deduplicated
3. **Schema weakness** — voucher uniqueness is `(series, voucher_number)` without `financial_year_id`, risking cross-year overwrites
4. **No automated tests** — correctness depends on manual CLI runs, nothing stops regressions
5. **Hardcoded credentials** — local Supabase URL and key baked into cli.ts
6. **No .gitignore** — node_modules and .DS_Store pollute git status

---

## 2. Success Criteria

After this work is done:

- `npm test` runs all tests and they all pass
- Parser unit tests prove every SIE tag is parsed correctly using a hand-built test fixture
- Integration tests prove the full pipeline (parse → import → validate) against all 3 real files
- All 10 validation checks pass (up from 6)
- Schema supports account types and year-scoped voucher uniqueness
- No hardcoded credentials
- Clean git status (proper .gitignore)

---

## 3. Changes — Parser (`src/sie4-parser.ts`)

### 3.1 Add #KTYP parsing

The SIE spec defines `#KTYP kontonr kontotyp` where kontotyp is one of:
- `T` = Tillgång (asset)
- `S` = Skuld/Eget kapital (liability/equity)
- `K` = Kostnad (cost/expense)
- `I` = Intäkt (income/revenue)

**Implementation:** Parse #KTYP lines and store as a map. After all lines are parsed,
merge account_type into the accounts array. Accounts without #KTYP get `null`.

**Type change in `ParsedSIE4`:**
```typescript
accounts: Array<{
  account_number: number
  name: string
  account_type: 'T' | 'S' | 'K' | 'I' | null  // NEW
}>
```

### 3.2 Multi-dimension support in `{}`

Current `parseDimension()` only extracts one dim/object pair. The SIE spec allows
multiple pairs: `{1 "100" 6 "P1040"}`.

**Implementation:** Change `parseDimension()` to return an array of pairs. Since
`voucher_rows` currently stores a single `dim_number`/`object_number`, and the DB
schema has single columns for these: store the **first** dimension pair in the
existing columns. This preserves backward compatibility.

**Why not change the schema?** Multi-dimension voucher rows are rare in Fortnox
(which only uses dim 1 and 6, and typically only one per row). Adding a junction
table now would be over-engineering. The parser change ensures we don't crash on
multi-dim input; storing the first pair is sufficient for current needs.

**Type change in voucher row:**
```typescript
rows: Array<{
  // ... existing fields ...
  dimensions: Array<{ dim_number: number; object_number: string }>  // NEW — full parsed data
  dim_number: number | null      // kept for backward compat (first dim)
  object_number: string | null   // kept for backward compat (first dim)
}>
```

### 3.3 RTRANS+TRANS backward compatibility pairs

Per the SIE 4C spec, every `#RTRANS` row must be followed by an identical `#TRANS`
row for backward compatibility. If the parser handles RTRANS, the following TRANS
is a duplicate and should be flagged.

**Implementation:** After parsing an `#RTRANS` row, check if the next row is a
`#TRANS` with the same account and amount. If so, mark it with
`type: 'rtrans_compat'` and exclude it from voucher row counts and balance checks.

**Decision:** Store these rows with `transaction_type = 'rtrans_compat'` in the DB
so we have an audit trail, but exclude them from all validation sums.

**Schema change:** Add `'rtrans_compat'` to the CHECK constraint on `voucher_rows.transaction_type`.

---

## 4. Changes — Schema (`supabase/migrations/00002_sie_hardening.sql`)

### 4.1 Add account_type column
```sql
ALTER TABLE accounts ADD COLUMN account_type text
  CHECK (account_type IN ('T', 'S', 'K', 'I'));
```

### 4.2 Add financial_year_id to voucher uniqueness

Current: `UNIQUE(series, voucher_number)`
New: `UNIQUE(series, voucher_number, financial_year_id)`

This prevents a voucher A-1 in year 2024 from being overwritten by A-1 in 2025.

```sql
ALTER TABLE vouchers DROP CONSTRAINT vouchers_series_voucher_number_key;
ALTER TABLE vouchers ADD CONSTRAINT vouchers_series_voucher_number_fy_key
  UNIQUE(series, voucher_number, financial_year_id);
```

### 4.3 Add rtrans_compat to transaction_type CHECK

```sql
ALTER TABLE voucher_rows DROP CONSTRAINT voucher_rows_transaction_type_check;
ALTER TABLE voucher_rows ADD CONSTRAINT voucher_rows_transaction_type_check
  CHECK (transaction_type IN ('normal', 'btrans', 'rtrans', 'rtrans_compat'));
```

---

## 5. Changes — Importer (`src/sie4-importer.ts`)

### 5.1 Import account_type
When upserting accounts, include the `account_type` field.

### 5.2 Update voucher upsert onConflict
Change from `'series,voucher_number'` to `'series,voucher_number,financial_year_id'`.

### 5.3 Handle rtrans_compat rows
Store them with `transaction_type: 'rtrans_compat'`.

---

## 6. Changes — Validator (`src/sie4-validator.ts`)

Expand from 6 to 10 checks. All existing checks preserved.

### New check 7: RES amounts match
For each `#RES` entry in the parsed data, verify the corresponding row in
`period_results` has the same amount (tolerance: 0.005). Check all financial years,
not just year_index=0.

### New check 8: PSALDO amounts match
For each `#PSALDO` entry (aggregate only, empty dim), verify the corresponding row
in `period_balances` has the same amount and period. Check all financial years.

### New check 9: Object count matches
Compare count of `#OBJEKT` entries in parsed data against `objects` table row count.

### New check 10: BTRANS/RTRANS type flags correct
Query `voucher_rows` grouped by `transaction_type`. Verify:
- Count of `'btrans'` rows in DB = count of #BTRANS rows in parsed data
- Count of `'rtrans'` rows in DB = count of #RTRANS rows in parsed data
- Count of `'rtrans_compat'` rows = count of flagged compat duplicates

### Updated check 6: Voucher balance
Exclude `rtrans_compat` rows from the balance sum (in addition to btrans/rtrans).

---

## 7. Infrastructure

### 7.1 .gitignore
```
node_modules/
dist/
.env
.DS_Store
*.log
```

### 7.2 Environment variables
Create `.env.example` with:
```
SUPABASE_URL=http://127.0.0.1:54421
SUPABASE_SERVICE_KEY=your-service-key-here
```

Use `dotenv` package in `cli.ts` to load `.env`. Fall back to hardcoded local values
if no `.env` exists (for convenience during local dev, with a console warning).

### 7.3 Vitest setup
Add `vitest` as dev dependency. Minimal config in `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30_000,  // integration tests need time for DB operations
  },
})
```

Add `"test": "vitest run"` to package.json scripts.

---

## 8. Test Strategy

Three layers of tests, each proving a different thing.

### 8.1 Unit Tests — Parser (`src/__tests__/parser.test.ts`)

Test the parser in isolation, no database needed.

**Test fixture:** A hand-built SIE4 file (`src/__tests__/fixtures/test-minimal.se`)
written as UTF-8 then converted to CP437 using iconv-lite at test setup time
(or pre-encoded as a Buffer literal in the test). ~40 lines, containing exactly:
- 1 company with known metadata
- 2 financial years (0 and -1)
- 5 accounts with known numbers and names, including #KTYP entries
- 2 dimensions (1 and 6)
- 2 objects
- 3 opening balances with known amounts
- 3 closing balances with known amounts
- 2 period results
- 2 period balances (PSALDO)
- 3 vouchers:
  - Normal voucher with 2 TRANS rows (balanced)
  - Voucher with BTRANS rows
  - Voucher with RTRANS + compat TRANS pair
- 1 SRU code

**Test cases:**
1. Parse metadata fields (company name, org number, etc.)
2. Parse financial years (year_index, dates)
3. Parse accounts with #KTYP (verify account_type is set)
4. Parse accounts without #KTYP (verify account_type is null)
5. Parse dimensions and objects
6. Parse opening/closing balances (exact amounts)
7. Parse period results (exact amounts, no quarter field)
8. Parse PSALDO (period, amount, only aggregate entries)
9. Parse normal voucher with TRANS rows
10. Parse voucher with BTRANS (verify type = 'btrans')
11. Parse voucher with RTRANS + compat TRANS (verify dedup)
12. Parse escaped quotes in descriptions: `\"BMS\"`
13. Parse multi-dimension block: `{1 "100" 6 "P1040"}`
14. Parse empty dimension block: `{}`
15. Verify all TRANS rows in each voucher sum to zero
16. Verify parse_errors is empty for valid input
17. Parse malformed line — verify it's captured in parse_errors, doesn't crash

### 8.2 Integration Tests — Full Pipeline (`src/__tests__/integration.test.ts`)

**Requires:** Local Supabase running (`npx supabase start`).

These tests run the complete pipeline: parse → import → validate → query.

**Setup:** Before each test, reset the database (`supabase db reset` or truncate all tables).

**Test cases using the minimal fixture:**
1. Import fixture file → all 10 validation checks pass
2. Re-import same file (idempotency) → all checks still pass, no duplicate rows
3. Import → query specific account balance → exact match
4. Import → query specific voucher → correct rows, amounts, types
5. Import → verify account_type column populated correctly

**Test cases using the 3 real Fortnox files:**
6. RevIL AB — import + all 10 checks pass
7. Skata Sweden AB — import + all 10 checks pass
8. Byggnadsställningsentreprenad — import + all 10 checks pass

These are regression tests: if any parser or importer change breaks a real file,
we catch it immediately.

### 8.3 Manual Fortnox Crosscheck (one-time, documented)

**Purpose:** Prove the parser interprets the file correctly, not just consistently.

**Procedure (documented in `docs/fortnox-crosscheck.md`):**

For one company (RevIL AB, the smallest):
1. Open Fortnox → Rapporter → Balansräkning → note 3-5 specific account balances
2. Run SQL: `SELECT account_number, amount FROM closing_balances WHERE ...`
3. Compare. Document exact values.
4. Open Fortnox → Rapporter → Resultaträkning → note 3-5 specific account amounts
5. Run SQL: `SELECT account_number, amount FROM period_results WHERE ...`
6. Compare. Document exact values.
7. Open Fortnox → Verifikationer → pick 2-3 specific vouchers → note amounts
8. Run SQL: `SELECT * FROM voucher_rows WHERE voucher_id = ...`
9. Compare. Document exact values.

**This is a one-time manual verification.** Once documented, it serves as proof
that the parser correctly interprets Fortnox SIE4 output. The automated tests
then protect against regressions.

---

## 9. Files Changed/Created

| File | Action | Description |
|------|--------|-------------|
| `.gitignore` | Create | Exclude node_modules, .env, dist, .DS_Store |
| `.env.example` | Create | Template for env vars |
| `package.json` | Edit | Add vitest, dotenv deps; add test script |
| `vitest.config.ts` | Create | Minimal vitest config |
| `src/types.ts` | Edit | Add account_type to accounts, dimensions array to voucher rows |
| `src/sie4-parser.ts` | Edit | Add #KTYP, multi-dim, RTRANS compat |
| `src/sie4-importer.ts` | Edit | Import account_type, update onConflict, handle rtrans_compat |
| `src/sie4-validator.ts` | Edit | Add 4 new checks (RES, PSALDO, objects, type flags) |
| `src/cli.ts` | Edit | Use env vars with dotenv |
| `supabase/migrations/00002_sie_hardening.sql` | Create | account_type, voucher unique, rtrans_compat |
| `src/__tests__/fixtures/test-minimal.se` | Create | Hand-built CP437 SIE4 test fixture |
| `src/__tests__/parser.test.ts` | Create | 17 parser unit tests |
| `src/__tests__/integration.test.ts` | Create | 8 integration tests |
| `docs/fortnox-crosscheck.md` | Create | Manual crosscheck procedure + results template |

---

## 10. Implementation Order

The order matters because later steps depend on earlier ones:

1. **Infrastructure** — .gitignore, env vars, vitest setup (unblocks everything)
2. **Schema migration** — 00002 with account_type, voucher constraint, rtrans_compat (unblocks importer changes)
3. **Types** — Update ParsedSIE4 interfaces (unblocks parser + importer)
4. **Test fixture** — Create the hand-built .se file (unblocks parser tests)
5. **Parser + parser tests** — Add #KTYP, multi-dim, RTRANS compat; write tests that prove it
6. **Importer updates** — account_type, new onConflict, rtrans_compat handling
7. **Validator expansion** — 4 new checks
8. **Integration tests** — Full pipeline tests against fixture + 3 real files
9. **Fortnox crosscheck document** — Manual verification procedure

---

## 11. Out of Scope

These are known limitations that we deliberately leave for later:

- **PSALDO per dimension** — Only aggregate PSALDO stored. Per-dimension PSALDO needs a schema redesign (junction table). Not needed for basic reporting.
- **#UNDERDIM support** — Sub-dimensions not parsed. No Fortnox files use them.
- **Multi-company in one DB** — Current architecture: one Supabase project per customer. No company_id FK needed yet.
- **AI validation agent** — The SIE PROMT.md suggests a Claude tool_use agent. Automated tests are more reliable and reproducible. Can add later if needed.
- **SIE4 export** — We only import. Export would be needed to validate against sietest.sie.se.
- **Fortnox API integration** — Phase 3 of the product roadmap.
