-- Phase 2: Store #TRANS transdat (individual transaction date)
ALTER TABLE voucher_rows ADD COLUMN transaction_date date;
