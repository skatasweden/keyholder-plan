-- Migration 00011: Report functions (balance sheet + income statement)
-- These SQL functions generate Fortnox-compatible Balansrapport and Resultatrapport
-- queryable via Supabase client.rpc()

-- ─────────────────────────────────────────────────────────────────────
-- report_balansrapport(financial_year_id)
-- Balance sheet with ing_balans, period, utg_balans per account
-- Only aggregate balances (dimension_number IS NULL), accounts 1000-2999
-- ─────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────
-- report_resultatrapport(financial_year_id)
-- Income statement with period, ackumulerat, period_fg_ar per account
-- All amounts negated per Fortnox display convention (revenue=positive, costs=negative)
-- Accounts 3000-8999
-- ─────────────────────────────────────────────────────────────────────
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
