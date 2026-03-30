-- Phase 4: Store per-object PSALDO data (previously discarded)
-- Adds dimension/object columns to period_balances
-- NULL dimension = aggregate entry, non-NULL = per-object entry

ALTER TABLE period_balances ADD COLUMN dimension_number integer;
ALTER TABLE period_balances ADD COLUMN object_number text;

-- Drop old unique constraint and add new one including dimension
ALTER TABLE period_balances
  DROP CONSTRAINT period_balances_financial_year_id_account_number_period_key;
ALTER TABLE period_balances
  ADD CONSTRAINT period_balances_fy_account_period_dim_key
  UNIQUE(financial_year_id, account_number, period, dimension_number, object_number);
