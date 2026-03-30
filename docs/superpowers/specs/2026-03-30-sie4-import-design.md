# SIE4 Import to Supabase — Design Spec

**Date:** 2026-03-30
**Goal:** CLI tool that parses Fortnox SIE4 files and imports them into local Supabase, creating an exact copy of the accounting data.

---

## Scope

- **In scope:** SIE4 parser, Supabase import, validation script, CLI entry point
- **Out of scope:** API endpoint, file upload UI, Fortnox API sync, AI validation agent, onboarding wizard

---

## Project Structure

```
KEYHOLDER/
├── supabase/
│   └── migrations/
│       └── 00001_sie_schema.sql
├── src/
│   ├── types.ts
│   ├── sie4-parser.ts
│   ├── sie4-importer.ts
│   ├── sie4-validator.ts
│   └── cli.ts
├── package.json
└── tsconfig.json
```

## Dependencies

- `iconv-lite` — CP437 decoding
- `@supabase/supabase-js` — Supabase client
- `tsx` (dev) — run TypeScript directly

## Usage

```bash
npx tsx src/cli.ts SIE/RevILAB20260330_165333.se
```

---

## Database Schema

12 tables. Insert order follows foreign key dependencies.

### 1. company_info

```sql
CREATE TABLE company_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fortnox_number text,
  company_name text NOT NULL,
  org_number text UNIQUE,
  address_contact text,
  address_street text,
  address_postal text,
  address_phone text,
  account_plan_type text,
  balance_date date,
  created_at timestamptz DEFAULT now()
);
```

### 2. financial_years

```sql
CREATE TABLE financial_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_index integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  UNIQUE(year_index)
);
```

### 3. dimensions

```sql
CREATE TABLE dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_number integer NOT NULL UNIQUE,
  name text NOT NULL
);
```

### 4. objects

```sql
CREATE TABLE objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_number integer NOT NULL REFERENCES dimensions(dimension_number),
  object_number text NOT NULL,
  name text NOT NULL,
  UNIQUE(dimension_number, object_number)
);
```

### 5. accounts

```sql
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number integer NOT NULL UNIQUE,
  name text NOT NULL
);
```

### 6. sru_codes

```sql
CREATE TABLE sru_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number integer NOT NULL REFERENCES accounts(account_number),
  sru_code text NOT NULL,
  UNIQUE(account_number)
);
```

### 7. opening_balances

```sql
CREATE TABLE opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL REFERENCES accounts(account_number),
  amount decimal(15,2) NOT NULL,
  quarter integer NOT NULL DEFAULT 0,
  UNIQUE(financial_year_id, account_number)
);
```

### 8. closing_balances

```sql
CREATE TABLE closing_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL REFERENCES accounts(account_number),
  amount decimal(15,2) NOT NULL,
  quarter integer NOT NULL DEFAULT 0,
  UNIQUE(financial_year_id, account_number)
);
```

### 9. period_results

```sql
CREATE TABLE period_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL REFERENCES accounts(account_number),
  amount decimal(15,2) NOT NULL,
  UNIQUE(financial_year_id, account_number)
);
```

### 10. period_balances

```sql
CREATE TABLE period_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL REFERENCES accounts(account_number),
  period integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  quarter integer NOT NULL DEFAULT 0,
  UNIQUE(financial_year_id, account_number, period)
);
```

### 11. vouchers

```sql
CREATE TABLE vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series text NOT NULL,
  voucher_number integer NOT NULL,
  date date NOT NULL,
  description text,
  registration_date date,
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(series, voucher_number)
);
```

### 12. voucher_rows

```sql
CREATE TABLE voucher_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  account_number integer NOT NULL REFERENCES accounts(account_number),
  dim_number integer,
  object_number text,
  amount decimal(15,2) NOT NULL,
  description text,
  quarter integer NOT NULL DEFAULT 0,
  name text,
  transaction_type text NOT NULL DEFAULT 'normal'
    CHECK (transaction_type IN ('normal', 'btrans', 'rtrans'))
);
```

### Indexes

```sql
CREATE INDEX ON vouchers(series, voucher_number);
CREATE INDEX ON vouchers(financial_year_id);
CREATE INDEX ON voucher_rows(voucher_id);
CREATE INDEX ON voucher_rows(account_number);
CREATE INDEX ON opening_balances(financial_year_id);
CREATE INDEX ON closing_balances(financial_year_id);
CREATE INDEX ON period_balances(financial_year_id, period);
```

### Row Level Security

All tables: `ENABLE ROW LEVEL SECURITY` + policy allowing authenticated users to read all data. Each customer gets their own Supabase project, so isolation is at the project level.

---

## SIE4 Parser

**File:** `src/sie4-parser.ts`
**Function:** `parseSIE4(fileBuffer: Buffer): ParsedSIE4`

### Encoding

- Always CP437 (Fortnox standard)
- Decode with `iconv-lite` using `'cp437'`
- Strip `\r` before splitting on `\n`

### Parsing Logic

1. Decode buffer → string
2. Split into lines
3. Parse line by line:
   - Each line starting with `#` is a tag with fields
   - Quoted strings: `"value"` — handle embedded quotes
   - `#VER` opens a block — collect lines until `}` on its own line
   - Inside blocks: parse `#TRANS`, `#BTRANS`, `#RTRANS`
4. `{}` dimension parsing:
   - `{}` empty → dim_number=null, object_number=null
   - `{6 "P1040"}` → dim_number=6, object_number="P1040"

### Supported Tags

| Tag | Target |
|-----|--------|
| `#FLAGGA` | meta.flagga |
| `#FORMAT` | meta.format |
| `#SIETYP` | meta.sietyp |
| `#PROGRAM` | meta.program |
| `#GEN` | meta.generated |
| `#FNR` | meta.fortnox_number |
| `#FNAMN` | meta.company_name |
| `#ORGNR` | meta.org_number |
| `#ADRESS` | meta.address |
| `#OMFATTN` | meta.balance_date |
| `#KPTYP` | meta.account_plan_type |
| `#RAR` | financial_years[] |
| `#KONTO` | accounts[] |
| `#SRU` | sru_codes[] |
| `#DIM` | dimensions[] |
| `#OBJEKT` | objects[] |
| `#IB` | opening_balances[] |
| `#UB` | closing_balances[] |
| `#RES` | period_results[] |
| `#PSALDO` | period_balances[] |
| `#VER` + `#TRANS` | vouchers[] with rows[] |

### Error Handling

- Unknown tag → log warning, continue
- Parse error on line → save to `parse_errors[]` with line number, continue
- Never crash on unexpected field count

### Output Interface

```typescript
interface ParsedSIE4 {
  meta: {
    flagga: number
    format: string
    sietyp: number
    program: string
    generated: string
    fortnox_number: string
    company_name: string
    org_number: string
    address: {
      contact: string
      street: string
      postal: string
      phone: string
    }
    balance_date: string
    account_plan_type: string
  }
  financial_years: Array<{
    year_index: number
    start_date: string
    end_date: string
  }>
  accounts: Array<{
    account_number: number
    name: string
  }>
  sru_codes: Array<{
    account_number: number
    sru_code: string
  }>
  dimensions: Array<{
    dimension_number: number
    name: string
  }>
  objects: Array<{
    dimension_number: number
    object_number: string
    name: string
  }>
  opening_balances: Array<{
    year_index: number
    account_number: number
    amount: number
    quarter: number
  }>
  closing_balances: Array<{
    year_index: number
    account_number: number
    amount: number
    quarter: number
  }>
  period_results: Array<{
    year_index: number
    account_number: number
    amount: number
  }>
  period_balances: Array<{
    year_index: number
    period: number
    account_number: number
    amount: number
    quarter: number
  }>
  vouchers: Array<{
    series: string
    voucher_number: number
    date: string
    description: string
    registration_date: string
    rows: Array<{
      type: 'normal' | 'btrans' | 'rtrans'
      account_number: number
      dim_number: number | null
      object_number: string | null
      amount: number
      description: string
      quarter: number
      name: string | null
    }>
  }>
  parse_errors: Array<{
    line_number: number
    line: string
    error: string
  }>
}
```

---

## Supabase Importer

**File:** `src/sie4-importer.ts`
**Function:** `importToSupabase(parsed: ParsedSIE4, client: SupabaseClient): Promise<ImportResult>`

### Insert Order (FK dependencies)

1. company_info
2. financial_years
3. dimensions
4. objects (FK → dimensions)
5. accounts
6. sru_codes (FK → accounts)
7. opening_balances (FK → financial_years + accounts)
8. closing_balances (FK → financial_years + accounts)
9. period_results (FK → financial_years + accounts)
10. period_balances (FK → financial_years + accounts)
11. vouchers (FK → financial_years)
12. voucher_rows (FK → vouchers + accounts)

### Idempotency

All upserts use `onConflict` on the unique constraint columns:
- `company_info` — upsert on `org_number`
- `financial_years` — upsert on `year_index`
- `accounts` — upsert on `account_number`
- `dimensions` — upsert on `dimension_number`
- `objects` — upsert on `(dimension_number, object_number)`
- `sru_codes` — upsert on `account_number`
- `opening_balances` — upsert on `(financial_year_id, account_number)`
- `closing_balances` — upsert on `(financial_year_id, account_number)`
- `period_results` — upsert on `(financial_year_id, account_number)`
- `period_balances` — upsert on `(financial_year_id, account_number, period)`
- `vouchers` — upsert on `(series, voucher_number)`
- `voucher_rows` — no natural unique key. Strategy: delete existing rows for each voucher (CASCADE), then insert fresh rows. This ensures re-import replaces rows correctly.

Running the same file twice produces no duplicates and no errors.

### Batching

Max 500 rows per upsert call. Larger datasets are chunked.

### Voucher → Financial Year Mapping

Each voucher's date is compared against `financial_years` to determine which `financial_year_id` it belongs to. The importer looks up the financial year where `start_date <= voucher.date <= end_date`.

### Progress Output

After each step, log to stdout:
```
✓ company_info (1 row)
✓ financial_years (2 rows)
✓ dimensions (2 rows)
✓ objects (15 rows)
✓ accounts (284 rows)
✓ sru_codes (284 rows)
✓ opening_balances (45 rows)
✓ closing_balances (45 rows)
✓ period_results (32 rows)
✓ period_balances (128 rows)
✓ vouchers (412 rows)
✓ voucher_rows (1,847 rows)
```

### Output Interface

```typescript
interface ImportResult {
  success: boolean
  stats: {
    company_info: number
    financial_years: number
    dimensions: number
    objects: number
    accounts: number
    sru_codes: number
    opening_balances: number
    closing_balances: number
    period_results: number
    period_balances: number
    vouchers: number
    voucher_rows: number
  }
  parse_errors: Array<{ line_number: number; line: string; error: string }>
  import_errors: Array<{ stage: string; error: string }>
  duration_ms: number
}
```

---

## Validator

**File:** `src/sie4-validator.ts`
**Function:** `validateImport(parsed: ParsedSIE4, client: SupabaseClient): Promise<ValidationReport>`

### Checks

1. **Account count** — parsed accounts vs DB `SELECT COUNT(*) FROM accounts`
2. **Voucher count per series** — parsed vouchers grouped by series vs DB
3. **Voucher row count** — total parsed rows vs DB `SELECT COUNT(*) FROM voucher_rows`
4. **Opening balance amounts** — per account: parsed IB amount vs DB amount
5. **Closing balance amounts** — per account: parsed UB amount vs DB amount
6. **Voucher balance** — for each voucher: `SUM(amount)` of all rows should equal 0 (debit = credit)

### Output

```
Validation Report
─────────────────
✓ Account count: 284 parsed, 284 in DB
✓ Voucher count (A): 412 parsed, 412 in DB
✓ Voucher row count: 1,847 parsed, 1,847 in DB
✓ Opening balances match (45 accounts checked)
✓ Closing balances match (45 accounts checked)
✓ All 412 vouchers balanced (debit = credit)

Result: 6/6 checks passed
```

### Output Interface

```typescript
interface ValidationReport {
  passed: boolean
  checks: Array<{
    name: string
    status: 'pass' | 'fail'
    expected: string | number
    actual: string | number
    details?: string
  }>
}
```

---

## CLI Entry Point

**File:** `src/cli.ts`

```
Usage: npx tsx src/cli.ts <path-to-sie-file>

Steps:
1. Read file as Buffer
2. Parse with parseSIE4()
3. Print parse summary (company name, accounts, vouchers, any errors)
4. Connect to local Supabase (env vars or hardcoded local defaults)
5. Import with importToSupabase()
6. Validate with validateImport()
7. Print final report
```

Supabase connection uses local defaults:
- URL: `http://127.0.0.1:54421`
- Service role key: from `supabase status` output

---

## Test Data

3 real Fortnox SIE4 files available:

| File | Company | Lines | Size |
|------|---------|-------|------|
| `SIE/RevILAB20260330_165333.se` | RevIL AB | 3,853 | 107 KB |
| `SIE/SkataSwedenAB20260330_170222.se` | Skata Sweden AB | 1,733 | 53 KB |
| `SIE/ByggnadsställningsentreprenadiStockholmAB20260330_170428.se` | Byggnadsställningsentreprenad i Stockholm AB | 33,932 | 1 MB |

All confirmed CP437 encoded with CRLF line endings.

---

## Success Criteria

1. All 3 SIE files parse without crashes
2. All data imported to local Supabase — verifiable in Supabase Studio (port 54423)
3. Validator reports 6/6 checks passed for each file
4. Re-running import on same file produces no duplicates
