# Multi-Tenant Supabase Platform Research

Research date: 2026-03-31

This document covers the technical feasibility and architecture for building a multi-tenant
platform where each customer gets their own Supabase project, similar to how Lovable.dev and
Bolt.new operate.

---

## Table of Contents

1. [Supabase Management API](#1-supabase-management-api)
2. [Self-Hosting and Programmatic Provisioning](#2-self-hosting-and-programmatic-provisioning)
3. [Supabase Branching](#3-supabase-branching)
4. [Per-Tenant Edge Functions](#4-per-tenant-edge-functions)
5. [Supabase MCP Server](#5-supabase-mcp-server)
6. [Cost Structure](#6-cost-structure)
7. [Organizations API](#7-organizations-api)
8. [Database Isolation: Shared RLS vs Separate Projects](#8-database-isolation-shared-rls-vs-separate-projects)
9. [CLI Automation](#9-cli-automation)
10. [Architecture Recommendation for KEYHOLDER](#10-architecture-recommendation-for-keyholder)

---

## 1. Supabase Management API

Supabase provides a full REST Management API for programmatically creating and managing projects.
This is the same API that Lovable.dev and Bolt.new use to create millions of projects for their
users.

### Base URL

```
https://api.supabase.com/v1/
```

### Authentication Methods

**Personal Access Tokens (PAT)**
- Long-lived tokens generated in the Supabase Dashboard under Account > Access Tokens
- Used in the `Authorization: Bearer <token>` header
- Best for: automation scripts, CI/CD, internal tooling

**OAuth 2.0**
- Generates short-lived tokens on behalf of a Supabase user
- Best for: third-party apps that manage projects on behalf of users
- Authorization endpoint: `https://api.supabase.com/v1/oauth/authorize`
- Token endpoint: `https://api.supabase.com/v1/oauth/token`
- Supports PKCE flow (recommended)
- Requires registering an OAuth app in your organization settings

### Key Endpoints

#### Project Lifecycle
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/projects` | POST | Create a new project |
| `/v1/projects` | GET | List all projects |
| `/v1/projects/{ref}` | GET | Get project details |
| `/v1/projects/{ref}` | DELETE | Delete a project |
| `/v1/projects/{ref}/health` | GET | Check service health status |
| `/v1/projects/available-regions` | GET | Get smart region codes (americas, emea, apac) |

#### Configuration
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/projects/{ref}/api-keys` | GET | Fetch API keys |
| `/v1/projects/{ref}/api-keys` | POST | Create publishable/secret keys |
| `/v1/projects/{ref}/config/auth` | PATCH | Configure Auth settings |
| `/v1/projects/{ref}/postgrest` | PATCH | Configure PostgREST/Data API |
| `/v1/projects/{ref}/config/storage` | PATCH | Configure Storage |
| `/v1/projects/{ref}/config/realtime` | PATCH | Configure Realtime |

#### Database Operations
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/projects/{ref}/database/migrations` | POST | Run schema migrations (auto-rollback on failure) |
| `/v1/projects/{ref}/database/query` | POST | Run SQL queries (for seeding) |
| `/v1/projects/{ref}/database/backups/restore-point` | POST | Create recovery checkpoint |
| `/v1/projects/{ref}/database/backups/undo` | POST | Revert to restore point |

#### Edge Functions
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/projects/{ref}/functions` | PUT | Deploy edge functions |
| `/v1/projects/{ref}/functions/{slug}` | PATCH | Update a specific function |

#### Compute and Billing
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/projects/{ref}/billing/addons` | PATCH | Modify instance size |

#### Branches
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/projects/{ref}/branches` | POST | Create a branch |

### Example: Create a Project

```bash
curl https://api.supabase.com/v1/projects \
  --request POST \
  --header "Authorization: Bearer YOUR_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "organization_id": "org-slug",
    "name": "tenant-project-123",
    "db_pass": "securepassword123!",
    "region": "eu-central-1"
  }'
```

### Rate Limits

- 120 requests per minute per user (per-user, per-scope model)
- Resource-intensive endpoints may have stricter limits
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Exceeding returns HTTP 429

### Important Notes

- Database passwords cannot be changed programmatically after creation
- Store encrypted passwords; generate unique ones per project
- Poll health endpoint until `ACTIVE_HEALTHY` before configuring services
- Use smart region selection (`americas`, `emea`, `apac`) for capacity
- Pico instances (scale-to-zero) require NOT passing `desired_instance_size`
- Some endpoints (migrations, restore points, pico instances) require partnership approval

### JavaScript SDK

The `supabase-management-js` library simplifies Management API interactions for
JavaScript/TypeScript projects.

---

## 2. Self-Hosting and Programmatic Provisioning

### Docker Self-Hosting

Supabase can be fully self-hosted using Docker Compose. The stack includes 11+ services:

| Service | Purpose |
|---------|---------|
| PostgreSQL | Primary database |
| Kong | API gateway (routes all requests) |
| PostgREST | Auto-generated REST API from Postgres |
| Auth (GoTrue) | JWT-based authentication |
| Realtime | WebSocket server for DB change broadcasts |
| Storage | S3-compatible file storage |
| Supavisor | Connection pooling |
| Edge Runtime | Deno-based serverless functions |
| Studio | Dashboard UI |
| Vector/Logflare | Log aggregation |
| imgproxy | Image processing |

### Minimum Requirements (per instance)

- RAM: 4 GB (8+ GB recommended)
- CPU: 2 cores (4+ recommended)
- Storage: 50 GB SSD (80+ GB recommended)

### Multi-Tenant Self-Hosting Limitations

**Key constraint: One Docker Compose deployment = one database/project.**

To provision multiple tenant instances:
- You need to deploy a separate Docker Compose stack per tenant
- No built-in multi-project management in self-hosted Studio
- Custom orchestration required (Kubernetes, Docker Swarm, or Terraform)
- Each instance needs unique environment variables (JWT secrets, passwords, ports)

### Programmatic Provisioning Approach (Self-Hosted)

1. Template a Docker Compose file with parameterized env vars
2. For each new tenant, generate unique secrets and spin up a new stack
3. Use Kubernetes Helm charts or Docker Swarm for orchestration
4. Implement a control plane service for tenant lifecycle management

### Self-Hosted vs Managed Tradeoffs

| Aspect | Self-Hosted | Managed (Supabase Cloud) |
|--------|-------------|-------------------------|
| Management API | Not available | Full API |
| Multi-project | Custom orchestration | Built-in |
| Scale to zero | Not available | Pico instances |
| Platform Kit UI | Not available | Available |
| Cost | Infrastructure only | Per-project pricing |
| Maintenance | Full responsibility | Managed |
| Compliance | Full control | SOC 2 Type 2 |

### Verdict on Self-Hosting for Multi-Tenant

Self-hosting is viable but significantly more complex for multi-tenant. You lose the
Management API, Platform Kit, pico instances, and branching. Only recommended if you need
full data sovereignty or have specific compliance requirements that prevent cloud hosting.

---

## 3. Supabase Branching

### How It Works

Branching creates isolated Supabase environments linked to Git branches. Each branch gets its
own full Supabase instance with independent:
- Database (Postgres)
- Auth service
- Storage
- Realtime
- Edge Functions
- API credentials

### Branch Types

**Preview Branches (Ephemeral)**
- Auto-created from pull requests (via GitHub integration)
- Auto-pause after inactivity
- Auto-deleted when PR is merged or closed
- Best for: testing, code review

**Persistent Branches**
- Long-lived, not tied to PR lifecycle
- Stay active regardless of inactivity
- Best for: staging, QA, long-running dev environments

### Deployment Process (on merge)

Seven sequential steps: Clone -> Pull -> Health -> Configure -> Migrate -> Seed -> Deploy Edge Functions

### Multi-Tenant Relevance

Branching is designed for development workflows (Git-based), NOT for per-tenant isolation.
However, it could theoretically be used for:
- Testing tenant-specific migrations before applying to all tenants
- Staging environments for new tenant features
- Preview environments for customer demos

### Pricing

- No fixed per-branch fee
- Billed on actual usage: compute hours, disk size, egress, storage
- Usage counts toward your subscription plan quota
- Compute Credits do NOT apply to branching compute
- NOT covered by Spend Cap
- Requires paid plan (Pro or above)

---

## 4. Per-Tenant Edge Functions

### Architecture

Edge Functions run on V8 isolates (Deno runtime):
- Each invocation gets its own V8 isolate with dedicated memory heap and execution thread
- Stateless by design - no persistent state between invocations
- Bundled as ESZip format for fast distribution
- Deployed globally, routed to nearest edge location
- Fast cold starts (milliseconds)

### Deployment Model

Edge Functions are deployed per-project. If each tenant has their own Supabase project:
- Each tenant gets completely independent edge functions
- Deploy different function code per tenant
- Use `supabase functions deploy` with `--project-ref` to target specific projects
- Each function accessible at: `https://[PROJECT_ID].supabase.co/functions/v1/[function-name]`

### Per-Tenant Deployment via Management API

```bash
# Deploy edge function to specific tenant's project
curl -X PUT "https://api.supabase.com/v1/projects/{tenant-ref}/functions" \
  --header "Authorization: Bearer YOUR_TOKEN" \
  --data '...'
```

### Per-Tenant Deployment via CLI

```bash
# Link to tenant's project and deploy
supabase link --project-ref tenant-project-ref
supabase functions deploy my-function
```

### If Using Shared Project (single project, multiple tenants)

- All tenants share the same edge functions
- Tenant routing done in application code (check JWT claims, tenant_id header)
- Cannot deploy different function versions per tenant
- Less isolation, simpler management

### Pricing (Edge Functions)

- Pro plan includes 2 million invocations/month
- Overage: $2 per million additional invocations
- No per-function cost, only invocation-based

---

## 5. Supabase MCP Server

### What Is It

The Model Context Protocol (MCP) server lets AI assistants (Claude, Cursor, Windsurf, VS Code
Copilot) interact with Supabase projects directly. It standardizes how LLMs communicate with
Supabase services.

### Connection Methods

**Cloud (Recommended)**
```
https://mcp.supabase.com/mcp
```
- Uses OAuth 2.1 (no API keys needed)
- Browser-based authentication
- Most stable

**Local (via CLI)**
```
http://localhost:54321/mcp
```
- Works with local Supabase development
- More control, but requires managing API keys

### Available Tools

#### Database Operations
- `list_tables` - List all tables
- `list_extensions` - List installed extensions
- `list_migrations` - List applied migrations
- `apply_migration` - Apply a new migration
- `execute_sql` - Run SQL queries

#### Edge Functions
- `list_edge_functions` - List all functions
- `get_edge_function` - Get function details
- `deploy_edge_function` - Deploy a function

#### Account Management (when not project-scoped)
- `list_projects` / `get_project` / `create_project`
- `pause_project` / `restore_project`
- `list_organizations` / `get_organization`
- `get_cost` / `confirm_cost`

#### Development
- `get_project_url` - Get project URL
- `get_publishable_keys` - Get API keys
- `generate_typescript_types` - Generate types from schema

#### Debugging
- `get_logs` - Retrieve logs (API, Postgres, Edge Functions, Auth, Storage, Realtime)
- `get_advisors` - Security and performance recommendations

#### Branching (experimental, paid plans)
- `create_branch`, `list_branches`, `delete_branch`
- `merge_branch`, `reset_branch`, `rebase_branch`

#### Docs
- `search_docs` - Search official documentation

#### Storage (disabled by default)
- `list_storage_buckets`
- `get_storage_config`, `update_storage_config`

### Configuration for Claude Code

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=${SUPABASE_PROJECT_REF}",
      "headers": {
        "Authorization": "Bearer ${SUPABASE_ACCESS_TOKEN}"
      }
    }
  }
}
```

### URL Parameters

| Parameter | Description |
|-----------|-------------|
| `read_only=true` | Restrict to read-only Postgres user |
| `project_ref=<id>` | Scope to a specific project |
| `features=<groups>` | Enable only specific tool groups (comma-separated) |

### Multi-Tenant Platform Use Case

The MCP server could enable:
- AI-powered tenant onboarding (create project, apply migrations, seed data)
- Automated schema management across tenant projects
- AI-assisted debugging of tenant-specific issues
- Tenant self-service via AI chatbot that interacts with their project

### Security Warning

- Never connect MCP server to production data
- Designed for development/testing only
- Risk of prompt injection from database content
- Always use manual approval for tool execution
- Use project scoping and read-only mode

### AI SDK Integration

The `@supabase/mcp-server-supabase` package exports `createToolSchemas()` for Vercel AI SDK,
providing client-side validation and TypeScript types.

---

## 6. Cost Structure

### Plan Pricing

| Plan | Monthly Base | Projects | Key Limits |
|------|-------------|----------|------------|
| Free | $0 | 2 max | 500 MB DB, 50K MAUs, 1 GB storage |
| Pro | $25/org | Unlimited | 8 GB DB, 100K MAUs, 100 GB storage |
| Team | $599/org | Unlimited | Pro features + team collaboration |
| Enterprise | Custom | Unlimited | Custom limits |

### Compute Instance Pricing (per project, per month)

| Instance | CPU | RAM | Max DB Size | Monthly Cost |
|----------|-----|-----|-------------|-------------|
| Pico | Shared | ~256 MB | - | Scale to zero (pay per use) |
| Nano | Shared | 0.5 GB | 500 MB | Free plan only |
| Micro | 2-core ARM shared | 1 GB | 10 GB | ~$12/month |
| Small | 2-core ARM shared | 2 GB | 50 GB | ~$24/month |
| Medium | 2-core ARM shared | 4 GB | 100 GB | ~$48/month |
| Large | 2-core ARM dedicated | 8 GB | 200 GB | ~$96/month |
| XL | 4-core ARM dedicated | 16 GB | 500 GB | ~$192/month |
| 2XL | 8-core ARM dedicated | 32 GB | 1 TB | ~$384/month |

### Usage-Based Overages (Pro Plan)

| Resource | Included | Overage |
|----------|----------|---------|
| Database Egress | 50 GB | $0.09/GB |
| Auth MAUs | 100,000 | $0.00325/user |
| Storage | 100 GB | $0.021/GB/month |
| Storage Egress | 250 GB | $0.09/GB |
| Edge Function Invocations | 2M | $2/million |
| Realtime Messages | 5M | $2.50/million |

### Multi-Project Cost Scenarios

**Pico instances (scale-to-zero) - BEST FOR PLATFORMS**
- Only available through partnership approval (apply via form)
- Projects scale to zero when idle - you only pay for active compute
- This is what Lovable.dev and Bolt.new use
- Cost depends entirely on actual usage

**Micro instances (standard)**
| Tenants | Base Plan | Compute ($12/project) | Total |
|---------|-----------|----------------------|-------|
| 10 | $25 | $120 | ~$145/month |
| 50 | $25 | $600 | ~$625/month |
| 100 | $25 | $1,200 | ~$1,225/month |
| 500 | $25 | $6,000 | ~$6,025/month |

**Key billing facts:**
- Paid plans include $10/month in Compute Credits (covers one Micro instance)
- Usage quotas are organization-wide, not per-project
- Each additional project adds minimum ~$12/month compute
- Compute Credits do NOT apply to branch compute
- Free plan projects are paused after 7 days of inactivity

### Cost Optimization Strategy

1. Apply for Pico instance access (scale-to-zero) - essential for platforms
2. Use the Pro plan ($25/month org base) with many Pico projects
3. Pause inactive tenant projects programmatically via Management API
4. Monitor usage organization-wide, not per-project

---

## 7. Organizations API

### Creating Organizations

```
POST /v1/organizations
```

Organizations are the billing unit in Supabase. Each organization has:
- Its own subscription plan (Free, Pro, Team, Enterprise)
- Its own payment method and billing cycle
- Independent invoices
- Projects cannot be split across different plans within one org

### CLI Organization Management

```bash
supabase orgs create "My Organization"
```

### Two Platform Architecture Models

**Model A: All tenant projects in YOUR organization**
- You own and pay for all projects
- Full Management API control
- Best for: SaaS platforms where you control the backend
- Billing is centralized to your organization

**Model B: Projects in USER organizations (via OAuth)**
- Users create their own Supabase accounts/orgs
- You use OAuth to get tokens to manage their projects
- Best for: platforms where users own their infrastructure
- Users handle their own billing
- Requires the OAuth claim/transfer flow

**Model A is more common** and is what the "Supabase for Platforms" guide recommends.

---

## 8. Database Isolation: Shared RLS vs Separate Projects

### Option 1: Shared Database with RLS (tenant_id column)

**How it works:**
- Single Supabase project/database for all tenants
- Every table has a `tenant_id` column
- RLS policies enforce data isolation: `tenant_id = auth.jwt()->>'tenant_id'`
- Tenant ID stored in user's `app_metadata` for easy RLS access

**Advantages:**
- Lowest cost (one project)
- Simplest deployment and maintenance
- Single set of migrations
- Single set of edge functions
- Easy cross-tenant analytics/reporting
- Personal-to-team transitions are simple metadata changes

**Disadvantages:**
- RLS policy bug = potential full data leak across ALL tenants
- RLS policies evaluated on every operation (performance overhead)
- Complex RLS policies with joins can slow queries significantly
- No compute isolation (noisy neighbor problem)
- Harder to comply with data residency requirements
- Cannot offer tenant-specific customizations
- Single point of failure

**Best for:** SaaS with many small tenants, low compliance requirements, uniform feature set.

### Option 2: Separate Schema Per Tenant (same project)

**How it works:**
- Single Supabase project
- Each tenant gets a dedicated PostgreSQL schema
- Application routes to correct schema based on tenant context

**Advantages:**
- Better logical isolation than RLS
- Simplified backup/restore per tenant
- Clear compliance audit trails
- Better Realtime performance (scoped to schema)
- Reduced RLS performance overhead

**Disadvantages:**
- PostgREST and Realtime primarily designed for `public` schema
- Schema migrations must be applied N times (once per schema)
- Not well-supported by Supabase tooling
- More complex application layer

**Best for:** Medium tenants with compliance needs but cost sensitivity.

### Option 3: Separate Project Per Tenant

**How it works:**
- Each tenant gets their own Supabase project (database + auth + storage + functions)
- Complete physical isolation
- Managed via Management API

**Advantages:**
- Complete data isolation (impossible to leak across tenants)
- Independent compute resources (no noisy neighbor)
- Per-tenant customization (different schema, functions, auth config)
- Individual backup/restore
- Easy data residency compliance (different regions per tenant)
- Per-tenant billing is straightforward
- Tenant-specific debugging and monitoring
- Can scale individual tenants independently

**Disadvantages:**
- Higher cost (minimum ~$12/month per Micro instance, or Pico for scale-to-zero)
- More complex deployment pipeline
- Cross-tenant analytics requires aggregation layer
- Management overhead grows with tenant count
- PostgreSQL connection overhead (1 connection = 1 process)
- Migrations must be deployed to N projects

**Best for:** Enterprise/B2B SaaS, financial/accounting software (like KEYHOLDER),
high compliance needs, tenants with different configurations.

### Decision Matrix

| Factor | Shared RLS | Separate Schema | Separate Project |
|--------|-----------|----------------|-----------------|
| Data isolation | Low | Medium | High |
| Cost | Lowest | Low | Higher |
| Compliance | Basic | Medium | Full |
| Customization | None | Limited | Full |
| Ops complexity | Simple | Medium | Complex |
| Scaling | Limited | Limited | Per-tenant |
| Performance isolation | None | None | Full |

---

## 9. CLI Automation

### Key Commands for Platform Automation

```bash
# Login (non-interactive with token)
export SUPABASE_ACCESS_TOKEN=your-token

# Create a project
supabase projects create "tenant-123" \
  --org-id your-org-id \
  --db-password "secure-password" \
  --region eu-central-1

# Link to a specific project
supabase link --project-ref project-ref-id

# Apply migrations
supabase db push

# Deploy all edge functions
supabase functions deploy

# Deploy a specific function
supabase functions deploy function-name

# Generate TypeScript types
supabase gen types typescript --project-id project-ref > types.ts

# Set secrets for edge functions
supabase secrets set MY_SECRET=value

# Create a migration
supabase migration new migration-name
```

### CI/CD Automation (GitHub Actions Example)

```yaml
name: Deploy to Tenant
on:
  workflow_dispatch:
    inputs:
      project_ref:
        description: 'Tenant project reference'
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - run: supabase link --project-ref ${{ inputs.project_ref }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - run: supabase functions deploy
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

### Automated Multi-Tenant Deployment Script

```bash
#!/bin/bash
# deploy-to-all-tenants.sh

TENANTS=$(curl -s https://api.supabase.com/v1/projects \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | jq -r '.[].id')

for ref in $TENANTS; do
  echo "Deploying to $ref..."
  supabase link --project-ref "$ref"
  supabase db push
  supabase functions deploy
done
```

### Management API vs CLI for Automation

| Task | CLI | Management API |
|------|-----|---------------|
| Create project | `supabase projects create` | `POST /v1/projects` |
| Run migrations | `supabase db push` | `POST /v1/projects/{ref}/database/migrations` |
| Deploy functions | `supabase functions deploy` | `PUT /v1/projects/{ref}/functions` |
| Set secrets | `supabase secrets set` | Not directly available |
| Generate types | `supabase gen types` | Not available |

**Management API is better for** programmatic automation at scale (no CLI installation needed,
runs from any HTTP client, better for serverless control planes).

**CLI is better for** developer workflows, CI/CD pipelines, and local development.

---

## 10. Architecture Recommendation for KEYHOLDER

### Context

KEYHOLDER is accounting/financial software. Each customer (company/tenant) has highly sensitive
financial data. The product mirrors Fortnox functionality with the long-term goal of replacing it.

### Recommended Architecture: Separate Project Per Tenant

**Why this is the right choice for KEYHOLDER:**

1. **Financial data demands maximum isolation.** An RLS bug in accounting software is catastrophic.
   Separate projects make cross-tenant data leaks physically impossible.

2. **Compliance.** Swedish accounting regulations (BFL, BFN) require strict data handling.
   Per-tenant projects provide clear audit boundaries.

3. **Per-tenant customization.** Different companies may need different kontoplan, integrations,
   or Fortnox sync configurations. Separate projects support this naturally.

4. **Independent scaling.** A large client with 100K verifikationer should not slow down a
   small client with 1K.

5. **Pico instances for cost control.** Apply for Supabase platform partnership to get pico
   instances. Most accounting tenants are inactive 90%+ of the time -- scale-to-zero is ideal.

### Suggested Technical Architecture

```
KEYHOLDER Platform
├── Control Plane (your backend)
│   ├── Tenant registry (which tenant -> which Supabase project)
│   ├── Provisioning service (creates Supabase projects via Management API)
│   ├── Migration runner (deploys schema to all tenant projects)
│   └── Monitoring & billing aggregation
│
├── Supabase Organization (Pro plan, $25/month)
│   ├── Tenant Project A (pico instance)
│   │   ├── Database (kontoplan, verifikationer, etc.)
│   │   ├── Auth (company-specific users)
│   │   ├── Edge Functions (Fortnox sync, SIE export, etc.)
│   │   └── Storage (receipts, documents)
│   ├── Tenant Project B (pico instance)
│   ├── Tenant Project C (pico instance)
│   └── ... N tenant projects
│
├── Shared Frontend (React app)
│   ├── Tenant selector / login
│   ├── Dynamic Supabase client (connects to correct tenant project)
│   └── All views (Kontoplan, Verifikationer, Huvudbok, etc.)
│
└── Platform Kit (optional, for admin dashboard)
    └── Embedded Supabase management for each tenant
```

### Implementation Steps

1. **Apply for Supabase Platform Partnership** at supabase.com (required for pico instances
   and some Management API endpoints like migrations and restore points)

2. **Set up OAuth integration** for the Management API

3. **Build a tenant provisioning service** that:
   - Creates a new Supabase project via `POST /v1/projects`
   - Polls health until `ACTIVE_HEALTHY`
   - Applies base schema migrations via `POST /v1/projects/{ref}/database/migrations`
   - Deploys edge functions via `PUT /v1/projects/{ref}/functions`
   - Seeds initial data (kontoplan) via `POST /v1/projects/{ref}/database/query`
   - Stores the project ref + API keys in your control plane

4. **Build a migration runner** that deploys schema changes to all tenant projects

5. **Configure the frontend** to dynamically select the correct Supabase project
   based on which tenant the user is logged into

### Key Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Pico access not approved | Start with Micro ($12/tenant/month), apply early |
| Management API rate limits (120/min) | Queue provisioning, batch operations |
| Migration drift across tenants | Version-track migrations, validate state |
| Cost overrun with many tenants | Monitor usage, implement auto-pause |
| Complexity of N projects | Invest in solid control plane tooling |

---

## Sources

### Official Documentation
- [Supabase for Platforms](https://supabase.com/docs/guides/integrations/supabase-for-platforms)
- [Management API Reference](https://supabase.com/docs/reference/api/introduction)
- [Management API - Create a Project](https://supabase.com/docs/reference/api/v1-create-a-project)
- [Management API - Create an Organization](https://supabase.com/docs/reference/api/create-an-organization)
- [Build a Supabase OAuth Integration](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration)
- [MCP Server Guide](https://supabase.com/docs/guides/getting-started/mcp)
- [Branching](https://supabase.com/docs/guides/deployment/branching)
- [Branching Usage & Billing](https://supabase.com/docs/guides/platform/manage-your-usage/branching)
- [Edge Functions Deploy](https://supabase.com/docs/guides/functions/deploy)
- [Edge Functions Architecture](https://supabase.com/docs/guides/functions/architecture)
- [Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk)
- [Billing on Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Pricing](https://supabase.com/pricing)
- [CLI Reference](https://supabase.com/docs/reference/cli/introduction)
- [Platform Kit](https://supabase.com/ui/docs/platform/platform-kit)
- [OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server/getting-started)

### Community & Third-Party
- [Supabase MCP Server (GitHub)](https://github.com/supabase-community/supabase-mcp)
- [Supabase CLI (GitHub)](https://github.com/supabase/cli)
- [Multi-tenant Discussion #1615](https://github.com/orgs/supabase/discussions/1615)
- [Multiple Projects Self-Hosted Discussion #38048](https://github.com/orgs/supabase/discussions/38048)
- [Supabase Multi-Tenancy Guide (bootstrapped.app)](https://bootstrapped.app/guide/how-to-set-up-supabase-with-a-multi-tenant-architecture)
- [Supabase RLS Best Practices (makerkit.dev)](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- [Supabase Pricing Breakdown (metacto.com)](https://www.metacto.com/blogs/the-true-cost-of-supabase-a-comprehensive-guide-to-pricing-integration-and-maintenance)
- [Supabase MCP Blog Post](https://supabase.com/blog/mcp-server)
