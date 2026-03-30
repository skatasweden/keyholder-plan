# Execute: SIE4 Accounting Frontend

## Your mission

Implement the SIE4 accounting frontend step-by-step following the plan at:
`/Volumes/23 nov /Project/KEYHOLDER/docs/superpowers/plans/2026-03-31-sie4-accounting-frontend.md`

Read the full plan first. It has 11 tasks with exact code, file paths, and verification steps.

## Context you need

**What this project is:** A Swedish accounting data platform. The SIE4 import pipeline (parser, importer, validator) is already complete with 69 passing tests. Data lives in 14 Supabase tables. You're building the frontend.

**Read these files before starting (in order):**
1. The plan: `docs/superpowers/plans/2026-03-31-sie4-accounting-frontend.md`
2. The design spec: `docs/superpowers/specs/2026-03-31-sie4-accounting-frontend-design.md`
3. The design system: `AI-REDOVISNING/FRONTEND_GUIDELINES.md`
4. The existing types: `src/types.ts`
5. The existing importer: `src/sie4-importer.ts`

**Key files in the project:**
- `src/sie4-parser.ts` — SIE4 parser (CP437 → ParsedSIE4 object)
- `src/sie4-importer.ts` — Upserts to Supabase (14 tables, FK-ordered)
- `src/sie4-validator.ts` — 10 validation checks
- `src/fortnox-html-parser.ts` — Parses Fortnox HTML reports (cheerio)
- `supabase/migrations/00001-00011` — Database schema
- `SIE/*.se` — 3 test SIE4 files for verification

**Tech stack:** React 19, Vite 6, Tailwind 3.4, TanStack Query v5, Supabase JS, React Router 7, Hono (import server)

**Architecture:** React SPA reads from Supabase directly. Thin Hono server (2 endpoints) handles SIE4 import and Fortnox PDF parsing.

## How to execute

Work through the plan's 11 tasks **in order**. Each task has checkboxes — complete them sequentially.

**Task 1** (DB migration) MUST be done first — it adds `company_id` to all tables for multi-company support. Without it, nothing else works.

**After each task:** Run `npm test` from the project root to verify the existing 69 tests still pass. Commit.

**After Task 5** (import server): Test end-to-end by importing `SIE/RevILAB20260330_165333.se`.

**After Task 7** (reports): Verify Balansrapport SUMMA TILLGÅNGAR = 3,952,190.47 for RevIL AB.

**Final verification (Task 11):** Import all 3 test files, check crosscheck values, verify multi-company switching.

## Important details

- **Supabase runs locally via Docker.** Start with `npx supabase start`. Apply migrations with `npx supabase db reset`.
- **The `.env` file** in project root has `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. The frontend app needs its own `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **Sign conventions:** Balansrapport values match DB directly. Resultatrapport: the SQL function already negates (revenue positive, costs negative).
- **RPC numeric returns:** Supabase returns `numeric` columns as strings. Always `parseFloat()` in hooks.
- **onConflict strings** in the importer must be updated to include `company_id` for tables that have it in their unique constraint.
- **All text in code/comments must be in English** per project rules. UI labels can be Swedish.

## Don't

- Don't modify files in `AI-REDOVISNING/` — that's a separate app
- Don't change the parser (`sie4-parser.ts`) — it's tested and complete
- Don't add auth — this is a local tool for now
- Don't add features not in the plan
