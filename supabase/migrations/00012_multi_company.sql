-- Migration 00012: Multi-company support
-- Adds company_id FK to all tables so multiple SIE4 imports can coexist

-- Drop cross-table FK constraints that reference single-column unique keys
-- These become invalid when unique keys become compound (company_id, ...)
-- Data integrity is enforced at the application layer
ALTER TABLE sru_codes DROP CONSTRAINT IF EXISTS sru_codes_account_number_fkey;
ALTER TABLE opening_balances DROP CONSTRAINT IF EXISTS opening_balances_account_number_fkey;
ALTER TABLE closing_balances DROP CONSTRAINT IF EXISTS closing_balances_account_number_fkey;
ALTER TABLE period_results DROP CONSTRAINT IF EXISTS period_results_account_number_fkey;
ALTER TABLE period_balances DROP CONSTRAINT IF EXISTS period_balances_account_number_fkey;
ALTER TABLE voucher_rows DROP CONSTRAINT IF EXISTS voucher_rows_account_number_fkey;
ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_dimension_number_fkey;

-- 1. financial_years
ALTER TABLE financial_years
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE financial_years SET company_id = (SELECT id FROM company_info LIMIT 1);
ALTER TABLE financial_years ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE financial_years DROP CONSTRAINT financial_years_year_index_key;
ALTER TABLE financial_years ADD CONSTRAINT financial_years_company_year_key
  UNIQUE(company_id, year_index);

-- 2. accounts
ALTER TABLE accounts
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE accounts SET company_id = (SELECT id FROM company_info LIMIT 1);
ALTER TABLE accounts ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE accounts DROP CONSTRAINT accounts_account_number_key;
ALTER TABLE accounts ADD CONSTRAINT accounts_company_account_key
  UNIQUE(company_id, account_number);

-- 3. dimensions
ALTER TABLE dimensions
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE dimensions SET company_id = (SELECT id FROM company_info LIMIT 1);
ALTER TABLE dimensions ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE dimensions DROP CONSTRAINT dimensions_dimension_number_key;
ALTER TABLE dimensions ADD CONSTRAINT dimensions_company_dim_key
  UNIQUE(company_id, dimension_number);

-- 4. objects
ALTER TABLE objects
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE objects SET company_id = (SELECT id FROM company_info LIMIT 1);
ALTER TABLE objects ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE objects DROP CONSTRAINT objects_dimension_number_object_number_key;
ALTER TABLE objects ADD CONSTRAINT objects_company_dim_obj_key
  UNIQUE(company_id, dimension_number, object_number);

-- 5. sru_codes
ALTER TABLE sru_codes
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE sru_codes SET company_id = (SELECT id FROM company_info LIMIT 1);
ALTER TABLE sru_codes ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE sru_codes DROP CONSTRAINT sru_codes_account_number_key;
ALTER TABLE sru_codes ADD CONSTRAINT sru_codes_company_account_key
  UNIQUE(company_id, account_number);

-- 6. opening_balances
ALTER TABLE opening_balances
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE opening_balances ob SET company_id = fy.company_id
  FROM financial_years fy WHERE ob.financial_year_id = fy.id;
ALTER TABLE opening_balances ALTER COLUMN company_id SET NOT NULL;

-- 7. closing_balances
ALTER TABLE closing_balances
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE closing_balances cb SET company_id = fy.company_id
  FROM financial_years fy WHERE cb.financial_year_id = fy.id;
ALTER TABLE closing_balances ALTER COLUMN company_id SET NOT NULL;

-- 8. period_results
ALTER TABLE period_results
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE period_results pr SET company_id = fy.company_id
  FROM financial_years fy WHERE pr.financial_year_id = fy.id;
ALTER TABLE period_results ALTER COLUMN company_id SET NOT NULL;

-- 9. period_balances
ALTER TABLE period_balances
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE period_balances pb SET company_id = fy.company_id
  FROM financial_years fy WHERE pb.financial_year_id = fy.id;
ALTER TABLE period_balances ALTER COLUMN company_id SET NOT NULL;

-- 10. period_budgets
ALTER TABLE period_budgets
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE period_budgets pb SET company_id = fy.company_id
  FROM financial_years fy WHERE pb.financial_year_id = fy.id;
ALTER TABLE period_budgets ALTER COLUMN company_id SET NOT NULL;

-- 11. vouchers
ALTER TABLE vouchers
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE vouchers v SET company_id = fy.company_id
  FROM financial_years fy WHERE v.financial_year_id = fy.id;
ALTER TABLE vouchers ALTER COLUMN company_id SET NOT NULL;

-- Indexes for company_id filtering
CREATE INDEX idx_financial_years_company ON financial_years(company_id);
CREATE INDEX idx_accounts_company ON accounts(company_id);
CREATE INDEX idx_dimensions_company ON dimensions(company_id);
CREATE INDEX idx_objects_company ON objects(company_id);
CREATE INDEX idx_vouchers_company ON vouchers(company_id);
CREATE INDEX idx_opening_balances_company ON opening_balances(company_id);
CREATE INDEX idx_closing_balances_company ON closing_balances(company_id);

-- Update report functions to scope accounts by company
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
  WHERE a.company_id = (SELECT company_id FROM financial_years WHERE id = p_financial_year_id)
    AND a.account_number >= 1000
    AND a.account_number < 3000
    AND (COALESCE(ib.amount, 0) != 0 OR COALESCE(ub.amount, 0) != 0)
  ORDER BY a.account_number;
$$;

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
      AND company_id = (SELECT company_id FROM financial_years WHERE id = p_financial_year_id)
    )
  WHERE a.company_id = (SELECT company_id FROM financial_years WHERE id = p_financial_year_id)
    AND a.account_number >= 3000
    AND a.account_number < 9000
    AND (COALESCE(res.amount, 0) != 0 OR COALESCE(res_prev.amount, 0) != 0)
  ORDER BY a.account_number;
$$;
