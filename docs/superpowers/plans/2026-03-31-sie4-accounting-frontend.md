# SIE4 Accounting Frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone React accounting program that imports SIE4 files, displays all data across 8 views, and validates against Fortnox.

**Architecture:** React 19 SPA reads directly from Supabase (14 tables + 2 RPC functions). A thin Hono server (2 endpoints) handles SIE4 file import and Fortnox HTML parsing — operations requiring Node.js (iconv-lite, cheerio). Multi-company support via new `company_id` column on all tables.

**Tech Stack:** React 19, Vite 6, Tailwind 3.4, TanStack Query v5, @supabase/supabase-js, React Router 7, Hono

---

## File Structure

```
app/
  package.json
  tsconfig.json
  vite.config.ts
  tailwind.config.ts
  postcss.config.mjs
  index.html
  .env
  src/
    main.tsx
    App.tsx
    globals.css
    lib/
      supabase.ts
      query-client.ts
      query-keys.ts
      format.ts
      account-groups.ts
    hooks/
      useCompanies.ts
      useFinancialYears.ts
      useAccounts.ts
      useVouchers.ts
      useHuvudbok.ts
      useBalansrapport.ts
      useResultatrapport.ts
      useDimensions.ts
      useValidation.ts
      useImport.ts
    features/
      overview/OverviewPage.tsx
      import/ImportPage.tsx
      kontoplan/KontoplanPage.tsx
      huvudbok/HuvudbokPage.tsx
      verifikationer/VoucherListPage.tsx
      verifikationer/VoucherDetailPage.tsx
      balansrapport/BalansrapportPage.tsx
      resultatrapport/ResultatrapportPage.tsx
      validation/ValidationPage.tsx
      dimensions/DimensionsPage.tsx
    components/
      ui/Button.tsx
      ui/Card.tsx
      ui/Table.tsx
      ui/Badge.tsx
      ui/SearchInput.tsx
      ui/LoadingSpinner.tsx
      ui/DropZone.tsx
      layout/AppLayout.tsx
      layout/Sidebar.tsx
      layout/CompanySwitcher.tsx
server/
  package.json
  tsconfig.json
  index.ts
```

---

## Task 1: Multi-Company Database Migration

**Files:**
- Create: `supabase/migrations/00012_multi_company.sql`
- Modify: `src/sie4-importer.ts`
- Modify: `src/sie4-validator.ts`
- Modify: `src/types.ts`
- Modify: `src/cli.ts`
- Test: `src/__tests__/parser.test.ts` (existing — must still pass)
- Test: `src/__tests__/integration.test.ts` (existing — must still pass)

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/00012_multi_company.sql`:

```sql
-- Migration 00012: Multi-company support
-- Adds company_id FK to all tables so multiple SIE4 imports can coexist

-- 1. financial_years
ALTER TABLE financial_years
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE financial_years SET company_id = (SELECT id FROM company_info LIMIT 1);
ALTER TABLE financial_years ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE financial_years DROP CONSTRAINT financial_years_year_index_key;
ALTER TABLE financial_years ADD CONSTRAINT financial_years_company_year_key
  UNIQUE(company_id, year_index);

-- 2. accounts
ALTER TABLE accounts
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE accounts SET company_id = (SELECT id FROM company_info LIMIT 1);
ALTER TABLE accounts ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE accounts DROP CONSTRAINT accounts_account_number_key;
ALTER TABLE accounts ADD CONSTRAINT accounts_company_account_key
  UNIQUE(company_id, account_number);

-- 3. dimensions
ALTER TABLE dimensions
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE dimensions SET company_id = (SELECT id FROM company_info LIMIT 1);
ALTER TABLE dimensions ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE dimensions DROP CONSTRAINT dimensions_dimension_number_key;
ALTER TABLE dimensions ADD CONSTRAINT dimensions_company_dim_key
  UNIQUE(company_id, dimension_number);

-- 4. objects
ALTER TABLE objects
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE objects SET company_id = (SELECT id FROM company_info LIMIT 1);
ALTER TABLE objects ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE objects DROP CONSTRAINT objects_dimension_number_object_number_key;
ALTER TABLE objects ADD CONSTRAINT objects_company_dim_obj_key
  UNIQUE(company_id, dimension_number, object_number);

-- 5. sru_codes
ALTER TABLE sru_codes
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE sru_codes SET company_id = (SELECT id FROM company_info LIMIT 1);
ALTER TABLE sru_codes ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE sru_codes DROP CONSTRAINT sru_codes_account_number_key;
ALTER TABLE sru_codes ADD CONSTRAINT sru_codes_company_account_key
  UNIQUE(company_id, account_number);

-- 6. opening_balances — already has financial_year_id which is now company-scoped
-- But we add company_id for direct filtering in queries
ALTER TABLE opening_balances
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE opening_balances ob SET company_id = fy.company_id
  FROM financial_years fy WHERE ob.financial_year_id = fy.id;
ALTER TABLE opening_balances ALTER COLUMN company_id SET NOT NULL;

-- 7. closing_balances
ALTER TABLE closing_balances
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE closing_balances cb SET company_id = fy.company_id
  FROM financial_years fy WHERE cb.financial_year_id = fy.id;
ALTER TABLE closing_balances ALTER COLUMN company_id SET NOT NULL;

-- 8. period_results
ALTER TABLE period_results
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE period_results pr SET company_id = fy.company_id
  FROM financial_years fy WHERE pr.financial_year_id = fy.id;
ALTER TABLE period_results ALTER COLUMN company_id SET NOT NULL;

-- 9. period_balances
ALTER TABLE period_balances
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE period_balances pb SET company_id = fy.company_id
  FROM financial_years fy WHERE pb.financial_year_id = fy.id;
ALTER TABLE period_balances ALTER COLUMN company_id SET NOT NULL;

-- 10. period_budgets
ALTER TABLE period_budgets
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE period_budgets pb SET company_id = fy.company_id
  FROM financial_years fy WHERE pb.financial_year_id = fy.id;
ALTER TABLE period_budgets ALTER COLUMN company_id SET NOT NULL;

-- 11. vouchers — already has financial_year_id which is company-scoped
ALTER TABLE vouchers
  ADD COLUMN company_id uuid REFERENCES company_info(id);
UPDATE vouchers v SET company_id = fy.company_id
  FROM financial_years fy WHERE v.financial_year_id = fy.id;
ALTER TABLE vouchers ALTER COLUMN company_id SET NOT NULL;

-- Indexes for company_id filtering
CREATE INDEX idx_financial_years_company ON financial_years(company_id);
CREATE INDEX idx_accounts_company ON accounts(company_id);
CREATE INDEX idx_dimensions_company ON dimensions(company_id);
CREATE INDEX idx_objects_company ON objects(company_id);
CREATE INDEX idx_vouchers_company ON vouchers(company_id);
CREATE INDEX idx_opening_balances_company ON opening_balances(company_id);
CREATE INDEX idx_closing_balances_company ON closing_balances(company_id);

-- Update report functions to scope accounts by company
CREATE OR REPLACE FUNCTION report_balansrapport(p_financial_year_id uuid)
RETURNS TABLE (
  account_number integer,
  account_name text,
  ing_balans numeric,
  period numeric,
  utg_balans numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    a.account_number,
    a.name,
    COALESCE(ib.amount, 0),
    COALESCE(ub.amount, 0) - COALESCE(ib.amount, 0),
    COALESCE(ub.amount, 0)
  FROM accounts a
  LEFT JOIN opening_balances ib
    ON ib.account_number = a.account_number
    AND ib.financial_year_id = p_financial_year_id
    AND ib.dimension_number IS NULL
  LEFT JOIN closing_balances ub
    ON ub.account_number = a.account_number
    AND ub.financial_year_id = p_financial_year_id
    AND ub.dimension_number IS NULL
  WHERE a.company_id = (SELECT company_id FROM financial_years WHERE id = p_financial_year_id)
    AND a.account_number >= 1000
    AND a.account_number < 3000
    AND (COALESCE(ib.amount, 0) != 0 OR COALESCE(ub.amount, 0) != 0)
  ORDER BY a.account_number;
$$;

CREATE OR REPLACE FUNCTION report_resultatrapport(p_financial_year_id uuid)
RETURNS TABLE (
  account_number integer,
  account_name text,
  period numeric,
  ackumulerat numeric,
  period_fg_ar numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    a.account_number,
    a.name,
    -COALESCE(res.amount, 0),
    -COALESCE(res.amount, 0),
    -COALESCE(res_prev.amount, 0)
  FROM accounts a
  LEFT JOIN period_results res
    ON res.account_number = a.account_number
    AND res.financial_year_id = p_financial_year_id
  LEFT JOIN period_results res_prev
    ON res_prev.account_number = a.account_number
    AND res_prev.financial_year_id = (
      SELECT id FROM financial_years
      WHERE year_index = (
        SELECT year_index - 1 FROM financial_years WHERE id = p_financial_year_id
      )
      AND company_id = (SELECT company_id FROM financial_years WHERE id = p_financial_year_id)
    )
  WHERE a.company_id = (SELECT company_id FROM financial_years WHERE id = p_financial_year_id)
    AND a.account_number >= 3000
    AND a.account_number < 9000
    AND (COALESCE(res.amount, 0) != 0 OR COALESCE(res_prev.amount, 0) != 0)
  ORDER BY a.account_number;
$$;

-- RLS policies for new tables with company_id (period_budgets already has one)
-- No changes needed — existing authenticated_read policies cover all rows
```

- [ ] **Step 2: Update `src/types.ts` — add `company_id` to `ImportResult`**

Add after line 115 (after the ParsedSIE4 interface):

```typescript
export interface ImportOptions {
  companyId?: string  // If provided, use this company; otherwise upsert by org_number
}
```

- [ ] **Step 3: Update `src/sie4-importer.ts` — add company_id to all upserts**

Change the function signature (line 6-9):

```typescript
export async function importToSupabase(
  parsed: ParsedSIE4,
  client: SupabaseClient,
  options?: ImportOptions
): Promise<ImportResult> {
```

After the company_info upsert (around line 48), capture the company_id:

```typescript
const companyId = options?.companyId ?? companyResult.data?.[0]?.id
if (!companyId) throw new Error('Failed to get company_id after upsert')
```

Then add `company_id: companyId` to every upsert row object:
- `financial_years` rows: add `company_id: companyId`
- `accounts` rows: add `company_id: companyId`
- `dimensions` rows: add `company_id: companyId`
- `objects` rows: add `company_id: companyId`
- `sru_codes` rows: add `company_id: companyId`
- `opening_balances` rows: add `company_id: companyId`
- `closing_balances` rows: add `company_id: companyId`
- `period_results` rows: add `company_id: companyId`
- `period_balances` rows: add `company_id: companyId`
- `period_budgets` rows: add `company_id: companyId`
- `vouchers` rows: add `company_id: companyId`

Update all `onConflict` strings to include `company_id`:
- `financial_years`: `'company_id,year_index'`
- `accounts`: `'company_id,account_number'`
- `dimensions`: `'company_id,dimension_number'`
- `objects`: `'company_id,dimension_number,object_number'`
- `sru_codes`: `'company_id,account_number'`

Balance/voucher tables keep their existing onConflict (they reference `financial_year_id` which is already company-scoped).

Return `companyId` in the ImportResult — add to stats:

```typescript
return { success: true, companyId, stats: { ... }, ... }
```

- [ ] **Step 4: Update `src/sie4-validator.ts` — no changes needed**

The validator queries by `financial_year_id` (already company-scoped after migration) and counts from the parsed data. No company_id filtering needed since the parsed data is always for one company.

- [ ] **Step 5: Apply migration and run tests**

```bash
cd "/Volumes/23 nov /Project/KEYHOLDER"
npx supabase db reset
npm test
```

Expected: All 69 tests pass (migration backfills company_id from existing data).

- [ ] **Step 6: Test multi-company isolation**

Import two different SIE4 files and verify they coexist:

```bash
npx tsx src/cli.ts SIE/RevILAB20260330_165333.se
npx tsx src/cli.ts SIE/SkataSwedenAB20260330_170222.se
```

Verify in Supabase Studio (http://127.0.0.1:54423): `company_info` has 2 rows, each with different `id`. Accounts table has rows for both companies.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/00012_multi_company.sql src/sie4-importer.ts src/types.ts
git commit -m "feat: add multi-company support to SIE4 pipeline

Add company_id column to all 11 tables, update unique constraints,
update report functions to scope by company, update importer to pass
company_id to all upserts."
```

---

## Task 2: Scaffold Frontend App

**Files:**
- Create: `app/package.json`
- Create: `app/tsconfig.json`
- Create: `app/vite.config.ts`
- Create: `app/tailwind.config.ts`
- Create: `app/postcss.config.mjs`
- Create: `app/index.html`
- Create: `app/.env`
- Create: `app/src/main.tsx`
- Create: `app/src/App.tsx`
- Create: `app/src/globals.css`

- [ ] **Step 1: Create `app/package.json`**

```json
{
  "name": "keyholder-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "@tanstack/react-query": "^5.64.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.4.0"
  },
  "devDependencies": {
    "@tanstack/react-query-devtools": "^5.64.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.5.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0",
    "vite": "^6.2.0"
  }
}
```

- [ ] **Step 2: Create `app/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `app/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3003',
    },
  },
})
```

- [ ] **Step 4: Create `app/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f0e9df',
        'bg-alt': '#e6ddd2',
        accent: '#f04e3e',
        'accent-dark': '#c93526',
        'accent-light': '#fce0dd',
        brown: '#1a0f09',
        'brown-mid': '#362318',
        'text-body': '#62493e',
        'text-muted': '#7a6358',
        border: '#d9cec4',
        pass: '#2d7a4f',
        fail: '#f04e3e',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '18px',
        stat: '20px',
        badge: '6px',
        pill: '9999px',
      },
      boxShadow: {
        'card-hover': '0 16px 40px rgba(30, 19, 12, 0.08)',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 5: Create `app/postcss.config.mjs`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: Create `app/index.html`**

```html
<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>KEYHOLDER — Redovisning</title>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,700;0,9..144,800;0,9..144,900;1,9..144,800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `app/src/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background: #f0e9df;
  font-family: 'DM Sans', system-ui, sans-serif;
  color: #362318;
}

/* Tabular numbers for financial data */
.tabular-nums {
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 8: Create `app/.env`**

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WO_o0BopYoAhfSHpSThTqs_KjF_0NXaM2NM
```

Note: The anon key is the standard local Supabase demo key. Get the real one from `npx supabase status`.

- [ ] **Step 9: Create `app/src/main.tsx`**

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from '@/lib/query-client'
import { App } from './App'
import './globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>
)
```

- [ ] **Step 10: Create `app/src/App.tsx` (route skeleton)**

```typescript
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'

function Placeholder({ title }: { title: string }) {
  return (
    <div className="py-8">
      <h1 className="font-display font-bold text-2xl text-brown">{title}</h1>
      <p className="text-text-muted mt-2">Coming soon...</p>
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/import" element={<AppLayout><Placeholder title="Importera SIE4" /></AppLayout>} />
      <Route path="/company/:companyId" element={<AppLayout><Placeholder title="Översikt" /></AppLayout>} />
      <Route path="/company/:companyId/kontoplan" element={<AppLayout><Placeholder title="Kontoplan" /></AppLayout>} />
      <Route path="/company/:companyId/huvudbok" element={<AppLayout><Placeholder title="Huvudbok" /></AppLayout>} />
      <Route path="/company/:companyId/verifikationer" element={<AppLayout><Placeholder title="Verifikationer" /></AppLayout>} />
      <Route path="/company/:companyId/balansrapport" element={<AppLayout><Placeholder title="Balansrapport" /></AppLayout>} />
      <Route path="/company/:companyId/resultatrapport" element={<AppLayout><Placeholder title="Resultatrapport" /></AppLayout>} />
      <Route path="/company/:companyId/validering" element={<AppLayout><Placeholder title="Validering" /></AppLayout>} />
      <Route path="/company/:companyId/dimensioner" element={<AppLayout><Placeholder title="Dimensioner" /></AppLayout>} />
      <Route path="*" element={<Navigate to="/import" replace />} />
    </Routes>
  )
}
```

- [ ] **Step 11: Install dependencies and verify dev server starts**

```bash
cd "/Volumes/23 nov /Project/KEYHOLDER/app"
npm install
npm run dev
```

Expected: Vite starts on http://localhost:5173, shows the placeholder page.

- [ ] **Step 12: Commit**

```bash
git add app/
git commit -m "feat: scaffold frontend app with Vite + React 19 + Tailwind

Standalone accounting frontend at app/. Includes routing skeleton
for all 8 views, design tokens from FRONTEND_GUIDELINES.md, Supabase
client config, and TanStack Query setup."
```

---

## Task 3: Core Library Files

**Files:**
- Create: `app/src/lib/supabase.ts`
- Create: `app/src/lib/query-client.ts`
- Create: `app/src/lib/query-keys.ts`
- Create: `app/src/lib/format.ts`
- Create: `app/src/lib/account-groups.ts`

- [ ] **Step 1: Create `app/src/lib/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(url, key)
```

- [ ] **Step 2: Create `app/src/lib/query-client.ts`**

```typescript
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
```

- [ ] **Step 3: Create `app/src/lib/query-keys.ts`**

```typescript
export const queryKeys = {
  companies: {
    all: () => ['companies'] as const,
    detail: (id: string) => ['companies', id] as const,
  },
  financialYears: {
    byCompany: (companyId: string) => ['financial-years', companyId] as const,
  },
  accounts: {
    byCompany: (companyId: string) => ['accounts', companyId] as const,
  },
  vouchers: {
    list: (fyId: string, page: number) => ['vouchers', fyId, page] as const,
    detail: (id: string) => ['vouchers', 'detail', id] as const,
    byFy: (fyId: string) => ['vouchers', fyId] as const,
  },
  reports: {
    balans: (fyId: string) => ['reports', 'balans', fyId] as const,
    resultat: (fyId: string) => ['reports', 'resultat', fyId] as const,
  },
  huvudbok: {
    byAccount: (fyId: string, accountNumber: number) =>
      ['huvudbok', fyId, accountNumber] as const,
  },
  dimensions: {
    byCompany: (companyId: string) => ['dimensions', companyId] as const,
    objects: (companyId: string, dimNumber: number) =>
      ['dimensions', companyId, 'objects', dimNumber] as const,
  },
  validation: {
    checks: (companyId: string, fyId: string) =>
      ['validation', companyId, fyId] as const,
  },
} as const
```

- [ ] **Step 4: Create `app/src/lib/format.ts`**

```typescript
/** Format number Swedish style: 1 234 567,89 */
export function formatSEK(value: number | string | null): string {
  if (value === null || value === undefined) return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/** Format date: 2025-03-15 */
export function formatDate(date: string | null): string {
  if (!date) return '—'
  return date.slice(0, 10)
}

/** Pad account number to 4 digits */
export function formatAccount(num: number): string {
  return String(num).padStart(4, '0')
}

/** Parse Supabase numeric (returned as string) to number */
export function parseNumeric(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return parseFloat(value)
  return 0
}
```

- [ ] **Step 5: Create `app/src/lib/account-groups.ts`**

```typescript
export interface AccountGroup {
  label: string
  range: [number, number]
  subgroups?: AccountGroup[]
}

export const balansGroups: AccountGroup[] = [
  {
    label: 'TILLGÅNGAR',
    range: [1000, 1999],
    subgroups: [
      { label: 'Immateriella anläggningstillgångar', range: [1000, 1099] },
      { label: 'Byggnader och mark', range: [1100, 1199] },
      { label: 'Maskiner och inventarier', range: [1200, 1299] },
      { label: 'Finansiella anläggningstillgångar', range: [1300, 1399] },
      { label: 'Varulager', range: [1400, 1499] },
      { label: 'Kundfordringar', range: [1500, 1599] },
      { label: 'Övriga kortfristiga fordringar', range: [1600, 1799] },
      { label: 'Kortfristiga placeringar', range: [1800, 1899] },
      { label: 'Kassa och bank', range: [1900, 1999] },
    ],
  },
  {
    label: 'EGET KAPITAL, AVSÄTTNINGAR OCH SKULDER',
    range: [2000, 2999],
    subgroups: [
      { label: 'Eget kapital', range: [2000, 2099] },
      { label: 'Obeskattade reserver', range: [2100, 2199] },
      { label: 'Avsättningar', range: [2200, 2299] },
      { label: 'Långfristiga skulder', range: [2300, 2399] },
      { label: 'Kortfristiga skulder', range: [2400, 2999] },
    ],
  },
]

export const resultatGroups: AccountGroup[] = [
  {
    label: 'Rörelsens intäkter',
    range: [3000, 3999],
  },
  {
    label: 'Rörelsens kostnader',
    range: [4000, 6999],
    subgroups: [
      { label: 'Råvaror och förnödenheter', range: [4000, 4999] },
      { label: 'Övriga externa kostnader', range: [5000, 5999] },
      { label: 'Personalkostnader', range: [6000, 6999] },
    ],
  },
  {
    label: 'Avskrivningar',
    range: [7000, 7799],
  },
  {
    label: 'Finansiella poster',
    range: [7800, 7999],
    subgroups: [
      { label: 'Finansiella intäkter', range: [7800, 7899] },
      { label: 'Finansiella kostnader', range: [7900, 7999] },
    ],
  },
  {
    label: 'Extraordinära poster & skatt',
    range: [8000, 8999],
  },
]

/** Get all accounts in a range from a flat row array */
export function accountsInRange<T extends { account_number: number }>(
  rows: T[],
  min: number,
  max: number
): T[] {
  return rows.filter(r => r.account_number >= min && r.account_number <= max)
}

/** Sum a numeric field for accounts in a range */
export function sumRange<T extends { account_number: number }>(
  rows: T[],
  min: number,
  max: number,
  field: keyof T
): number {
  return accountsInRange(rows, min, max).reduce(
    (sum, r) => sum + (parseFloat(String(r[field])) || 0),
    0
  )
}
```

- [ ] **Step 6: Commit**

```bash
cd "/Volumes/23 nov /Project/KEYHOLDER"
git add app/src/lib/
git commit -m "feat: add core lib files — supabase, query client, format utils, BAS groups"
```

---

## Task 4: Layout Shell (Sidebar + Company Switcher)

**Files:**
- Create: `app/src/components/layout/AppLayout.tsx`
- Create: `app/src/components/layout/Sidebar.tsx`
- Create: `app/src/components/layout/CompanySwitcher.tsx`
- Create: `app/src/components/ui/LoadingSpinner.tsx`
- Create: `app/src/hooks/useCompanies.ts`
- Create: `app/src/hooks/useFinancialYears.ts`

- [ ] **Step 1: Create `app/src/hooks/useCompanies.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/query-keys'

export interface Company {
  id: string
  company_name: string
  org_number: string
  account_plan_type: string | null
  currency: string | null
}

export function useCompanies() {
  return useQuery({
    queryKey: queryKeys.companies.all(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_info')
        .select('id, company_name, org_number, account_plan_type, currency')
        .order('company_name')
      if (error) throw error
      return data as Company[]
    },
  })
}
```

- [ ] **Step 2: Create `app/src/hooks/useFinancialYears.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/query-keys'

export interface FinancialYear {
  id: string
  year_index: number
  start_date: string
  end_date: string
}

export function useFinancialYears(companyId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.financialYears.byCompany(companyId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_years')
        .select('id, year_index, start_date, end_date')
        .eq('company_id', companyId!)
        .order('year_index', { ascending: false })
      if (error) throw error
      return data as FinancialYear[]
    },
    enabled: !!companyId,
  })
}
```

- [ ] **Step 3: Create `app/src/components/ui/LoadingSpinner.tsx`**

```typescript
export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-3 border-border border-t-accent rounded-full animate-spin" />
    </div>
  )
}
```

- [ ] **Step 4: Create `app/src/components/layout/CompanySwitcher.tsx`**

```typescript
import { useCompanies } from '@/hooks/useCompanies'
import { useNavigate, useParams } from 'react-router-dom'

export function CompanySwitcher() {
  const { companyId } = useParams()
  const { data: companies } = useCompanies()
  const navigate = useNavigate()
  const active = companies?.find(c => c.id === companyId)

  return (
    <div className="px-5 py-4 border-b border-border">
      <div className="font-display font-black text-lg text-brown tracking-tight">
        KEYHOLDER
      </div>
      <select
        value={companyId ?? ''}
        onChange={e => {
          if (e.target.value) navigate(`/company/${e.target.value}`)
          else navigate('/import')
        }}
        className="mt-3 w-full px-3 py-2.5 bg-bg rounded-[10px] border-none
          text-sm font-medium text-brown cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {!companyId && <option value="">Välj företag...</option>}
        {companies?.map(c => (
          <option key={c.id} value={c.id}>
            {c.company_name} ({c.org_number})
          </option>
        ))}
      </select>
    </div>
  )
}
```

- [ ] **Step 5: Create `app/src/components/layout/Sidebar.tsx`**

```typescript
import { NavLink, useParams } from 'react-router-dom'
import { CompanySwitcher } from './CompanySwitcher'

const dataLinks = [
  { to: '', label: 'Översikt', icon: '📊' },
  { to: '/kontoplan', label: 'Kontoplan', icon: '📋' },
  { to: '/huvudbok', label: 'Huvudbok', icon: '📖' },
  { to: '/verifikationer', label: 'Verifikationer', icon: '📝' },
]

const reportLinks = [
  { to: '/balansrapport', label: 'Balansrapport', icon: '⚖️' },
  { to: '/resultatrapport', label: 'Resultatrapport', icon: '📈' },
]

const toolLinks = [
  { to: '/validering', label: 'Validering', icon: '✅' },
  { to: '/dimensioner', label: 'Dimensioner', icon: '🏷️' },
]

function SidebarLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  const { companyId } = useParams()
  const fullPath = companyId ? `/company/${companyId}${to}` : '#'

  return (
    <NavLink
      to={fullPath}
      end={to === ''}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px] text-sm font-medium
        transition-colors duration-150
        ${isActive
          ? 'bg-accent-light text-accent-dark font-semibold'
          : 'text-brown-mid hover:bg-bg-alt'
        }`
      }
    >
      <span className="text-base">{icon}</span>
      {label}
    </NavLink>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-3.5 py-1 text-[11px] font-bold text-text-muted uppercase tracking-widest">
      {children}
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="w-[260px] bg-white border-r border-border flex flex-col flex-shrink-0 h-screen sticky top-0">
      <CompanySwitcher />
      <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5 overflow-y-auto">
        {/* Import link — always visible */}
        <NavLink
          to="/import"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px] text-sm font-medium
            transition-colors duration-150
            ${isActive ? 'bg-accent-light text-accent-dark font-semibold' : 'text-brown-mid hover:bg-bg-alt'}`
          }
        >
          <span className="text-base">📂</span>
          Importera SIE4
        </NavLink>

        <div className="h-px bg-border my-2 mx-1" />
        <SectionLabel>Data</SectionLabel>
        {dataLinks.map(link => (
          <SidebarLink key={link.to} {...link} />
        ))}

        <div className="h-px bg-border my-2 mx-1" />
        <SectionLabel>Rapporter</SectionLabel>
        {reportLinks.map(link => (
          <SidebarLink key={link.to} {...link} />
        ))}

        <div className="h-px bg-border my-2 mx-1" />
        <SectionLabel>Verktyg</SectionLabel>
        {toolLinks.map(link => (
          <SidebarLink key={link.to} {...link} />
        ))}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 6: Create `app/src/components/layout/AppLayout.tsx`**

```typescript
import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <main className="flex-1 px-10 py-8 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 7: Verify layout renders**

```bash
cd "/Volumes/23 nov /Project/KEYHOLDER/app"
npm run dev
```

Open http://localhost:5173 — should see sidebar with company switcher and placeholder content.

- [ ] **Step 8: Commit**

```bash
cd "/Volumes/23 nov /Project/KEYHOLDER"
git add app/src/components/ app/src/hooks/useCompanies.ts app/src/hooks/useFinancialYears.ts
git commit -m "feat: add layout shell with sidebar, company switcher, navigation"
```

---

## Task 5: Import Server + Import Page

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/index.ts`
- Create: `app/src/hooks/useImport.ts`
- Create: `app/src/features/import/ImportPage.tsx`
- Create: `app/src/components/ui/DropZone.tsx`
- Modify: `app/src/App.tsx` (replace placeholder)

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "keyholder-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch index.ts"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "@supabase/supabase-js": "^2.49.0",
    "hono": "^4.7.0",
    "iconv-lite": "^0.6.3"
  },
  "devDependencies": {
    "cheerio": "^1.2.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["index.ts", "../src/**/*.ts"]
}
```

- [ ] **Step 3: Create `server/index.ts`**

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { createClient } from '@supabase/supabase-js'
import { parseSIE4 } from '../src/sie4-parser.js'
import { importToSupabase } from '../src/sie4-importer.js'

const app = new Hono()

app.use('/*', cors({ origin: ['http://localhost:5173'] }))

const supabase = createClient(
  process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_KEY ?? ''
)

app.post('/api/import', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']
  if (!(file instanceof File)) {
    return c.json({ error: 'No file uploaded' }, 400)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const start = Date.now()

  try {
    const parsed = parseSIE4(buffer)
    const result = await importToSupabase(parsed, supabase)
    return c.json({ ...result, duration_ms: Date.now() - start })
  } catch (err) {
    return c.json({ error: String(err) }, 500)
  }
})

app.post('/api/validate/fortnox', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']
  if (!(file instanceof File)) {
    return c.json({ error: 'No file uploaded' }, 400)
  }

  const html = await file.text()
  try {
    // Dynamic import to keep cheerio in devDependencies
    const parser = await import('../src/fortnox-html-parser.js')
    // Auto-detect report type
    if (html.includes('Balansrapport')) {
      return c.json({ type: 'balans', data: parser.parseBalansHtml(html) })
    } else if (html.includes('Resultatrapport')) {
      return c.json({ type: 'resultat', data: parser.parseResultatHtml(html) })
    } else if (html.includes('Huvudbok')) {
      return c.json({ type: 'huvudbok', data: parser.parseHuvudbokHtml(html) })
    } else if (html.includes('Verifikationslista')) {
      return c.json({ type: 'verifikationslista', data: parser.parseVerifikationslistaHtml(html) })
    }
    return c.json({ error: 'Could not detect report type' }, 400)
  } catch (err) {
    return c.json({ error: String(err) }, 500)
  }
})

serve({ fetch: app.fetch, port: 3003 }, () => {
  console.log('Import server running on http://localhost:3003')
})
```

- [ ] **Step 4: Create `app/src/components/ui/DropZone.tsx`**

```typescript
import { useCallback, useState, type DragEvent } from 'react'

interface DropZoneProps {
  onFile: (file: File) => void
  accept?: string
  label: string
  sublabel?: string
}

export function DropZone({ onFile, accept, label, sublabel }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile])

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-card p-10 text-center cursor-pointer
        transition-colors duration-150
        ${dragOver ? 'border-accent bg-accent-light/30' : 'border-border hover:border-brown-mid'}`}
    >
      <div className="text-3xl mb-2">📄</div>
      <div className="text-sm font-medium text-brown-mid">{label}</div>
      {sublabel && <div className="text-xs text-text-muted mt-1">{sublabel}</div>}
      <input
        type="file"
        accept={accept}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
        }}
        className="hidden"
        id="file-input"
      />
      <label
        htmlFor="file-input"
        className="inline-block mt-4 px-5 py-2 bg-accent text-white text-sm font-bold
          rounded-pill cursor-pointer transition-all duration-200
          hover:bg-accent-dark hover:-translate-y-0.5"
      >
        Välj fil
      </label>
    </div>
  )
}
```

- [ ] **Step 5: Create `app/src/hooks/useImport.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

export function useImport() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/import', { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.companies.all() })
    },
  })
}
```

- [ ] **Step 6: Create `app/src/features/import/ImportPage.tsx`**

```typescript
import { useNavigate } from 'react-router-dom'
import { DropZone } from '@/components/ui/DropZone'
import { useImport } from '@/hooks/useImport'

export function ImportPage() {
  const navigate = useNavigate()
  const importMutation = useImport()

  const handleFile = (file: File) => {
    importMutation.mutate(file, {
      onSuccess: (data) => {
        if (data.companyId) {
          navigate(`/company/${data.companyId}`)
        }
      },
    })
  }

  return (
    <div className="max-w-2xl mx-auto py-12">
      <h1 className="font-display font-black text-3xl text-brown tracking-tight mb-2">
        Importera SIE4
      </h1>
      <p className="text-text-body mb-8">
        Ladda upp en SIE4-fil (.se) för att importera bokföringsdata.
      </p>

      <DropZone
        onFile={handleFile}
        accept=".se,.si,.sie"
        label="Dra och släpp en SIE4-fil här"
        sublabel="Stöder alla SIE4-filer (.se) från Fortnox, Visma, etc."
      />

      {importMutation.isPending && (
        <div className="mt-6 p-4 bg-white rounded-card border border-border">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
            <span className="text-sm text-brown-mid">Importerar...</span>
          </div>
        </div>
      )}

      {importMutation.isSuccess && (
        <div className="mt-6 p-4 bg-white rounded-card border border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 bg-pass rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">✓</span>
            </div>
            <span className="text-sm font-semibold text-brown">Import klar</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {Object.entries(importMutation.data.stats).map(([key, val]) => (
              <div key={key} className="flex justify-between">
                <span className="text-text-muted">{key}:</span>
                <span className="font-medium tabular-nums">{String(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {importMutation.isError && (
        <div className="mt-6 p-4 bg-fail/10 rounded-card border border-fail/30">
          <span className="text-sm text-fail font-medium">
            {importMutation.error.message}
          </span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Update `app/src/App.tsx` — replace import placeholder**

Replace the `/import` route line with:
```typescript
import { ImportPage } from '@/features/import/ImportPage'
// ...
<Route path="/import" element={<AppLayout><ImportPage /></AppLayout>} />
```

- [ ] **Step 8: Install server dependencies and test end-to-end**

```bash
cd "/Volumes/23 nov /Project/KEYHOLDER/server"
npm install

# Terminal 1: start import server
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=<key> npm run dev

# Terminal 2: start frontend
cd ../app && npm run dev
```

Open http://localhost:5173/import, upload `SIE/RevILAB20260330_165333.se`. Should import and redirect to overview.

- [ ] **Step 9: Commit**

```bash
cd "/Volumes/23 nov /Project/KEYHOLDER"
git add server/ app/src/features/import/ app/src/hooks/useImport.ts app/src/components/ui/DropZone.tsx app/src/App.tsx
git commit -m "feat: add import server and SIE4 upload page

Hono server with POST /api/import and POST /api/validate/fortnox.
Import page with drag-and-drop, progress indicator, result summary."
```

---

## Task 6: Overview Page

**Files:**
- Create: `app/src/features/overview/OverviewPage.tsx`
- Modify: `app/src/App.tsx` (replace placeholder)

- [ ] **Step 1: Create `app/src/features/overview/OverviewPage.tsx`**

```typescript
import { useParams, useSearchParams } from 'react-router-dom'
import { useCompanies } from '@/hooks/useCompanies'
import { useFinancialYears } from '@/hooks/useFinancialYears'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export function OverviewPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const { data: companies } = useCompanies()
  const { data: fys } = useFinancialYears(companyId)
  const company = companies?.find(c => c.id === companyId)
  const currentFy = fys?.[0]

  const { data: stats } = useQuery({
    queryKey: ['overview-stats', companyId],
    queryFn: async () => {
      const [accounts, vouchers, dimensions] = await Promise.all([
        supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('company_id', companyId!),
        supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('company_id', companyId!),
        supabase.from('dimensions').select('*', { count: 'exact', head: true }).eq('company_id', companyId!),
      ])
      return {
        accounts: accounts.count ?? 0,
        vouchers: vouchers.count ?? 0,
        dimensions: dimensions.count ?? 0,
        financialYears: fys?.length ?? 0,
      }
    },
    enabled: !!companyId && !!fys,
  })

  if (!company) return <LoadingSpinner />

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-display font-black text-[28px] text-brown tracking-tight">
          Översikt
        </h1>
        <p className="text-sm text-text-muted mt-1">
          {company.company_name} — {currentFy
            ? `${currentFy.start_date} till ${currentFy.end_date}`
            : 'Inga räkenskapsår'}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3.5 mb-7">
        {[
          { value: stats?.accounts ?? '—', label: 'Konton' },
          { value: stats?.vouchers ?? '—', label: 'Verifikationer' },
          { value: stats?.dimensions ?? '—', label: 'Dimensioner' },
          { value: stats?.financialYears ?? '—', label: 'Räkenskapsår' },
        ].map(s => (
          <div key={s.label} className="bg-white border-[1.5px] border-border rounded-stat p-5 text-center">
            <div className="font-display font-black text-[32px] text-brown leading-none">
              {s.value}
            </div>
            <div className="text-[13px] font-semibold text-text-muted mt-1.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Company info + FY info */}
      <div className="grid grid-cols-2 gap-3.5">
        <div className="bg-white border-[1.5px] border-border rounded-card p-6">
          <h2 className="font-display font-bold text-base text-brown mb-3">Företagsinfo</h2>
          <dl className="text-sm text-text-body leading-[1.8]">
            <div><span className="text-text-muted">Org.nr:</span> {company.org_number}</div>
            <div><span className="text-text-muted">Kontoplan:</span> {company.account_plan_type ?? '—'}</div>
            <div><span className="text-text-muted">Valuta:</span> {company.currency ?? 'SEK'}</div>
          </dl>
        </div>
        <div className="bg-white border-[1.5px] border-border rounded-card p-6">
          <h2 className="font-display font-bold text-base text-brown mb-3">Räkenskapsår</h2>
          <div className="space-y-2">
            {fys?.map(fy => (
              <div key={fy.id} className="text-sm text-text-body flex justify-between">
                <span>{fy.start_date} — {fy.end_date}</span>
                <span className="text-text-muted">
                  {fy.year_index === 0 ? 'Aktuellt' : `${fy.year_index}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `app/src/App.tsx` — replace overview placeholder**

```typescript
import { OverviewPage } from '@/features/overview/OverviewPage'
// ...
<Route path="/company/:companyId" element={<AppLayout><OverviewPage /></AppLayout>} />
```

- [ ] **Step 3: Verify with real data**

Import a SIE4 file, navigate to overview. Verify stat cards show correct counts.

- [ ] **Step 4: Commit**

```bash
git add app/src/features/overview/ app/src/App.tsx
git commit -m "feat: add overview page with company stats and info cards"
```

---

## Task 7: Balansrapport + Resultatrapport

**Files:**
- Create: `app/src/hooks/useBalansrapport.ts`
- Create: `app/src/hooks/useResultatrapport.ts`
- Create: `app/src/features/balansrapport/BalansrapportPage.tsx`
- Create: `app/src/features/resultatrapport/ResultatrapportPage.tsx`
- Modify: `app/src/App.tsx`

- [ ] **Step 1: Create `app/src/hooks/useBalansrapport.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/query-keys'
import { parseNumeric } from '@/lib/format'

export interface BalansRow {
  account_number: number
  account_name: string
  ing_balans: number
  period: number
  utg_balans: number
}

export function useBalansrapport(fyId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reports.balans(fyId!),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('report_balansrapport', {
        p_financial_year_id: fyId!,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        account_number: r.account_number as number,
        account_name: r.account_name as string,
        ing_balans: parseNumeric(r.ing_balans),
        period: parseNumeric(r.period),
        utg_balans: parseNumeric(r.utg_balans),
      })) as BalansRow[]
    },
    enabled: !!fyId,
  })
}
```

- [ ] **Step 2: Create `app/src/hooks/useResultatrapport.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/query-keys'
import { parseNumeric } from '@/lib/format'

export interface ResultatRow {
  account_number: number
  account_name: string
  period: number
  ackumulerat: number
  period_fg_ar: number
}

export function useResultatrapport(fyId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reports.resultat(fyId!),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('report_resultatrapport', {
        p_financial_year_id: fyId!,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        account_number: r.account_number as number,
        account_name: r.account_name as string,
        period: parseNumeric(r.period),
        ackumulerat: parseNumeric(r.ackumulerat),
        period_fg_ar: parseNumeric(r.period_fg_ar),
      })) as ResultatRow[]
    },
    enabled: !!fyId,
  })
}
```

- [ ] **Step 3: Create `app/src/features/balansrapport/BalansrapportPage.tsx`**

```typescript
import { useParams } from 'react-router-dom'
import { useFinancialYears } from '@/hooks/useFinancialYears'
import { useBalansrapport, type BalansRow } from '@/hooks/useBalansrapport'
import { balansGroups, accountsInRange, sumRange } from '@/lib/account-groups'
import { formatSEK } from '@/lib/format'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useState } from 'react'

export function BalansrapportPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const { data: fys } = useFinancialYears(companyId)
  const [fyId, setFyId] = useState<string | undefined>()
  const activeFyId = fyId ?? fys?.[0]?.id
  const { data: rows, isLoading } = useBalansrapport(activeFyId)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-black text-[28px] text-brown tracking-tight">
          Balansrapport
        </h1>
        {fys && (
          <select
            value={activeFyId ?? ''}
            onChange={e => setFyId(e.target.value)}
            className="px-4 py-2 bg-white border-[1.5px] border-border rounded-pill text-sm font-semibold text-brown"
          >
            {fys.map(fy => (
              <option key={fy.id} value={fy.id}>
                {fy.start_date} — {fy.end_date}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? <LoadingSpinner /> : rows && (
        <div className="bg-white border-[1.5px] border-border rounded-card overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#f8f4ef]">
                <th className="text-left px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Konto</th>
                <th className="text-left px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Kontonamn</th>
                <th className="text-right px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Ing. balans</th>
                <th className="text-right px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Period</th>
                <th className="text-right px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Utg. balans</th>
              </tr>
            </thead>
            <tbody>
              {balansGroups.map(group => (
                <GroupSection key={group.label} group={group} rows={rows} />
              ))}
              {/* Total */}
              <tr className="border-t-2 border-border">
                <td colSpan={2} className="px-4 py-3 font-bold text-brown">BERÄKNAT RESULTAT</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">
                  {formatSEK(sumRange(rows, 1000, 2999, 'ing_balans'))}
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">
                  {formatSEK(sumRange(rows, 1000, 2999, 'period'))}
                </td>
                <td className="px-4 py-3 text-right font-bold text-accent font-display text-[15px] tabular-nums">
                  {formatSEK(sumRange(rows, 1000, 2999, 'utg_balans'))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function GroupSection({ group, rows }: { group: typeof balansGroups[0]; rows: BalansRow[] }) {
  const groupRows = accountsInRange(rows, group.range[0], group.range[1])
  if (groupRows.length === 0) return null

  return (
    <>
      <tr className="bg-brown">
        <td colSpan={5} className="px-4 py-2.5 font-display font-bold text-white text-sm">
          {group.label}
        </td>
      </tr>
      {group.subgroups?.map(sub => {
        const subRows = accountsInRange(rows, sub.range[0], sub.range[1])
        if (subRows.length === 0) return null
        return subRows.map((row, i) => (
          <tr key={row.account_number} className={i % 2 ? 'bg-[#faf8f5]' : ''}>
            <td className="px-4 py-2 text-text-muted font-semibold">{row.account_number}</td>
            <td className="px-4 py-2 text-brown-mid">{row.account_name}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatSEK(row.ing_balans)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatSEK(row.period)}</td>
            <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatSEK(row.utg_balans)}</td>
          </tr>
        ))
      })}
      {!group.subgroups && groupRows.map((row, i) => (
        <tr key={row.account_number} className={i % 2 ? 'bg-[#faf8f5]' : ''}>
          <td className="px-4 py-2 text-text-muted font-semibold">{row.account_number}</td>
          <td className="px-4 py-2 text-brown-mid">{row.account_name}</td>
          <td className="px-4 py-2 text-right tabular-nums">{formatSEK(row.ing_balans)}</td>
          <td className="px-4 py-2 text-right tabular-nums">{formatSEK(row.period)}</td>
          <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatSEK(row.utg_balans)}</td>
        </tr>
      ))}
      <tr className="border-t-[1.5px] border-border">
        <td colSpan={2} className="px-4 py-2.5 font-bold text-brown text-[13px]">
          SUMMA {group.label}
        </td>
        <td className="px-4 py-2.5 text-right font-bold tabular-nums">
          {formatSEK(sumRange(groupRows, group.range[0], group.range[1], 'ing_balans'))}
        </td>
        <td className="px-4 py-2.5 text-right font-bold tabular-nums">
          {formatSEK(sumRange(groupRows, group.range[0], group.range[1], 'period'))}
        </td>
        <td className="px-4 py-2.5 text-right font-bold tabular-nums">
          {formatSEK(sumRange(groupRows, group.range[0], group.range[1], 'utg_balans'))}
        </td>
      </tr>
    </>
  )
}
```

- [ ] **Step 4: Create `app/src/features/resultatrapport/ResultatrapportPage.tsx`**

Same pattern as BalansrapportPage but with `resultatGroups` and columns: Konto, Kontonamn, Period, Ackumulerat, Föreg. år. Uses `useResultatrapport` hook. The SQL function already negates values (revenue positive, costs negative).

- [ ] **Step 5: Update `App.tsx`, verify against crosscheck values**

Import RevIL AB, navigate to Balansrapport. Verify SUMMA TILLGÅNGAR = 3 952 190,47.

- [ ] **Step 6: Commit**

```bash
git add app/src/hooks/useBalansrapport.ts app/src/hooks/useResultatrapport.ts app/src/features/balansrapport/ app/src/features/resultatrapport/ app/src/App.tsx
git commit -m "feat: add Balansrapport and Resultatrapport with BAS grouping"
```

---

## Task 8: Kontoplan + Verifikationer + Huvudbok

**Files:**
- Create: `app/src/hooks/useAccounts.ts`
- Create: `app/src/hooks/useVouchers.ts`
- Create: `app/src/hooks/useHuvudbok.ts`
- Create: `app/src/features/kontoplan/KontoplanPage.tsx`
- Create: `app/src/features/verifikationer/VoucherListPage.tsx`
- Create: `app/src/features/huvudbok/HuvudbokPage.tsx`
- Create: `app/src/components/ui/SearchInput.tsx`
- Create: `app/src/components/ui/Badge.tsx`

- [ ] **Step 1: Create data hooks**

`useAccounts.ts`: Query `accounts` table filtered by `company_id`, ordered by `account_number`. Join SRU codes via separate query.

`useVouchers.ts`: Query `vouchers` with nested `voucher_rows(*)` filtered by `financial_year_id`, paginated with `.range()`. PAGE_SIZE = 50.

`useHuvudbok.ts`: Two queries — (1) opening balance from `opening_balances` where `dimension_number IS NULL`, (2) `voucher_rows` joined with `vouchers` via `voucher:vouchers!inner(series, voucher_number, date, description)` filtered by `account_number` and `voucher.financial_year_id`. Compute running balance client-side.

- [ ] **Step 2: Create UI components**

`SearchInput.tsx`: Text input with search icon, debounced onChange (300ms).

`Badge.tsx`: Colored badge for account types — T (green), S (blue), K (orange), I (purple).

- [ ] **Step 3: Create page components**

`KontoplanPage.tsx`: Searchable table with account_number, name, type badge, SRU code. Filter by type and range.

`VoucherListPage.tsx`: Paginated list with series badge, number, date, description, amount. Click to expand rows showing debet/kredit. Filter by series and text search.

`HuvudbokPage.tsx`: Account selector dropdown + financial year selector. Table: Vernr, Datum, Text, Debet, Kredit, Saldo. Running balance from opening balance.

- [ ] **Step 4: Update App.tsx, verify with real data**

- [ ] **Step 5: Commit**

```bash
git add app/src/hooks/useAccounts.ts app/src/hooks/useVouchers.ts app/src/hooks/useHuvudbok.ts app/src/features/kontoplan/ app/src/features/verifikationer/ app/src/features/huvudbok/ app/src/components/ui/SearchInput.tsx app/src/components/ui/Badge.tsx app/src/App.tsx
git commit -m "feat: add Kontoplan, Verifikationer, and Huvudbok views"
```

---

## Task 9: Validation Dashboard

**Files:**
- Create: `app/src/hooks/useValidation.ts`
- Create: `app/src/features/validation/ValidationPage.tsx`

- [ ] **Step 1: Create `app/src/hooks/useValidation.ts`**

Port the 10 checks from `src/sie4-validator.ts` to client-side queries using supabase-js. Each check queries the DB and compares against expected values. Returns `ValidationReport` shape: `{ passed: boolean, checks: Array<{ name, status, expected, actual }> }`.

Checks:
1. Account count: `accounts.select('*', { count: 'exact', head: true }).eq('company_id', companyId)`
2. Voucher count per series: `vouchers.select('series').eq('company_id', companyId)` → group by series
3. Voucher row count: `voucher_rows.select('*', { count: 'exact', head: true })` via voucher join
4. Opening balances: `opening_balances.select('account_number, amount').eq('financial_year_id', fyId).is('dimension_number', null)`
5. Closing balances: same pattern
6. Voucher balance: for each voucher, sum normal TRANS rows = 0
7. Period results: `period_results.select('*').eq('financial_year_id', fyId)`
8. Period balances: `period_balances.select('*').eq('financial_year_id', fyId)`
9. Object count: `objects.select('*', { count: 'exact', head: true }).eq('company_id', companyId)`
10. BTRANS/RTRANS counts: `voucher_rows.select('*', { count: 'exact', head: true }).eq('transaction_type', 'btrans')`

- [ ] **Step 2: Create `app/src/features/validation/ValidationPage.tsx`**

Large score heading (Fraunces 48px, green/red). 2-column grid of check cards with green/red dot, name, expected vs actual. Fortnox compare section with DropZone for HTML upload, POST to `/api/validate/fortnox`, side-by-side amount comparison.

- [ ] **Step 3: Test with all 3 companies — all should show 10/10**

- [ ] **Step 4: Commit**

```bash
git add app/src/hooks/useValidation.ts app/src/features/validation/ app/src/App.tsx
git commit -m "feat: add validation dashboard with 10 checks and Fortnox compare"
```

---

## Task 10: Dimensions Page

**Files:**
- Create: `app/src/hooks/useDimensions.ts`
- Create: `app/src/features/dimensions/DimensionsPage.tsx`

- [ ] **Step 1: Create `app/src/hooks/useDimensions.ts`**

Query `dimensions` + `objects` filtered by `company_id`. Group objects by dimension_number.

- [ ] **Step 2: Create `app/src/features/dimensions/DimensionsPage.tsx`**

Accordion-style: each dimension expandable to show objects. Show per-object balances from `opening_balances`/`closing_balances` where `dimension_number IS NOT NULL`.

- [ ] **Step 3: Commit**

```bash
git add app/src/hooks/useDimensions.ts app/src/features/dimensions/ app/src/App.tsx
git commit -m "feat: add dimensions and cost centers page"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Run existing pipeline tests**

```bash
cd "/Volumes/23 nov /Project/KEYHOLDER"
npm test
```

Expected: All 69 tests pass.

- [ ] **Step 2: Import all 3 test companies**

```bash
# Start import server
cd server && SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=<key> npm run dev &

# Upload via frontend at http://localhost:5173/import
# 1. RevILAB20260330_165333.se
# 2. SkataSwedenAB20260330_170222.se
# 3. ByggnadsställningsentreprenadiStockholmAB20260330_170428.se
```

- [ ] **Step 3: Verify Balansrapport crosscheck values**

| Company | SUMMA TILLGÅNGAR |
|---------|-----------------|
| RevIL AB | 3 952 190,47 |
| Skata Sweden AB | 430 607,53 |
| Byggnadsställningsentreprenad | 20 646 658,73 |

- [ ] **Step 4: Verify Resultatrapport crosscheck values**

| Company | BERÄKNAT RESULTAT |
|---------|------------------|
| RevIL AB | 869 954,78 |
| Skata Sweden AB | 58 795,82 |
| Byggnadsställningsentreprenad | 2 886 185,09 |

- [ ] **Step 5: Verify validation — all 3 companies show 10/10**

- [ ] **Step 6: Verify multi-company switching works**

Switch between companies in sidebar. All data updates correctly. No data leakage between companies.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete SIE4 accounting frontend

8 views: Import, Overview, Kontoplan, Huvudbok, Verifikationer,
Balansrapport, Resultatrapport, Validering, Dimensioner.
Multi-company support. Fortnox crosscheck validation.
Verified against 3 real companies to öre precision."
```
