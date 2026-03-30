# KEYHOLDER Frontend — Status & Architecture

> **Last updated:** 2026-03-31
> **Status:** Working. All 9 views implemented. Verified with 3 real companies.

## What This Is

A standalone React accounting app that imports Swedish SIE4 files, stores data in local Supabase (14 tables), and displays it across 9 views. Multi-company support — multiple SIE4 imports coexist via `company_id` on all tables.

This is a local tool — no auth, no deployment. Reads/writes only to local Supabase running in Docker.

## Tech Stack

| What | Version | Purpose |
|------|---------|---------|
| React | 19 | UI framework |
| Vite | 6 | Dev server + bundler |
| Tailwind CSS | 3.4 | Styling (custom design tokens) |
| TanStack Query | v5 | Data fetching, caching, mutations |
| React Router | 7 | Client-side routing |
| @supabase/supabase-js | 2.49 | Browser reads from Supabase |
| Hono | 4.7 | Import server (Node.js, 2 endpoints) |

## How to Run

**All three must be running:**

```bash
# 1. Start local Supabase (Docker must be running)
cd "/Volumes/23 nov /Project/KEYHOLDER"
npx supabase start

# 2. Start the import server (port 3003)
cd server && npm run dev
# Loads SUPABASE_URL + SUPABASE_SERVICE_KEY from ../.env via --env-file flag

# 3. Start the frontend (port 5173, or 5174 if 5173 is taken)
cd app && npm run dev
```

Then open http://localhost:5173 (or :5174). You land on the Import page. Drag in a `.se` file to import.

**Import flow:** Browser -> Vite proxy (`/api/*`) -> Hono server (:3003) -> `src/sie4-parser.ts` + `src/sie4-importer.ts` -> Supabase. On success, redirects to company overview.

## Environment Files

### `app/.env` (frontend — browser-side, public)
```
VITE_SUPABASE_URL=http://127.0.0.1:54421
VITE_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
```

### Root `.env` (import server — service role, private)
```
SUPABASE_URL=http://127.0.0.1:54421
SUPABASE_SERVICE_KEY=eyJ...  (the sb_secret_* or JWT service_role key)
```

**Critical:** Supabase runs on port **54421** (not the default 54321). This is set in `supabase/config.toml`.

**Critical:** The anon key uses `sb_publishable_*` format (newer Supabase CLI). If the frontend gets **401 errors**, the key in `app/.env` is wrong. Get the correct one from `npx supabase status` — look for "Publishable" under Authentication Keys.

### `server/package.json`
The dev script uses `tsx watch --env-file=../.env index.ts` to auto-load the root `.env`. No dotenv package needed.

### `server/index.ts` CORS
Allows origins `http://localhost:5173` and `http://localhost:5174` (Vite may use either port).

## Architecture

```
Browser (React SPA)
  |
  |-- reads data --> Supabase REST API (anon key, port 54421)
  |                    |
  |                    v
  |                  14 tables + 2 RPC functions
  |                  RLS: anon_read policy on all tables
  |
  |-- /api/import -----> Vite proxy -----> Hono server (:3003)
  |-- /api/validate/ --> Vite proxy -----> Hono server (:3003)
                                              |
                                              |--> src/sie4-parser.ts (CP437 decode)
                                              |--> src/sie4-importer.ts (14 table upserts)
                                              |--> src/fortnox-html-parser.ts (cheerio)
                                              |
                                              v
                                           Supabase (service_role key)
```

## File Structure

```
app/
  .env                    — VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
  package.json            — React 19, Vite 6, Tailwind 3.4, TanStack Query v5
  vite.config.ts          — Proxy /api/* to localhost:3003, path alias @/ -> src/
  tailwind.config.ts      — Custom colors, fonts, border-radius tokens
  index.html              — Google Fonts (Fraunces + DM Sans)
  src/
    main.tsx              — React root: StrictMode + QueryClientProvider + BrowserRouter
    App.tsx               — 9 routes, all wrapped in AppLayout
    globals.css           — Tailwind directives + tabular-nums + reduced-motion
    vite-env.d.ts         — Vite type shim for import.meta.env
    lib/
      supabase.ts         — createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
      query-client.ts     — 60s staleTime, no refetchOnWindowFocus, 1 retry
      query-keys.ts       — Factory: companies, financialYears, accounts, vouchers, reports, etc.
      format.ts           — formatSEK() (sv-SE locale), formatDate(), parseNumeric()
      account-groups.ts   — BAS account ranges for Balans (1000-2999) and Resultat (3000-8999)
    hooks/
      useCompanies.ts     — SELECT from company_info ORDER BY company_name
      useFinancialYears.ts — SELECT from financial_years WHERE company_id, ORDER BY year_index DESC
      useAccounts.ts      — SELECT accounts + sru_codes WHERE company_id
      useVouchers.ts      — SELECT vouchers + voucher_rows WHERE financial_year_id, paginated (50/page)
      useHuvudbok.ts      — opening_balances + voucher_rows joined with vouchers, running balance
      useBalansrapport.ts — RPC report_balansrapport(p_financial_year_id), parseNumeric on results
      useResultatrapport.ts — RPC report_resultatrapport(p_financial_year_id), parseNumeric
      useDimensions.ts    — dimensions + objects + opening/closing balances per object
      useValidation.ts    — 10 client-side checks (counts, balances, existence)
      useImport.ts        — POST /api/import with FormData, invalidates companies cache
    components/
      layout/
        AppLayout.tsx     — Flex: Sidebar (260px sticky) + scrollable main
        Sidebar.tsx       — 3 sections: Data (4 links), Rapporter (2), Verktyg (2) + Import link
        CompanySwitcher.tsx — <select> with companies, navigates on change
      ui/
        LoadingSpinner.tsx — Animated border spinner
        DropZone.tsx      — Drag-and-drop + file input, onFile callback
        SearchInput.tsx   — Debounced input (300ms) with search icon
        Badge.tsx         — Account type: T=green, S=blue, K=orange, I=purple
    features/
      import/ImportPage.tsx       — DropZone + pending/success/error states
      overview/OverviewPage.tsx   — 4 stat cards + company info + FY list
      kontoplan/KontoplanPage.tsx — Search + type filter, account table with SRU
      huvudbok/HuvudbokPage.tsx   — Account dropdown + FY selector, ledger table
      verifikationer/VoucherListPage.tsx — Paginated, expandable rows, search
      balansrapport/BalansrapportPage.tsx — BAS grouped, SUMMA rows, FY selector
      resultatrapport/ResultatrapportPage.tsx — BAS grouped, 3 amount columns
      validation/ValidationPage.tsx — Score heading, 10 check cards, Fortnox upload
      dimensions/DimensionsPage.tsx — Accordion per dimension, object balance table

server/
  package.json            — Hono, tsx, iconv-lite, cheerio (devDep)
  tsconfig.json           — Includes ../src/**/*.ts to access parser/importer
  index.ts                — 2 endpoints: POST /api/import, POST /api/validate/fortnox
```

## Routes

| Path | Component | Data Source |
|------|-----------|-------------|
| `/import` | ImportPage | POST /api/import |
| `/company/:companyId` | OverviewPage | company_info, accounts, vouchers, dimensions (counts) |
| `/company/:companyId/kontoplan` | KontoplanPage | accounts, sru_codes |
| `/company/:companyId/huvudbok` | HuvudbokPage | opening_balances, voucher_rows + vouchers |
| `/company/:companyId/verifikationer` | VoucherListPage | vouchers + voucher_rows (paginated) |
| `/company/:companyId/balansrapport` | BalansrapportPage | RPC report_balansrapport |
| `/company/:companyId/resultatrapport` | ResultatrapportPage | RPC report_resultatrapport |
| `/company/:companyId/validering` | ValidationPage | Multiple count/sum queries |
| `/company/:companyId/dimensioner` | DimensionsPage | dimensions, objects, opening/closing balances |
| `*` (catch-all) | Navigate to /import | — |

## Database Migrations Added

### `00012_multi_company.sql`
- Added `company_id uuid NOT NULL REFERENCES company_info(id)` to 11 tables
- Dropped old single-column unique constraints, added compound ones with `company_id`
- Dropped cross-table FK constraints on `account_number` and `dimension_number` (integrity enforced at app layer)
- Updated `report_balansrapport` and `report_resultatrapport` SQL functions to scope by company
- Added indexes on `company_id` columns

### `00013_anon_read_policy.sql`
- Added `anon_read` RLS policy (`FOR SELECT TO anon USING (true)`) on all 13 tables
- Without this, the frontend (using the publishable/anon key) gets empty results — the original schema only had policies for the `authenticated` role

### Importer changes (`src/sie4-importer.ts`)
- Accepts optional `ImportOptions` with `companyId`
- Upserts company_info with `.select('id')` to get the company UUID
- Passes `company_id` to ALL row objects (11 tables)
- Uses compound `onConflict` strings: `'company_id,account_number'`, `'company_id,year_index'`, etc.
- Returns `companyId` in `ImportResult`

## Gotchas for AI Agents

1. **Port 54421** — not the Supabase default 54321. Check `supabase/config.toml`.
2. **Publishable key format** — `sb_publishable_*`, not the old JWT. Get from `npx supabase status`.
3. **`db reset` clears all data** — You need to re-import SIE4 files after reset. Test files are in `SIE/`.
4. **Server must be running for imports** — The frontend can't import without the Hono server on :3003.
5. **Vite proxy** — Frontend `/api/*` calls go to localhost:3003. If the server isn't running, imports fail silently (network error).
6. **Numeric strings** — Supabase returns `numeric` columns as strings. Always `parseFloat()` or use `parseNumeric()` from `lib/format.ts`.
7. **Sign conventions** — Balansrapport values match DB directly. Resultatrapport: the SQL function negates (revenue = positive, costs = negative). Don't negate again in the frontend.
8. **Import is idempotent** — Re-importing the same file upserts (updates existing rows). Voucher rows are deleted and re-inserted for idempotency.
9. **Don't modify `AI-REDOVISNING/`** — That's a separate app sharing the repo.
10. **Don't modify `src/sie4-parser.ts`** — Tested and complete, 104 tests depend on it.

## Known Issues & Things to Fix

### Must fix
1. **Voucher unique constraint not company-scoped** — `vouchers` table has `UNIQUE(series, voucher_number)` from migration 00001. Two companies with the same series+number will conflict on import. Needs migration to `UNIQUE(company_id, series, voucher_number, financial_year_id)`.
2. **CLI validator not company-scoped** — `src/sie4-validator.ts` queries globally (no `company_id` filter). Shows false failures with multiple companies. Frontend validation (`useValidation.ts`) is correctly scoped. CLI validator needs a `companyId` parameter.
3. **Report JOIN could cross companies** — `report_balansrapport` joins `opening_balances`/`closing_balances` on `account_number` only. Should also join on `financial_year_id` to prevent theoretically possible cross-company matches.

### Should fix
4. **No error boundaries** — A failed Supabase query crashes the whole page.
5. **Huvudbok performance** — Uses Supabase `!inner` join which may be slow for large companies. Consider an RPC function.
6. **Frontend validation is basic** — Only checks that data exists (counts > 0). Doesn't compare parsed vs DB values like the CLI validator does.
7. **Bundle size** — 513 KB JS. Could split with `React.lazy()`.

### Nice to have
8. **Fortnox compare is one-way** — Shows parsed Fortnox data but doesn't diff against imported SIE4 data.
9. **No mobile responsive** — Sidebar is fixed 260px, no collapse.
10. **Swedish chars in labels** — Uses ASCII-safe Swedish. Could use proper UTF-8.

## Design System

Defined in `tailwind.config.ts`:

**Colors:** `bg: #f0e9df`, `accent: #f04e3e`, `brown: #1a0f09`, `pass: #2d7a4f`, `fail: #f04e3e`

**Fonts:** Fraunces (display/headings), DM Sans (body). Loaded from Google Fonts in `index.html`.

**Numbers:** Use class `tabular-nums` for aligned financial columns.

**Radii:** `card: 18px`, `stat: 20px`, `badge: 6px`, `pill: 9999px`

## Verified Crosscheck Values

Imported all 3 test files (`SIE/*.se`) and verified in the frontend:

| Company | SUMMA TILLGANGAR (Balans) | BERAKNAT RESULTAT (Resultat) |
|---------|--------------------------|------------------------------|
| RevIL AB | 3 952 190,47 | 869 954,78 |
| Skata Sweden AB | 430 607,53 | 58 795,82 |
| Byggnadsst... i Stockholm AB | 20 646 658,73 | 2 886 185,09 |

## Testing

- **104 pipeline tests** pass (`npm test` from project root)
- **TypeScript** compiles clean (`cd app && npx tsc --noEmit`)
- **Vite build** succeeds (`cd app && npx vite build`)
- Frontend has no unit tests yet (all verification is visual + crosscheck values)
