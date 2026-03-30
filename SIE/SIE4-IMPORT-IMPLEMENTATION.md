# SIE4 Import — Implementation Reference

> Complete technical documentation for the SIE4-to-Supabase import pipeline.
> Written so that an AI or developer with zero context can understand what exists, how it works, and what to do next.

---

## 1. What Was Built

A CLI tool that reads Swedish SIE4 accounting files (exported from Fortnox), parses them, imports all data into a local Supabase PostgreSQL database, and validates the result. The entire pipeline is:

```
.se file (CP437) → Parser → TypeScript objects → Supabase upserts → Validation
```

**Status as of 2026-03-30:** Fully working. Tested against 3 real Fortnox SIE4 exports. All validation checks pass. Idempotent re-imports confirmed.

**Branch:** `feature/sie4-import` (not yet merged to `main`)

---

## 2. Project Structure

```
KEYHOLDER/
├── package.json              # Node project config (ESM, tsx runner)
├── tsconfig.json             # TypeScript strict config
├── node_modules/             # Installed deps
├── supabase/
│   └── migrations/
│       └── 00001_sie_schema.sql   # 12-table schema
├── src/
│   ├── types.ts              # ParsedSIE4, ImportResult, ValidationReport
│   ├── sie4-parser.ts        # CP437 decoding + line-by-line parser
│   ├── sie4-importer.ts      # FK-ordered upserts into Supabase
│   ├── sie4-validator.ts     # 6 validation checks (parsed vs DB)
│   └── cli.ts                # Entry point: read → parse → import → validate
└── SIE/
    ├── RevILAB20260330_165333.se                              # Test file 1 (small)
    ├── SkataSwedenAB20260330_170222.se                        # Test file 2 (medium)
    └── ByggnadsställningsentreprenadiStockholmAB20260330_170428.se  # Test file 3 (large)
```

---

## 3. How to Run

### Prerequisites
- Node.js 18+
- Local Supabase running (`npx supabase start`)
- Dependencies installed (`npm install`)

### Apply the database migration
```bash
npx supabase db reset
# Wait ~10 seconds for containers to restart
```

### Import a SIE file
```bash
npx tsx src/cli.ts SIE/RevILAB20260330_165333.se
```

Or use the npm script:
```bash
npm run import -- SIE/RevILAB20260330_165333.se
```

### Expected output
The CLI prints a summary of parsed data, then a table-by-table import log, then a validation report. Example for the large file:

```
Company: Byggnadsställningsentreprenad i Stockholm AB
Accounts: 508 | Vouchers: 4434 | Voucher rows: 14228

✓ company_info (1 row)
✓ financial_years (2 rows)
✓ accounts (509 rows)
✓ vouchers (4,434 rows)
✓ voucher_rows (14,228 rows)
...
Validation Report: 19/19 checks passed
```

---

## 4. Database Schema (12 tables)

Located in `supabase/migrations/00001_sie_schema.sql`.

### Table dependency order (must insert in this order)
1. **company_info** — company metadata (org_number is the upsert key)
2. **financial_years** — fiscal year periods (year_index is the upsert key: 0 = current, -1 = previous)
3. **dimensions** — cost center dimensions (dimension_number)
4. **objects** — dimension objects/values (dimension_number + object_number)
5. **accounts** — chart of accounts (account_number, 4-digit BAS standard)
6. **sru_codes** — tax reporting codes per account
7. **opening_balances** — IB per account per financial year
8. **closing_balances** — UB per account per financial year
9. **period_results** — RES per account per financial year
10. **period_balances** — PSALDO per account per period per financial year
11. **vouchers** — journal entries (series + voucher_number is the upsert key)
12. **voucher_rows** — individual debit/credit lines within a voucher

### Key design decisions
- **UUID primary keys** everywhere, auto-generated
- **Natural key uniqueness** via UNIQUE constraints (used as onConflict targets for upserts)
- **financial_year_id** is a FK from year-dependent tables to financial_years — the parser uses `year_index` (0, -1) and the importer maps these to UUIDs after inserting financial_years
- **voucher_rows** has ON DELETE CASCADE from vouchers — the importer deletes + re-inserts rows for idempotency
- **RLS enabled** on all tables with `authenticated_read` policy — each customer gets their own Supabase project, so row-level tenant isolation is not needed
- **transaction_type** column on voucher_rows with CHECK constraint: `'normal'`, `'btrans'`, `'rtrans'`

---

## 5. Parser Details (`src/sie4-parser.ts`)

### Encoding
SIE4 files are encoded in **CP437** (IBM PC codepage). The parser uses `iconv-lite` to decode the raw Buffer into UTF-8 before processing.

### Field parsing (`parseFields` function)
SIE lines have space-separated fields with three types:
- **Unquoted tokens:** `#KONTO 1930 "Företagskonto"`
- **Quoted strings:** `"Levfakt Dariusz Brozek \"BMS\" (2025084)"` — supports `\"` escape sequences
- **Dimension blocks:** `{6 "P1040"}` or `{}` (empty)

### SIE tags handled
| Tag | Maps to | Notes |
|-----|---------|-------|
| `#FLAGGA` | meta.flagga | Always 0 for export |
| `#FORMAT` | meta.format | "PC8" = CP437 |
| `#SIETYP` | meta.sietyp | 4 = SIE4 |
| `#PROGRAM` | meta.program | "Fortnox" |
| `#GEN` | meta.generated | Date the export was generated |
| `#FNR` | meta.fortnox_number | Fortnox customer number |
| `#FNAMN` | meta.company_name | Company name |
| `#ORGNR` | meta.org_number | Swedish org number (XXXXXX-XXXX) |
| `#ADRESS` | meta.address | 4 fields: contact, street, postal, phone |
| `#OMFATTN` | meta.balance_date | Date range of the export |
| `#KPTYP` | meta.account_plan_type | "BAS2024" etc. |
| `#RAR` | financial_years[] | year_index, start_date, end_date |
| `#KONTO` | accounts[] | account_number, name |
| `#SRU` | sru_codes[] | account_number, sru_code |
| `#DIM` | dimensions[] | dimension_number, name |
| `#OBJEKT` | objects[] | dimension_number, object_number, name |
| `#IB` | opening_balances[] | year_index, account, amount, quarter |
| `#UB` | closing_balances[] | year_index, account, amount, quarter |
| `#RES` | period_results[] | year_index, account, amount |
| `#PSALDO` | period_balances[] | **Only aggregate entries (empty dimension `{}`)**. Dimension-specific PSALDO entries are skipped to avoid duplicates. |
| `#VER` | vouchers[] | Series, number, date, description. Contains `{...}` block with TRANS rows. |
| `#TRANS` | voucher row (normal) | The actual debit/credit entry |
| `#BTRANS` | voucher row (btrans) | Supplementary "beginning balance" info |
| `#RTRANS` | voucher row (rtrans) | Supplementary "result balance" info |

### TRANS field order
```
#TRANS account_number {dimension} amount transdate transtext quantity sign
```
- `transdate` (field[4]) — usually empty string in Fortnox exports
- `transtext` (field[5]) — transaction description, maps to `description` in DB
- `quantity` (field[6]) — maps to `quarter` column in DB
- `sign` (field[7]) — person name, maps to `name` column in DB

### Date formatting
Raw SIE dates are `YYYYMMDD` strings. The parser converts them to `YYYY-MM-DD` for PostgreSQL date columns.

### Edge cases handled
- **Escaped quotes** in descriptions: `\"BMS\"` inside quoted strings
- **Missing accounts**: Some SIE files reference accounts in #IB/#UB/#RES that are not listed in #KONTO (the importer auto-creates these)
- **PSALDO duplicates**: Same (account, period) appears with `{}` and with `{6 "obj"}` — only the `{}` aggregate is kept
- **Invalid registration dates** on vouchers — silently set to null

---

## 6. Importer Details (`src/sie4-importer.ts`)

### Connection
Uses the Supabase JS client with the **service role key** (bypasses RLS for writes). The key is hardcoded for local development:
```
URL:  http://127.0.0.1:54421
Key:  $SUPABASE_SERVICE_KEY
```

**This must be changed for production.** Use environment variables.

### Import order
Follows the FK dependency chain exactly:
1. company_info → 2. financial_years → 3. dimensions → 4. objects → 5. accounts → 6. sru_codes → 7. opening_balances → 8. closing_balances → 9. period_results → 10. period_balances → 11. vouchers → 12. voucher_rows

### Idempotency strategy
- Tables 1–11: **upsert** with `onConflict` targeting the natural key UNIQUE constraint
- Table 12 (voucher_rows): **delete all existing rows for the voucher, then insert fresh** — because voucher_rows have no natural unique key (a voucher can have multiple rows for the same account)

### Batching
- **Upserts**: 500 rows per batch (Supabase REST limit)
- **Voucher row deletes**: 50 voucher IDs per `.in()` filter (URI length limit)
- **Voucher ID lookups**: Paginated at 1000 rows per page (Supabase default select limit)

### Auto-created accounts
If an account number appears in #IB, #UB, #RES, #PSALDO, or #TRANS but not in #KONTO, the importer creates it with name `"Account XXXX"`. This prevents FK violations.

### Financial year mapping
The parser stores `year_index` (0 = current, -1 = previous). After inserting financial_years, the importer builds a `year_index → UUID` map and uses it for all FK references.

For vouchers, the importer determines which financial year a voucher belongs to by checking if its date falls within the year's start/end range.

---

## 7. Validator Details (`src/sie4-validator.ts`)

Runs 6 categories of checks comparing parsed data against the database:

| # | Check | What it verifies |
|---|-------|------------------|
| 1 | Account count | DB has >= parsed accounts (allows auto-created extras) |
| 2 | Voucher count per series | Exact match per series (A, B, C, D, ...) |
| 3 | Voucher row count | Total row count matches (all types: normal + btrans + rtrans) |
| 4 | Opening balances | Amount match for all year_index=0 accounts (tolerance: 0.005) |
| 5 | Closing balances | Amount match for all year_index=0 accounts (tolerance: 0.005) |
| 6 | Voucher balance | Every voucher's **normal** TRANS rows sum to 0 (BTRANS/RTRANS excluded) |

### Pagination
The validator uses a `fetchAll()` helper that paginates Supabase queries (1000 rows per page) to avoid the default row limit truncating results.

### Why only normal rows for balance check
In SIE4, `#BTRANS` and `#RTRANS` are supplementary information rows — they carry metadata like beginning balances and result breakdowns. Only `#TRANS` rows represent the actual double-entry bookkeeping (debit = credit). Summing all three types would produce incorrect balances.

---

## 8. Test Results (2026-03-30)

### File 1: RevIL AB (small)
- 165 accounts, 406 vouchers, 1,094 rows
- **12/12 checks passed**
- Import time: ~300ms

### File 2: Skata Sweden AB (medium)
- 399 accounts (+3 auto-created), 79 vouchers, 279 rows
- **10/10 checks passed**
- Import time: ~200ms

### File 3: Byggnadsställningsentreprenad i Stockholm AB (large)
- 508 accounts (+1 auto-created), 4,434 vouchers, 14,228 rows
- **19/19 checks passed** (15 series = 15 voucher count checks)
- Import time: ~650ms

### Idempotency test
Re-running the same file on an already-imported database produces identical results — no duplicates, all checks still pass.

---

## 9. Known Limitations

1. **Hardcoded Supabase credentials** — `src/cli.ts` has local dev URL and key. Must use env vars for production.
2. **Single-company design** — The schema has no tenant/company FK. Each customer is expected to have their own Supabase project (as per KEYHOLDER architecture). If multi-company support is needed, add a `company_id` FK to all tables.
3. **PSALDO dimension data discarded** — Only aggregate period balances (empty dimension `{}`) are stored. Per-dimension-object period balances are skipped. To keep them, add `dim_number` + `object_number` to period_balances and update the unique constraint.
4. **No streaming/chunked parsing** — The entire file is read into memory. SIE4 files are typically <10MB so this is fine, but very large files could be an issue.
5. **BTRANS/RTRANS stored but not queryable by meaning** — They're stored with `transaction_type` set, but there's no higher-level interpretation. They're supplementary metadata, not true transactions.
6. **No `#UNDERDIM` support** — Sub-dimensions are not parsed. Only `#DIM` and `#OBJEKT`.
7. **Voucher uniqueness is `(series, voucher_number)`** — If two different financial years have the same series+number, the second import will overwrite the first. Fortnox doesn't do this in practice but the schema could be extended to include `financial_year_id` in the unique constraint.

---

## 10. What to Do Next

### Immediate priorities
1. **Move credentials to environment variables** — Create a `.env` file and load it in `cli.ts` using `process.env`
2. **Merge the branch** — `feature/sie4-import` is ready to merge into `main`
3. **Add `.gitignore`** — Exclude `node_modules/`, `.env`, `.DS_Store`

### Likely next features (based on KEYHOLDER's Fortnox-mirroring goal)
1. **Build a Supabase Edge Function** for on-demand import — accept a SIE4 file upload, run the parser+importer server-side
2. **Generate TypeScript types** from the schema (`npx supabase gen types typescript`) for type-safe queries in the frontend
3. **Build reporting queries** — trial balance, income statement, balance sheet, all derivable from the imported data:
   - Trial balance = closing_balances for the current year
   - Income statement = period_results (accounts 3000-8999)
   - Balance sheet = closing_balances (accounts 1000-2999)
4. **Add a Fortnox API integration** — pull SIE4 exports programmatically instead of manual file upload
5. **Multi-company support** — if moving away from one-project-per-customer, add company_id FK everywhere

### Schema evolution
When adding new migrations, create them as `supabase/migrations/00002_*.sql` etc. The numbering ensures correct ordering. Run `npx supabase db reset` to apply all migrations from scratch, or `npx supabase migration up` for incremental application.

---

## 11. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@supabase/supabase-js` | ^2.49.0 | Supabase client for PostgreSQL operations |
| `iconv-lite` | ^0.6.3 | CP437 → UTF-8 decoding for SIE files |
| `tsx` | ^4.19.0 | TypeScript execution without compilation step |
| `typescript` | ^5.7.0 | Type checking (dev only) |

---

## 12. SIE4 Format Quick Reference

SIE4 is a Swedish standard for accounting data exchange. Key characteristics:
- **Encoding:** CP437 (IBM PC codepage), not UTF-8
- **Line-based:** One record per line, `#TAG field1 field2 ...`
- **Quoted strings:** Enclosed in `"..."`, escaped quotes via `\"`
- **Dimension blocks:** `{dim_number "object_number"}` or `{}` for none
- **VER blocks:** Multi-line, enclosed in `{ ... }`, contain TRANS/BTRANS/RTRANS rows
- **Year indexing:** 0 = current financial year, -1 = previous year
- **Account numbers:** 4-digit BAS standard (1000-1999 = assets, 2000-2999 = liabilities, 3000-3999 = revenue, etc.)
