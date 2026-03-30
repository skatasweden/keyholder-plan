-- Phase 7: #OIB / #OUB object-level opening/closing balances
-- Same structure as #IB/#UB but with a dimension/object reference

ALTER TABLE opening_balances ADD COLUMN dimension_number integer;
ALTER TABLE opening_balances ADD COLUMN object_number text;

ALTER TABLE opening_balances
  DROP CONSTRAINT opening_balances_financial_year_id_account_number_key;
ALTER TABLE opening_balances
  ADD CONSTRAINT opening_balances_fy_account_dim_key
  UNIQUE(financial_year_id, account_number, dimension_number, object_number);

ALTER TABLE closing_balances ADD COLUMN dimension_number integer;
ALTER TABLE closing_balances ADD COLUMN object_number text;

ALTER TABLE closing_balances
  DROP CONSTRAINT closing_balances_financial_year_id_account_number_key;
ALTER TABLE closing_balances
  ADD CONSTRAINT closing_balances_fy_account_dim_key
  UNIQUE(financial_year_id, account_number, dimension_number, object_number);
