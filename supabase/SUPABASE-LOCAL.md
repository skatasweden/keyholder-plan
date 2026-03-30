# Supabase Local Development — KEYHOLDER

## Status

Running locally via Docker. All ports use the **544xx** range to avoid conflicts with the AI-PRO project (543xx).

## URLs & Endpoints

| Service        | URL                                             |
|----------------|-------------------------------------------------|
| Studio (UI)    | http://127.0.0.1:54423                          |
| Mailpit        | http://127.0.0.1:54424                          |
| MCP            | http://127.0.0.1:54421/mcp                      |
| Project URL    | http://127.0.0.1:54421                          |
| REST API       | http://127.0.0.1:54421/rest/v1                  |
| GraphQL        | http://127.0.0.1:54421/graphql/v1               |
| Edge Functions | http://127.0.0.1:54421/functions/v1             |
| Storage S3     | http://127.0.0.1:54421/storage/v1/s3            |

## Database

```
postgresql://postgres:postgres@127.0.0.1:54422/postgres
```

## Authentication Keys

| Key         | Value                                              |
|-------------|----------------------------------------------------|
| Publishable | `sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH`  |
| Secret      | `$SUPABASE_SERVICE_KEY`       |

## Storage (S3)

| Key        | Value                                                            |
|------------|------------------------------------------------------------------|
| Access Key | `625729a08b95bf1b7ff351a663f3a23c`                               |
| Secret Key | `850181e4652dd023b7a98c58ae0d2d34bd487ee0cc3254aed6eda37307425907` |
| Region     | `local`                                                          |

## Port Map

| Service          | Port  |
|------------------|-------|
| API              | 54421 |
| Database         | 54422 |
| Studio           | 54423 |
| Mailpit/Inbucket | 54424 |
| Analytics        | 54427 |
| DB Shadow        | 54420 |
| DB Pooler        | 54429 |
| Edge Inspector   | 8183  |

## CLI Reference

All commands run from the project root (`/Volumes/23 nov /Project/KEYHOLDER`).

### Lifecycle

```bash
supabase start          # Start all containers
supabase stop           # Stop all containers
supabase status         # Show running services, URLs, and keys
```

### Database & Migrations

```bash
supabase migration new <name>       # Create empty migration file
supabase migration list              # List local and remote migrations
supabase migration up                # Apply pending migrations
supabase migration down              # Revert last n migrations
supabase db reset                    # Reset DB and re-run all migrations + seed
supabase db diff                     # Diff local DB for schema changes (auto-generate migration)
supabase db lint                     # Check for typing errors
supabase db push                     # Push migrations to remote
supabase db pull                     # Pull schema from remote
```

### Edge Functions

```bash
supabase functions new <name>        # Create a new edge function
supabase functions serve             # Serve all functions locally (hot reload)
supabase functions deploy <name>     # Deploy to remote
supabase functions list              # List all functions
supabase functions delete <name>     # Delete from remote
```

### Code Generation

```bash
supabase gen types typescript --local    # Generate TypeScript types from local DB
```

### Testing

```bash
supabase test db                     # Run pgTAP tests
```

### Seeding

```bash
supabase seed buckets                # Seed storage buckets from config
```

Seed SQL goes in `supabase/seed.sql` — runs automatically on `db reset`.

### Remote Project

```bash
supabase login                       # Auth with access token
supabase link --project-ref <ref>    # Link to remote project
supabase db push                     # Push local migrations to remote
supabase db pull                     # Pull remote schema
```

### Useful Flags

```bash
--debug          # Verbose logging
--output json    # Machine-readable output (works with status, etc.)
--yes            # Auto-confirm prompts
```

## Workflow

1. Make schema changes via Studio UI or direct SQL
2. `supabase db diff -f <migration_name>` to capture changes as a migration
3. `supabase db reset` to verify migrations replay cleanly
4. `supabase gen types typescript --local` to update TypeScript types
5. Commit the migration files in `supabase/migrations/`

## Config

All configuration lives in `supabase/config.toml`. Edit ports, auth settings, storage limits, etc. there. Changes require `supabase stop && supabase start` to take effect.

## CLI Version

Installed: **v2.75.0** (latest available: v2.84.2)

```bash
brew upgrade supabase    # Upgrade CLI
```
