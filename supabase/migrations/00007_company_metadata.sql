-- Phase 5: Optional SIE4 metadata tags

-- Company-level metadata
ALTER TABLE company_info ADD COLUMN sni_code text;        -- #BKOD (branschkod/SNI)
ALTER TABLE company_info ADD COLUMN company_type text;    -- #FTYP (AB, HB, E, etc.)
ALTER TABLE company_info ADD COLUMN comment text;         -- #PROSA (free text)
ALTER TABLE company_info ADD COLUMN tax_year integer;     -- #TAXAR (taxeringsår)
ALTER TABLE company_info ADD COLUMN currency text DEFAULT 'SEK'; -- #VALUTA (ISO 4217)

-- Per-account quantity unit
ALTER TABLE accounts ADD COLUMN quantity_unit text;       -- #ENHET (e.g. "liter")
