# Resultatrapport (Income Statement) — Technical Reference

## SQL Function

```sql
SELECT * FROM report_resultatrapport('financial-year-uuid');
```

Returns per-account rows with: `account_number`, `account_name`, `period`, `ackumulerat`, `period_fg_ar`

---

## Column Definitions

| Column | Meaning | Source | Formula |
|--------|---------|--------|---------|
| `account_number` | 4-digit BAS account | `accounts.account_number` | — |
| `account_name` | Account description | `accounts.name` | — |
| `period` | Current year amount (negated) | `period_results` | `-COALESCE(res.amount, 0)` |
| `ackumulerat` | Year-to-date (= period for annual) | Same as period | `-COALESCE(res.amount, 0)` |
| `period_fg_ar` | Previous year amount (negated) | `period_results` (year_index - 1) | `-COALESCE(res_prev.amount, 0)` |

**Note:** For annual reports, `period` and `ackumulerat` are identical. They differ only in monthly/quarterly reports (not yet implemented).

---

## Sign Convention (CRITICAL)

The Resultatrapport **negates all amounts** compared to the database. This is the Fortnox display convention:

| Account type | DB value (SIE convention) | Display value (negated) | Example |
|-------------|--------------------------|------------------------|---------|
| Revenue (3xxx) | **Negative** (credit) | **Positive** | 3041: DB=-842,640.00 -> Display=842,640.00 |
| Costs (4-7xxx) | **Positive** (debit) | **Negative** | 5420: DB=4,717.25 -> Display=-4,717.25 |
| Financial income (8300) | **Negative** (credit) | **Positive** | 8300: DB=-39,714.00 -> Display=39,714.00 |
| Financial costs (8400+) | **Positive** (debit) | **Negative** | 8423: DB=8,371.00 -> Display=-8,371.00 |
| Tax (8910) | **Negative** (credit) | **Positive** | 8910: DB=-183,885.00 -> Display=183,885.00 |

**Formula in SQL:** `display_value = -1 * db_amount`

This is already applied in the function output — the `period` column shows the Fortnox display value.

---

## Account Range Grouping (BAS Standard)

This is how Fortnox groups accounts in the Resultatrapport PDF. Use these ranges to compute subtotals client-side.

```
RORELSENS INTAKTER (Operating Income)
├── Nettoomsattning                        3000-3799
├── Ovriga rorelseintakter                 3800-3999
│   └── SUMMA RORELSENS INTAKTER           SUM(3000-3999)

RORELSENS KOSTNADER (Operating Costs)
├── Ravaror och fornodenheter              4000-4999
├── Ovriga externa kostnader               5000-6999
├── Personalkostnader                      7000-7699
├── Avskrivningar                          7800-7899
├── Ovriga rorelsekostnader                7900-7999
│   └── SUMMA RORELSENS KOSTNADER          SUM(4000-7999)

RORELSERESULTAT                            SUM(3000-7999)

Finansiella poster
├── Ranteintakter och liknande             8000-8299
├── Rantekostnader och liknande            8300-8499
│   └── SUMMA FINANSIELLA POSTER           SUM(8000-8499)

RESULTAT EFTER FINANSIELLA POSTER          SUM(3000-8499)

Bokslutsdispositioner                      8800-8899
Skatt                                      8900-8989
Arets resultat                             8990-8999

BERAKNAT RESULTAT                          SUM(all rows) = SUM(3000-8999)
```

---

## Previous Year Lookup

The function automatically resolves the previous financial year by looking up the `year_index` of the given `financial_year_id` and finding the year with `year_index - 1`:

```sql
LEFT JOIN period_results res_prev
  ON res_prev.financial_year_id = (
    SELECT id FROM financial_years
    WHERE year_index = (
      SELECT year_index - 1 FROM financial_years WHERE id = p_financial_year_id
    )
  )
```

If no previous year exists (single-year import), `period_fg_ar` will be 0 for all accounts.

---

## No Dimension Filtering Needed

Unlike the Balansrapport, the `period_results` table does **not** have `dimension_number` or `object_number` columns. It stores exactly one amount per `(financial_year_id, account_number)`. No dimension filtering is needed.

---

## Verified Values

| Company | SUMMA RORELSENS INTAKTER | BERAKNAT RESULTAT |
|---------|------------------------|-------------------|
| RevIL AB | 1,134,896.27 | 869,954.78 |
| Skata Sweden AB | 96,611.97 | 58,795.82 |
| Byggnadsställningsentreprenad | 37,486,819.37 | 2,886,185.09 |

### Accounting identity check

BERAKNAT RESULTAT from the Resultatrapport must equal BERAKNAT RESULTAT from the Balansrapport for the same company and year. This is the fundamental double-entry bookkeeping identity:

```
SUM(utg_balans for accounts 1000-2999) = SUM(period for accounts 3000-8999)
```

Both sides represent the year's unbooked profit/loss, computed from different data sources (balance accounts vs. income/cost accounts).

---

## Example Output (RevIL AB, abridged)

```
account_number | account_name              | period       | ackumulerat  | period_fg_ar
3041           | Forsaljning varor 25%     | 842640.00    | 842640.00    | 0.00
3051           | Forsaljning tjanster 25%  | 292255.30    | 292255.30    | 0.00
3740           | Oresavrundning            | 0.97         | 0.97         | 0.00
5420           | Forbrukningsinventarier   | -4717.25     | -4717.25     | 0.00
5615           | Leasingkostnad bilar      | -100047.40   | -100047.40   | 0.00
6430           | Revisionstjanster         | -67893.00    | -67893.00    | 0.00
8300           | Ranteintakter             | 39714.00     | 39714.00     | 0.00
8423           | Rantekostnader bank       | -8371.00     | -8371.00     | 0.00
```

Revenue (3xxx) shows as positive, costs (5-6xxx) as negative, interest income (8300) as positive, interest costs (8423) as negative. This matches Fortnox PDF layout.
