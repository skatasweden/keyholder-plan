-- Phase 8: #PBUDGET period budget data

CREATE TABLE period_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL,
  period integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  dimension_number integer,
  object_number text,
  UNIQUE(financial_year_id, account_number, period, dimension_number, object_number)
);

CREATE INDEX ON period_budgets(financial_year_id, period);

ALTER TABLE period_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read" ON period_budgets
  FOR SELECT TO authenticated USING (true);
