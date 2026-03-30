# Balansrapport (Balance Sheet) — Technical Reference

## SQL Function

```sql
SELECT * FROM report_balansrapport('financial-year-uuid');
```

Returns per-account rows with: `account_number`, `account_name`, `ing_balans`, `period`, `utg_balans`

---

## Column Definitions

| Column | Meaning | Source | Formula |
|--------|---------|--------|---------|
| `account_number` | 4-digit BAS account | `accounts.account_number` | — |
| `account_name` | Account description | `accounts.name` | — |
| `ing_balans` | Opening balance (Ing balans) | `opening_balances` | `COALESCE(ib.amount, 0)` |
| `period` | Change during the year | Computed | `utg_balans - ing_balans` |
| `utg_balans` | Closing balance (Utg balans) | `closing_balances` | `COALESCE(ub.amount, 0)` |

**Note:** In Fortnox annual reports, "Ing saldo" = "Ing balans" (they only differ for monthly/quarterly reports). The function does not output a separate `ing_saldo` column.

---

## Account Range Grouping (BAS Standard)

This is how Fortnox groups accounts in the Balansrapport PDF. Use these ranges to compute subtotals client-side.

```
TILLGANGAR (Assets) — 1000-1999
├── Immateriella anlaggningstillgangar     1000-1099
├── Materiella anlaggningstillgangar       1100-1299
├── Finansiella anlaggningstillgangar      1300-1399
│   └── SUMMA ANLAGGNINGSTILLGANGAR        SUM(1000-1399)
├── Varulager                              1400-1499
├── Kortfristiga fordringar                1500-1799
├── Kassa och bank                         1900-1999
│   └── SUMMA OMSATTNINGSTILLGANGAR        SUM(1400-1999)
└── SUMMA TILLGANGAR                       SUM(1000-1999)

EGET KAPITAL, AVSATTNINGAR OCH SKULDER — 2000-2999
├── Eget kapital                           2080-2099
├── Obeskattade reserver                   2100-2199
├── Avsattningar                           2200-2299
├── Langfristiga skulder                   2300-2399
├── Kortfristiga skulder                   2400-2999
│   └── SUMMA EGET KAPITAL...              SUM(2000-2999)

BERAKNAT RESULTAT = SUMMA TILLGANGAR + SUMMA EGET KAPITAL...
                  = SUM(utg_balans for all rows)
```

**BERAKNAT RESULTAT** is the unbooked year-end profit/loss. It equals the difference between assets and liabilities/equity. In a fully booked year, account 2099 (Arets resultat) absorbs this and BERAKNAT RESULTAT becomes 0.

---

## Sign Convention

Balansrapport values are stored and displayed **as-is** — no sign flip:

| Account type | DB value | Display value | Example |
|-------------|----------|---------------|---------|
| Assets (1xxx) | Positive (debit) | Positive | 1930 Bank: +1,262,367.31 |
| Liabilities (2xxx) | Negative (credit) | Negative | 2840 Loan: -872,500.00 |
| Equity (2xxx) | Negative (credit) | Negative | 2081 Share capital: -100,000.00 |

This means:
- SUMMA TILLGANGAR is always **positive**
- SUMMA EGET KAPITAL... is always **negative**
- BERAKNAT RESULTAT = positive + negative = year's unbooked profit

---

## Dimension Filtering

Both `opening_balances` and `closing_balances` contain:
- **Aggregate rows** (`dimension_number IS NULL`): Total per account, from #IB/#UB tags
- **Per-object rows** (`dimension_number IS NOT NULL`): Per cost center/project, from #OIB/#OUB tags

The function filters `AND dimension_number IS NULL` on both joins. This is critical — without it, accounts with per-object breakdowns would return incorrect values because the LEFT JOIN could match multiple rows.

---

## Verified Values

| Company | SUMMA TILLGANGAR | BERAKNAT RESULTAT |
|---------|-----------------|-------------------|
| RevIL AB | 3,952,190.47 | 869,954.78 |
| Skata Sweden AB | 430,607.53 | 58,795.82 |
| Byggnadsställningsentreprenad | 20,646,658.73 | 2,886,185.09 |

---

## Example Output (RevIL AB, abridged)

```
account_number | account_name              | ing_balans  | period      | utg_balans
1210           | Inventarier               | 54500.00    | 0.00        | 54500.00
1221           | Inventarier avskr         | 61060.39    | 22800.00    | 83860.39
1229           | Ack avskr inventarier     | -38260.39   | -22800.00   | -61060.39
1510           | Kundfordringar            | 1043895.00  | -732626.00  | 311269.00
1930           | Bankkonto                 | 568640.31   | 693727.00   | 1262367.31
2081           | Aktiekapital              | -100000.00  | 0.00        | -100000.00
2440           | Leverantorsskulder        | -94137.76   | -76647.89   | -170785.65
...
```
