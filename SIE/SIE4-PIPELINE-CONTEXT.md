# SIE4 Import Pipeline — Complete Technical Context

> Everything an AI or developer with zero context needs to understand, run,
> test, and extend the SIE4-to-Supabase import pipeline.
>
> **Last updated:** 2026-03-30
> **Branch:** `main` (all work committed)

---

## 1. What This Is

A CLI tool that reads Swedish SIE4 accounting files (exported from Fortnox), parses them, imports all data into a local Supabase PostgreSQL database, and validates the result. The pipeline:

```
.se file (CP437) → Parser → TypeScript objects → Supabase upserts → Validation (10 checks)
```

**Status:** Fully working. 52 automated tests (30 unit + 6 integration + 16 Fortnox crosscheck). Tested against 3 real Fortnox SIE4 exports. All validation checks pass. DB values verified against Fortnox PDF reports to the öre. Idempotent re-imports confirmed.

---

## 2. Project Structure

```
KEYHOLDER/
├── package.json              # ESM project: tsx, vitest, supabase-js, iconv-lite
├── tsconfig.json             # TypeScript strict config
├── vitest.config.ts          # Test runner (30s timeout, src/**/*.test.ts only)
├── .gitignore                # node_modules, dist, .env, .DS_Store, *.log
├── .env.example              # SUPABASE_URL + SUPABASE_SERVICE_KEY
├── supabase/
│   ├── config.toml           # Local Supabase config
│   └── migrations/
│       ├── 00001_sie_schema.sql       # 12-table schema
│       └── 00002_sie_hardening.sql    # account_type column + year-scoped voucher uniqueness
├── src/
│   ├── types.ts              # ParsedSIE4, ImportResult, ValidationReport
│   ├── sie4-parser.ts        # CP437 decoding + line-by-line parser (incl. #KTYP)
│   ├── sie4-importer.ts      # FK-ordered upserts into Supabase
│   ├── sie4-validator.ts     # 10 validation checks (parsed vs DB)
│   ├── cli.ts                # Entry point: read → parse → import → validate
│   └── __tests__/
│       ├── test-fixture.ts           # Hand-built SIE4 CP437 buffer with known values
│       ├── parser.test.ts            # 30 parser unit tests (no DB needed)
│       ├── integration.test.ts       # 6 integration tests (needs local Supabase)
│       └── fortnox-crosscheck.test.ts # 16 tests: DB values vs Fortnox PDF reports
├── SIE/
│   ├── RevILAB20260330_165333.se                                     # Test file 1 (small: 406 vouchers)
│   ├── SkataSwedenAB20260330_170222.se                               # Test file 2 (medium: 66 vouchers)
│   └── ByggnadsställningsentreprenadiStockholmAB20260330_170428.se   # Test file 3 (large: 4,434 vouchers)
└── docs/
    └── fortnox-crosscheck.md # Manual verification template (DB vs Fortnox UI)
```

---

## 3. How to Run

### Prerequisites
- Node.js 18+
- Docker (for local Supabase)
- Dependencies: `npm install`
- Local Supabase: `npx supabase start` (from project root)

### Apply database migrations
```bash
npx supabase db reset
# Applies 00001_sie_schema.sql + 00002_sie_hardening.sql
# Note: may show transient 502 error during container restart — safe to ignore if migrations applied
```

### Import a SIE file
```bash
npx tsx src/cli.ts SIE/RevILAB20260330_165333.se
```

### Run tests
```bash
npm test              # All tests (parser + integration)
npm run test:watch    # Watch mode
```

### Environment variables (optional)
The CLI uses env var fallback — if not set, defaults to local Supabase:
```
SUPABASE_URL=http://127.0.0.1:54421
SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY
```

---

## 4. Database Schema

### Migration 1: `00001_sie_schema.sql` — 12 tables

All tables use UUID primary keys, natural key UNIQUE constraints for upserts, and RLS with `authenticated_read` policy.

**Insert order (follows FK dependencies):**

| # | Table | Unique key | Notes |
|---|-------|-----------|-------|
| 1 | `company_info` | `org_number` | Company metadata |
| 2 | `financial_years` | `year_index` | 0 = current, -1 = previous |
| 3 | `dimensions` | `dimension_number` | Cost center types |
| 4 | `objects` | `(dimension_number, object_number)` | FK → dimensions |
| 5 | `accounts` | `account_number` | 4-digit BAS standard chart |
| 6 | `sru_codes` | `account_number` | Tax reporting codes, FK → accounts |
| 7 | `opening_balances` | `(financial_year_id, account_number)` | IB per account per year |
| 8 | `closing_balances` | `(financial_year_id, account_number)` | UB per account per year |
| 9 | `period_results` | `(financial_year_id, account_number)` | RES per account per year |
| 10 | `period_balances` | `(financial_year_id, account_number, period)` | PSALDO per account per month |
| 11 | `vouchers` | `(series, voucher_number, financial_year_id)` | Journal entries |
| 12 | `voucher_rows` | none (delete + re-insert) | Debit/credit lines, ON DELETE CASCADE from vouchers |

`voucher_rows.transaction_type` CHECK constraint: `'normal'`, `'btrans'`, `'rtrans'`.

### Migration 2: `00002_sie_hardening.sql`

Two changes:
1. **`accounts.account_type`** — new column with CHECK `('T', 'S', 'K', 'I')` for asset/liability/cost/income. Populated from `#KTYP` tags.
2. **Year-scoped voucher uniqueness** — changed from `UNIQUE(series, voucher_number)` to `UNIQUE(series, voucher_number, financial_year_id)`. Prevents voucher A-1 in 2024 from being overwritten by A-1 in 2025.

---

## 5. Parser (`src/sie4-parser.ts`)

### Encoding
SIE4 files are **CP437** (IBM PC codepage). The parser uses `iconv-lite` to decode the raw Buffer, then strips `\r` and splits on `\n`.

### Field parsing (`parseFields`)
Three token types:
- **Unquoted:** `#KONTO 1930`
- **Quoted:** `"Levfakt Dariusz Brozek \"BMS\""` — supports `\"` escape
- **Dimension blocks:** `{6 "P1040"}` or `{}` (empty) or `{1 "100" 6 "P100"}` (multi-dim, takes first pair)

### SIE tags parsed

| Tag | Maps to | Notes |
|-----|---------|-------|
| `#FLAGGA` | `meta.flagga` | Always 0 for export |
| `#FORMAT` | `meta.format` | "PC8" = CP437 |
| `#SIETYP` | `meta.sietyp` | 4 = SIE type 4 |
| `#PROGRAM` | `meta.program` | e.g. "Fortnox" |
| `#GEN` | `meta.generated` | Export generation date |
| `#FNR` | `meta.fortnox_number` | Fortnox customer number |
| `#FNAMN` | `meta.company_name` | Company name |
| `#ORGNR` | `meta.org_number` | Swedish org number (XXXXXX-XXXX) |
| `#ADRESS` | `meta.address` | 4 fields: contact, street, postal, phone |
| `#OMFATTN` | `meta.balance_date` | Balance sheet date |
| `#KPTYP` | `meta.account_plan_type` | "BAS2024", "EUBAS97" etc. |
| `#RAR` | `financial_years[]` | year_index, start_date, end_date |
| `#KONTO` | `accounts[]` | account_number, name, account_type (null initially) |
| `#KTYP` | merged into accounts | Collected separately, merged after parsing. T/S/K/I. |
| `#SRU` | `sru_codes[]` | account_number → sru_code |
| `#DIM` | `dimensions[]` | dimension_number, name |
| `#OBJEKT` | `objects[]` | dimension_number, object_number, name |
| `#IB` | `opening_balances[]` | year_index, account, amount, quarter |
| `#UB` | `closing_balances[]` | year_index, account, amount, quarter |
| `#RES` | `period_results[]` | year_index, account, amount |
| `#PSALDO` | `period_balances[]` | Only aggregate entries (empty `{}`). Dim-specific skipped. |
| `#VER` | `vouchers[]` | Series, number, date, description. Contains `{...}` block. |
| `#TRANS` | voucher row (`normal`) | The actual debit/credit entry |
| `#BTRANS` | voucher row (`btrans`) | Supplementary "beginning balance" row |
| `#RTRANS` | voucher row (`rtrans`) | Supplementary "result balance" row |

### #KTYP parsing flow
`#KTYP` lines are collected into a `Map<number, string>` during parsing. After the main loop, they're merged into the accounts array by matching `account_number`. Valid types: T (asset/tillgång), S (liability/skuld), K (cost/kostnad), I (income/intäkt).

### TRANS field order
```
#TRANS account {dimension} amount transdate transtext quantity sign
         [1]     [2]       [3]     [4]       [5]      [6]    [7]
```
- `transdate` (field[4]) — usually empty in Fortnox exports
- `transtext` (field[5]) → `description` in DB
- `quantity` (field[6]) → `quarter` in DB
- `sign` (field[7]) → `name` in DB (person who created the entry)

### Edge cases handled
- **Escaped quotes** in descriptions: `\"BMS\"` inside quoted strings
- **Multi-dimension blocks:** `{1 "100" 6 "P100"}` — takes first dim pair
- **Empty dimension blocks:** `{}` → dim_number: null, object_number: null
- **Missing accounts:** Referenced in IB/UB/RES/TRANS but not in #KONTO → auto-created by importer
- **PSALDO dimension duplicates:** Same (account, period) with `{}` and `{6 "obj"}` → only `{}` aggregate kept
- **Invalid registration dates:** Set to null if not YYYY-MM-DD
- **Unknown tags:** Silently skipped, no error

### Date formatting
Raw SIE `YYYYMMDD` → `YYYY-MM-DD` for PostgreSQL.

---

## 6. Importer (`src/sie4-importer.ts`)

### Connection
Uses Supabase JS client with **service role key** (bypasses RLS). Credentials from `process.env` with local Supabase fallback.

### Import order
Follows FK dependency chain: company_info → financial_years → dimensions → objects → accounts → sru_codes → opening_balances → closing_balances → period_results → period_balances → vouchers → voucher_rows.

### Idempotency
- Tables 1–11: **upsert** with `onConflict` targeting natural key constraints
- Voucher_rows: **delete all existing rows** for matched voucher IDs, then **insert fresh** (no natural unique key for rows)
- Voucher upsert conflict key: `series, voucher_number, financial_year_id` (year-scoped)

### Batching
- **Upserts:** 500 rows per batch
- **Voucher row deletes:** 50 voucher IDs per `.in()` filter (URI length limit)
- **Voucher ID lookups:** Paginated at 1000 rows per page

### Account_type upsert
The `accounts` upsert includes `account_type` from the parsed #KTYP data. Extra auto-created accounts get `account_type: null`.

### Financial year mapping
1. Parser stores `year_index` (0, -1)
2. After inserting financial_years, importer builds `year_index → UUID` map
3. All FK references use UUIDs
4. Vouchers are mapped to financial years by checking if `voucher.date` falls within `fy.start_date`..`fy.end_date`

### Voucher ID lookup (year-scoped)
After upserting vouchers, the importer selects `id, series, voucher_number, financial_year_id` and builds a map keyed by `"series:voucher_number:financial_year_id"`. This ensures correct matching when the same series+number exists across different financial years.

---

## 7. Validator (`src/sie4-validator.ts`)

10 checks comparing parsed data against the database:

| # | Check | What it verifies |
|---|-------|------------------|
| 1 | Account count | DB has >= parsed accounts (allows auto-created extras) |
| 2 | Voucher count per series | Exact match per series (A, B, C, D, ...) |
| 3 | Voucher row count | Total rows match (all types: normal + btrans + rtrans) |
| 4 | Opening balances (IB) | Amount match for year_index=0 accounts (tolerance: 0.005) |
| 5 | Closing balances (UB) | Amount match for year_index=0 accounts (tolerance: 0.005) |
| 6 | Voucher balance | Every voucher's **normal** TRANS rows sum to 0 (BTRANS/RTRANS excluded) |
| 7 | Period results (RES) | Amount match per (year_index, account_number) |
| 8 | Period balances (PSALDO) | Amount match per (year_index, period, account_number) |
| 9 | Object count | Exact match |
| 10 | BTRANS/RTRANS type flags | Exact count match for each transaction_type |

### Why only `normal` rows for balance check (#6)
`#BTRANS` and `#RTRANS` are supplementary metadata rows. Only `#TRANS` rows represent actual double-entry bookkeeping (debit = credit).

### Pagination
Uses `fetchAll()` helper that paginates Supabase queries at 1000 rows/page to avoid default limit truncation.

---

## 8. Test Suite

### Parser unit tests (`src/__tests__/parser.test.ts`) — 30 tests

Uses a hand-built SIE4 CP437 fixture (`test-fixture.ts`) with known values. Tests cover:
- #KTYP account types (T, S, K, I)
- Metadata (company name, org number, all address fields, format, sietyp, flagga)
- Financial years (current + previous)
- Accounts (count + names)
- Dimensions and objects
- SRU codes
- Opening balances (3 entries, amounts correct)
- Closing balances (3 entries, amounts correct)
- Period results (RES amounts)
- Period balances (PSALDO periods + amounts)
- Vouchers (4 vouchers: simple, with dimension, with BTRANS/RTRANS, multi-dim)
- Escaped quotes in descriptions
- All vouchers balanced (TRANS rows sum to 0)
- Total voucher row count (11)
- Edge cases: multi-dim takes first pair, empty dim → null, unknown tag doesn't crash

### Integration tests (`src/__tests__/integration.test.ts`) — 6 tests

Requires local Supabase running. Automatically skipped if unavailable.

| Test | What it does |
|------|-------------|
| Fixture pipeline | Import test fixture → all 10 validation checks pass |
| Idempotency | Import twice → same stats, all checks pass |
| Account_type | Import fixture → verify account_type column values in DB |
| RevIL AB (small) | 406 vouchers, 1,094 rows → all checks pass |
| Skata Sweden AB (medium) | 66 vouchers, 176 rows → all checks pass |
| Byggnadsställningsentreprenad (large) | 4,434 vouchers, 14,228 rows → all checks pass |

### Test fixture (`src/__tests__/test-fixture.ts`)
A `createTestSIE4Buffer()` function that builds a CP437-encoded SIE4 buffer with:
- Company "Test AB" (org 559988-7766)
- 2 financial years (2025 + 2024)
- 5 accounts with KTYP: 1510=T, 1930=T, 2640=S, 3001=I, 5420=K
- 1 SRU, 2 dimensions, 2 objects
- 3 IB, 3 UB, 2 RES, 2 PSALDO
- 4 vouchers (A-1, A-2, B-1, A-3) with 11 total rows
- Edge cases: dimension on row, BTRANS/RTRANS with name field, escaped quotes, multi-dim block

---

### Fortnox crosscheck tests (`src/__tests__/fortnox-crosscheck.test.ts`) — 16 tests

Proves parser-to-SOURCE accuracy by comparing DB values against hardcoded numbers
from real Fortnox Balansrapport and Resultatrapport PDFs (in `SIE/FORTNOX-CORRECT-DATA/`).

**Sign convention:**
- **Balansrapport (IB/UB):** DB values match Fortnox directly
- **Resultatrapport (RES):** Fortnox negates all amounts for display (income=positive, costs=negative). Our DB stores raw SIE values (debit=positive, credit=negative). So: `DB value = -1 × Fortnox value`

| Company | Tests | What's verified |
|---------|-------|----------------|
| RevIL AB | 6 | 27 UB accounts, 4 IB accounts, 9 RES accounts, SUMMA TILLGÅNGAR, 2× BERÄKNAT RESULTAT |
| Skata Sweden AB | 4 | 7 UB accounts, 5 RES accounts, SUMMA TILLGÅNGAR, 2× BERÄKNAT RESULTAT |
| Byggnadsställningsentreprenad | 4 | 8 UB accounts, 7 RES accounts, SUMMA TILLGÅNGAR, 2× BERÄKNAT RESULTAT |

All values match to öre precision (< 0.01 SEK tolerance).

---

## 9. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@supabase/supabase-js` | ^2.49.0 | Supabase client for PostgreSQL operations |
| `iconv-lite` | ^0.6.3 | CP437 → UTF-8 decoding |
| `tsx` | ^4.19.0 | TypeScript execution without compilation |
| `typescript` | ^5.7.0 | Type checking (dev) |
| `vitest` | ^4.1.2 | Test runner (dev) |

---

## 10. Known Limitations

1. **Single-company design** — No tenant/company FK. Each customer is expected to have their own Supabase project. For multi-company, add `company_id` FK everywhere.
2. **PSALDO dimension data discarded** — Only aggregate period balances (empty `{}`) stored. Per-object period balances skipped. To keep them, add `dim_number + object_number` to period_balances.
3. **No streaming parser** — Entire file read into memory. Fine for SIE4 files (<10MB), but could matter for extreme cases.
4. **BTRANS/RTRANS stored as-is** — They have `transaction_type` set but no higher-level interpretation.
5. **No `#UNDERDIM` support** — Sub-dimensions are not parsed.
6. **Multi-dim takes first pair** — `{1 "100" 6 "P100"}` stores only dim 1. A DB junction table would be needed for all pairs.

---

## 11. What to Do Next

### Fortnox crosscheck — DONE
Automated crosscheck tests (`src/__tests__/fortnox-crosscheck.test.ts`) verify DB values against hardcoded numbers from Fortnox PDF reports. All 3 companies verified to öre precision. Source PDFs in `SIE/FORTNOX-CORRECT-DATA/`.

### Likely next features (based on KEYHOLDER's Fortnox-mirroring goal)
1. **Supabase Edge Function** — Accept SIE4 file upload, run parser + importer server-side
2. **Generate TypeScript types** — `npx supabase gen types typescript` for type-safe frontend queries
3. **Reporting queries** — Trial balance (closing_balances), income statement (period_results 3000-8999), balance sheet (closing_balances 1000-2999)
4. **Fortnox API integration** — Pull SIE4 exports programmatically instead of manual file upload
5. **Multi-company support** — Add company_id FK if moving away from one-project-per-customer

### Schema evolution
New migrations: `supabase/migrations/00003_*.sql` etc. Apply with `npx supabase db reset` (full reset) or `npx supabase migration up` (incremental).

---

## 12. SIE4 Format Quick Reference

- **Encoding:** CP437 (IBM PC codepage), not UTF-8
- **Line endings:** CRLF (`\r\n`)
- **Line format:** `#TAG field1 field2 ...`
- **Quoted strings:** `"..."` with `\"` escape
- **Dimension blocks:** `{dim_number "object_number"}` or `{}`
- **VER blocks:** Multi-line `{ ... }` containing TRANS/BTRANS/RTRANS
- **Year indexing:** 0 = current financial year, -1 = previous
- **Account numbers:** 4-digit BAS standard (1xxx assets, 2xxx liabilities, 3xxx revenue, 4-7xxx costs, 8xxx financial)
- **Account types (#KTYP):** T = tillgång/asset, S = skuld/liability, K = kostnad/cost, I = intäkt/income
- **Full SIE standard reference:** See `SIE/SIE-STANDARD-CONTEXT.md`
