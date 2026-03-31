# KEYHOLDER Platform — Build Report

> **Purpose:** This document gives a future AI agent full context on what was built, how, and what to watch out for — without needing to read every source file. Use this to validate, improve, or fix the platform.

**Built:** 2026-03-31
**Location:** `/Volumes/23 nov /Project/KEYHOLDER/keyholder-platform/`
**Build status:** `pnpm build` passes with 0 TypeScript errors, 16 routes compiled

---

## 1. What Is KEYHOLDER

An AI-native accounting platform for Swedish businesses. Users chat with Claude to explore their accounting data, generate reports, book vouchers, deploy edge functions, and build custom dashboard pages. Each customer gets their own dedicated Supabase database (physical isolation).

**Analogy:** "Lovable.dev but for accounting" — Lovable provisions a Supabase per user for app building. KEYHOLDER provisions a Supabase per customer for accounting + AI.

---

## 2. Architecture (Three Layers)

```
┌─────────────────────────────────────────────────┐
│       KEYHOLDER PLATFORM (Next.js 16)           │
│  Landing page, Auth, Onboarding, Chat UI,       │
│  Claude Proxy, Provisioning, Billing            │
│  Hosted on: Vercel                              │
├─────────────────────────────────────────────────┤
│       CONTROL PLANE SUPABASE                     │
│  Tables: customers, customer_projects,           │
│  credit_balances, credit_transactions,           │
│  jobs, chat_messages                             │
│  RLS: Users see only their own data             │
├─────────────────────────────────────────────────┤
│       TENANT SUPABASE (one per customer)        │
│  15 accounting tables + custom_pages            │
│  Edge functions (standard + user-created)       │
│  Provisioned via Supabase Management API        │
│  Physical isolation — customers never share DB  │
└─────────────────────────────────────────────────┘
```

---

## 3. Tech Stack (Exact Versions — CRITICAL)

These versions were resolved during the build. The AI SDK versions are especially important because the API changed significantly between v4 and v6.

| Package | Version | Notes |
|---------|---------|-------|
| `next` | `^16.2.1` | App Router. Was originally planned as Next.js 15 but pnpm resolved to 16. |
| `react` / `react-dom` | `^19.2.4` | React 19 |
| `typescript` | `^6.0.2` | TS 6 |
| `ai` | `^6.0.141` | **Vercel AI SDK v6** (NOT v4 as originally planned) |
| `@ai-sdk/anthropic` | `^3.0.64` | Anthropic provider v3 |
| `@ai-sdk/react` | `^3.0.143` | React hooks v3 |
| `zod` | `^3.25.76` | Must be v3, NOT v4 (AI SDK peer dependency) |
| `@supabase/supabase-js` | `^2.101.0` | Supabase client |
| `@supabase/ssr` | `^0.10.0` | SSR cookie handling |
| `@tanstack/react-query` | `^5.95.2` | Data fetching |
| `tailwindcss` | `^4.2.2` | Tailwind v4 |
| `shadcn` | `^4.1.1` | Component library (base-nova style) |

### AI SDK v6 API Patterns (CRITICAL — differs from v4 docs)

The original plan specified AI SDK v4 patterns. During build, `pnpm add ai@latest` resolved to v6 which has **breaking API changes**. Here are the correct v6 patterns used:

#### Server-side (API route):
```typescript
import { streamText, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

const result = streamText({
  model: anthropic('claude-sonnet-4-20250514'),
  system: systemPrompt,
  messages,
  tools,
  stopWhen: stepCountIs(10),      // v6: replaces maxSteps
  onFinish: async ({ totalUsage }) => {
    // v6: "totalUsage" not "usage"
    // v6: "inputTokens" / "outputTokens" not "promptTokens" / "completionTokens"
    totalUsage.inputTokens   // number | undefined
    totalUsage.outputTokens  // number | undefined
  },
})
return result.toUIMessageStreamResponse()  // v6: NOT toDataStreamResponse()
```

#### Tool definitions:
```typescript
import { tool } from 'ai'
import { z } from 'zod'

const myTool = tool({
  description: 'What this tool does',
  inputSchema: z.object({ query: z.string() }),  // v6: "inputSchema" NOT "parameters"
  execute: async ({ query }) => { return { result: 'data' } },
})
```

#### Client-side (React):
```typescript
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

// v6: useChat no longer accepts { api, body } directly
// Must use DefaultChatTransport
const transport = useMemo(() =>
  new DefaultChatTransport({
    api: '/api/chat',
    body: { tenantId },
  }),
  [tenantId]
)

const { messages, sendMessage, status } = useChat({ transport })

// v6: sendMessage({ text: '...' }) NOT sendMessage({ role: 'user', content: '...' })
sendMessage({ text: 'Hello' })
```

#### Message parts rendering:
```typescript
// v6: UIMessage has "parts" array, no "content" property
// v6: Tool parts have type "tool-{toolName}" (e.g., "tool-execute_sql")
// v6: Properties are directly on the part: { state, input, output }
//     NOT nested in part.toolInvocation
//     "input" replaces "args", "output" replaces "result"
//     state values: "input-streaming" | "input-available" | "output-available" | ...

message.parts.map(part => {
  if (part.type === 'text') return <span>{part.text}</span>
  if (part.type.startsWith('tool-')) {
    const toolName = part.type.replace('tool-', '')
    // part.input, part.output, part.state are directly on part
  }
})
```

---

## 4. File Structure

```
keyholder-platform/
├── app/
│   ├── layout.tsx                      # Root layout (Inter font, globals.css)
│   ├── page.tsx                        # Landing page (simple h1 + tagline)
│   ├── globals.css                     # @import 'tailwindcss'
│   ├── (auth)/
│   │   ├── login/page.tsx              # Email+password login form
│   │   ├── signup/page.tsx             # Signup form + email confirmation
│   │   └── auth/callback/route.ts      # Supabase Auth code exchange
│   ├── (onboarding)/
│   │   └── setup/page.tsx              # 2-step wizard: company info → data source
│   ├── (dashboard)/
│   │   ├── layout.tsx                  # Sidebar + main content + QueryProvider
│   │   ├── chat/page.tsx               # Claude chat (loads tenantId, renders ChatWindow)
│   │   ├── billing/page.tsx            # Credit balance, plan info, transaction history
│   │   ├── settings/page.tsx           # Company name + org number edit
│   │   ├── edge-functions/page.tsx     # Lists deployed EFs from Management API
│   │   └── pages/[slug]/page.tsx       # Custom page renderer (sandboxed iframe)
│   └── api/
│       ├── chat/route.ts               # Claude streaming proxy (POST)
│       ├── provision/route.ts          # Create tenant Supabase project (POST)
│       ├── import/route.ts             # SIE4 file upload + parse + import (POST)
│       ├── edge-functions/route.ts     # Deploy EF (POST) + list EFs (GET)
│       ├── custom-pages/route.ts       # Save custom page (POST) + list (GET)
│       └── jobs/[id]/route.ts          # Poll job progress (GET)
├── components/
│   ├── chat/
│   │   ├── chat-window.tsx             # useChat + DefaultChatTransport + message rendering
│   │   ├── chat-input.tsx              # Textarea with Enter-to-send
│   │   ├── message-bubble.tsx          # Renders text parts + tool invocation parts
│   │   ├── tool-call-card.tsx          # Expandable card showing SQL/tool details
│   │   └── mutation-confirm.tsx        # Approve/Cancel card for write operations
│   ├── onboarding/
│   │   ├── sie-upload.tsx              # Drag-drop .se/.si file upload
│   │   └── kontoplan-picker.tsx        # Pick BAS 2026 variant (Standard/K1/K2/K3)
│   ├── dashboard/
│   │   ├── sidebar.tsx                 # Nav links + custom pages section + logout
│   │   └── credit-badge.tsx            # Shows remaining credits (polls every 30s)
│   ├── query-provider.tsx              # TanStack Query client provider
│   └── ui/                             # 14 shadcn/ui components (button, card, etc.)
├── lib/
│   ├── claude/
│   │   ├── system-prompt.ts            # Dynamically builds prompt per tenant
│   │   ├── tools.ts                    # 5 tool definitions using AI SDK v6 format
│   │   └── credit-calculator.ts        # Token count → credit cost conversion
│   ├── supabase/
│   │   ├── control-plane.ts            # Browser client + server client (service role)
│   │   ├── tenant-client.ts            # Factory: createTenantClient(url, serviceKey)
│   │   ├── provisioner.ts              # Supabase Management API wrapper
│   │   └── middleware.ts               # Auth session refresh + route protection
│   └── utils.ts                        # cn() helper (clsx + tailwind-merge)
├── middleware.ts                        # Next.js middleware → calls updateSession()
├── packages/
│   ├── sie-parser/                     # @keyholder/sie-parser workspace package
│   │   ├── src/
│   │   │   ├── index.ts                # Barrel export
│   │   │   ├── sie4-parser.ts          # SIE4 file parser (CP437 encoding)
│   │   │   ├── sie4-importer.ts        # Imports parsed data into Supabase
│   │   │   └── types.ts                # ParsedSIE4, ImportResult, etc.
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── tenant-template/                # @keyholder/tenant-template workspace package
│       ├── migrations/
│       │   └── 001_full_schema.sql     # 15 tables + RLS + report functions + execute_readonly_query
│       ├── edge-functions/
│       │   └── execute-readonly/
│       │       └── index.ts            # Deno EF that calls execute_readonly_query RPC
│       ├── seed/
│       │   ├── bas-2026-standard.json  # 804 accounts (full BAS chart)
│       │   ├── bas-2026-k1.json        # 172 accounts (sole proprietor)
│       │   ├── bas-2026-k2.json        # 341 accounts (small AB)
│       │   └── bas-2026-k3.json        # 657 accounts (larger companies)
│       └── package.json
├── supabase/
│   └── migrations/
│       └── 001_control_plane.sql       # 6 tables + RLS + deduct_credits function
├── .env.local                          # Placeholder API keys
├── .npmrc                              # ignore-workspace-root-check=true
├── components.json                     # shadcn/ui config (base-nova style)
├── middleware.ts                        # Auth guard
├── next.config.ts                      # serverExternalPackages: ['iconv-lite']
├── package.json                        # Root workspace package
├── pnpm-workspace.yaml                 # packages: [".", "packages/*"]
├── postcss.config.mjs                  # @tailwindcss/postcss
└── tsconfig.json                       # Bundler module resolution, jsx: react-jsx
```

---

## 5. Database Schemas

### Control Plane (KEYHOLDER's own Supabase)

File: `supabase/migrations/001_control_plane.sql`

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `customers` | Platform users | `id`, `auth_user_id`, `email`, `company_name`, `org_number`, `plan` |
| `customer_projects` | Tenant Supabase metadata | `customer_id`, `supabase_project_ref`, `supabase_url`, `supabase_anon_key`, `supabase_service_key_encrypted`, `status` |
| `credit_balances` | Credit state per customer | `customer_id`, `credits_remaining`, `credits_used_total`, `plan_credits_monthly`, `next_reset_at` |
| `credit_transactions` | Credit audit log | `customer_id`, `amount`, `reason`, `tokens_in`, `tokens_out` |
| `jobs` | Async job tracking | `customer_id`, `job_type`, `status`, `progress_pct`, `progress_message`, `error_message` |
| `chat_messages` | Chat history persistence | `customer_id`, `role`, `content`, `tool_calls`, `credits_used` |

**RLS:** All tables have RLS enabled. Policies filter by `auth.uid()` → `customers.auth_user_id`.

**Functions:** `deduct_credits(p_customer_id, p_amount, p_reason, p_tokens_in, p_tokens_out, p_chat_message_id)` — atomic credit deduction with transaction logging.

### Tenant Schema (deployed to each customer's Supabase)

File: `packages/tenant-template/migrations/001_full_schema.sql`

15 tables total:
- `company_info` — company metadata (name, org number, address, SNI code, etc.)
- `financial_years` — fiscal year periods
- `accounts` — chart of accounts (BAS standard)
- `sru_codes` — tax reporting codes
- `dimensions` — cost centers, projects
- `objects` — dimension members
- `vouchers` — accounting vouchers (header)
- `voucher_rows` — voucher line items (debit/credit)
- `voucher_row_objects` — multi-dimensional tagging on voucher rows
- `opening_balances` — year-start balances
- `closing_balances` — year-end balances
- `period_results` — income statement by year
- `period_balances` — balance by period
- `period_budgets` — budget by period
- `custom_pages` — user-built dashboard pages (slug, title, component_code, icon)

**Functions:**
- `report_balansrapport(year_index)` — balance sheet report
- `report_resultatrapport(year_index)` — income statement report
- `execute_readonly_query(sql, row_limit)` — sandboxed SELECT execution for Claude tools

---

## 6. The 5 Claude Tools

Defined in `lib/claude/tools.ts` using AI SDK v6 `tool()` with `inputSchema`:

| Tool | Type | What it does |
|------|------|-------------|
| `execute_sql` | Auto-execute | Runs SELECT queries against tenant DB via `execute_readonly_query` RPC. Blocks DROP/DELETE/INSERT/etc. Max 1000 rows. |
| `execute_mutation` | Approval required | Returns proposed SQL for user to review. UI shows Approve/Cancel card. Does NOT execute until approved. |
| `generate_report` | Auto-execute | Calls `report_balansrapport` or `report_resultatrapport` SQL functions. |
| `deploy_edge_function` | Approval required | Returns code for user review. After approval, deploys via Management API. |
| `create_custom_page` | Approval required | Returns React component code. After approval, saves to tenant `custom_pages` table. |

---

## 7. Provisioning Flow

1. User fills company info → picks data source (SIE4 upload or standard kontoplan)
2. Platform creates `customers` row in control plane
3. `POST /api/provision` fires:
   - Creates Supabase project via Management API (`POST /v1/projects`)
   - Polls health endpoint until `ACTIVE_HEALTHY` (~60s)
   - Deploys tenant schema via SQL endpoint (`POST /v1/projects/{ref}/database/query`)
   - Gets API keys (`GET /v1/projects/{ref}/api-keys?reveal=true`)
   - Stores metadata in `customer_projects`
   - Grants 20 initial credits
4. If SIE4 file: after provisioning completes, `POST /api/import` parses file with `@keyholder/sie-parser` and imports data
5. Job progress polled by frontend via `GET /api/jobs/{id}` every 2 seconds
6. On completion → redirect to `/chat`

---

## 8. Custom Pages (Sandboxed Iframe)

When Claude creates a custom page via `create_custom_page` tool:

1. Component code stored in tenant DB `custom_pages` table
2. Rendered at `/pages/{slug}` via sandboxed iframe
3. iframe HTML loads: React 19, Tailwind CDN, Recharts, Supabase client (anon key, read-only)
4. Component rendered via Babel standalone transpilation in-browser
5. `sandbox="allow-scripts"` — no access to parent window

Available in iframe: `React`, `ReactDOM`, `Recharts`, `supabase` (client), `Tailwind CSS`.

---

## 9. Credit System

- 1 credit ≈ $0.02 ≈ 1 medium chat turn
- Pricing: Starter (0 kr, 20 credits), Pro (499 kr/mo, 200 credits), Business (1499 kr/mo, 1000 credits)
- Credits checked BEFORE each Claude API call (returns 402 if none)
- Deducted AFTER completion via `deduct_credits` RPC (atomic)
- Formula: `ceil((inputTokens * $3/M + outputTokens * $15/M) / $0.02)`, minimum 0.5 credits

---

## 10. Auth Flow

- Supabase Auth on control plane (email + password)
- `@supabase/ssr` with cookie-based session management
- Next.js middleware (`middleware.ts`) refreshes session on every request
- Protected routes: `/chat`, `/settings`, `/billing`, `/edge-functions`, `/pages/*`, `/setup`
- Logged-in users redirected away from `/login` and `/signup`
- Auth callback at `/auth/callback` exchanges code for session

---

## 11. Known Issues & TODOs

### Must Fix Before Production

1. **Service key encryption:** `supabase_service_key_encrypted` is currently stored as plaintext. TODO comments exist in `provisioner.ts`, `import/route.ts`, `chat/route.ts`. Must encrypt with a KMS or at minimum `aes-256-gcm`.

2. **Middleware deprecation warning:** Next.js 16 shows `"middleware" file convention is deprecated. Please use "proxy" instead.` — the middleware.ts works but should be migrated to the new proxy pattern.

3. **No Stripe integration:** Billing page displays plan info and credit transactions but has no payment flow. Stripe Checkout + webhooks need to be added.

4. **No rate limiting:** The spec calls for rate limits (30 msg/min, 60 queries/min, etc.) but none are implemented.

5. **Mutation approval flow:** When user clicks "Approve" on a mutation, it currently sends a new chat message asking Claude to execute. Should instead directly execute via the tenant service key without another Claude round-trip.

6. **SIE parser barrel export mismatch:** The original plan listed type exports like `SIECompanyInfo`, `SIEAccount`, etc. — these don't exist as standalone exports from `types.ts`. They're nested in `ParsedSIE4`. The barrel export was corrected to export `ParsedSIE4`, `ImportResult`, `ImportOptions`, `ValidationReport`.

7. **Import route signature:** `importToSupabase(parsed, client)` — result is `result.stats.accounts` not `result.accounts` (fixed during build).

### Should Improve

8. **System prompt size:** The dynamic system prompt fetches ALL accounts and full schema info. For large companies this could be very large. Should truncate or summarize.

9. **Chat message persistence:** The `chat_messages` table exists but messages are NOT being persisted — the chat API route doesn't save messages to the control plane.

10. **Custom pages sidebar:** The `Sidebar` component accepts `customPages` prop but the dashboard layout doesn't fetch them. Custom pages won't appear in the sidebar until this is wired up.

11. **kontoplan seeding:** The onboarding wizard has the UI for picking a kontoplan variant, but the API doesn't actually seed the chosen kontoplan into the tenant DB after provisioning.

12. **Landing page:** Currently just an `<h1>KEYHOLDER</h1>` placeholder. Needs a real marketing page.

13. **Error boundaries:** No React error boundaries anywhere. Client-side errors will show blank screens.

14. **Loading states:** Some pages fetch data on mount without skeleton loaders (settings, billing show a spinner but edge-functions page could be smoother).

15. **Workspace lockfile warning:** Next.js detects multiple lockfiles (root `package-lock.json` + `pnpm-workspace.yaml`) and warns. Should set `turbopack.root` in `next.config.ts` or remove the root lockfile.

---

## 12. How to Verify

```bash
cd "/Volumes/23 nov /Project/KEYHOLDER/keyholder-platform"

# Build (should pass with 0 errors)
pnpm build

# Dev server
pnpm dev

# Expected routes (from build output):
# ○ /                    (static)
# ○ /login, /signup      (static)
# ○ /chat, /billing, /settings, /edge-functions  (static shell, client-rendered)
# ƒ /api/chat, /api/provision, /api/import, etc. (dynamic API routes)
# ƒ /pages/[slug]        (dynamic custom page renderer)
# ƒ /auth/callback       (dynamic auth callback)
```

### To connect to real services:

Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ACCESS_TOKEN=sbp_...
SUPABASE_ORG_SLUG=your-org
ANTHROPIC_API_KEY=sk-ant-...
```

Then apply the control plane migration to your Supabase project:
```sql
-- Run the contents of supabase/migrations/001_control_plane.sql
```

---

## 13. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Next.js monolith (not microservices) | Solo developer, fastest path. Can extract services later if needed. |
| One Supabase per customer (not shared with RLS) | Physical isolation eliminates entire classes of data leaks. Worth the provisioning cost. |
| Chat as primary UI (not dashboard) | Users interact via natural language. Dashboard pages are built by Claude on demand. |
| AI SDK v6 (not v4) | Resolved to latest during install. Required significant API changes from the original plan. |
| Credit-based billing (not per-seat) | Maps directly to API costs. Fair for variable usage patterns. |
| Sandboxed iframe for custom pages (not SSR) | Security isolation. No access to parent window or other tenant data. |
| BAS 2026 seed from real SIE4 exports | Extracted 804 accounts from actual Fortnox exports, not from a theoretical list. |

---

## 14. Spec & Plan Documents

The full spec and plan that drove this implementation:
- **Spec:** `docs/superpowers/specs/2026-03-31-keyholder-platform-design.md`
- **Plan:** `docs/superpowers/plans/2026-03-31-keyholder-platform.md`
- **Execute prompt:** `LOVEABLE-COPY/EXECUTE-PROMPT.md`

Note: These documents reference AI SDK v4 patterns (`parameters`, `maxSteps`, `toDataStreamResponse`, `useChat({ api })`) which are **outdated**. The actual code uses AI SDK v6 patterns as documented in section 3 above.
