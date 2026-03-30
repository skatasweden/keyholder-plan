# Fortnox Crosscheck — Verification Status

> Proves parser-to-source accuracy: DB data == Fortnox data.

## Status: AUTOMATED AND VERIFIED (2026-03-30)

This crosscheck is now fully automated in `src/__tests__/fortnox-crosscheck.test.ts` (16 tests).

Hardcoded values from real Fortnox Balansrapport and Resultatrapport PDFs are compared against DB values for all 3 companies. Source PDFs in `SIE/FORTNOX-CORRECT-DATA/`.

### What's verified

| Company | Closing Balances (UB) | Opening Balances (IB) | Period Results (RES) | Totals |
|---------|----------------------|----------------------|---------------------|--------|
| RevIL AB | 27 accounts | 4 accounts | 9 accounts | SUMMA TILLGÅNGAR + BERÄKNAT RESULTAT |
| Skata Sweden AB | 7 accounts | — | 5 accounts | SUMMA TILLGÅNGAR + BERÄKNAT RESULTAT |
| Byggnadsställningsentreprenad | 8 accounts | — | 7 accounts | SUMMA TILLGÅNGAR + BERÄKNAT RESULTAT |

All values match to < 0.01 SEK (öre precision).

### Sign convention

- **Balansrapport (IB/UB):** DB values match Fortnox directly
- **Resultatrapport (RES):** Fortnox negates amounts for display (income=positive, costs=negative). DB stores raw SIE values (debit=positive, credit=negative). Formula: `DB value = -1 × Fortnox value`

### Running the crosscheck

```bash
npm test  # includes all 52 tests (parser + integration + fortnox crosscheck)
```

Requires local Supabase running with migrations applied.

## Manual Procedure (if needed)

If adding a new company or verifying a specific account not covered by automated tests:

1. Import the company's `.se` file: `npx tsx src/cli.ts SIE/<file>.se`
2. Query the DB for specific account balances:
   ```sql
   -- Closing balance (Utg balans)
   SELECT amount FROM closing_balances cb
   JOIN financial_years fy ON cb.financial_year_id = fy.id
   WHERE fy.year_index = 0 AND cb.account_number = <ACCOUNT>;

   -- Period result (Resultatrapport) — negate to match Fortnox display
   SELECT -amount AS fortnox_display FROM period_results pr
   JOIN financial_years fy ON pr.financial_year_id = fy.id
   WHERE fy.year_index = 0 AND pr.account_number = <ACCOUNT>;
   ```
3. Compare against the Fortnox PDF in `SIE/FORTNOX-CORRECT-DATA/`
