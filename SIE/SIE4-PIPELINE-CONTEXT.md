# SIE4 Import Pipeline — Complete Technical Context

> Everything an AI or developer with zero context needs to understand, run,
> test, and extend the SIE4-to-Supabase import pipeline.
>
> **Last verified:** 2026-03-30 (69/69 tests passing, all 3 Fortnox companies match to ore)
> **Branch:** `main`

---

## 1. What This Is

A CLI tool that reads Swedish SIE4 accounting files (exported from Fortnox or any Swedish accounting system), parses them, imports all data into a local Supabase PostgreSQL database, and validates the result. The pipeline:

```
.se file (CP437) -> Parser -> TypeScript objects -> Supabase upserts -> Validation (10 checks)
```

**Status:** Full SIE 4C spec compliance (version 2025-08-06). 47 unit tests + 6 integration tests + 16 Fortnox crosscheck tests = **69 tests, all passing**. All SIE4 post types parsed. Multi-dimension support. Per-object period balances. CRC-32 verification. Tested against 3 real Fortnox SIE4 exports. DB values verified against Fortnox PDF reports to the ore.

---

## 2. Project Structure

```
KEYHOLDER/
+-- package.json              # ESM project: tsx, vitest, supabase-js, iconv-lite
+-- tsconfig.json             # TypeScript strict config
+-- vitest.config.ts          # Test runner (30s timeout, src/**/*.test.ts, loads .env via Vite loadEnv)
+-- .gitignore                # node_modules, dist, .env, .DS_Store, *.log
+-- .env                      # SUPABASE_URL + SUPABASE_SERVICE_KEY (gitignored, must create locally)
+-- .env.example              # Template for .env
+-- supabase/
|   +-- config.toml           # Local Supabase config
|   +-- migrations/
|       +-- 00001_sie_schema.sql       # 12-table core schema
|       +-- 00002_sie_hardening.sql    # account_type + year-scoped voucher uniqueness
|       +-- 00003_rename_columns.sql   # quarter->quantity, name->sign
|       +-- 00004_voucher_row_transdat.sql  # transaction_date on voucher_rows
|       +-- 00005_voucher_row_objects.sql   # Multi-dim junction table
|       +-- 00006_period_balance_dimensions.sql  # PSALDO per-object dims
|       +-- 00007_company_metadata.sql      # Optional metadata columns
|       +-- 00008_dimension_hierarchy.sql   # #UNDERDIM parent_dimension
|       +-- 00009_object_level_balances.sql # #OIB/#OUB dimension columns
|       +-- 00010_period_budgets.sql        # #PBUDGET table
+-- src/
|   +-- types.ts              # ParsedSIE4, ImportResult, ValidationReport
|   +-- sie4-parser.ts        # CP437 decoding + line-by-line parser (all SIE4 tags)
|   +-- sie4-importer.ts      # FK-ordered upserts into Supabase
|   +-- sie4-validator.ts     # 10 validation checks (parsed vs DB)
|   +-- cli.ts                # Entry point: read -> parse -> import -> validate
|   +-- __tests__/
|       +-- test-fixture.ts           # Hand-built SIE4 CP437 buffer with all tag types
|       +-- parser.test.ts            # 47 parser unit tests (no DB needed)
|       +-- integration.test.ts       # 6 integration tests (needs local Supabase)
|       +-- fortnox-crosscheck.test.ts # 16 tests: DB values vs Fortnox PDF reports
+-- SIE/
|   +-- RevILAB20260330_165333.se                                     # Test file 1 (small: 406 vouchers)
|   +-- SkataSwedenAB20260330_170222.se                               # Test file 2 (medium: 66 vouchers)
|   +-- ByggnadsställningsentreprenadiStockholmAB20260330_170428.se   # Test file 3 (large: 4,434 vouchers)
|   +-- SIE-STANDARD-CONTEXT.md    # SIE format reference (types 1-4, encoding, parsing rules)
|   +-- SIE4-PIPELINE-CONTEXT.md   # This file
|   +-- CLAUDE.md                  # Directory overview for AI context
|   +-- SIE1-4/                    # SIE 4C spec PDF + sample files
|   +-- SIE5/                      # SIE 5 spec (XML, future reference, not implemented)
|   +-- FORTNOX-CORRECT-DATA/      # Fortnox PDF reports for crosscheck verification
|   +-- BYGG-VALIDATION-MATERIALL/ # Additional validation material
+-- docs/
    +-- fortnox-crosscheck.md # Manual verification template (DB vs Fortnox UI)
```

---

## 3. How to Run

### Prerequisites
- Node.js 18+
- Docker (for local Supabase)
- Dependencies: `npm install`
- Local Supabase: `npx supabase start` (from project root)

### Create .env file
The `.env` file is gitignored and must be created locally. Get the service role key from Supabase:
```bash
npx supabase status -o json   # Find SERVICE_ROLE_KEY in the JSON output
```

Create `.env`:
```
SUPABASE_URL=http://127.0.0.1:54421
SUPABASE_SERVICE_KEY=<the SERVICE_ROLE_KEY JWT from above>
```

**IMPORTANT:** Without `.env`, vitest will run but **skip all 22 DB tests** (integration + crosscheck) silently. Only the 47 parser unit tests will run. If you see "22 skipped" in test output, `.env` is missing or has wrong values.

### Apply database migrations
```bash
npx supabase db reset
# Applies all 10 migrations (00001-00010)
```

### Import a SIE file
```bash
npx tsx src/cli.ts SIE/RevILAB20260330_165333.se
```

### Run tests
```bash
npm test              # All 69 tests (parser + integration + crosscheck)
npm run test:watch    # Watch mode
```

### Expected test output (when everything works)
```
 Test Files  3 passed (3)
      Tests  69 passed (69)
```

If you see `22 skipped` or `2 skipped (3)`, the DB tests are not running. Check:
1. Is Docker running? (`docker info`)
2. Is Supabase running? (`npx supabase status`)
3. Does `.env` exist with correct `SUPABASE_SERVICE_KEY`?
4. Have migrations been applied? (`npx supabase db reset`)

---

## 4. Database Schema (14 tables, 10 migrations)

All tables use UUID PKs, natural key UNIQUE constraints for upserts, and RLS with `authenticated_read` policy.

### Table overview with insert order (follows FK dependencies)

| # | Table | Unique key | Migration | Notes |
|---|-------|-----------|-----------|-------|
| 1 | `company_info` | `org_number` | 00001 + 00007 | Company metadata. 00007 added: sni_code, company_type, comment, tax_year, currency |
| 2 | `financial_years` | `year_index` | 00001 | 0 = current, -1 = previous |
| 3 | `dimensions` | `dimension_number` | 00001 + 00008 | Cost center types. 00008 added `parent_dimension` for #UNDERDIM |
| 4 | `objects` | `(dimension_number, object_number)` | 00001 | FK -> dimensions |
| 5 | `accounts` | `account_number` | 00001 + 00002 + 00007 | 4-digit BAS chart. 00002 added `account_type` CHECK (T/S/K/I). 00007 added `quantity_unit` |
| 6 | `sru_codes` | `account_number` | 00001 | Tax reporting codes, FK -> accounts |
| 7 | `opening_balances` | `(financial_year_id, account_number, dimension_number, object_number)` | 00001 + 00003 + 00009 | #IB (aggregate: dim=NULL) + #OIB (per-object: dim set). 00003 renamed quarter->quantity. 00009 added dimension columns + updated UNIQUE |
| 8 | `closing_balances` | `(financial_year_id, account_number, dimension_number, object_number)` | 00001 + 00003 + 00009 | #UB + #OUB. Same evolution as opening_balances |
| 9 | `period_results` | `(financial_year_id, account_number)` | 00001 | #RES per account per year |
| 10 | `period_balances` | `(financial_year_id, account_number, period, dimension_number, object_number)` | 00001 + 00003 + 00006 | #PSALDO. 00003 renamed quarter->quantity. 00006 added dimension columns + updated UNIQUE |
| 11 | `period_budgets` | `(financial_year_id, account_number, period, dimension_number, object_number)` | 00010 | #PBUDGET. Same structure as period_balances |
| 12 | `vouchers` | `(series, voucher_number, financial_year_id)` | 00001 + 00002 | Journal entries. 00002 made unique constraint year-scoped |
| 13 | `voucher_rows` | none (delete + re-insert) | 00001 + 00003 + 00004 | Debit/credit lines. 00003 renamed quarter->quantity and name->sign. 00004 added transaction_date. Has transaction_type CHECK ('normal','btrans','rtrans'). CASCADE from vouchers |
| 14 | `voucher_row_objects` | `(voucher_row_id, dimension_number)` | 00005 | Multi-dim junction table. CASCADE from voucher_rows |

### Migration history summary

| Migration | What it does |
|-----------|-------------|
| **00001** | Core 12-table schema, indexes, RLS policies |
| **00002** | `account_type` CHECK constraint + year-scoped voucher uniqueness |
| **00003** | Renames: `quarter`->`quantity` (4 tables), `name`->`sign` (voucher_rows) |
| **00004** | Adds `transaction_date date` to voucher_rows |
| **00005** | Creates `voucher_row_objects` junction table for multi-dim TRANS rows |
| **00006** | Adds `dimension_number`, `object_number` to period_balances; updates UNIQUE |
| **00007** | Adds 5 metadata columns to company_info + `quantity_unit` to accounts |
| **00008** | Adds `parent_dimension integer` to dimensions (#UNDERDIM hierarchy) |
| **00009** | Adds `dimension_number`, `object_number` to opening/closing_balances; updates UNIQUEs |
| **00010** | Creates `period_budgets` table (#PBUDGET) |

### Next migration number: 00011

---

## 5. Parser (`src/sie4-parser.ts`)

**Input:** Raw Buffer (CP437-encoded SIE4 file)
**Output:** `ParsedSIE4` object (see `src/types.ts`)

### Encoding
SIE4 files are **CP437** (IBM PC codepage). The parser uses `iconv-lite` to decode the raw Buffer, then strips `\r` and splits on `\n`.

### Field parsing (`parseFields`)
Three token types:
- **Unquoted:** `#KONTO 1930`
- **Quoted:** `"Levfakt Dariusz Brozek \"BMS\""` — supports `\"` escape
- **Dimension blocks:** `{6 "P1040"}` or `{}` (empty) or `{1 "100" 6 "P100"}` (multi-dim)

### All SIE4 tags parsed

**Identification posts:**

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
| `#BKOD` | `meta.sni_code` | SNI industry classification code |
| `#FTYP` | `meta.company_type` | Company form: AB, HB, E, EK, etc. |
| `#PROSA` | `meta.comment` | Free text comment about the file |
| `#TAXAR` | `meta.tax_year` | Tax year the SRU codes apply to |
| `#VALUTA` | `meta.currency` | ISO 4217 currency code (default: SEK) |

**Chart of accounts:**

| Tag | Maps to | Notes |
|-----|---------|-------|
| `#KONTO` | `accounts[]` | account_number, name, account_type (null initially) |
| `#KTYP` | merged into accounts | T/S/K/I. Collected into Map, merged after main loop |
| `#ENHET` | merged into accounts | quantity_unit per account. Same collect-then-merge pattern |
| `#SRU` | `sru_codes[]` | account_number -> sru_code |

**Dimensions:**

| Tag | Maps to | Notes |
|-----|---------|-------|
| `#DIM` | `dimensions[]` | dimension_number, name, parent_dimension=null |
| `#UNDERDIM` | `dimensions[]` | dimension_number, name, parent_dimension set |
| `#OBJEKT` | `objects[]` | dimension_number, object_number, name |

**Balances:**

| Tag | Maps to | Notes |
|-----|---------|-------|
| `#IB` | `opening_balances[]` | Aggregate (no dim). year_index, account, amount, quantity |
| `#OIB` | `opening_balances[]` | Per-object. Same fields + dimension_number, object_number |
| `#UB` | `closing_balances[]` | Aggregate |
| `#OUB` | `closing_balances[]` | Per-object |
| `#RES` | `period_results[]` | year_index, account, amount |
| `#PSALDO` | `period_balances[]` | ALL entries stored (aggregate + per-object) |
| `#PBUDGET` | `period_budgets[]` | Period budget. Same structure as PSALDO |

**Vouchers:**

| Tag | Maps to | Notes |
|-----|---------|-------|
| `#VER` | `vouchers[]` | Series, number, date, description, registration_date |
| `#TRANS` | voucher row (`normal`) | Full multi-dim support. Stores transaction_date |
| `#BTRANS` | voucher row (`btrans`) | Supplementary "beginning balance" row |
| `#RTRANS` | voucher row (`rtrans`) | Supplementary "result balance" row |

**Integrity:**

| Tag | Maps to | Notes |
|-----|---------|-------|
| `#KSUMMA` | `crc_verified` | CRC-32 checksum. First occurrence starts accumulation, second verifies. Mismatch -> warning in parse_errors (not fatal) |

### Multi-dimension handling (TRANS rows)

The parser has two functions:
- `parseDimension(field)` — returns first dim/object pair (used for balance tags: IB, UB, OIB, OUB, PSALDO, PBUDGET)
- `parseDimensions(field)` — returns ALL pairs as an array (used for TRANS/BTRANS/RTRANS rows)

Each voucher row stores:
- `dim_number` / `object_number` — first pair (backward compatibility)
- `dimensions[]` — full array of `{ dim_number, object_number }` pairs

The importer writes ALL pairs to the `voucher_row_objects` junction table.

### #KTYP / #ENHET merge pattern
Both `#KTYP` and `#ENHET` lines are collected into `Map<number, string>` during parsing. After the main loop, they're merged into the accounts array by matching `account_number`. This pattern exists because #KONTO may appear before or after #KTYP/#ENHET in the file.

### TRANS field order
```
#TRANS account {dimension} amount transdate transtext quantity sign
         [1]     [2]       [3]     [4]       [5]      [6]    [7]
```
- `transdate` (field[4]) -> `transaction_date` (null if empty)
- `transtext` (field[5]) -> `description`
- `quantity` (field[6]) -> `quantity`
- `sign` (field[7]) -> `sign` (person who created the entry)

### CRC-32 (#KSUMMA)
Per SIE spec S10. Uses CRC-32 with polynomial `0xEDB88320`, pre/post-conditioned with `0xFFFFFFFF`. The CRC computation:
- Includes tag names and field content (on CP437 byte values)
- Excludes whitespace between fields, quote delimiters, and braces
- Escaped quotes within fields count as the quote character
- Result: `crc_verified` is `null` (no #KSUMMA), `true` (match), or `false` (mismatch with warning)

### Edge cases handled
- **Escaped quotes** in descriptions: `\"BMS\"` inside quoted strings
- **Multi-dimension blocks:** `{1 "100" 6 "P100"}` — all pairs stored
- **Empty dimension blocks:** `{}` -> dim_number: null, object_number: null
- **Missing accounts:** Referenced in IB/UB/RES/TRANS but not in #KONTO -> auto-created by importer
- **Invalid registration dates:** Set to null if not YYYY-MM-DD
- **Unknown tags:** Silently skipped (per spec S7.1)

### Date formatting
Raw SIE `YYYYMMDD` -> `YYYY-MM-DD` for PostgreSQL.

---

## 6. Importer (`src/sie4-importer.ts`)

### Connection
Uses Supabase JS client with **service role key** (bypasses RLS). Credentials from `process.env`.

### Import order
Follows FK dependency chain (14 steps):
1. company_info -> 2. financial_years -> 3. dimensions -> 4. objects -> 5. accounts -> 6. sru_codes -> 7. opening_balances -> 8. closing_balances -> 9. period_results -> 10. period_balances -> 11. period_budgets -> 12. vouchers -> 13. voucher_rows -> 14. voucher_row_objects

### Idempotency
- Tables 1-12: **upsert** with `onConflict` targeting natural key constraints
- Voucher_rows: **delete all existing rows** for matched voucher IDs (CASCADE also deletes voucher_row_objects), then **insert fresh**
- Voucher_row_objects: inserted after voucher_rows using returned IDs

### Batching
- **Upserts:** 500 rows per batch (`BATCH_SIZE`)
- **Voucher row deletes:** 50 voucher IDs per `.in()` filter (URI length limit)
- **Voucher ID lookups:** Paginated at 1000 rows per page

### Voucher row -> junction table flow
1. Insert voucher_rows in batches using `.insert().select('id')` to get back row IDs
2. For each inserted row, check if it has multi-dim data (from `rowDimensions` array tracked in parallel)
3. Bulk-insert all `voucher_row_objects` entries

### Financial year mapping
1. Parser stores `year_index` (0, -1, etc.)
2. After inserting financial_years, importer builds `year_index -> UUID` map (`fyMap`)
3. All FK references use UUIDs
4. Vouchers mapped to financial years by checking if `voucher.date` falls within `fy.start_date`..`fy.end_date` (function `findFinancialYear`)

### Auto-created accounts
The importer scans all balance/voucher data for account references not present in the parsed `accounts[]` array. These are created as `Account ${number}` with null type and null quantity_unit. This handles SIE files where #IB/#UB/#TRANS reference accounts not defined by #KONTO.

---

## 7. Validator (`src/sie4-validator.ts`)

10 checks comparing parsed data against the database:

| # | Check | What it verifies |
|---|-------|------------------|
| 1 | Account count | DB has >= parsed accounts (allows auto-created extras) |
| 2 | Voucher count per series | Exact match per series (A, B, C, D, ...) |
| 3 | Voucher row count | Total rows match (all types: normal + btrans + rtrans) |
| 4 | Opening balances (IB) | Amount match for year_index=0, **aggregate only** (dim=NULL). Tolerance: 0.005 |
| 5 | Closing balances (UB) | Amount match for year_index=0, **aggregate only**. Tolerance: 0.005 |
| 6 | Voucher balance | Every voucher's **normal** TRANS rows sum to 0 (BTRANS/RTRANS excluded) |
| 7 | Period results (RES) | Amount match per (year_index, account_number) |
| 8 | Period balances (PSALDO) | Amount match per (year_index, period, account_number, dimension_number, object_number) |
| 9 | Object count | Exact match |
| 10 | BTRANS/RTRANS type flags | Exact count match for each transaction_type |

**Important notes on validation scope:**
- Checks 4-5 only verify **aggregate** balances (dimension_number = NULL). Object-level balances (#OIB/#OUB) are imported but not separately validated.
- Check 8 **does** include dimension-tagged PSALDO entries — the key includes dimension_number and object_number.
- **Not validated:** period_budgets (#PBUDGET data), dimension hierarchy (parent_dimension), company metadata fields.

### Pagination
Uses `fetchAll()` helper that paginates Supabase queries at 1000 rows/page.

---

## 8. Test Suite

### How .env loading works
`vitest.config.ts` uses Vite's `loadEnv()` to inject `.env` variables into `process.env` before tests run. Without this, the top-level `await` in test files that checks Supabase connectivity would run before env vars are available, causing all DB tests to be skipped silently.

### Parser unit tests (`src/__tests__/parser.test.ts`) — 47 tests

Uses a hand-built SIE4 CP437 fixture (`test-fixture.ts`). Tests cover:

**Core tests:**
- #KTYP account types (T, S, K, I)
- Metadata (company name, org number, all address fields, format, sietyp, flagga)
- Financial years (current + previous)
- Accounts (count + names)
- Dimensions and objects
- SRU codes
- Opening balances (amounts correct)
- Closing balances (amounts correct)
- Period results (RES amounts)
- Period balances (PSALDO)
- Vouchers (4 vouchers: simple, with dimension, with BTRANS/RTRANS, multi-dim)
- Escaped quotes in descriptions
- All vouchers balanced (TRANS rows sum to 0)
- Total voucher row count (11)

**Spec compliance tests:**
- #BKOD, #FTYP, #PROSA, #TAXAR, #VALUTA metadata parsing
- #ENHET quantity unit on accounts
- #UNDERDIM with parent_dimension (hierarchical dimensions)
- #OIB / #OUB object-level opening/closing balances
- #PSALDO per-object entries (aggregate + dimension-tagged)
- #PBUDGET period budget
- #TRANS transdat (individual transaction date)
- Multi-dim `{1 "100" 6 "P100"}` -> `dimensions[]` array with both pairs
- Single-dim in dimensions array
- Empty dim -> empty dimensions array
- #KSUMMA CRC-32 mismatch detection

### Integration tests (`src/__tests__/integration.test.ts`) — 6 tests

Requires local Supabase running with all migrations applied. Automatically skipped if Supabase unavailable (checks connectivity at file load via top-level await).

| Test | What it does |
|------|-------------|
| Fixture pipeline | Import test fixture -> all 10 validation checks pass |
| Idempotency | Import twice -> same stats, all checks pass |
| Account_type | Import fixture -> verify account_type column values in DB |
| RevIL AB (small) | 406 vouchers -> all checks pass |
| Skata Sweden AB (medium) | 66 vouchers -> all checks pass |
| Byggnadsställningsentreprenad (large) | 4,434 vouchers -> all checks pass |

**Note:** The `truncateAll()` function deletes from all 14 tables in reverse FK order before each test. It uses `.delete().not('id', 'is', null)` to delete all rows.

### Test fixture (`src/__tests__/test-fixture.ts`)
A `createTestSIE4Buffer()` function that builds a CP437-encoded SIE4 buffer with:
- Company "Test AB" (org 559988-7766)
- 2 financial years (2025 + 2024)
- 5 accounts with KTYP: 1510=T, 1930=T, 2640=S, 3001=I, 5420=K
- #ENHET 5420 "st"
- 1 SRU, 3 dimensions (incl. 1 UNDERDIM), 2 objects
- 3 IB + 1 OIB, 3 UB + 1 OUB, 2 RES
- 4 PSALDO (2 aggregate + 2 per-object)
- 1 PBUDGET
- Optional metadata: #BKOD 62010, #FTYP AB, #PROSA, #TAXAR 2026, #VALUTA SEK
- 4 vouchers (A-1, A-2, B-1, A-3) with 11 total rows
- Edge cases: dimension on row, BTRANS/RTRANS with sign field, escaped quotes, multi-dim block, transdat on TRANS

### Fortnox crosscheck tests (`src/__tests__/fortnox-crosscheck.test.ts`) — 16 tests

Proves parser-to-SOURCE accuracy by comparing DB values against hardcoded numbers from real Fortnox Balansrapport and Resultatrapport PDFs (in `SIE/FORTNOX-CORRECT-DATA/`).

**Sign convention (CRITICAL for report building):**
- **Balansrapport (IB/UB):** DB values match Fortnox directly. No sign flip needed.
- **Resultatrapport (RES):** Fortnox negates all amounts for display (income shows positive, costs show negative). DB stores raw SIE values (income = negative credit, costs = positive debit). Formula: `DB value = -1 x Fortnox displayed value`

**What each company tests:**

| Company | # Tests | Key assertions |
|---------|---------|----------------|
| RevIL AB | 6 | 27 UB accounts exact, 4 IB accounts, SUMMA TILLGANGAR = 3,952,190.47, 9 RES accounts, BERAKNAT RESULTAT = 869,954.78 (both from UB and RES) |
| Skata Sweden AB | 4 | SUMMA TILLGANGAR = 430,607.53, 7 UB accounts, 5 RES accounts, BERAKNAT RESULTAT = 58,795.82 |
| Byggnadsst. | 4 | SUMMA TILLGANGAR = 20,646,658.73, 8 UB accounts, 7 RES accounts, BERAKNAT RESULTAT = 2,886,185.09 |

All values match to ore precision (< 0.01 SEK tolerance, some large companies use < 0.02 for rounding).

---

## 9. TypeScript Types (`src/types.ts`)

Three main interfaces:

### `ParsedSIE4`
The parser's output. Contains:
- `meta` — all identification fields (company name, org number, address, etc.) + optional metadata (sni_code, company_type, comment, tax_year, currency)
- `financial_years[]` — year_index, start_date, end_date
- `accounts[]` — account_number, name, account_type (T/S/K/I/null), quantity_unit
- `sru_codes[]` — account_number, sru_code
- `dimensions[]` — dimension_number, name, parent_dimension (null for regular, set for UNDERDIM)
- `objects[]` — dimension_number, object_number, name
- `opening_balances[]` — year_index, account_number, amount, quantity, dimension_number, object_number
- `closing_balances[]` — same structure as opening_balances
- `period_results[]` — year_index, account_number, amount
- `period_balances[]` — year_index, period, account_number, amount, quantity, dimension_number, object_number
- `period_budgets[]` — same structure as period_balances
- `vouchers[]` — series, voucher_number, date, description, registration_date, rows[]
  - Each row: type ('normal'|'btrans'|'rtrans'), account_number, dim_number, object_number, dimensions[] (all pairs), amount, description, transaction_date, quantity, sign
- `parse_errors[]` — line_number, line, error
- `crc_verified` — null | true | false

### `ImportResult`
- `success` — boolean
- `stats` — row counts for all 14 tables
- `parse_errors[]` — from parser
- `import_errors[]` — stage + error message
- `duration_ms` — import time

### `ValidationReport`
- `passed` — boolean (all checks pass)
- `checks[]` — name, status ('pass'|'fail'), expected, actual, details?

---

## 10. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@supabase/supabase-js` | ^2.49.0 | Supabase client for PostgreSQL operations |
| `iconv-lite` | ^0.6.3 | CP437 -> UTF-8 decoding |
| `tsx` | ^4.19.0 | TypeScript execution without compilation (dev) |
| `typescript` | ^5.7.0 | Type checking (dev) |
| `vitest` | ^4.1.2 | Test runner (dev) |

---

## 11. Known Limitations & Gaps

### Design limitations
1. **Single-company design** — No tenant/company FK. Each customer is expected to have their own Supabase project. For multi-company, add `company_id` FK everywhere.
2. **No streaming parser** — Entire file read into memory. Fine for SIE4 files (<10MB).
3. **BTRANS/RTRANS stored as-is** — They have `transaction_type` set but no higher-level interpretation.
4. **CRC-32 verification is best-effort** — Edge cases with nested escaped quotes may differ from other implementations. Mismatches generate warnings, not rejections.
5. **Pre-existing TypeScript strict errors** — The validator has `tsc --noEmit` errors related to `unknown` type assertions from Supabase query results. These don't affect runtime (vitest doesn't enforce strict TS).

### Validation gaps (things imported but not verified)
- **Object-level balances** (#OIB/#OUB) — imported to DB but validator checks 4-5 only verify aggregate (dim=NULL)
- **Period budgets** (#PBUDGET) — imported but no validation check exists
- **Dimension hierarchy** (parent_dimension) — imported but not validated
- **Company metadata** (sni_code, company_type, etc.) — imported but not validated
- **voucher_row_objects** (multi-dim junction data) — imported but no specific integration test for this table

### Schema gap
- **period_budgets table** (migration 00010) is missing a foreign key constraint on `account_number -> accounts(account_number)`. All other balance/result tables have this FK implicitly through the core schema. This doesn't cause runtime issues (the importer creates missing accounts first) but is a data integrity gap.

---

## 12. What to Do Next

### Likely next features (based on KEYHOLDER's Fortnox-mirroring goal)
1. **Report SQL views** — Balansrapport + Resultatrapport views (see `NEXT-TASK-REPORTS.md` for spec). Next migration = `00011_*.sql`
2. **Supabase Edge Function** — Accept SIE4 file upload, run parser + importer server-side
3. **Generate TypeScript types** — `npx supabase gen types typescript` for type-safe frontend queries
4. **Fortnox API integration** — Pull SIE4 exports programmatically instead of manual file upload
5. **Multi-company support** — Add company_id FK if moving away from one-project-per-customer
6. **SIE5 support** — XML-based format, spec in `SIE/SIE5/`. Not widely adopted yet

### Schema evolution
New migrations: `supabase/migrations/00011_*.sql` etc. Apply with `npx supabase db reset` (full reset) or `npx supabase migration up` (incremental).

---

## 13. Fortnox Report Reference (for building report views)

The crosscheck tests prove these exact values. Any report view must produce numbers matching these:

### How to compute report values from DB tables

**Balansrapport (Balance Sheet):**
- `Ing balans` (opening balance) = `opening_balances` WHERE year_index=0 AND dimension_number IS NULL
- `Utg balans` (closing balance) = `closing_balances` WHERE year_index=0 AND dimension_number IS NULL
- `Period` (change during year) = Utg balans - Ing balans
- `SUMMA TILLGANGAR` = SUM(closing_balances) WHERE account 1000-1999
- `SUMMA EGET KAPITAL, AVSATTNINGAR OCH SKULDER` = SUM(closing_balances) WHERE account 2000-2999
- `BERAKNAT RESULTAT` = SUMMA TILLGANGAR + SUMMA EK/SKULDER (should equal negative sum of all RES)

**Resultatrapport (Income Statement):**
- Values come from `period_results` table
- **Sign flip required:** DB stores SIE convention (income = negative, costs = positive). Fortnox displays negated: `display_value = -1 * db_amount`
- `BERAKNAT RESULTAT` = -1 * SUM(all period_results amounts)

**Account range groupings (BAS standard):**
- 1000-1999: TILLGANGAR (Assets)
  - 1000-1399: Anlaggningstillgangar (Fixed assets)
  - 1400-1999: Omsattningstillgangar (Current assets)
- 2000-2999: EGET KAPITAL, AVSATTNINGAR OCH SKULDER
  - 2080-2099: Eget kapital (Equity)
  - 2100-2199: Obeskattade reserver (Untaxed reserves)
  - 2300-2399: Langfristiga skulder (Long-term liabilities)
  - 2400-2999: Kortfristiga skulder (Short-term liabilities)
- 3000-3999: Rorelsens intakter (Operating income)
- 4000-7999: Rorelsens kostnader (Operating costs)
- 8000-8999: Finansiella poster (Financial items)

---

## 14. SIE4 Format Quick Reference

- **Encoding:** CP437 (IBM PC codepage), not UTF-8
- **Line endings:** CRLF (`\r\n`)
- **Line format:** `#TAG field1 field2 ...`
- **Quoted strings:** `"..."` with `\"` escape
- **Dimension blocks:** `{dim_number "object_number"}` or `{}` or `{dim1 "obj1" dim2 "obj2"}` (multi)
- **VER blocks:** Multi-line `{ ... }` containing TRANS/BTRANS/RTRANS
- **Year indexing:** 0 = current financial year, -1 = previous
- **Account numbers:** 4-digit BAS standard (1xxx assets, 2xxx liabilities, 3xxx revenue, 4-7xxx costs, 8xxx financial)
- **Account types (#KTYP):** T = tillgang/asset, S = skuld/liability, K = kostnad/cost, I = intakt/income
- **Reserved dimension numbers:** 1=kostnadsstalle, 2=kostnadsbarare, 6=projekt, 7=anstalld, 8=kund, 9=leverantor, 10=faktura
- **Spec version:** SIE 4C (2025-08-06). Full PDF in `SIE/SIE1-4/SIE_filformat_ver_4C_2025-08-06.pdf`
- **Online validator:** https://sietest.sie.se/
