-- SIE4 Import Schema
-- 12 tables for storing Swedish SIE4 accounting data

-- 1. company_info
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

-- 2. financial_years
CREATE TABLE financial_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_index integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  UNIQUE(year_index)
);

-- 3. dimensions
CREATE TABLE dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_number integer NOT NULL UNIQUE,
  name text NOT NULL
);

-- 4. objects
CREATE TABLE objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_number integer NOT NULL REFERENCES dimensions(dimension_number),
  object_number text NOT NULL,
  name text NOT NULL,
  UNIQUE(dimension_number, object_number)
);

-- 5. accounts
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number integer NOT NULL UNIQUE,
  name text NOT NULL
);

-- 6. sru_codes
CREATE TABLE sru_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number integer NOT NULL REFERENCES accounts(account_number),
  sru_code text NOT NULL,
  UNIQUE(account_number)
);

-- 7. opening_balances
CREATE TABLE opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL REFERENCES accounts(account_number),
  amount decimal(15,2) NOT NULL,
  quarter integer NOT NULL DEFAULT 0,
  UNIQUE(financial_year_id, account_number)
);

-- 8. closing_balances
CREATE TABLE closing_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL REFERENCES accounts(account_number),
  amount decimal(15,2) NOT NULL,
  quarter integer NOT NULL DEFAULT 0,
  UNIQUE(financial_year_id, account_number)
);

-- 9. period_results
CREATE TABLE period_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL REFERENCES accounts(account_number),
  amount decimal(15,2) NOT NULL,
  UNIQUE(financial_year_id, account_number)
);

-- 10. period_balances
CREATE TABLE period_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL REFERENCES accounts(account_number),
  period integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  quarter integer NOT NULL DEFAULT 0,
  UNIQUE(financial_year_id, account_number, period)
);

-- 11. vouchers
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

-- 12. voucher_rows
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

-- Indexes
CREATE INDEX ON vouchers(series, voucher_number);
CREATE INDEX ON vouchers(financial_year_id);
CREATE INDEX ON voucher_rows(voucher_id);
CREATE INDEX ON voucher_rows(account_number);
CREATE INDEX ON opening_balances(financial_year_id);
CREATE INDEX ON closing_balances(financial_year_id);
CREATE INDEX ON period_balances(financial_year_id, period);

-- Row Level Security
ALTER TABLE company_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sru_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE closing_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_rows ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated users can read all data
-- (each customer gets their own Supabase project for isolation)
CREATE POLICY "authenticated_read" ON company_info FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON financial_years FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON dimensions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON objects FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON sru_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON opening_balances FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON closing_balances FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON period_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON period_balances FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON voucher_rows FOR SELECT TO authenticated USING (true);
