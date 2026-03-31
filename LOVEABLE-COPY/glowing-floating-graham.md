# KEYHOLDER Platform — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-03-31-keyholder-platform-design.md`
**Goal:** Build the KEYHOLDER AI-native accounting platform (Next.js 15 monolith) from the approved spec.

## Context

Erik is a solo developer building "Lovable for Accounting" — a platform where Swedish businesses chat with Claude to explore their bookkeeping, generate reports, deploy edge functions, and build custom financial tools. Each customer gets their own dedicated Supabase database.

The existing KEYHOLDER repo has a proven SIE4 parser (104 tests), 13 database migrations (14 tables), a React/Vite frontend (9 views), and a Hono import server. The new platform is a separate Next.js 15 app that reuses the parser as a package and the migrations as a tenant template.

---

## Phase 1: Scaffold & Foundation

**Outcome:** Next.js 15 app running on Vercel with auth, basic routing, and control plane DB.

### Step 1.1 — Create Next.js 15 project
- `npx create-next-app@latest keyholder-platform --typescript --tailwind --app --src-dir=false`
- Install core deps: `@supabase/supabase-js`, `@supabase/ssr`, `ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`, `lucide-react`
- Install shadcn/ui: `npx shadcn@latest init`
- Add shadcn components: button, card, input, dialog, badge, dropdown-menu, separator, avatar, tabs, tooltip
- Configure path aliases (`@/` → root)
- **Files:** `keyholder-platform/package.json`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`

### Step 1.2 — Move SIE4 parser to package
- Create `packages/sie-parser/` with `package.json` (name: `@keyholder/sie-parser`)
- Copy `src/sie4-parser.ts`, `src/sie4-importer.ts`, `src/types.ts`, `src/sie4-validator.ts`
- Copy `src/__tests__/` → `packages/sie-parser/tests/`
- Add `iconv-lite` as dependency
- Configure TypeScript + Vitest for the package
- Update root `tsconfig.json` references
- Verify all 104 tests pass
- **Files:** `packages/sie-parser/*`

### Step 1.3 — Create tenant template package
- Create `packages/tenant-template/`
- Copy existing 13 migrations → `packages/tenant-template/migrations/`
- Add migration 00014: `custom_pages` table (from spec section 11)
- Add migration 00015: `execute_readonly_query` RPC function (sandboxed SELECT)
- Create seed files: `seed/bas-2026-standard.json` (start with standard only, others later)
- **Files:** `packages/tenant-template/*`

### Step 1.4 — Control plane Supabase schema
- Create new Supabase project for control plane (or use existing local)
- Write migrations in `supabase/migrations/` (control plane):
  - `001_customers.sql` — customers table (id, auth_user_id, email, company_name, org_number, plan)
  - `002_customer_projects.sql` — customer_projects (supabase_project_id, url, keys encrypted, status)
  - `003_credit_system.sql` — credit_balances + credit_transactions
  - `004_chat_messages.sql` — chat_messages (role, content, tool_calls, tokens, credits)
  - `005_jobs.sql` — jobs table (provisioning + import tracking)
- Add RLS policies for all tables
- **Files:** `supabase/migrations/001-005*.sql`

### Step 1.5 — Auth flow (Supabase Auth)
- Create `lib/supabase/server.ts` — server-side Supabase client (using `@supabase/ssr`)
- Create `lib/supabase/client.ts` — browser-side Supabase client
- Create `lib/supabase/middleware.ts` — auth middleware for protected routes
- Create `middleware.ts` — Next.js middleware (redirect unauthenticated to /login)
- Build auth pages:
  - `app/(auth)/login/page.tsx` — email + password login
  - `app/(auth)/signup/page.tsx` — registration
  - `app/api/auth/callback/route.ts` — Supabase auth callback
- **Files:** `lib/supabase/*`, `middleware.ts`, `app/(auth)/*`, `app/api/auth/*`

### Step 1.6 — Dashboard shell
- Create `app/(dashboard)/layout.tsx` — sidebar + main content area
- Sidebar: Chat (primary), My Tools (dynamic from custom_pages), Edge Functions, Settings, Billing
- Create placeholder pages:
  - `app/(dashboard)/chat/page.tsx`
  - `app/(dashboard)/settings/page.tsx`
  - `app/(dashboard)/billing/page.tsx`
  - `app/(dashboard)/edge-functions/page.tsx`
  - `app/(dashboard)/pages/[slug]/page.tsx` (custom pages)
- Credit balance display in sidebar footer
- **Files:** `app/(dashboard)/*`, `components/layout/*`

---

## Phase 2: Tenant Provisioning & Onboarding

**Outcome:** User signs up, uploads SIE4 (or picks kontoplan), gets a provisioned Supabase with their data.

### Step 2.1 — Supabase Management API client
- Create `lib/supabase/management-api.ts`
- Functions:
  - `createProject(name, region, dbPassword)` — POST `/v1/projects`
  - `getProjectStatus(projectId)` — GET `/v1/projects/{id}`
  - `waitForProjectReady(projectId)` — poll until status = ACTIVE_HEALTHY
  - `runSQL(projectId, sql)` — POST `/v1/projects/{id}/database/query`
  - `getProjectKeys(projectId)` — GET `/v1/projects/{id}/api-keys`
  - `deployEdgeFunction(projectId, name, code)` — POST `/v1/projects/{id}/functions`
- Auth: Bearer token from `SUPABASE_ACCESS_TOKEN` env var
- Base URL: `https://api.supabase.com`
- **Files:** `lib/supabase/management-api.ts`

### Step 2.2 — Provisioner service
- Create `lib/supabase/provisioner.ts`
- `provisionTenant(customerId, options)`:
  1. Create Supabase project
  2. Wait for ready (~60s)
  3. Run all tenant template migrations via `runSQL()`
  4. Get project API keys
  5. Store in `customer_projects` table (encrypt service key)
  6. If SIE4: parse + import via `@keyholder/sie-parser`
  7. If kontoplan: seed from JSON
  8. Create `company_info` + `financial_years`
  9. Update job status throughout
- Encryption: use `lib/crypto.ts` with AES-256-GCM for service keys
- **Files:** `lib/supabase/provisioner.ts`, `lib/crypto.ts`

### Step 2.3 — Onboarding wizard
- Create `app/(onboarding)/setup/page.tsx` — multi-step wizard
- Step 1: Company name + org number
- Step 2: Choose path: Upload SIE4 or pick kontoplan
- Step 3a: SIE4 drag-drop upload (reuse DropZone pattern from existing app)
- Step 3b: Pick BAS variant (Standard, K1, K2, K3)
- Step 4: Progress screen — polls `jobs` table for status updates
- Step 5: "All done!" → redirect to /chat
- **Files:** `app/(onboarding)/*`, `components/onboarding/*`

### Step 2.4 — Provisioning API routes
- `app/api/provision/route.ts` — POST: trigger provisioning, create job
- `app/api/provision/status/route.ts` — GET: poll job status
- `app/api/import/route.ts` — POST: accept SIE4 file, parse, import to tenant DB
- **Files:** `app/api/provision/*`, `app/api/import/*`

### Step 2.5 — Tenant client factory
- Create `lib/supabase/tenant-client.ts`
- `getTenantClient(customerId)`:
  1. Look up `customer_projects` for this customer
  2. Decrypt service key
  3. Create Supabase client with service key
  4. Return typed client
- Cache clients in memory (Map) for duration of request
- **Files:** `lib/supabase/tenant-client.ts`

---

## Phase 3: Claude Chat & Credits

**Outcome:** User can chat with their accounting data. Claude can query, generate reports, propose bookings, and deploy edge functions.

### Step 3.1 — System prompt builder
- Create `lib/claude/system-prompt.ts`
- `buildSystemPrompt(tenantClient, companyInfo)`:
  1. Fetch schema info from tenant DB (tables, columns)
  2. Fetch active accounts (number + name)
  3. Fetch current financial year
  4. Compose prompt from spec section 6
- Cache schema per tenant (5 min TTL)
- **Files:** `lib/claude/system-prompt.ts`

### Step 3.2 — Tool definitions
- Create `lib/claude/tools.ts`
- Define 4 tools using Vercel AI SDK `tool()` format:
  - `execute_sql` — SELECT only, keyword blocklist, 10s timeout, 1000 row limit
  - `execute_mutation` — returns proposed SQL for user confirmation (does NOT auto-execute)
  - `deploy_edge_function` — returns code for user preview (does NOT auto-deploy)
  - `generate_report` — calls existing `report_balansrapport`/`report_resultatrapport` RPCs
- Each tool's `execute` function takes tenant client as context
- **Files:** `lib/claude/tools.ts`

### Step 3.3 — Chat API route
- Create `app/api/chat/route.ts`
- POST handler:
  1. Authenticate user (middleware)
  2. Look up tenant project
  3. Check credits > 0
  4. Build system prompt
  5. Call `streamText()` with Anthropic provider, tools, maxSteps: 10
  6. After stream completes: calculate token usage, deduct credits
  7. Save chat message to control plane
  8. Return `result.toDataStreamResponse()`
- Model: `claude-sonnet-4-20250514` (cost-effective for chat)
- **Files:** `app/api/chat/route.ts`

### Step 3.4 — Chat UI
- Create `components/chat/ChatWindow.tsx` — uses `useChat()` from `@ai-sdk/react`
- Create `components/chat/ChatInput.tsx` — prompt input + credit display + send button
- Create `components/chat/MessageBubble.tsx` — renders markdown, tables, code blocks
- Create `components/chat/ToolCallCard.tsx` — expandable card showing SQL query + results
- Create `components/chat/MutationConfirm.tsx` — approval dialog for bookings
- Wire up in `app/(dashboard)/chat/page.tsx`
- **Files:** `components/chat/*`, `app/(dashboard)/chat/page.tsx`

### Step 3.5 — Credit system
- Create `lib/claude/credit-calculator.ts`
- `calculateCredits(tokensIn, tokensOut)` — maps token usage to credit cost
- Create `app/api/credits/route.ts` — GET: return current balance
- Credit deduction happens in chat API route after stream completes
- Monthly reset: Supabase cron job (or edge function) resets credits on `next_reset_at`
- **Files:** `lib/claude/credit-calculator.ts`, `app/api/credits/*`

### Step 3.6 — Mutation confirmation flow
- When Claude calls `execute_mutation`, the tool returns a pending state (not executed)
- Chat UI renders `MutationConfirm` component with preview of changes
- User clicks "Approve" → client sends POST to `/api/chat/confirm-mutation`
- Server executes the SQL statements against tenant DB
- Result sent back to chat as follow-up message
- **Files:** `app/api/chat/confirm-mutation/route.ts`, `components/chat/MutationConfirm.tsx`

---

## Phase 4: Custom Pages & Edge Functions

**Outcome:** Users can ask Claude to build custom financial tool pages that appear in their sidebar.

### Step 4.1 — Custom page renderer
- Create `app/(dashboard)/pages/[slug]/page.tsx`
- Fetch `component_code` from tenant's `custom_pages` table
- Bundle TSX on-the-fly using Sucrase (lightweight, fast transpilation)
- Render in sandboxed iframe with pre-loaded libs (React, Recharts, shadcn, Supabase)
- Pass props: `{ supabase (read-only), companyInfo, financialYear }`
- **Files:** `app/(dashboard)/pages/[slug]/page.tsx`, `lib/custom-pages/renderer.ts`

### Step 4.2 — Custom page Claude tool
- Add `create_custom_page` tool to `lib/claude/tools.ts`
- Claude generates: title, slug, description, icon, component_code (TSX)
- Tool returns preview for user approval (like mutations)
- On approve: INSERT into tenant's `custom_pages` table
- Sidebar refreshes to show new page
- **Files:** `lib/claude/tools.ts` (extend), `components/chat/PagePreview.tsx`

### Step 4.3 — Edge function management
- Create `app/(dashboard)/edge-functions/page.tsx` — list deployed EFs with status
- Edge function deploy tool already in Step 3.2
- Add ability to view logs, disable, delete via UI
- **Files:** `app/(dashboard)/edge-functions/*`

### Step 4.4 — Dynamic sidebar
- Update `app/(dashboard)/layout.tsx` sidebar to:
  1. Fetch `custom_pages` from tenant DB
  2. Render under "My Tools" section with icon + title
  3. Fetch deployed edge functions
  4. Render under "Edge Functions" section
- **Files:** `app/(dashboard)/layout.tsx`

---

## Phase 5: Marketing & Polish

**Outcome:** Landing page, pricing page, final polish for test client demo.

### Step 5.1 — Landing page
- `app/(marketing)/page.tsx` — hero, features, CTA
- `app/(marketing)/pricing/page.tsx` — plan comparison table
- **Files:** `app/(marketing)/*`

### Step 5.2 — Settings page
- Company info display/edit
- API keys view (read-only)
- Connected Fortnox status (placeholder for v2)
- **Files:** `app/(dashboard)/settings/page.tsx`

### Step 5.3 — Billing page (stub)
- Current plan display
- Credit balance + usage history
- "Upgrade" button (placeholder — Stripe in v2)
- **Files:** `app/(dashboard)/billing/page.tsx`

---

## Implementation Order & Dependencies

```
Phase 1 (Foundation):     1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6
                               ↓ (1.2 + 1.3 can parallel)
Phase 2 (Provisioning):   2.1 → 2.2 → 2.3 → 2.4 → 2.5
                               (depends on 1.3, 1.4)
Phase 3 (Chat):           3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6
                               (depends on 2.5)
Phase 4 (Custom Pages):   4.1 → 4.2 → 4.3 → 4.4
                               (depends on 3.2)
Phase 5 (Polish):         5.1, 5.2, 5.3 (independent, can parallel)
```

---

## Key Files from Existing Code to Reuse

| File | What | Reuse How |
|------|------|-----------|
| `src/sie4-parser.ts` | SIE4 parsing (CP437, CRC-32) | Copy to `packages/sie-parser/` |
| `src/sie4-importer.ts` | Batched upsert to Supabase | Copy to `packages/sie-parser/` |
| `src/types.ts` | ParsedSIE4, ImportResult types | Copy to `packages/sie-parser/` |
| `src/sie4-validator.ts` | Post-import validation | Copy to `packages/sie-parser/` |
| `supabase/migrations/00001-00013*.sql` | 14 tenant tables + report functions | Copy to `packages/tenant-template/migrations/` |
| `app/src/lib/format.ts` | `formatSEK()`, `formatDate()` | Reference for new format utils |
| `app/src/lib/account-groups.ts` | BAS account ranges | Reference for report tools |
| `app/src/components/ui/DropZone.tsx` | Drag-drop file upload | Reference for onboarding |

---

## Environment Variables

```env
# Control Plane Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Supabase Management API (for tenant provisioning)
SUPABASE_ACCESS_TOKEN=

# Anthropic
ANTHROPIC_API_KEY=

# Encryption (for tenant service keys)
ENCRYPTION_KEY=

# Stripe (v2 — not needed for MVP)
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=
```

---

## Verification

### After Phase 1:
- `npm run dev` starts Next.js on localhost:3000
- Can sign up, log in, see dashboard shell
- Control plane tables exist with RLS
- SIE4 parser tests pass: `cd packages/sie-parser && npm test`

### After Phase 2:
- New user can sign up → onboarding wizard → upload SIE4 or pick kontoplan
- Supabase project created via Management API
- Tenant schema deployed (14 tables + report functions)
- Data imported/seeded correctly
- User redirected to chat

### After Phase 3:
- User can type in chat → Claude responds with accounting context
- Claude can run SELECT queries → results shown in expandable cards
- Claude can propose bookings → user sees approval dialog
- Credits deducted after each chat turn
- "Credits remaining" shown in UI

### After Phase 4:
- User can say "Build me a cash flow forecast page" → Claude generates TSX
- User approves → page appears in sidebar under "My Tools"
- Custom page renders in sandboxed iframe with live data
- User can edit/delete pages via chat

### After Phase 5:
- Landing page at `/` with CTA to signup
- Pricing page shows Starter/Pro/Business plans
- Settings shows company info
- Billing shows credit balance
