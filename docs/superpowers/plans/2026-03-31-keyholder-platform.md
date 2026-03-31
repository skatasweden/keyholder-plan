# KEYHOLDER Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI-native accounting platform where users chat with Claude against their own dedicated Supabase database, with credit-based billing, edge function deployment, and custom page building.

**Architecture:** Next.js 15 monolith (App Router) on Vercel. Control plane Supabase for users/credits/metadata. One tenant Supabase per customer provisioned via Management API. Vercel AI SDK v4 for Claude streaming + tool use.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 4, shadcn/ui, Vercel AI SDK v4 (`ai@4`, `@ai-sdk/anthropic@1`, `@ai-sdk/react`), Supabase Auth, Supabase Management API (plain fetch), Zod, TanStack Query v5.

**Spec:** `docs/superpowers/specs/2026-03-31-keyholder-platform-design.md`

---

## File Structure

```
keyholder-platform/
├── app/
│   ├── layout.tsx                      # Root layout (fonts, metadata)
│   ├── page.tsx                        # Landing page (marketing)
│   ├── pricing/page.tsx                # Pricing page
│   ├── (auth)/
│   │   ├── login/page.tsx              # Login form
│   │   ├── signup/page.tsx             # Signup form
│   │   └── auth/callback/route.ts      # Supabase Auth callback
│   ├── (onboarding)/
│   │   └── setup/page.tsx              # Onboarding wizard
│   ├── (dashboard)/
│   │   ├── layout.tsx                  # Dashboard shell (sidebar + main)
│   │   ├── chat/page.tsx               # Claude chat (primary UI)
│   │   ├── edge-functions/page.tsx     # List/manage deployed EFs
│   │   ├── pages/[slug]/page.tsx       # Custom page renderer
│   │   ├── settings/page.tsx           # Company info
│   │   └── billing/page.tsx            # Credits + plan
│   └── api/
│       ├── chat/route.ts               # Claude proxy + tools + streaming
│       ├── provision/route.ts          # Create tenant Supabase
│       ├── import/route.ts             # SIE4 upload + parse
│       ├── edge-functions/route.ts     # Deploy EF to tenant
│       ├── custom-pages/route.ts       # CRUD custom pages
│       └── jobs/[id]/route.ts          # Poll job progress
├── components/
│   ├── chat/
│   │   ├── chat-window.tsx             # Message list with streaming
│   │   ├── chat-input.tsx              # Prompt input + credit display
│   │   ├── message-bubble.tsx          # Renders text, tables, code
│   │   ├── tool-call-card.tsx          # Expandable SQL/EF card
│   │   └── mutation-confirm.tsx        # "Approve booking" dialog
│   ├── onboarding/
│   │   ├── sie-upload.tsx              # Drag-drop + progress
│   │   └── kontoplan-picker.tsx        # Pick BAS variant
│   ├── dashboard/
│   │   ├── sidebar.tsx                 # Navigation sidebar
│   │   └── credit-badge.tsx            # Credits remaining display
│   └── ui/                             # shadcn/ui (generated)
├── lib/
│   ├── claude/
│   │   ├── system-prompt.ts            # Build dynamic prompt per tenant
│   │   ├── tools.ts                    # Tool definitions (4 tools)
│   │   └── credit-calculator.ts        # Token -> credit math
│   ├── supabase/
│   │   ├── control-plane.ts            # Server + browser clients
│   │   ├── tenant-client.ts            # Create client for tenant
│   │   ├── provisioner.ts              # Management API wrapper
│   │   └── middleware.ts               # Auth middleware helper
│   └── utils.ts                        # cn() helper, etc.
├── packages/
│   ├── sie-parser/
│   │   ├── src/
│   │   │   ├── sie4-parser.ts          # Existing parser (moved)
│   │   │   ├── sie4-importer.ts        # Existing importer (moved)
│   │   │   └── types.ts                # Existing types (moved)
│   │   ├── tests/                      # Existing tests (moved)
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── tenant-template/
│       ├── migrations/
│       │   └── 001_full_schema.sql     # All 14 tables + RLS + functions
│       ├── edge-functions/
│       │   └── execute-readonly/
│       │       └── index.ts            # Sandboxed SQL execution
│       └── seed/
│           ├── bas-2026-standard.json  # ~700 accounts
│           ├── bas-2026-k1.json        # ~200 accounts
│           ├── bas-2026-k2.json
│           └── bas-2026-k3.json
├── supabase/
│   └── migrations/
│       └── 001_control_plane.sql       # All control plane tables
├── middleware.ts                        # Next.js middleware (auth guard)
├── .env.local                          # Secrets
├── next.config.ts
├── package.json
├── pnpm-workspace.yaml
├── tailwind.config.ts
└── tsconfig.json
```

---

## Phase 1: Foundation

### Task 1: Scaffold Next.js 15 Monorepo

**Files:**
- Create: `keyholder-platform/package.json`
- Create: `keyholder-platform/pnpm-workspace.yaml`
- Create: `keyholder-platform/next.config.ts`
- Create: `keyholder-platform/tsconfig.json`
- Create: `keyholder-platform/tailwind.config.ts`
- Create: `keyholder-platform/app/layout.tsx`
- Create: `keyholder-platform/app/page.tsx`
- Create: `keyholder-platform/lib/utils.ts`

- [ ] **Step 1: Create platform directory and init Next.js**

```bash
cd "/Volumes/23 nov /Project/KEYHOLDER"
mkdir keyholder-platform
cd keyholder-platform
pnpm init
pnpm add next@latest react@latest react-dom@latest typescript @types/node @types/react @types/react-dom
pnpm add -D tailwindcss @tailwindcss/postcss postcss
```

- [ ] **Step 2: Create pnpm workspace config**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "."
  - "packages/*"
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "packages"]
}
```

- [ ] **Step 4: Create next.config.ts**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['iconv-lite'],
  },
}

export default nextConfig
```

- [ ] **Step 5: Create tailwind.config.ts and postcss.config.mjs**

`tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
```

`postcss.config.mjs`:
```javascript
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
```

- [ ] **Step 6: Create app/globals.css**

```css
@import 'tailwindcss';
```

- [ ] **Step 7: Create root layout**

`app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'KEYHOLDER — AI-Powered Accounting',
  description: 'Chat with your accounting data. Build anything.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="sv">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 8: Create landing page placeholder**

`app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">KEYHOLDER</h1>
      <p className="mt-4 text-lg text-gray-600">
        Chat with your accounting data. Build anything.
      </p>
    </main>
  )
}
```

- [ ] **Step 9: Create lib/utils.ts**

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

```bash
pnpm add clsx tailwind-merge
```

- [ ] **Step 10: Create .env.local template**

```bash
# Control Plane Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Supabase Management API
SUPABASE_ACCESS_TOKEN=sbp_your-token
SUPABASE_ORG_SLUG=your-org-slug

# Anthropic
ANTHROPIC_API_KEY=sk-ant-your-key

# Stripe (v2)
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

- [ ] **Step 11: Verify dev server starts**

```bash
pnpm dev
```

Expected: Next.js dev server at http://localhost:3000, landing page renders.

- [ ] **Step 12: Install shadcn/ui**

```bash
pnpm add lucide-react
pnpm dlx shadcn@latest init
```

Select: New York style, Zinc color, CSS variables.

Then install components we'll need:

```bash
pnpm dlx shadcn@latest add button card input label dialog tabs badge separator scroll-area textarea toast dropdown-menu avatar sheet
```

- [ ] **Step 13: Commit**

```bash
git add keyholder-platform/
git commit -m "feat: scaffold Next.js 15 platform with Tailwind + shadcn/ui"
```

---

### Task 2: Move SIE Parser to Package

**Files:**
- Create: `keyholder-platform/packages/sie-parser/package.json`
- Create: `keyholder-platform/packages/sie-parser/tsconfig.json`
- Copy: `src/sie4-parser.ts` -> `packages/sie-parser/src/sie4-parser.ts`
- Copy: `src/sie4-importer.ts` -> `packages/sie-parser/src/sie4-importer.ts`
- Copy: `src/types.ts` -> `packages/sie-parser/src/types.ts`
- Copy: `src/test-fixture.ts` -> `packages/sie-parser/tests/test-fixture.ts`
- Copy: `src/parser.test.ts` -> `packages/sie-parser/tests/parser.test.ts`

- [ ] **Step 1: Create package structure**

```bash
cd "/Volumes/23 nov /Project/KEYHOLDER/keyholder-platform"
mkdir -p packages/sie-parser/src packages/sie-parser/tests
```

- [ ] **Step 2: Create package.json**

`packages/sie-parser/package.json`:
```json
{
  "name": "@keyholder/sie-parser",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "iconv-lite": "^0.6.3"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

`packages/sie-parser/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 4: Copy parser files**

```bash
cp "/Volumes/23 nov /Project/KEYHOLDER/src/sie4-parser.ts" packages/sie-parser/src/
cp "/Volumes/23 nov /Project/KEYHOLDER/src/sie4-importer.ts" packages/sie-parser/src/
cp "/Volumes/23 nov /Project/KEYHOLDER/src/types.ts" packages/sie-parser/src/
```

- [ ] **Step 5: Create index.ts barrel export**

`packages/sie-parser/src/index.ts`:
```typescript
export { parseSIE4 } from './sie4-parser'
export { importToSupabase } from './sie4-importer'
export type {
  ParsedSIE4,
  SIECompanyInfo,
  SIEAccount,
  SIEVoucher,
  SIEVoucherRow,
  SIEBalance,
  SIEDimension,
  SIEObject,
  SIEFinancialYear,
  SIESRUCode,
  SIEPeriodBalance,
  SIEPeriodBudget,
  ImportResult,
} from './types'
```

- [ ] **Step 6: Copy test files**

```bash
cp "/Volumes/23 nov /Project/KEYHOLDER/src/parser.test.ts" packages/sie-parser/tests/
cp "/Volumes/23 nov /Project/KEYHOLDER/src/test-fixture.ts" packages/sie-parser/tests/
```

- [ ] **Step 7: Install deps and run tests**

```bash
cd packages/sie-parser
pnpm install
pnpm test
```

Expected: 47 unit tests pass (parser tests that don't require DB).

- [ ] **Step 8: Add workspace dependency to platform**

In root `package.json`, add:
```json
{
  "dependencies": {
    "@keyholder/sie-parser": "workspace:*"
  }
}
```

```bash
cd "/Volumes/23 nov /Project/KEYHOLDER/keyholder-platform"
pnpm install
```

- [ ] **Step 9: Commit**

```bash
git add packages/sie-parser/
git commit -m "feat: move SIE4 parser to workspace package"
```

---

### Task 3: Create Tenant Template Package

**Files:**
- Create: `packages/tenant-template/migrations/001_full_schema.sql`
- Create: `packages/tenant-template/edge-functions/execute-readonly/index.ts`
- Create: `packages/tenant-template/seed/bas-2026-standard.json`
- Create: `packages/tenant-template/package.json`

- [ ] **Step 1: Create directory structure**

```bash
cd "/Volumes/23 nov /Project/KEYHOLDER/keyholder-platform"
mkdir -p packages/tenant-template/migrations
mkdir -p packages/tenant-template/edge-functions/execute-readonly
mkdir -p packages/tenant-template/seed
```

- [ ] **Step 2: Create consolidated tenant schema**

`packages/tenant-template/migrations/001_full_schema.sql`:

This consolidates the 14 existing tables from the current codebase's 13 migrations into a single migration file. Copy the content from the existing migrations at `/Volumes/23 nov /Project/KEYHOLDER/supabase/migrations/` and consolidate into one file. The schema must include:

```sql
-- Company info
CREATE TABLE company_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  company_name text NOT NULL,
  org_number text,
  address text,
  postal_code text,
  city text,
  sni_code text,
  company_type text,
  comment text,
  tax_year integer,
  currency text DEFAULT 'SEK',
  created_at timestamptz DEFAULT now()
);

-- Financial years
CREATE TABLE financial_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  year_index integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  UNIQUE(company_id, year_index)
);

-- Accounts
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  account_number integer NOT NULL,
  name text NOT NULL,
  account_type text,
  UNIQUE(company_id, account_number)
);

-- SRU codes
CREATE TABLE sru_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  account_number integer NOT NULL,
  sru_code text NOT NULL,
  UNIQUE(company_id, account_number, sru_code)
);

-- Dimensions
CREATE TABLE dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  dimension_number integer NOT NULL,
  name text NOT NULL,
  parent_dimension integer,
  UNIQUE(company_id, dimension_number)
);

-- Objects
CREATE TABLE objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  dimension_number integer NOT NULL,
  object_number text NOT NULL,
  name text NOT NULL,
  UNIQUE(company_id, dimension_number, object_number)
);

-- Vouchers
CREATE TABLE vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  series text NOT NULL,
  voucher_number integer NOT NULL,
  date date NOT NULL,
  description text,
  registration_date date,
  registration_sign text,
  financial_year_id uuid REFERENCES financial_years(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, series, voucher_number, financial_year_id)
);

-- Voucher rows
CREATE TABLE voucher_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  account_number integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  quantity decimal(15,4),
  description text,
  transaction_date date
);

-- Voucher row objects (multi-dimension junction)
CREATE TABLE voucher_row_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_row_id uuid NOT NULL REFERENCES voucher_rows(id) ON DELETE CASCADE,
  dimension_number integer NOT NULL,
  object_number text NOT NULL,
  UNIQUE(voucher_row_id, dimension_number)
);

-- Opening balances
CREATE TABLE opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  dimension_number integer,
  object_number text,
  UNIQUE(company_id, financial_year_id, account_number, COALESCE(dimension_number, -1), COALESCE(object_number, ''))
);

-- Closing balances
CREATE TABLE closing_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  dimension_number integer,
  object_number text,
  UNIQUE(company_id, financial_year_id, account_number, COALESCE(dimension_number, -1), COALESCE(object_number, ''))
);

-- Period results
CREATE TABLE period_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  UNIQUE(company_id, financial_year_id, account_number)
);

-- Period balances
CREATE TABLE period_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL,
  period integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  dimension_number integer,
  object_number text,
  UNIQUE(company_id, financial_year_id, account_number, period, COALESCE(dimension_number, -1), COALESCE(object_number, ''))
);

-- Period budgets
CREATE TABLE period_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL,
  period integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  dimension_number integer,
  object_number text,
  UNIQUE(company_id, financial_year_id, account_number, period, COALESCE(dimension_number, -1), COALESCE(object_number, ''))
);

-- Custom pages (for user-built financial tools)
CREATE TABLE custom_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  component_code text NOT NULL,
  icon text DEFAULT 'file-text',
  sort_order integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: allow authenticated read on all tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY "authenticated_read" ON public.%I FOR SELECT TO authenticated USING (true)',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "authenticated_write" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END
$$;

-- Report functions (from existing codebase)
-- Copy report_balansrapport and report_resultatrapport from existing migrations

-- Sandboxed read-only query execution (for Claude tools)
CREATE OR REPLACE FUNCTION execute_readonly_query(sql text, row_limit integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Only allow SELECT
  IF NOT (upper(trim(sql)) LIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  -- Block dangerous keywords
  IF upper(sql) ~ '(DROP|DELETE|TRUNCATE|ALTER|CREATE|INSERT|UPDATE|GRANT|REVOKE)' THEN
    RAISE EXCEPTION 'Blocked keyword detected';
  END IF;

  -- Execute with row limit
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (SELECT * FROM (%s) sub LIMIT %s) t', sql, row_limit)
  INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
```

NOTE: The implementer must read the actual existing migrations at `/Volumes/23 nov /Project/KEYHOLDER/supabase/migrations/` and ensure all columns, constraints, and functions are correctly consolidated. The above is the target schema structure — verify column names and types against the existing 13 migration files.

- [ ] **Step 3: Create execute-readonly edge function**

`packages/tenant-template/edge-functions/execute-readonly/index.ts`:
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, row_limit = 1000 } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data, error } = await supabase.rpc('execute_readonly_query', {
      sql: query,
      row_limit,
    })

    if (error) throw error

    return new Response(JSON.stringify({ data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 4: Create BAS 2026 standard seed file**

`packages/tenant-template/seed/bas-2026-standard.json`:

Extract the account list from the existing test data. The structure:

```json
{
  "name": "BAS 2026 Standard",
  "accounts": [
    { "account_number": 1010, "name": "Utvecklingsutgifter", "account_type": "T" },
    { "account_number": 1510, "name": "Kundfordringar", "account_type": "T" },
    { "account_number": 1910, "name": "Kassa", "account_type": "T" },
    { "account_number": 1920, "name": "Plusgiro", "account_type": "T" },
    { "account_number": 1930, "name": "Checkräkningskonto", "account_type": "T" },
    { "account_number": 2440, "name": "Leverantörsskulder", "account_type": "S" },
    { "account_number": 2610, "name": "Utgående moms 25%", "account_type": "S" },
    { "account_number": 2640, "name": "Ingående moms", "account_type": "S" },
    { "account_number": 3010, "name": "Försäljning varor", "account_type": "I" },
    { "account_number": 4010, "name": "Inköp varor", "account_type": "K" },
    { "account_number": 5010, "name": "Lokalhyra", "account_type": "K" },
    { "account_number": 6210, "name": "Telefon och post", "account_type": "K" },
    { "account_number": 7010, "name": "Löner", "account_type": "K" },
    { "account_number": 8310, "name": "Ränteintäkter", "account_type": "I" },
    { "account_number": 8410, "name": "Räntekostnader", "account_type": "K" }
  ]
}
```

NOTE: The implementer must create a comprehensive BAS 2026 chart of accounts. The above is a sample — the full standard has ~700 accounts. Source the complete list from the BAS kontogruppen website or from the existing SIE4 test files (which contain real Fortnox exports with complete account lists). Create simplified variants for K1/K2/K3 as well.

- [ ] **Step 5: Create package.json**

`packages/tenant-template/package.json`:
```json
{
  "name": "@keyholder/tenant-template",
  "version": "1.0.0",
  "private": true,
  "main": "index.ts",
  "files": ["migrations", "edge-functions", "seed"]
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/tenant-template/
git commit -m "feat: create tenant template package (schema + seed + edge functions)"
```

---

### Task 4: Control Plane Supabase Schema

**Files:**
- Create: `supabase/migrations/001_control_plane.sql`

- [ ] **Step 1: Create control plane migration**

`supabase/migrations/001_control_plane.sql`:
```sql
-- Customers (KEYHOLDER users)
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  company_name text,
  org_number text,
  plan text NOT NULL DEFAULT 'starter',
  created_at timestamptz DEFAULT now()
);

-- Customer Supabase projects
CREATE TABLE customer_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  supabase_project_ref text NOT NULL,
  supabase_url text NOT NULL,
  supabase_anon_key text NOT NULL,
  supabase_service_key_encrypted text NOT NULL,
  region text DEFAULT 'eu-central-1',
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'active', 'suspended', 'error')),
  created_at timestamptz DEFAULT now()
);

-- Credit system
CREATE TABLE credit_balances (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  credits_remaining integer NOT NULL DEFAULT 0,
  credits_used_total integer NOT NULL DEFAULT 0,
  plan_credits_monthly integer NOT NULL DEFAULT 20,
  next_reset_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE TABLE credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL
    CHECK (reason IN ('chat_turn', 'monthly_reset', 'purchase', 'initial_grant', 'custom_page', 'edge_function')),
  chat_message_id uuid,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz DEFAULT now()
);

-- Jobs (provisioning, SIE import, etc.)
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  job_type text NOT NULL
    CHECK (job_type IN ('provision', 'sie_import', 'seed_kontoplan', 'deploy_edge_function')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  progress_pct integer DEFAULT 0,
  progress_message text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Chat messages (for context persistence)
CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  tool_calls jsonb,
  tokens_in integer,
  tokens_out integer,
  credits_used numeric(6,2),
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies: users can only see their own data
CREATE POLICY "users_own_data" ON customers
  FOR ALL TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "users_own_projects" ON customer_projects
  FOR ALL TO authenticated
  USING (customer_id IN (
    SELECT id FROM customers WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "users_own_credits" ON credit_balances
  FOR ALL TO authenticated
  USING (customer_id IN (
    SELECT id FROM customers WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "users_own_credit_txns" ON credit_transactions
  FOR ALL TO authenticated
  USING (customer_id IN (
    SELECT id FROM customers WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "users_own_jobs" ON jobs
  FOR ALL TO authenticated
  USING (customer_id IN (
    SELECT id FROM customers WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "users_own_messages" ON chat_messages
  FOR ALL TO authenticated
  USING (customer_id IN (
    SELECT id FROM customers WHERE auth_user_id = auth.uid()
  ));

-- Index for job polling
CREATE INDEX idx_jobs_customer_status ON jobs(customer_id, status);
CREATE INDEX idx_chat_messages_customer ON chat_messages(customer_id, created_at);
CREATE INDEX idx_credit_transactions_customer ON credit_transactions(customer_id, created_at);
```

- [ ] **Step 2: Apply migration to local Supabase**

```bash
cd "/Volumes/23 nov /Project/KEYHOLDER/keyholder-platform"
supabase init  # if not already initialized
supabase start
supabase db push
```

Expected: All tables created, RLS policies applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat: add control plane schema (customers, credits, jobs, chat)"
```

---

### Task 5: Supabase Auth + Client Libraries

**Files:**
- Create: `lib/supabase/control-plane.ts`
- Create: `lib/supabase/tenant-client.ts`
- Create: `lib/supabase/middleware.ts`
- Create: `middleware.ts`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/signup/page.tsx`
- Create: `app/(auth)/auth/callback/route.ts`

- [ ] **Step 1: Install Supabase packages**

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Create control plane clients**

`lib/supabase/control-plane.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function createServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **Step 3: Create tenant client factory**

`lib/supabase/tenant-client.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export function createTenantClient(
  supabaseUrl: string,
  supabaseServiceKey: string
): SupabaseClient {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
```

- [ ] **Step 4: Create middleware helper**

`lib/supabase/middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes
  const isProtectedRoute =
    request.nextUrl.pathname.startsWith('/chat') ||
    request.nextUrl.pathname.startsWith('/settings') ||
    request.nextUrl.pathname.startsWith('/billing') ||
    request.nextUrl.pathname.startsWith('/edge-functions') ||
    request.nextUrl.pathname.startsWith('/pages') ||
    request.nextUrl.pathname.startsWith('/setup')

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect logged-in users away from auth pages
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/chat'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

- [ ] **Step 5: Create Next.js middleware**

`middleware.ts`:
```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 6: Create auth callback route**

`app/(auth)/auth/callback/route.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/setup'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
```

- [ ] **Step 7: Create signup page**

`app/(auth)/signup/page.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createBrowserSupabase()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // User will be redirected via callback
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Start managing your accounting with AI</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Sign up'}
            </Button>
            <p className="text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link href="/login" className="underline">Log in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 8: Create login page**

`app/(auth)/login/page.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createBrowserSupabase()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/chat')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Log in</CardTitle>
          <CardDescription>Welcome back to KEYHOLDER</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Logging in...' : 'Log in'}
            </Button>
            <p className="text-center text-sm text-gray-500">
              No account?{' '}
              <Link href="/signup" className="underline">Sign up</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 9: Verify auth flow works**

```bash
pnpm dev
```

1. Go to http://localhost:3000/signup
2. Create account with test email
3. Verify redirect to /setup
4. Go to http://localhost:3000/login
5. Log in, verify redirect to /chat

- [ ] **Step 10: Commit**

```bash
git add lib/supabase/ middleware.ts app/(auth)/
git commit -m "feat: add Supabase Auth (signup, login, middleware, session)"
```

---

## Phase 2: Provisioning + Onboarding

### Task 6: Supabase Provisioner Service

**Files:**
- Create: `lib/supabase/provisioner.ts`
- Create: `app/api/provision/route.ts`

- [ ] **Step 1: Create provisioner**

`lib/supabase/provisioner.ts`:
```typescript
const SUPABASE_API = 'https://api.supabase.com'

interface CreateProjectResponse {
  id: string
  ref: string
  name: string
  region: string
  status: string
  organization_slug: string
  created_at: string
}

interface ServiceHealth {
  name: string
  status: 'COMING_UP' | 'ACTIVE_HEALTHY' | 'UNHEALTHY'
}

interface ApiKey {
  api_key: string | null
  name: string
  type: string | null
}

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

export async function createProject(name: string): Promise<CreateProjectResponse> {
  const res = await fetch(`${SUPABASE_API}/v1/projects`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      name,
      organization_slug: process.env.SUPABASE_ORG_SLUG,
      db_pass: crypto.randomUUID() + crypto.randomUUID(),
      region_selection: { type: 'specific', code: 'eu-central-1' },
      desired_instance_size: 'micro',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to create project: ${res.status} ${body}`)
  }

  return res.json()
}

export async function waitForProjectReady(
  ref: string,
  maxWaitMs = 120_000
): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(
      `${SUPABASE_API}/v1/projects/${ref}/health`,
      { headers: getHeaders() }
    )

    if (res.ok) {
      const services: ServiceHealth[] = await res.json()
      const allHealthy = services.every((s) => s.status === 'ACTIVE_HEALTHY')
      if (allHealthy) return
    }

    await new Promise((r) => setTimeout(r, 5000))
  }

  throw new Error(`Project ${ref} did not become healthy within ${maxWaitMs}ms`)
}

export async function getProjectKeys(ref: string): Promise<{
  anonKey: string
  serviceRoleKey: string
  url: string
}> {
  const res = await fetch(
    `${SUPABASE_API}/v1/projects/${ref}/api-keys?reveal=true`,
    { headers: getHeaders() }
  )

  if (!res.ok) throw new Error(`Failed to get keys: ${res.status}`)

  const keys: ApiKey[] = await res.json()
  const anon = keys.find((k) => k.name === 'anon' || k.type === 'publishable')
  const service = keys.find((k) => k.name === 'service_role' || k.type === 'secret')

  if (!anon?.api_key || !service?.api_key) {
    throw new Error('Could not find anon or service_role key')
  }

  return {
    anonKey: anon.api_key,
    serviceRoleKey: service.api_key,
    url: `https://${ref}.supabase.co`,
  }
}

export async function runSql(ref: string, query: string): Promise<any> {
  const res = await fetch(
    `${SUPABASE_API}/v1/projects/${ref}/database/query`,
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ query }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SQL failed: ${res.status} ${body}`)
  }

  return res.json()
}

export async function deploySchema(ref: string, sql: string): Promise<void> {
  await runSql(ref, sql)
}
```

- [ ] **Step 2: Create provision API route**

`app/api/provision/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/control-plane'
import {
  createProject,
  waitForProjectReady,
  getProjectKeys,
  deploySchema,
} from '@/lib/supabase/provisioner'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function POST(req: Request) {
  const supabase = createServerSupabase()
  const { customerId, companyName, orgNumber } = await req.json()

  // Create job for progress tracking
  const { data: job } = await supabase
    .from('jobs')
    .insert({
      customer_id: customerId,
      job_type: 'provision',
      status: 'running',
      started_at: new Date().toISOString(),
      progress_pct: 0,
      progress_message: 'Creating database...',
    })
    .select('id')
    .single()

  const jobId = job!.id

  try {
    // 1. Create Supabase project
    const projectName = `kh-${orgNumber || customerId.slice(0, 8)}`
    const project = await createProject(projectName)

    await supabase
      .from('jobs')
      .update({ progress_pct: 20, progress_message: 'Waiting for database...' })
      .eq('id', jobId)

    // 2. Wait for project to be ready
    await waitForProjectReady(project.ref)

    await supabase
      .from('jobs')
      .update({ progress_pct: 40, progress_message: 'Deploying schema...' })
      .eq('id', jobId)

    // 3. Deploy tenant schema
    const schemaPath = join(
      process.cwd(),
      'packages/tenant-template/migrations/001_full_schema.sql'
    )
    const schemaSql = readFileSync(schemaPath, 'utf-8')
    await deploySchema(project.ref, schemaSql)

    await supabase
      .from('jobs')
      .update({ progress_pct: 60, progress_message: 'Getting access keys...' })
      .eq('id', jobId)

    // 4. Get keys
    const keys = await getProjectKeys(project.ref)

    // 5. Store tenant metadata
    await supabase.from('customer_projects').insert({
      customer_id: customerId,
      supabase_project_ref: project.ref,
      supabase_url: keys.url,
      supabase_anon_key: keys.anonKey,
      supabase_service_key_encrypted: keys.serviceRoleKey, // TODO: encrypt
      status: 'active',
    })

    // 6. Grant initial credits
    await supabase.from('credit_balances').upsert({
      customer_id: customerId,
      credits_remaining: 20,
      plan_credits_monthly: 20,
      next_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })

    await supabase.from('credit_transactions').insert({
      customer_id: customerId,
      amount: 20,
      reason: 'initial_grant',
    })

    // 7. Mark job complete
    await supabase
      .from('jobs')
      .update({
        status: 'completed',
        progress_pct: 100,
        progress_message: 'Done!',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    return NextResponse.json({ jobId, projectRef: project.ref })
  } catch (err: any) {
    await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error_message: err.message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/provisioner.ts app/api/provision/
git commit -m "feat: add tenant provisioning service (Management API)"
```

---

### Task 7: Dashboard Layout Shell

**Files:**
- Create: `app/(dashboard)/layout.tsx`
- Create: `components/dashboard/sidebar.tsx`
- Create: `components/dashboard/credit-badge.tsx`

- [ ] **Step 1: Create sidebar**

`components/dashboard/sidebar.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MessageSquare,
  Settings,
  CreditCard,
  Code,
  FileText,
  LogOut,
} from 'lucide-react'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { useRouter } from 'next/navigation'
import { CreditBadge } from './credit-badge'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/edge-functions', label: 'Edge Functions', icon: Code },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/billing', label: 'Billing', icon: CreditCard },
]

export function Sidebar({ customPages }: { customPages?: { slug: string; title: string; icon: string }[] }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-gray-50">
      <div className="p-4">
        <h1 className="text-xl font-bold">KEYHOLDER</h1>
      </div>

      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
              pathname === item.href
                ? 'bg-gray-200 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}

        {customPages && customPages.length > 0 && (
          <>
            <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase text-gray-400">
              My Tools
            </div>
            {customPages.map((page) => (
              <Link
                key={page.slug}
                href={`/pages/${page.slug}`}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
                  pathname === `/pages/${page.slug}`
                    ? 'bg-gray-200 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <FileText className="h-4 w-4" />
                {page.title}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="border-t p-4 space-y-3">
        <CreditBadge />
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Create credit badge**

`components/dashboard/credit-badge.tsx`:
```tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { Badge } from '@/components/ui/badge'

export function CreditBadge() {
  const { data: credits } = useQuery({
    queryKey: ['credits'],
    queryFn: async () => {
      const supabase = createBrowserSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data } = await supabase
        .from('credit_balances')
        .select('credits_remaining')
        .single()

      return data?.credits_remaining ?? 0
    },
    refetchInterval: 30_000,
  })

  return (
    <div className="flex items-center gap-2 px-3">
      <Badge variant={credits && credits > 5 ? 'default' : 'destructive'}>
        {credits ?? '...'} credits
      </Badge>
    </div>
  )
}
```

- [ ] **Step 3: Create dashboard layout**

`app/(dashboard)/layout.tsx`:
```tsx
import { Sidebar } from '@/components/dashboard/sidebar'
import { QueryProvider } from '@/components/query-provider'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <QueryProvider>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </QueryProvider>
  )
}
```

- [ ] **Step 4: Create QueryProvider**

`components/query-provider.tsx`:
```tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
```

```bash
pnpm add @tanstack/react-query
```

- [ ] **Step 5: Create placeholder chat page**

`app/(dashboard)/chat/page.tsx`:
```tsx
export default function ChatPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-gray-500">Chat coming in Phase 3...</p>
    </div>
  )
}
```

- [ ] **Step 6: Verify layout renders**

```bash
pnpm dev
```

Navigate to http://localhost:3000/chat (after logging in). Verify sidebar + main area render.

- [ ] **Step 7: Commit**

```bash
git add app/(dashboard)/ components/dashboard/ components/query-provider.tsx
git commit -m "feat: add dashboard layout with sidebar and credit badge"
```

---

### Task 8: Onboarding Wizard

**Files:**
- Create: `app/(onboarding)/setup/page.tsx`
- Create: `components/onboarding/sie-upload.tsx`
- Create: `components/onboarding/kontoplan-picker.tsx`
- Create: `app/api/import/route.ts`
- Create: `app/api/jobs/[id]/route.ts`

- [ ] **Step 1: Create SIE upload component**

`components/onboarding/sie-upload.tsx`:
```tsx
'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Upload } from 'lucide-react'

export function SieUpload({ onUpload }: { onUpload: (file: File) => void }) {
  const [dragActive, setDragActive] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      const file = e.dataTransfer.files[0]
      if (file && (file.name.endsWith('.se') || file.name.endsWith('.SE'))) {
        onUpload(file)
      }
    },
    [onUpload]
  )

  return (
    <Card
      className={`cursor-pointer border-2 border-dashed transition-colors ${
        dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Upload className="mb-4 h-12 w-12 text-gray-400" />
        <p className="text-lg font-medium">Drop your SIE4 file here</p>
        <p className="mt-1 text-sm text-gray-500">or click to browse (.se files)</p>
        <input
          type="file"
          accept=".se,.SE"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onUpload(file)
          }}
        />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Create kontoplan picker**

`components/onboarding/kontoplan-picker.tsx`:
```tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const kontoplaner = [
  {
    id: 'bas-2026-standard',
    title: 'BAS 2026 Standard',
    description: 'Most common. ~700 accounts. Suitable for most companies.',
  },
  {
    id: 'bas-2026-k1',
    title: 'BAS 2026 Simplified (K1)',
    description: '~200 accounts. For sole traders and very small businesses.',
  },
  {
    id: 'bas-2026-k2',
    title: 'BAS 2026 K2',
    description: 'For smaller limited companies (under 80M SEK revenue).',
  },
  {
    id: 'bas-2026-k3',
    title: 'BAS 2026 K3',
    description: 'For larger companies. Component depreciation, more detail.',
  },
]

export function KontoplanPicker({
  selected,
  onSelect,
}: {
  selected: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="grid gap-3">
      {kontoplaner.map((kp) => (
        <Card
          key={kp.id}
          className={cn(
            'cursor-pointer transition-colors',
            selected === kp.id ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-400'
          )}
          onClick={() => onSelect(kp.id)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{kp.title}</CardTitle>
            <CardDescription>{kp.description}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create onboarding page**

`app/(onboarding)/setup/page.tsx`:
```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { SieUpload } from '@/components/onboarding/sie-upload'
import { KontoplanPicker } from '@/components/onboarding/kontoplan-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, Loader2 } from 'lucide-react'

type Step = 'company' | 'method' | 'upload' | 'kontoplan' | 'provisioning' | 'done'

export default function SetupPage() {
  const [step, setStep] = useState<Step>('company')
  const [companyName, setCompanyName] = useState('')
  const [orgNumber, setOrgNumber] = useState('')
  const [selectedKontoplan, setSelectedKontoplan] = useState<string | null>(null)
  const [sieFile, setSieFile] = useState<File | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState({ pct: 0, message: '' })
  const [customerId, setCustomerId] = useState<string | null>(null)
  const router = useRouter()

  // Get or create customer record on mount
  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check if customer exists
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (existing) {
        setCustomerId(existing.id)
        // Check if already provisioned
        const { data: project } = await supabase
          .from('customer_projects')
          .select('status')
          .eq('customer_id', existing.id)
          .eq('status', 'active')
          .single()

        if (project) {
          router.push('/chat')
          return
        }
      }
    }
    init()
  }, [router])

  // Poll job progress
  useEffect(() => {
    if (!jobId) return
    const interval = setInterval(async () => {
      const res = await fetch(`/api/jobs/${jobId}`)
      const job = await res.json()
      setProgress({ pct: job.progress_pct, message: job.progress_message })
      if (job.status === 'completed') {
        clearInterval(interval)
        setStep('done')
        setTimeout(() => router.push('/chat'), 1500)
      }
      if (job.status === 'failed') {
        clearInterval(interval)
        setProgress({ pct: 0, message: `Error: ${job.error_message}` })
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [jobId, router])

  async function startProvisioning(method: 'sie' | 'kontoplan') {
    setStep('provisioning')

    const supabase = createBrowserSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Create customer if needed
    let cId = customerId
    if (!cId) {
      const { data: newCustomer } = await supabase
        .from('customers')
        .insert({
          auth_user_id: user.id,
          email: user.email!,
          company_name: companyName,
          org_number: orgNumber,
        })
        .select('id')
        .single()
      cId = newCustomer!.id
      setCustomerId(cId)
    }

    // Start provisioning
    const provisionRes = await fetch('/api/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: cId, companyName, orgNumber }),
    })
    const { jobId: jId } = await provisionRes.json()
    setJobId(jId)

    // If SIE file, upload it after provisioning starts
    if (method === 'sie' && sieFile) {
      // Wait for provisioning to complete, then import
      // The import will be triggered after provisioning job finishes
      // For now, we'll handle this in a follow-up step
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Set up your accounting</h1>
          <p className="text-gray-500">
            {step === 'company' && 'Tell us about your company'}
            {step === 'method' && 'How would you like to get started?'}
            {step === 'upload' && 'Upload your SIE4 file from Fortnox'}
            {step === 'kontoplan' && 'Choose a chart of accounts'}
            {step === 'provisioning' && 'Setting up your database...'}
            {step === 'done' && 'All done!'}
          </p>
        </div>

        {step === 'company' && (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label htmlFor="company">Company name</Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme AB"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org">Organization number (optional)</Label>
                <Input
                  id="org"
                  value={orgNumber}
                  onChange={(e) => setOrgNumber(e.target.value)}
                  placeholder="556xxx-xxxx"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => setStep('method')}
                disabled={!companyName}
              >
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'method' && (
          <div className="grid gap-3">
            <Card
              className="cursor-pointer hover:border-blue-500"
              onClick={() => setStep('upload')}
            >
              <CardHeader>
                <CardTitle className="text-base">Upload SIE4 file</CardTitle>
                <p className="text-sm text-gray-500">
                  Import your complete accounting history from Fortnox or another system
                </p>
              </CardHeader>
            </Card>
            <Card
              className="cursor-pointer hover:border-blue-500"
              onClick={() => setStep('kontoplan')}
            >
              <CardHeader>
                <CardTitle className="text-base">Start with a standard chart of accounts</CardTitle>
                <p className="text-sm text-gray-500">
                  New company or no existing accounting system? Pick a BAS template
                </p>
              </CardHeader>
            </Card>
          </div>
        )}

        {step === 'upload' && (
          <div className="space-y-4">
            <SieUpload onUpload={(file) => setSieFile(file)} />
            {sieFile && (
              <div className="space-y-2">
                <p className="text-sm text-green-600">
                  Selected: {sieFile.name} ({(sieFile.size / 1024).toFixed(0)} KB)
                </p>
                <Button className="w-full" onClick={() => startProvisioning('sie')}>
                  Import and set up
                </Button>
              </div>
            )}
            <Button variant="ghost" className="w-full" onClick={() => setStep('method')}>
              Back
            </Button>
          </div>
        )}

        {step === 'kontoplan' && (
          <div className="space-y-4">
            <KontoplanPicker selected={selectedKontoplan} onSelect={setSelectedKontoplan} />
            <Button
              className="w-full"
              disabled={!selectedKontoplan}
              onClick={() => startProvisioning('kontoplan')}
            >
              Set up with {selectedKontoplan?.replace('bas-2026-', 'BAS ').toUpperCase()}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep('method')}>
              Back
            </Button>
          </div>
        )}

        {step === 'provisioning' && (
          <Card>
            <CardContent className="space-y-4 py-8 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-500" />
              <div>
                <p className="font-medium">{progress.message || 'Starting...'}</p>
                <div className="mt-2 h-2 rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${progress.pct}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'done' && (
          <Card>
            <CardContent className="py-8 text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
              <p className="mt-4 text-lg font-medium">All set!</p>
              <p className="text-gray-500">Redirecting to chat...</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create job polling endpoint**

`app/api/jobs/[id]/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/control-plane'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}
```

- [ ] **Step 5: Create SIE import API route**

`app/api/import/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/control-plane'
import { createTenantClient } from '@/lib/supabase/tenant-client'
import { parseSIE4, importToSupabase } from '@keyholder/sie-parser'

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const customerId = formData.get('customerId') as string

  if (!file || !customerId) {
    return NextResponse.json({ error: 'Missing file or customerId' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  // Get tenant project info
  const { data: project } = await supabase
    .from('customer_projects')
    .select('*')
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .single()

  if (!project) {
    return NextResponse.json({ error: 'No active project found' }, { status: 404 })
  }

  // Create import job
  const { data: job } = await supabase
    .from('jobs')
    .insert({
      customer_id: customerId,
      job_type: 'sie_import',
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = parseSIE4(buffer)

    const tenantClient = createTenantClient(
      project.supabase_url,
      project.supabase_service_key_encrypted // TODO: decrypt
    )

    await importToSupabase(parsed, project.supabase_url, project.supabase_service_key_encrypted)

    await supabase
      .from('jobs')
      .update({
        status: 'completed',
        progress_pct: 100,
        progress_message: `Imported ${parsed.vouchers.length} vouchers, ${parsed.accounts.length} accounts`,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job!.id)

    return NextResponse.json({ jobId: job!.id, stats: {
      accounts: parsed.accounts.length,
      vouchers: parsed.vouchers.length,
    }})
  } catch (err: any) {
    await supabase
      .from('jobs')
      .update({ status: 'failed', error_message: err.message })
      .eq('id', job!.id)

    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 6: Verify onboarding flow**

```bash
pnpm dev
```

1. Sign up with new account
2. Should redirect to /setup
3. Enter company name
4. Choose "Start with standard chart of accounts"
5. Select BAS 2026 Standard
6. Click setup -> provisioning starts (will fail without real Supabase Management API token, but UI flow should work)

- [ ] **Step 7: Commit**

```bash
git add app/(onboarding)/ components/onboarding/ app/api/import/ app/api/jobs/
git commit -m "feat: add onboarding wizard (SIE upload + kontoplan picker + provisioning)"
```

---

## Phase 3: Claude Chat + Credits

### Task 9: System Prompt Builder

**Files:**
- Create: `lib/claude/system-prompt.ts`

- [ ] **Step 1: Create system prompt builder**

`lib/claude/system-prompt.ts`:
```typescript
import { createTenantClient } from '@/lib/supabase/tenant-client'

export async function buildSystemPrompt(
  tenantUrl: string,
  tenantServiceKey: string
): Promise<string> {
  const tenant = createTenantClient(tenantUrl, tenantServiceKey)

  // Fetch company info
  const { data: company } = await tenant
    .from('company_info')
    .select('*')
    .limit(1)
    .single()

  // Fetch accounts (for context)
  const { data: accounts } = await tenant
    .from('accounts')
    .select('account_number, name, account_type')
    .order('account_number')

  // Fetch financial years
  const { data: years } = await tenant
    .from('financial_years')
    .select('*')
    .order('year_index')

  const currentYear = years?.find((y) => y.year_index === 0)

  // Build account list (truncated for token efficiency)
  const accountList = (accounts || [])
    .map((a) => `${a.account_number} ${a.name}`)
    .join('\n')

  return `You are an accounting assistant for ${company?.company_name || 'this company'}${
    company?.org_number ? ` (${company.org_number})` : ''
  }.

You have access to the company's complete accounting data in a PostgreSQL database.

## DATABASE SCHEMA

Tables available:
- company_info: Company metadata (name, org_number, address, etc.)
- financial_years: Fiscal year periods (year_index 0 = current)
- accounts: Chart of accounts (account_number, name, account_type: T=asset, S=liability, K=expense, I=income)
- sru_codes: Tax reporting codes per account
- dimensions: Dimension types (1=cost center, 6=project, etc.)
- objects: Dimension objects (cost center names, project names)
- vouchers: Accounting entries (series, voucher_number, date, description)
- voucher_rows: Transaction lines (account_number, amount, quantity)
- voucher_row_objects: Multi-dimension links per voucher row
- opening_balances: Opening balances (IB) per account and year
- closing_balances: Closing balances (UB) per account and year
- period_results: Period results (RES) per account and year
- period_balances: Period balances per account, period, and dimension
- period_budgets: Period budgets per account, period, and dimension
- custom_pages: User-created dashboard pages

Key relationships:
- vouchers -> voucher_rows (voucher_id)
- voucher_rows -> voucher_row_objects (voucher_row_id)
- All tables have company_id column
- vouchers reference financial_years via financial_year_id

## CHART OF ACCOUNTS

${accountList}

## FINANCIAL YEARS

${(years || []).map((y) => `Year index ${y.year_index}: ${y.start_date} to ${y.end_date}`).join('\n')}
${currentYear ? `\nCurrent year: ${currentYear.start_date} to ${currentYear.end_date}` : ''}

## RULES

- Swedish accounting: BAS chart of accounts, K2/K3 regulations
- Every voucher MUST balance (sum of all voucher_rows.amount = 0, debit positive, credit negative)
- VAT rates: 25% (standard), 12% (food/hotels), 6% (books/transport), 0% (exempt)
- Account ranges: 1xxx=assets, 2xxx=liabilities/equity, 3xxx=income, 4xxx-7xxx=expenses, 8xxx=financial
- Amounts are in SEK with ore precision (decimal(15,2))
- Always respond in Swedish unless the user writes in English
- When showing monetary amounts, format as Swedish: 1 234,56 kr

## TOOL USAGE

- Use execute_sql for reading data (SELECT only)
- Use execute_mutation for creating/modifying data (requires user approval)
- Use deploy_edge_function for creating scheduled checks or automations
- Use generate_report for formatted balance/income reports
- Use create_custom_page for building visual dashboard pages

When generating SQL, use explicit column names (not SELECT *). Include relevant JOINs. Format amounts for readability.`
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/claude/system-prompt.ts
git commit -m "feat: add dynamic system prompt builder for Claude"
```

---

### Task 10: Chat Tools

**Files:**
- Create: `lib/claude/tools.ts`

- [ ] **Step 1: Install AI SDK dependencies**

```bash
pnpm add ai@4 @ai-sdk/anthropic@1 @ai-sdk/react zod
```

- [ ] **Step 2: Create tool definitions**

`lib/claude/tools.ts`:
```typescript
import { tool } from 'ai'
import { z } from 'zod'
import { createTenantClient } from '@/lib/supabase/tenant-client'

export function buildTools(tenantUrl: string, tenantServiceKey: string) {
  const tenant = createTenantClient(tenantUrl, tenantServiceKey)

  return {
    execute_sql: tool({
      description:
        'Run a read-only SELECT query against the accounting database. Returns up to 1000 rows as JSON.',
      parameters: z.object({
        query: z
          .string()
          .describe('A SELECT SQL query. Only SELECT is allowed — no mutations.'),
      }),
      execute: async ({ query }) => {
        // Validate: only SELECT
        const normalized = query.trim().toUpperCase()
        if (!normalized.startsWith('SELECT')) {
          return { error: 'Only SELECT queries are allowed' }
        }

        // Block dangerous keywords
        const blocked = [
          'DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE',
          'INSERT', 'UPDATE', 'GRANT', 'REVOKE',
        ]
        for (const word of blocked) {
          if (normalized.includes(word)) {
            return { error: `Blocked keyword: ${word}` }
          }
        }

        const { data, error } = await tenant.rpc('execute_readonly_query', {
          sql: query,
          row_limit: 1000,
        })

        if (error) return { error: error.message }
        return { rows: data, count: Array.isArray(data) ? data.length : 0 }
      },
    }),

    execute_mutation: tool({
      description:
        'Propose a data mutation (INSERT/UPDATE/DELETE). Returns the proposed SQL for user approval — does NOT execute immediately. The user must approve before execution.',
      parameters: z.object({
        description: z
          .string()
          .describe('Human-readable description of what this mutation does'),
        statements: z
          .array(z.string())
          .describe('Array of SQL statements to execute if approved'),
        validation: z
          .object({
            voucher_balances: z.boolean().optional().describe('True if this creates a voucher that must balance'),
          })
          .optional(),
      }),
      execute: async ({ description, statements, validation }) => {
        // Don't execute — return for user approval
        return {
          status: 'pending_approval',
          description,
          statements,
          validation,
          message:
            'This mutation requires user approval. Show the details and ask the user to confirm.',
        }
      },
    }),

    generate_report: tool({
      description:
        'Generate a formatted accounting report (balance sheet or income statement) for a financial year.',
      parameters: z.object({
        type: z.enum(['balansrapport', 'resultatrapport']).describe('Report type'),
        financial_year_index: z
          .number()
          .default(0)
          .describe('Year index: 0 = current, -1 = previous'),
      }),
      execute: async ({ type, financial_year_index }) => {
        // Get financial year ID
        const { data: year } = await tenant
          .from('financial_years')
          .select('id, start_date, end_date')
          .eq('year_index', financial_year_index)
          .limit(1)
          .single()

        if (!year) return { error: `No financial year found for index ${financial_year_index}` }

        const rpcName =
          type === 'balansrapport' ? 'report_balansrapport' : 'report_resultatrapport'

        const { data, error } = await tenant.rpc(rpcName, {
          p_financial_year_id: year.id,
        })

        if (error) return { error: error.message }

        return {
          type,
          period: `${year.start_date} to ${year.end_date}`,
          rows: data,
        }
      },
    }),

    deploy_edge_function: tool({
      description:
        'Generate and deploy a Supabase Edge Function to the customer\'s project. Returns the function code for user approval before deploying.',
      parameters: z.object({
        name: z.string().describe('Function name (slug, lowercase, hyphens)'),
        description: z.string().describe('What the function does'),
        code: z.string().describe('Complete TypeScript edge function code (Deno runtime)'),
        schedule: z.string().optional().describe('Cron expression if this should run on a schedule (e.g. "0 8 * * MON")'),
      }),
      execute: async ({ name, description, code, schedule }) => {
        // Don't deploy — return for user approval
        return {
          status: 'pending_approval',
          name,
          description,
          code,
          schedule,
          message: 'This edge function needs user approval before deployment.',
        }
      },
    }),

    create_custom_page: tool({
      description:
        'Create a custom dashboard page with a React component. The page will appear in the sidebar under "My Tools". Returns the code for user approval.',
      parameters: z.object({
        title: z.string().describe('Page title shown in sidebar'),
        slug: z.string().describe('URL slug (lowercase, hyphens)'),
        description: z.string().describe('What this page shows/does'),
        component_code: z
          .string()
          .describe(
            'Complete React TSX component code. Available imports: react, recharts, @supabase/supabase-js, date-fns, lucide-react. Component receives props: { supabase, companyInfo, financialYear }.'
          ),
        icon: z.string().default('file-text').describe('Lucide icon name'),
      }),
      execute: async ({ title, slug, description, component_code, icon }) => {
        return {
          status: 'pending_approval',
          title,
          slug,
          description,
          component_code,
          icon,
          message: 'This custom page needs user approval before creation.',
        }
      },
    }),
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/claude/tools.ts
git commit -m "feat: add Claude tool definitions (SQL, mutations, reports, EF, pages)"
```

---

### Task 11: Credit Calculator

**Files:**
- Create: `lib/claude/credit-calculator.ts`

- [ ] **Step 1: Create credit calculator**

`lib/claude/credit-calculator.ts`:
```typescript
// Pricing: ~$3/M input tokens, ~$15/M output tokens for Sonnet
const INPUT_COST_PER_TOKEN = 3 / 1_000_000
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000

// 1 credit = approximately $0.02 (covers ~2K input + 1K output)
const DOLLARS_PER_CREDIT = 0.02

export function calculateCreditsUsed(
  tokensIn: number,
  tokensOut: number
): number {
  const costUsd =
    tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN
  const credits = costUsd / DOLLARS_PER_CREDIT
  // Minimum 0.5 credits per turn, round up to nearest 0.5
  return Math.max(0.5, Math.ceil(credits * 2) / 2)
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/claude/credit-calculator.ts
git commit -m "feat: add credit calculator (token to credit conversion)"
```

---

### Task 12: Chat API Route

**Files:**
- Create: `app/api/chat/route.ts`

- [ ] **Step 1: Create chat route with streaming**

`app/api/chat/route.ts`:
```typescript
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createServerSupabase } from '@/lib/supabase/control-plane'
import { buildSystemPrompt } from '@/lib/claude/system-prompt'
import { buildTools } from '@/lib/claude/tools'
import { calculateCreditsUsed } from '@/lib/claude/credit-calculator'

export const maxDuration = 60

export async function POST(req: Request) {
  const { messages, tenantId } = await req.json()

  const supabase = createServerSupabase()

  // 1. Get tenant project info
  const { data: project } = await supabase
    .from('customer_projects')
    .select('*')
    .eq('customer_id', tenantId)
    .eq('status', 'active')
    .single()

  if (!project) {
    return new Response(JSON.stringify({ error: 'No active project' }), {
      status: 404,
    })
  }

  // 2. Check credits
  const { data: credits } = await supabase
    .from('credit_balances')
    .select('credits_remaining')
    .eq('customer_id', tenantId)
    .single()

  if (!credits || credits.credits_remaining <= 0) {
    return new Response(
      JSON.stringify({ error: 'No credits remaining. Purchase more to continue.' }),
      { status: 402 }
    )
  }

  // 3. Build context
  const systemPrompt = await buildSystemPrompt(
    project.supabase_url,
    project.supabase_service_key_encrypted // TODO: decrypt
  )

  const tools = buildTools(
    project.supabase_url,
    project.supabase_service_key_encrypted
  )

  // 4. Stream response
  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: systemPrompt,
    messages,
    tools,
    maxSteps: 10,
    onFinish: async ({ usage }) => {
      // 5. Deduct credits
      const creditsUsed = calculateCreditsUsed(
        usage.promptTokens,
        usage.completionTokens
      )

      await supabase.rpc('deduct_credits', {
        p_customer_id: tenantId,
        p_amount: Math.ceil(creditsUsed),
        p_tokens_in: usage.promptTokens,
        p_tokens_out: usage.completionTokens,
      })
    },
  })

  return result.toDataStreamResponse()
}
```

- [ ] **Step 2: Add credit deduction RPC to control plane schema**

Add to `supabase/migrations/001_control_plane.sql` (or create new migration):

```sql
CREATE OR REPLACE FUNCTION deduct_credits(
  p_customer_id uuid,
  p_amount integer,
  p_tokens_in integer DEFAULT 0,
  p_tokens_out integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE credit_balances
  SET
    credits_remaining = GREATEST(0, credits_remaining - p_amount),
    credits_used_total = credits_used_total + p_amount
  WHERE customer_id = p_customer_id;

  INSERT INTO credit_transactions (customer_id, amount, reason, tokens_in, tokens_out)
  VALUES (p_customer_id, -p_amount, 'chat_turn', p_tokens_in, p_tokens_out);
END;
$$;
```

- [ ] **Step 3: Commit**

```bash
git add app/api/chat/ supabase/
git commit -m "feat: add chat API route with Claude streaming and credit deduction"
```

---

### Task 13: Chat UI Components

**Files:**
- Create: `components/chat/chat-window.tsx`
- Create: `components/chat/chat-input.tsx`
- Create: `components/chat/message-bubble.tsx`
- Create: `components/chat/tool-call-card.tsx`
- Create: `components/chat/mutation-confirm.tsx`
- Modify: `app/(dashboard)/chat/page.tsx`

- [ ] **Step 1: Create message bubble**

`components/chat/message-bubble.tsx`:
```tsx
'use client'

import { cn } from '@/lib/utils'
import { ToolCallCard } from './tool-call-card'
import { MutationConfirm } from './mutation-confirm'
import type { Message } from 'ai'

export function MessageBubble({
  message,
  onApprove,
}: {
  message: Message
  onApprove?: (toolCallId: string, statements: string[]) => void
}) {
  return (
    <div
      className={cn(
        'flex w-full',
        message.role === 'user' ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-3',
          message.role === 'user'
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-900'
        )}
      >
        {message.parts?.map((part, i) => {
          if (part.type === 'text') {
            return (
              <div key={i} className="whitespace-pre-wrap text-sm">
                {part.text}
              </div>
            )
          }

          if (part.type === 'tool-invocation') {
            const { toolCallId, toolName, state, args, result } =
              part.toolInvocation

            // Mutation or edge function — needs approval
            if (
              state === 'result' &&
              result?.status === 'pending_approval' &&
              (toolName === 'execute_mutation' || toolName === 'deploy_edge_function' || toolName === 'create_custom_page')
            ) {
              return (
                <MutationConfirm
                  key={toolCallId}
                  toolName={toolName}
                  result={result}
                  onApprove={() =>
                    onApprove?.(toolCallId, result.statements || [])
                  }
                />
              )
            }

            return (
              <ToolCallCard
                key={toolCallId}
                toolName={toolName}
                state={state}
                args={args}
                result={result}
              />
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create tool call card**

`components/chat/tool-call-card.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Database, FileCode, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

const toolIcons: Record<string, any> = {
  execute_sql: Database,
  generate_report: BarChart3,
  deploy_edge_function: FileCode,
}

export function ToolCallCard({
  toolName,
  state,
  args,
  result,
}: {
  toolName: string
  state: string
  args: any
  result: any
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = toolIcons[toolName] || Database

  return (
    <div className="my-2 rounded border bg-white text-sm">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Icon className="h-3 w-3 text-gray-500" />
        <span className="font-mono text-xs text-gray-600">{toolName}</span>
        {state === 'call' && (
          <span className="ml-auto text-xs text-yellow-600">Running...</span>
        )}
        {state === 'result' && result?.count !== undefined && (
          <span className="ml-auto text-xs text-green-600">
            {result.count} rows
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t px-3 py-2">
          {args?.query && (
            <pre className="mb-2 overflow-x-auto rounded bg-gray-900 p-2 text-xs text-gray-100">
              {args.query}
            </pre>
          )}
          {result?.rows && (
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    {result.rows[0] &&
                      Object.keys(result.rows[0]).map((key) => (
                        <th key={key} className="px-2 py-1 text-left font-medium">
                          {key}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 50).map((row: any, i: number) => (
                    <tr key={i} className="border-b">
                      {Object.values(row).map((val: any, j: number) => (
                        <td key={j} className="px-2 py-1">
                          {String(val ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length > 50 && (
                <p className="mt-1 text-xs text-gray-500">
                  Showing 50 of {result.count} rows
                </p>
              )}
            </div>
          )}
          {result?.error && (
            <p className="text-xs text-red-500">{result.error}</p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create mutation confirm dialog**

`components/chat/mutation-confirm.tsx`:
```tsx
'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Check, X } from 'lucide-react'
import { useState } from 'react'

export function MutationConfirm({
  toolName,
  result,
  onApprove,
}: {
  toolName: string
  result: any
  onApprove: () => void
}) {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending')

  const title =
    toolName === 'execute_mutation'
      ? 'Approve booking'
      : toolName === 'deploy_edge_function'
      ? 'Deploy edge function'
      : 'Create custom page'

  return (
    <Card className="my-2 border-yellow-300 bg-yellow-50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm">{result.description}</p>

        {result.statements && (
          <pre className="overflow-x-auto rounded bg-gray-900 p-2 text-xs text-gray-100">
            {result.statements.join('\n\n')}
          </pre>
        )}

        {result.code && (
          <pre className="max-h-48 overflow-auto rounded bg-gray-900 p-2 text-xs text-gray-100">
            {result.code}
          </pre>
        )}

        {result.component_code && (
          <pre className="max-h-48 overflow-auto rounded bg-gray-900 p-2 text-xs text-gray-100">
            {result.component_code}
          </pre>
        )}

        {result.schedule && (
          <p className="text-xs text-gray-500">Schedule: {result.schedule}</p>
        )}

        {status === 'pending' && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setStatus('rejected')}
            >
              <X className="mr-1 h-3 w-3" /> Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setStatus('approved')
                onApprove()
              }}
            >
              <Check className="mr-1 h-3 w-3" /> Approve
            </Button>
          </div>
        )}

        {status === 'approved' && (
          <p className="text-sm text-green-600">Approved and executing...</p>
        )}
        {status === 'rejected' && (
          <p className="text-sm text-red-500">Cancelled.</p>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Create chat input**

`components/chat/chat-input.tsx`:
```tsx
'use client'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send } from 'lucide-react'
import { KeyboardEvent } from 'react'

export function ChatInput({
  input,
  onChange,
  onSubmit,
  isLoading,
  creditsRemaining,
}: {
  input: string
  onChange: (value: string) => void
  onSubmit: () => void
  isLoading: boolean
  creditsRemaining: number | null
}) {
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isLoading) onSubmit()
    }
  }

  return (
    <div className="border-t bg-white p-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your accounting..."
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
          />
          <Button
            onClick={onSubmit}
            disabled={!input.trim() || isLoading}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-1 flex justify-between text-xs text-gray-400">
          <span>Shift+Enter for new line</span>
          {creditsRemaining !== null && (
            <span>{creditsRemaining} credits remaining</span>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create chat window**

`components/chat/chat-window.tsx`:
```tsx
'use client'

import { useChat } from '@ai-sdk/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { MessageBubble } from './message-bubble'
import { ChatInput } from './chat-input'
import { ScrollArea } from '@/components/ui/scroll-area'

export function ChatWindow({ customerId }: { customerId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data: credits } = useQuery({
    queryKey: ['credits'],
    queryFn: async () => {
      const supabase = createBrowserSupabase()
      const { data } = await supabase
        .from('credit_balances')
        .select('credits_remaining')
        .single()
      return data?.credits_remaining ?? 0
    },
    refetchInterval: 10_000,
  })

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    error,
  } = useChat({
    api: '/api/chat',
    body: { tenantId: customerId },
    onFinish: () => {
      // Refresh credit count after each response
      queryClient.invalidateQueries({ queryKey: ['credits'] })
    },
  })

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isLoading = status === 'streaming' || status === 'submitted'

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1 p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 && (
            <div className="flex h-64 items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-lg font-medium">Welcome to KEYHOLDER</p>
                <p className="mt-1 text-sm">
                  Ask anything about your accounting data
                </p>
                <div className="mt-4 space-y-1 text-xs">
                  <p>"Show me all transactions over 50K SEK in December"</p>
                  <p>"Generate a balance report for Q3"</p>
                  <p>"Book invoice #1092: 45,000 kr incl VAT"</p>
                </div>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onApprove={async (toolCallId, statements) => {
                // Execute approved mutation
                await fetch('/api/chat/execute-mutation', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    tenantId: customerId,
                    statements,
                  }),
                })
              }}
            />
          ))}

          {error && (
            <p className="text-center text-sm text-red-500">{error.message}</p>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <ChatInput
        input={input}
        onChange={(v) =>
          handleInputChange({ target: { value: v } } as any)
        }
        onSubmit={() =>
          handleSubmit(new Event('submit') as any)
        }
        isLoading={isLoading}
        creditsRemaining={credits ?? null}
      />
    </div>
  )
}
```

- [ ] **Step 6: Update chat page**

`app/(dashboard)/chat/page.tsx`:
```tsx
import { createServerSupabase } from '@/lib/supabase/control-plane'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import { ChatWindow } from '@/components/chat/chat-window'

export default async function ChatPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminSupabase = createServerSupabase()

  const { data: customer } = await adminSupabase
    .from('customers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!customer) redirect('/setup')

  // Check if provisioned
  const { data: project } = await adminSupabase
    .from('customer_projects')
    .select('status')
    .eq('customer_id', customer.id)
    .eq('status', 'active')
    .single()

  if (!project) redirect('/setup')

  return <ChatWindow customerId={customer.id} />
}
```

- [ ] **Step 7: Verify chat renders**

```bash
pnpm dev
```

Navigate to /chat. Verify:
- Empty state with welcome message renders
- Input field and send button render
- Credit badge shows in sidebar

- [ ] **Step 8: Commit**

```bash
git add components/chat/ app/(dashboard)/chat/
git commit -m "feat: add Claude chat UI with streaming, tool cards, and mutation approval"
```

---

## Phase 4: Custom Pages + Edge Functions

### Task 14: Custom Page Renderer

**Files:**
- Create: `app/(dashboard)/pages/[slug]/page.tsx`
- Create: `app/api/custom-pages/route.ts`

- [ ] **Step 1: Create custom pages API route**

`app/api/custom-pages/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/control-plane'
import { createTenantClient } from '@/lib/supabase/tenant-client'

export async function POST(req: Request) {
  const { tenantId, title, slug, description, component_code, icon } =
    await req.json()

  const supabase = createServerSupabase()

  // Get tenant project
  const { data: project } = await supabase
    .from('customer_projects')
    .select('*')
    .eq('customer_id', tenantId)
    .eq('status', 'active')
    .single()

  if (!project) {
    return NextResponse.json({ error: 'No active project' }, { status: 404 })
  }

  const tenant = createTenantClient(
    project.supabase_url,
    project.supabase_service_key_encrypted
  )

  const { data, error } = await tenant
    .from('custom_pages')
    .upsert(
      { slug, title, description, component_code, icon },
      { onConflict: 'slug' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId')

  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  const { data: project } = await supabase
    .from('customer_projects')
    .select('*')
    .eq('customer_id', tenantId)
    .eq('status', 'active')
    .single()

  if (!project) {
    return NextResponse.json({ error: 'No active project' }, { status: 404 })
  }

  const tenant = createTenantClient(
    project.supabase_url,
    project.supabase_service_key_encrypted
  )

  const { data, error } = await tenant
    .from('custom_pages')
    .select('slug, title, icon, sort_order')
    .order('sort_order')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
```

- [ ] **Step 2: Create custom page renderer**

`app/(dashboard)/pages/[slug]/page.tsx`:
```tsx
import { createServerSupabase } from '@/lib/supabase/control-plane'
import { createTenantClient } from '@/lib/supabase/tenant-client'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect, notFound } from 'next/navigation'
import { CustomPageIframe } from './iframe'

export default async function CustomPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminSupabase = createServerSupabase()

  const { data: customer } = await adminSupabase
    .from('customers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!customer) redirect('/setup')

  const { data: project } = await adminSupabase
    .from('customer_projects')
    .select('*')
    .eq('customer_id', customer.id)
    .eq('status', 'active')
    .single()

  if (!project) redirect('/setup')

  const tenant = createTenantClient(
    project.supabase_url,
    project.supabase_service_key_encrypted
  )

  const { data: page } = await tenant
    .from('custom_pages')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!page) notFound()

  return (
    <div className="h-full">
      <div className="border-b px-6 py-3">
        <h1 className="text-lg font-semibold">{page.title}</h1>
        {page.description && (
          <p className="text-sm text-gray-500">{page.description}</p>
        )}
      </div>
      <CustomPageIframe
        code={page.component_code}
        supabaseUrl={project.supabase_url}
        supabaseAnonKey={project.supabase_anon_key}
      />
    </div>
  )
}
```

- [ ] **Step 3: Create sandboxed iframe renderer**

`app/(dashboard)/pages/[slug]/iframe.tsx`:
```tsx
'use client'

import { useEffect, useRef } from 'react'

export function CustomPageIframe({
  code,
  supabaseUrl,
  supabaseAnonKey,
}: {
  code: string
  supabaseUrl: string
  supabaseAnonKey: string
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!iframeRef.current) return

    // Build standalone HTML page with the component
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/react@19/umd/react.production.min.js"><\/script>
  <script src="https://unpkg.com/react-dom@19/umd/react-dom.production.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"><\/script>
  <script src="https://unpkg.com/recharts@2/umd/Recharts.js"><\/script>
  <style>body { margin: 0; padding: 16px; font-family: system-ui; }</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useRef, useMemo, useCallback } = React;
    const supabase = window.supabase.createClient("${supabaseUrl}", "${supabaseAnonKey}");

    ${code}

    const App = typeof exports !== 'undefined' && exports.default ? exports.default : (typeof CustomPage !== 'undefined' ? CustomPage : () => React.createElement('div', null, 'No component exported'));
    ReactDOM.createRoot(document.getElementById('root')).render(
      React.createElement(App, { supabase })
    );
  <\/script>
</body>
</html>`

    const blob = new Blob([html], { type: 'text/html' })
    iframeRef.current.src = URL.createObjectURL(blob)
  }, [code, supabaseUrl, supabaseAnonKey])

  return (
    <iframe
      ref={iframeRef}
      className="h-full w-full border-0"
      sandbox="allow-scripts"
      title="Custom Page"
    />
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/pages/ app/api/custom-pages/
git commit -m "feat: add custom page renderer with sandboxed iframe"
```

---

### Task 15: Edge Function Management

**Files:**
- Create: `app/api/edge-functions/route.ts`
- Create: `app/(dashboard)/edge-functions/page.tsx`

- [ ] **Step 1: Create edge function deploy API**

`app/api/edge-functions/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/control-plane'

const SUPABASE_API = 'https://api.supabase.com'

export async function POST(req: Request) {
  const { tenantId, name, code, schedule } = await req.json()

  const supabase = createServerSupabase()

  const { data: project } = await supabase
    .from('customer_projects')
    .select('supabase_project_ref')
    .eq('customer_id', tenantId)
    .eq('status', 'active')
    .single()

  if (!project) {
    return NextResponse.json({ error: 'No active project' }, { status: 404 })
  }

  const ref = project.supabase_project_ref

  // Bundle the function code into a zip-like format
  // For MVP, we use the deploy endpoint with multipart form data
  const formData = new FormData()
  formData.append(
    'metadata',
    JSON.stringify({
      entrypoint_path: 'index.ts',
      name,
      verify_jwt: true,
    })
  )

  // Create a simple function file
  const functionBlob = new Blob([code], { type: 'application/typescript' })
  formData.append('file', functionBlob, 'index.ts')

  const res = await fetch(
    `${SUPABASE_API}/v1/projects/${ref}/functions/deploy?slug=${name}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      },
      body: formData,
    }
  )

  if (!res.ok) {
    const body = await res.text()
    return NextResponse.json(
      { error: `Deploy failed: ${body}` },
      { status: 500 }
    )
  }

  const result = await res.json()
  return NextResponse.json(result)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId')

  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  const { data: project } = await supabase
    .from('customer_projects')
    .select('supabase_project_ref')
    .eq('customer_id', tenantId)
    .eq('status', 'active')
    .single()

  if (!project) {
    return NextResponse.json({ error: 'No active project' }, { status: 404 })
  }

  const res = await fetch(
    `${SUPABASE_API}/v1/projects/${project.supabase_project_ref}/functions`,
    {
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      },
    }
  )

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to list functions' }, { status: 500 })
  }

  const functions = await res.json()
  return NextResponse.json(functions)
}
```

- [ ] **Step 2: Create edge functions page**

`app/(dashboard)/edge-functions/page.tsx`:
```tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Code, Clock } from 'lucide-react'

export default function EdgeFunctionsPage() {
  const { data: functions, isLoading } = useQuery({
    queryKey: ['edge-functions'],
    queryFn: async () => {
      // TODO: get tenantId from auth context
      const res = await fetch('/api/edge-functions?tenantId=TODO')
      return res.json()
    },
  })

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Edge Functions</h1>
      <p className="mt-1 text-gray-500">
        Custom functions deployed to your Supabase project. Create new ones via chat.
      </p>

      <div className="mt-6 grid gap-4">
        {isLoading && <p className="text-gray-500">Loading...</p>}

        {functions?.map?.((fn: any) => (
          <Card key={fn.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Code className="h-4 w-4" />
                  {fn.name || fn.slug}
                </CardTitle>
                <Badge variant={fn.status === 'ACTIVE' ? 'default' : 'secondary'}>
                  {fn.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Version {fn.version}</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Updated {new Date(fn.updated_at * 1000).toLocaleDateString('sv-SE')}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}

        {!isLoading && (!functions || functions.length === 0) && (
          <p className="text-gray-500">
            No edge functions yet. Ask Claude to create one in the chat!
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/edge-functions/ app/(dashboard)/edge-functions/
git commit -m "feat: add edge function deployment API and management page"
```

---

### Task 16: Settings + Billing Pages

**Files:**
- Create: `app/(dashboard)/settings/page.tsx`
- Create: `app/(dashboard)/billing/page.tsx`

- [ ] **Step 1: Create settings page**

`app/(dashboard)/settings/page.tsx`:
```tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function SettingsPage() {
  const { data: customer } = useQuery({
    queryKey: ['customer'],
    queryFn: async () => {
      const supabase = createBrowserSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data } = await supabase
        .from('customers')
        .select('*, customer_projects(*)')
        .eq('auth_user_id', user.id)
        .single()

      return data
    },
  })

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="mt-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Company</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Name:</strong> {customer?.company_name || '—'}</p>
            <p><strong>Org number:</strong> {customer?.org_number || '—'}</p>
            <p><strong>Email:</strong> {customer?.email}</p>
            <p><strong>Plan:</strong> <Badge>{customer?.plan}</Badge></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Database</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {customer?.customer_projects?.[0] ? (
              <>
                <p>
                  <strong>Status:</strong>{' '}
                  <Badge variant={customer.customer_projects[0].status === 'active' ? 'default' : 'secondary'}>
                    {customer.customer_projects[0].status}
                  </Badge>
                </p>
                <p><strong>Region:</strong> {customer.customer_projects[0].region}</p>
                <p><strong>URL:</strong> <code className="text-xs">{customer.customer_projects[0].supabase_url}</code></p>
              </>
            ) : (
              <p className="text-gray-500">No project provisioned yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create billing page**

`app/(dashboard)/billing/page.tsx`:
```tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const plans = [
  { id: 'starter', name: 'Starter', price: '0 kr/mo', credits: 20 },
  { id: 'pro', name: 'Pro', price: '499 kr/mo', credits: 200 },
  { id: 'business', name: 'Business', price: '1 499 kr/mo', credits: 1000 },
]

export default function BillingPage() {
  const { data } = useQuery({
    queryKey: ['billing'],
    queryFn: async () => {
      const supabase = createBrowserSupabase()
      const { data: credits } = await supabase
        .from('credit_balances')
        .select('*')
        .single()
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      return { credits, transactions }
    },
  })

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Billing & Credits</h1>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Credits</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">
              {data?.credits?.credits_remaining ?? '...'}
            </p>
            <p className="text-sm text-gray-500">credits remaining</p>
            <p className="mt-2 text-xs text-gray-400">
              {data?.credits?.credits_used_total ?? 0} total used
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="flex items-center justify-between rounded border p-2"
                >
                  <div>
                    <p className="font-medium">{plan.name}</p>
                    <p className="text-xs text-gray-500">{plan.credits} credits/mo</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">{plan.price}</p>
                    {data?.credits?.plan_credits_monthly === plan.credits && (
                      <Badge>Current</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Stripe integration coming soon
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2">Date</th>
                <th className="pb-2">Type</th>
                <th className="pb-2 text-right">Credits</th>
              </tr>
            </thead>
            <tbody>
              {data?.transactions?.map((tx: any) => (
                <tr key={tx.id} className="border-b">
                  <td className="py-2 text-xs text-gray-500">
                    {new Date(tx.created_at).toLocaleString('sv-SE')}
                  </td>
                  <td className="py-2">{tx.reason}</td>
                  <td className="py-2 text-right">
                    <span className={tx.amount < 0 ? 'text-red-500' : 'text-green-500'}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/settings/ app/(dashboard)/billing/
git commit -m "feat: add settings and billing pages"
```

---

### Task 17: End-to-End Integration Verification

- [ ] **Step 1: Verify full flow**

```bash
pnpm dev
```

Test the complete flow:
1. Visit http://localhost:3000 — landing page
2. Click signup — create account
3. Redirected to /setup — enter company name
4. Choose "Start with standard chart of accounts"
5. Select BAS 2026 Standard
6. Provisioning starts (shows progress bar)
7. Redirected to /chat
8. Type "Show me my chart of accounts"
9. Claude responds with SQL tool call showing accounts
10. Check /billing — credits deducted
11. Check /settings — project info shown
12. Check /edge-functions — empty state

Note: Steps 4-9 require real API keys (Supabase Management API token + Anthropic API key). Without them, verify UI flows and error handling.

- [ ] **Step 2: Final commit**

```bash
git add -A
git commit -m "feat: complete KEYHOLDER platform MVP (auth, provisioning, chat, credits, custom pages)"
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] `pnpm dev` starts without errors
- [ ] Landing page renders at /
- [ ] Signup creates user in Supabase Auth + customers table
- [ ] Login redirects to /chat (or /setup if not provisioned)
- [ ] Onboarding wizard shows SIE upload and kontoplan picker options
- [ ] Provisioning API calls Supabase Management API correctly
- [ ] Chat page renders with empty state
- [ ] Chat sends messages to Claude and streams responses
- [ ] Tool calls render as expandable cards
- [ ] Mutations show approval dialog
- [ ] Credits are deducted after each chat turn
- [ ] Custom pages render in sandboxed iframe
- [ ] Edge function deployment API works
- [ ] Settings page shows customer + project info
- [ ] Billing page shows credit balance and history
- [ ] Auth middleware protects dashboard routes
- [ ] SIE parser package imports work from platform code
