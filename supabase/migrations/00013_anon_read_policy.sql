-- Migration 00013: Allow anon role to read all tables
-- The frontend uses the anon key (no auth). For local use this is fine.

CREATE POLICY "anon_read" ON company_info FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON financial_years FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON dimensions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON objects FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON accounts FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON sru_codes FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON opening_balances FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON closing_balances FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON period_results FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON period_balances FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON period_budgets FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON vouchers FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON voucher_rows FOR SELECT TO anon USING (true);
