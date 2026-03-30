# Fortnox Crosscheck — Manual Verification

> One-time manual verification that the SIE4 parser correctly interprets
> Fortnox SIE4 exports. Proves the DB is a true mirror of the source system.

## Purpose

Automated tests prove parser-to-DB consistency (parsed data == DB data).
This crosscheck proves parser-to-source accuracy (DB data == Fortnox data).

## Procedure

Use RevIL AB (smallest file) for verification.

### 1. Balance Sheet (Balansräkning)

Open Fortnox → Rapporter → Balansräkning for 2025.

Pick 3 accounts and note the closing balance (UB):

| Account | Fortnox value | DB query | DB value | Match? |
|---------|--------------|----------|----------|--------|
| 1510 | _fill in_ | `SELECT amount FROM closing_balances cb JOIN financial_years fy ON cb.financial_year_id = fy.id WHERE fy.year_index = 0 AND cb.account_number = 1510;` | _fill in_ | |
| 1930 | _fill in_ | same query, account 1930 | _fill in_ | |
| 2640 | _fill in_ | same query, account 2640 | _fill in_ | |

### 2. Income Statement (Resultaträkning)

Open Fortnox → Rapporter → Resultaträkning for 2025.

Pick 3 accounts:

| Account | Fortnox value | DB query | DB value | Match? |
|---------|--------------|----------|----------|--------|
| 3001 | _fill in_ | `SELECT amount FROM period_results pr JOIN financial_years fy ON pr.financial_year_id = fy.id WHERE fy.year_index = 0 AND pr.account_number = 3001;` | _fill in_ | |
| 5420 | _fill in_ | same, account 5420 | _fill in_ | |

### 3. Specific Vouchers

Open Fortnox → Verifikationer. Pick voucher A-1 and one other:

| Voucher | Row | Fortnox account | Fortnox amount | DB amount | Match? |
|---------|-----|----------------|----------------|-----------|--------|
| A-1 | 1 | _fill in_ | _fill in_ | `SELECT account_number, amount FROM voucher_rows WHERE voucher_id = (SELECT id FROM vouchers WHERE series = 'A' AND voucher_number = 1) AND transaction_type = 'normal';` | |
| A-1 | 2 | _fill in_ | _fill in_ | | |

## Result

**Date verified:** _fill in_
**Verified by:** _fill in_
**All values match:** Yes / No

If any values don't match, investigate the specific parsing of that record type.
