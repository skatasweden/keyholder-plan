-- Phase 3: Multi-dimension support for transaction rows
-- A single voucher row can reference multiple dimension/object pairs
-- e.g. {1 "456" 7 "47"} = cost center 456 + employee 47

CREATE TABLE voucher_row_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_row_id uuid NOT NULL REFERENCES voucher_rows(id) ON DELETE CASCADE,
  dimension_number integer NOT NULL,
  object_number text NOT NULL,
  UNIQUE(voucher_row_id, dimension_number)
);

CREATE INDEX ON voucher_row_objects(voucher_row_id);
CREATE INDEX ON voucher_row_objects(dimension_number, object_number);

ALTER TABLE voucher_row_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read" ON voucher_row_objects
  FOR SELECT TO authenticated USING (true);
