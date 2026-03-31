-- KEYHOLDER Tenant Schema (Consolidated)
-- All 15 tables + RLS + functions for a customer's Supabase project
-- Generated from migrations 00001-00013 plus custom_pages

-- ============================================================
-- 1. company_info
-- ============================================================
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
  sni_code text,
  company_type text,
  comment text,
  tax_year integer,
  currency text DEFAULT 'SEK',
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 2. financial_years
-- ============================================================
CREATE TABLE financial_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company_info(id),
  year_index integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  UNIQUE(company_id, year_index)
);

-- ============================================================
-- 3. accounts
-- ============================================================
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company_info(id),
  account_number integer NOT NULL,
  name text NOT NULL,
  account_type text CHECK (account_type IN ('T', 'S', 'K', 'I')),
  quantity_unit text,
  UNIQUE(company_id, account_number)
);

-- ============================================================
-- 4. sru_codes
-- ============================================================
CREATE TABLE sru_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company_info(id),
  account_number integer NOT NULL,
  sru_code text NOT NULL,
  UNIQUE(company_id, account_number)
);

-- ============================================================
-- 5. dimensions
-- ============================================================
CREATE TABLE dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company_info(id),
  dimension_number integer NOT NULL,
  name text NOT NULL,
  parent_dimension integer,
  UNIQUE(company_id, dimension_number)
);

-- ============================================================
-- 6. objects
-- ============================================================
CREATE TABLE objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company_info(id),
  dimension_number integer NOT NULL,
  object_number text NOT NULL,
  name text NOT NULL,
  UNIQUE(company_id, dimension_number, object_number)
);

-- ============================================================
-- 7. vouchers
-- ============================================================
CREATE TABLE vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company_info(id),
  series text NOT NULL,
  voucher_number integer NOT NULL,
  date date NOT NULL,
  description text,
  registration_date date,
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(series, voucher_number, financial_year_id)
);

-- ============================================================
-- 8. voucher_rows
-- ============================================================
CREATE TABLE voucher_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  account_number integer NOT NULL,
  dim_number integer,
  object_number text,
  amount decimal(15,2) NOT NULL,
  description text,
  quantity integer NOT NULL DEFAULT 0,
  sign text,
  transaction_date date,
  transaction_type text NOT NULL DEFAULT 'normal'
    CHECK (transaction_type IN ('normal', 'btrans', 'rtrans'))
);

-- ============================================================
-- 9. voucher_row_objects
-- ============================================================
CREATE TABLE voucher_row_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_row_id uuid NOT NULL REFERENCES voucher_rows(id) ON DELETE CASCADE,
  dimension_number integer NOT NULL,
  object_number text NOT NULL,
  UNIQUE(voucher_row_id, dimension_number)
);

-- ============================================================
-- 10. opening_balances
-- ============================================================
CREATE TABLE opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company_info(id),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  dimension_number integer,
  object_number text,
  UNIQUE(financial_year_id, account_number, dimension_number, object_number)
);

-- ============================================================
-- 11. closing_balances
-- ============================================================
CREATE TABLE closing_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company_info(id),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  dimension_number integer,
  object_number text,
  UNIQUE(financial_year_id, account_number, dimension_number, object_number)
);

-- ============================================================
-- 12. period_results
-- ============================================================
CREATE TABLE period_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company_info(id),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  UNIQUE(financial_year_id, account_number)
);

-- ============================================================
-- 13. period_balances
-- ============================================================
CREATE TABLE period_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company_info(id),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL,
  period integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  dimension_number integer,
  object_number text,
  UNIQUE(financial_year_id, account_number, period, dimension_number, object_number)
);

-- ============================================================
-- 14. period_budgets
-- ============================================================
CREATE TABLE period_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company_info(id),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL,
  period integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  dimension_number integer,
  object_number text,
  UNIQUE(financial_year_id, account_number, period, dimension_number, object_number)
);

-- ============================================================
-- 15. custom_pages
-- ============================================================
CREATE TABLE custom_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  component_code text NOT NULL,
  icon text DEFAULT 'file-text',
  sort_order integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_financial_years_company ON financial_years(company_id);
CREATE INDEX idx_accounts_company ON accounts(company_id);
CREATE INDEX idx_dimensions_company ON dimensions(company_id);
CREATE INDEX idx_objects_company ON objects(company_id);
CREATE INDEX idx_vouchers_company ON vouchers(company_id);
CREATE INDEX idx_opening_balances_company ON opening_balances(company_id);
CREATE INDEX idx_closing_balances_company ON closing_balances(company_id);

CREATE INDEX ON vouchers(series, voucher_number);
CREATE INDEX ON vouchers(financial_year_id);
CREATE INDEX ON voucher_rows(voucher_id);
CREATE INDEX ON voucher_rows(account_number);
CREATE INDEX ON voucher_row_objects(voucher_row_id);
CREATE INDEX ON voucher_row_objects(dimension_number, object_number);
CREATE INDEX ON opening_balances(financial_year_id);
CREATE INDEX ON closing_balances(financial_year_id);
CREATE INDEX ON period_balances(financial_year_id, period);
CREATE INDEX ON period_budgets(financial_year_id, period);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE company_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sru_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_row_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE closing_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_pages ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated users can read and write all data
-- (each customer gets their own Supabase project for isolation)
CREATE POLICY "authenticated_read" ON company_info FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON financial_years FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON sru_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON dimensions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON objects FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON voucher_rows FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON voucher_row_objects FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON opening_balances FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON closing_balances FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON period_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON period_balances FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON period_budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON custom_pages FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_write" ON company_info FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write" ON financial_years FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write" ON accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write" ON sru_codes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write" ON dimensions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write" ON objects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write" ON vouchers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write" ON voucher_rows FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write" ON voucher_row_objects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write" ON opening_balances FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write" ON closing_balances FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write" ON period_results FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write" ON period_balances FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write" ON period_budgets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_write" ON custom_pages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon read policies (for local development / public dashboards)
CREATE POLICY "anon_read" ON company_info FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON financial_years FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON accounts FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON sru_codes FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON dimensions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON objects FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON vouchers FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON voucher_rows FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON voucher_row_objects FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON opening_balances FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON closing_balances FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON period_results FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON period_balances FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON period_budgets FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON custom_pages FOR SELECT TO anon USING (true);

-- ============================================================
-- Report Functions
-- ============================================================

-- Balance sheet: Balansrapport
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

-- Income statement: Resultatrapport
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

-- ============================================================
-- execute_readonly_query (for AI-powered SQL queries)
-- ============================================================
CREATE OR REPLACE FUNCTION execute_readonly_query(sql text, row_limit integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT (upper(trim(sql)) LIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  IF upper(sql) ~ '(DROP|DELETE|TRUNCATE|ALTER|CREATE|INSERT|UPDATE|GRANT|REVOKE)' THEN
    RAISE EXCEPTION 'Blocked keyword detected';
  END IF;
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (SELECT * FROM (%s) sub LIMIT %s) t', sql, row_limit)
  INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
