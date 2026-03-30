# Report Functions — Complete Technical Context

> Everything an AI or developer with zero context needs to understand, extend,
> and debug the Balansrapport and Resultatrapport SQL functions.
>
> **Last verified:** 2026-03-30 (104/104 tests passing, all 3 Fortnox companies match to ore)
> **Migration:** `supabase/migrations/00011_report_views.sql`
> **Tests:** `src/__tests__/reports.test.ts` (15 tests)

---

## 1. What Was Built

Two PostgreSQL functions that generate Fortnox-compatible financial reports directly from the database. They are callable via Supabase `client.rpc()` and produce per-account rows with the same columns as a Fortnox PDF export.

| Function | Purpose | Accounts | Columns |
|----------|---------|----------|---------|
| `report_balansrapport(p_financial_year_id)` | Balance Sheet | 1000-2999 | account_number, account_name, ing_balans, period, utg_balans |
| `report_resultatrapport(p_financial_year_id)` | Income Statement | 3000-8999 | account_number, account_name, period, ackumulerat, period_fg_ar |

Both functions take a single `uuid` parameter (`p_financial_year_id`) and return a table of rows sorted by account number.

---

## 2. Why SQL Functions (Not Views)

PostgreSQL views cannot accept parameters. Since reports need to be generated for a specific financial year, we use SQL functions with `RETURNS TABLE`. This gives us:
- **Parameterized queries:** Pass any `financial_year_id` UUID
- **Supabase RPC support:** `client.rpc('report_balansrapport', { p_financial_year_id: fyId })`
- **Composability:** Results can be filtered, aggregated, or joined by the client
- **Performance:** Marked `STABLE` for query optimizer hints

---

## 3. How to Query

### From Supabase TypeScript client
```typescript
import { createClient } from '@supabase/supabase-js'

const client = createClient(SUPABASE_URL, SUPABASE_KEY)

// Get the current financial year ID
const { data: fy } = await client
  .from('financial_years')
  .select('id')
  .eq('year_index', 0)
  .single()

// Balance sheet
const { data: balans } = await client.rpc('report_balansrapport', {
  p_financial_year_id: fy.id
})

// Income statement
const { data: resultat } = await client.rpc('report_resultatrapport', {
  p_financial_year_id: fy.id
})
```

### From raw SQL (Supabase Studio or psql)
```sql
-- Get financial year ID first
SELECT id FROM financial_years WHERE year_index = 0;

-- Balance sheet
SELECT * FROM report_balansrapport('your-uuid-here');

-- Income statement
SELECT * FROM report_resultatrapport('your-uuid-here');

-- Compute SUMMA TILLGANGAR
SELECT SUM(utg_balans)
FROM report_balansrapport('your-uuid-here')
WHERE account_number >= 1000 AND account_number < 2000;

-- Compute BERAKNAT RESULTAT (balance sheet)
SELECT SUM(utg_balans)
FROM report_balansrapport('your-uuid-here');

-- Compute BERAKNAT RESULTAT (income statement, should match)
SELECT SUM(period)
FROM report_resultatrapport('your-uuid-here');
```

---

## 4. Data Flow

```
SIE4 file
  -> Parser (sie4-parser.ts)
    -> Importer (sie4-importer.ts)
      -> DB tables: accounts, opening_balances, closing_balances, period_results, financial_years
        -> report_balansrapport() reads: accounts + opening_balances + closing_balances
        -> report_resultatrapport() reads: accounts + period_results + financial_years
```

### Source tables per function

**report_balansrapport:**
| Table | What it provides | Join condition |
|-------|-----------------|----------------|
| `accounts` | Account number + name | Base table |
| `opening_balances` | Ing balans (IB) | `financial_year_id = param AND dimension_number IS NULL` |
| `closing_balances` | Utg balans (UB) | `financial_year_id = param AND dimension_number IS NULL` |

**report_resultatrapport:**
| Table | What it provides | Join condition |
|-------|-----------------|----------------|
| `accounts` | Account number + name | Base table |
| `period_results` | Current year amounts | `financial_year_id = param` |
| `period_results` (again) | Previous year amounts | `financial_year_id = (previous year lookup)` |
| `financial_years` | Year index mapping | Subquery to find previous year |

---

## 5. Critical Design Decisions

### 5.1 Dimension filtering (Balansrapport only)

The `opening_balances` and `closing_balances` tables contain **two kinds of rows**:
- **Aggregate rows:** `dimension_number IS NULL` — total balance per account (from #IB/#UB tags)
- **Per-object rows:** `dimension_number IS NOT NULL` — balance per cost center/project (from #OIB/#OUB tags)

The report functions filter `AND dimension_number IS NULL` to use only aggregate values. Without this filter, accounts with per-object breakdowns would show incorrect totals.

The `period_results` table does **not** have dimension columns — it stores one amount per `(financial_year_id, account_number)`. No filtering needed there.

### 5.2 Sign convention (Resultatrapport only)

SIE stores amounts in bookkeeping convention:
- **Revenue (3xxx):** Stored as **negative** (credit) in DB
- **Costs (4-7xxx):** Stored as **positive** (debit) in DB
- **Financial items (8xxx):** Mixed signs

Fortnox Resultatrapport **negates all amounts** for display:
- Revenue shows as positive
- Costs show as negative

The function applies: `display_amount = -1 * db_amount`

This is done in the SQL: `-COALESCE(res.amount, 0) AS period`

**Balansrapport does NOT negate** — DB values = Fortnox values directly for IB/UB.

### 5.3 Previous year lookup (Resultatrapport only)

The `period_fg_ar` column shows last year's result for comparison. The function resolves the previous year automatically:
```sql
LEFT JOIN period_results res_prev
  ON res_prev.financial_year_id = (
    SELECT id FROM financial_years
    WHERE year_index = (
      SELECT year_index - 1 FROM financial_years WHERE id = p_financial_year_id
    )
  )
```

If no previous year exists, the subquery returns NULL and the LEFT JOIN produces 0 for all accounts.

### 5.4 Account range filtering

- **Balansrapport:** Only accounts 1000-2999 (assets + equity/liabilities)
- **Resultatrapport:** Only accounts 3000-8999 (income + costs + financial)

Accounts outside these ranges (if any exist) are excluded. Accounts with zero in both IB/UB (or both current/previous RES) are also excluded.

### 5.5 Period = Ackumulerat for annual reports

For annual (full-year) reports, `period` and `ackumulerat` are identical. The function returns the same value for both columns. For future monthly/quarterly report support, `ackumulerat` would need to sum from year start to the selected period, while `period` would be the single-period amount.

---

## 6. Fortnox Report Structure Reference

See the subfolder docs for detailed per-report structure:
- **[balans/BALANSRAPPORT.md](balans/BALANSRAPPORT.md)** — Balance sheet groups, subtotals, account ranges
- **[resultat/RESULTATRAPPORT.md](resultat/RESULTATRAPPORT.md)** — Income statement groups, subtotals, account ranges

---

## 7. Verified Test Values

All values verified against Fortnox PDF exports to ore precision.

### RevIL AB (556065-1258)
| Metric | Balansrapport | Resultatrapport |
|--------|--------------|-----------------|
| SUMMA TILLGANGAR | 3,952,190.47 | — |
| SUMMA RORELSENS INTAKTER | — | 1,134,896.27 |
| BERAKNAT RESULTAT | 869,954.78 | 869,954.78 |

### Skata Sweden AB (559044-4245)
| Metric | Balansrapport | Resultatrapport |
|--------|--------------|-----------------|
| SUMMA TILLGANGAR | 430,607.53 | — |
| SUMMA RORELSENS INTAKTER | — | 96,611.97 |
| BERAKNAT RESULTAT | 58,795.82 | 58,795.82 |

### Byggnadsställningsentreprenad i Stockholm AB (556440-1452)
| Metric | Balansrapport | Resultatrapport |
|--------|--------------|-----------------|
| SUMMA TILLGANGAR | 20,646,658.73 | — |
| SUMMA RORELSENS INTAKTER | — | 37,486,819.37 |
| BERAKNAT RESULTAT | 2,886,185.09 | 2,886,185.09 |

**Tolerance:** < 0.01 SEK for RevIL and Skata, < 0.02 SEK for Byggnadsställningsentreprenad (larger amounts, floating-point rounding).

**Key verification:** BERAKNAT RESULTAT must match between Balansrapport and Resultatrapport for each company. This is the fundamental accounting identity: `sum(balance sheet) = sum(income statement)`.

---

## 8. Test Suite (`src/__tests__/reports.test.ts`)

15 tests across 3 companies, following the same pattern as `fortnox-crosscheck.test.ts`.

### Test structure
```
Report Functions
  RevIL AB
    Balansrapport
      - SUMMA TILLGANGAR should be 3 952 190,47
      - BERAKNAT RESULTAT should be 869 954,78
      - should include account-level data with correct columns
    Resultatrapport
      - SUMMA RORELSENS INTAKTER should be 1 134 896,27
      - BERAKNAT RESULTAT should be 869 954,78
      - period and ackumulerat should match for annual reports
  Skata Sweden AB
    Balansrapport (2 tests)
    Resultatrapport (2 tests)
  Byggnadsställningsentreprenad (2+2 tests)
```

### How tests work
1. Connect to local Supabase (skip all if unavailable)
2. `truncateAll()` — delete all rows from 14 tables in FK-safe order
3. `importFile()` — parse SIE4 file and import to DB
4. `getFyId()` — get UUID for `year_index = 0`
5. `getBalansrapport(fyId)` / `getResultatrapport(fyId)` — call RPC, parse numeric columns
6. Assert totals match Fortnox PDF values

### Running tests
```bash
npm test                        # All 104 tests (69 existing + 15 report + 20 HTML crosscheck)
npx vitest run reports          # Just the report tests
```

---

## 9. Migration Details (`supabase/migrations/00011_report_views.sql`)

### Full SQL

```sql
-- Balance sheet function
CREATE OR REPLACE FUNCTION report_balansrapport(p_financial_year_id uuid)
RETURNS TABLE (
  account_number integer,
  account_name text,
  ing_balans numeric,
  period numeric,
  utg_balans numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    a.account_number,
    a.name,
    COALESCE(ib.amount, 0),
    COALESCE(ub.amount, 0) - COALESCE(ib.amount, 0),
    COALESCE(ub.amount, 0)
  FROM accounts a
  LEFT JOIN opening_balances ib
    ON ib.account_number = a.account_number
    AND ib.financial_year_id = p_financial_year_id
    AND ib.dimension_number IS NULL
  LEFT JOIN closing_balances ub
    ON ub.account_number = a.account_number
    AND ub.financial_year_id = p_financial_year_id
    AND ub.dimension_number IS NULL
  WHERE a.account_number >= 1000
    AND a.account_number < 3000
    AND (COALESCE(ib.amount, 0) != 0 OR COALESCE(ub.amount, 0) != 0)
  ORDER BY a.account_number;
$$;

-- Income statement function
CREATE OR REPLACE FUNCTION report_resultatrapport(p_financial_year_id uuid)
RETURNS TABLE (
  account_number integer,
  account_name text,
  period numeric,
  ackumulerat numeric,
  period_fg_ar numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    a.account_number,
    a.name,
    -COALESCE(res.amount, 0),
    -COALESCE(res.amount, 0),
    -COALESCE(res_prev.amount, 0)
  FROM accounts a
  LEFT JOIN period_results res
    ON res.account_number = a.account_number
    AND res.financial_year_id = p_financial_year_id
  LEFT JOIN period_results res_prev
    ON res_prev.account_number = a.account_number
    AND res_prev.financial_year_id = (
      SELECT id FROM financial_years
      WHERE year_index = (
        SELECT year_index - 1 FROM financial_years WHERE id = p_financial_year_id
      )
    )
  WHERE a.account_number >= 3000
    AND a.account_number < 9000
    AND (COALESCE(res.amount, 0) != 0 OR COALESCE(res_prev.amount, 0) != 0)
  ORDER BY a.account_number;
$$;
```

### Applying the migration
```bash
npx supabase db reset           # Full reset (applies all 11 migrations)
# OR (if already running)
npx supabase migration up       # Incremental (applies only new migrations)
```

---

## 10. What to Do Next

### Immediate extensions
1. **Add grouping/subtotal rows** — The functions return per-account rows only. To match Fortnox PDF layout exactly, add SQL that inserts group headers and subtotals (e.g., "SUMMA TILLGANGAR" row). Could be a wrapper function or done client-side.
2. **Monthly/quarterly period support** — Currently `period = ackumulerat` (annual). For period reports, add a period parameter and compute from `period_balances` (PSALDO) instead of `period_results`.
3. **HTML/PDF rendering** — Build a renderer that takes the RPC output and produces Fortnox-style HTML or PDF reports.

### Architectural notes for future AI
- Migration numbering: next available is **00012**
- Test file pattern: `src/__tests__/<feature>.test.ts`
- All DB tests use `describe.skipIf(!supabaseAvailable)` for graceful CI without Supabase
- The `truncateAll()` function must list tables in reverse FK order; if new tables are added, update the list
- Supabase RPC returns `numeric` columns as strings — always `parseFloat()` in TypeScript
- The accounting identity `BERAKNAT RESULTAT (balance sheet) = BERAKNAT RESULTAT (income statement)` is the ultimate correctness check
