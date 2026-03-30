# KEYHOLDER — AI Context Document

You are continuing work on KEYHOLDER, an accounting data platform. This document contains everything you need to understand the project, make decisions, and build. Read it fully before taking any action.

---

## WHAT IS KEYHOLDER

KEYHOLDER gives Swedish businesses their own Supabase database, pre-loaded with their complete accounting history from Fortnox. The customer owns their data fully and can connect any AI (Claude, GPT, etc.) directly to it via MCP (Model Context Protocol).

KEYHOLDER is "the system around it" — provisioning, syncing, tools. The customer brings their own AI.

**One-liner:** "Own your accounting data. Build anything."

**Analogy:** Lovable (lovable.dev) but vertical for accounting. Lovable provisions a Supabase per user for app building. KEYHOLDER provisions a Supabase per customer for accounting data + AI.

---

## BUSINESS CONTEXT

- **Company:** Early-stage startup
- **Team:** Erik (solo developer, builds with AI tools like Claude Code), one accounting expert (domain knowledge), one investor, one test client
- **Test client:** Swedish company with 17 MSEK annual revenue, ready to test the system
- **Revenue model:** Monthly subscription fee for the platform. Primary revenue comes from AI agents and workflows sold to customers. Customers pay for their own AI API keys (Claude, GPT, etc.) — KEYHOLDER does not provide AI compute.
- **Timeline:** 1-week MVP target (started 2026-03-30)
- **No billing in MVP** — the test client is the first user, Stripe integration comes in week 2+

---

## LONG-TERM VISION (important for design decisions)

1. **Phase 1 (now):** Mirror Fortnox data into customer-owned Supabase
2. **Phase 2:** AI agents and tools on top of the data (agent library, workflows)
3. **Phase 3:** Full standalone accounting system — customers no longer need Fortnox at all

This means: design the database schema as a normalized accounting schema, not a Fortnox-specific mirror. It must be able to stand alone eventually.

---

## ARCHITECTURE

### Two-tier system

**Control Plane (KEYHOLDER-owned):**
- Next.js 14 (App Router) hosted on Vercel
- KEYHOLDER's own Supabase project
- Contains: user accounts, customer metadata, Fortnox OAuth tokens, sync job state, provisioning engine
- Runs the sync scheduler and SIE4 parser

**Data Plane (one per customer):**
- Dedicated Supabase project per customer (provisioned via Supabase Management API)
- Standard accounting schema pre-deployed (identical for all customers)
- Auth pre-configured (Supabase Auth, email + password)
- Supabase Storage for media/attachments (receipts, PDFs)
- MCP-connectable — customer gets connection string, plugs into Claude Desktop / Claude Code / any MCP client

```
┌─────────────────────────────────────────────┐
│          KEYHOLDER CONTROL PLANE            │
│  Next.js 14 + Supabase (KEYHOLDER-owned)   │
│  ┌──────────┬──────────┬──────────────────┐ │
│  │ Auth &   │ Fortnox  │ Provisioning     │ │
│  │ Users    │ OAuth    │ Engine           │ │
│  ├──────────┼──────────┼──────────────────┤ │
│  │ Sync     │ SIE4     │ Customer         │ │
│  │ Scheduler│ Parser   │ Management       │ │
│  └──────────┴──────────┴──────────────────┘ │
└──────────────────┬──────────────────────────┘
                   │ provisions & syncs
          ┌────────┴────────┐
          ▼                 ▼
┌──────────────┐  ┌──────────────┐
│ Customer A   │  │ Customer B   │
│ Supabase     │  │ Supabase     │
│ ┌──────────┐ │  │ ┌──────────┐ │
│ │ All 45+  │ │  │ │ All 45+  │ │
│ │ tables   │ │  │ │ tables   │ │
│ ├──────────┤ │  │ ├──────────┤ │
│ │ Storage  │ │  │ │ Storage  │ │
│ │ (media)  │ │  │ │ (media)  │ │
│ └──────────┘ │  │ └──────────┘ │
│   ▲ MCP/AI   │  │   ▲ MCP/AI   │
└──────────────┘  └──────────────┘
        ▲                 ▲
        │  daily sync     │
┌───────┴─────────────────┴───────┐
│          FORTNOX API            │
└─────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14 (App Router) | Fast dev, Vercel deploys instantly |
| Control Plane DB | Supabase | Same tech as customer DBs |
| Customer DB | Supabase (one per customer) | Full isolation, customer ownership |
| Auth | Supabase Auth | Built-in, zero config |
| Hosting | Vercel | Free tier, instant deploys |
| Sync Engine | Supabase Edge Functions + pg_cron | No extra infra |
| Fortnox Auth | OAuth2 | Fortnox standard flow |
| Billing | Stripe (post-MVP) | Skip for week 1 |
| Provisioning | Supabase Management API + CLI scripts | Semi-automated for MVP |

---

## HOW DATA GETS IN (critical to understand)

There are TWO data ingestion paths. This is a key architectural decision:

### Path 1: SIE4 File Import (bulk historical data)

SIE4 is the Swedish standard format for accounting data exchange. It is a plain text file exported from Fortnox that contains the ENTIRE accounting history: chart of accounts, all verifications, balances, everything.

**Why this approach:** Instead of hammering the Fortnox API to do a full initial sync (slow, rate-limited, complex), the customer simply exports a SIE4 file from Fortnox and uploads it. This gives instant access to their complete history.

**SIE4 format example:**
```
#FLAGGA 0
#FORMAT PC8
#SIETYP 4
#PROGRAM "Fortnox" 1.0
#GEN 20260330
#FNAMN "Företag AB"
#ORGNR 5591234567
#RAR 0 20260101 20261231
#KONTO 1510 "Kundfordringar"
#KONTO 2610 "Utgående moms 25%"
#KONTO 3010 "Försäljning varor"
#VER A 412 20260328 "Faktura #1092"
{
  #TRANS 1510 {} 45000.00
  #TRANS 3010 {} -36000.00
  #TRANS 2610 {} -9000.00
}
```

**SIE4 tag → database table mapping:**

| SIE4 Tag | Target Table | Content |
|----------|-------------|---------|
| `#FNAMN` | `company_info` | Company name |
| `#ORGNR` | `company_info` | Organization number |
| `#RAR` | `financial_years` | Financial years (räkenskapsår) |
| `#KONTO` | `accounts` | Chart of accounts (kontoplan) |
| `#SRU` | `sru_codes` | SRU codes for tax reporting |
| `#DIM` | `dimensions` | Dimension types (cost centers, projects) |
| `#OBJEKT` | `objects` | Dimension objects |
| `#IB` | `opening_balances` | Opening balances (ingående balans) |
| `#UB` | `closing_balances` | Closing balances (utgående balans) |
| `#RES` | `period_results` | Period results |
| `#VER` + `#TRANS` | `vouchers` + `voucher_rows` | Verifications with transaction rows |

**Parser requirements:**
- Handle both CP437 and UTF-8 encodings (SIE files can be either)
- Line-by-line parsing, handle multi-line `#VER { ... }` blocks
- Batch upserts into customer's Supabase
- Real-time progress feedback via polling endpoint
- Log parse errors per line, continue processing, report summary at end

### Path 2: Fortnox API Sync (daily incremental)

After the SIE import establishes the baseline, the Fortnox API keeps data fresh with daily incremental syncs. This is lightweight — only fetching records modified since last sync.

**Key endpoints:**
- `/invoices?lastmodified=YYYY-MM-DD`
- `/supplierinvoices?lastmodified=YYYY-MM-DD`
- `/vouchers?lastmodified=YYYY-MM-DD`
- `/customers?lastmodified=YYYY-MM-DD`
- `/suppliers?lastmodified=YYYY-MM-DD`
- `/articles?lastmodified=YYYY-MM-DD`
- Additional endpoints as needed for completeness

**Constraints:**
- Fortnox rate limit: 25 requests/second per client-id
- Use incremental sync (`lastmodified` filter) — never full re-fetch
- Upsert logic (insert or update based on Fortnox ID)
- Runs via pg_cron on control plane Supabase

### Path 3: Media Import (attachments)

Fortnox allows exporting a media archive (zip) containing receipts, PDFs, images — the evidence for all booked transactions.

- Customer downloads zip from Fortnox, uploads to KEYHOLDER
- Files extracted, matched to verifications by filename/number
- Stored in customer's Supabase Storage bucket
- Linked via `voucher_attachments` table
- Optional — can be done anytime after SIE import

---

## ONBOARDING FLOW (step by step)

```
Step 1: Sign up on keyholder.se → email + password (Supabase Auth)
Step 2: "Let's set up your accounting data" → guided wizard
Step 3: Visual guide: "Download your SIE4 file from Fortnox" (with screenshots)
Step 4: Upload SIE file → triggers Supabase project provisioning + SIE parsing
        Progress shown in real-time:
          "Creating your database... ✓"
          "Importing kontoplan... ✓ (284 accounts)"
          "Importing verifikationer... ✓ (4,231 found)"
          "Importing balances... ✓"
Step 5: Upload media archive (optional, can skip and do later)
Step 6: Connect Fortnox API via OAuth → enables daily incremental sync
Step 7: Done → Dashboard with all data + "Connect your AI" prompt
```

---

## CUSTOMER DASHBOARD (what the customer sees)

Hosted on KEYHOLDER's domain. Customer logs in and sees:

**Navigation tabs:**
- **Data** — browse all accounting tables, view records, see attachments
- **Sync** — sync status per data type, last sync times, green/yellow/red health
- **AI Connect** — setup guides + one-click copy for MCP connection strings
- **Settings** — account, Fortnox connection management

**Data tab:**
- Overview cards showing record counts: verifikationer, fakturor, kunder, leverantörer, konton
- Table browser: select table → paginated view with basic filtering
- Click row → detail view with linked attachments (receipts/PDFs)

**Sync tab:**
- Per-connector status: last_sync_at, records_synced, health status
- Green: synced within 24h | Yellow: >24h | Red: >48h or error
- Force re-sync button

**AI Connect tab:**
- Pre-written setup guides for Claude Desktop, Claude Code CLI, raw Supabase MCP
- One-click copy for connection config snippets
- The customer takes these credentials and configures their own AI — KEYHOLDER does not provide AI

---

## DATABASE SCHEMA — CUSTOMER SUPABASE

Every customer gets this identical schema. All tables use uuid primary keys. All timestamps are timestamptz.

```sql
-- Company information (from SIE #FNAMN, #ORGNR)
CREATE TABLE company_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  org_number text,
  created_at timestamptz DEFAULT now()
);

-- Financial years (from SIE #RAR)
CREATE TABLE financial_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_index integer NOT NULL,  -- 0 = current, -1 = previous, etc.
  start_date date NOT NULL,
  end_date date NOT NULL
);

-- Chart of accounts (from SIE #KONTO)
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number integer UNIQUE NOT NULL,
  name text NOT NULL
);

-- SRU codes for tax reporting (from SIE #SRU)
CREATE TABLE sru_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number integer NOT NULL REFERENCES accounts(account_number),
  sru_code text NOT NULL
);

-- Dimensions: cost centers, projects (from SIE #DIM)
CREATE TABLE dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_number integer NOT NULL,
  name text NOT NULL
);

-- Dimension objects (from SIE #OBJEKT)
CREATE TABLE objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_id uuid NOT NULL REFERENCES dimensions(id),
  object_number text NOT NULL,
  name text NOT NULL
);

-- Vouchers / verifikationer (from SIE #VER)
CREATE TABLE vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series text NOT NULL,           -- e.g. "A", "B"
  voucher_number integer NOT NULL,
  date date NOT NULL,
  description text,
  financial_year_id uuid REFERENCES financial_years(id),
  fortnox_id text,                -- for API sync matching
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(series, voucher_number, financial_year_id)
);

-- Voucher rows / transaction lines (from SIE #TRANS)
CREATE TABLE voucher_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  account_number integer NOT NULL REFERENCES accounts(account_number),
  object_id uuid REFERENCES objects(id),
  amount decimal(15,2) NOT NULL,
  quantity decimal(15,4),
  description text
);

-- Voucher attachments (from media import)
CREATE TABLE voucher_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,        -- Supabase Storage path
  file_type text NOT NULL,        -- "pdf", "jpg", "png"
  uploaded_at timestamptz DEFAULT now()
);

-- Opening balances (from SIE #IB)
CREATE TABLE opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL REFERENCES accounts(account_number),
  amount decimal(15,2) NOT NULL,
  UNIQUE(financial_year_id, account_number)
);

-- Closing balances (from SIE #UB)
CREATE TABLE closing_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL REFERENCES accounts(account_number),
  amount decimal(15,2) NOT NULL,
  UNIQUE(financial_year_id, account_number)
);

-- Period results (from SIE #RES)
CREATE TABLE period_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  account_number integer NOT NULL REFERENCES accounts(account_number),
  period integer NOT NULL,        -- 1-12
  amount decimal(15,2) NOT NULL,
  UNIQUE(financial_year_id, account_number, period)
);

-- Customers (from Fortnox API sync)
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fortnox_customer_number text UNIQUE NOT NULL,
  name text NOT NULL,
  org_number text,
  email text,
  phone text,
  address text,
  city text,
  zip_code text,
  country text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Suppliers (from Fortnox API sync)
CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fortnox_supplier_number text UNIQUE NOT NULL,
  name text NOT NULL,
  org_number text,
  email text,
  phone text,
  address text,
  city text,
  zip_code text,
  country text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Invoices (from Fortnox API sync)
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fortnox_document_number text UNIQUE NOT NULL,
  customer_number text REFERENCES customers(fortnox_customer_number),
  date date,
  due_date date,
  total decimal(15,2),
  balance decimal(15,2),
  currency text DEFAULT 'SEK',
  status text,                    -- "unpaid", "paid", "overdue"
  ocr text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Supplier invoices (from Fortnox API sync)
CREATE TABLE supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fortnox_given_number text UNIQUE NOT NULL,
  supplier_number text REFERENCES suppliers(fortnox_supplier_number),
  date date,
  due_date date,
  total decimal(15,2),
  balance decimal(15,2),
  currency text DEFAULT 'SEK',
  status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Articles / products (from Fortnox API sync)
CREATE TABLE articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fortnox_article_number text UNIQUE NOT NULL,
  description text,
  unit text,
  sales_price decimal(15,2),
  purchase_price decimal(15,2),
  stock_value decimal(15,2),
  quantity_in_stock decimal(15,4),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Sync status tracking (one row per data type)
CREATE TABLE sync_status (
  connector_name text PRIMARY KEY, -- e.g. "invoices", "vouchers", "sie_import"
  last_sync_at timestamptz,
  records_synced integer DEFAULT 0,
  total_records integer DEFAULT 0,
  status text DEFAULT 'pending',   -- "healthy", "warning", "error", "pending"
  error_message text,
  updated_at timestamptz DEFAULT now()
);
```

**RLS policy (applied to all tables):**
```sql
ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read all data"
  ON [table_name] FOR SELECT TO authenticated USING (true);
```

Each customer has their own Supabase project, so RLS simply allows all authenticated users in that project to read all data. Data isolation is at the project level, not the row level.

---

## DATABASE SCHEMA — CONTROL PLANE (KEYHOLDER's own Supabase)

```sql
-- Customer accounts (KEYHOLDER users)
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  company_name text,
  org_number text,
  created_at timestamptz DEFAULT now()
);

-- Customer Supabase projects (one per customer)
CREATE TABLE customer_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  supabase_project_id text NOT NULL,
  supabase_url text NOT NULL,
  supabase_anon_key text NOT NULL,
  supabase_service_key text NOT NULL, -- encrypt at app level
  status text DEFAULT 'provisioning', -- "provisioning", "active", "suspended"
  created_at timestamptz DEFAULT now()
);

-- Fortnox OAuth connections
CREATE TABLE fortnox_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  access_token text NOT NULL,         -- encrypt at app level
  refresh_token text NOT NULL,        -- encrypt at app level
  token_expires_at timestamptz NOT NULL,
  client_id text NOT NULL,
  last_sync_at timestamptz,
  status text DEFAULT 'connected'     -- "connected", "expired", "error"
);

-- Sync job tracking
CREATE TABLE sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  job_type text NOT NULL,             -- "sie_import", "media_import", "daily_sync"
  status text DEFAULT 'pending',      -- "pending", "running", "completed", "failed"
  started_at timestamptz,
  completed_at timestamptz,
  records_processed integer DEFAULT 0,
  error_message text
);
```

---

## WHAT THE MVP INCLUDES (week 1 scope)

1. **SIE4 Parser** — upload SIE4 file, parse all tags, populate customer Supabase
2. **Media Importer** — upload zip, extract, link to verifications, store in Supabase Storage
3. **Supabase Provisioning** — CLI script that creates project + schema + auth + storage bucket
4. **Daily API Sync** — pg_cron triggered, incremental fetch from Fortnox, upsert to customer DB
5. **Customer Dashboard** — data browser, sync status, AI connect guides with copy-paste configs
6. **Onboarding Wizard** — guided flow: sign up → download SIE → upload → connect Fortnox → done
7. **Sync Health Monitoring** — green/yellow/red per connector, warnings on dashboard

## WHAT THE MVP DOES NOT INCLUDE

- No Stripe/billing (test client is first user)
- No AI agents or agent library (customer connects their own AI)
- No edge function builder
- No marketplace
- No SIE re-import (one-time import only)
- No webhook-based sync (daily polling only)
- No automated Supabase provisioning UI (CLI script only)

---

## FORTNOX API DETAILS

- Auth: OAuth2 (authorization code flow)
- Base URL: `https://api.fortnox.se/3/`
- Rate limit: 25 requests/second per client-id
- Most endpoints support `?lastmodified=YYYY-MM-DD` for incremental sync
- Token refresh: access tokens expire, use refresh token to get new ones
- Fortnox requires app approval for production OAuth — check their developer portal

---

## KEY DESIGN DECISIONS ALREADY MADE

1. **SIE4 for bulk import, API for incremental only** — avoids API hammering on onboarding
2. **One Supabase project per customer** — full data isolation, customer truly owns their DB
3. **Customer brings their own AI** — KEYHOLDER provides data + tools, not AI compute
4. **Normalized schema (not Fortnox mirror)** — must work standalone when Phase 3 replaces Fortnox
5. **Semi-automated provisioning for MVP** — CLI scripts, not full UI
6. **Control plane = separate Supabase project** — KEYHOLDER's own DB for user management, tokens, sync state
7. **Next.js 14 + Vercel** — fast development, instant deploys
8. **Polling for progress feedback** — client polls progress endpoint during SIE import (not websockets)

---

## OPEN QUESTIONS (need answers before or during build)

1. **Supabase Management API access:** Requires Supabase Pro plan or organization? Verify API availability and rate limits for project creation.
2. **Fortnox OAuth app approval:** What's the process and timeline for getting approved for production use?
3. **SIE4 completeness:** Need a real SIE4 file from the test client to verify all expected tags are present.
4. **Media archive format:** Need a sample from Fortnox to understand exact file naming and structure.
5. **Supabase per-project costs:** Free tier limits vs Pro tier — what's the cost per customer at scale?

---

## RISKS

| Risk | Mitigation |
|------|-----------|
| Supabase Management API rate limits | Semi-automated CLI for MVP, batch later |
| SIE4 encoding edge cases (CP437 vs UTF-8) | Handle both, test with real files |
| Fortnox OAuth token expiry | Refresh token flow + alert on expiry |
| Fortnox API rate limits | Queue-based sync, back off on 429 |
| Customer Supabase costs at scale | Free tier for small, monitor usage |
| Data consistency Fortnox ↔ Supabase | Sync health monitoring + reconciliation |

---

## POST-MVP ROADMAP

**V2 (weeks 2-4):** Full UI onboarding, Stripe billing, SIE re-import, more API endpoints, better sync frequency
**V3 (months 2-3):** AI agent library (pre-built agents), edge function templates, workflow builder, agent subscriptions
**V4 (months 4+):** Third-party agent marketplace, full standalone accounting system (replace Fortnox), additional data sources, multi-LLM support

---

## FILE STRUCTURE (expected project layout)

```
keyholder/
├── apps/
│   └── web/                    # Next.js 14 app (frontend + API routes)
│       ├── app/                # App Router
│       │   ├── (auth)/         # Login, signup pages
│       │   ├── (dashboard)/    # Customer dashboard
│       │   ├── (onboarding)/   # Onboarding wizard
│       │   └── api/            # API routes
│       │       ├── fortnox/    # OAuth callback, sync triggers
│       │       ├── import/     # SIE upload, media upload
│       │       └── provision/  # Provisioning trigger
│       └── components/         # React components
├── packages/
│   ├── sie-parser/             # SIE4 file parser (standalone module)
│   ├── fortnox-client/         # Fortnox API client wrapper
│   ├── supabase-provisioner/   # Supabase project creation + schema deployment
│   └── sync-engine/            # Incremental sync logic (connectors)
├── scripts/
│   ├── provision-customer.ts   # CLI script to provision a new customer
│   └── migrate-schema.sql      # Customer Supabase schema migration
├── supabase/
│   └── migrations/             # Control plane Supabase migrations
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-03-30-keyholder-mvp-design.md  # Full design spec
└── AI-CONTEXT.md               # This file
```

---

## CONVENTIONS

- All code, comments, documentation, and file names in English
- User-facing text can be Swedish (the product targets Swedish businesses)
- TypeScript for all code
- Use Supabase client libraries (@supabase/supabase-js)
- Prefer server-side operations (API routes, edge functions) over client-side for data operations
- Encrypt sensitive data (Fortnox tokens, Supabase service keys) at the application level before storing

---

## CURRENT STATUS

- Design spec completed (2026-03-30)
- No code written yet
- No Supabase projects created yet
- No Fortnox OAuth app registered yet
- Ready for implementation planning
