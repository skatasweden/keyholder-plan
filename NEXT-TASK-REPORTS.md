# Task: Build Balansrapport and Resultatrapport SQL Views

## Context — Read These Files First

1. **`SIE/SIE4-PIPELINE-CONTEXT.md`** — Full technical reference for the import pipeline, database schema (12 tables, 2 migrations), and how data flows from SIE4 files into Supabase. Read sections 4 (Database Schema), 5 (Parser), and 7 (Validator).

2. **`SIE/SIE-STANDARD-CONTEXT.md`** — SIE standard reference. Read the account number ranges section (BAS standard: 1xxx=assets, 2xxx=liabilities/equity, 3xxx=revenue, 4-7xxx=costs, 8xxx=financial).

3. **`src/__tests__/fortnox-crosscheck.test.ts`** — Contains hardcoded Fortnox report values for all 3 companies. These are your **test assertions** — the SQL views must produce numbers that match these exactly.

4. **`SIE/FORTNOX-CORRECT-DATA/`** — PDF exports of real Fortnox Balansrapport and Resultatrapport for 3 companies. These are the **source of truth** for what the reports should look like (columns, grouping, totals).

## What to Build

Two SQL views (as a Supabase migration `supabase/migrations/00003_report_views.sql`) that generate reports matching Fortnox output.

### View 1: `report_balansrapport` (Balance Sheet)

Fortnox Balansrapport has these columns:
- **Account number** + **Account name**
- **Ing balans** (opening balance = IB for year_index 0)
- **Ing saldo** (= same as Ing balans for annual reports)
- **Period** (= UB - IB, the change during the year)
- **Utg balans** (closing balance = UB for year_index 0)

Grouped by account range with subtotals:
- **TILLGÅNGAR** (Assets, 1000-1999)
  - Anläggningstillgångar (1000-1399)
  - Omsättningstillgångar (1400-1999)
- **EGET KAPITAL, AVSÄTTNINGAR OCH SKULDER** (2000-2999)
  - Eget kapital (2080-2099)
  - Obeskattade reserver (2100-2199)
  - Långfristiga skulder (2300-2399)
  - Kortfristiga skulder (2400-2999)
- **BERÄKNAT RESULTAT** = SUMMA TILLGÅNGAR + SUMMA EGET KAPITAL...

Source tables: `closing_balances`, `opening_balances`, `accounts`, `financial_years`

Join pattern:
```sql
SELECT a.account_number, a.name,
       COALESCE(ib.amount, 0) AS ing_balans,
       COALESCE(ub.amount, 0) AS utg_balans,
       COALESCE(ub.amount, 0) - COALESCE(ib.amount, 0) AS period
FROM accounts a
LEFT JOIN opening_balances ib ON ib.account_number = a.account_number
  AND ib.financial_year_id = <current_fy_id>
LEFT JOIN closing_balances ub ON ub.account_number = a.account_number
  AND ub.financial_year_id = <current_fy_id>
WHERE COALESCE(ib.amount, 0) != 0 OR COALESCE(ub.amount, 0) != 0
ORDER BY a.account_number
```

### View 2: `report_resultatrapport` (Income Statement)

Fortnox Resultatrapport has these columns:
- **Account number** + **Account name**
- **Period** (= negated RES amount for current year)
- **Ackumulerat** (= same as Period for annual reports)
- **Period fg år** (= negated RES amount for year_index -1, previous year)

**CRITICAL SIGN CONVENTION:** SIE stores amounts in bookkeeping convention (debit=positive, credit=negative). Fortnox Resultatrapport **negates all amounts** for display:
- Revenue (3xxx): SIE has negative → Fortnox shows positive
- Costs (4-7xxx): SIE has positive → Fortnox shows negative
- Formula: `display_amount = -1 * db_amount`

Grouped by account range with subtotals:
- **RÖRELSENS INTÄKTER** (3000-3999)
  - Nettoomsättning (3000-3799)
  - Övriga rörelseintäkter (3800-3999)
- **RÖRELSENS KOSTNADER**
  - Råvaror och förnödenheter (4000-4999)
  - Övriga externa kostnader (5000-6999)
  - Personalkostnader (7000-7699)
  - Avskrivningar (7800-7899)
  - Övriga rörelsekostnader (7900-7999)
- **RÖRELSERESULTAT** = revenue + costs
- **Finansiella poster** (8000-8499)
- **RESULTAT EFTER FINANSIELLA POSTER**
- **Bokslutsdispositioner** (8800-8899)
- **Skatt** (8900-8989)
- **Årets resultat** (8990-8999)
- **BERÄKNAT RESULTAT** = sum of all

Source tables: `period_results`, `accounts`, `financial_years`

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
- Balansrapport: SUMMA TILLGÅNGAR = 3 952 190,47 | BERÄKNAT RESULTAT = 869 954,78
- Resultatrapport: SUMMA RÖRELSENS INTÄKTER = 1 134 896,27 | BERÄKNAT RESULTAT = 869 954,78

**Skata Sweden AB:**
- Balansrapport: SUMMA TILLGÅNGAR = 430 607,53 | BERÄKNAT RESULTAT = 58 795,82
- Resultatrapport: SUMMA RÖRELSENS INTÄKTER = 96 611,97 | BERÄKNAT RESULTAT = 58 795,82

**Byggnadsställningsentreprenad:**
- Balansrapport: SUMMA TILLGÅNGAR = 20 646 658,73 | BERÄKNAT RESULTAT = 2 886 185,09
- Resultatrapport: SUMMA RÖRELSENS INTÄKTER = 37 486 819,37 | BERÄKNAT RESULTAT = 2 886 185,09

Write tests that query the views and assert these totals match.

## How to Run

```bash
# Prerequisites
npm install
npx supabase start
npx supabase db reset          # applies all migrations

# Import test data
npx tsx src/cli.ts SIE/RevILAB20260330_165333.se

# Run tests
npm test

# Query the view directly
# Use Supabase Studio at http://127.0.0.1:54423
```

## Constraints

- Create as a new migration: `supabase/migrations/00003_report_views.sql`
- Use SQL views or functions (not TypeScript) — reports should be queryable directly from Supabase client
- The views should accept financial_year_id as a parameter (use SQL functions with parameter, or create views that join on year_index = 0 for simplicity)
- Write tests in `src/__tests__/reports.test.ts`
- All existing 52 tests must still pass after your changes
