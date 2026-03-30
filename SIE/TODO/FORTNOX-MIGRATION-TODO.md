# Fortnox Migration — Todo List

## Phase 1: Accounting (DONE)
- [x] SIE4 parser (all tags, CP437, CRC-32)
- [x] Supabase importer (14 tables, idempotent)
- [x] Validator (10 checks)
- [x] Fortnox crosscheck (3 companies, ore precision)

## Phase 2: Customer & Supplier Registers
- [ ] Export customer register from Fortnox (API or CSV)
- [ ] Create `customers` table + migration
- [ ] Import customers into Supabase
- [ ] Export supplier register from Fortnox (API or CSV)
- [ ] Create `suppliers` table + migration
- [ ] Import suppliers into Supabase

## Phase 3: Invoices
- [ ] Export customer invoices from Fortnox API
- [ ] Create `customer_invoices` + `customer_invoice_rows` tables
- [ ] Import customer invoices (with line items, due dates, OCR, payment status)
- [ ] Export supplier invoices from Fortnox API
- [ ] Create `supplier_invoices` + `supplier_invoice_rows` tables
- [ ] Import supplier invoices

## Phase 4: Articles & Products
- [ ] Export article register from Fortnox
- [ ] Create `articles` table + migration
- [ ] Import articles (price, unit, VAT, article number)

## Phase 5: Attachments
- [ ] Download voucher attachments via Fortnox API
- [ ] Create storage bucket in Supabase for attachments
- [ ] Link attachments to vouchers in DB

## Phase 6: Fixed Assets
- [ ] Export fixed asset register (anlaggningsregister) from Fortnox
- [ ] Create `fixed_assets` table + migration
- [ ] Import assets with depreciation plans

## Phase 7: Quotes & Orders (if used)
- [ ] Export quotes from Fortnox API
- [ ] Export orders from Fortnox API
- [ ] Create tables + migrations
- [ ] Import quotes and orders
