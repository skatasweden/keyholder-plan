# Flowcount — Full Project Context

> This document describes everything in `/Volumes/23 nov /Project/KEYHOLDER/Flowcount/` so that an AI assistant can understand the project without prior context.

**Last updated:** 2026-03-30

---

## What is Flowcount?

Flowcount is a **Swedish accounting platform** (bokforingssystem) for accounting bureaus and SMBs. Built entirely on .NET, it implements full Swedish double-entry bookkeeping with multi-tenant SaaS isolation.

**Strategic note (2026-03-19):** The primary focus has shifted to **Byrans Second Brain** — an AI-powered monitoring/review system for bureaus that works with ANY accounting system (Fortnox, Visma, etc.). Flowcount itself is now the secondary, longer-term product. See `SECOND-BRAIN-STRATEGY.md` in the repo.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Blazor Server + WebAssembly hybrid (Interactive render modes) |
| Backend | ASP.NET Core, .NET 10, C# |
| Database | SQL Server 2022 (Docker on macOS, Rosetta 2 for ARM) |
| ORM | Entity Framework Core with code-first migrations |
| Auth | Microsoft Entra ID (CIAM) + OpenID Connect |
| UI library | Microsoft FluentUI Blazor components |
| Testing | xUnit (minimal — 9 tests) |
| Localization | sv-SE (default), en-US |
| Local dev | Docker Compose (SQL Server + CloudBeaver DB UI) |

**Ports:** HTTPS on 7271, HTTP on 5058, SQL Server on 1433, CloudBeaver on 8978.

---

## Solution Structure

Solution file: `Flowcount.slnx` — 13 projects:

```
Flowcount/
|-- Flowcount/Flowcount/              # Blazor Server app (entry point, Program.cs)
|-- Flowcount/Flowcount.Client/       # Blazor WebAssembly client components
|-- Flowcount.Data/                   # EF Core DbContext, migrations, repositories, seeding
|-- Flowcount.Models/                 # 27 domain models + TransactionMonitoring/ subfolder
|-- Flowcount.SieLegacy/             # SIE v4 text format parser (40+ record types)
|-- Flowcount.SieXml/                # SIE v5 XML format parser + signature verification
|-- Flowcount.TransactionMonitoringEngine/  # Risk monitoring engine (skeleton)
|-- Flowcount.Utils/                  # DateTime/String utilities
|-- Flowcount.localization/           # Resource files (sv-SE, en-US)
|-- Flowcount.Tests/                  # xUnit tests (9 JournalEntry tests)
|-- BlazorUtils.Data/                 # Reusable multi-tenant DbContext (~750 LOC)
|-- BlazorUtils.Data.Abstractions/    # 18 interfaces (IAuditable, IPostable, IValidatable, etc.)
```

---

## Database Architecture

### Overview

**42 DbSets** across ~35 tables, organized into 7 logical groups. Full documentation in `DATABASE-ARCHITECTURE.md`.

DbContext: `FlowcountDbContext` inherits `MultiTenantDbContext` — automatic TenantId filtering on all queries.

### Group 1: Multi-Tenancy & Users

| Model | Purpose |
|-------|---------|
| **Tenant** | SaaS customer/organization root |
| **User** | Auto-provisioned from Entra ID |
| **Role** | 10 predefined roles (Admin, Accountant, Auditor, Bureau, etc.) |
| **UserRole** | Many-to-many user-role join |

### Group 2: Company & Fiscal Structure

| Model | Purpose |
|-------|---------|
| **Company** | Legal entity — orgnr, VAT number, K-framework (K1Mini, K1, K2, K3, K4) |
| **FiscalYear** | Accounting year (6-18 months per Swedish law), StartDate, EndDate, Current, Closed, ApprovalWorkflowState |
| **Period** | Monthly or adjustment period — PeriodType (Calendar, Adjustment, Provisional), IsLocked, ApprovalWorkflowState |

### Group 3: Core Ledger (Double-Entry Bookkeeping)

| Model | Purpose |
|-------|---------|
| **JournalSeries** | Numbering sequences: A=Accounting, B=Final accounts, C=Simulation |
| **JournalEntry** | **Immutable ledger entry** — once PostedAt is set, cannot be modified. Corrections via reversal entries. Implements IPostable, IAuditedEntity, IValidatable. Methods: `Validate()`, `Post()` |
| **JournalEntryLine** | Debit/credit posting. Amount: positive=debit, negative=credit. Foreign currency support (ForeignCurrencyId, ForeignAmount, ForeignExchangeRate — all-or-nothing). CHECK constraint: Amount != 0 |
| **JournalEntryLineDimensionValue** | Links journal lines to analytical dimensions |
| **Voucher** | Attached files (receipts, scans) — SHA256 checksum for tamper detection |

**Posting flow:** Create draft -> Validate (balanced entry, date in period, period not locked) -> Post (allocate next number atomically) -> Entry is immutable forever.

### Group 4: Accounts & Balances

| Model | Purpose |
|-------|---------|
| **Account** | Per-fiscal-year chart of accounts. Number (4-8 chars), Name, AccountType (Asset, Liability, Equity, Expenses, Revenue, Statistics, Internal). Unique constraint: (FiscalYearId, Number) |
| **AccountBalance** | Aggregated balance per account x period x dimension. OpeningBalance, PeriodDebit/Credit, AccumulatedDebit/Credit, ClosingBalance (calculated). DimensionHash (SHA256) for fast dedup |
| **BalanceVersion** | Snapshot types: Actual, Budget, Forecast |
| **StandardAccount** | Template accounts from BAS chart (~500+ seeded from BAS 2025/2026). AccountingFrameworks bitmask for K1-K4 compatibility |
| **StandardChartOfAccounts** | Templates: BAS26, BAS25 |

### Group 5: Dimensions (Analytical Axes)

| Model | Purpose |
|-------|---------|
| **Dimension** | Analytical axis: Cost Center, Project, Department, etc. |
| **DimensionValue** | Specific value within a dimension (e.g., "CC001") |
| **AccountDimension** | Links accounts to required dimensions |
| **AccountBalanceDimensionValue** | Balance x dimension value join |

### Group 6: Reference Data

| Model | Purpose |
|-------|---------|
| **Country** | 249 countries (UN standard), only Sweden `Supported = true` |
| **Currency** | ~180 currencies (ISO 4217), SEK default |
| **VatCode** | 22 Swedish VAT codes — domestic (5-12%), EU (20-24, 35-39%), import (50-62%), reverse charge |

### Group 7: Automations & Monitoring

| Model | Purpose |
|-------|---------|
| **Automation** | Distribution rules — split a journal line across accounts |
| **AutomationAccount** | Split row with Fraction (e.g., 0.60 for 60%) |
| **TransactionRisk** | Flagged risk on a journal entry (ScoreContribution, Explanation, Dismissed) |
| **TransactionRiskRule** | 13 configurable rule types per tenant |
| **TransactionRiskRuleTemplate** | 16 global predefined rules across 5 categories (AmountAndVolume, SuppliersAndCustomers, VatRelated, BehavioralAndTemporal, Disabled) |

### Data Integrity

| Guarantee | Enforcement |
|-----------|------------|
| Entries always balance | Application: sum(Amount) = 0 |
| No zero-value lines | SQL CHECK: Amount <> 0 |
| Foreign currency consistency | SQL CHECK: all 3 fields or all null |
| No duplicate entry numbers | Unique index (JournalSeriesId, Number) + atomic allocation |
| Immutable posted entries | PostedAt write-once; application rejects changes |
| No posting to locked periods | Application validation |
| Optimistic concurrency | RowVersion (SQL TIMESTAMP) on JournalEntry, JournalEntryLine, AccountBalance |
| Voucher tamper detection | SHA256 checksum |
| Cascade delete protection | DeleteBehavior.Restrict on most FKs |

### Numeric Precision

| Use case | Precision |
|----------|-----------|
| Monetary amounts | decimal(18,2) |
| Quantities | decimal(18,4) |
| Exchange rates | decimal(18,6) |
| Fractions/rates | decimal(5,4) |

### Migrations

17 migrations in `Flowcount.Data/Migrations/` (2026-02-16 through 2026-03-05):

1. Initial — core tables
2. Country1 — 249 countries
3-6. StandardAccount1-4 — BAS chart iterations
7. Automation1 — distribution rules
8. JournalEntryLine1 — refinement
9-11. VatCode1-3 — Swedish VAT codes
12. Dimension1 — analytical dimensions
13-14. TransactionMonitoring1-2 — risk rules
15. SecurityAndIndexes — performance indexes and security

Auto-migration + seed on startup via `ApplyMigrations<FlowcountDbContext>().SeedData().Run()`.

---

## SIE Import

SIE is the Swedish standard format for accounting data exchange between systems.

### SIE v4 Legacy (Text Format) — `Flowcount.SieLegacy/`

- **Parser.cs** — Regex-based line tokenizer
- **SieLegacyReader.cs** — Callback-based reader with CRC32 checksum validation, CP437 encoding support
- **37 model classes** in `Models/` covering all SIE record types:
  - Structure: #PROGRAM, #FORMAT, #GEN, #SIETYP, #PROSA, #FLAGGA
  - Company: #FNAMN, #ORGNR, #ADRESS, #BKOD, #TAXAR, #OMFATTN
  - Accounts: #KONTO, #KTYP, #KPTYP, #ENHET, #SRU
  - Fiscal years: #RAR
  - Balances: #IB, #UB, #OIB, #OUB, #RES, #PSALDO, #PBUDGET
  - Transactions: #VER, #TRANS, #RTRANS, #BTRANS
  - Dimensions: #DIM, #UNDERDIM, #OBJEKT
  - Other: #VALUTA, #KSUMMA, #FTYP, #FNR

### SIE v5 XML Format — `Flowcount.SieXml/`

- **SieXmlReader.cs** — XmlSerializer-based reader
- **sie5.cs** — 1000+ lines of XSD-derived model classes (FileInfo, Accounts, Dimensions, Journal, CustomerInvoices, SupplierInvoices, FixedAssets, Suppliers, Customers, etc.)
- **SignVerifyEnvelope.cs** — XML digital signature verification

### SIE Import Status: ~35% Complete

| Component | Status |
|-----------|--------|
| Parsing both formats | Done |
| Company/FiscalYear/Account mapping to DB | Done (basic) |
| Journal entries (#VER/#TRANS) to DB | Not implemented |
| Balances (IB/UB/RES) to DB | Not implemented |
| Dimensions to DB | Not implemented |
| File upload UI | Not implemented (hardcoded Sample.sie) |
| Error handling | Not implemented |
| Legacy format connected to UI | Not connected |

Import page: `Flowcount/Flowcount/Components/Pages/SieImport.razor` — reads hardcoded `wwwroot/Sample.sie` (SIE v5 XML only).

---

## UI Pages

### Server-Side (`Flowcount/Flowcount/Components/Pages/`)

| Page | Status |
|------|--------|
| SieImport.razor | Partial (hardcoded file, no upload) |
| SignUp.razor | Working (creates tenant) |
| StandardChartOfAccounts.razor | Working (BAS display with filters) |
| Error.razor | Working |

### Client-Side WebAssembly (`Flowcount/Flowcount.Client/Pages/`)

| Page | Status |
|------|--------|
| Home.razor | Dashboard — company list, skeleton placeholders |
| About.razor | Product info |
| CompanyCreate.razor | Form UI, backend incomplete |
| Accounting/Accounting.razor | Skeleton (liquidity/solidity/P&L cards) |
| Accounting/GeneralJournal.razor | Skeleton |
| Accounting/Periods.razor | Skeleton |
| Accounting/Vouchers/Vouchers.razor | Skeleton |
| Bureau/Bureau.razor | Skeleton |
| Bureau/Customers.razor | Skeleton |
| Customers.razor | Skeleton |
| Profile/UserClaims.razor | Working (claims display) |
| Profile/Theme.razor | Working (theme switcher) |
| Help/Features.razor | Skeleton |
| Help/GdprPolicy.razor | Skeleton |
| Help/Pilot.razor | Skeleton |
| Help/SystemsDocumentation.razor | Skeleton |
| NotFound.razor | Working |

---

## Authentication & Authorization

- **Microsoft Entra ID CIAM** tenant at `molndata.ciamlogin.com`
- OpenID Connect flow via `Microsoft.Identity.Web`
- `UserClaimsTransformation` — auto-provisions users in DB from Entra claims, adds userid claim
- `UserContextAccessor` — scoped accessor for current tenant/user
- **FallbackPolicy:** RequireAuthenticatedUser (all pages require login)
- Role-based authorization policies: **not yet implemented** beyond fallback

---

## Transaction Monitoring Engine

Location: `Flowcount.TransactionMonitoringEngine/`

**Status: Skeleton only** — `Evaluate()` method is stubbed.

16 rule templates across 5 categories:

| Category | Example Rules |
|----------|--------------|
| AmountAndVolume | Amount > 50,000 SEK (score 15), 5+ transactions in 10 min (score 25) |
| SuppliersAndCustomers | New vendor > 25,000 SEK (score 20), shared accounts (score 20) |
| VatRelated | Sustained negative VAT (score 25), outgoing VAT anomalies |
| BehavioralAndTemporal | Off-hours posting (score 15), manual entries (score 10) |
| Disabled | Revenue growth > 3 std dev (score 30), layering (score 30) |

---

## Docker Compose Services

```yaml
sqlserver:     # SQL Server 2022 Express — port 1433, SA password: SqlDev2026!xK9
flowcount:     # App container — port 5058, builds from Dockerfile
cloudbeaver:   # DB UI — port 8978
```

Volumes: `sqlserver-data`, `cloudbeaver-data`.

---

## Development Philosophy

From `README.md` and `CLAUDE.md`:

1. **Brutal LEAN** — No "just in case" code, DRY, simplest solution wins
2. **.NET Fullstack** — Shared types, compile-time safety over runtime
3. **Pragmatic DDD** — Explicit models, NO artificial repository layers
4. **Data Model First** — Accounting systems live/die by data integrity
5. **Minimum JavaScript** — If it can be done in C#, do it in C#
6. **Bureau-first** — Multi-company oversight, audit transparency
7. **No interfaces unless they serve a purpose** — only when needed for polymorphism/abstraction

---

## Key Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Project vision and philosophy |
| `CLAUDE.md` | Development guidelines and technical rules for AI assistants |
| `SECOND-BRAIN-STRATEGY.md` | Strategic pivot to Byrans Second Brain product |
| `DATABASE-ARCHITECTURE.md` | Comprehensive database design guide (475 lines) |
| `MAC-SETUP.md` | Local development setup (Docker, .NET, certs, ports) |
| `.claude/TODO.md` | Prioritized task list (P0-P3) |

---

## What is Complete vs Pending

### Complete
- Core data model (27+ domain models)
- EF Core migrations + auto-seeding (countries, currencies, BAS 2025/2026, VAT codes, roles, journal series)
- Multi-tenant architecture with automatic TenantId filtering
- Authentication (Entra ID OIDC)
- SIE parsers (v4 legacy text + v5 XML with signature verification)
- Database constraints for accounting invariants
- Standard Chart of Accounts (BAS) seeding
- Blazor UI framework with FluentUI components
- Localization infrastructure (sv-SE, en-US)
- Docker Compose dev environment

### Partially Complete
- SIE import (parsers done, DB integration only for company/accounts/fiscal year)
- UI pages (framework exists, most pages are skeleton)
- TransactionMonitoringEngine (rules defined, evaluation not implemented)
- Localization content (sv-SE complete, en-US partial)

### Not Started
- Reporting engine (income statement, balance sheet, general ledger reports)
- REST API
- Integration tests
- Service layer abstraction (pages query DbContext directly)
- Posted entry protection at DB level (trigger/constraint)
- Role-based authorization beyond fallback policy
- Background jobs (period closing, reconciliation)
- Payment/bank integration
- Actual accounting workflow pages (voucher entry, journal posting, period closing)

---

## Priority Roadmap (from TODO.md)

**P0 — Security:** Role-based authorization policies (only remaining P0 item)

**P1 — Data Integrity:** Protect posted entries at DB level, add RowVersion to mutable entities, CHECK constraint on Automation.Fraction

**P2 — Architecture:** Service layer, SIE import completion (file upload, transaction safety, error handling), Content Security Policy

**P3 — Features:** REST API, reporting engine, integration tests, full accounting page implementations

---

## Byrans Second Brain (Strategic Priority)

The current primary product focus. An AI-powered monitoring/review system for accounting bureaus:

- Works with ANY accounting system (no forced switch from Fortnox/Visma)
- Reviews client bookkeeping 24/7
- Daily morning reports with risk flags and compliance checks
- Uses existing Flowcount infrastructure: TransactionMonitoringEngine, SIE import, multi-tenant model
- LR (Lantmans Riksforbund, 500 MSEK revenue, 26,000 members) as co-owner
- Target: 3-6 months to market
- Revenue model: subscription per bureau

Flowcount (the full accounting platform) remains as the longer-term 12-18 month product.
