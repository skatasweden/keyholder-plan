# KEYHOLDER Platform Design — "Lovable for Accounting"

**Date:** 2026-03-31
**Status:** Approved
**Author:** Erik + Claude

---

## 1. Vision

KEYHOLDER is an AI-native accounting platform for Swedish businesses. Users chat with Claude to explore their accounting data, generate reports, create validation rules, deploy edge functions, and eventually build custom financial tools — all backed by their own dedicated Supabase database.

**One-liner:** "Chat with your accounting data. Build anything."

**Lovable analogy:** Lovable provisions a Supabase per user for app building. KEYHOLDER provisions a Supabase per customer for accounting + AI. The chat is the primary interface, not a dashboard.

---

## 2. Core Loop

```
User -> Chat prompt -> Claude (with full DB context via system prompt)
    -> Claude generates SQL / edge function / report
    -> Executes against customer's Supabase
    -> Result rendered in chat (tables, charts, confirmations)
```

---

## 3. Architecture

### Three Layers

| Layer | Responsibility | Tech |
|-------|---------------|------|
| **Platform** | Auth, billing, provisioning, Claude proxy | Next.js 15 on Vercel |
| **Control Plane DB** | Users, credits, tenant metadata, Fortnox tokens | KEYHOLDER's Supabase |
| **Tenant Data Plane** | Accounting data, edge functions, storage | One Supabase per customer |

### Architecture Diagram

```
+-------------------------------------------------+
|          KEYHOLDER PLATFORM (Next.js 15)        |
|  +----------+ +-------------+ +---------------+ |
|  | Auth &   | | Claude Chat | | Tenant        | |
|  | Billing  | | Proxy       | | Provisioner   | |
|  +----+-----+ +------+------+ +-------+-------+ |
|       |              |                |          |
|  +----v--------------v----------------v--------+ |
|  |        Control Plane Supabase               | |
|  |  customers, credits, tenant metadata        | |
|  +---------------------+----------------------+ |
+--------------------------+----------------------+
                           |
            Supabase Management API
                           |
          +----------------+----------------+
          |                |                |
   +------v------+  +-----v-------+  +-----v-------+
   | Tenant A    |  | Tenant B    |  | Tenant C    |
   | Supabase    |  | Supabase    |  | Supabase    |
   |             |  |             |  |             |
   | - 14 tables |  | - 14 tables |  | - 14 tables |
   | - Auth      |  | - Auth      |  | - Auth      |
   | - EFs       |  | - EFs       |  | - EFs       |
   | - Storage   |  | - Storage   |  | - Storage   |
   +-------------+  +-------------+  +-------------+
```

### Approach: Monolith-first

Single Next.js 15 app handles everything: marketing, auth, dashboard, chat, API routes, admin. This is the fastest path for a solo developer. If the platform reaches 50K+ users, services can be extracted — but that's a luxury problem.

---

## 4. What Gets Reused From Existing Code

| Asset | Reuse Strategy |
|-------|---------------|
| `sie4-parser.ts` + `sie4-importer.ts` + `types.ts` | Move to `packages/sie-parser/` as standalone module |
| 13 database migrations (14 tables) | Become tenant schema template |
| `report_balansrapport` + `report_resultatrapport` SQL functions | Part of tenant template |
| 104-test suite | Keep and extend |
| `execute_readonly_query` | New RPC function added to tenant template — sandboxed SELECT execution for Claude tools |
| React frontend (9 views) | Reference only — chat replaces the dashboard |

---

## 5. Onboarding & Tenant Provisioning

### Signup Flow

```
1. User -> keyholder.se -> "Get started"
2. Email + password (Supabase Auth on control plane)
3. Onboarding wizard:
   a) "Company name?" + org number
   b) "How do you want to get started?"
      [A] Upload SIE4 file from Fortnox (existing company)
      [B] Start with a standard chart of accounts (new company)
   c) If A: drag-drop upload of .se file
      If B: pick BAS variant (Standard, K1, K2, K3)
4. Backend pipeline:
   a) Create Supabase project via Management API
   b) Deploy tenant schema (14 tables + report functions)
   c) Deploy standard edge functions
   d) Either: parse SIE4 + import, or seed with chosen BAS chart
   e) Set initial credits (e.g. 20 free on Starter)
5. "Done! Talk to your accounting ->" -> Chat opens
```

### Provisioning Pipeline

```typescript
async function provisionTenant(customerId: string, options: {
  sieFile?: Buffer,
  kontoplan?: 'bas-2026-standard' | 'bas-2026-k1' | 'bas-2026-k2' | 'bas-2026-k3',
  companyName: string,
  orgNumber?: string
}) {
  // 1. Create Supabase project
  const project = await supabaseAdmin.createProject({
    name: `kh-${options.orgNumber || customerId.slice(0,8)}`,
    region: 'eu-central-1',
    plan: 'free'
  })

  // 2. Wait for project ready (~60s)
  await waitForProjectReady(project.id)

  // 3. Deploy schema (14 tables + RLS + report functions)
  await deployTenantSchema(project.id)

  // 4. Deploy standard edge functions
  await deployEdgeFunctions(project.id)

  // 5. Store tenant metadata in control plane
  await controlPlane.from('customer_projects').insert({
    customer_id: customerId,
    supabase_project_id: project.id,
    supabase_url: project.url,
    supabase_anon_key: project.anon_key,
    supabase_service_key: encrypt(project.service_key),
    status: 'active'
  })

  // 6. Populate data
  if (options.sieFile) {
    const parsed = parseSIE4(options.sieFile)
    await importToSupabase(parsed, project.url, project.service_key)
  } else {
    await seedKontoplan(project, options.kontoplan)
    await seedCompanyInfo(project, options.companyName, options.orgNumber)
    await seedFinancialYear(project) // current calendar year
  }
}
```

### BAS Chart of Accounts Templates

Stored as JSON seed files:

```
packages/tenant-template/
  seed/
    bas-2026-standard.json   # ~700 accounts (most common)
    bas-2026-k1.json         # ~200 accounts (simplified)
    bas-2026-k2.json         # smaller companies
    bas-2026-k3.json         # larger companies
```

### Progress Feedback

Real-time progress via polling against control plane `sync_jobs` table:

- "Creating your database..." -> spinner
- "Importing chart of accounts... 284 accounts" -> check
- "Importing vouchers... 4,231 found" -> check
- "Calculating balance report..." -> check
- "All done!" -> redirect to chat

---

## 6. Claude Chat — The Heart of the Platform

### Capabilities (MVP — Level B)

| Category | Examples |
|----------|---------|
| **Query data** | "Show all transactions on account 6210 in December" |
| **Reports** | "Generate balance report for Q3" |
| **Validation** | "Check that all vouchers balance" |
| **Bookkeeping** | "Book invoice #1092: 45,000 kr incl VAT to customer ABC" |
| **Edge functions** | "Create a scheduled check that every Monday verifies all customer invoices over 10K have been paid" |
| **Explanations** | "Why does my balance report differ from Fortnox?" |

### Architecture

```
Browser                    Next.js API Route           Anthropic API
+----------+              +--------------+            +-----------+
| Chat UI  |--- POST ---->| /api/chat    |--- req --->| Claude    |
| (React)  |              |              |            | Sonnet    |
|          |<-- stream ---|  - auth check|<-- stream -|           |
|          |              |  - credit ck |            +-----------+
+----------+              |  - build ctx |
                          |  - exec tools|
                          +------+-------+
                                 |
                          +------v-------+
                          | Tenant       |
                          | Supabase     |
                          +--------------+
```

### System Prompt (built dynamically per tenant)

```
You are an accounting assistant for {company_name} ({org_number}).
You have access to the company's complete accounting data in a Supabase database.

DATABASE SCHEMA:
{full schema: tables, columns, types, relationships}

CHART OF ACCOUNTS (selection):
1510 Kundfordringar
2610 Utgaende moms 25%
3010 Forsaljning varor
... (all active accounts)

FINANCIAL YEAR:
2025-01-01 to 2025-12-31 (current)

RULES:
- Swedish accounting: BAS chart of accounts, K2/K3 regulations
- Every voucher MUST balance (debit = credit)
- VAT: 25%, 12%, 6%, 0% depending on account class
- Respond in Swedish unless the user writes in English

TOOLS:
You have access to these tools:
- execute_sql: Run SELECT queries against the database
- execute_mutation: Run INSERT/UPDATE (requires user confirmation)
- deploy_edge_function: Create and deploy an edge function
- generate_report: Generate formatted report (balance, income, etc.)
```

### Tool Definitions

**1. `execute_sql` — Read data**

Read-only SELECT queries against tenant database. Server-side execution via tenant service key.

Constraints:
- Only SELECT allowed
- Blocked keywords: DROP, DELETE, TRUNCATE, ALTER, CREATE, INSERT, UPDATE, GRANT, REVOKE
- 10 second timeout
- Max 1000 rows returned

**2. `execute_mutation` — Write data (with confirmation)**

INSERT/UPDATE/DELETE operations that require explicit user approval before execution.

Flow:
1. Claude proposes the mutation with a human-readable description
2. Chat UI renders a preview card with the changes
3. User clicks "Approve" or "Cancel"
4. If approved: statements are executed server-side
5. Result confirmed in chat

Validation before execution:
- Voucher MUST balance (debit = credit = 0)
- All accounts must exist in the chart of accounts
- Date must be within active financial year
- VAT accounts must have correct percentage

**3. `deploy_edge_function` — Create + deploy**

Generates TypeScript edge function code and deploys to tenant's Supabase project via Management API.

Input: function name, code, optional cron schedule.
Flow: Code shown in chat -> user approves -> deployed.

**4. `generate_report` — Formatted reports**

Uses existing SQL functions (`report_balansrapport`, `report_resultatrapport`) to generate formatted accounting reports.

Input: report type, financial year, format (table/pdf).

### Streaming

Responses stream token-by-token via Server-Sent Events using Vercel AI SDK. Tool calls render as expandable cards showing the SQL query and results.

### Implementation

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

export async function POST(req: Request) {
  const { messages, tenantId } = await req.json()

  const systemPrompt = await buildSystemPrompt(tenantId)
  const tools = buildTools(tenantId)

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: systemPrompt,
    messages,
    tools,
    maxSteps: 10
  })

  return result.toDataStreamResponse()
}
```

```typescript
// components/chat/ChatWindow.tsx
import { useChat } from '@ai-sdk/react'

export function ChatWindow({ tenantId }) {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    body: { tenantId }
  })

  return (
    // render messages with tool call cards
  )
}
```

---

## 7. Billing & Credits

### Pricing

| Plan | Price | Credits/mo | Includes |
|------|-------|------------|----------|
| **Starter** | 0 kr | 20 | 1 company, SIE4 import, basic chat |
| **Pro** | 499 kr/mo | 200 | Unlimited companies, edge functions, Fortnox sync |
| **Business** | 1,499 kr/mo | 1,000 | Everything in Pro + priority support, bulk import |
| **Extra credits** | 29 kr / 10 | — | Buy more when they run out |

### Credit Economics

```
1 credit ~ 1 medium-complexity chat turn (2-3 tool calls)

Actual cost behind the scenes:
  Claude Sonnet input:  $3/M tokens
  Claude Sonnet output: $15/M tokens
  Average per turn: ~2K in + 1K out = $0.021 ~ 0.22 kr

  Sell price: ~2.50 kr/credit (Pro) -> ~11x margin
```

### Credit Consumption

| Action | Credits |
|--------|---------|
| Simple question (1-2 tool calls) | ~0.5 |
| Report generation | ~1 |
| Edge function (generate + deploy) | ~2 |
| Complex analysis (5+ tool calls) | ~3 |

### Control Plane Schema

```sql
CREATE TABLE credit_balances (
  customer_id uuid PRIMARY KEY REFERENCES customers(id),
  credits_remaining integer NOT NULL DEFAULT 0,
  credits_used_total integer NOT NULL DEFAULT 0,
  plan text NOT NULL DEFAULT 'starter',
  plan_credits_monthly integer NOT NULL DEFAULT 20,
  next_reset_at timestamptz NOT NULL
);

CREATE TABLE credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  amount integer NOT NULL,           -- negative = consumption, positive = refill
  reason text NOT NULL,              -- 'chat_turn', 'monthly_reset', 'purchase'
  chat_message_id uuid,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz DEFAULT now()
);
```

### Credit Flow

```
Every API call to Claude:
  1. Check credits_remaining > 0 -> if not, show "Buy more credits"
  2. Stream the response
  3. After completion: calculate actual token usage
  4. Deduct credits: ceil(total_cost / cost_per_credit)
  5. Update credit_balances
  6. Show in UI: "187 credits remaining"
```

### Payment

Stripe Checkout for:
- Plan upgrades (Starter -> Pro -> Business)
- Extra credit packs (10/50/200 credits)
- Stripe webhooks -> update control plane DB

Stripe is v2 — test client runs free first.

---

## 8. Project Structure

```
keyholder-platform/
+-- app/                          # Next.js 15 (App Router)
|   +-- (marketing)/
|   |   +-- page.tsx              # Landing page
|   |   +-- pricing/page.tsx      # Pricing info
|   +-- (auth)/
|   |   +-- login/page.tsx
|   |   +-- signup/page.tsx
|   +-- (onboarding)/
|   |   +-- setup/page.tsx        # Wizard: SIE4 upload or pick chart
|   +-- (dashboard)/
|   |   +-- layout.tsx            # Sidebar: chat, settings, billing
|   |   +-- chat/page.tsx         # Claude chat (primary UI)
|   |   +-- settings/page.tsx     # Company info, Fortnox connection
|   |   +-- billing/page.tsx      # Credits, plan, buy more
|   |   +-- edge-functions/page.tsx  # List/manage deployed EFs
|   +-- api/
|       +-- chat/route.ts         # Claude proxy + tool execution + streaming
|       +-- provision/route.ts    # Create tenant Supabase project
|       +-- import/route.ts       # SIE4 upload + parse + import
|       +-- edge-functions/route.ts  # Deploy EF to tenant
|       +-- billing/webhook/route.ts # Stripe webhooks
|       +-- auth/callback/route.ts   # Supabase Auth callback
+-- components/
|   +-- chat/
|   |   +-- ChatWindow.tsx        # Message list with streaming
|   |   +-- ChatInput.tsx         # Prompt input + credit display
|   |   +-- MessageBubble.tsx     # Renders text, tables, code blocks
|   |   +-- ToolCallCard.tsx      # Expandable card for SQL/EF calls
|   |   +-- MutationConfirm.tsx   # "Approve booking" dialog
|   +-- onboarding/
|   |   +-- SieUpload.tsx         # Drag-drop + progress
|   |   +-- KontoplanPicker.tsx   # Pick BAS variant
|   +-- ui/                       # shadcn/ui components
+-- lib/
|   +-- claude/
|   |   +-- system-prompt.ts      # Build dynamic system prompt per tenant
|   |   +-- tools.ts              # Tool definitions (execute_sql, etc.)
|   |   +-- credit-calculator.ts  # Token -> credit calculation
|   +-- supabase/
|   |   +-- control-plane.ts      # KEYHOLDER's own Supabase client
|   |   +-- tenant-client.ts      # Creates client for specific tenant
|   |   +-- provisioner.ts        # Management API: create project, deploy schema
|   +-- stripe/
|       +-- client.ts             # Stripe checkout + webhook handlers
+-- packages/
|   +-- sie-parser/               # Existing parser (moved from src/)
|   |   +-- sie4-parser.ts
|   |   +-- sie4-importer.ts
|   |   +-- types.ts
|   |   +-- tests/
|   +-- tenant-template/
|       +-- migrations/           # 14 tables + report functions
|       +-- edge-functions/       # Standard EFs deployed to each tenant
|       |   +-- sie-import/
|       |   +-- report-generator/
|       |   +-- validation/
|       +-- seed/
|           +-- bas-2026-standard.json
|           +-- bas-2026-k1.json
|           +-- bas-2026-k2.json
|           +-- bas-2026-k3.json
+-- supabase/
|   +-- migrations/               # Control plane schema
|       +-- 001_customers.sql
|       +-- 002_customer_projects.sql
|       +-- 003_credit_system.sql
|       +-- 004_fortnox_connections.sql
|       +-- 005_sync_jobs.sql
+-- .env.local
+-- next.config.ts
+-- package.json
+-- tsconfig.json
+-- vitest.config.ts
```

### Tech Stack

| What | Choice | Why |
|------|--------|-----|
| Framework | Next.js 15 (App Router) | Server Components, API routes, Vercel deploy |
| Styling | Tailwind CSS 4 + shadcn/ui | Fast, consistent, same as Lovable |
| State | TanStack Query v5 | Caching, mutations, optimistic updates |
| Auth | Supabase Auth (control plane) | Already familiar, zero config |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) | Streaming, tool use, direct integration |
| Streaming | Vercel AI SDK (`ai`) | `useChat` hook, SSE, tool call rendering |
| Payments | Stripe | Checkout, subscriptions, webhooks |
| Control Plane DB | Supabase (hosted) | Users, credits, tenant metadata |
| Tenant DB | Supabase (1 per customer, via Management API) | Full isolation |
| Hosting | Vercel | Free tier, instant deploys |
| Parser | Existing `sie4-parser.ts` | 104 tests, proven |

---

## 9. Security & Guardrails

### SQL Injection Protection

Claude generates SQL that runs against customer databases. Strict guardrails:

1. `execute_sql` only allows SELECT statements
2. Blocked keywords: DROP, DELETE, TRUNCATE, ALTER, CREATE, INSERT, UPDATE, GRANT, REVOKE
3. Executed via read-only Supabase RPC function
4. 10 second timeout
5. Max 1000 rows returned

### Mutation Protection

All write operations require explicit user approval:

1. Claude proposes the mutation with human-readable description
2. Chat UI renders preview card showing all changes
3. User clicks "Approve" or "Cancel"
4. Validation before execution:
   - Voucher MUST balance (debit = credit = 0)
   - All accounts must exist in chart of accounts
   - Date must be within active financial year
   - VAT accounts must have correct percentage
5. If approved: statements executed server-side

### Edge Function Protection

1. Code shown in chat before deploy — user must approve
2. Runs in Deno isolate (Supabase standard sandboxing)
3. No access to other tenants
4. Version history — every deploy saved, can rollback via chat

### Tenant Isolation

Guaranteed by:
- Separate Supabase projects (physical isolation)
- API routes authenticate + map to correct tenant
- Claude system prompt built per tenant
- Tool calls execute against tenant-specific service key

A tenant can NEVER access another tenant's data, metadata, or credits.

### Rate Limiting

| Resource | Limit |
|----------|-------|
| Chat messages | 30/min per user |
| SQL queries (via tool) | 60/min per tenant |
| Edge function deploys | 10/day per tenant |
| SIE4 imports | 5/day per tenant |

---

## 10. Control Plane Database Schema

```sql
-- KEYHOLDER users (control plane auth)
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE NOT NULL,  -- Supabase Auth user ID
  email text UNIQUE NOT NULL,
  company_name text,
  org_number text,
  plan text NOT NULL DEFAULT 'starter',
  created_at timestamptz DEFAULT now()
);

-- Customer Supabase projects (one per customer)
CREATE TABLE customer_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  supabase_project_id text NOT NULL,
  supabase_url text NOT NULL,
  supabase_anon_key text NOT NULL,
  supabase_service_key_encrypted text NOT NULL,
  status text DEFAULT 'provisioning',  -- provisioning, active, suspended
  region text DEFAULT 'eu-central-1',
  created_at timestamptz DEFAULT now()
);

-- Credit system
CREATE TABLE credit_balances (
  customer_id uuid PRIMARY KEY REFERENCES customers(id),
  credits_remaining integer NOT NULL DEFAULT 0,
  credits_used_total integer NOT NULL DEFAULT 0,
  plan_credits_monthly integer NOT NULL DEFAULT 20,
  next_reset_at timestamptz NOT NULL
);

CREATE TABLE credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  amount integer NOT NULL,
  reason text NOT NULL,
  chat_message_id uuid,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz DEFAULT now()
);

-- Fortnox OAuth connections (v2)
CREATE TABLE fortnox_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  client_id text NOT NULL,
  last_sync_at timestamptz,
  status text DEFAULT 'connected'
);

-- Sync/provisioning job tracking
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  job_type text NOT NULL,        -- sie_import, provision, daily_sync
  status text DEFAULT 'pending', -- pending, running, completed, failed
  progress_pct integer DEFAULT 0,
  progress_message text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Chat history (for context persistence)
CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  role text NOT NULL,            -- user, assistant, system
  content text NOT NULL,
  tool_calls jsonb,              -- tool call details if any
  tokens_in integer,
  tokens_out integer,
  credits_used numeric(6,2),
  created_at timestamptz DEFAULT now()
);
```

---

## 11. Known Limitations (MVP)

1. **No undo for bookings** — Claude can book a credit voucher to "undo", but no magic undo button
2. **Edge functions only editable via chat** — or via Supabase dashboard directly
3. **No SIE4 export yet** — import only
4. **Fortnox sync is v2** — MVP is SIE4 import + manual booking via chat
5. **Max 1 company per account on Starter** — Pro for more
6. **No frontend generation yet (Level C)** — MVP is Level B (SQL + reports + edge functions)
7. **Provisioning takes ~60s** — Supabase project creation is not instant
8. **Supabase Management API rate limit** — 120 req/min global, limits parallel onboarding

---

## 12. Future Roadmap

| Phase | What | When |
|-------|------|------|
| **MVP (Level B)** | Chat + SQL + reports + edge functions + provisioning + onboarding | Now |
| **v2** | Fortnox OAuth + daily sync + Stripe billing + MCP connection guides | Weeks 2-3 |
| **Level C** | Full Lovable: Claude generates React components, custom dashboards, live preview | Month 2 |
| **v3** | Pre-built AI agent library, workflow templates, Tink bank integration | Month 3 |
| **v4** | Full standalone accounting system (replace Fortnox), Skatteverket API, marketplace | Month 4+ |
