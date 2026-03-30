export interface ParsedSIE4 {
  meta: {
    flagga: number
    format: string
    sietyp: number
    program: string
    generated: string
    fortnox_number: string
    company_name: string
    org_number: string
    address: {
      contact: string
      street: string
      postal: string
      phone: string
    }
    balance_date: string
    account_plan_type: string
    // Phase 5: optional metadata
    sni_code: string | null       // #BKOD
    company_type: string | null   // #FTYP
    comment: string | null        // #PROSA
    tax_year: number | null       // #TAXAR
    currency: string              // #VALUTA (default 'SEK')
  }
  financial_years: Array<{
    year_index: number
    start_date: string
    end_date: string
  }>
  accounts: Array<{
    account_number: number
    name: string
    account_type: 'T' | 'S' | 'K' | 'I' | null
    quantity_unit: string | null  // #ENHET
  }>
  sru_codes: Array<{
    account_number: number
    sru_code: string
  }>
  dimensions: Array<{
    dimension_number: number
    name: string
    parent_dimension: number | null  // #UNDERDIM
  }>
  objects: Array<{
    dimension_number: number
    object_number: string
    name: string
  }>
  opening_balances: Array<{
    year_index: number
    account_number: number
    amount: number
    quantity: number
    dimension_number: number | null  // #OIB
    object_number: string | null     // #OIB
  }>
  closing_balances: Array<{
    year_index: number
    account_number: number
    amount: number
    quantity: number
    dimension_number: number | null  // #OUB
    object_number: string | null     // #OUB
  }>
  period_results: Array<{
    year_index: number
    account_number: number
    amount: number
  }>
  period_balances: Array<{
    year_index: number
    period: number
    account_number: number
    amount: number
    quantity: number
    dimension_number: number | null  // PSALDO per-object
    object_number: string | null     // PSALDO per-object
  }>
  period_budgets: Array<{
    year_index: number
    period: number
    account_number: number
    amount: number
    quantity: number
    dimension_number: number | null
    object_number: string | null
  }>
  vouchers: Array<{
    series: string
    voucher_number: number
    date: string
    description: string
    registration_date: string
    rows: Array<{
      type: 'normal' | 'btrans' | 'rtrans'
      account_number: number
      dim_number: number | null
      object_number: string | null
      dimensions: Array<{ dim_number: number; object_number: string }>  // All dimension pairs
      amount: number
      description: string
      transaction_date: string | null  // #TRANS transdat
      quantity: number
      sign: string | null
    }>
  }>
  parse_errors: Array<{
    line_number: number
    line: string
    error: string
  }>
  crc_verified: boolean | null  // null = no #KSUMMA, true = match, false = mismatch
}

export interface ImportOptions {
  companyId?: string  // If provided, use this company; otherwise upsert by org_number
}

export interface ImportResult {
  success: boolean
  companyId?: string
  stats: {
    company_info: number
    financial_years: number
    dimensions: number
    objects: number
    accounts: number
    sru_codes: number
    opening_balances: number
    closing_balances: number
    period_results: number
    period_balances: number
    period_budgets: number
    vouchers: number
    voucher_rows: number
    voucher_row_objects: number
  }
  parse_errors: Array<{ line_number: number; line: string; error: string }>
  import_errors: Array<{ stage: string; error: string }>
  duration_ms: number
}

export interface ValidationReport {
  passed: boolean
  checks: Array<{
    name: string
    status: 'pass' | 'fail'
    expected: string | number
    actual: string | number
    details?: string
  }>
}
