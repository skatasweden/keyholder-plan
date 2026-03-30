# SIE4 Accounting Frontend — Design Spec

## Context

KEYHOLDER has a complete SIE4 import pipeline (parser + importer + validator, 69 tests passing, 3 real companies verified to ore precision against Fortnox). The data lives in 14 Supabase tables with 2 SQL report functions. What's missing is a frontend to import SIE4 files, browse all accounting data, and validate it against the source system.

This spec defines a **standalone full accounting program frontend** — not just a viewer, but a working tool for daily accounting work. It supports multiple companies and includes a visual validation dashboard with Fortnox auto-compare.

## Architecture: SPA + Direct Supabase + Thin Import Server

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   React SPA      │────▶│   Supabase       │     │  Import Server   │
│   (Vite, port    │     │   (14 tables +   │◀────│  (Hono, port     │
│    5173)         │     │    2 RPC funcs)   │     │   3003)          │
└──────────────────┘     └──────────────────┘     └──────────────────┘
       │                                                  ▲
       │  POST /api/import (SIE4 file)                   │
       │  POST /api/validate/fortnox (HTML file)         │
       └─────────────────────────────────────────────────┘
```

**Why this split:**
- 95% of operations are reads — supabase-js handles these directly from the browser
- Balansrapport and Resultatrapport use existing SQL functions via `client.rpc()`
- Import server needed only because `iconv-lite` (CP437) and `cheerio` (HTML parsing) require Node.js
- Server is ~100 lines of Hono code reusing the existing pipeline verbatim

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | React 19 | Same ecosystem as AI-REDOVISNING |
| Bundler | Vite 6 | Fast HMR, ESM-native |
| Styling | Tailwind CSS 3.4 | Design tokens from FRONTEND_GUIDELINES.md |
| Data fetching | TanStack Query v5 | Caching, deduplication, stale-while-revalidate |
| DB client | @supabase/supabase-js | Direct reads, RPC calls |
| Routing | React Router 7 | URL-based company/view navigation |
| Import server | Hono | Lightweight, TypeScript, 2 endpoints |

## Prerequisite: Multi-Company Database Migration

The current schema has global unique constraints. Importing a second company would collide on `account_number`, `year_index`, etc. A migration `00012_multi_company.sql` must:

1. Add `company_id uuid NOT NULL REFERENCES company_info(id)` to: `financial_years`, `accounts`, `dimensions`, `objects`, `sru_codes`, `opening_balances`, `closing_balances`, `period_results`, `period_balances`, `period_budgets`, `vouchers`
2. Amend all UNIQUE constraints to include `company_id`
3. Update `report_balansrapport` and `report_resultatrapport` functions (the accounts JOIN needs `company_id` since account_number is no longer globally unique)
4. Update `sie4-importer.ts` to pass `company_id` to all upserts
5. Add indexes on `company_id` for query performance

## Folder Structure

```
KEYHOLDER/
  app/                              # New standalone frontend
    package.json
    vite.config.ts
    tailwind.config.ts
    index.html                      # Google Fonts: Fraunces + DM Sans
    src/
      main.tsx                      # QueryClientProvider + BrowserRouter
      App.tsx                       # Route definitions
      globals.css                   # Tailwind directives + CSS custom properties
      lib/
        supabase.ts                 # Singleton client (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
        query-client.ts             # staleTime: 60s, gcTime: 10min
        query-keys.ts               # Hierarchical key factory
        format.ts                   # Swedish number/date formatting
        account-groups.ts           # BAS account range definitions for report grouping
      hooks/
        useCompanies.ts             # List + switch active company
        useFinancialYears.ts        # FYs for active company
        useAccounts.ts              # Chart of accounts
        useVouchers.ts              # Paginated voucher list + detail
        useHuvudbok.ts              # General ledger per account
        useBalansrapport.ts         # client.rpc('report_balansrapport')
        useResultatrapport.ts       # client.rpc('report_resultatrapport')
        useDimensions.ts            # Dimensions + objects
        useValidation.ts            # 10 validation checks
        useImport.ts                # Upload to import server
      features/
        overview/
          OverviewPage.tsx          # Company summary + stats
        import/
          ImportPage.tsx            # SIE4 file upload + progress
        kontoplan/
          KontoplanPage.tsx         # Searchable account list
        huvudbok/
          HuvudbokPage.tsx          # Per-account general ledger
        verifikationer/
          VoucherListPage.tsx       # Paginated voucher browser
          VoucherDetailPage.tsx     # Single voucher with rows
        balansrapport/
          BalansrapportPage.tsx     # Balance sheet with BAS grouping
        resultatrapport/
          ResultatrapportPage.tsx   # Income statement with BAS grouping
        validation/
          ValidationPage.tsx        # 10-check dashboard + Fortnox compare
        dimensions/
          DimensionsPage.tsx        # Dimension/object browser
      components/
        ui/
          Button.tsx
          Card.tsx
          Table.tsx
          Badge.tsx
          SearchInput.tsx
          LoadingSpinner.tsx
          DropZone.tsx
        layout/
          AppLayout.tsx             # Sidebar (260px) + content area
          Sidebar.tsx               # Nav links grouped by section
          CompanySwitcher.tsx       # Dropdown: company name + org_number
  server/                           # Thin import server
    index.ts                        # Hono: POST /api/import + POST /api/validate/fortnox
    package.json
```

## Routing

```
/                                   → Redirect to first company or import page
/import                             → SIE4 import (no company selected)
/company/:companyId                 → Overview
/company/:companyId/kontoplan       → Chart of accounts
/company/:companyId/huvudbok        → General ledger
/company/:companyId/verifikationer  → Voucher browser
/company/:companyId/verifikationer/:id → Voucher detail
/company/:companyId/balansrapport   → Balance sheet
/company/:companyId/resultatrapport → Income statement
/company/:companyId/validering      → Validation dashboard
/company/:companyId/dimensioner     → Dimensions & cost centers
```

## The 8 Views

### 1. SIE4 Import (`/import`)

- Drag-and-drop zone for `.se` files
- Upload sends multipart to `POST /api/import` on import server
- Server runs: `parseSIE4(buffer)` → `importToSupabase(parsed, client)` → returns `ImportResult`
- Shows progress/result: table row counts, parse errors, CRC status, duration
- On success: redirect to `/company/:companyId` (overview)

### 2. Overview (`/company/:companyId`)

- Company info card: name, org_number, address, account plan type, currency
- Stat cards (4-grid): account count, voucher count, validation score, financial year count
- Latest import card: filename, date, error count, CRC status
- Financial year selector (used across all views)

### 3. Kontoplan (`/company/:companyId/kontoplan`)

- Query: `supabase.from('accounts').select('*').eq('company_id', companyId).order('account_number')`
- Join SRU codes: `supabase.from('sru_codes').select('*').eq('company_id', companyId)`
- Searchable table: account_number, name, type (T/S/K/I as badge), SRU code, quantity_unit
- Filter by: account type, account range (1xxx, 2xxx, etc.), text search

### 4. Huvudbok (`/company/:companyId/huvudbok`)

- Account selector (search dropdown)
- Financial year selector
- Query opening balance: `opening_balances` where `account_number` + `financial_year_id` + `dimension_number IS NULL`
- Query transactions: `voucher_rows` joined with `vouchers` for date/series/number
- Table: Vernr, Datum, Text, Debet, Kredit, Saldo (running balance)
- Running balance computed client-side from opening balance + cumulative amounts
- Totals: Omslutning (total debet/kredit), Utgående saldo

### 5. Verifikationer (`/company/:companyId/verifikationer`)

- Query: `supabase.from('vouchers').select('*, voucher_rows(*)').eq('financial_year_id', fyId).order('date', { ascending: false })`
- Paginated: 50 per page
- Collapsed row: Series badge, number, date, description, sum amount
- Expanded row: full debet/kredit table with account numbers, dimensions
- Filters: series (A/B/C...), date range, text search

### 6. Balansrapport (`/company/:companyId/balansrapport`)

- Query: `supabase.rpc('report_balansrapport', { p_financial_year_id: fyId })`
- Financial year selector
- Grouped by BAS account ranges (account-groups.ts):
  - TILLGÅNGAR (1000-1999): Anläggningstillgångar, Omsättningstillgångar
  - EGET KAPITAL, AVSÄTTNINGAR OCH SKULDER (2000-2999)
- Columns: Konto, Kontonamn, Ing. balans, Period, Utg. balans
- Group subtotals computed client-side
- BERÄKNAT RESULTAT at bottom
- **Sign convention:** DB values match Fortnox directly, no sign flip needed
- `parseFloat()` on all numeric RPC returns (Supabase returns numeric as string)

### 7. Resultatrapport (`/company/:companyId/resultatrapport`)

- Query: `supabase.rpc('report_resultatrapport', { p_financial_year_id: fyId })`
- Financial year selector
- Grouped: Rörelsens intäkter, Rörelsens kostnader, Rörelseresultat, Finansiella poster, etc.
- **Sign convention:** DB value = -1 x Fortnox displayed value. The SQL function or client-side must negate for display (revenue positive, costs negative).
- BERÄKNAT RESULTAT at bottom

### 8. Validering (`/company/:companyId/validering`)

- Runs 10 validation checks client-side (adapted from `sie4-validator.ts`):
  1. Account count (DB >= parsed)
  2. Voucher count per series (exact match)
  3. Voucher row count (total)
  4. Opening balances (IB) amount match (tolerance: 0.005)
  5. Closing balances (UB) amount match (tolerance: 0.005)
  6. Voucher balance (each voucher's TRANS rows sum to 0)
  7. Period results (RES) amount match
  8. Period balances (PSALDO) amount match
  9. Object count (exact match)
  10. BTRANS/RTRANS type flags (count match)
- Each check: green/red badge, name, expected vs actual
- Overall score: large Fraunces heading "10/10"
- **Fortnox compare section:**
  - Drop zone for Fortnox HTML report
  - Upload to `POST /api/validate/fortnox` → server parses with cheerio → returns structured data
  - Side-by-side comparison: DB amounts vs Fortnox amounts per account
  - Auto-detect report type (Balansrapport, Resultatrapport, Huvudbok, Verifikationslista)

### 9. Dimensioner (`/company/:companyId/dimensioner`)

- Query: `supabase.from('dimensions').select('*').eq('company_id', companyId)`
- For each dimension: nested list of objects
- Hierarchy: sub-dimensions via `parent_dimension`
- Per-object balances from `opening_balances`/`closing_balances` where `dimension_number IS NOT NULL`

## Import Server

**File: `server/index.ts`** — 2 endpoints, ~100 lines

Imports existing pipeline code directly:
```typescript
import { parseSIE4 } from '../src/sie4-parser.js'
import { importToSupabase } from '../src/sie4-importer.js'
import { parseBalansHtml, parseResultatHtml } from '../src/fortnox-html-parser.js'
```

**`POST /api/import`** — multipart file upload
1. Receive `.se` file buffer
2. `parseSIE4(buffer)` (CP437 decode + parse all tags)
3. Look up or create `company_info` by `org_number`
4. `importToSupabase(parsed, serviceClient, companyId)` (FK-ordered upserts)
5. Return `ImportResult` JSON (table counts, errors, duration)

**`POST /api/validate/fortnox`** — multipart HTML upload
1. Receive HTML string
2. Auto-detect report type by content
3. Parse with appropriate cheerio-based function
4. Return structured JSON (account numbers + amounts)

**Config:** CORS for Vite dev origin. Uses `SUPABASE_SERVICE_KEY` (never exposed to browser). Port 3003.

## Multi-Company Switching

- Active company stored in URL: `/company/:companyId/...`
- `CompanySwitcher` component in sidebar: dropdown of all companies from `company_info`
- Changing company navigates to new URL → all TanStack queries auto-refetch (companyId in query keys)
- Financial year selector per company, stored in URL search params: `?fy=<uuid>`
- First visit with no companies → redirect to `/import`

## Design System

Following FRONTEND_GUIDELINES.md:

| Token | Value |
|-------|-------|
| Background | `#f0e9df` (warm beige) |
| Card bg | white, `1.5px solid #d9cec4`, radius `18px` |
| Headings | Fraunces, weight 700-900, `letter-spacing: -0.04em` |
| Body text | DM Sans, weight 400-500, `#62493e` |
| Muted text | `#7a6358` (4.6:1 contrast verified) |
| Dark text | `#1a0f09` |
| Accent | `#f04e3e` (red), hover: `#c93526` |
| Buttons | pill `border-radius: 9999px`, `transition: background 200ms, transform 200ms` |
| Hover | Always wrapped in `@media (hover: hover)` |
| Table rows | Alternating white / `#faf8f5` |
| Status pass | `#2d7a4f` green, 50% radius badge |
| Status fail | `#f04e3e` red |
| Stats | Fraunces 900, `clamp()` sizing |
| Report groups | Dark header row (`#1a0f09` bg, white text), Fraunces |

## Data Fetching Patterns

- **staleTime: 60s** — accounting data changes rarely (only on import)
- **All queries include companyId in key** — company switch invalidates everything
- **RPC numeric handling:** All `client.rpc()` returns parsed through `parseFloat()` in hooks
- **Pagination:** vouchers use `.range()`, 50 per page
- **Huvudbok running balance:** computed client-side from opening balance + sorted transactions

## Implementation Phases

1. **Phase 0: DB migration** — `00012_multi_company.sql` + update `sie4-importer.ts`
2. **Phase 1: Scaffold** — Vite app, dependencies, Tailwind config, design tokens
3. **Phase 2: Core lib** — supabase client, query-client, query-keys, format utils, account-groups
4. **Phase 3: Layout** — AppLayout, Sidebar, CompanySwitcher, router skeleton
5. **Phase 4a: Import + Overview** — import server + import page + overview (enables testing with real data)
6. **Phase 4b: Reports** — Balansrapport + Resultatrapport (high value, use existing SQL functions)
7. **Phase 4c: Data browsing** — Kontoplan + Verifikationer + Huvudbok
8. **Phase 4d: Tools** — Validation dashboard + Dimensioner
9. **Phase 5: Polish** — responsive, animations, edge cases

## Critical Files to Modify

| File | Change |
|------|--------|
| `src/sie4-importer.ts` | Add `companyId` parameter, pass to all upserts, update `onConflict` strings |
| `src/sie4-validator.ts` | Add `companyId` filter to all DB queries |
| `supabase/migrations/` | New `00012_multi_company.sql` |
| `src/types.ts` | Add `company_id` to relevant interfaces |

## Critical Files to Reuse

| File | Reused by |
|------|-----------|
| `src/sie4-parser.ts` | Import server (verbatim) |
| `src/sie4-importer.ts` | Import server (after company_id update) |
| `src/fortnox-html-parser.ts` | Import server validation endpoint |
| `src/types.ts` | Shared between server and frontend |
| `AI-REDOVISNING/FRONTEND_GUIDELINES.md` | Tailwind config + component styling |

## Verification Plan

1. **Import:** Upload each of the 3 test SIE4 files → verify company appears in switcher, correct table counts
2. **Kontoplan:** Compare account list against `src/__tests__/parser.test.ts` fixture expectations
3. **Balansrapport:** Verify "SUMMA TILLGÅNGAR" matches crosscheck values:
   - RevIL AB: 3,952,190.47
   - Skata Sweden AB: 430,607.53
   - Byggnadsställningsentreprenad: 20,646,658.73
4. **Resultatrapport:** Verify "BERÄKNAT RESULTAT" matches:
   - RevIL AB: 869,954.78
   - Skata Sweden AB: 58,795.82
   - Byggnadsställningsentreprenad: 2,886,185.09
5. **Validation:** All 10 checks green for each company
6. **Fortnox compare:** Upload HTML reports from `SIE/FORTNOX-CORRECT-DATA/` → verify auto-compare shows matching amounts
7. **Multi-company:** Import all 3 files, switch between them, verify data isolation
8. **Existing tests:** All 69 tests still pass after migration changes
