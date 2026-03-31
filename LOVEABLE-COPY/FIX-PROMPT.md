# KEYHOLDER Platform — Fix & Complete Prompt

> **Copy-paste this entire prompt into a fresh Claude Code session** at `/Volumes/23 nov /Project/KEYHOLDER`. You have zero prior context. Read the files listed below, create a plan, then execute all fixes.

---

## YOUR MISSION

The KEYHOLDER platform was built in a previous session. It compiles (`pnpm build` passes) but has **unfinished wiring, missing features, and security issues** that must be fixed before it can work end-to-end. Your job is to read the codebase, understand what exists, fix everything listed below, and verify with a successful build.

## STEP 1: READ THESE FILES FIRST (in this order)

These files give you full context without needing to scan every source file:

```
# 1. Build report — explains EVERYTHING that was built, architecture, tech stack, known issues
LOVEABLE-COPY/BUILD-REPORT.md

# 2. The actual package.json — exact dependency versions (AI SDK v6, NOT v4!)
keyholder-platform/package.json

# 3. Control plane schema — understand the database tables
keyholder-platform/supabase/migrations/001_control_plane.sql

# 4. Tenant schema — the 15 tables deployed to each customer
keyholder-platform/packages/tenant-template/migrations/001_full_schema.sql

# 5. Chat API route — the Claude proxy (uses AI SDK v6 patterns)
keyholder-platform/app/api/chat/route.ts

# 6. Chat tools — the 5 tool definitions
keyholder-platform/lib/claude/tools.ts

# 7. Chat UI — the React chat components
keyholder-platform/components/chat/chat-window.tsx
keyholder-platform/components/chat/message-bubble.tsx

# 8. Provisioner — Supabase Management API wrapper
keyholder-platform/lib/supabase/provisioner.ts
keyholder-platform/app/api/provision/route.ts

# 9. Onboarding — the setup wizard
keyholder-platform/app/(onboarding)/setup/page.tsx

# 10. Dashboard layout + sidebar
keyholder-platform/app/(dashboard)/layout.tsx
keyholder-platform/components/dashboard/sidebar.tsx

# 11. Import route — SIE4 file upload
keyholder-platform/app/api/import/route.ts

# 12. Custom pages API + renderer
keyholder-platform/app/api/custom-pages/route.ts
keyholder-platform/app/(dashboard)/pages/[slug]/page.tsx

# 13. Env file (has API keys)
keyholder-platform/.env.local
```

## STEP 2: CREATE A PLAN

After reading, create an implementation plan. Then execute it task by task.

---

## WHAT MUST BE FIXED

### Fix 1: Service Key Encryption (Security — 4 files)

**Problem:** Tenant Supabase service keys are stored as plaintext in `customer_projects.supabase_service_key_encrypted`. There are 4 `TODO: encrypt` / `TODO: decrypt` comments.

**Files to modify:**
- `keyholder-platform/lib/supabase/provisioner.ts` — no changes needed here, it returns raw keys
- `keyholder-platform/app/api/provision/route.ts` — line 72: encrypt before storing
- `keyholder-platform/app/api/chat/route.ts` — line 43: decrypt before using
- `keyholder-platform/app/api/import/route.ts` — line 58: decrypt before using
- `keyholder-platform/app/api/custom-pages/route.ts` — line 23: decrypt before using

**Solution:** Create `keyholder-platform/lib/crypto.ts` with:
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY env var is required')
  return Buffer.from(key, 'hex') // 32 bytes = 64 hex chars
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:ciphertext (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decrypt(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(':')
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(tag)
  return decipher.update(data) + decipher.final('utf8')
}
```

Then:
- Add `ENCRYPTION_KEY` to `.env.local` (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- In `provision/route.ts`: `import { encrypt } from '@/lib/crypto'` and wrap: `supabase_service_key_encrypted: encrypt(keys.serviceRoleKey)`
- In `chat/route.ts`, `import/route.ts`, `custom-pages/route.ts`: `import { decrypt } from '@/lib/crypto'` and unwrap: `decrypt(project.supabase_service_key_encrypted)`

---

### Fix 2: Chat Message Persistence (Feature gap)

**Problem:** The `chat_messages` table exists in the control plane schema but the chat API route never saves messages. Conversation history is lost on page refresh.

**File to modify:** `keyholder-platform/app/api/chat/route.ts`

**Solution:** In the `onFinish` callback (after credit deduction), save the assistant message:
```typescript
// After credit deduction in onFinish:
await supabase.from('chat_messages').insert({
  customer_id: tenantId,
  role: 'assistant',
  content: text, // the generated text
  tool_calls: steps.flatMap(s => s.toolCalls).length > 0
    ? steps.flatMap(s => s.toolCalls)
    : null,
  tokens_in: totalUsage.inputTokens,
  tokens_out: totalUsage.outputTokens,
  credits_used: creditsUsed,
})
```

Also save the user message BEFORE streaming (at the start of the POST handler):
```typescript
await supabase.from('chat_messages').insert({
  customer_id: tenantId,
  role: 'user',
  content: messages[messages.length - 1]?.content || '',
})
```

Check the `onFinish` callback signature in AI SDK v6 — it provides `{ text, steps, totalUsage, ... }`. Read the current code to see what's available.

---

### Fix 3: Custom Pages in Sidebar (Wiring gap)

**Problem:** `Sidebar` component accepts a `customPages` prop but the dashboard `layout.tsx` never fetches or passes custom pages.

**Files to modify:**
- `keyholder-platform/app/(dashboard)/layout.tsx` — must become a client component or use server-side fetch
- `keyholder-platform/components/dashboard/sidebar.tsx` — already handles the prop correctly

**Solution:** The simplest approach is to make the sidebar fetch its own data. Modify `sidebar.tsx` to use `useQuery` to fetch custom pages:

```typescript
// Inside Sidebar component:
const { data: customPagesData } = useQuery({
  queryKey: ['custom-pages'],
  queryFn: async () => {
    const supabase = createBrowserSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!customer) return []
    const res = await fetch(`/api/custom-pages?customerId=${customer.id}`)
    return res.ok ? res.json() : []
  },
  refetchInterval: 60_000,
})
```

Then use `customPagesData` instead of the `customPages` prop. Remove the prop from the component since it's now self-sufficient.

Also wrap the Sidebar in `QueryProvider` — but it already is, since dashboard `layout.tsx` wraps children in `QueryProvider`. However, `Sidebar` is rendered OUTSIDE the `{children}` in that layout, so it's also inside `QueryProvider`. Verify this by reading the layout.

---

### Fix 4: Kontoplan Seeding After Provisioning (Feature gap)

**Problem:** The onboarding wizard lets users pick a BAS variant (Standard/K1/K2/K3) but after provisioning completes, the selected kontoplan is never seeded into the tenant database.

**Files to modify:**
- `keyholder-platform/app/api/provision/route.ts` — add kontoplan parameter and seeding step
- `keyholder-platform/app/(onboarding)/setup/page.tsx` — already sends the data mode but doesn't send kontoplan choice to provision API

**Solution:**

1. Update the provision API to accept `kontoplan` parameter:
```typescript
const { customerId, companyName, orgNumber, kontoplan } = await req.json()
```

2. After schema deployment and before marking complete, seed the kontoplan:
```typescript
if (kontoplan) {
  const seedPath = join(process.cwd(), `packages/tenant-template/seed/${kontoplan}.json`)
  const seedData = JSON.parse(readFileSync(seedPath, 'utf-8'))
  const tenantClient = createTenantClient(keys.url, keys.serviceRoleKey)

  // Insert accounts
  const accounts = seedData.accounts.map((a: any) => ({
    account_number: a.account_number,
    name: a.name,
    account_type: a.account_type,
  }))

  // Batch insert in chunks of 500
  for (let i = 0; i < accounts.length; i += 500) {
    await tenantClient.from('accounts').insert(accounts.slice(i, i + 500))
  }

  // Seed company info
  await tenantClient.from('company_info').insert({
    company_name: companyName,
    org_number: orgNumber,
    currency: 'SEK',
  })

  // Seed current financial year
  const now = new Date()
  await tenantClient.from('financial_years').insert({
    year_index: 0,
    start_date: `${now.getFullYear()}-01-01`,
    end_date: `${now.getFullYear()}-12-31`,
  })
}
```

3. Update `setup/page.tsx` to pass `kontoplan` in the provision request body:
```typescript
body: JSON.stringify({
  customerId,
  companyName,
  orgNumber,
  kontoplan: dataMode === 'kontoplan' ? selectedKontoplan : undefined,
})
```

The seed JSON files already exist at `packages/tenant-template/seed/bas-2026-*.json` with structure:
```json
{ "name": "BAS 2026 Standard", "accounts": [{ "account_number": 1010, "name": "...", "account_type": "T" }] }
```

---

### Fix 5: Mutation Approval Flow (Design issue)

**Problem:** When the user clicks "Approve" on a mutation (e.g., booking a voucher), the current code sends a new chat message to Claude saying "APPROVED: execute these SQL statements". This wastes credits and Claude might modify the SQL. It should execute directly.

**Files to modify:**
- `keyholder-platform/components/chat/chat-window.tsx` — change approval handler
- `keyholder-platform/app/api/chat/route.ts` or create new `app/api/execute-mutation/route.ts`

**Solution:** Create a new API route `app/api/execute-mutation/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/control-plane'
import { createTenantClient } from '@/lib/supabase/tenant-client'
import { decrypt } from '@/lib/crypto'

export async function POST(req: Request) {
  const { customerId, statements } = await req.json()
  const supabase = createServerSupabase()

  const { data: project } = await supabase
    .from('customer_projects')
    .select('supabase_url, supabase_service_key_encrypted')
    .eq('customer_id', customerId)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'No project found' }, { status: 404 })
  }

  const tenant = createTenantClient(
    project.supabase_url,
    decrypt(project.supabase_service_key_encrypted)
  )

  const results = []
  for (const sql of statements) {
    const { data, error } = await tenant.rpc('execute_readonly_query', { sql })
    // Note: mutations need a different RPC or direct .from() calls
    // For now, use the Management API SQL endpoint:
    results.push({ sql, error: error?.message })
  }

  return NextResponse.json({ results })
}
```

Then update `chat-window.tsx` to call this endpoint instead of sending a new chat message:
```typescript
async function handleApproveMutation(statements: string[]) {
  const res = await fetch('/api/execute-mutation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId: tenantId, statements }),
  })
  const result = await res.json()
  // Optionally show result in chat via sendMessage
  sendMessage({ text: `Mutation executed successfully: ${JSON.stringify(result)}` })
}
```

**Note:** `execute_readonly_query` blocks mutations by design. For mutations, either:
- Create a new RPC `execute_mutation_query` in the tenant schema that allows INSERT/UPDATE/DELETE but validates voucher balance
- Or use the Supabase Management API's SQL endpoint: `POST /v1/projects/{ref}/database/query`

The Management API approach is simpler but requires passing the project ref. Choose the approach that fits.

---

### Fix 6: Supabase Control Plane Setup

**Problem:** The platform needs a real Supabase project as the control plane. Without it, auth doesn't work and nothing functions.

**What to do:**
1. Check if there's already a Supabase project at the URL in `.env.local`
2. If not, the user needs to provide Supabase credentials
3. Apply the control plane migration: run the SQL from `supabase/migrations/001_control_plane.sql`
4. Update `.env.local` with real values:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

**Also needed for provisioning:**
- `SUPABASE_ACCESS_TOKEN` — Personal access token from supabase.com/dashboard/account/tokens
- `SUPABASE_ORG_SLUG` — Organization slug from supabase.com

**This fix may require user input.** Ask the user for their Supabase project details if `.env.local` still has placeholder values.

---

## CRITICAL: AI SDK v6 PATTERNS

The original spec/plan documents reference AI SDK v4 patterns. The actual code uses **AI SDK v6**. DO NOT "fix" code back to v4. Here are the correct v6 patterns:

| v4 (WRONG — do not use) | v6 (CORRECT — what's in the code) |
|---|---|
| `parameters: z.object({...})` | `inputSchema: z.object({...})` |
| `maxSteps: 10` | `stopWhen: stepCountIs(10)` |
| `result.toDataStreamResponse()` | `result.toUIMessageStreamResponse()` |
| `useChat({ api: '/api/chat', body: {...} })` | `useChat({ transport: new DefaultChatTransport({ api: '/api/chat', body: {...} }) })` |
| `onFinish({ usage })` | `onFinish({ totalUsage })` |
| `usage.promptTokens` | `totalUsage.inputTokens` |
| `usage.completionTokens` | `totalUsage.outputTokens` |
| `part.toolInvocation.toolName` | `part.type` is `"tool-{name}"`, props directly on part |
| `sendMessage({ role: 'user', content: '...' })` | `sendMessage({ text: '...' })` |
| `message.content` | `message.parts` (no content property) |

---

## EXECUTION ORDER

1. Read all files listed in Step 1
2. Create plan
3. Fix 1 (crypto) — foundational, other fixes depend on it
4. Fix 6 (Supabase setup) — ask user for credentials if needed
5. Fix 4 (kontoplan seeding) — simple, self-contained
6. Fix 3 (sidebar custom pages) — simple wiring
7. Fix 2 (chat persistence) — needs careful AI SDK v6 callback handling
8. Fix 5 (mutation flow) — needs new API route + schema changes
9. Run `pnpm build` to verify
10. Test with `pnpm dev`

## VERIFICATION

After all fixes:
```bash
cd "/Volumes/23 nov /Project/KEYHOLDER/keyholder-platform"
pnpm build    # Must pass with 0 TypeScript errors
pnpm dev      # Must start without crashes
```

Check that:
- [ ] No `TODO: encrypt` or `TODO: decrypt` comments remain
- [ ] `lib/crypto.ts` exists with encrypt/decrypt
- [ ] `.env.local` has `ENCRYPTION_KEY` set
- [ ] Chat messages are persisted to control plane
- [ ] Sidebar fetches and displays custom pages
- [ ] Kontoplan is seeded when user picks one during onboarding
- [ ] Mutation approval calls direct API, not Claude
- [ ] Build passes
