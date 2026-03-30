-- SIE4 Hardening: account types + year-scoped voucher uniqueness

-- 1. Add account_type column (T=asset, S=liability, K=cost, I=income)
ALTER TABLE accounts ADD COLUMN account_type text
  CHECK (account_type IN ('T', 'S', 'K', 'I'));

-- 2. Change voucher uniqueness to include financial year
-- Prevents voucher A-1 in 2024 from being overwritten by A-1 in 2025
ALTER TABLE vouchers DROP CONSTRAINT vouchers_series_voucher_number_key;
ALTER TABLE vouchers ADD CONSTRAINT vouchers_series_voucher_number_fy_key
  UNIQUE(series, voucher_number, financial_year_id);
