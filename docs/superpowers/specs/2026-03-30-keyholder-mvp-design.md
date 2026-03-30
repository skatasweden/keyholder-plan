# KEYHOLDER — MVP Design Spec

**Date:** 2026-03-30
**Status:** Draft
**Author:** Erik + Claude
**Timeline:** 1 week MVP

---

## 1. Problem

Small and medium businesses in Sweden are locked into Fortnox. Their accounting data is trapped — they can't build custom dashboards, automate workflows, or use AI on their own financial data. The data exists, but it's not accessible or usable outside Fortnox's own UI.

## 2. Solution

KEYHOLDER gives every customer their own Supabase database, pre-loaded with their full accounting history from Fortnox. Customers own their data completely and can connect any AI (Claude, GPT, etc.) directly to it via MCP. KEYHOLDER is "the system around it" — provisioning, syncing, and providing tools.

**Positioning:** "Own your accounting data. Build anything."

## 3. Target Users

- **Primary:** Tech-savvy SMB founders, consultants, indie hackers with Swedish companies
- **Secondary:** Accounting firms wanting to build internal tools

## 4. Long-term Vision

Phase 1 (now): Mirror Fortnox data into customer-owned Supabase.
Phase 2: AI agents and tools on top of the data.
Phase 3: Full accounting system — customers don't need Fortnox at all.

---

## 5. System Architecture

### Two-tier Architecture

**Control Plane (KEYHOLDER-owned):**
- Next.js 14 (App Router) frontend
- KEYHOLDER's own Supabase project for: user accounts, customer metadata, Fortnox OAuth tokens, sync job state
- Provisioning engine (CLI scripts for MVP)
- Sync scheduler
- Hosted on Vercel

**Data Plane (per customer):**
- Dedicated Supabase project per customer (Lovable-style)
- Standard accounting schema pre-deployed
- Auth pre-configured
- Supabase Storage for media/attachments
- MCP-connectable — customer plugs their AI straight in

```
┌─────────────────────────────────────────────┐
│          KEYHOLDER CONTROL PLANE            │
│  Next.js + Supabase (yours)                 │
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
│ │ accounts │ │  │ │ accounts │ │
│ │ vouchers │ │  │ │ vouchers │ │
│ │ invoices │ │  │ │ invoices │ │
│ │ ...45+   │ │  │ │ ...45+   │ │
│ │ tables   │ │  │ │ tables   │ │
│ ├──────────┤ │  │ ├──────────┤ │
│ │ Storage  │ │  │ │ Storage  │ │
│ │ (media)  │ │  │ │ (media)  │ │
│ └──────────┘ │  │ └──────────┘ │
│      ▲       │  │      ▲       │
│  MCP │ AI    │  │  MCP │ AI    │
└──────────────┘  └──────────────┘
          ▲                 ▲
          │  daily sync     │
┌─────────┴─────────────────┴─────┐
│          FORTNOX API            │
└─────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 14 (App Router) | Fast dev, Vercel deploys |
| Control Plane DB | Supabase | Same tech as customers |
| Customer DB | Supabase (per customer) | Full isolation, customer ownership |
| Auth | Supabase Auth | Built-in, zero config |
| Hosting | Vercel | Free tier, instant deploys |
| Sync Engine | Supabase Edge Functions + pg_cron | No extra infra needed |
| Fortnox Auth | OAuth2 | Fortnox standard |
| Billing | Stripe (post-MVP) | Skip for week 1 |
| Provisioning | Supabase Management API + CLI | Semi-automated for MVP |

---

## 6. Onboarding Flow

```
Step 1: Sign up on keyholder.se
        → Email + password (Supabase Auth)

Step 2: "Let's set up your accounting data"
        → Guided wizard starts

Step 3: Download SIE file
        → Visual guide with screenshots:
          "Go to Fortnox → Settings → Export → SIE4"
        → Explains what the file contains

Step 4: Upload SIE file
        → Drag & drop upload
        → Behind the scenes: provisioning script creates Supabase project
        → Parser runs, shows real-time progress:
          "Creating your database... ✓"
          "Importing kontoplan... ✓ (284 accounts)"
          "Importing verifikationer... ✓ (4,231 found)"
          "Importing balances... ✓"

Step 5: Upload media archive (optional, can do later)
        → Guide: "Download media archive from Fortnox"
        → Upload zip → files linked to verifications
        → Stored in Supabase Storage

Step 6: Connect Fortnox API
        → OAuth flow: "Authorize KEYHOLDER to read your data"
        → Enables daily incremental sync

Step 7: Done → Dashboard
        → All data visible
        → "Connect your AI" prompt shown
```

**Key principle:** SIE import gives instant value (full history). Fortnox API keeps it fresh. Media is optional.

---

## 7. Core Features (MVP)

### 7.1 SIE4 Parser

The most critical component. Parses Swedish standard SIE4 files and populates the customer's Supabase.

**SIE4 tag mapping:**

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

**Parser specification:**
- Input: SIE4 file (plain text, CP437 or UTF-8 encoding)
- Processing: line-by-line parsing, handles multi-line `#VER` blocks
- Output: structured data per table
- Insert: batch upserts into customer's Supabase
- Progress: real-time feedback to UI via polling (MVP) — client polls a progress endpoint
- Error handling: log parse errors per line, continue processing, report summary

**SIE4 file format example:**
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

### 7.2 Media Importer

- Input: zip archive from Fortnox containing receipts, PDFs, images
- Processing: extract files, match to verifications by filename/number
- Storage: upload to customer's Supabase Storage bucket
- Linking: create records in `voucher_attachments` table
- File types: PDF, JPG, PNG

### 7.3 Supabase Provisioning (Semi-automated)

For MVP, a CLI script that:
1. Creates a new Supabase project via Management API
2. Runs database migration (creates all tables, indexes, RLS policies)
3. Configures auth (email + password)
4. Creates storage bucket for media
5. Stores project credentials in control plane DB
6. Returns connection details for the customer

The standard schema is deployed identically for every customer. Schema definition is maintained as a single SQL migration file.

### 7.4 Daily API Sync

Lightweight sync since SIE handles the bulk import:
- Triggered daily via pg_cron on control plane
- Per customer: fetch records modified since `last_sync_at`
- Key Fortnox endpoints for incremental sync:
  - Invoices (`/invoices?lastmodified=`)
  - Supplier invoices (`/supplierinvoices?lastmodified=`)
  - Vouchers (`/vouchers?lastmodified=`)
  - Customers (`/customers?lastmodified=`)
  - Suppliers (`/suppliers?lastmodified=`)
  - Articles (`/articles?lastmodified=`)
  - Additional endpoints as needed
- Upsert into customer's Supabase tables
- Update `sync_status` table per endpoint
- Rate limiting: respect Fortnox 25 req/sec limit

**Sync status table (per customer Supabase):**

| Column | Type | Description |
|--------|------|-------------|
| `connector_name` | text (PK) | e.g. "invoices", "vouchers" |
| `last_sync_at` | timestamptz | Last successful sync time |
| `records_synced` | integer | Records updated in last sync |
| `total_records` | integer | Total records in table |
| `status` | text | "healthy" / "warning" / "error" |
| `error_message` | text | Error details if failed |

**Sync health monitoring:**
- Dashboard shows green/yellow/red per connector
- Yellow: sync older than 24h
- Red: sync failed or older than 48h
- Notification in dashboard when sync issues detected

### 7.5 Customer Dashboard

**Navigation tabs:**
- **Data** — browse tables, view records, see attachments
- **Sync** — sync status per connector, last sync times, force re-sync button
- **AI Connect** — setup guides for connecting AI via MCP
- **Settings** — account settings, Fortnox connection management

**Data tab:**
- Overview cards: record counts per table (verifikationer, fakturor, kunder, leverantörer, konton)
- Table browser: select table → paginated data view with basic filtering
- Click row → detail view with linked attachments

**AI Connect tab:**
- Pre-written setup guides for:
  - Claude Desktop (MCP config)
  - Claude Code CLI (MCP config)
  - Raw Supabase connection string
- One-click copy for connection strings and config snippets
- Link to Supabase MCP documentation

---

## 8. Database Schema (Customer Supabase)

### Core Tables

```sql
-- Company information
company_info (
  id uuid PK,
  company_name text,
  org_number text,
  created_at timestamptz
)

-- Financial years
financial_years (
  id uuid PK,
  year_index integer,        -- 0 = current, -1 = previous
  start_date date,
  end_date date
)

-- Chart of accounts
accounts (
  id uuid PK,
  account_number integer UNIQUE,
  name text
)

-- Dimensions (cost centers, projects)
dimensions (
  id uuid PK,
  dimension_number integer,
  name text
)

-- Dimension objects
objects (
  id uuid PK,
  dimension_id uuid FK → dimensions,
  object_number text,
  name text
)

-- Vouchers (verifikationer)
vouchers (
  id uuid PK,
  series text,              -- e.g. "A", "B"
  voucher_number integer,
  date date,
  description text,
  financial_year_id uuid FK → financial_years,
  fortnox_id text,          -- for API sync matching
  created_at timestamptz,
  updated_at timestamptz
)

-- Voucher rows (transaction lines)
voucher_rows (
  id uuid PK,
  voucher_id uuid FK → vouchers,
  account_number integer FK → accounts.account_number,
  object_id uuid FK → objects (nullable),
  amount decimal(15,2),
  quantity decimal(15,4) (nullable),
  description text
)

-- Voucher attachments
voucher_attachments (
  id uuid PK,
  voucher_id uuid FK → vouchers,
  file_name text,
  file_path text,           -- Supabase Storage path
  file_type text,           -- "pdf", "jpg", "png"
  uploaded_at timestamptz
)

-- Opening balances
opening_balances (
  id uuid PK,
  financial_year_id uuid FK → financial_years,
  account_number integer FK → accounts.account_number,
  amount decimal(15,2)
)

-- Closing balances
closing_balances (
  id uuid PK,
  financial_year_id uuid FK → financial_years,
  account_number integer FK → accounts.account_number,
  amount decimal(15,2)
)

-- Period results
period_results (
  id uuid PK,
  financial_year_id uuid FK → financial_years,
  account_number integer FK → accounts.account_number,
  period integer,           -- 1-12
  amount decimal(15,2)
)

-- Customers (from Fortnox API sync)
customers (
  id uuid PK,
  fortnox_customer_number text UNIQUE,
  name text,
  org_number text,
  email text,
  phone text,
  address text,
  city text,
  zip_code text,
  country text,
  created_at timestamptz,
  updated_at timestamptz
)

-- Suppliers (from Fortnox API sync)
suppliers (
  id uuid PK,
  fortnox_supplier_number text UNIQUE,
  name text,
  org_number text,
  email text,
  phone text,
  address text,
  city text,
  zip_code text,
  country text,
  created_at timestamptz,
  updated_at timestamptz
)

-- Invoices (from Fortnox API sync)
invoices (
  id uuid PK,
  fortnox_document_number text UNIQUE,
  customer_number text FK → customers.fortnox_customer_number,
  date date,
  due_date date,
  total decimal(15,2),
  balance decimal(15,2),
  currency text,
  status text,              -- "unpaid", "paid", "overdue", etc.
  ocr text,
  created_at timestamptz,
  updated_at timestamptz
)

-- Supplier invoices (from Fortnox API sync)
supplier_invoices (
  id uuid PK,
  fortnox_given_number text UNIQUE,
  supplier_number text FK → suppliers.fortnox_supplier_number,
  date date,
  due_date date,
  total decimal(15,2),
  balance decimal(15,2),
  currency text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)

-- Articles (from Fortnox API sync)
articles (
  id uuid PK,
  fortnox_article_number text UNIQUE,
  description text,
  unit text,
  sales_price decimal(15,2),
  purchase_price decimal(15,2),
  stock_value decimal(15,2),
  quantity_in_stock decimal(15,4),
  created_at timestamptz,
  updated_at timestamptz
)

-- Sync status (per connector)
sync_status (
  connector_name text PK,
  last_sync_at timestamptz,
  records_synced integer,
  total_records integer,
  status text DEFAULT 'pending',
  error_message text,
  updated_at timestamptz
)

-- SRU codes (for tax reporting)
sru_codes (
  id uuid PK,
  account_number integer FK → accounts.account_number,
  sru_code text
)
```

### RLS Policies

All tables have Row Level Security enabled. Since each customer has their own Supabase project, RLS is configured to allow authenticated users full access to their own data:

```sql
-- Applied to all tables
CREATE POLICY "Authenticated users can read all data"
  ON [table] FOR SELECT
  TO authenticated
  USING (true);

-- Read-only for most tables (data comes from sync)
-- Write access only on user-generated tables (future: custom tools)
```

---

## 9. Control Plane Schema

The KEYHOLDER control plane Supabase stores:

```sql
-- Customer accounts
customers (
  id uuid PK,
  email text UNIQUE,
  company_name text,
  org_number text,
  created_at timestamptz
)

-- Customer Supabase projects
customer_projects (
  id uuid PK,
  customer_id uuid FK → customers,
  supabase_project_id text,
  supabase_url text,
  supabase_anon_key text,
  supabase_service_key text (encrypted),
  status text,             -- "provisioning", "active", "suspended"
  created_at timestamptz
)

-- Fortnox connections
fortnox_connections (
  id uuid PK,
  customer_id uuid FK → customers,
  access_token text (encrypted),
  refresh_token text (encrypted),
  token_expires_at timestamptz,
  client_id text,
  last_sync_at timestamptz,
  status text              -- "connected", "expired", "error"
)

-- Sync jobs
sync_jobs (
  id uuid PK,
  customer_id uuid FK → customers,
  job_type text,           -- "sie_import", "media_import", "daily_sync"
  status text,             -- "pending", "running", "completed", "failed"
  started_at timestamptz,
  completed_at timestamptz,
  records_processed integer,
  error_message text
)
```

---

## 10. Non-Goals (MVP)

These are explicitly out of scope for the 1-week MVP:

- **No billing/Stripe** — first client is the test client
- **No AI agents or agent library** — customers connect their own AI via MCP
- **No edge function builder** — future feature
- **No marketplace** — future feature
- **No re-import capability** — one-time SIE import only
- **No webhook-based sync** — daily polling only
- **No multi-tenant provisioning UI** — CLI script only
- **No frontend builder** — future feature
- **No scheduled tasks UI** — future feature

---

## 11. Success Metrics

**North Star:** Number of active customer databases with healthy sync status.

**MVP success (test client):**
- Client can upload SIE file and see all their data in dashboard
- Daily sync runs without errors
- Client can copy MCP connection string and connect Claude to their data
- Sync status accurately reflects data freshness

**Supporting metrics (post-MVP):**
- Time from sign-up to data visible in dashboard
- Sync error rate
- Number of AI connections per customer
- Customer retention (7/30 day)

---

## 12. Roadmap (post-MVP)

**V2 (weeks 2-4):**
- Full UI onboarding (no CLI scripts)
- Stripe billing integration
- SIE re-import capability
- More Fortnox API endpoints synced
- Better sync frequency options

**V3 (months 2-3):**
- AI agent library (pre-built agents customers can activate)
- Edge function templates
- Workflow builder
- Agent subscription model

**V4 (months 4+):**
- Marketplace for third-party agents
- Full accounting system (replace Fortnox)
- Additional data sources beyond Fortnox
- Multi-LLM support

---

## 13. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Supabase Management API rate limits on provisioning | Semi-automated CLI for MVP, batch provisioning later |
| SIE4 encoding edge cases (CP437 vs UTF-8) | Handle both encodings, test with real client files |
| Fortnox OAuth token expiry | Refresh token flow, alert on expiry |
| Fortnox API rate limits (25 req/sec) | Queue-based sync, respect limits, back off on 429 |
| Customer Supabase costs per project | Free tier covers small accounts, monitor usage |
| Data consistency between Fortnox and Supabase | Sync health monitoring, reconciliation checks |

---

## 14. Open Questions

1. **Supabase pricing:** What's the cost per customer project on the free vs pro tier? Need to verify Management API access requirements.
2. **Fortnox partnership:** Will Fortnox approve the OAuth app for production use? What's the review process?
3. **SIE4 completeness:** Does the test client's SIE4 export contain all the data we need, or are there gaps we need to fill via API?
4. **Media archive format:** What exact format does Fortnox use for the media export? Need a sample from the test client.
