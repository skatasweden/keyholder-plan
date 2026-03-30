# SIE Standard — Complete AI Context

This document contains everything needed to understand, implement, and validate
SIE file import/export for Swedish accounting systems. Written so an AI agent
with zero prior context can work with SIE files correctly.

---

## What is SIE?

SIE (Standard Import Export) is the Swedish industry standard for exchanging
accounting data between software systems. Maintained by **Föreningen SIE-gruppen**
(a non-profit linked to FAR and Svenskt Näringsliv).

- Website: https://sie.se/
- English page: https://sie.se/in-english/
- Technical support: support@sie.se
- General: info@sie.se

**Every major Swedish accounting system supports SIE**: Fortnox, Visma (eEkonomi,
Administration, Spcs), Björn Lundén, SpeedLedger, PE Accounting, Bokio, etc.

---

## SIE File Types (1–4i)

| Type | Name | Content | Use Case |
|------|------|---------|----------|
| **SIE 1** | Annual balances | Account balances per fiscal year (IB/UB only) | Year-end transfers between systems |
| **SIE 2** | Period balances | SIE 1 + monthly balances (PSALDO) | Monthly reporting |
| **SIE 3** | Object balances | SIE 2 + balances per dimension/object | Cost center / project reporting |
| **SIE 4** | Transactions (export) | Everything above + all vouchers with transaction rows | Full data export — the most complete type |
| **SIE 4i** | Transactions (import) | Same structure as SIE 4, but intended for importing into a system | Migrating data into a new system |

**SIE 4 is by far the most common.** When someone says "SIE file" they almost always mean SIE 4.

### SIE 5 (XML-based — separate standard)

SIE 5 exists but is a completely different XML-based format, NOT a continuation of SIE 1–4.
- Spec: https://sie.se/wp-content/uploads/2020/08/SIE-5-rev-161209-konsoliderad.pdf
- XSD schema: https://sie.se/sie5.xsd
- Sample files: https://sie.se/wp-content/uploads/2020/07/Sample-files.zip

**In practice SIE 5 has NOT replaced SIE 4.** Nearly all Swedish software still exports SIE 4.
You can safely ignore SIE 5 unless a specific customer requires it.

---

## Official Specification Documents

### SIE 4C (latest — 2025-08-06, Swedish only, 40 pages)
https://sie.se/wp-content/uploads/2026/02/SIE_filformat_ver_4C_2025-08-06.pdf

### SIE 4B (2008-09-30, English translation available)
- Swedish: https://sie.se/wp-content/uploads/2020/05/SIE_filformat_ver_4B_080930.pdf
- English: https://sie.se/wp-content/uploads/2020/05/SIE_filformat_ver_4B_ENGLISH.pdf

Changes from 4B → 4C are documentation-only (no format changes):
- Updated introduction
- Updated test section referencing sietest.sie.se
- Examples updated to BAS2025
- Clarification on #BTRANS handling
- Clarification on missing optional field values

---

## Validation & Testing

### Official Online Validator
**https://sietest.sie.se/**

Upload any SIE file and the validator checks it against the specification.
Use this to verify that your exported files are spec-compliant.
No documented API — web upload only.

### Official Sample File
https://sie.se/wp-content/uploads/2024/01/SIE4-Exempelfil-Sample-file-1.zip

Download and use as a reference for correct SIE 4 formatting.

---

## File Encoding & Structure

### Encoding
- **Always CP437** (IBM PC 8-bit extended ASCII)
- Declared by the `#FORMAT PC8` record
- Line endings: The spec requires **LF** (`\n`); **CR** (`\r`) before LF is permitted but not required
- In practice all Fortnox files use **CRLF** (`\r\n`), but a robust parser must handle bare LF too
- Use `iconv-lite` with encoding `'cp437'` in Node.js
- Strip `\r` before splitting on `\n` (handles both CRLF and bare LF)

> **Cross-system note:** The spec mandates CP437, but some systems (notably older
> Visma versions) may output Latin-1/ISO-8859-1. A robust parser should try CP437
> first, then fall back to Latin-1 if the `#FORMAT` tag is missing or different.

### Field Parsing Rules
- Fields separated by **spaces or tabs**
- Strings enclosed in `"` (ASCII 34)
- Quotes within strings escaped with backslash: `\"`
- Amounts use **period** `.` as decimal separator
- No thousands separator
- Maximum 2 decimal places
- Negative amounts use minus: `-275.50`
- Dates always `YYYYMMDD`
- Empty lines are allowed and must be ignored
- Unknown labels/tags must be ignored (forward compatibility)

### Required Record Order
Records must appear in this order in the file:

1. **Flag post**: `#FLAGGA`
2. **Identification**: `#PROGRAM`, `#FORMAT`, `#GEN`, `#SIETYP`, `#FNAMN`, `#ORGNR`, etc.
3. **Chart of accounts**: `#KONTO`, `#KTYP`, `#SRU`, `#DIM`, `#OBJEKT`
4. **Balances & transactions**: `#IB`, `#UB`, `#RES`, `#PSALDO`, `#PBUDGET`, `#VER`/`#TRANS`

---

## Complete Record Reference (from SIE 4C spec)

### Identification Records

| Record | Format | Description |
|--------|--------|-------------|
| `#FLAGGA` | `x` | 0 = file has not been read by any program |
| `#FORMAT` | `PC8` | Always PC8 (CP437 encoding) |
| `#SIETYP` | `typnr` | 1, 2, 3, 4, or 4i |
| `#PROGRAM` | `"name" version` | Generating software |
| `#GEN` | `datum sign` | Generation date (YYYYMMDD), optional signature |
| `#FNR` | `foretagsid` | Company ID in the source system |
| `#FNAMN` | `"company_name"` | Company name |
| `#ORGNR` | `orgnr forvnr verknr` | Org number, optional admin/workplace numbers |
| `#ADRESS` | `kontakt utdelningsadr postadr tel` | 4 quoted fields |
| `#BKOD` | `SNI-kod` | Industry code (SNI) |
| `#FTYP` | `foretagstyp` | Company type |
| `#PROSA` | `"text"` | Free text / comments |
| `#TAXAR` | `ar` | Tax year |
| `#OMFATTN` | `datum` | Balance coverage date (YYYYMMDD) |
| `#KPTYP` | `kontoplanstyp` | Account plan type (e.g. EUBAS97, BAS2025) |
| `#VALUTA` | `valutakod` | Currency code |

### Financial Year Records

| Record | Format | Description |
|--------|--------|-------------|
| `#RAR` | `arsnr start slut` | Fiscal year: 0=current, -1=previous, etc. Dates YYYYMMDD |

### Account Records

| Record | Format | Description |
|--------|--------|-------------|
| `#KONTO` | `kontonr "kontonamn"` | Account definition |
| `#KTYP` | `kontonr kontotyp` | Account type (T=asset, S=liability, K=cost, I=income) |
| `#SRU` | `kontonr SRU-kod` | Tax form code mapping |
| `#ENHET` | `kontonr "enhet"` | Unit of measurement |

### Dimension & Object Records

| Record | Format | Description |
|--------|--------|-------------|
| `#DIM` | `dimensionsnr "namn"` | Dimension definition |
| `#UNDERDIM` | `dimensionsnr "namn" superdimension` | Sub-dimension |
| `#OBJEKT` | `dimensionsnr "objektnr" "objektnamn"` | Object within a dimension |

### Balance Records

| Record | Format | Description |
|--------|--------|-------------|
| `#IB` | `arsnr konto saldo kvantitet` | Opening balance |
| `#UB` | `arsnr konto saldo kvantitet` | Closing balance |
| `#OIB` | `arsnr konto {dim obj} saldo kvantitet` | Opening balance per object |
| `#OUB` | `arsnr konto {dim obj} saldo kvantitet` | Closing balance per object |
| `#RES` | `arsnr konto saldo kvantitet` | Period result (no quarter field!) |
| `#PSALDO` | `arsnr period konto {dim obj} saldo kvantitet` | Period balance (YYYYMM) |
| `#PBUDGET` | `arsnr period konto {dim obj} saldo kvantitet` | Period budget |

### Transaction Records

| Record | Format | Description |
|--------|--------|-------------|
| `#VER` | `serie vernr verdatum "vertext" regdatum sign` | Voucher header |
| `#TRANS` | `kontonr {objektlista} belopp transdat transtext kvantitet sign` | Transaction row |
| `#BTRANS` | (same as #TRANS) | Removed transaction row (B = borttagen) |
| `#RTRANS` | (same as #TRANS) | Supplementary/corrective row (R = rättad); must be followed by identical #TRANS |

### Checksum

| Record | Format | Description |
|--------|--------|-------------|
| `#KSUMMA` | CRC-32 value | Checksum using polynomial `0xEDB88320` (spec includes C code) |

---

## Voucher Block Structure

```
#VER A 1 20250107 "We Transfer" 20250804
{
#TRANS 2840 {6 "8"} -275 "" "" 0
#TRANS 5420 {} 275 "" "" 0
}
```

- `#VER` starts a block — read lines until `}` on its own line
- Inside the block: `#TRANS`, `#BTRANS`, `#RTRANS` rows
- All `#TRANS` amounts within a `#VER` **must sum to zero** (debit = credit)
  - Only `#TRANS` rows participate in the balance sum; `#BTRANS`/`#RTRANS` are excluded
  - Verified against 4,906 real Fortnox vouchers: 100% balanced
- Series: a letter A–S (dynamic, never hardcode)
  - Real Fortnox files use up to 14 different series (A, B, C, D, E, F, G, H, I, J, K, L, M, S)
  - Series letter is **unquoted** in Fortnox files: `#VER A 1 ...` (not `#VER "A" 1 ...`)
  - A robust parser should handle both quoted and unquoted series
- `#BTRANS` = a removed transaction row (B = borttagen). Present in the file to record what was removed.
- `#RTRANS` = a supplementary/corrective transaction row (R = rättad). Per the spec, every
  `#RTRANS` row **must be immediately followed by an identical `#TRANS` row** for backward
  compatibility. If your parser handles `#RTRANS`, skip the duplicate `#TRANS` that follows.
  If your parser ignores `#RTRANS`, the `#TRANS` rows alone produce a correct result.

### Object list parsing (`{...}`)

```
{}                    → no dimension (dim_number=null, object_number=null)
{6 "P1040"}          → dimension 6, object "P1040"
{1 "100" 6 "P1040"}  → multiple dimensions (pairs of dim+object)
```

The `{}` content is always pairs: `dimension_number "object_number"`.
Empty `{}` means no dimensions attached.

### #TRANS field positions

```
#TRANS kontonr {objektlista} belopp transdat transtext kvantitet sign
       1       2              3      4        5         6         7
```

- Field 4 (transdat): transaction date, often empty `""`
- Field 5 (transtext): description, can be empty `""` or text
- Field 6 (kvantitet): quantity, usually 0
- Field 7 (sign): signature, optional

For `#BTRANS` and `#RTRANS`: same fields, but some systems append an extra name field.

---

## Reserved Dimension Numbers

| Dim | Meaning | Notes |
|-----|---------|-------|
| 1 | Kostnadsställe / Resultatenhet (Cost center / Result unit) | Used by all systems |
| 2 | Kostnadsbärare (Cost carrier) | Sub-dimension of 1 |
| 3–5 | Reserved for future use | |
| 6 | Projekt (Project) | Used by all systems |
| 7 | Anställd (Employee) | Visma uses this |
| 8 | Kund (Customer) | Visma uses this |
| 9 | Leverantör (Supplier) | Visma uses this |
| 10 | Faktura (Invoice) | Visma uses this |
| 11–19 | Reserved | |
| 20+ | Freely available | Custom dimensions |

**Fortnox** declares dimensions 1 and 6, but in practice often only dim 6 (project)
has objects. Dim 1 (cost center) is declared but may have zero `#OBJEKT` entries.
**Visma** may export dimensions 1, 2, 6, 7, 8, 9, 10 (plausible per spec, not verified with Visma files).
A robust parser must handle any dimension number.

---

## Differences Between Accounting Systems

The SIE format is standardized, but real-world files differ:

| Aspect | Fortnox | Visma | Others |
|--------|---------|-------|--------|
| Encoding | CP437 (per spec) | Usually CP437, some Latin-1 (unverified) | Varies |
| Dimensions | Declares 1 + 6; often only 6 has objects | 1, 2, 6, 7, 8, 9, 10 (plausible) | Varies |
| BTRANS/RTRANS | Used (~5% of rows) | Rare (unverified) | Most only use #TRANS |
| #KSUMMA (checksum) | Not present (confirmed) | Not always present | Optional per spec |
| Object numbers | Always text strings | Always text strings | Always text |
| Extra/custom tags | Possible | Possible | Ignore unknown tags |

### Robust Parser Checklist
- [ ] Handle CP437 encoding (primary) — detected by `#FORMAT PC8`
- [ ] Fall back to Latin-1 if high bytes are in 0xC0-0xF6 range (Latin-1 Swedish chars)
- [ ] Handle both CRLF and bare LF line endings
- [ ] Handle any dimension number (not just 1 and 6)
- [ ] Handle multiple dimension pairs in `{...}`
- [ ] Handle missing optional fields gracefully
- [ ] Ignore unknown tags (log warning, continue)
- [ ] Handle both `#TRANS` only and `#TRANS` + `#BTRANS` + `#RTRANS`
- [ ] Handle RTRANS+TRANS backward compatibility pairs (skip duplicate TRANS after RTRANS)
- [ ] Handle missing `#KSUMMA` (optional per spec; Fortnox never includes it)
- [ ] Handle variable field counts in transaction rows (BTRANS/RTRANS may have extra name field)
- [ ] Handle both quoted and unquoted series letters in `#VER`
- [ ] Parse amounts with period decimal separator
- [ ] Handle negative amounts (credit balances)
- [ ] Validate: all VER blocks balance (SUM of #TRANS amounts = 0)

---

## Open Source Reference Implementations

Use these to cross-reference parsing logic:

| Language | Repository | Notes | Status |
|----------|-----------|-------|--------|
| Ruby | [barsoom/sie](https://github.com/barsoom/sie) | Most mature; parser + generator for SIE 1–4 | Active (Dec 2024) |
| .NET | [idstam/jsisie](https://github.com/idstam/jsisie) | Reads SIE 1–4 including 4i; also writes/compares | Active (Dec 2024) |
| Python | [magapp/parse-sie](https://github.com/magapp/parse-sie) | CLI tool, supports dimensions/objects, CSV export | Active (Mar 2025) |
| JS/Python | [magnusfroste/sie-parser](https://github.com/magnusfroste/sie-parser) | Flask web app, CP437, LLM-focused JSON output | New/tiny (May 2025) |
| PHP | [neam/php-sie](https://github.com/neam/php-sie) | Port of the Ruby barsoom/sie | Abandoned (2016) |
| Node.js | [holar2b/node-sie-reader](https://github.com/holar2b/node-sie-reader) | Converts SIE to JS objects, CP437→UTF-8 | Abandoned (2012) |
| Python | [jswetzen/sie-parse](https://github.com/jswetzen/sie-parse) | Parser for .si and .sie files | Inactive (2018) |
| Rust | [akeamc/sie4](https://github.com/akeamc/sie4) | SIE4 parser crate on crates.io | Stale (Nov 2023) |
| PHP | [johanwilfer/siephp](https://github.com/johanwilfer/siephp) | SIE4 export library, PHP 8.3+ | Active (Nov 2025) |
| Java | [Alipsa/SIEParser](https://github.com/Alipsa/SIEParser) | Java port of idstam/jsisie | Active (Mar 2026) |
| Java | [blinfo/Sie4j](https://github.com/blinfo/Sie4j) | Read/write SIE standard data | Active (Feb 2026) |
| Python | [JonasNorling/sie4parser](https://github.com/JonasNorling/sie4parser) | SIE4 parser | Active (Jan 2025) |
| TypeScript | [controvia/sie](https://github.com/controvia/sie) | SIE accounting file import library | Recent (Apr 2025) |

---

## Validation Strategy

After importing a SIE file into a database, verify correctness with these checks:

### Count Checks
1. Number of accounts in DB = number of `#KONTO` in file
2. Number of vouchers per series in DB = count of `#VER` per series in file
3. Number of transaction rows in DB = count of `#TRANS` + `#BTRANS` + `#RTRANS` in file
4. Number of objects in DB = number of `#OBJEKT` in file

### Amount Checks
5. Opening balance (`#IB`) per account matches to the cent (öre)
6. Closing balance (`#UB`) per account matches to the cent
7. Period result (`#RES`) per account matches
8. Period balance (`#PSALDO`) per account+period matches (if present)

### Integrity Checks
9. Every voucher is balanced: SUM(amount) of `#TRANS` rows only = 0 (exclude BTRANS/RTRANS from sum)
10. `#BTRANS` and `#RTRANS` rows have correct type flags in DB
11. Every `#RTRANS` is followed by a matching `#TRANS` (backward compatibility pair)

### Using the Official Validator
Upload your **exported** SIE files to https://sietest.sie.se/ to verify
they conform to the specification. This only validates format, not business logic.

---

## Quick Reference: Parsing a SIE 4 File in Node.js/TypeScript

```
1. Read file as Buffer
2. Decode with iconv-lite using 'cp437'
3. Strip \r, split on \n
4. For each line:
   - Skip empty lines
   - Extract tag (first word starting with #)
   - Parse fields based on tag
   - #VER starts a block → read lines until } on its own line
   - Inside block: parse #TRANS / #BTRANS / #RTRANS
   - Unknown tag → log warning, skip
5. Validate: all VER blocks balanced (sum = 0)
6. Return structured data
```

### Key npm packages
- `iconv-lite` — CP437 decoding
- `@supabase/supabase-js` — if importing to Supabase
- `@anthropic-ai/sdk` — if building AI validation agent

---

## File Extension

SIE files use `.se` or `.sie` extension. Both are identical in format.
Fortnox exports as `.se`. Some systems use `.sie` or `.SI`.

---

---

## Verification Status

This document was verified on 2026-03-30 by 10 independent AI agents checking every claim
against the official SIE 4B/4C specification PDFs, 3 real Fortnox SIE 4 files (4,906 vouchers,
~39,500 lines), and the actual open source repositories. All URLs were confirmed accessible.
All record formats were confirmed against both the spec and real files.

**Unverified claims** (marked in text): Visma-specific behavior (encoding, dimensions, BTRANS usage)
could not be verified without actual Visma export files. These claims are plausible and consistent
with the SIE specification but should be treated as estimates until confirmed with real Visma data.

*Last updated: 2026-03-30*
*Sources: SIE 4C specification (2025-08-06), SIE 4B English specification, sie.se,
3 real Fortnox SIE 4 exports, open source implementations*
