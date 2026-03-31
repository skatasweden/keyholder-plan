# KEYHOLDER Platform — Full Implementation Prompt

> **Copy-paste this entire prompt into a fresh Claude Code session** at `/Volumes/23 nov /Project/KEYHOLDER`. It contains everything needed to build the platform from zero context.

---

## YOUR MISSION

Build **KEYHOLDER**, an AI-native accounting platform for Swedish businesses. Think "Lovable.dev but for accounting" — users chat with Claude to explore their accounting data, generate reports, create validation rules, deploy edge functions, and build custom financial dashboard pages. Each customer gets their own dedicated Supabase database.

You are working in an existing git repo at `/Volumes/23 nov /Project/KEYHOLDER`. There is existing code here (a SIE4 parser, React frontend, Hono server) — you will **reuse the SIE4 parser** but build the platform as a **new Next.js 15 app** in a `keyholder-platform/` subdirectory.

## EXECUTION STRATEGY

Use **subagent-driven parallel development**. The work is divided into 4 phases with 17 tasks. Many tasks within each phase are independent and can be parallelized.

**Rules:**
- Read the full plan at `docs/superpowers/plans/2026-03-31-keyholder-platform.md` before starting ANY work
- Read the full spec at `docs/superpowers/specs/2026-03-31-keyholder-platform-design.md` for design context
- Dispatch independent tasks as parallel subagents in isolated worktrees when possible
- After each phase, review all work before proceeding to next phase
- Commit frequently — one commit per task minimum
- Run `pnpm dev` to verify after each phase

**Parallelization map:**
```
Phase 1 (Foundation):
  Task 1: Scaffold Next.js 15         ← DO FIRST (sequential, everything depends on this)
  Task 2: Move SIE parser to package  ← Can parallel with Task 3
  Task 3: Create tenant template      ← Can parallel with Task 2
  Task 4: Control plane schema        ← After Task 1
  Task 5: Auth + clients              ← After Task 1 + 4

Phase 2 (Provisioning + Onboarding):
  Task 6: Provisioner service          ← After Phase 1
  Task 7: Dashboard layout             ← Can parallel with Task 6
  Task 8: Onboarding wizard            ← After Task 6 + 7

Phase 3 (Chat):
  Task 9: System prompt builder        ← After Phase 2
  Task 10: Chat tools                  ← Can parallel with Task 9
  Task 11: Credit calculator           ← Can parallel with Task 9 + 10
  Task 12: Chat API route              ← After Task 9 + 10 + 11
  Task 13: Chat UI components          ← Can parallel with Task 12

Phase 4 (Builder):
  Task 14: Custom page renderer        ← After Phase 3
  Task 15: Edge function management    ← Can parallel with Task 14
  Task 16: Settings + billing pages    ← Can parallel with Task 14 + 15
  Task 17: Integration verification    ← After all tasks
```

## WHAT EXISTS ALREADY

### SIE4 Parser (REUSE THIS — do not rewrite)
Located at `/Volumes/23 nov /Project/KEYHOLDER/src/`:
- `sie4-parser.ts` — Parses Swedish SIE4 accounting files (CP437 encoding, all tag types)
- `sie4-importer.ts` — Imports parsed data into Supabase (14 tables, batch upserts)
- `types.ts` — TypeScript interfaces (ParsedSIE4, ImportResult, etc.)
- 104 tests passing, verified against 3 real Fortnox exports to öre precision

### Existing Supabase Migrations (USE AS REFERENCE for tenant template)
Located at `/Volumes/23 nov /Project/KEYHOLDER/supabase/migrations/`:
- 13 migration files defining 14 tables
- Read these to understand the exact schema, column names, types, and constraints
- Consolidate into a single `001_full_schema.sql` for the tenant template

### Test Data
Located at `/Volumes/23 nov /Project/KEYHOLDER/SIE/`:
- Real Fortnox SIE4 exports for 3 companies
- Fortnox PDF reports for verification
- SIE format reference docs

## ARCHITECTURE

```
keyholder-platform/           ← New Next.js 15 app (you build this)
├── app/                      ← App Router
│   ├── page.tsx              ← Landing page
│   ├── (auth)/               ← Login, signup
│   ├── (onboarding)/setup/   ← Wizard: upload SIE4 or pick kontoplan
│   ├── (dashboard)/          ← Post-login (sidebar layout)
│   │   ├── chat/             ← Claude chat (PRIMARY UI)
│   │   ├── edge-functions/   ← List/manage deployed functions
│   │   ├── pages/[slug]/     ← Custom page renderer (sandboxed iframe)
│   │   ├── settings/         ← Company info
│   │   └── billing/          ← Credits, plan
│   └── api/
│       ├── chat/route.ts     ← Claude proxy + tool execution + streaming
│       ├── provision/route.ts ← Create tenant Supabase via Management API
│       ├── import/route.ts   ← SIE4 upload + parse
│       ├── edge-functions/   ← Deploy EF to tenant
│       ├── custom-pages/     ← CRUD custom pages
│       └── jobs/[id]/route.ts ← Poll provisioning progress
├── components/
│   ├── chat/                 ← ChatWindow, ChatInput, MessageBubble, ToolCallCard, MutationConfirm
│   ├── onboarding/           ← SieUpload, KontoplanPicker
│   ├── dashboard/            ← Sidebar, CreditBadge
│   └── ui/                   ← shadcn/ui
├── lib/
│   ├── claude/
│   │   ├── system-prompt.ts  ← Dynamic prompt per tenant (fetches schema, accounts, years)
│   │   ├── tools.ts          ← 5 tool definitions (execute_sql, execute_mutation, generate_report, deploy_edge_function, create_custom_page)
│   │   └── credit-calculator.ts
│   └── supabase/
│       ├── control-plane.ts  ← Browser + server clients for KEYHOLDER's Supabase
│       ├── tenant-client.ts  ← Factory for tenant-specific Supabase client
│       ├── provisioner.ts    ← Supabase Management API wrapper
│       └── middleware.ts     ← Auth session handling
├── packages/
│   ├── sie-parser/           ← Moved from existing src/ (parser + importer + types)
│   └── tenant-template/
│       ├── migrations/001_full_schema.sql  ← All 14 tables + RLS + functions
│       ├── edge-functions/   ← Standard EFs deployed to each tenant
│       └── seed/             ← BAS 2026 kontoplan JSON files
├── supabase/migrations/      ← Control plane schema (customers, credits, jobs, chat)
├── middleware.ts             ← Next.js auth guard
└── .env.local                ← API keys
```

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────┐
│       KEYHOLDER PLATFORM (Next.js 15)           │
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
│  14 accounting tables + custom_pages            │
│  Edge functions (standard + user-created)       │
│  Provisioned via Supabase Management API        │
│  Physical isolation — customers never share DB  │
└─────────────────────────────────────────────────┘
```

## TECH STACK (exact versions matter)

| What | Package | Why |
|------|---------|-----|
| Framework | `next@latest` (15+) | App Router, Server Components, API routes |
| React | `react@latest` (19+) | Latest features |
| Styling | `tailwindcss`, `@tailwindcss/postcss` | Utility-first CSS |
| Components | shadcn/ui (via `pnpm dlx shadcn@latest`) | Pre-built, customizable |
| AI Streaming | `ai@4` | `streamText`, `tool()`, `useChat` |
| Anthropic | `@ai-sdk/anthropic@1` | Claude provider for AI SDK |
| AI React | `@ai-sdk/react` | `useChat` hook |
| Schema | `zod` | Tool parameter validation |
| Supabase | `@supabase/supabase-js`, `@supabase/ssr` | DB client, auth |
| Data fetching | `@tanstack/react-query` | Caching, mutations |
| Icons | `lucide-react` | Icon library |
| Utilities | `clsx`, `tailwind-merge` | `cn()` helper |
| Workspace | pnpm workspaces | Monorepo for packages |

### Vercel AI SDK v4 Patterns (CRITICAL — use these exact patterns)

**Chat API route:**
```typescript
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

export async function POST(req: Request) {
  const { messages, tenantId } = await req.json()
  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: systemPrompt,
    messages,
    tools,          // object of tool() definitions
    maxSteps: 10,   // enables multi-step tool chaining
    onFinish({ usage }) {
      // usage.promptTokens, usage.completionTokens
    },
  })
  return result.toDataStreamResponse()  // v4 method name
}
```

**Chat UI:**
```typescript
'use client'
import { useChat } from '@ai-sdk/react'

const { messages, input, handleInputChange, handleSubmit, status } = useChat({
  api: '/api/chat',
  body: { tenantId },  // sent with every request
  maxSteps: 5,
})
```

**Tool definitions:**
```typescript
import { tool } from 'ai'
import { z } from 'zod'

const myTool = tool({
  description: 'What this tool does',
  parameters: z.object({ query: z.string() }),  // "parameters" in v4 (not "inputSchema")
  execute: async ({ query }) => { return { result: 'data' } },
})
```

**Rendering tool calls in messages:**
```typescript
message.parts?.map(part => {
  if (part.type === 'text') return <span>{part.text}</span>
  if (part.type === 'tool-invocation') {
    const { toolCallId, toolName, state, args, result } = part.toolInvocation
    // state: 'partial-call' | 'call' | 'result'
  }
})
```

### Supabase Management API (CRITICAL — use these exact endpoints)

**Create project:**
```
POST https://api.supabase.com/v1/projects
Authorization: Bearer sbp_TOKEN
Body: { name, organization_slug, db_pass, region_selection: { type: "specific", code: "eu-central-1" }, desired_instance_size: "micro" }
Response: { ref, name, region, status, ... }
```

**Poll health:**
```
GET https://api.supabase.com/v1/projects/{ref}/health
Response: [{ name, status: "COMING_UP" | "ACTIVE_HEALTHY" | "UNHEALTHY" }]
```

**Run SQL:**
```
POST https://api.supabase.com/v1/projects/{ref}/database/query
Body: { query: "CREATE TABLE ..." }
```

**Get API keys:**
```
GET https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true
Response: [{ api_key, name: "anon"|"service_role", type }]
```

**Deploy edge function:**
```
POST https://api.supabase.com/v1/projects/{ref}/functions/deploy?slug=my-func
Content-Type: multipart/form-data
Parts: metadata (JSON), file (source code)
```

## THE 5 CLAUDE TOOLS

These are the tools Claude has access to when chatting with a user. Defined using AI SDK `tool()`:

### 1. `execute_sql` — Read-only queries
- Only SELECT allowed
- Blocked keywords: DROP, DELETE, TRUNCATE, ALTER, CREATE, INSERT, UPDATE, GRANT, REVOKE
- Executes via Supabase RPC `execute_readonly_query` (sandboxed, 1000 row limit)
- Returns `{ rows, count }`

### 2. `execute_mutation` — Write operations (requires approval)
- Does NOT execute immediately — returns proposed SQL for user to approve
- UI shows preview card with "Approve" / "Cancel" buttons
- Validates: vouchers must balance, accounts must exist, dates in fiscal year
- Returns `{ status: 'pending_approval', description, statements }`

### 3. `generate_report` — Formatted reports
- Uses existing SQL functions `report_balansrapport` and `report_resultatrapport`
- Takes report type + financial year index
- Returns formatted report data

### 4. `deploy_edge_function` — Create + deploy to tenant
- Returns code for user approval before deploying
- After approval, deploys via Supabase Management API
- Supports cron schedule

### 5. `create_custom_page` — Build dashboard pages
- Returns React TSX code for user approval
- After approval, stores in tenant DB `custom_pages` table
- Page renders in sandboxed iframe with Tailwind + React + Recharts + Supabase client pre-loaded
- Appears in sidebar under "My Tools"

## CREDIT SYSTEM

- 1 credit ≈ 1 medium chat turn (2-3 tool calls)
- Pricing: Starter (0 kr, 20 credits), Pro (499 kr, 200 credits), Business (1499 kr, 1000 credits)
- Check credits before each API call, deduct after completion
- `calculateCreditsUsed(tokensIn, tokensOut)`: based on actual Anthropic pricing ($3/M input, $15/M output), 1 credit ≈ $0.02, minimum 0.5 credits per turn
- Store in control plane: `credit_balances` + `credit_transactions` tables
- `deduct_credits` RPC function handles atomic update

## ONBOARDING FLOW

Two paths:
1. **Upload SIE4 file** → parse with existing sie4-parser → import into provisioned tenant DB
2. **Pick standard kontoplan** → seed `accounts` table with BAS 2026 JSON (Standard/K1/K2/K3)

Both paths: create Supabase project → deploy schema → seed data → grant 20 credits → redirect to chat.

Progress shown via polling `jobs` table (progress_pct, progress_message).

## CUSTOM PAGES (sandboxed iframe)

When Claude creates a custom page via the `create_custom_page` tool:
1. Code stored in tenant DB `custom_pages` table (slug, title, component_code)
2. Rendered at `/pages/{slug}` via a sandboxed iframe
3. iframe loads: React 19, Tailwind, Recharts, Supabase client (anon key, read-only)
4. Component receives `{ supabase }` prop
5. `sandbox="allow-scripts"` — no access to parent window

## ENV VARIABLES NEEDED (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=         # Control plane Supabase URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Control plane anon key
SUPABASE_SERVICE_ROLE_KEY=        # Control plane service role key
SUPABASE_ACCESS_TOKEN=            # Personal access token for Management API (sbp_...)
SUPABASE_ORG_SLUG=                # Organization slug for project creation
ANTHROPIC_API_KEY=                # Claude API key (sk-ant-...)
```

## IMPORTANT NOTES

- All file paths with spaces must be quoted (volume name is "23 nov " with trailing space)
- All code, comments, docs in English. User-facing UI text in Swedish.
- The platform directory is `keyholder-platform/` inside the existing repo
- Use pnpm (not npm or yarn)
- When consolidating tenant schema, READ the actual existing migrations at `supabase/migrations/` to get exact column names/types
- The SIE parser uses `iconv-lite` for CP437 decoding — add to `serverComponentsExternalPackages` in next.config.ts
- For the BAS kontoplan seed files, extract account lists from the existing SIE4 test files in `SIE/` directory (they contain real Fortnox exports with complete account lists)
- Auth uses `@supabase/ssr` pattern with cookies for Next.js middleware

## GO

1. Read the full plan: `docs/superpowers/plans/2026-03-31-keyholder-platform.md`
2. Read the full spec: `docs/superpowers/specs/2026-03-31-keyholder-platform-design.md`
3. Execute Phase 1 tasks (scaffold first, then parallelize Tasks 2-5)
4. Verify `pnpm dev` works after Phase 1
5. Execute Phase 2, then 3, then 4
6. Run final verification checklist from the plan
7. Commit everything with descriptive messages
