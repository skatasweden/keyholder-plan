-- Phase 1: Rename misleading columns
-- SIE spec calls these fields "kvantitet" (quantity), not "quarter"
-- The "name" field on voucher_rows is actually "sign" (signatur/signature)

ALTER TABLE opening_balances RENAME COLUMN quarter TO quantity;
ALTER TABLE closing_balances RENAME COLUMN quarter TO quantity;
ALTER TABLE period_balances RENAME COLUMN quarter TO quantity;
ALTER TABLE voucher_rows RENAME COLUMN quarter TO quantity;
ALTER TABLE voucher_rows RENAME COLUMN name TO sign;
