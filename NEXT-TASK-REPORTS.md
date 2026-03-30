# Task: Build Balansrapport and Resultatrapport SQL Views

## Context — Read These Files First

1. **`SIE/SIE4-PIPELINE-CONTEXT.md`** — Full technical reference for the import pipeline, database schema (14 tables, 10 migrations), and how data flows from SIE4 files into Supabase. Read sections 4 (Database Schema), 7 (Validator), and 13 (Fortnox Report Reference).

2. **`SIE/SIE-STANDARD-CONTEXT.md`** — SIE standard reference. Read the account number ranges section (BAS standard: 1xxx=assets, 2xxx=liabilities/equity, 3xxx=revenue, 4-7xxx=costs, 8xxx=financial).

3. **`src/__tests__/fortnox-crosscheck.test.ts`** — Contains hardcoded Fortnox report values for all 3 companies. These are your **test assertions** — the SQL views must produce numbers that match these exactly.

4. **`SIE/FORTNOX-CORRECT-DATA/`** — PDF exports of real Fortnox Balansrapport and Resultatrapport for 3 companies. These are the **source of truth** for what the reports should look like (columns, grouping, totals).

## Current State

- **14 tables**, **10 migrations** (00001-00010), next available migration number: **00011**
- **69 tests** (47 parser unit + 6 integration + 16 Fortnox crosscheck), all passing
- 3 real Fortnox SIE4 files imported and verified to ore precision
- `opening_balances` and `closing_balances` have `dimension_number` and `object_number` columns (added in migration 00009). Aggregate balances have `dimension_number IS NULL`. Per-object balances have dimension set. **Your SQL must filter on `dimension_number IS NULL`** to get the aggregate values used in reports.

## What to Build

Two SQL views (as a Supabase migration `supabase/migrations/00011_report_views.sql`) that generate reports matching Fortnox output.

### View 1: `report_balansrapport` (Balance Sheet)

Fortnox Balansrapport has these columns:
- **Account number** + **Account name**
- **Ing balans** (opening balance = IB for year_index 0)
- **Ing saldo** (= same as Ing balans for annual reports)
- **Period** (= UB - IB, the change during the year)
- **Utg balans** (closing balance = UB for year_index 0)

Grouped by account range with subtotals:
- **TILLGANGAR** (Assets, 1000-1999)
  - Anlaggningstillgangar (1000-1399)
  - Omsattningstillgangar (1400-1999)
- **EGET KAPITAL, AVSATTNINGAR OCH SKULDER** (2000-2999)
  - Eget kapital (2080-2099)
  - Obeskattade reserver (2100-2199)
  - Langfristiga skulder (2300-2399)
  - Kortfristiga skulder (2400-2999)
- **BERAKNAT RESULTAT** = SUMMA TILLGANGAR + SUMMA EGET KAPITAL...

Source tables: `closing_balances`, `opening_balances`, `accounts`, `financial_years`

**CRITICAL:** Both `opening_balances` and `closing_balances` contain both aggregate rows (dimension_number IS NULL) and per-object rows (dimension_number IS NOT NULL). Reports use **only aggregate rows**.

Join pattern:
```sql
SELECT a.account_number, a.name,
       COALESCE(ib.amount, 0) AS ing_balans,
       COALESCE(ub.amount, 0) AS utg_balans,
       COALESCE(ub.amount, 0) - COALESCE(ib.amount, 0) AS period
FROM accounts a
LEFT JOIN opening_balances ib ON ib.account_number = a.account_number
  AND ib.financial_year_id = <current_fy_id>
  AND ib.dimension_number IS NULL
LEFT JOIN closing_balances ub ON ub.account_number = a.account_number
  AND ub.financial_year_id = <current_fy_id>
  AND ub.dimension_number IS NULL
WHERE COALESCE(ib.amount, 0) != 0 OR COALESCE(ub.amount, 0) != 0
ORDER BY a.account_number
```

### View 2: `report_resultatrapport` (Income Statement)

Fortnox Resultatrapport has these columns:
- **Account number** + **Account name**
- **Period** (= negated RES amount for current year)
- **Ackumulerat** (= same as Period for annual reports)
- **Period fg ar** (= negated RES amount for year_index -1, previous year)

**CRITICAL SIGN CONVENTION:** SIE stores amounts in bookkeeping convention (debit=positive, credit=negative). Fortnox Resultatrapport **negates all amounts** for display:
- Revenue (3xxx): SIE has negative -> Fortnox shows positive
- Costs (4-7xxx): SIE has positive -> Fortnox shows negative
- Formula: `display_amount = -1 * db_amount`

Grouped by account range with subtotals:
- **RORELSENS INTAKTER** (3000-3999)
  - Nettoomsattning (3000-3799)
  - Ovriga rorelseintakter (3800-3999)
- **RORELSENS KOSTNADER**
  - Ravaror och fornodenheter (4000-4999)
  - Ovriga externa kostnader (5000-6999)
  - Personalkostnader (7000-7699)
  - Avskrivningar (7800-7899)
  - Ovriga rorelsekostnader (7900-7999)
- **RORELSERESULTAT** = revenue + costs
- **Finansiella poster** (8000-8499)
- **RESULTAT EFTER FINANSIELLA POSTER**
- **Bokslutsdispositioner** (8800-8899)
- **Skatt** (8900-8989)
- **Arets resultat** (8990-8999)
- **BERAKNAT RESULTAT** = sum of all

Source tables: `period_results`, `accounts`, `financial_years`

Note: `period_results` does NOT have dimension columns — it stores one amount per (financial_year_id, account_number). No dimension filtering needed.

```sql
SELECT a.account_number, a.name,
       -COALESCE(res.amount, 0) AS period,
       -COALESCE(res.amount, 0) AS ackumulerat,
       -COALESCE(res_prev.amount, 0) AS period_fg_ar
FROM accounts a
LEFT JOIN period_results res ON res.account_number = a.account_number
  AND res.financial_year_id = <current_fy_id>
LEFT JOIN period_results res_prev ON res_prev.account_number = a.account_number
  AND res_prev.financial_year_id = <prev_fy_id>
WHERE COALESCE(res.amount, 0) != 0 OR COALESCE(res_prev.amount, 0) != 0
ORDER BY a.account_number
```

## Verification

After creating the views, verify against the Fortnox PDFs:

**RevIL AB:**
- Balansrapport: SUMMA TILLGANGAR = 3 952 190,47 | BERAKNAT RESULTAT = 869 954,78
- Resultatrapport: SUMMA RORELSENS INTAKTER = 1 134 896,27 | BERAKNAT RESULTAT = 869 954,78

**Skata Sweden AB:**
- Balansrapport: SUMMA TILLGANGAR = 430 607,53 | BERAKNAT RESULTAT = 58 795,82
- Resultatrapport: SUMMA RORELSENS INTAKTER = 96 611,97 | BERAKNAT RESULTAT = 58 795,82

**Byggnadsstellningsentreprenad:**
- Balansrapport: SUMMA TILLGANGAR = 20 646 658,73 | BERAKNAT RESULTAT = 2 886 185,09
- Resultatrapport: SUMMA RORELSENS INTAKTER = 37 486 819,37 | BERAKNAT RESULTAT = 2 886 185,09

Write tests that query the views and assert these totals match.

## How to Run

```bash
# Prerequisites
npm install
npx supabase start
npx supabase db reset          # applies all migrations (00001-00010 + your new 00011)

# Create .env if missing (REQUIRED for DB tests!)
# Get SERVICE_ROLE_KEY from: npx supabase status -o json
echo "SUPABASE_URL=http://127.0.0.1:54421" > .env
echo "SUPABASE_SERVICE_KEY=<SERVICE_ROLE_KEY from above>" >> .env

# Import test data
npx tsx src/cli.ts SIE/RevILAB20260330_165333.se

# Run tests
npm test

# Expected: all 69 existing tests pass + your new report tests pass
# WARNING: If you see "22 skipped", .env is missing or wrong!

# Query the view directly
# Use Supabase Studio at http://127.0.0.1:54423
```

## Constraints

- Create as a new migration: `supabase/migrations/00011_report_views.sql`
- Use SQL views or functions (not TypeScript) — reports should be queryable directly from Supabase client
- The views should accept financial_year_id as a parameter (use SQL functions with parameter, or create views that join on year_index = 0 for simplicity)
- Write tests in `src/__tests__/reports.test.ts`
- All existing **69 tests** must still pass after your changes
- The `.env` file is gitignored — you must create it locally (see How to Run above)
- `vitest.config.ts` uses Vite `loadEnv()` to inject `.env` into process.env — this is already configured
