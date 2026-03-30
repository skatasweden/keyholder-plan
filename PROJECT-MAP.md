# Project Map — KEYHOLDER

A simple guide to every folder and file. Find what you need fast.

---

## What is this project?

A tool that reads Swedish accounting files (SIE4 format), puts the data into a database (Supabase), and generates financial reports (Balansrapport + Resultatrapport) that match Fortnox exactly.

---

## Top Level

```
KEYHOLDER/
│
├── package.json          # Project dependencies (npm install)
├── package-lock.json     # Locked dependency versions
├── tsconfig.json         # TypeScript settings
├── vitest.config.ts      # Test runner settings
├── .env                  # Database password (secret, not in git)
├── .env.example          # Template for .env
├── .gitignore            # Files git should ignore
│
├── src/                  # ALL the code lives here
├── supabase/             # Database setup (tables, migrations)
├── SIE/                  # Accounting files + reference docs
├── reports/              # Report documentation
├── REVIL AB/             # Extra SIE exports for RevIL (older versions)
│
├── AI-CONTEXT.md         # General AI context file
├── FLOWCOUNT-CONTEXT.md  # Context for Flowcount subproject
├── Affärsplan.md         # Business plan document
├── NEXT-TASK-REPORTS.md  # Task spec that was used to build the report functions
└── PROJECT-MAP.md        # This file
```

---

## src/ — The Code

```
src/
├── cli.ts                # Entry point. Run: npx tsx src/cli.ts <file.se>
├── sie4-parser.ts        # Reads a .se file and turns it into structured data
├── sie4-importer.ts      # Takes parsed data and puts it into the database
├── sie4-validator.ts     # Checks that the database matches the parsed file
├── fortnox-html-parser.ts # Parses Fortnox HTML report exports
├── types.ts              # TypeScript type definitions shared by all files
│
└── __tests__/            # All tests (run with: npm test)
    ├── parser.test.ts              # 47 tests — does the parser read files correctly?
    ├── integration.test.ts         # 6 tests — does the full pipeline work end-to-end?
    ├── fortnox-crosscheck.test.ts  # 16 tests — do DB values match Fortnox PDFs?
    ├── fortnox-html-crosscheck.test.ts # 20 tests — do DB values match Fortnox HTML exports?
    ├── reports.test.ts             # 15 tests — do the SQL report functions produce correct totals?
    └── test-fixture.ts             # Fake accounting data used by parser + integration tests
```

**Total: 104 tests, all passing.**

---

## supabase/ — The Database

```
supabase/
├── config.toml           # Local Supabase settings
├── SUPABASE-LOCAL.md     # How to run Supabase locally
│
└── migrations/           # Database changes, applied in order
    ├── 00001_sie_schema.sql              # Creates all the tables
    ├── 00002_sie_hardening.sql           # Adds safety checks
    ├── 00003_rename_columns.sql          # Fixes column names
    ├── 00004_voucher_row_transdat.sql    # Adds transaction dates
    ├── 00005_voucher_row_objects.sql     # Multi-dimension support
    ├── 00006_period_balance_dimensions.sql # Period balance dimensions
    ├── 00007_company_metadata.sql        # Extra company info fields
    ├── 00008_dimension_hierarchy.sql     # Parent-child dimensions
    ├── 00009_object_level_balances.sql   # Per-object opening/closing balances
    ├── 00010_period_budgets.sql          # Budget data table
    └── 00011_report_views.sql            # Balansrapport + Resultatrapport functions
```

**14 database tables + 2 SQL report functions.**
Next migration number: **00012**.

---

## SIE/ — Accounting Files + Reference

```
SIE/
├── RevILAB20260330_165333.se           # RevIL AB accounting file (406 vouchers)
├── SkataSwedenAB20260330_170222.se     # Skata Sweden AB (66 vouchers)
├── ByggnadsställningsentreprenadiStockholmAB20260330_170428.se  # Bygg AB (4434 vouchers)
├── SIE4 Exempelfil.SE                  # Example file from Visma
│
├── SIE4-PIPELINE-CONTEXT.md    # MAIN TECH DOC — read this first if you're an AI or dev
├── SIE-STANDARD-CONTEXT.md     # SIE file format reference
├── CLAUDE.md                   # Short overview for AI assistants
│
├── FORTNOX-CORRECT-DATA/       # PDF reports from Fortnox (the "correct answers")
│   ├── Bygg-Balans-Resultat-Rapport/    # Bygg AB balance + result PDFs
│   ├── REVIL-Balans-Resultat-Rapport/   # RevIL AB balance + result PDFs
│   └── Skata-Balans-Resultat-Rapport/   # Skata AB balance + result PDFs
│
├── BYGG-VALIDATION-MATERIALL/  # HTML exports + validation scripts for Bygg AB
│   ├── Balans.html             # Fortnox Balansrapport HTML export
│   ├── Resultat.html           # Fortnox Resultatrapport HTML export
│   ├── Report-huvudbok.html    # Fortnox Huvudbok HTML export
│   ├── Report-verfikationslista-alla.html  # Fortnox voucher list HTML
│   ├── VALIDATION-REPORT.md    # Validation results
│   └── code/                   # Parser + test code for HTML crosscheck
│
├── SIE1-4/                     # SIE format specification
│   ├── SIE_filformat_ver_4C_2025-08-06.pdf  # Official SIE4 spec (Swedish)
│   ├── KOSASportsAB20260330_175459.se       # Extra test file (KOSA Sports)
│   └── SIE4-Exempelfil-Sample-file-1.zip    # Official sample file
│
├── SIE5/                       # SIE5 spec (XML format, not used yet)
│   ├── SIE-5-rev-161209-konsoliderad (1).pdf
│   ├── ML-schema.md
│   └── Sample-files.zip
│
└── TODO/
    └── FORTNOX-MIGRATION-TODO.md  # Future migration task notes
```

---

## reports/ — Report Documentation

```
reports/
├── REPORTS-CONTEXT.md              # Full reference for the SQL report functions
├── balans/
│   └── BALANSRAPPORT.md            # Balance sheet: how it works, account groups, values
└── resultat/
    └── RESULTATRAPPORT.md          # Income statement: how it works, sign rules, values
```

---

## REVIL AB/ — Extra Exports

```
REVIL AB/
├── 120260330_151932.se                          # Older SIE export
├── RevILAB20260330_145638.se                    # Older SIE export
├── RevILAB20260330_151210.se                    # Older SIE export
└── RevIL AB - Arkivplats - 2026-03-30 14.56.zip  # Fortnox archive export
```

These are earlier/alternative exports. The main test file is in `SIE/`.

---

## Quick Reference

| I want to...                        | Go to                                    |
|-------------------------------------|------------------------------------------|
| Run the import tool                 | `npx tsx src/cli.ts SIE/some-file.se`    |
| Run all tests                       | `npm test`                               |
| Reset the database                  | `npx supabase db reset`                  |
| Understand the whole pipeline       | `SIE/SIE4-PIPELINE-CONTEXT.md`           |
| Understand the report functions     | `reports/REPORTS-CONTEXT.md`             |
| See the correct Fortnox numbers     | `SIE/FORTNOX-CORRECT-DATA/` (PDFs)      |
| See which accounts go where         | `reports/balans/` or `reports/resultat/` |
| Add a new database table            | Create `supabase/migrations/00012_*.sql` |
| Check test values                   | `src/__tests__/fortnox-crosscheck.test.ts` |

---

## The 3 Test Companies

| Company | File | Size | What it tests |
|---------|------|------|---------------|
| RevIL AB | `SIE/RevILAB...165333.se` | Small (406 vouchers) | Standard company |
| Skata Sweden AB | `SIE/SkataSwedenAB...170222.se` | Small (66 vouchers) | Minimal data |
| Byggnadsställningsentreprenad | `SIE/Byggnadsställnings...170428.se` | Large (4434 vouchers) | Stress test, rounding |
