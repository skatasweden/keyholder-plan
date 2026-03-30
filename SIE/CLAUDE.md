# SIE Directory — Accounting Import Data & Reference

This directory contains everything related to SIE (Standard Import Export) file parsing, import, and validation for the KEYHOLDER project.

## Purpose

Import SIE4 accounting files from any Swedish accounting system (Fortnox, Visma, etc.) into Supabase, and verify correctness. Full SIE 4C spec compliance (2025-08-06). 14 DB tables, 47 unit tests + 6 integration + 16 Fortnox crosscheck.

## Test Companies (Real Fortnox Exports)

All SIE4 files were exported from Fortnox 3.60.16 on 2026-03-30, fiscal year 2025-01-01 to 2025-12-31 (except KOSA Sports which has a broken fiscal year).

| Company | Org # | SIE4 File | Size | Notes |
|---------|-------|-----------|------|-------|
| Byggnadsställningsentreprenad i Stockholm AB | 556440-1452 | `ByggnadsställningsentreprenadiStockholmAB20260330_170428.se` | 1.0 MB | Largest, 4,434 vouchers |
| RevIL AB | 556065-1258 | `RevILAB20260330_165333.se` | 104 KB | 406 vouchers |
| Skata Sweden AB | 559044-4245 | `SkataSwedenAB20260330_170222.se` | 51 KB | 66 vouchers |
| KOSA Sports AB | 556328-2929 | `SIE1-4/KOSASportsAB20260330_175459.se` | 8.6 MB | Fiscal year 2025-04-01 to 2026-03-31 |

There is also an example file `SIE4 Exempelfil.SE` (Visma, company "Ovningsbolaget AB").

## Source of Truth: Fortnox Reports

`FORTNOX-CORRECT-DATA/` contains PDF balance and result reports exported directly from Fortnox for three companies. **These are the ground truth** — if our SIE4 import pipeline works correctly, the balance report (Balansrapport) and result report (Resultatrapport) generated from our database must match these PDFs exactly.

```
FORTNOX-CORRECT-DATA/
  Bygg-Balans-Resultat-Rapport/
    Balansrapport_20250101-20251231_Byggnadsställningsentreprenad i Stockholm AB.pdf
    Resultatrapport_20250101-20251231_Byggnadsställningsentreprenad i Stockholm AB.pdf
  REVIL-Balans-Resultat-Rapport/
    Resultatrapport_20250101-20251231_RevIL AB.pdf
    RevILAB20260330_165333.se.pdf
  Skata-Balans-Resultat-Rapport/
    Balansrapport_20250101-20251231_Skata Sweden AB.pdf
    Resultatrapport_20250101-20251231_Skata Sweden AB.pdf
```

## Knowledge Files

- **SIE-STANDARD-CONTEXT.md** — Complete SIE format reference: file types (SIE 1-4), record types, encoding (CP437), parsing rules, Fortnox vs Visma differences, validation strategy. Read this to understand the SIE standard.
- **SIE4-PIPELINE-CONTEXT.md** — Full technical context for the import pipeline: database schema (12 tables), parser logic, importer, validator (10 checks), test suite (36 tests), known limitations, and next steps. Read this before working on the pipeline code.

## SIE1-4/ — SIE 4 Specification & Reference Files

The text-based SIE format (versions 1 through 4) is the de facto standard for accounting data exchange in Sweden. This is what our pipeline targets.

| File | Description |
|------|-------------|
| `SIE_filformat_ver_4C_2025-08-06.pdf` | Official SIE 4C specification (Swedish, ~40 pages). Defines all record types (#VER, #TRANS, #IB, #UB, etc.), encoding rules, and field formats. This is the authoritative reference. |
| `SIE4-Exempelfil-Sample-file-1.zip` | Official sample SIE4 file from sie.se, useful for testing edge cases not present in our Fortnox exports. |
| `KOSASportsAB20260330_175459.se` | Real Fortnox SIE4 export for KOSA Sports AB (8.6 MB, the largest test file). Stored here rather than root because it was added later. Has a broken fiscal year (2025-04-01 to 2026-03-31). |

## SIE5/ — SIE 5 Specification (XML-based, Future Reference)

SIE 5 is a completely different XML-based format — **not** a continuation of SIE 1-4. It is not widely adopted in Swedish industry yet. We do not currently support it, but the reference material is kept here for future work.

| File | Description |
|------|-------------|
| `SIE-5-rev-161209-konsoliderad (1).pdf` | Official SIE 5 specification PDF (revision 2016-12-09). Defines the XML structure, namespaces, and accounting constructs. |
| `ML-schema.md` | The full XSD (XML Schema Definition) for SIE 5. Defines elements like `<Sie>`, `<Accounts>`, `<Journal>`, `<Dimensions>`, `<CustomerInvoices>`, `<SupplierInvoices>`, `<FixedAssets>`, and digital signature support. |
| `Sample-files.zip` | Official SIE 5 sample XML files for testing. |

SIE 5 adds capabilities not in SIE 4: customer/supplier invoices, fixed assets, digital signatures, and richer dimension support. If we ever need to support SIE 5 import, start with the XSD schema in `ML-schema.md`.

## Validation Workflow

1. Import a company's `.se` file through the pipeline into Supabase
2. Generate balance report and result report from database
3. Compare against the corresponding PDF in `FORTNOX-CORRECT-DATA/`
4. Numbers must match exactly (ore-level precision)

## Key Technical Details

- All Fortnox SIE4 files use CP437 encoding (`#FORMAT PC8`) and EUBAS97 account plan
- The pipeline is a CLI tool: `.se` file -> TypeScript parser -> Supabase PostgreSQL
- Database has 14 tables (10 migrations) with UUID PKs, natural key UNIQUEs, and RLS policies
- Parser handles ALL SIE 4C tags: metadata, accounts, dimensions (incl. hierarchical), balances (incl. per-object), PSALDO (incl. per-object), PBUDGET, vouchers with multi-dim support, CRC-32 verification
- 69 automated tests: 47 unit + 6 integration + 16 Fortnox crosscheck (DB values verified against PDF reports to öre precision)
- Full technical reference: `SIE4-PIPELINE-CONTEXT.md`
